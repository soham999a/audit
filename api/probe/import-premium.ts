import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PREMIUM_PRICE_INR } from "../../shared/premium";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, probe: "import-premium", price: PREMIUM_PRICE_INR });
}