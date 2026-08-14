import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// signInWithGoogle and signInWithExistingCredential (Firebase OAuth flows)
// were removed here: confirmed zero callers anywhere in the app before this
// migration (guest-only mode has been the sole sign-in path since the
// AuthGate simplification), so there was nothing to port.

export async function signInAsGuest() {
  try {
    // signInAnonymously can hang indefinitely (rather than reject) if the
    // Supabase project's auth backend is unreachable, misconfigured, or has
    // anonymous sign-ins disabled -- race it against a timeout so "Continue
    // as Guest" always resolves within a bounded time instead of getting
    // stuck on "Launching Sandbox..." forever.
    const { data, error } = await Promise.race([
      supabase.auth.signInAnonymously(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('signInAnonymously timed out')), 6000)
      ),
    ]);
    if (error) throw error;
    if (!data.user) throw new Error('signInAnonymously returned no user');
    return data.user;
  } catch (error) {
    console.warn('Supabase anonymous sign-in failed, disabled, or timed out -- falling back to local mock user:', error);
    const mockUser = {
      id: 'guest-scholar',
      email: 'guest@econometricslab.org',
      is_anonymous: true,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: { displayName: 'Guest Scholar' },
      identities: [],
      created_at: new Date().toISOString(),
    } as unknown as User;
    return mockUser;
  }
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  // If Supabase failed to initialize (no env config), report "signed out"
  // asynchronously so the app still hydrates and the guest flow works.
  if (!supabase) {
    const timer = setTimeout(() => callback(null), 0);
    return () => clearTimeout(timer);
  }

  // onAuthStateChange's first callback can hang indefinitely if Supabase's
  // persistence-layer check (localStorage/session restore) never resolves --
  // the same class of issue signInAnonymously has, but with no existing
  // fallback at all, so the app's `isHydrated` flag would never flip and
  // even a successful guest-mode sign-in downstream could never render past
  // the auth gate. Force a "signed out" callback after a timeout if Supabase
  // hasn't reported anything yet; if the real callback fires later, let it
  // through too (harmless -- it just updates state again).
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

// Supabase has no per-user getIdToken() like Firebase; the current access
// token lives on the session instead. apiClient.ts uses this to build the
// Authorization header sent to server.ts's authMiddleware.
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
