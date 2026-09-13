import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchPage } from "../../shared/fetchPage";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const page = await fetchPage("https://example.com/");
  return res.status(200).json({ ok: true, probe: "fetchPage-execution", status: page.ok ? page.status : -1, error: page.ok ? undefined : page.error });
}