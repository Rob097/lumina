import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public CDN base for image-resize URLs, e.g. https://cdn.lumina.app. */
  publicBase?: string;
}

export interface ResizeOptions {
  width?: number;
  height?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpeg';
  fit?: 'cover' | 'contain' | 'scale-down';
}

/**
 * Cloudflare R2 (S3 API) storage. Direct-to-R2 presigned uploads (no server hop) and short-lived
 * signed reads. Object keys are merchant-prefixed by the callers in `keys.ts`.
 */
export class R2Storage {
  private readonly client: S3Client;

  constructor(private readonly cfg: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  /** Presigned PUT URL for direct browser → R2 upload. */
  presignUpload(key: string, contentType: string, expiresIn = 600): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  /** Short-lived signed GET URL for a stored object (e.g. a result). */
  presignDownload(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      { expiresIn },
    );
  }

  async putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<Uint8Array> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
    );
    if (!res.Body) {
      throw new Error(`R2 object not found: ${key}`);
    }
    return res.Body.transformToByteArray();
  }

  /** Cloudflare image-resizing URL for a thumbnail/variant of a stored object. */
  resizeUrl(key: string, opts: ResizeOptions = {}): string {
    const base = this.cfg.publicBase ?? '';
    const params = [
      opts.width ? `width=${opts.width}` : null,
      opts.height ? `height=${opts.height}` : null,
      `format=${opts.format ?? 'auto'}`,
      opts.fit ? `fit=${opts.fit}` : null,
    ]
      .filter((p): p is string => p !== null)
      .join(',');
    return `${base}/cdn-cgi/image/${params}/${key}`;
  }
}

export function createR2FromEnv(env: Record<string, string | undefined>): R2Storage | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return null;
  }
  return new R2Storage({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicBase: R2_PUBLIC_BASE,
  });
}
