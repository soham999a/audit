import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PROBE_CONST } from "./_constant";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, probe: "import-samedir", value: PROBE_CONST });
}