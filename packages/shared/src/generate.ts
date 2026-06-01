import { z } from 'zod';
import { GenerationStatusSchema } from './enums.js';
import { ErrorCodeSchema } from './errors.js';
import { InlineProductSchema } from './product.js';

/** `POST /v1/widget/sign-upload` (§6.2): request a presigned R2 PUT for the room photo. */
export const SignUploadRequestSchema = z.object({
  contentType: z.string().min(1),
  kind: z.literal('room'),
});
export type SignUploadRequest = z.infer<typeof SignUploadRequestSchema>;

export const SignUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  roomKey: z.string().min(1),
  expiresIn: z.number().int().positive(),
});
export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>;

/** `POST /v1/widget/generate` (§6.2): either a registered productId or an inline product is required. */
export const GenerateRequestSchema = z
  .object({
    productId: z.string().optional(),
    product: InlineProductSchema.optional(),
    roomKey: z.string().min(1),
    placementHint: z.string().optional(),
    anonId: z.string().min(1),
    pageUrl: z.string().url().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .refine((req) => Boolean(req.productId) || Boolean(req.product), {
    message: 'Either productId or an inline product is required',
    path: ['productId'],
  });
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const GenerateResponseSchema = z.object({
  generationId: z.string(),
  status: GenerationStatusSchema,
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

/** Pipeline stages reported during processing (architecture §4 Phase E / §7.3). */
export const GENERATION_STAGES = [
  'validate',
  'bg_removal',
  'scene_analysis',
  'compose',
  'moderate',
  'store',
] as const;
export const GenerationStageSchema = z.enum(GENERATION_STAGES);
export type GenerationStage = z.infer<typeof GenerationStageSchema>;

/** `GET /v1/widget/status/:id` (§6.2) — polling fallback for Realtime. */
export const StatusResponseSchema = z.object({
  id: z.string(),
  status: GenerationStatusSchema,
  stage: GenerationStageSchema.optional(),
  resultUrl: z.string().url().optional(),
  beforeUrl: z.string().url().optional(),
  error: z
    .object({
      code: ErrorCodeSchema,
      message: z.string(),
    })
    .optional(),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

/** `POST /v1/widget/feedback` (§6.2). */
export const FeedbackRatingSchema = z.enum(['up', 'down']);
export type FeedbackRating = z.infer<typeof FeedbackRatingSchema>;

export const FeedbackRequestSchema = z.object({
  generationId: z.string().min(1),
  rating: FeedbackRatingSchema,
  comment: z.string().optional(),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
