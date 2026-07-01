import { describe, it, expect } from 'vitest';
import { latencyLabel, totalTimeLabel } from '../src/lib/generation-format';

describe('latencyLabel (compose-only duration)', () => {
  it('formats ms as seconds', () => {
    expect(latencyLabel(14_400)).toBe('14.4s');
  });
  it('is null when unknown', () => {
    expect(latencyLabel(null)).toBeNull();
  });
});

describe('totalTimeLabel (wall-clock: created → finished)', () => {
  it('shows minutes + seconds for long runs (the ~7-min case)', () => {
    expect(totalTimeLabel('2026-07-01T10:00:00.000Z', '2026-07-01T10:07:12.000Z')).toBe('7m 12s');
  });

  it('shows plain seconds under a minute', () => {
    expect(totalTimeLabel('2026-07-01T10:00:00.000Z', '2026-07-01T10:00:45.000Z')).toBe('45s');
  });

  it('is null while still running (no finishedAt)', () => {
    expect(totalTimeLabel('2026-07-01T10:00:00.000Z', null)).toBeNull();
  });

  it('is null for an inconsistent pair (finished before created)', () => {
    expect(totalTimeLabel('2026-07-01T10:05:00.000Z', '2026-07-01T10:00:00.000Z')).toBeNull();
  });
});
