import { describe, expect, it } from 'vitest';
import {
  USAGE_EVENT_TYPES,
  UsageEventTypeSchema,
  WIDGET_EVENTS,
  WidgetEventNameSchema,
} from './events.js';

describe('events', () => {
  it('exposes the public widget event names from §3.6', () => {
    expect(WIDGET_EVENTS.GENERATE_SUCCESS).toBe('generate:success');
    expect(WIDGET_EVENTS.CTA_CLICK).toBe('cta:click');
    expect(WidgetEventNameSchema.parse('upload:done')).toBe('upload:done');
    expect(() => WidgetEventNameSchema.parse('upload:exploded')).toThrow();
  });

  it('exposes server-side usage event types', () => {
    expect(USAGE_EVENT_TYPES).toContain('impression');
    expect(USAGE_EVENT_TYPES).toContain('cta');
    expect(UsageEventTypeSchema.parse('feedback')).toBe('feedback');
  });
});
