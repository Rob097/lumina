import { createR2FromEnv } from '@/lib/storage/r2';
import type { GenerationDeps } from './service';

/**
 * Build the image-URL deps for the generations API from the R2 env. Result/room objects are served
 * as resized CDN URLs (D16); when R2 is unconfigured the URLs are `null` and the dashboard renders a
 * placeholder — we never claim an image we can't serve.
 */
export function generationImageDeps(width = 640): GenerationDeps {
  const r2 = createR2FromEnv(process.env);
  return { imageUrl: (key) => (key && r2 ? r2.resizeUrl(key, { width }) : null) };
}
