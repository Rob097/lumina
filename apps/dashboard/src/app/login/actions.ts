'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  redirect(error ? `/login?error=${encodeURIComponent(error.message)}` : '/');
}

export async function signUpWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password });
  redirect(error ? `/login?error=${encodeURIComponent(error.message)}` : '/');
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const redirectTo = `${process.env.APP_URL ?? 'http://localhost:3000'}/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (data.url) {
    redirect(data.url);
  }
  redirect(`/login?error=${encodeURIComponent(error?.message ?? 'oauth_failed')}`);
}
