/**
 * SPIKE drift check (throwaway) — how much does the seedream RAW silently change the room OUTSIDE the drawn
 * region? That is the whole question behind "raw looks better than the composite": raw regenerates the whole
 * frame, so it may quietly alter the shopper's real room (walls, door, pillow, lighting). This renders a
 * heatmap (red = changed pixels OUTSIDE the drawn region; the region is outlined) and prints the fraction.
 *
 * Run:
 *   corepack pnpm -F @lumina/api exec tsx scripts/spike-fal/drift.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { boxToPixels, type NormalizedBox } from '../../src/lib/images/mask.js';

const goldenDir = fileURLToPath(new URL('../golden/', import.meta.url));
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const ROOM_LONG_EDGE = 1536;
const THRESHOLD = 22;

const CASES: Array<{ id: string; room: string; box: NormalizedBox }> = [
  { id: 'bedroom-lamp', room: 'room-bedroom.jpg', box: { x: 0.64, y: 0.22, w: 0.31, h: 0.7 } },
  { id: 'slats-wall', room: 'coverage-slats-wall.room.jpg', box: { x: 0.26, y: 0.13, w: 0.44, h: 0.5 } },
];

async function bakeRoom(name: string): Promise<{ rgb: Buffer; w: number; h: number }> {
  const baked = await sharp(readFileSync(goldenDir + name)).rotate()
    .resize({ width: ROOM_LONG_EDGE, height: ROOM_LONG_EDGE, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(baked).metadata();
  const w = meta.width!, h = meta.height!;
  const rgb = await sharp(baked).removeAlpha().raw().toBuffer();
  return { rgb, w, h };
}

async function main(): Promise<void> {
  for (const c of CASES) {
    const rawPath = `${outDir}${c.id}__seedream-raw.jpg`;
    if (!existsSync(rawPath)) { console.log(`${c.id}: no seedream raw`); continue; }
    const { rgb: o, w, h } = await bakeRoom(c.room);
    const e = await sharp(readFileSync(rawPath)).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const px = boxToPixels(c.box, w, h);

    const inside = (x: number, y: number): boolean => x >= px.left && x < px.left + px.w && y >= px.top && y < px.top + px.h;
    const onBorder = (x: number, y: number): boolean => {
      const t = 3;
      const nearV = (x >= px.left - t && x <= px.left + t) || (x >= px.left + px.w - t && x <= px.left + px.w + t);
      const nearH = (y >= px.top - t && y <= px.top + t) || (y >= px.top + px.h - t && y <= px.top + px.h + t);
      return (nearV && y >= px.top - t && y <= px.top + px.h + t) || (nearH && x >= px.left - t && x <= px.left + px.w + t);
    };

    const out = Buffer.allocUnsafe(w * h * 3);
    let outsideTotal = 0, outsideChanged = 0;
    for (let y = 0, p = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1, p += 3) {
        const d = Math.max(Math.abs(o[p]! - e[p]!), Math.abs(o[p + 1]! - e[p + 1]!), Math.abs(o[p + 2]! - e[p + 2]!));
        const ins = inside(x, y);
        if (!ins) { outsideTotal += 1; if (d > THRESHOLD) outsideChanged += 1; }
        // base: dimmed grayscale of the original
        const g = Math.round((o[p]! * 0.3 + o[p + 1]! * 0.59 + o[p + 2]! * 0.11) * 0.55);
        let r = g, gg = g, b = g;
        if (onBorder(x, y)) { r = 40; gg = 140; b = 255; }       // drawn region outline (blue)
        else if (!ins && d > THRESHOLD) {                          // changed OUTSIDE region (red, scaled)
          const s = Math.min(1, d / 120);
          r = Math.round(120 + 135 * s); gg = Math.round(g * (1 - s)); b = Math.round(g * (1 - s));
        } else if (ins) { gg = Math.round(g * 0.8); b = Math.round(g * 0.6); r = Math.min(255, g + 25); } // region tint
        out[p] = r; out[p + 1] = gg; out[p + 2] = b;
      }
    }
    writeFileSync(`${outDir}${c.id}__drift.jpg`, await sharp(out, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 88 }).toBuffer());
    const pct = ((outsideChanged / outsideTotal) * 100).toFixed(1);
    console.log(`${c.id}: OUTSIDE drawn region, raw changed ${pct}% of the room  → ${c.id}__drift.jpg`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
