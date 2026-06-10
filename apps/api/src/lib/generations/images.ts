import { createR2FromEnv, type R2Storage } from '@/lib/storage/r2';
import type { GenerationDeps } from './service';

/** Minimal storage surface the dashboard image deps need — just short-lived signed reads. */
type SignedReadStorage = Pick<R2Storage, 'presignDownload'>;

/**
 * Build the image-URL deps for the generations API. Stored room/result objects are served as
 * **short-lived signed R2 GET URLs** (D50): the bucket stays private (HARD RULE #9 — room photos are
 * people's homes) and no public CDN domain is required. URLs are `null` when storage is unconfigured or
 * there is no result yet, so the dashboard renders a placeholder — we never claim an image we can't serve.
 */
export function generationImageDeps(
  storage: SignedReadStorage | null = createR2FromEnv(process.env),
): GenerationDeps {
  return { imageUrl: async (key) => (key && storage ? storage.presignDownload(key) : null) };
}
