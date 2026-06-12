import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFS,
  MarkReadRequestSchema,
  NotificationListResponseSchema,
  NotificationPrefsSchema,
  NotificationSchema,
  NotificationTypeSchema,
  channelsFor,
} from './notifications.js';

describe('NotificationTypeSchema', () => {
  it('accepts the actionable types and rejects unknown ones', () => {
    expect(NotificationTypeSchema.parse('generation_failed')).toBe('generation_failed');
    expect(NotificationTypeSchema.parse('low_credits')).toBe('low_credits');
    expect(NotificationTypeSchema.parse('payment_failed')).toBe('payment_failed');
    expect(() => NotificationTypeSchema.parse('generation_succeeded')).toThrow();
  });
});

describe('NotificationSchema', () => {
  it('parses a full notification row', () => {
    const n = NotificationSchema.parse({
      id: 'n1',
      type: 'generation_failed',
      title: 'A preview failed',
      body: 'We refunded the credit.',
      data: { generationId: 'g1' },
      readAt: null,
      createdAt: '2026-06-12T10:00:00.000Z',
    });
    expect(n.readAt).toBeNull();
    expect(n.data.generationId).toBe('g1');
  });
});

describe('NotificationListResponseSchema', () => {
  it('carries the list plus an unread count', () => {
    const r = NotificationListResponseSchema.parse({ notifications: [], unread: 0 });
    expect(r.unread).toBe(0);
  });
});

describe('MarkReadRequestSchema', () => {
  it('accepts mark-all', () => {
    expect(MarkReadRequestSchema.parse({ all: true }).all).toBe(true);
  });
  it('accepts a list of ids', () => {
    expect(MarkReadRequestSchema.parse({ ids: ['a', 'b'] }).ids).toEqual(['a', 'b']);
  });
  it('rejects an empty request (neither ids nor all)', () => {
    expect(() => MarkReadRequestSchema.parse({})).toThrow();
  });
});

describe('notification preferences', () => {
  it('defaults every actionable type to in-app + email on', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.generation_failed).toEqual({ inApp: true, email: true });
    expect(DEFAULT_NOTIFICATION_PREFS.low_credits).toEqual({ inApp: true, email: true });
    expect(DEFAULT_NOTIFICATION_PREFS.payment_failed).toEqual({ inApp: true, email: true });
  });

  it('parses a partial prefs map', () => {
    const p = NotificationPrefsSchema.parse({ low_credits: { inApp: true, email: false } });
    expect(p.low_credits).toEqual({ inApp: true, email: false });
  });

  it('channelsFor merges stored prefs over the defaults', () => {
    // email muted for low_credits, everything else default-on
    const merged = channelsFor({ low_credits: { inApp: true, email: false } }, 'low_credits');
    expect(merged).toEqual({ inApp: true, email: false });
    // a type with no stored override falls back to the default (on/on)
    expect(channelsFor({ low_credits: { inApp: true, email: false } }, 'payment_failed')).toEqual({
      inApp: true,
      email: true,
    });
  });
});
