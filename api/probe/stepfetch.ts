import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const out: Record<string, string> = {};
  let done = false;
  const watchdog = setTimeout(() => {
    if (done) return;
    try {
      res.status(504).json({ ok: false, watchdog: out });
    } catch {
      /* ignore */
    }
  }, 8000);

  try {
    out.step0 = new URL("https://example.com/") ? "ok" : "bad";
  } catch (error) {
    out.step0 = "THREW " + String(error);
  }

  try {
    out.step1 = `globals ${typeof AbortController}/${typeof fetch}/${typeof TextDecoder}/${typeof Buffer}`;
  } catch (error) {
    out.step1 = "THREW " + String(error);
  }

  try {
    const t0 = Date.now();
    const response = await fetch("https://example.com/", { redirect: "follow" });
    out.step2 = `plain-fetch status=${response.status} ms=${Date.now() - t0} bodyType=${typeof response.body}`;
  } catch (error) {
    out.step2 = "THREW " + String(error);
  }

  try {
    const controller = new AbortController();
    const t0 = Date.now();
    const response = await fetch("https://example.com/", {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; MatrixAuditor/1.0)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    out.step3 = `headers+text length=${text.length} ms=${Date.now() - t0}`;
    controller.abort();
  } catch (error) {
    out.step3 = "THREW " + String(error);
  }

  try {
    const response = await fetch("https://example.com/", { redirect: "follow" });
    const reader = response.body?.getReader?.();
    if (!reader) {
      out.step4 = "no reader";
    } else {
      const { value } = await reader.read();
      out.step4 = `reader first chunk bytes=${value?.byteLength ?? 0}`;
    }
  } catch (error) {
    out.step4 = "THREW " + String(error);
  }

  done = true;
  clearTimeout(watchdog);
  try {
    return res.status(200).json({ ok: true, probe: "stepfetch", ...out });
  } catch (error) {
    try {
      return res.status(500).json({ ok: false, error: String(error) });
    } catch {
      return res.status(500).end();
    }
  }
}