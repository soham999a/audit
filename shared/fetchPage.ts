import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";

// Server-side page fetcher for the audit engine. Browsers cannot read
// arbitrary cross-origin sites (CORS blocks nearly every target), so the
// client asks this endpoint to fetch the page instead. Uses Node's http/https
// modules (not the global fetch) for reliable egress + hard timeouts on all
// runtimes. Kept pure and shared between the Express server, the Vite dev
// middleware, and Vercel.

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB cap per page
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;

export type FetchedPage =
  | { ok: true; status: number; html: string; finalUrl: string; truncated: boolean }
  | { ok: false; error: string };

const PRIVATE_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "0:0:0:0:0:0:0:1"]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
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

async function isPrivateHost(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  let addresses: string[];
  try {
    addresses = (await lookup(host, { all: true })).map((entry) => entry.address);
  } catch {
    return true;
  }
  return addresses.some((address) =>
    address.includes(".") ? isPrivateIpv4(address) : isPrivateIpv6(address)
  );
}

function requestPage(
  urlString: string,
  redirectsLeft: number
): Promise<{ status: number; html: string; finalUrl: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(urlString);
    } catch (error) {
      return reject(error);
    }
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      target,
      {
        method: "GET",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; MatrixAuditor/1.0; +https://audit.matrka.net)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            return reject(new Error("Too many redirects"));
          }
          const location = res.headers.location;
          const nextUrl = new URL(location, target).toString();
          req.destroy();
          return requestPage(nextUrl, redirectsLeft - 1).then(resolve, reject);
        }
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_HTML_BYTES) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            html: Buffer.concat(chunks).toString("utf-8"),
            finalUrl: res.url || target.toString(),
            truncated,
          });
        });
        res.on("error", (error) => reject(error));
      }
    );
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error("Fetch timed out")));
    req.on("error", (error) => reject(error));
    req.end();
  });
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
  try {
    if (await isPrivateHost(target.hostname)) {
      return { ok: false, error: "Private or local addresses are not allowed" };
    }
    const page = await requestPage(target.toString(), MAX_REDIRECTS);
    return { ok: true, status: page.status, html: page.html, finalUrl: page.finalUrl, truncated: page.truncated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return { ok: false, error: message.replace(/^Fetch failed: /, "") };
  }
}