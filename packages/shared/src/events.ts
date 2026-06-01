import { z } from 'zod';

/**
 * Public widget events (architecture §3.6). Dispatched through `Lumina.on(event, handler)` and as
 * `window` CustomEvents named `lumina:<event>`.
 */
export const WIDGET_EVENTS = {
  READY: 'ready',
  OPEN: 'open',
  CLOSE: 'close',
  UPLOAD_START: 'upload:start',
  UPLOAD_DONE: 'upload:done',
  GENERATE_START: 'generate:start',
  GENERATE_PROGRESS: 'generate:progress',
  GENERATE_SUCCESS: 'generate:success',
  GENERATE_ERROR: 'generate:error',
  RESULT_SAVE: 'result:save',
  RESULT_SHARE: 'result:share',
  FEEDBACK: 'feedback',
  CTA_CLICK: 'cta:click',
} as const;

export const WIDGET_EVENT_NAMES = Object.values(WIDGET_EVENTS) as [
  WidgetEventName,
  ...WidgetEventName[],
];
export type WidgetEventName = (typeof WIDGET_EVENTS)[keyof typeof WIDGET_EVENTS];

export const WidgetEventNameSchema = z.enum([
  'ready',
  'open',
  'close',
  'upload:start',
  'upload:done',
  'generate:start',
  'generate:progress',
  'generate:success',
  'generate:error',
  'result:save',
  'result:share',
  'feedback',
  'cta:click',
]);

/**
 * Server-side usage/analytics event types persisted to `usage_events` and mirrored to Axiom
 * (architecture §5.2 + §6.2 `/widget/event`).
 */
export const USAGE_EVENT_TYPES = [
  'impression',
  'open',
  'upload',
  'generate',
  'success',
  'cta',
  'feedback',
] as const;
export const UsageEventTypeSchema = z.enum(USAGE_EVENT_TYPES);
export type UsageEventType = z.infer<typeof UsageEventTypeSchema>;

/** `POST /v1/widget/event` beacon payload (§6.2) — impression/open/cta analytics. */
export const EventBeaconRequestSchema = z.object({
  type: UsageEventTypeSchema,
  productId: z.string().optional(),
  generationId: z.string().optional(),
  anonId: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
});
export type EventBeaconRequest = z.infer<typeof EventBeaconRequestSchema>;
