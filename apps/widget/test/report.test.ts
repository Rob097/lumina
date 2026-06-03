import { describe, it, expect, vi } from 'vitest';
import { createReporter, type ReportEvent } from '../src/core/report.js';

describe('createReporter', () => {
  it('is a no-op when no DSN is configured', () => {
    const transport = vi.fn();
    const report = createReporter({ transport });
    report(new Error('boom'));
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports the message + site_key tag when a DSN is set', () => {
    const transport = vi.fn<(e: ReportEvent) => void>();
    const report = createReporter({ dsn: 'https://k@o.ingest.sentry.io/1', siteKey: 'pk_test', transport });
    report(new Error('boom'), { stage: 'generate' });
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'boom',
        tags: expect.objectContaining({ source: 'widget', site_key: 'pk_test' }),
        extra: { stage: 'generate' },
      }),
    );
  });

  it('never throws, even if the transport throws', () => {
    const report = createReporter({
      dsn: 'https://k@o.ingest.sentry.io/1',
      transport: () => {
        throw new Error('transport down');
      },
    });
    expect(() => report('a string error')).not.toThrow();
  });
});
