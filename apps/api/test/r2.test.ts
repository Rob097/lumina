import { describe, expect, it } from 'vitest';
import { merchantIdForKey, productKey, resultKey, roomKey } from '../src/lib/storage/keys.js';
import { R2Storage } from '../src/lib/storage/r2.js';

describe('storage keys', () => {
  it('always prefixes objects by merchant id under a role folder', () => {
    expect(roomKey('m1', 'abc')).toBe('rooms/m1/abc.jpg');
    expect(productKey('m1', 'sku')).toBe('products/m1/sku.png');
    expect(resultKey('m1', 'gen1')).toBe('results/m1/gen1.jpg');
    expect(merchantIdForKey('results/m1/gen1.jpg')).toBe('m1');
    expect(merchantIdForKey('not-a-key')).toBeNull();
  });
});

describe('R2Storage presigning (offline)', () => {
  const r2 = new R2Storage({
    accountId: 'acct',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
    bucket: 'lumina',
    publicBase: 'https://cdn.lumina.app',
  });

  it('produces a signed PUT URL containing the key and an AWS signature', async () => {
    const key = roomKey('m1', 'abc');
    const url = await r2.presignUpload(key, 'image/jpeg');
    expect(url.startsWith('https://')).toBe(true);
    expect(url).toContain('m1');
    expect(url).toContain('X-Amz-Signature');
  });

  it('produces a signed GET URL', async () => {
    const url = await r2.presignDownload(resultKey('m1', 'gen1'));
    expect(url).toContain('X-Amz-Signature');
  });

  it('builds a Cloudflare image-resize URL', () => {
    const url = r2.resizeUrl(resultKey('m1', 'gen1'), { width: 320, format: 'webp' });
    expect(url).toBe('https://cdn.lumina.app/cdn-cgi/image/width=320,format=webp/results/m1/gen1.jpg');
  });
});
