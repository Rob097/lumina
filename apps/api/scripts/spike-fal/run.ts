/**
 * SPIKE (throwaway, NOT production) — fal.ai draw-to-place model bake-off.
 *
 * Goal: decide which fal model best satisfies the draw-on-room requirements, on the owner's real golden
 * images, judged on numbers + eyeballs (not vibes). For each case we simulate a "drawn region" (a mask),
 * then run candidate models and apply OUR mask composite so the room outside the region is byte-preserved.
 *
 *   - inpaint  = fal-ai/flux-kontext-lora/inpaint  → room + mask + product reference, ONE region-locked call.
 *   - seedream = fal-ai/bytedance/seedream/v4.5/edit → image_urls=[room,product], whole-frame regen + composite.
 *   - gemini   = fal-ai/gemini-3-pro-image-preview/edit (Nano Banana Pro, current baseline) + composite.
 *
 * Strokes are NEVER burned into the model input — the drawn area is a MASK. That is the whole point: there
 * is nothing to "remove" because the model never sees a colored mark.
 *
 * Run (from repo root):
 *   export FAL_KEY=$(grep '^FAL_KEY=' .env.dev | cut -d= -f2-)
 *   corepack pnpm -F @lumina/api exec tsx scripts/spike-fal/run.ts            # overlays only (verify regions)
 *   corepack pnpm -F @lumina/api exec tsx scripts/spike-fal/run.ts --models   # full bake-off (spends fal credit)
 * Optional: --models=inpaint,seedream   --case=bedroom-lamp
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { rasterizeMask, type NormalizedBox } from '../../src/lib/images/mask.js';
import { compositeOverOriginal } from '../../src/lib/images/composite.js';
import { computeChangeMask } from '../../src/lib/images/diff-mask.js';

const FAL = process.env.FAL_KEY;
const goldenDir = fileURLToPath(new URL('../golden/', import.meta.url));
const outDir = fileURLToPath(new URL('./out/', import.meta.url));

const ROOM_LONG_EDGE = 1536;
const PRODUCT_LONG_EDGE = 1024;

type ModelKey = 'inpaint' | 'seedream' | 'gemini';

interface SpikeCase {
  id: string;
  room: string;
  product: string;
  /** Where the shopper "drew" — normalized box in the baked (EXIF-upright) room. */
  box: NormalizedBox;
  productNoun: string;
  placement: string;
}

const CASES: SpikeCase[] = [
  {
    id: 'bedroom-lamp',
    room: 'room-bedroom.jpg',
    product: 'product-lamp.jpg',
    // Deliberately RIGHT of centre — reproduces the exact bug ("drew on the right, model centred it").
    box: { x: 0.64, y: 0.22, w: 0.31, h: 0.7 },
    productNoun: 'the floor lamp',
    placement: 'standing on the floor against the right-hand wall, where the marked region is',
  },
  {
    id: 'slats-wall',
    room: 'coverage-slats-wall.room.jpg',
    product: 'coverage-slats-wall.product.jpg',
    box: { x: 0.26, y: 0.13, w: 0.44, h: 0.5 },
    productNoun: 'the acoustic wood-slat wall panels',
    placement: 'mounted flat to cover the wall within the marked region, slats running vertically',
  },
];

