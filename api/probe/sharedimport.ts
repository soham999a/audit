import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createLinkForUser } from "../_shared";
import { fetchPage } from "../_shared";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    probe: "shared-static-import",
    linkRef: typeof createLinkForUser,
    fetchRef: typeof fetchPage,
  });
}