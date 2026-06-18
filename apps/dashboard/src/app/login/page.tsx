import './login.css';
import { BrandGlyph } from '@/components/ui/BrandMark';
import { signInWithGoogle, signInWithPassword, signUpWithPassword } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-wrap">
      <div className="auth-shell">
        {/* Brand panel — desktop only; the spatial promise of the product */}
        <aside className="auth-brandside" aria-hidden="true">
          <span className="auth-brandside-glow" />
          <div className="auth-logo">
            <span className="auth-logo-tile">
              <BrandGlyph size={30} />
            </span>
            <span className="auth-logo-name">YuzuView</span>
          </div>
          <div className="auth-pitch">
            <h2>See it in the room before they buy.</h2>
            <p>
              Composite your real products into a shopper&apos;s own space — and turn “maybe” into
              “add to cart.”
            </p>
          </div>
          <div className="auth-stat">
            <span className="auth-stat-num tnum">+24.8%</span>
            <span className="auth-stat-lbl">of previews convert to add-to-cart</span>
          </div>
        </aside>

        {/* Form panel */}
        <div className="auth-formside">
          <div className="auth-mobilebrand">
            <span className="auth-logo-tile">
              <BrandGlyph size={26} />
            </span>
            <span>YuzuView</span>
          </div>

          <div className="auth-head">
            <h1>Welcome back</h1>
            <p>Sign in to your merchant dashboard.</p>
          </div>

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
            <button className="btn btn-secondary auth-google">
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24Z" />
                <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1Z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
              </svg>
              Continue with Google
            </button>
          </form>

          <span className="auth-terms">By continuing you agree to the Terms &amp; Privacy Policy.</span>
        </div>
      </div>
    </main>
  );
}
