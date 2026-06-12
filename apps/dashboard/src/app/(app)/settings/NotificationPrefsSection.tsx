'use client';

import { useState, useTransition } from 'react';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_TYPES,
  type NotificationPrefs,
  type NotificationType,
} from '@lumina/shared';
import { saveNotificationPrefsAction } from '@/lib/notifications-actions';

const TYPE_LABEL: Record<NotificationType, { title: string; desc: string }> = {
  generation_failed: {
    title: 'Failed previews',
    desc: 'A shopper’s preview failed and the credit was refunded.',
  },
  low_credits: { title: 'Low credits', desc: 'Your balance drops below the top-up threshold.' },
  payment_failed: { title: 'Payment problems', desc: 'A billing charge didn’t go through.' },
};

type FullPrefs = Record<NotificationType, { inApp: boolean; email: boolean }>;

export function NotificationPrefsSection({ initial }: { initial: NotificationPrefs }) {
  const seed: FullPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...initial };
  const [prefs, setPrefs] = useState<FullPrefs>(seed);
  const [baseline, setBaseline] = useState<FullPrefs>(seed);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = JSON.stringify(prefs) !== JSON.stringify(baseline);

  function toggle(type: NotificationType, channel: 'inApp' | 'email') {
    setPrefs((p) => ({ ...p, [type]: { ...p[type], [channel]: !p[type][channel] } }));
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveNotificationPrefsAction(prefs);
      if (res.ok) {
        const merged: FullPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...res.prefs };
        setBaseline(merged);
        setPrefs(merged);
        setSavedAt(Date.now());
      } else {
        setError("Couldn't save your preferences. Please try again.");
      }
    });
  }

  return (
    <section className="card settings-section">
      <div className="card-head">
        <h3>Notifications</h3>
        <p className="t-secondary">Choose how each actionable alert reaches you.</p>
      </div>
      <div className="card-pad">
        <table className="notif-prefs">
          <thead>
            <tr>
              <th />
              <th>In-app</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TYPES.map((t) => (
              <tr key={t}>
                <td>
                  <div className="np-title">{TYPE_LABEL[t].title}</div>
                  <div className="np-desc">{TYPE_LABEL[t].desc}</div>
                </td>
                <td className="np-cell">
                  <input
                    type="checkbox"
                    checked={prefs[t].inApp}
                    onChange={() => toggle(t, 'inApp')}
                    aria-label={`${TYPE_LABEL[t].title} — in-app`}
                  />
                </td>
                <td className="np-cell">
                  <input
                    type="checkbox"
                    checked={prefs[t].email}
                    onChange={() => toggle(t, 'email')}
                    aria-label={`${TYPE_LABEL[t].title} — email`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="field-error">{error}</p>}
        <div className="np-foot">
          {savedAt && !dirty && !pending && <span className="np-saved">Saved</span>}
          <button className="btn btn-primary" type="button" disabled={!dirty || pending} onClick={save}>
            {pending ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>
    </section>
  );
}
