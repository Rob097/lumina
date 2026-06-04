import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Friendly empty state for no-data panels (§M4 — empty states throughout). */
export function EmptyState({
  icon = 'generations',
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="col center" style={{ gap: 10, textAlign: 'center', padding: 'var(--space-7) 12px' }}>
      <span
        className="row center"
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface-3)',
          color: 'var(--text-faint)',
        }}
      >
        <Icon name={icon} size={22} />
      </span>
      <div className="title" style={{ fontSize: 'var(--fs-body-lg)' }}>
        {title}
      </div>
      {body ? (
        <div className="text-sm t-muted" style={{ maxWidth: 280 }}>
          {body}
        </div>
      ) : null}
      {action}
    </div>
  );
}
