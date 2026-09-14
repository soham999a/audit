import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchPage } from "../../shared/fetchPage";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, probe: "import-fetchPage", ref: typeof fetchPage });
}