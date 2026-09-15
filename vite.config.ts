// Load .env for /api dev middleware (Razorpay + Firebase Admin keys live in .env only).
import "dotenv/config";
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import {
  createLinkForUser,
  unlockUserByUid,
  verifyAndUnlock,
} from "./shared/premiumApi";
import { fetchPage } from "./shared/fetchPage";
import { verifyWebhookSignature } from "./shared/razorpay";
import { decrementCredits, verifyIdToken } from "./shared/firebaseAdmin";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map(entry => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

// Vite dev middleware serving /api/* so premium payment works in `pnpm dev`
// without a second process. Mirrors server/index.ts and the Vercel api/ functions.
function viteApiMiddleware(): Plugin {
  return {
    name: "matrix-api-middleware",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const route = new URL(req.url, "http://localhost").pathname.replace(
          /\/+$/,
          ""
        );
        try {
          if (req.method === "POST" && route === "/api/audit/fetch") {
            const raw = await readRawBody(req);
            let body: Record<string, unknown> = {};
            try {
              body = raw.length ? JSON.parse(raw.toString("utf-8")) : {};
            } catch {
              /* empty body */
            }
            const url = typeof body.url === "string" ? body.url.trim() : "";
            if (!/^https?:\/\//i.test(url)) {
              sendJson(res, 400, {
                ok: false,
                error: "A valid http(s) URL is required",
              });
              return;
            }
            const page = await fetchPage(url);
            if (!page.ok) {
              sendJson(res, 502, { ok: false, error: page.error });
              return;
            }
            sendJson(res, 200, {
              ok: true,
              status: page.status,
              url: page.finalUrl,
              html: page.html,
              truncated: page.truncated,
            });
            return;
          }
          if (
            req.method === "POST" &&
            (route === "/api/premium/link" || route === "/api/premium/verify")
          ) {
            const raw = await readRawBody(req);
            let body: Record<string, unknown> = {};
            try {
              body = raw.length ? JSON.parse(raw.toString("utf-8")) : {};
            } catch {
              /* empty body */
            }
            const authorization = req.headers.authorization ?? "";
            const idToken = authorization.startsWith("Bearer ")
              ? authorization.slice("Bearer ".length)
              : "";
            if (!idToken) {
              sendJson(res, 401, {
                ok: false,
                error: "Authentication required",
              });
              return;
            }
            const origin =
              req.headers.origin ||
              `https://${req.headers.host || "localhost"}`;
            const result =
              route === "/api/premium/link"
                ? await createLinkForUser(
                    idToken,
                    body.currency as string,
                    origin
                  )
                : await verifyAndUnlock(
                    idToken,
                    body.payment_link_id as string | undefined
                  );
            sendJson(res, result.status, result.body);
            return;
          }
          if (req.method === "POST" && route === "/api/audit/decrement-credits") {
            const authorization = req.headers.authorization ?? "";
            const idToken = authorization.startsWith("Bearer ")
              ? authorization.slice("Bearer ".length)
              : "";
            if (!idToken) {
              sendJson(res, 401, { ok: false, error: "Authentication required" });
              return;
            }
            const uid = await verifyIdToken(idToken);
            const result = await decrementCredits(uid);
            sendJson(res, result.ok ? 200 : 403, result);
            return;
          }
          if (req.method === "POST" && route === "/api/premium/webhook") {
            const raw = await readRawBody(req);
            const signature = req.headers["x-razorpay-signature"] as
              | string
              | undefined;
            const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
            if (!secret || !verifyWebhookSignature(raw, signature, secret)) {
              sendJson(res, 400, { ok: false, error: "Invalid signature" });
              return;
            }
            let parsed: unknown = {};
            try {
              parsed = JSON.parse(raw.toString("utf-8"));
            } catch {
              /* ignore */
            }
            const event = parsed as {
              entity?: {
                event?: string;
                payload?: {
                  payment_link?: { id?: string; notes?: { uid?: string } };
                };
              };
            };
            const eventName = event?.entity?.event ?? "";
            const uid = event?.entity?.payload?.payment_link?.notes?.uid;
            if (eventName === "payment_link.paid" && uid) {
              try {
                await unlockUserByUid(uid);
                console.log(`[razorpay webhook] ${eventName} · uid ${uid}`);
              } catch (error) {
                console.error(
                  "[razorpay webhook] could not grant premium",
                  error
                );
                sendJson(res, 500, { ok: false, error: "Grant failed" });
                return;
              }
            }
            sendJson(res, 200, { ok: true });
            return;
          }
          next();
        } catch (error) {
          console.error("[api middleware]", error);
          sendJson(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : "Server error",
          });
        }
      });
    },
  };
}

function readRawBody(req: {
  on: (event: string, cb: (chunk: Buffer) => void) => unknown;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body: string) => void;
  },
  status: number,
  body: unknown
) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      const localStorageDir = path.join(
        PROJECT_ROOT,
        "client",
        "public",
        "manus-storage"
      );
      const mimeByExt: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
      };
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const localPath = path.join(localStorageDir, key);
        if (fs.existsSync(localPath)) {
          const ext = path.extname(localPath).toLowerCase();
          res.writeHead(200, {
            "Content-Type": mimeByExt[ext] || "application/octet-stream",
            "Cache-Control": "no-cache",
          });
          fs.createReadStream(localPath).pipe(res);
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(
          /\/+$/,
          ""
        );
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL(
            "v1/storage/presign/get",
            forgeBaseUrl + "/"
          );
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  vitePluginManusRuntime(),
  vitePluginManusDebugCollector(),
  vitePluginStorageProxy(),
  viteApiMiddleware(),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
