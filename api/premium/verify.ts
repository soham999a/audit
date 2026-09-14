import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAndUnlock } from "../_shared";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const authorization = req.headers.authorization ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!idToken) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }

    const result = await verifyAndUnlock(idToken, req.body?.payment_link_id);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[api/premium/verify]", error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Server error" });
  }
}