import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";
import type { App, ServiceAccount } from "firebase-admin/app";

const FREE_AUDITS_LIMIT = 2;

function loadServiceAccount(): ServiceAccount | null {
  const fromBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (fromBase64) {
    try {
      return JSON.parse(Buffer.from(fromBase64, "base64").toString("utf-8")) as ServiceAccount;
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_B64 is set but is NOT valid base64-encoded service-account JSON (check it on Vercel)"
      );
    }
  }
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    try {
      return JSON.parse(envJson) as ServiceAccount;
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT is set but is NOT valid JSON (check it on Vercel — make sure it is the full service-account JSON on one line)"
      );
    }
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64 || process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT* env var is present but empty");
  }
  throw new Error(
    "Neither FIREBASE_SERVICE_ACCOUNT nor FIREBASE_SERVICE_ACCOUNT_B64 is set on Vercel"
  );
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

async function verifyIdToken(idToken: string): Promise<string> {
  const admin = await loadAdmin();
  const decoded = await admin.getAuth(adminApp(admin)).verifyIdToken(idToken);
  return decoded.uid;
}

async function decrementCredits(uid: string): Promise<{ ok: boolean; remaining: number; type: string }> {
  const [admin, firestore] = await Promise.all([
    loadAdmin(),
    import("firebase-admin/firestore"),
  ]);
  const db = firestore.getFirestore(adminApp(admin));
  const ref = db.collection("users").doc(uid);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    const now = firestore.Timestamp.now();
    let freeUsed = typeof data.freeAuditsUsedThisMonth === "number" ? data.freeAuditsUsedThisMonth : 0;
    let freeResetDate: firestore.Timestamp | null = data.freeAuditResetDate instanceof firestore.Timestamp
      ? data.freeAuditResetDate as firestore.Timestamp
      : null;

    if (!freeResetDate || (now.toMillis() - freeResetDate.toMillis()) > 30 * 24 * 60 * 60 * 1000) {
      freeUsed = 0;
      freeResetDate = now;
    }

    const paidCredits = typeof data.paidCredits === "number" ? data.paidCredits : 0;
    const totalAudits = typeof data.totalAuditsRun === "number" ? data.totalAuditsRun : 0;

    if (paidCredits > 0) {
      tx.set(ref, { paidCredits: paidCredits - 1, totalAuditsRun: totalAudits + 1 }, { merge: true });
      return { ok: true, remaining: paidCredits - 1, type: "paid" };
    }

    if (freeUsed < FREE_AUDITS_LIMIT) {
      tx.set(ref, {
        freeAuditsUsedThisMonth: freeUsed + 1,
        freeAuditResetDate: freeResetDate,
        totalAuditsRun: totalAudits + 1,
      }, { merge: true });
      return { ok: true, remaining: FREE_AUDITS_LIMIT - (freeUsed + 1), type: "free" };
    }

    return { ok: false, remaining: 0, type: "none" };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const authorization = req.headers.authorization ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!idToken) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }

    const uid = await verifyIdToken(idToken);
    const result = await decrementCredits(uid);
    return res.status(result.ok ? 200 : 403).json(result);
  } catch (error) {
    console.error("[api/audit/decrement-credits]", error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Server error" });
  }
}