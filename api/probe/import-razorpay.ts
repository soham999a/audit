import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyWebhookSignature } from "../../shared/razorpay";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, probe: "import-razorpay", ref: typeof verifyWebhookSignature });
}