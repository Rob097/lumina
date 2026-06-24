'use client';

import { useState, useTransition } from 'react';
import { SUPPORT_CATEGORIES, type SupportCategory } from '@lumina/shared';
import { submitSupportAction } from './actions';

const CATEGORY_LABEL: Record<SupportCategory, string> = {
  technical: 'Technical issue',
  billing: 'Billing question',
  feature: 'Feature request',
  other: 'Something else',
};

export function SupportView({ email }: { email: string }) {
  const [category, setCategory] = useState<SupportCategory>('technical');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const valid = subject.trim().length >= 3 && message.trim().length >= 10;

  function submit() {
    setError(null);
    setSent(false);
    start(async () => {
      const res = await submitSupportAction({
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      if (res.ok) {
        setSent(true);
        setSubject('');
        setMessage('');
        setCategory('technical');
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="settings">
      <section className="card settings-section">
        <div className="card-head">
          <h3>Contact technical support</h3>
          <p className="t-secondary">
            Send us a message and we’ll reply to <strong>{email}</strong>.
          </p>
        </div>
        <div className="card-pad col" style={{ gap: 14 }}>
          <label className="field">
            <span className="field-label">Topic</span>
            <select
              className="select"
              value={category}
              onChange={(e) => setCategory(e.currentTarget.value as SupportCategory)}
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Subject</span>
            <input
              className="input"
              value={subject}
              maxLength={200}
              placeholder="Short summary of the issue"
              onChange={(e) => {
                setSubject(e.currentTarget.value);
                setSent(false);
              }}
            />
          </label>

          <label className="field">
            <span className="field-label">Message</span>
            <textarea
              className="textarea"
              value={message}
              maxLength={4000}
              rows={7}
              placeholder="Describe what's happening, what you expected, and any steps to reproduce."
              onChange={(e) => {
                setMessage(e.currentTarget.value);
                setSent(false);
              }}
            />
          </label>

          {error && <p className="field-error">{error}</p>}

          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!valid || pending}
              onClick={submit}
            >
              {pending ? 'Sending…' : 'Send message'}
            </button>
            {sent && !pending && (
              <span className="t-secondary">Thanks — your message is on its way.</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
