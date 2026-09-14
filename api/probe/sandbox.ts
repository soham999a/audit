import https from "node:https";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Step = { name: string; ok: boolean; detail?: unknown; error?: string };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const steps: Step[] = [];
  const t0 = Date.now();

  try {
    steps.push({
      name: "runtime",
      ok: true,
      detail: { node: process.version, arch: process.arch, platform: process.platform, cwd: process.cwd() },
    });
  } catch (error) {
    steps.push({ name: "runtime", ok: false, error: String(error) });
  }

  try {
    const names = Object.keys(process.env)
      .filter((k) => /RAZORPAY|FIREBASE|VITE_/i.test(k))
      .sort();
    steps.push({ name: "env", ok: true, detail: { names, count: names.length } });
  } catch (error) {
    steps.push({ name: "env", ok: false, error: String(error) });
  }

  try {
    const response = await fetch("https://example.com/", { signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    steps.push({ name: "global-fetch", ok: true, detail: { status: response.status, len: text.length, ms: Date.now() - t0 } });
  } catch (error) {
    steps.push({ name: "global-fetch", ok: false, error: error instanceof Error ? `${error.name}:${error.message}` : String(error) });
  }

  try {
    const result = await new Promise<{ status: number; len: number }>((resolve, reject) => {
      const req = https.get("https://example.com/", (response) => {
        let len = 0;
        response.on("data", (chunk: Buffer) => {
          len += chunk.length;
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, len }));
        response.on("error", reject);
      });
      req.setTimeout(8000, () => req.destroy(new Error("timeout")));
      req.on("error", reject);
    });
    steps.push({ name: "node-https", ok: true, detail: { ...result, ms: Date.now() - t0 } });
  } catch (error) {
    steps.push({ name: "node-https", ok: false, error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const s0 = Date.now();
    const mod = await import("firebase-admin/app");
    steps.push({ name: "firebase-admin-dynamic-import", ok: true, detail: { ms: Date.now() - s0, keys: Object.keys(mod).length } });
  } catch (error) {
    steps.push({ name: "firebase-admin-dynamic-import", ok: false, error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const r8 = await import("node:crypto").then((m) => typeof m.createHmac);
    steps.push({ name: "node-crypto", ok: true, detail: { createHmac: r8 } });
  } catch (error) {
    steps.push({ name: "node-crypto", ok: false, error: String(error) });
  }

  try {
    return res.status(200).json({ ok: true, probe: "sandbox", steps, totalMs: Date.now() - t0 });
  } catch (error) {
    try {
      return res.status(500).json({ ok: false, error: String(error) });
    } catch {
      return res.status(500).end();
    }
  }
}