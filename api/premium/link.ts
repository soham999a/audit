import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { App, ServiceAccount } from "firebase-admin/app";

const PREMIUM_PRICE_INR = 50;

const CURRENCIES: Record<string, { amount: number }> = {
  INR: { amount: 5000 },
  USD: { amount: 60 },
  EUR: { amount: 55 },
  GBP: { amount: 45 },
  AUD: { amount: 85 },
  CAD: { amount: 80 },
  AED: { amount: 275 },
  SGD: { amount: 80 },
};

const DEFAULT_CURRENCY = "USD";
const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES);

function amountForCurrency(currency: string): { currency: string; amount: number } {
  const entry = CURRENCIES[currency];
  if (entry) {
    return { currency, amount: entry.amount };
  }
  return { currency: DEFAULT_CURRENCY, amount: CURRENCIES[DEFAULT_CURRENCY].amount };
}

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

type CreatedPaymentLink = { id: string; short_url: string; status: string };

async function createPaymentLink(options: {
  amount: number;
  currency: string;
  callbackUrl: string;
  description?: string;
  uid?: string;
}): Promise<CreatedPaymentLink> {
  const response = await fetch(`${API_BASE}/payment_links`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      amount: options.amount,
      currency: options.currency,
      accept_partial: false,
      expire_by: Math.floor(Date.now() / 1000) + 60 * 60,
      reference_id: `mx-${Date.now().toString(36)}`,
      description: options.description ?? "Matrix Website Auditor — Premium unlock",
      callback_url: options.callbackUrl,
      callback_method: "get",
      notes: { purpose: "premium-unlock", uid: options.uid ?? "" },
    }),
  });

  const payload = (await response.json()) as CreatedPaymentLink & RazorpayErrorBody;
  if (!response.ok) {
    throw new Error(payload.error?.description ?? `Razorpay request failed (${response.status})`);
  }
  return payload;
}

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

function isFirebaseMisconfigured(error: unknown): boolean {
  return error instanceof Error && /FIREBASE_SERVICE_ACCOUNT/.test(error.message);
}

async function createLinkForUser(
  idToken: string,
  currencyRaw: string | undefined,
  origin: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  let uid: string;
  try {
    uid = await verifyIdToken(idToken);
  } catch (error) {
    if (isFirebaseMisconfigured(error)) {
      const reason = error.message;
      return { status: 500, body: { ok: false, error: `Payment setup is incomplete (${reason})` } };
    }
    const reason = error instanceof Error ? error.message : "unknown error";
    return { status: 401, body: { ok: false, error: `Authentication required (${reason})` } };
  }

  const currency = (typeof currencyRaw === "string" ? currencyRaw : "INR").toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return { status: 400, body: { ok: false, error: `Unsupported currency "${currency}"` } };
  }

  const { amount } = amountForCurrency(currency);
  const callbackUrl = `${origin}/?premium_payment=1`;

  try {
    const link = await createPaymentLink({
      amount,
      currency,
      callbackUrl,
      uid,
      description: `Matrix Website Auditor — one-time premium unlock (base ${PREMIUM_PRICE_INR} INR)`,
    });
    return {
      status: 200,
      body: { ok: true, id: link.id, short_url: link.short_url, currency, amount, baseInr: PREMIUM_PRICE_INR },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create payment link";
    return { status: 500, body: { ok: false, error: message } };
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

    const origin = (req.headers.origin as string) || `https://${req.headers.host ?? "localhost"}`;
    const result = await createLinkForUser(idToken, req.body?.currency, origin);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[api/premium/link]", error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Server error" });
  }
}