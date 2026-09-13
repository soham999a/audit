import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { ServiceAccount } from "firebase-admin";

function loadServiceAccount(): ServiceAccount | null {
  const fromBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (fromBase64) {
    try {
      return JSON.parse(Buffer.from(fromBase64, "base64").toString("utf-8")) as ServiceAccount;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_B64 is not a base64-encoded service-account JSON");
    }
  }
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    try {
      return JSON.parse(envJson) as ServiceAccount;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT in env is not valid JSON");
    }
  }
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "firebase-service-account.json"),
    ...findAdminSdkJson(cwd),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return JSON.parse(readFileSync(candidate, "utf-8")) as ServiceAccount;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function findAdminSdkJson(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => /firebase-adminsdk.*\.json$/.test(name))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function adminApp(): App {
  if (!getApps().length) {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      throw new Error(
        "Firebase is not configured — set FIREBASE_SERVICE_ACCOUNT in .env or drop firebase-service-account.json in the project root"
      );
    }
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getApps()[0] as App;
}

export async function verifyIdToken(idToken: string): Promise<string> {
  const decoded = await getAuth(adminApp()).verifyIdToken(idToken);
  return decoded.uid;
}

export async function setUserPremium(uid: string, premium: boolean): Promise<void> {
  await getFirestore(adminApp())
    .collection("users")
    .doc(uid)
    .set({ premium, premiumSince: Timestamp.now() }, { merge: true });
}