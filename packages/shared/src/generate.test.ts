import { describe, expect, it } from 'vitest';
import {
  FeedbackRequestSchema,
  GenerateRequestSchema,
  GenerateResponseSchema,
  SignGuideUploadRequestSchema,
  SignGuideUploadResponseSchema,
  SignUploadRequestSchema,
  StatusResponseSchema,
} from './generate.js';

describe('sign-upload', () => {
  it('requires kind="room" and a content type', () => {
    expect(SignUploadRequestSchema.parse({ contentType: 'image/jpeg', kind: 'room' }).kind).toBe(
      'room',
    );
    expect(() => SignUploadRequestSchema.parse({ contentType: 'image/jpeg', kind: 'avatar' })).toThrow();
  });
});

describe('sign guide-upload', () => {
  it('accepts a content type and carries a stable public URL back', () => {
    expect(SignGuideUploadRequestSchema.parse({ contentType: 'image/png' }).contentType).toBe('image/png');
    const res = SignGuideUploadResponseSchema.parse({
      uploadUrl: 'https://r2.example.com/put?sig=1',
      publicUrl: 'https://api.example.com/api/v1/widget/guide/m1/abc.png',
      expiresIn: 600,
    });
    expect(res.publicUrl).toContain('/widget/guide/');
  });

  it('rejects a response missing the public URL', () => {
    expect(() =>
      SignGuideUploadResponseSchema.parse({ uploadUrl: 'https://r2/put', expiresIn: 600 }),
    ).toThrow();
  });
});

describe('generate request', () => {
  const base = { roomKey: 'rooms/m1/a1b2.jpg', anonId: 'v_7d2c' };

  it('accepts an inline product + roomKey', () => {
    const req = GenerateRequestSchema.parse({
      ...base,
      product: { name: 'Aura', imageUrl: 'https://shop.it/aura.png', category: 'lighting' },
      placementHint: 'left of the sofa',
    });
    expect(req.roomKey).toBe('rooms/m1/a1b2.jpg');
  });

  it('accepts a registered productId', () => {
    expect(GenerateRequestSchema.parse({ ...base, productId: 'SKU-1' }).productId).toBe('SKU-1');
  });

  it('accepts optional free-text custom instructions', () => {
    const req = GenerateRequestSchema.parse({
      ...base,
      productId: 'SKU-1',
      customInstructions: 'Place it next to the window, facing the room.',
    });
    expect(req.customInstructions).toBe('Place it next to the window, facing the room.');
  });

  it('caps custom instructions at 280 characters', () => {
    expect(() =>
      GenerateRequestSchema.parse({ ...base, productId: 'SKU-1', customInstructions: 'x'.repeat(281) }),
    ).toThrow();
  });

  it('rejects a missing roomKey', () => {
    expect(() => GenerateRequestSchema.parse({ anonId: 'v_1', productId: 'SKU-1' })).toThrow();
  });

  it('rejects when neither productId nor product is present', () => {
    expect(() => GenerateRequestSchema.parse(base)).toThrow();
  });
});

describe('generate response + status', () => {
  it('returns generationId + queued status', () => {
    const res = GenerateResponseSchema.parse({ generationId: '0192f5', status: 'queued' });
    expect(res.status).toBe('queued');
  });

  it('status response carries result/before urls when succeeded', () => {
    const s = StatusResponseSchema.parse({
      id: '0192f5',
      status: 'succeeded',
      resultUrl: 'https://cdn.lumina.app/r.jpg',
      beforeUrl: 'https://cdn.lumina.app/b.jpg',
    });
    expect(s.status).toBe('succeeded');
  });

  it('status response round-trips a coverage quantity estimate', () => {
    const s = StatusResponseSchema.parse({
      id: '0192f5',
      status: 'succeeded',
      resultUrl: 'https://cdn.lumina.app/r.jpg',
      suggestedQuantity: 6,
      quantityRationale: 'About 6 panels to cover the wall.',
    });
    expect(s.suggestedQuantity).toBe(6);
    expect(s.quantityRationale).toContain('panels');
  });

  it('rejects a non-positive / non-integer suggested quantity', () => {
    expect(() =>
      StatusResponseSchema.parse({ id: 'x', status: 'succeeded', suggestedQuantity: 0 }),
    ).toThrow();
    expect(() =>
      StatusResponseSchema.parse({ id: 'x', status: 'succeeded', suggestedQuantity: 2.5 }),
    ).toThrow();
  });
});

describe('feedback', () => {
  it('only accepts up/down ratings', () => {
    expect(FeedbackRequestSchema.parse({ generationId: 'g1', rating: 'up' }).rating).toBe('up');
    expect(() => FeedbackRequestSchema.parse({ generationId: 'g1', rating: 'meh' })).toThrow();
  });
});
