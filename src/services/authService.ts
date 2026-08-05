import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged,
  User,
  signInWithCredential,
  AuthCredential,
  signInAnonymously
} from 'firebase/auth';
import { auth } from '../lib/firebase';

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error: any) {
    if (error?.code !== 'auth/popup-closed-by-user') {
      console.error('Google sign-in failed:', error);
    }
    throw error;
  }
}

export async function signInAsGuest() {
  try {
    // signInAnonymously can hang indefinitely (rather than reject) if the
    // Firebase project's auth/Firestore backend is unreachable or
    // misconfigured -- race it against a timeout so "Continue as Guest"
    // always resolves within a bounded time instead of getting stuck on
    // "Launching Sandbox..." forever.
    const result = await Promise.race([
      signInAnonymously(auth),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('signInAnonymously timed out')), 6000)
      ),
    ]);
    return result.user;
  } catch (error) {
    console.warn('Firebase anonymous sign-in failed, disabled, or timed out -- falling back to local mock user:', error);
    const mockUser = {
      uid: 'guest-scholar',
      email: 'guest@econometricslab.org',
      displayName: 'Guest Scholar',
      isAnonymous: true,
      emailVerified: false,
      metadata: {},
      providerData: [],
      refreshToken: '',
      tenantId: null,
      delete: async () => {},
      getIdToken: async () => 'mock-token',
      getIdTokenResult: async () => ({ token: 'mock-token', claims: {}, authTime: '', expirationTime: '', signInProvider: 'anonymous' }),
      reload: async () => {},
      toJSON: () => ({})
    } as unknown as User;
    return mockUser;
  }
}

export async function signInWithExistingCredential(credential: AuthCredential) {
  try {
    const result = await signInWithCredential(auth, credential);
    return result.user;
  } catch (error) {
    console.error('Sign in with existing credential failed:', error);
    throw error;
  }
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  // If Firebase failed to initialize (no env config), report "signed out"
  // asynchronously so the app still hydrates and the guest flow works.
  if (!auth) {
    const timer = setTimeout(() => callback(null), 0);
    return () => clearTimeout(timer);
  }

  // onAuthStateChanged's first callback can hang indefinitely if Firebase's
  // persistence-layer check (IndexedDB) never resolves -- the same class of
  // issue signInAnonymously has, but with no existing fallback at all, so
  // the app's `isHydrated` flag would never flip and even a successful
  // guest-mode sign-in downstream could never render past the auth gate.
  // Force a "signed out" callback after a timeout if Firebase hasn't
  // reported anything yet; if the real callback fires later, let it through
  // too (harmless -- it just updates state again).
  let fired = false;
  const timer = setTimeout(() => {
    if (!fired) {
      fired = true;
      callback(null);
    }
  }, 6000);

  const unsubscribe = onAuthStateChanged(auth, (user) => {
    fired = true;
    clearTimeout(timer);
    callback(user);
  });

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

export async function signOut() {
  if (!auth) return;
  return auth.signOut();
}
