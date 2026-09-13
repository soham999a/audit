import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { App, ServiceAccount } from "firebase-admin";

// Nothing from firebase-admin is loaded at module scope. The Vercel builder
// compiles functions to a single CJS file, and any firebase-admin import that
// crashes at bootstrap turns into Vercel's HTML 500 page (unparseable by the
// client). Everything here is lazy so failures land inside the handler's
// try/catch and come back as a real JSON error message instead.

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

type AdminAppModule = typeof import("firebase-admin/app");
type AdminAuthModule = typeof import("firebase-admin/auth");
type AdminBundle = AdminAppModule & { getAuth: AdminAuthModule["getAuth"] };

let adminPromise: Promise<AdminBundle> | null = null;

async function loadAdmin(): Promise<AdminBundle> {
  if (!adminPromise) {
    adminPromise = (async () => {
      try {
        const [appModule, authModule] = await Promise.all([
          import("firebase-admin/app"),
          import("firebase-admin/auth"),
        ]);
        return { ...appModule, getAuth: authModule.getAuth };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        throw new Error(`Failed to load firebase-admin (${message})`);
      }
    })();
  }
  return adminPromise;
}

function adminApp(admin: AdminBundle): App {
  if (!admin.getApps().length) {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      throw new Error(
        "Firebase is not configured — set FIREBASE_SERVICE_ACCOUNT_B64, FIREBASE_SERVICE_ACCOUNT, or drop firebase-service-account.json in the project root"
      );
    }
    admin.initializeApp({ credential: admin.cert(serviceAccount) });
  }
  return admin.getApps()[0] as App;
}

export async function verifyIdToken(idToken: string): Promise<string> {
  const admin = await loadAdmin();
  const decoded = await admin.getAuth(adminApp(admin)).verifyIdToken(idToken);
  return decoded.uid;
}

export async function setUserPremium(uid: string, premium: boolean): Promise<void> {
  const [admin, firestore] = await Promise.all([
    loadAdmin(),
    import("firebase-admin/firestore"),
  ]);
  await firestore
    .getFirestore(adminApp(admin))
    .collection("users")
    .doc(uid)
    .set({ premium, premiumSince: firestore.Timestamp.now() }, { merge: true });
}