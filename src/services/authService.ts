import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Email/password accounts use a real Supabase session, which supplies the JWT
// required by the server-side API. Never send credentials to the app server.
export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Authentication is not configured. Check the Supabase URL and anon key in Render.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user || !data.session) throw new Error('Supabase did not return a sign-in session.');
  return data.user;
}

export async function signUpWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Authentication is not configured. Check the Supabase URL and anon key in Render.');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return { user: data.user, requiresEmailConfirmation: !data.session };
}

export async function requestPasswordReset(email: string) {
  if (!supabase) throw new Error('Password recovery is not configured. Check the Supabase URL and anon key in Render.');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function updateAccountPassword(password: string) {
  if (!supabase) throw new Error('Password recovery is not configured. Check the Supabase URL and anon key in Render.');

  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data.user;
}

export function subscribeToPasswordRecovery(callback: () => void) {
  if (!supabase) return () => {};

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") callback();
  });
  return () => subscription.unsubscribe();
}

export async function signInAsGuest() {
  if (!supabase) throw new Error('Guest sign-in is unavailable. Check the Supabase URL and anon key in Render.');

  try {
    // Bound this request so a misconfigured Supabase project cannot leave the
    // guest button spinning indefinitely.
    const { data, error } = await Promise.race([
      supabase.auth.signInAnonymously(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase anonymous sign-in timed out')), 6000)
      ),
    ]);
    if (error) throw error;
    if (!data.user || !data.session) throw new Error('Supabase returned no anonymous session.');
    return data.user;
  } catch (error) {
    console.warn('Supabase anonymous sign-in failed:', error);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Guest sign-in failed: ${reason}. Use email sign-in, or enable Anonymous Sign-ins in Supabase.`);
  }
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  // If Supabase failed to initialize (no env config), report "signed out"
  // asynchronously so AuthGate can render the sign-in and setup guidance.
  if (!supabase) {
    const timer = setTimeout(() => callback(null), 0);
    return () => clearTimeout(timer);
  }

  // Bound initial auth hydration in case Supabase's session restore stalls.
  let fired = false;
  const timer = setTimeout(() => {
    if (!fired) {
      fired = true;
      callback(null);
    }
  }, 6000);

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    fired = true;
    clearTimeout(timer);
    callback(session?.user ?? null);
  });

  return () => {
    clearTimeout(timer);
    subscription.unsubscribe();
  };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
