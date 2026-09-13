import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createLinkForUser } from "../../shared/premiumApi";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ ok: true, probe: "premiumApi-import-null" });
}