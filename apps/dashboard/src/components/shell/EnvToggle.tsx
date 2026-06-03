'use client';

import { useEnv } from '@/lib/providers';

/** Test/Live environment toggle (topbar). Persisted via the EnvProvider cookie. */
export function EnvToggle() {
  const { env, setEnv } = useEnv();
  return (
    <div className="env-toggle">
      <button className={env === 'live' ? 'on' : ''} data-env="live" onClick={() => setEnv('live')}>
        <span className="dot" />
        Live
      </button>
      <button className={env === 'test' ? 'on' : ''} data-env="test" onClick={() => setEnv('test')}>
        <span className="dot" />
        Test
      </button>
    </div>
  );
}
