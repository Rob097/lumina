/**
 * SPIKE (throwaway) — the recommended pipeline (crop-to-region → seedream → feather-blend back) on the HIGH
 * DRIFT case (slats-wall). Proves containment: the panel fills the drawn region coherently while the rest of
 * the real room (bed, wardrobe) stays byte-identical — unlike the raw, which re-rendered them (17.6% drift).
 *
 *   export FAL_KEY=$(grep '^FAL_KEY=' .env.dev | cut -d= -f2-)
 *   corepack pnpm -F @lumina/api exec tsx scripts/spike-fal/crop-slats.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { rasterizeMask, boxToPixels, type NormalizedBox } from '../../src/lib/images/mask.js';
import { compositeOverOriginal } from '../../src/lib/images/composite.js';

const FAL = process.env.FAL_KEY;
const goldenDir = fileURLToPath(new URL('../golden/', import.meta.url));
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const BOX: NormalizedBox = { x: 0.26, y: 0.13, w: 0.44, h: 0.5 };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1);
const dataUri = (b: Uint8Array, m: string): string => `data:${m};base64,${Buffer.from(b).toString('base64')}`;
function expand(b: NormalizedBox, f: number): NormalizedBox {
  const x = clamp01(b.x - b.w * f), y = clamp01(b.y - b.h * f);
  return { x, y, w: Math.min(1 - x, b.w * (1 + 2 * f)), h: Math.min(1 - y, b.h * (1 + 2 * f)) };
}
function sdSize(w: number, h: number): { width: number; height: number } {
  const a = w / h; let H = Math.round(Math.sqrt(4_000_000 / a)); let W = Math.round(H * a);
  if (W > 4096) { W = 4096; H = Math.round(W / a); } if (H > 4096) { H = 4096; W = Math.round(H * a); }
  return { width: W, height: H };
}
async function falRun(endpoint: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const auth = { Authorization: `Key ${FAL}` };
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!submit.ok) throw new Error(`submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
  const q = (await submit.json()) as { status_url: string; response_url: string };
  const start = Date.now();
  for (;;) {
    await sleep(2000);
    const s = (await (await fetch(q.status_url, { headers: auth })).json()) as { status: string };
    if (s.status === 'COMPLETED') break;
    if (s.status !== 'IN_QUEUE' && s.status !== 'IN_PROGRESS') throw new Error(`job ${s.status}`);
    if (Date.now() - start > 180_000) throw new Error('timeout');
  }
  return (await (await fetch(q.response_url, { headers: auth })).json()) as Record<string, unknown>;
}
async function outBytes(r: Record<string, unknown>): Promise<Uint8Array> {
  const url = (r.images as Array<{ url: string }>)[0]!.url;
  if (url.startsWith('data:')) return new Uint8Array(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

async function main(): Promise<void> {
  if (!FAL) { console.error('FAL_KEY missing'); process.exit(1); }
  const baked = await sharp(readFileSync(goldenDir + 'coverage-slats-wall.room.jpg')).rotate().resize({ width: 1536, height: 1536, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(baked).metadata(); const w = meta.width!, h = meta.height!;
  const roomBytes = new Uint8Array(baked);
  const product = new Uint8Array(await sharp(readFileSync(goldenDir + 'coverage-slats-wall.product.jpg')).rotate().resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 92 }).toBuffer());

  const cropBox = expand(BOX, 0.15);
  const px = boxToPixels(cropBox, w, h);
  const crop = new Uint8Array(await sharp(roomBytes).extract({ left: px.left, top: px.top, width: px.w, height: px.h }).jpeg({ quality: 92 }).toBuffer());
  const t0 = Date.now();
  const result = await falRun('fal-ai/bytedance/seedream/v4.5/edit', {
    prompt: 'The first image is a section of a bedroom wall. The second image is an acoustic wood-slat wall panel. Cover this wall section with the wood-slat panels, slats running vertically, fitted to the wall. Reproduce the panel faithfully — exact wood tone, slat spacing, materials. Keep the wall edges and surroundings unchanged. Photorealistic, matching the room lighting.',
    image_urls: [dataUri(crop, 'image/jpeg'), dataUri(product, 'image/jpeg')],
    image_size: sdSize(px.w, px.h), num_images: 1, max_images: 1, output_format: 'jpeg',
  });
  const editedCrop = await sharp(Buffer.from(await outBytes(result))).resize(px.w, px.h, { fit: 'fill' }).jpeg({ quality: 92 }).toBuffer();

  // edited layer = original room with the edited crop pasted at the crop offset
  const editedLayer = new Uint8Array(await sharp(roomBytes).composite([{ input: editedCrop, left: px.left, top: px.top }]).jpeg({ quality: 92 }).toBuffer());
  // feather-blend ONLY the drawn region back; everything else stays byte-identical original
  const mask = await rasterizeMask({ width: w, height: h, box: BOX, feather: Math.round(Math.max(w, h) * 0.02) });
  const final = await compositeOverOriginal({ original: roomBytes, edited: editedLayer, mask, contentType: 'image/jpeg' });
  writeFileSync(`${outDir}crop-slats-final.jpg`, Buffer.from(final.bytes));
  console.log(`crop-slats → crop-slats-final.jpg (${Date.now() - t0}ms)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
