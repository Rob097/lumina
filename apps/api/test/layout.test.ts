import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  bboxToBox,
  buildCoverageLayout,
  chooseGridDims,
  gridCells,
  DEFAULT_WALL_BOX,
} from '../src/lib/images/layout.js';

describe('chooseGridDims', () => {
  it('picks a grid that covers the count, with columns from the product aspect', () => {
    // 12 square tiles in a 800×600 box → 4 cols × 3 rows (tiles stay ~square).
    expect(chooseGridDims(12, 800, 600, 1)).toEqual({ cols: 4, rows: 3 });
  });

  it('never collapses a small count below the requested number of tiles', () => {
    // 2 square tiles in a tall 400×800 box → 1 col × 2 rows.
    expect(chooseGridDims(2, 400, 800, 1)).toEqual({ cols: 1, rows: 2 });
  });

  it('clamps an absurd count so tiles never become microscopic', () => {
    const { cols, rows } = chooseGridDims(100000, 800, 600, 1);
    expect(cols).toBeLessThanOrEqual(24);
    expect(rows).toBeLessThanOrEqual(24);
  });
});

describe('gridCells', () => {
  it('tiles the box edge-to-edge with no gaps or overlaps', () => {
    const box = { left: 100, top: 0, w: 200, h: 100 };
    const cells = gridCells(box, 4, 2);
    expect(cells).toHaveLength(8);
    // First cell starts at the box origin; the grid reaches the far edges exactly.
    expect(cells[0]).toMatchObject({ left: 100, top: 0 });
    const last = cells[cells.length - 1]!;
    expect(last.left + last.w).toBe(300);
    expect(last.top + last.h).toBe(100);
  });
});

describe('bboxToBox', () => {
  it('converts a [x0,y0,x1,y1] bbox into an {x,y,w,h} box', () => {
    expect(bboxToBox([0.1, 0.2, 0.5, 0.9], DEFAULT_WALL_BOX)).toEqual({
      x: 0.1,
      y: 0.2,
      w: 0.4,
      h: 0.7,
    });
  });

  it('falls back when the bbox is missing or degenerate', () => {
    expect(bboxToBox(undefined, DEFAULT_WALL_BOX)).toEqual(DEFAULT_WALL_BOX);
    expect(bboxToBox([0.5, 0.5, 0.5, 0.5], DEFAULT_WALL_BOX)).toEqual(DEFAULT_WALL_BOX);
    expect(bboxToBox([0.1, 0.2, 0.5], DEFAULT_WALL_BOX)).toEqual(DEFAULT_WALL_BOX);
  });
});

describe('buildCoverageLayout', () => {
  async function solid(width: number, height: number, rgb: { r: number; g: number; b: number }) {
    return new Uint8Array(
      await sharp({ create: { width, height, channels: 3, background: rgb } }).jpeg().toBuffer(),
    );
  }
  async function pixel(bytes: Uint8Array, left: number, top: number) {
    const raw = await sharp(Buffer.from(bytes))
      .extract({ left, top, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    return { r: raw[0]!, g: raw[1]!, b: raw[2]! };
  }

  it('tiles the cutout across the box and leaves the room untouched outside it', async () => {
    const room = await solid(200, 120, { r: 200, g: 30, b: 30 }); // red room
    const cutout = await solid(40, 40, { r: 30, g: 30, b: 200 }); // blue product

    const out = await buildCoverageLayout({
      room,
      cutout,
      box: { x: 0.25, y: 0, w: 0.5, h: 1 }, // middle half horizontally (px 50..150)
      count: 4,
      productAspect: 1,
      trimCutout: false,
      contentType: 'image/jpeg',
    });

    // Output keeps the room's dimensions.
    expect(await sharp(Buffer.from(out.bytes)).metadata()).toMatchObject({ width: 200, height: 120 });
    // Outside the box stays red; inside the box is covered by blue tiles.
    const outside = await pixel(out.bytes, 10, 60);
    const inside = await pixel(out.bytes, 100, 60);
    expect(outside.r).toBeGreaterThan(outside.b);
    expect(inside.b).toBeGreaterThan(inside.r);
  });

  it('degrades to the room bytes when the room is unreadable', async () => {
    const room = new Uint8Array([1, 2, 3, 4]);
    const cutout = await solid(10, 10, { r: 0, g: 0, b: 255 });
    const out = await buildCoverageLayout({ room, cutout, box: DEFAULT_WALL_BOX, count: 4 });
    expect(out.bytes).toBe(room);
  });
});
