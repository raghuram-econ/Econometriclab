/// <reference types="vite/client" />

import { initializeApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';

// A syntactically valid (but non-functional) key so the Firebase SDK can
// initialize without throwing `auth/invalid-api-key` at module scope when no
// environment is configured. Without this, the entire module graph fails
// before React mounts and the user sees a silent blank page.
// Every network call made with this key fails, which the app already handles:
// guest mode falls back to a local mock user (see services/authService.ts).
const LOCAL_DEV_PLACEHOLDER_KEY = 'AIzaSyDU•••••••••••••••••••••••••••••••';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || LOCAL_DEV_PLACEHOLDER_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "think-like-a-economist.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "think-like-a-economist",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:1234567890abcdef",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "think-like-a-economist.appspot.com",
};

if (!import.meta.env.VITE_FIREBASE_API_KEY) {
  console.warn("Firebase configuration environment variables are missing. Using local dev placeholder values — cloud auth/sync will be unavailable, but guest mode works fully offline. Configure VITE_FIREBASE_* environment variables to enable persistent authentication and syncing.");
}

// Initialization must never take down the whole app. If Firebase cannot
// initialize, we export undefined handles; consumers (authService,
// persistenceService) guard against this and degrade to local guest mode.
let dbInstance: Firestore | undefined;
let authInstance: Auth | undefined;

try {
  const app = initializeApp(firebaseConfig);
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true
  }, import.meta.env.VITE_FIREBASE_DATABASE_ID || "(default)");
  authInstance = getAuth(app);
} catch (error) {
  console.error("Firebase initialization failed — cloud auth/sync disabled. Guest mode remains available.", error);
}

export const db = dbInstance as Firestore;
export const auth = authInstance as Auth;

// Connectivity check
async function testConnection() {
  if (!dbInstance) return;
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or internet connection.");
    }
  }
}
testConnection();
