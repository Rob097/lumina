/**
 * SPIKE round 2 (throwaway) — the OBJECT placement problem for the winning model (Seedream v4.5/edit).
 *
 * Round 1 showed Seedream reconstructs a 3D product beautifully but a HARD box composite clips the
 * silhouette (the lamp shade pokes out of the drawn box and gets cut). Two region-bounding fixes:
 *
 *   A. crop-to-region → edit the crop with the product → composite back. FORCES the object into the drawn
 *      area (the model only ever sees the region) and keeps the rest of the room byte-identical.
 *   B. region-gated diff composite: keep the model's CHANGED pixels (the whole object silhouette) only
 *      where they fall inside the dilated drawn region; restore the original room everywhere else. Reuses
 *      the round-1 seedream raw — no new API call.
 *
 * Run (from repo root):
 *   export FAL_KEY=$(grep '^FAL_KEY=' .env.dev | cut -d= -f2-)
 *   corepack pnpm -F @lumina/api exec tsx scripts/spike-fal/round2.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { rasterizeMask, boxToPixels, type NormalizedBox } from '../../src/lib/images/mask.js';
import { compositeOverOriginal } from '../../src/lib/images/composite.js';
import { computeChangeMask } from '../../src/lib/images/diff-mask.js';

const FAL = process.env.FAL_KEY;
const goldenDir = fileURLToPath(new URL('../golden/', import.meta.url));
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const ROOM_LONG_EDGE = 1536;

const BOX: NormalizedBox = { x: 0.64, y: 0.22, w: 0.31, h: 0.7 }; // same drawn region as round 1

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1);
const dataUri = (b: Uint8Array, m: string): string => `data:${m};base64,${Buffer.from(b).toString('base64')}`;

function expand(b: NormalizedBox, f: number): NormalizedBox {
  const x = clamp01(b.x - b.w * f);
  const y = clamp01(b.y - b.h * f);
  return { x, y, w: Math.min(1 - x, b.w * (1 + 2 * f)), h: Math.min(1 - y, b.h * (1 + 2 * f)) };
}

function seedreamSize(w: number, h: number): { width: number; height: number } {
  const a = w / h;
  let H = Math.round(Math.sqrt(4_000_000 / a));
  let W = Math.round(H * a);
  if (W > 4096) { W = 4096; H = Math.round(W / a); }
  if (H > 4096) { H = 4096; W = Math.round(H * a); }
  return { width: W, height: H };
}

async function falRun(endpoint: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const auth = { Authorization: `Key ${FAL}` };
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!submit.ok) throw new Error(`submit ${submit.status}: ${(await submit.text()).slice(0, 400)}`);
  const q = (await submit.json()) as { status_url: string; response_url: string };
  const start = Date.now();
  for (;;) {
    await sleep(2000);
    const st = await fetch(q.status_url, { headers: auth });
    const s = (await st.json()) as { status: string };
    if (s.status === 'COMPLETED') break;
    if (s.status !== 'IN_QUEUE' && s.status !== 'IN_PROGRESS') throw new Error(`job ${s.status}`);
    if (Date.now() - start > 180_000) throw new Error('timeout');
  }
  const res = await fetch(q.response_url, { headers: auth });
  return (await res.json()) as Record<string, unknown>;
}

async function outBytes(result: Record<string, unknown>): Promise<Uint8Array> {
  const url = (result.images as Array<{ url: string }>)[0]!.url;
  if (url.startsWith('data:')) return new Uint8Array(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

/** Per-pixel MIN of two single-channel masks at w×h → keep-region ∩ changed. */
async function minMask(a: Uint8Array, b: Uint8Array, w: number, h: number): Promise<Uint8Array> {
  const toRaw = (x: Uint8Array): Promise<Buffer> =>
    sharp(Buffer.from(x)).resize(w, h, { fit: 'fill' }).toColourspace('b-w').raw().toBuffer();
  const [ra, rb] = await Promise.all([toRaw(a), toRaw(b)]);
  const out = Buffer.allocUnsafe(w * h);
  for (let i = 0; i < w * h; i += 1) out[i] = Math.min(ra[i]!, rb[i]!);
  return new Uint8Array(await sharp(out, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer());
}

interface Tile { buf: Buffer; w: number; h: number }
async function tile(bytes: Uint8Array, label: string, tileW: number): Promise<Tile> {
  const buf = await sharp(Buffer.from(bytes)).resize({ width: tileW }).jpeg({ quality: 90 }).toBuffer();
  const ih = (await sharp(buf).metadata()).height ?? tileW;
  const svg = `<svg width="${tileW}" height="30"><rect width="${tileW}" height="30" fill="black"/><text x="8" y="21" fill="white" font-family="sans-serif" font-size="16">${label}</text></svg>`;
  const out = await sharp({ create: { width: tileW, height: ih + 30, channels: 3, background: '#000' } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }, { input: buf, top: 30, left: 0 }]).jpeg({ quality: 90 }).toBuffer();
  return { buf: out, w: tileW, h: ih + 30 };
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const baked = await sharp(readFileSync(goldenDir + 'room-bedroom.jpg')).rotate()
    .resize({ width: ROOM_LONG_EDGE, height: ROOM_LONG_EDGE, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(baked).metadata();
  const w = meta.width!, h = meta.height!;
  const roomBytes = new Uint8Array(baked);
  const productBytes = new Uint8Array(
    await sharp(readFileSync(goldenDir + 'product-lamp.jpg')).rotate().resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 92 }).toBuffer(),
  );

  const tiles: Tile[] = [];
  const regionExpanded = expand(BOX, 0.08);
  const regionMaskExpanded = await rasterizeMask({ width: w, height: h, box: regionExpanded, feather: Math.round(Math.max(w, h) * 0.02) });

  // ---- B: region-gated diff composite on the existing round-1 seedream raw (free) ----
  const rawPath = `${outDir}bedroom-lamp__seedream-raw.jpg`;
  if (existsSync(rawPath)) {
    const raw = new Uint8Array(readFileSync(rawPath));
    const change = await computeChangeMask(roomBytes, raw, { threshold: 28, feather: 10 });
    const gated = await minMask(change.mask, regionMaskExpanded, w, h);
    const compB = await compositeOverOriginal({ original: roomBytes, edited: raw, mask: gated, contentType: 'image/jpeg' });
    writeFileSync(`${outDir}objB-gated-mask.png`, Buffer.from(gated));
    writeFileSync(`${outDir}objB-gated-final.jpg`, Buffer.from(compB.bytes));
    tiles.push(await tile(compB.bytes, 'B: region-gated diff composite (no new call)', 460));
    console.log(`B: region-gated diff composite → objB-gated-final.jpg (changedFraction ${change.changedFraction.toFixed(3)})`);
  } else {
    console.log('B skipped: round-1 seedream raw not found (run run.ts --models first)');
  }

  // ---- A: crop-to-region → seedream → composite back ----
  if (FAL) {
    const cropBox = expand(BOX, 0.18);
    const px = boxToPixels(cropBox, w, h);
    const crop = new Uint8Array(await sharp(roomBytes).extract({ left: px.left, top: px.top, width: px.w, height: px.h }).jpeg({ quality: 92 }).toBuffer());
    const sd = seedreamSize(px.w, px.h);
    const t0 = Date.now();
    const result = await falRun('fal-ai/bytedance/seedream/v4.5/edit', {
      prompt: 'The first image is part of a room (a wall meeting the carpeted floor). The second image is a floor lamp. Place the floor lamp standing on the floor in this space, the WHOLE lamp visible and in correct proportion. Reproduce the lamp faithfully — exact shape, colours, materials. Keep the wall and floor unchanged. Photorealistic.',
      image_urls: [dataUri(crop, 'image/jpeg'), dataUri(productBytes, 'image/jpeg')],
      image_size: sd, num_images: 1, max_images: 1, output_format: 'jpeg',
    });
    const editedCrop = new Uint8Array(await sharp(Buffer.from(await outBytes(result))).resize(px.w, px.h, { fit: 'fill' }).jpeg({ quality: 92 }).toBuffer());
    // keep only what the model changed inside the crop, so untouched wall/floor of the crop = original
    const cropChange = await computeChangeMask(crop, editedCrop, { threshold: 28, feather: 8 });
    const cropFinal = await compositeOverOriginal({ original: crop, edited: editedCrop, mask: cropChange.mask, contentType: 'image/jpeg' });
    const final = await sharp(roomBytes).composite([{ input: Buffer.from(cropFinal.bytes), left: px.left, top: px.top }]).jpeg({ quality: 92 }).toBuffer();
    writeFileSync(`${outDir}objA-crop-editedcrop.jpg`, Buffer.from(editedCrop));
    writeFileSync(`${outDir}objA-crop-final.jpg`, final);
    tiles.push(await tile(new Uint8Array(final), 'A: crop-to-region + seedream + back', 460));
    console.log(`A: crop-to-region → objA-crop-final.jpg (${Date.now() - t0}ms)`);
  } else {
    console.log('A skipped: FAL_KEY missing');
  }

  // montage: region overlay + product + B + A
  const ovPath = `${outDir}bedroom-lamp__01-region.jpg`;
  const prodPath = `${outDir}bedroom-lamp__02-product.jpg`;
  const head: Tile[] = [];
  if (existsSync(ovPath)) head.push(await tile(new Uint8Array(readFileSync(ovPath)), 'drawn region', 460));
  if (existsSync(prodPath)) head.push(await tile(new Uint8Array(readFileSync(prodPath)), 'product', 460));
  const all = [...head, ...tiles];
  const tw = all[0]!.w, rowH = Math.max(...all.map((t) => t.h)), cols = 2;
  const comps = all.map((t, i) => ({ input: t.buf, left: (i % cols) * tw, top: Math.floor(i / cols) * rowH }));
  const grid = await sharp({ create: { width: tw * cols, height: rowH * Math.ceil(all.length / cols), channels: 3, background: '#1a1a1a' } }).composite(comps).jpeg({ quality: 88 }).toBuffer();
  writeFileSync(`${outDir}round2-objects-montage.jpg`, grid);
  console.log('montage → out/round2-objects-montage.jpg');
}

main().catch((e) => { console.error(e); process.exit(1); });
