import { describe, expect, it } from 'vitest';
import {
  guideImageContentType,
  guideImageExt,
  guideKey,
  merchantIdForKey,
} from '../src/lib/storage/keys';

describe('guide image storage keys', () => {
  it('maps supported content types to a file extension, rejects others', () => {
    expect(guideImageExt('image/png')).toBe('png');
    expect(guideImageExt('image/jpeg')).toBe('jpg');
    expect(guideImageExt('image/jpg')).toBe('jpg');
    expect(guideImageExt('IMAGE/WEBP')).toBe('webp');
    expect(guideImageExt('image/gif')).toBeNull();
    expect(guideImageExt('application/pdf')).toBeNull();
  });

  it('maps a stored extension back to its content type', () => {
    expect(guideImageContentType('png')).toBe('image/png');
    expect(guideImageContentType('jpg')).toBe('image/jpeg');
    expect(guideImageContentType('jpeg')).toBe('image/jpeg');
    expect(guideImageContentType('webp')).toBe('image/webp');
    expect(guideImageContentType('svg')).toBeNull();
    expect(guideImageContentType('')).toBeNull();
  });

  it('builds a tenant-prefixed guide key (HARD RULE #1)', () => {
    expect(guideKey('m1', 'abc', 'png')).toBe('guides/m1/abc.png');
    expect(guideKey('merchant-2', 'id-9', 'webp')).toBe('guides/merchant-2/id-9.webp');
  });

  it('resolves the owning merchant of a guide key (defense-in-depth)', () => {
    expect(merchantIdForKey('guides/m1/abc.png')).toBe('m1');
    expect(merchantIdForKey('rooms/m2/x.jpg')).toBe('m2');
    expect(merchantIdForKey('results/m3/g.jpg')).toBe('m3');
    expect(merchantIdForKey('nope/x.png')).toBeNull();
  });
});
