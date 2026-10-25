// Thin indirection layer between the auth hook and the Firebase client.
// Keeps the hook free of a hard Firebase import and lets the API client's
// token provider be wired without a circular dependency.
import { setTokenProvider } from "./api";

export {
  firebaseEnabled,
  getIdToken,
  signInWithGoogle,
  signOut,
  subscribeToAuth,
} from "./firebase";

export function setTokenProviderBridge(fn: () => Promise<string | null>): void {
  setTokenProvider(fn);
}
