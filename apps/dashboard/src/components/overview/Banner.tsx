import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Menu } from '@/components/ui/Menu';
import { RANGE_LABEL, RANGE_ORDER, type RangeKey } from '@/lib/overview';

/** Status banner: install health + the active reporting range. */
export function Banner({
  domainCount,
  rangeLabel,
  range,
}: {
  domainCount: number;
  rangeLabel: string;
  range: RangeKey;
}) {
  const installed = domainCount > 0;
  return (
    <div className="banner">
      <Icon name={installed ? 'dot' : 'script'} size={18} strokeWidth={1.8} />
      <div className="grow">
        {installed ? (
          <>
            <span className="w-600">
              Your widget is live on {domainCount} {domainCount === 1 ? 'domain' : 'domains'}.
            </span>{' '}
            <span className="t-secondary">Generations and conversions for the period below.</span>
          </>
        ) : (
          <>
            <span className="w-600">Finish your install.</span>{' '}
            <span className="t-secondary">
              Add the one-line snippet to start seeing generations here.
            </span>
          </>
        )}
      </div>
      <div className="row gap-2">
        <span className="text-sm t-muted">{rangeLabel}</span>
        {installed ? (
          <Menu
            triggerClassName="btn btn-secondary btn-sm"
            ariaLabel="Reporting range"
            trigger={
              <>
                {RANGE_LABEL[range]}
                <Icon name="chevron-down" size={14} strokeWidth={2} />
              </>
            }
          >
            {RANGE_ORDER.map((r) => (
              <Link
                key={r}
                className={`menu-item${r === range ? ' is-current' : ''}`}
                href={`/overview?range=${r}`}
                role="menuitem"
              >
                {RANGE_LABEL[r]}
              </Link>
            ))}
          </Menu>
        ) : (
          <Link className="btn btn-primary btn-sm" href="/onboarding">
            Finish setup
          </Link>
        )}
      </div>
    </div>
  );
}
