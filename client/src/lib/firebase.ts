import { initializeApp, getApps } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, getFirestore, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configured = Object.values(firebaseConfig).every((value) => typeof value === "string" && value.length > 0);

export const app = configured ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export function watchAuth(callback: (user: User | null, status: AuthStatus) => void): () => void {
  if (!auth) {
    callback(null, "signed-out");
    return () => undefined;
  }
  return onAuthStateChanged(auth, (user) => callback(user, user ? "signed-in" : "signed-out"));
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  if (!auth) throw new Error("Authentication is not configured yet");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!auth) throw new Error("Authentication is not configured yet");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error("Authentication is not configured yet");
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export async function signOutCurrentUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export async function getIdToken(): Promise<string | null> {
  if (!auth?.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export type PremiumStatus = { premium: boolean; since?: number };

const NO_PREMIUM: PremiumStatus = { premium: false };

export function watchPremium(uid: string, callback: (status: PremiumStatus) => void): () => void {
  if (!db) {
    callback(NO_PREMIUM);
    return () => undefined;
  }
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) {
      callback(NO_PREMIUM);
      return;
    }
    const data = snapshot.data();
    callback({
      premium: data?.premium === true,
      since: typeof data?.premiumSince?.toMillis === "function" ? data.premiumSince.toMillis() : undefined,
    });
  });
}

export async function fetchPremium(uid: string): Promise<PremiumStatus> {
  if (!db) return NO_PREMIUM;
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return NO_PREMIUM;
  const data = snapshot.data();
  return { premium: data?.premium === true };
}