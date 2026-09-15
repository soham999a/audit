import { CREDIT_PACK_SIZE, CREDIT_PACK_PRICE_INR, CURRENCIES, DEFAULT_CURRENCY } from "@shared/premium";

export function detectLocalCurrency(): string {
  const language = navigator.language || "en-US";
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    /* fall through to language hints */
  }
  const tz = timezone.toLowerCase();
  const normalizedLang = language.toLowerCase();

  if (tz.includes("kolkata") || normalizedLang === "hi-in" || normalizedLang === "en-in") return "INR";
  if (tz.startsWith("europe/") && ["london", "dublin", "guernsey", "isle_of_man", "jersey"].some((zone) => tz === `europe/${zone}`)) return "GBP";
  if (tz.startsWith("australia/")) return "AUD";
  if (tz.includes("dubai")) return "AED";
  if (tz.startsWith("asia/singapore")) return "SGD";
  if (tz.startsWith("europe/")) return "EUR";
  if (normalizedLang === "en-ca") return "CAD";
  return DEFAULT_CURRENCY;
}

export function formatCurrency(
  currency: string,
  amount: number,
  locale: string = navigator.language || "en-IN"
): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}

export function priceLabelFor(currency: string, locale?: string): string {
  const entry = CURRENCIES[currency] ?? CURRENCIES[DEFAULT_CURRENCY];
  if (currency === "INR") return `₹${CREDIT_PACK_PRICE_INR}`;
  return formatCurrency(currency, entry.amount, locale);
}

export function baseInrLabel(currency: string, locale?: string): string {
  if (currency === "INR") return `₹${CREDIT_PACK_PRICE_INR}`;
  const entry = CURRENCIES[currency] ?? CURRENCIES[DEFAULT_CURRENCY];
  return `≈ ${formatCurrency(currency, entry.amount, locale)} (₹${CREDIT_PACK_PRICE_INR} base)`;
}

export function creditPackLabel(): string {
  return `${CREDIT_PACK_SIZE} audit credits`;
}

export type PaymentLinkResponse = {
  ok: boolean;
  id?: string;
  short_url?: string;
  currency?: string;
  amount?: number;
  baseInr?: number;
  error?: string;
};

async function parseApiResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`The server returned an unexpected response (HTTP ${response.status}).`);
  }
}

export async function createRazorpayCheckout(idToken: string, currency: string): Promise<PaymentLinkResponse> {
  const response = await fetch("/api/premium/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ currency }),
  });
  return (await parseApiResponse(response)) as PaymentLinkResponse;
}

export async function verifyAndUnlockPremium(idToken: string, paymentLinkId: string): Promise<boolean> {
  const response = await fetch("/api/premium/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ payment_link_id: paymentLinkId }),
  });
  const payload = (await parseApiResponse(response)) as { ok?: boolean; paid?: boolean; premium?: boolean; error?: string };
  if (!response.ok && payload.error) {
    throw new Error(payload.error);
  }
  if (!response.ok) {
    throw new Error(`Payment verification failed (HTTP ${response.status}).`);
  }
  return payload.ok === true && payload.paid === true;
}