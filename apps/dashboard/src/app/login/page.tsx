import './login.css';
import { signInWithGoogle, signInWithPassword, signUpWithPassword } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">LUMINA</div>
        <p className="auth-sub">Sign in to your merchant dashboard.</p>

        {error ? <p className="auth-error">{error}</p> : null}

        <form className="auth-form">
          <label className="auth-field">
            <span>Email</span>
            <input className="input" name="email" type="email" required autoComplete="email" />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              className="input"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
            />
          </label>
          <div className="auth-actions">
            <button className="btn btn-primary" formAction={signInWithPassword}>
              Sign in
            </button>
            <button className="btn btn-secondary" formAction={signUpWithPassword}>
              Create account
            </button>
          </div>
        </form>

        <div className="auth-divider">or</div>

        <form action={signInWithGoogle}>
          <button className="btn btn-secondary auth-google">Continue with Google</button>
        </form>
      </div>
    </main>
  );
}
