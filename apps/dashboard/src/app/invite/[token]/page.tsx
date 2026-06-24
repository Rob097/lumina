import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AcceptInvite } from './AcceptInvite';

/**
 * Team-invitation accept landing (linked from the invite email). The invitee must be signed in; once they
 * accept, they're added to the workspace and switched into it. Lives outside the authed app shell.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return (
      <div className="col center" style={{ minHeight: '60vh', gap: 14, textAlign: 'center' }}>
        <h1 className="title">You’ve been invited</h1>
        <p className="t-secondary" style={{ maxWidth: 360 }}>
          Sign in (or create your account) with the invited email, then reopen this link to join.
        </p>
        <Link className="btn btn-primary" href="/login">
          Sign in
        </Link>
      </div>
    );
  }

  return <AcceptInvite token={token} />;
}
