import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  return res.status(200).json({ ok: true, probe: "audit-dir-method-and-body", url });
}