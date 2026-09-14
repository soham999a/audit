import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { App, ServiceAccount } from "firebase-admin";

const API_BASE = "https://api.razorpay.com/v1";

function authHeaders(): Record<string, string> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)");
  }
  return {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

type RazorpayErrorBody = { error?: { description?: string; field?: string } };

async function getPaymentLink(paymentLinkId: string): Promise<{
  id: string;
  status: string;
  amount?: number;
  currency?: string;
}> {
  const response = await fetch(`${API_BASE}/payment_links/${paymentLinkId}`, {
    headers: authHeaders(),
  });
  const payload = (await response.json()) as Record<string, unknown> & RazorpayErrorBody;
  if (!response.ok) {
    throw new Error(payload.error?.description ?? `Razorpay request failed (${response.status})`);
  }
  return payload as unknown as { id: string; status: string; amount?: number; currency?: string };
}

async function isPaymentLinkPaid(paymentLinkId: string): Promise<boolean> {
  const link = await getPaymentLink(paymentLinkId);
  return link.status === "paid";
}

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

async function verifyIdToken(idToken: string): Promise<string> {
  const admin = await loadAdmin();
  const decoded = await admin.getAuth(adminApp(admin)).verifyIdToken(idToken);
  return decoded.uid;
}

async function setUserPremium(uid: string, premium: boolean): Promise<void> {
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

function isFirebaseMisconfigured(error: unknown): boolean {
  return error instanceof Error && /FIREBASE_SERVICE_ACCOUNT/.test(error.message);
}

async function verifyAndUnlock(
  idToken: string,
  rawId: string | undefined
): Promise<{ status: number; body: Record<string, unknown> }> {
  const paymentLinkId = (typeof rawId === "string" ? rawId : "").trim();
  if (!/^pl_[A-Za-z0-9]+$/.test(paymentLinkId)) {
    return { status: 400, body: { ok: false, error: "Missing or invalid payment_link_id" } };
  }

  let uid: string;
  try {
    uid = await verifyIdToken(idToken);
  } catch (error) {
    if (isFirebaseMisconfigured(error)) {
      return { status: 500, body: { ok: false, error: "Payment setup is incomplete — FIREBASE_SERVICE_ACCOUNT is missing on the server." } };
    }
    return { status: 401, body: { ok: false, error: "Authentication required" } };
  }

  try {
    const paid = await isPaymentLinkPaid(paymentLinkId);
    if (paid) {
      await setUserPremium(uid, true);
    }
    return { status: 200, body: { ok: true, paid, premium: paid } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";
    return { status: 502, body: { ok: false, error: message } };
  }
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

    const result = await verifyAndUnlock(idToken, req.body?.payment_link_id);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[api/premium/verify]", error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Server error" });
  }
}