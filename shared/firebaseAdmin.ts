import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { App, ServiceAccount } from "firebase-admin/app";
import type { Timestamp } from "firebase-admin/firestore";

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

export async function grantCredits(uid: string, credits: number): Promise<void> {
  const [admin, firestore] = await Promise.all([
    loadAdmin(),
    import("firebase-admin/firestore"),
  ]);
  const db = firestore.getFirestore(adminApp(admin));
  const ref = db.collection("users").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const current = typeof data.paidCredits === "number" ? data.paidCredits : 0;
    tx.set(ref, { paidCredits: current + credits }, { merge: true });
  });
}

export async function decrementCredits(uid: string): Promise<{ ok: boolean; remaining: number; type: "free" | "paid" | "none" }> {
  const [admin, firestore] = await Promise.all([
    loadAdmin(),
    import("firebase-admin/firestore"),
  ]);
  const db = firestore.getFirestore(adminApp(admin));
  const ref = db.collection("users").doc(uid);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    // Check and handle monthly free reset
    const now = firestore.Timestamp.now();
    let freeUsed = typeof data.freeAuditsUsedThisMonth === "number" ? data.freeAuditsUsedThisMonth : 0;
    let freeResetDate: Timestamp | null = data.freeAuditResetDate instanceof firestore.Timestamp
      ? data.freeAuditResetDate as Timestamp
      : null;

    if (!freeResetDate || (now.toMillis() - freeResetDate.toMillis()) > 30 * 24 * 60 * 60 * 1000) {
      freeUsed = 0;
      freeResetDate = now;
    }

    const paidCredits = typeof data.paidCredits === "number" ? data.paidCredits : 0;
    const totalAudits = typeof data.totalAuditsRun === "number" ? data.totalAuditsRun : 0;

    if (paidCredits > 0) {
      tx.set(ref, { paidCredits: paidCredits - 1, totalAuditsRun: totalAudits + 1 }, { merge: true });
      return { ok: true, remaining: paidCredits - 1, type: "paid" as const };
    }

    if (freeUsed < 2) {
      tx.set(ref, {
        freeAuditsUsedThisMonth: freeUsed + 1,
        freeAuditResetDate: freeResetDate,
        totalAuditsRun: totalAudits + 1,
      }, { merge: true });
      return { ok: true, remaining: 2 - (freeUsed + 1), type: "free" as const };
    }

    return { ok: false, remaining: 0, type: "none" as const };
  });
}

export async function getUserCredits(uid: string): Promise<{
  freeUsed: number;
  freeRemaining: number;
  paidCredits: number;
  totalAuditsRun: number;
}> {
  const [admin, firestore] = await Promise.all([
    loadAdmin(),
    import("firebase-admin/firestore"),
  ]);
  const db = firestore.getFirestore(adminApp(admin));
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    return { freeUsed: 0, freeRemaining: 2, paidCredits: 0, totalAuditsRun: 0 };
  }
  const data = snap.data() as Record<string, unknown>;
  const now = firestore.Timestamp.now();
  let freeUsed = typeof data.freeAuditsUsedThisMonth === "number" ? data.freeAuditsUsedThisMonth : 0;
  let freeResetDate: Timestamp | null = data.freeAuditResetDate instanceof firestore.Timestamp
    ? data.freeAuditResetDate as Timestamp
    : null;

  if (!freeResetDate || (now.toMillis() - freeResetDate.toMillis()) > 30 * 24 * 60 * 60 * 1000) {
    freeUsed = 0;
  }

  const paidCredits = typeof data.paidCredits === "number" ? data.paidCredits : 0;
  const totalAuditsRun = typeof data.totalAuditsRun === "number" ? data.totalAuditsRun : 0;

  return {
    freeUsed,
    freeRemaining: Math.max(0, 2 - freeUsed),
    paidCredits,
    totalAuditsRun,
  };
}
