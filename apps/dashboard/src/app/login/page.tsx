import { signInWithGoogle, signInWithPassword, signUpWithPassword } from './actions';

const inputStyle = { display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>LUMINA</h1>
      <p>Sign in to your merchant dashboard.</p>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form>
        <label>
          Email
          <input name="email" type="email" required style={inputStyle} />
        </label>
        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Password
          <input name="password" type="password" required minLength={8} style={inputStyle} />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button formAction={signInWithPassword}>Sign in</button>
          <button formAction={signUpWithPassword}>Create account</button>
        </div>
      </form>
      <form action={signInWithGoogle} style={{ marginTop: '1rem' }}>
        <button>Continue with Google</button>
      </form>
    </main>
  );
}
