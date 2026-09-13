import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchPage } from "../shared/fetchPage";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, error: "A valid http(s) URL is required" });
    }
    const page = await fetchPage(url);
    if (!page.ok) {
      return res.status(502).json({ ok: false, error: page.error });
    }
    return res.status(200).json({ ok: true, status: page.status, url: page.finalUrl, html: page.html, truncated: page.truncated });
  } catch (error) {
    console.error("[api/pagefetch]", error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Server error" });
  }
}