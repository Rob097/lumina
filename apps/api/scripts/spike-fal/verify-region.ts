/**
 * VERIFY (throwaway) — run the lamp + panels golden cases through the SHIPPED draw-to-place path:
 * createOrchestratorFromEnv (region routes to fal Seedream) → the real buildRegionEditTask prompt →
 * driftOutsideRegion / containInRegion safety-net. This is "this version", not the ad-hoc spike.
 *
 *   corepack pnpm -F @lumina/api exec tsx scripts/spike-fal/verify-region.ts
 * (reads AI_GATEWAY_API_KEY + FAL_KEY from repo-root .env.dev)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createOrchestratorFromEnv, type ImageRef } from '@lumina/ai';
import { regionFromStrokes, placementPhrase, type Annotation, type ProductCategory } from '@lumina/shared';
import { driftOutsideRegion } from '../../src/lib/images/region.js';

const goldenDir = fileURLToPath(new URL('../golden/', import.meta.url));
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const envPath = fileURLToPath(new URL('../../../../.env.dev', import.meta.url));

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return env;
}

interface Case {
  id: string;
  room: string;
  product: string;
  category: ProductCategory;
  strokes: { x: number; y: number }[];
}

const CASES: Case[] = [
  {
    id: 'bedroom-lamp',
    room: 'room-bedroom.jpg',
    product: 'product-lamp.jpg',
    category: 'lighting',
    strokes: [{ x: 0.66, y: 0.25 }, { x: 0.92, y: 0.88 }], // right side of the room
  },
  {
    id: 'slats-wall',
    room: 'coverage-slats-wall.room.jpg',
    product: 'coverage-slats-wall.product.jpg',
    category: 'decor',
    strokes: [{ x: 0.28, y: 0.15 }, { x: 0.68, y: 0.62 }], // the pale wall
  },
];

function nearestAspect(w: number, h: number): string {
  const ratios: Array<[string, number]> = [
    ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16], ['3:2', 3 / 2], ['2:3', 2 / 3],
  ];
  const t = w / h;
  return ratios.reduce((b, r) => (Math.abs(r[1] - t) < Math.abs(b[1] - t) ? r : b), ratios[0]!)[0];
}

async function overlay(room: Uint8Array, box: { x: number; y: number; w: number; h: number }, w: number, h: number): Promise<Uint8Array> {
  const svg = `<svg width="${w}" height="${h}"><rect x="${Math.round(box.x * w)}" y="${Math.round(box.y * h)}" width="${Math.round(box.w * w)}" height="${Math.round(box.h * h)}" fill="rgba(255,40,40,0.16)" stroke="rgb(255,30,30)" stroke-width="${Math.max(3, Math.round(w * 0.004))}"/></svg>`;
  return new Uint8Array(await sharp(Buffer.from(room)).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 88 }).toBuffer());
}

interface Tile { buf: Buffer; w: number; h: number }
async function tile(bytes: Uint8Array, label: string, tileW: number): Promise<Tile> {
  const buf = await sharp(Buffer.from(bytes)).resize({ width: tileW }).jpeg({ quality: 88 }).toBuffer();
  const ih = (await sharp(buf).metadata()).height ?? tileW;
  const svg = `<svg width="${tileW}" height="30"><rect width="${tileW}" height="30" fill="black"/><text x="8" y="21" fill="white" font-family="sans-serif" font-size="16">${label}</text></svg>`;
  const out = await sharp({ create: { width: tileW, height: ih + 30, channels: 3, background: '#000' } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }, { input: buf, top: 30, left: 0 }]).jpeg({ quality: 88 }).toBuffer();
  return { buf: out, w: tileW, h: ih + 30 };
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const env = loadEnv();
  if (!env.FAL_KEY || !env.AI_GATEWAY_API_KEY) {
    console.error('need AI_GATEWAY_API_KEY + FAL_KEY in .env.dev');
    process.exit(1);
  }
  const orchestrator = createOrchestratorFromEnv(env);

  for (const c of CASES) {
    const baked = await sharp(readFileSync(goldenDir + c.room)).rotate().resize({ width: 1536, height: 1536, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
    const meta = await sharp(baked).metadata();
    const w = meta.width!, h = meta.height!;
    const roomBytes = new Uint8Array(baked);
    const product = new Uint8Array(await sharp(readFileSync(goldenDir + c.product)).rotate().resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 92 }).toBuffer());

    const annotation: Annotation = { color: '#5A55D6', alpha: 0.6, width: 0.012, strokes: [{ points: c.strokes }] };
    const box = regionFromStrokes(annotation);
    const placement = placementPhrase(box);
    const aspectRatio = nearestAspect(w, h);

    const t0 = Date.now();
    const composed = await orchestrator.compose({
      room: { bytes: roomBytes, contentType: 'image/jpeg' } as ImageRef,
      product: { bytes: product, contentType: 'image/jpeg' } as ImageRef,
      products: [{ bytes: product, contentType: 'image/jpeg' }],
      category: c.category,
      region: { box, placement },
      aspectRatio,
      policy: 'quality',
    });
    const latency = Date.now() - t0;

    // Ship the raw full-frame (owner decision) — drift is logged for observability only.
    const drift = await driftOutsideRegion(roomBytes, composed.bytes, box);
    const final = { bytes: composed.bytes, contentType: composed.contentType };

    writeFileSync(`${outDir}${c.id}__v3-final.jpg`, Buffer.from(final.bytes));

    const tiles = [
      await tile(await overlay(roomBytes, box, w, h), 'ROOM + drawn region', 512),
      await tile(product, 'PRODUCT', 512),
      await tile(composed.bytes, `${composed.model} raw (${latency}ms)`, 512),
      await tile(final.bytes, `FINAL (raw shipped) — drift ${drift.toFixed(3)}`, 512),
    ];
    const tw = tiles[0]!.w, rowH = Math.max(...tiles.map((t) => t.h));
    const grid = await sharp({ create: { width: tw * 2, height: rowH * 2, channels: 3, background: '#1a1a1a' } })
      .composite(tiles.map((t, i) => ({ input: t.buf, left: (i % 2) * tw, top: Math.floor(i / 2) * rowH }))).jpeg({ quality: 86 }).toBuffer();
    writeFileSync(`${outDir}${c.id}__v3-montage.jpg`, grid);

    console.log(`${c.id}: model=${composed.model} ${latency}ms placement="${placement}" drift=${drift.toFixed(3)} (raw shipped)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
