import { lookup } from "node:dns/promises";

// Server-side page fetcher for the audit engine. Browsers cannot read
// arbitrary cross-origin sites (CORS blocks nearly every target), so the
// client asks this endpoint to fetch the page instead. Kept pure and
// shared between the Express server, the Vite dev middleware, and Vercel.

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB cap per page
const FETCH_TIMEOUT_MS = 8_000;

export type FetchedPage =
  | {
      ok: true;
      status: number;
      html: string;
      finalUrl: string;
      truncated: boolean;
    }
  | { ok: false; error: string };

const PRIVATE_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "0:0:0:0:0:0:0:1",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some(b => !Number.isInteger(b) || b < 0 || b > 255)
  )
    return false;
  const [a, b, c] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("0:0:0:0:0:0:0:1") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

async function guardPrivateHost(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host.endsWith(".localhost")) return true;
  if (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan")
  )
    return true;
  let addresses: string[];
  try {
    addresses = (await lookup(host, { all: true })).map(entry => entry.address);
  } catch {
    return true; // unresolvable hosts are not fetched
  }
  return addresses.some(address =>
    address.includes(".") ? isPrivateIpv4(address) : isPrivateIpv6(address)
  );
}

export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return { ok: false, error: "Only http(s) URLs are allowed" };
  }
  if (await guardPrivateHost(target.hostname)) {
    return { ok: false, error: "Private or local addresses are not allowed" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; MatrixAuditor/1.0; +https://audit.matrka.net)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    let html = "";
    let truncated = false;
    const reader = response.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_HTML_BYTES) {
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
    } else {
      // Some runtimes expose .text() but no streaming body.
      const text = await response.text();
      if (text.length > MAX_HTML_BYTES) truncated = true;
      html = text.slice(0, MAX_HTML_BYTES);
    }

    return {
      ok: true,
      status: response.status,
      html,
      finalUrl: response.url || target.toString(),
      truncated,
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: isTimeout
        ? "Fetch timed out"
        : error instanceof Error
          ? error.message
          : "Fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
