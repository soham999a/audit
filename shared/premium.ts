// Shared credit-pack configuration used by both the client (price display / currency
// detection) and the server (payment-link creation). Kept pure so either side can import it.
export const CREDIT_PACK_PRICE_INR = 49;
export const CREDIT_PACK_SIZE = 10;
export const FREE_AUDITS_PER_MONTH = 2;
export const RAZORPAY_STATIC_LINK = "https://razorpay.me/@matrix9140";

// Amounts are expressed in the currency's minor units (paise / cents / pence),
// which is the format the Razorpay Payment Links API expects.
export const CURRENCIES: Record<string, { amount: number }> = {
  INR: { amount: 4900 }, // ₹49 for 10 credits
  USD: { amount: 59 }, // ~$0.59
  EUR: { amount: 54 }, // ~€0.54
  GBP: { amount: 44 }, // ~£0.44
  AUD: { amount: 83 }, // ~A$0.83
  CAD: { amount: 78 }, // ~C$0.78
  AED: { amount: 270 }, // ~AED 2.70
  SGD: { amount: 78 }, // ~S$0.78
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
