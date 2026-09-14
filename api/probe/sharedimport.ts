import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createLinkForUser } from "../../shared/premiumApi";
import { fetchPage } from "../../shared/fetchPage";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    probe: "shared-static-import",
    linkRef: typeof createLinkForUser,
    fetchRef: typeof fetchPage,
  });
}