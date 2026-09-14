import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyIdToken } from "../../shared/firebaseAdmin";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, probe: "import-firebase", ref: typeof verifyIdToken });
}