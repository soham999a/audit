// Shared premium-plan configuration used by both the client (price display / currency
// detection) and the server (payment-link creation). Kept pure so either side can import it.
export const PREMIUM_PRICE_INR = 50;
export const RAZORPAY_STATIC_LINK = "https://razorpay.me/@matrix9140";
export const PREMIUM_STORAGE_KEY = "mx_premium_unlocked";

// Amounts are expressed in the currency's minor units (paise / cents / pence),
// which is the format the Razorpay Payment Links API expects.
export const CURRENCIES: Record<string, { amount: number }> = {
  INR: { amount: 5000 }, // ₹50 base price
  USD: { amount: 60 }, // ~$0.60
  EUR: { amount: 55 }, // ~€0.55
  GBP: { amount: 45 }, // ~£0.45
  AUD: { amount: 85 }, // ~A$0.85
  CAD: { amount: 80 }, // ~C$0.80
  AED: { amount: 275 }, // ~AED 2.75
  SGD: { amount: 80 }, // ~S$0.80
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
