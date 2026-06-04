import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        background:
          'radial-gradient(120% 90% at 50% -10%, var(--accent-weak) 0%, transparent 55%), var(--bg)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-display-lg)',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          color: 'var(--accent)',
        }}
      >
        404
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title-lg)', fontWeight: 600 }}>
        Page not found
      </h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 360 }}>
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link className="btn btn-primary" href="/overview" style={{ marginTop: 8 }}>
        Back to dashboard
      </Link>
    </main>
  );
}
