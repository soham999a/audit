import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // Lazy import so this function only touches firebase-admin after it's a
    // valid request. Any bootstrap/search-path issue then becomes a catchable
    // JSON error instead of Vercel's HTML "FUNCTION_INVOCATION_FAILED" page.
    const { createLinkForUser } = await import("../../shared/premiumApi");

    const authorization = req.headers.authorization ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!idToken) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }

    const origin = (req.headers.origin as string) || `https://${req.headers.host ?? "localhost"}`;
    const result = await createLinkForUser(idToken, req.body?.currency, origin);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[api/premium/link]", error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Server error" });
  }
}