// ---------- tiny fal client (queue API, no SDK) ----------
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function dataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function falRun(endpoint: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const auth = { Authorization: `Key ${FAL}` };
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!submit.ok) throw new Error(`submit ${submit.status}: ${(await submit.text()).slice(0, 400)}`);
  const q = (await submit.json()) as { status_url: string; response_url: string };
  const start = Date.now();
  for (;;) {
    await sleep(2000);
    const st = await fetch(`${q.status_url}`, { headers: auth });
    if (!st.ok) throw new Error(`status ${st.status}: ${(await st.text()).slice(0, 200)}`);
    const s = (await st.json()) as { status: string };
    if (s.status === 'COMPLETED') break;
    if (s.status !== 'IN_QUEUE' && s.status !== 'IN_PROGRESS') {
      throw new Error(`job ${s.status}: ${JSON.stringify(s).slice(0, 300)}`);
    }
    if (Date.now() - start > 240_000) throw new Error('timeout 240s');
  }
  const res = await fetch(`${q.response_url}`, { headers: auth });
  if (!res.ok) throw new Error(`result ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as Record<string, unknown>;
}

async function outImageBytes(result: Record<string, unknown>): Promise<Uint8Array> {
  const images = result.images as Array<{ url: string }> | undefined;
  const url = images?.[0]?.url;
  if (!url) throw new Error(`no image in result: ${JSON.stringify(result).slice(0, 300)}`);
  if (url.startsWith('data:')) {
    return new Uint8Array(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  }
  const r = await fetch(url);
  return new Uint8Array(await r.arrayBuffer());
}

// ---------- image helpers ----------
function nearestAspect(w: number, h: number): string {
  const ratios: Array<[string, number]> = [
    ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16],
    ['3:2', 3 / 2], ['2:3', 2 / 3],
  ];
  const t = w / h;
  return ratios.reduce((b, r) => (Math.abs(r[1] - t) < Math.abs(b[1] - t) ? r : b), ratios[0]!)[0];
}

/** Seedream needs ~>=3.69MP; return a room-aspect size at ~4MP, capped at 4096. */
function seedreamSize(w: number, h: number): { width: number; height: number } {
  const a = w / h;
  let H = Math.round(Math.sqrt(4_000_000 / a));
  let W = Math.round(H * a);
  if (W > 4096) { W = 4096; H = Math.round(W / a); }
  if (H > 4096) { H = 4096; W = Math.round(H * a); }
  return { width: W, height: H };
}

async function overlay(roomBytes: Uint8Array, box: NormalizedBox, w: number, h: number): Promise<Uint8Array> {
  const left = Math.round(box.x * w), top = Math.round(box.y * h);
  const bw = Math.round(box.w * w), bh = Math.round(box.h * h);
  const sw = Math.max(3, Math.round(w * 0.004));
  const svg = `<svg width="${w}" height="${h}"><rect x="${left}" y="${top}" width="${bw}" height="${bh}" fill="rgba(255,40,40,0.16)" stroke="rgb(255,30,30)" stroke-width="${sw}"/></svg>`;
  return new Uint8Array(
    await sharp(Buffer.from(roomBytes)).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 88 }).toBuffer(),
  );
}

interface Tile { buf: Buffer; w: number; h: number }
async function tile(bytes: Uint8Array, label: string, tileW: number): Promise<Tile> {
  const buf = await sharp(Buffer.from(bytes)).resize({ width: tileW }).jpeg({ quality: 88 }).toBuffer();
  const ih = (await sharp(buf).metadata()).height ?? tileW;
  const barH = 30;
  const safe = label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg width="${tileW}" height="${barH}"><rect width="${tileW}" height="${barH}" fill="black"/><text x="8" y="21" fill="white" font-family="sans-serif" font-size="16">${safe}</text></svg>`;
  const out = await sharp({ create: { width: tileW, height: ih + barH, channels: 3, background: '#000' } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }, { input: buf, top: barH, left: 0 }])
    .jpeg({ quality: 88 }).toBuffer();
  return { buf: out, w: tileW, h: ih + barH };
}

async function grid(tiles: Tile[], cols: number, outPath: string): Promise<void> {
  const tw = tiles[0]!.w;
  const rowH = Math.max(...tiles.map((t) => t.h));
  const rows = Math.ceil(tiles.length / cols);
  const comps = tiles.map((t, i) => ({ input: t.buf, left: (i % cols) * tw, top: Math.floor(i / cols) * rowH }));
  const out = await sharp({ create: { width: tw * cols, height: rowH * rows, channels: 3, background: '#1a1a1a' } })
    .composite(comps).jpeg({ quality: 86 }).toBuffer();
  writeFileSync(outPath, out);
}

// ---------- model input builders ----------
function buildInput(
  model: ModelKey,
  c: SpikeCase,
  uris: { room: string; product: string; mask: string },
  size: { aspect: string; sd: { width: number; height: number } },
): { endpoint: string; input: Record<string, unknown> } {
  if (model === 'inpaint') {
    return {
      endpoint: 'fal-ai/flux-kontext-lora/inpaint',
      input: {
        image_url: uris.room,
        mask_url: uris.mask,
        reference_image_url: uris.product,
        prompt: `Inpaint only the masked region. Place ${c.productNoun} there, ${c.placement}. Reproduce its exact shape, colours, materials and proportions from the reference image. Match the room's lighting, perspective and scale. Photorealistic, seamless.`,
        strength: 0.95,
        num_inference_steps: 30,
        acceleration: 'regular',
        output_format: 'jpeg',
      },
    };
  }
  const wholeFramePrompt = `The first image is a room. The second image is ${c.productNoun}. Add ${c.productNoun} into the room, ${c.placement}. Reproduce the product faithfully — exact shape, colours, materials and proportions from the second image. Keep the rest of the room unchanged. Match lighting, perspective and scale. Photorealistic.`;
  if (model === 'seedream') {
    return {
      endpoint: 'fal-ai/bytedance/seedream/v4.5/edit',
      input: {
        prompt: wholeFramePrompt,
        image_urls: [uris.room, uris.product],
        image_size: size.sd,
        num_images: 1,
        max_images: 1,
        output_format: 'jpeg',
      },
    };
  }
  return {
    endpoint: 'fal-ai/gemini-3-pro-image-preview/edit',
    input: {
      prompt: wholeFramePrompt,
      image_urls: [uris.room, uris.product],
      resolution: '2K',
      aspect_ratio: size.aspect,
      num_images: 1,
      output_format: 'jpeg',
    },
  };
}

