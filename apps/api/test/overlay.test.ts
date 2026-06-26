import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { drawPlacementOverlay } from '../src/lib/images/overlay';

async function solid(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer(),
  );
}

describe('drawPlacementOverlay', () => {
  it('draws the box + anchor + label without changing the image dimensions', async () => {
    const base = await solid(200, 300);
    const out = await drawPlacementOverlay(
      base,
      { left: 50, top: 60, width: 80, height: 40 },
      { anchor: { x: 0.5, y: 0.2 }, label: 'forearm/left 80x40px' },
    );
    const meta = await sharp(Buffer.from(out.bytes)).metadata();
    expect(out.contentType).toBe('image/png');
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(300);
    expect(out.bytes).not.toEqual(base); // something was drawn
  });

  it('handles an empty box (no-placement label) and never throws on unreadable bytes', async () => {
    const labelled = await drawPlacementOverlay(await solid(120, 120), { left: 0, top: 0, width: 0, height: 0 }, {
      label: 'NO PLACEMENT FOUND',
    });
    expect(labelled.bytes.length).toBeGreaterThan(0);
    const bad = await drawPlacementOverlay(Uint8Array.from([1, 2, 3]), { left: 0, top: 0, width: 0, height: 0 });
    expect(bad.bytes.length).toBeGreaterThan(0);
  });
});
