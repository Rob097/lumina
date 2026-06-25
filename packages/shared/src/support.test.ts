import { describe, expect, it } from 'vitest';
import { SUPPORT_CATEGORIES, parseSupportPrefill } from './support.js';

describe('parseSupportPrefill', () => {
  it('returns empty defaults when no params are given', () => {
    expect(parseSupportPrefill({})).toEqual({ category: 'technical', subject: '' });
  });

  it('passes through a valid topic and trims the subject', () => {
    expect(parseSupportPrefill({ topic: 'billing', subject: '  Request of Enterprise plan  ' })).toEqual({
      category: 'billing',
      subject: 'Request of Enterprise plan',
    });
  });

  it('accepts every known support category as a topic', () => {
    for (const c of SUPPORT_CATEGORIES) {
      expect(parseSupportPrefill({ topic: c }).category).toBe(c);
    }
  });

  it('falls back to "technical" for an unknown or absent topic', () => {
    expect(parseSupportPrefill({ topic: 'nonsense' }).category).toBe('technical');
    expect(parseSupportPrefill({ subject: 'hi there' }).category).toBe('technical');
  });

  it('truncates an over-long subject to 200 chars', () => {
    const long = 'x'.repeat(500);
    expect(parseSupportPrefill({ subject: long }).subject).toHaveLength(200);
  });

  it('ignores array-valued params (takes nothing) rather than crashing', () => {
    expect(parseSupportPrefill({ topic: ['billing'], subject: ['a', 'b'] })).toEqual({
      category: 'technical',
      subject: '',
    });
  });
});
