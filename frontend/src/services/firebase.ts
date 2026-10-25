// Firebase client initialization — driven entirely by environment variables.
// If the required vars are absent, Firebase stays disabled and the app runs in
// anonymous mode (the backend must then have REQUIRE_AUTH=false).
//
// NOTE: the Firebase web apiKey is a public project identifier, not a secret.
// It is safe in the browser; real protection comes from Firestore rules +
// backend token verification. We still read it from env so dev/prod differ.
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (firebaseEnabled) {
  app = initializeApp(config);
  auth = getAuth(app);
}

export function getAuthInstance(): Auth | null {
  return auth;
}

export async function signInWithGoogle(): Promise<User | null> {
  if (!auth) return null;
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOut(): Promise<void> {
  if (!auth) return;
  await fbSignOut(auth);
}

export function subscribeToAuth(cb: (user: User | null) => void): () => void {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

/** Returns a fresh ID token for the current user, or null if signed out. */
export async function getIdToken(): Promise<string | null> {
  if (!auth || !auth.currentUser) return null;
  return auth.currentUser.getIdToken(/* forceRefresh */ false);
}
