import { z } from 'zod';
import { NOTIFICATION_TYPES, NotificationTypeSchema, type NotificationType } from './enums.js';

export { NOTIFICATION_TYPES, NotificationTypeSchema, type NotificationType } from './enums.js';

/**
 * Dashboard notifications (§ post-go-live wave C). Actionable events only — failures + low credits —
 * fanned out to each merchant member as their own row, delivered in-app and (per prefs) by email.
 */
export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).default({}),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

/** `GET /v1/notifications` — the recent list for the session user + the unread count for the bell. */
export const NotificationListResponseSchema = z.object({
  notifications: z.array(NotificationSchema),
  unread: z.number().int().nonnegative(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;

/** `POST /v1/notifications/read` — mark specific ids, or all, as read. */
export const MarkReadRequestSchema = z
  .object({
    ids: z.array(z.string().min(1)).optional(),
    all: z.boolean().optional(),
  })
  .refine((r) => r.all === true || (r.ids?.length ?? 0) > 0, {
    message: 'Provide ids or all:true',
  });
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;

/** Per-type channel toggles. */
export const ChannelPrefSchema = z.object({ inApp: z.boolean(), email: z.boolean() });
export type ChannelPref = z.infer<typeof ChannelPrefSchema>;

/** A merchant member's notification preferences — a partial map of type → channels (gaps = defaults). */
export const NotificationPrefsSchema = z.record(NotificationTypeSchema, ChannelPrefSchema);
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

/** Shipped defaults: actionable events are important, so in-app + email are both on until muted. */
export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, ChannelPref> = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [t, { inApp: true, email: true }]),
) as Record<NotificationType, ChannelPref>;

/** Effective channels for a type: a stored override wins, else the shipped default. */
export function channelsFor(prefs: NotificationPrefs | null | undefined, type: NotificationType): ChannelPref {
  return prefs?.[type] ?? DEFAULT_NOTIFICATION_PREFS[type];
}

/** `GET`/`PUT /v1/notification-prefs`. */
export const NotificationPrefsResponseSchema = z.object({ prefs: NotificationPrefsSchema });
export type NotificationPrefsResponse = z.infer<typeof NotificationPrefsResponseSchema>;
