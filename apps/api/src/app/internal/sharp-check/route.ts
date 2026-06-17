import { loadSharp } from '@/lib/images/sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Internal diagnostic: confirm the native `sharp` module + its libvips `.so` actually load and run in this
 * serverless function. The image pipeline (auto-orient, normalize, coverage composite, pixel-perfect blend)
 * wraps every sharp call in try/catch and silently no-ops when sharp can't load — so a tracing/binary miss
 * is invisible in the result and only shows up as rotated rooms / no coverage tiling / null result dims.
 * This endpoint surfaces it directly (and lets us verify a fix without running a billed generation).
 * Returns no secrets or tenant data.
 */
export async function GET(): Promise<Response> {
  try {
    const sharp = await loadSharp();
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    return new Response(JSON.stringify({ ok: true, width: meta.width ?? 0, height: meta.height ?? 0 }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
