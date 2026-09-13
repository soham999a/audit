import { amountForCurrency, PREMIUM_PRICE_INR, SUPPORTED_CURRENCIES } from "./premium";
import { createPaymentLink, isPaymentLinkPaid } from "./razorpay";
import { setUserPremium, verifyIdToken } from "./firebaseAdmin";

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

// Used by the Razorpay webhook: the payment is already server-confirmed by
// Razorpay's signature, so we can grant premium directly to the link's owner.
export async function unlockUserByUid(uid: string | undefined): Promise<void> {
  if (!uid) {
    throw new Error("Missing uid in payment link notes");
  }
  await setUserPremium(uid, true);
}