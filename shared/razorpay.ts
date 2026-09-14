import crypto from "node:crypto";

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
