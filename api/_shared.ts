import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { App, ServiceAccount } from "firebase-admin";

// Self-contained copy of the shared server logic used by the API functions.
// Lives inside api/ (prefix "_" so Vercel does not route it) because Vercel's
// function builder does not reliably bundle code imported from outside the
// api/ tree via ../../shared/* relative paths on the Hobby plan runtime.

export const PREMIUM_PRICE_INR = 50;
export const RAZORPAY_STATIC_LINK = "https://razorpay.me/@matrix9140";
export const PREMIUM_STORAGE_KEY = "mx_premium_unlocked";

export const CURRENCIES: Record<string, { amount: number }> = {
  INR: { amount: 5000 },
  USD: { amount: 60 },
  EUR: { amount: 55 },
  GBP: { amount: 45 },
  AUD: { amount: 85 },
  CAD: { amount: 80 },
  AED: { amount: 275 },
  SGD: { amount: 80 },
};

export const DEFAULT_CURRENCY = "USD";
export const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES);

export function amountForCurrency(currency: string): { currency: string; amount: number } {
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

export type CreatedPaymentLink = { id: string; short_url: string; status: string };

export async function createPaymentLink(options: {
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

export async function getPaymentLink(paymentLinkId: string): Promise<{
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

export async function isPaymentLinkPaid(paymentLinkId: string): Promise<boolean> {
  const link = await getPaymentLink(paymentLinkId);
  return link.status === "paid";
}

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.replace(/^v1_/, "");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
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

type ApiResult = { status: number; body: Record<string, unknown> };

function isFirebaseMisconfigured(error: unknown): boolean {
  return error instanceof Error && /FIREBASE_SERVICE_ACCOUNT/.test(error.message);
}

export async function createLinkForUser(
  idToken: string,
  currencyRaw: string | undefined,
  origin: string
): Promise<ApiResult> {
  let uid: string;
  try {
    uid = await verifyIdToken(idToken);
  } catch (error) {
    if (isFirebaseMisconfigured(error)) {
      return { status: 500, body: { ok: false, error: "Payment setup is incomplete — FIREBASE_SERVICE_ACCOUNT is missing on the server." } };
    }
    return { status: 401, body: { ok: false, error: "Authentication required" } };
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

export async function verifyAndUnlock(idToken: string, rawId: string | undefined): Promise<ApiResult> {
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

export async function unlockUserByUid(uid: string | undefined): Promise<void> {
  if (!uid) {
    throw new Error("Missing uid in payment link notes");
  }
  await setUserPremium(uid, true);
}

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;

export type FetchedPage =
  | { ok: true; status: number; html: string; finalUrl: string; truncated: boolean }
  | { ok: false; error: string };

const PRIVATE_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "0:0:0:0:0:0:0:1"]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("0:0:0:0:0:0:0:1") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

async function isPrivateHost(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  let addresses: string[];
  try {
    addresses = (await lookup(host, { all: true })).map((entry) => entry.address);
  } catch {
    return true;
  }
  return addresses.some((address) =>
    address.includes(".") ? isPrivateIpv4(address) : isPrivateIpv6(address)
  );
}

function requestPage(
  urlString: string,
  redirectsLeft: number
): Promise<{ status: number; html: string; finalUrl: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(urlString);
    } catch (error) {
      return reject(error);
    }
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      target,
      {
        method: "GET",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; MatrixAuditor/1.0; +https://audit.matrka.net)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            return reject(new Error("Too many redirects"));
          }
          const location = res.headers.location;
          const nextUrl = new URL(location, target).toString();
          req.destroy();
          return requestPage(nextUrl, redirectsLeft - 1).then(resolve, reject);
        }
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_HTML_BYTES) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            html: Buffer.concat(chunks).toString("utf-8"),
            finalUrl: res.url || target.toString(),
            truncated,
          });
        });
        res.on("error", (error) => reject(error));
      }
    );
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error("Fetch timed out")));
    req.on("error", (error) => reject(error));
    req.end();
  });
}

export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return { ok: false, error: "Only http(s) URLs are allowed" };
  }
  try {
    if (await isPrivateHost(target.hostname)) {
      return { ok: false, error: "Private or local addresses are not allowed" };
    }
    const page = await requestPage(target.toString(), MAX_REDIRECTS);
    return { ok: true, status: page.status, html: page.html, finalUrl: page.finalUrl, truncated: page.truncated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return { ok: false, error: message.replace(/^Fetch failed: /, "") };
  }
}