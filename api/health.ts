import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res
    .status(200)
    .json({ ok: true, message: "Vercel API functions are working", version: "2026-09-13-lazy" });
}