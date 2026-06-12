'use server';

import type { NotificationListResponse, NotificationPrefs } from '@lumina/shared';
import {
  fetchNotifications,
  markNotificationsRead,
  saveNotificationPrefs,
} from '@/lib/api';

/** Client-callable: re-read the bell's list (polling + after actions). */
export async function refreshNotificationsAction(): Promise<NotificationListResponse> {
  return fetchNotifications();
}

/** Mark all of the member's notifications read, then return the refreshed list. */
export async function markAllReadAction(): Promise<NotificationListResponse> {
  await markNotificationsRead({ all: true });
  return fetchNotifications();
}

/** Persist the notification preferences from the settings panel. */
export async function saveNotificationPrefsAction(
  prefs: NotificationPrefs,
): Promise<{ ok: true; prefs: NotificationPrefs } | { ok: false }> {
  const saved = await saveNotificationPrefs(prefs);
  return saved ? { ok: true, prefs: saved } : { ok: false };
}