const COST_CENTS: Record<ModelKey, number> = { inpaint: 5, seedream: 4, gemini: 15 };

// ---------- main ----------
async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const argv = process.argv.slice(2);
  const runModels = argv.some((a) => a === '--models' || a.startsWith('--models='));
  const modelArg = argv.find((a) => a.startsWith('--models='))?.split('=')[1];
  const models: ModelKey[] = (modelArg ? (modelArg.split(',') as ModelKey[]) : ['inpaint', 'seedream', 'gemini']);
  const caseArg = argv.find((a) => a.startsWith('--case='))?.split('=')[1];
  const cases = caseArg ? CASES.filter((c) => c.id === caseArg) : CASES;

  if (runModels && !FAL) {
    console.error('FAL_KEY missing. Run:  export FAL_KEY=$(grep ^FAL_KEY= .env.dev | cut -d= -f2-)');
    process.exit(1);
  }

  const report: Array<Record<string, unknown>> = [];

  for (const c of cases) {
    console.log(`\n=== ${c.id} ===`);
    // Bake EXIF orientation (ingest parity) + downscale the room.
    const rawRoom = new Uint8Array(readFileSync(goldenDir + c.room));
    const baked = await sharp(rawRoom).rotate().resize({ width: ROOM_LONG_EDGE, height: ROOM_LONG_EDGE, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
    const meta = await sharp(baked).metadata();
    const w = meta.width!, h = meta.height!;
    const roomBytes = new Uint8Array(baked);

    const rawProduct = new Uint8Array(readFileSync(goldenDir + c.product));
    const productBytes = new Uint8Array(
      await sharp(rawProduct).rotate().resize({ width: PRODUCT_LONG_EDGE, height: PRODUCT_LONG_EDGE, fit: 'inside' }).jpeg({ quality: 92 }).toBuffer(),
    );

    const feather = Math.max(10, Math.round(Math.max(w, h) * 0.012));
    const maskBytes = await rasterizeMask({ width: w, height: h, box: c.box, feather });

    const ov = await overlay(roomBytes, c.box, w, h);
    writeFileSync(`${outDir}${c.id}__00-room.jpg`, baked);
    writeFileSync(`${outDir}${c.id}__01-region.jpg`, Buffer.from(ov));
    writeFileSync(`${outDir}${c.id}__02-product.jpg`, Buffer.from(productBytes));
    writeFileSync(`${outDir}${c.id}__mask.png`, Buffer.from(maskBytes));
    console.log(`room ${w}x${h} (aspect ${nearestAspect(w, h)}); region overlay + mask written`);

    const tiles: Tile[] = [
      await tile(ov, 'ROOM + drawn region', 512),
      await tile(productBytes, 'PRODUCT (merchant photo)', 512),
    ];

    if (!runModels) continue;

    const uris = { room: dataUri(roomBytes, 'image/jpeg'), product: dataUri(productBytes, 'image/jpeg'), mask: dataUri(maskBytes, 'image/png') };
    const size = { aspect: nearestAspect(w, h), sd: seedreamSize(w, h) };

    for (const model of models) {
      const { endpoint, input } = buildInput(model, c, uris, size);
      const t0 = Date.now();
      try {
        const result = await falRun(endpoint, input);
        const latencyMs = Date.now() - t0;
        const rawOut = await outImageBytes(result);
        // Leakage: how much of what the model changed falls OUTSIDE the drawn region (lower = more obedient).
        const change = await computeChangeMask(roomBytes, rawOut, { threshold: 28, feather: 0 });
        const final = await compositeOverOriginal({ original: roomBytes, edited: rawOut, mask: maskBytes, contentType: 'image/jpeg' });
        writeFileSync(`${outDir}${c.id}__${model}-raw.jpg`, Buffer.from(rawOut));
        writeFileSync(`${outDir}${c.id}__${model}-final.jpg`, Buffer.from(final.bytes));
        tiles.push(await tile(rawOut, `${model} — raw model output`, 512));
        tiles.push(await tile(final.bytes, `${model} — final (our composite)`, 512));
        const rec = { case: c.id, model, endpoint, latencyMs, costCents: COST_CENTS[model], changedFraction: Number(change.changedFraction.toFixed(4)) };
        report.push(rec);
        console.log(`  ✓ ${model}  ${latencyMs}ms  ~${COST_CENTS[model]}¢  changedFraction=${rec.changedFraction}`);
      } catch (err) {
        report.push({ case: c.id, model, endpoint, error: err instanceof Error ? err.message : String(err) });
        console.log(`  ✗ ${model}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      await grid(tiles, 2, `${outDir}${c.id}__montage.jpg`);
      console.log(`  montage → out/${c.id}__montage.jpg`);
    } catch (err) {
      console.log(`  montage failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  writeFileSync(`${outDir}report.json`, JSON.stringify(report, null, 2));
  console.log(`\nreport → out/report.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
