import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchPage } from "../shared/fetchPage";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ ok: true, probe: "top-early-import-fetchpage" });
}