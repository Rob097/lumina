'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInviteAction } from '@/lib/workspace-actions';

export function AcceptInvite({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function accept() {
    setError(null);
    start(async () => {
      const res = await acceptInviteAction(token);
      if (res.ok) {
        router.push('/overview');
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="col center" style={{ minHeight: '60vh', gap: 14, textAlign: 'center' }}>
      <h1 className="title">Join the workspace</h1>
      <p className="t-secondary" style={{ maxWidth: 360 }}>
        You’ve been invited to a YuzuView workspace. Accept to join the team.
      </p>
      {error && <p className="field-error">{error}</p>}
      <button className="btn btn-primary" type="button" disabled={pending} onClick={accept}>
        {pending ? 'Joining…' : 'Accept invitation'}
      </button>
    </div>
  );
}
