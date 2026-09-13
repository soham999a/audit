import type { VercelRequest, VercelResponse } from "@vercel/node";
import { lookup } from "node:dns/promises";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const addresses = await lookup("example.com", { all: true });
  return res.status(200).json({ ok: true, probe: "node-builtin", addresses: addresses.length });
}