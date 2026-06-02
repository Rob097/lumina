import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface SessionUser {
  id: string;
  email: string;
}

/**
 * Resolve the Supabase-authenticated user from the request cookies (@supabase/ssr). Route handlers are
 * read-only w.r.t. the session, so `setAll` is a no-op. Returns null when unauthenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return null;
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Route handlers don't refresh the session cookie; the dashboard middleware does.
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? '' };
}
