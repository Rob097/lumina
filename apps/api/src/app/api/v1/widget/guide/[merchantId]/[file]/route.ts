import { guideImageContentType, guideKey, merchantIdForKey } from '@/lib/storage/keys';
import { createR2FromEnv } from '@/lib/storage/r2';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = (): Response => new Response('Not found', { status: 404 });

/**
 * GET /v1/widget/guide/{merchantId}/{id}.{ext} — public, stable CDN-style proxy for a merchant's pre-upload
 * guide image. The R2 bucket stays PRIVATE (room photos are people's homes, HARD RULE #9), so an uploaded
 * guide image — which is a deliberately published, shopper-facing marketing asset — is served through this
 * route instead of a signed/expiring URL. The file name encodes the content type; the response is
 * immutable-cacheable (the id is random, so a URL never changes content).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ merchantId: string; file: string }> },
): Promise<Response> {
  const { merchantId, file } = await ctx.params;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return notFound();
  const id = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  const contentType = guideImageContentType(ext);
  if (!isUuid(merchantId) || !isUuid(id) || !contentType) return notFound();

  const key = guideKey(merchantId, id, ext);
  if (merchantIdForKey(key) !== merchantId) return notFound(); // defense-in-depth (HARD RULE #1)

  const storage = createR2FromEnv(process.env);
  if (!storage) return notFound();

  try {
    const bytes = await storage.getObject(key);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
      },
    });
  } catch {
    return notFound();
  }
}
