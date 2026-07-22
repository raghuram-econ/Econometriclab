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
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.warn('Firebase anonymous sign-in failed or disabled, falling back to local mock user:', error);
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
  return onAuthStateChanged(auth, callback);
}

export async function signOut() {
  if (!auth) return;
  return auth.signOut();
}
