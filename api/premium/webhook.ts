import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import type { App, ServiceAccount } from "firebase-admin/app";

export const config = { api: { bodyParser: false } };

type RazorpayWebhookPayload = {
  entity?: {
    event?: string;
    payload?: {
      payment_link?: {
        entity?: string;
        id?: string;
        notes?: { uid?: string };
      };
    };
  };
};

function verifyWebhookSignature(
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

async function unlockUserByUid(uid: string | undefined): Promise<void> {
  if (!uid) {
    throw new Error("Missing uid in payment link notes");
  }
  await setUserPremium(uid, true);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const rawBody = Buffer.concat(chunks);
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret || !verifyWebhookSignature(rawBody, signature, secret)) {
      return res.status(400).json({ ok: false, error: "Invalid signature" });
    }

    const event = JSON.parse(rawBody.toString("utf-8")) as RazorpayWebhookPayload;
    const eventName = event?.entity?.event ?? "";
    const paymentLink = event?.entity?.payload?.payment_link;
    const uid = paymentLink?.notes?.uid;

    if (eventName === "payment_link.paid") {
      if (uid) {
        try {
          await unlockUserByUid(uid);
        } catch (error) {
          console.error("[razorpay webhook] could not grant premium", error);
          return res.status(500).json({ ok: false, error: "Grant failed" });
        }
      }
      console.log(`[razorpay webhook] ${eventName} · ${paymentLink?.id ?? "unknown"} · uid ${uid ?? "none"}`);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[api/premium/webhook]", error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Server error" });
  }
}