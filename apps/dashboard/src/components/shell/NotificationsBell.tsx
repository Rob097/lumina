'use client';

import { useEffect, useState } from 'react';
import type { Notification, NotificationListResponse } from '@lumina/shared';
import { Icon } from '@/components/ui/Icon';
import { Menu } from '@/components/ui/Menu';
import { markAllReadAction, refreshNotificationsAction } from '@/lib/notifications-actions';

const POLL_MS = 60_000;

/** Compact relative time ("now", "5m", "3h", "2d") for the dropdown. */
function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

function NotifItem({ n }: { n: Notification }) {
  return (
    <div className={`notif-item${n.readAt ? '' : ' is-unread'}`}>
      <span className="notif-dot" aria-hidden="true" />
      <div className="notif-body">
        <div className="notif-row">
          <span className="notif-title">{n.title}</span>
          <span className="notif-time">{ago(n.createdAt)}</span>
        </div>
        {n.body && <p className="notif-text">{n.body}</p>}
      </div>
    </div>
  );
}

/**
 * Topbar notifications bell. Seeded server-side (no flash), then polled on an interval — the table is
 * already in the Realtime publication, so a push transport can replace polling later without UI change.
 */
export function NotificationsBell({ initial }: { initial: NotificationListResponse }) {
  const [data, setData] = useState<NotificationListResponse>(initial);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const next = await refreshNotificationsAction();
        if (alive) setData(next);
      } catch {
        /* keep the last good state */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const { unread, notifications } = data;

  return (
    <Menu
      triggerClassName="icon-btn notif-btn"
      ariaLabel={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
      trigger={
        <>
          <Icon name="bell" size={17} strokeWidth={1.8} />
          {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
        </>
      }
    >
      <div className="menu-head notif-head">
        <span>Notifications</span>
        {unread > 0 && (
          <button
            type="button"
            className="notif-readall"
            onClick={async () => setData(await markAllReadAction())}
          >
            Mark all read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="menu-empty">You&apos;re all caught up — no notifications yet.</div>
      ) : (
        <div className="notif-list">
          {notifications.map((n) => (
            <NotifItem key={n.id} n={n} />
          ))}
        </div>
      )}
    </Menu>
  );
}
