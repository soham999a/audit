import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";
import { verifyWebhookSignature, unlockUserByUid } from "../_shared";

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