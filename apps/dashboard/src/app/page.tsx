import { redirect } from 'next/navigation';
import { bootstrapMerchant, fetchDomains, fetchKeys, fetchMe } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const cell = { borderBottom: '1px solid #eee', padding: '0.4rem 0', fontSize: 14 } as const;

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect('/login');
  }

  // First login provisions the merchant + default keys (idempotent).
  await bootstrapMerchant();
  const [me, keys, domains] = await Promise.all([fetchMe(), fetchKeys(), fetchDomains()]);
  const merchant = me?.merchants[0];

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>LUMINA</h1>
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </header>
      <p>
        Signed in as <strong>{me?.user.email ?? data.user.email}</strong>
      </p>

      {merchant ? (
        <section>
          <h2>{merchant.name}</h2>
          <p>
            Plan: <strong>{merchant.plan}</strong> · Credits:{' '}
            <strong>{merchant.creditsBalance}</strong>
          </p>
        </section>
      ) : (
        <p>Setting up your merchant…</p>
      )}

      <section style={{ marginTop: '1.5rem' }}>
        <h3>API keys</h3>
        <div>
          {keys.map((k) => (
            <div key={k.id} style={cell}>
              <code>{k.prefix}…</code> — {k.kind}/{k.env}
              {k.revokedAt ? ' (revoked)' : ''}
            </div>
          ))}
          {keys.length === 0 ? <p>No keys yet.</p> : null}
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h3>Allowed domains</h3>
        {domains.length > 0 ? (
          <ul>
            {domains.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : (
          <p>No domains configured.</p>
        )}
      </section>
    </main>
  );
}
