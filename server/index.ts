import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { verifyWebhookSignature } from "../shared/razorpay";
import { createLinkForUser, unlockUserByUid, verifyAndUnlock } from "../shared/premiumApi";

function bearerToken(req: express.Request): string {
  const authorization = req.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.post(
    "/api/premium/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["x-razorpay-signature"] as string | undefined;
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret || !verifyWebhookSignature(req.body, signature, secret)) {
        return res.status(400).json({ ok: false, error: "Invalid signature" });
      }
      const event = JSON.parse(req.body.toString("utf-8")) as {
        entity?: { event?: string; payload?: { payment_link?: { id?: string; notes?: { uid?: string } } } };
      };
      const eventName = event?.entity?.event ?? "";
      const uid = event?.entity?.payload?.payment_link?.notes?.uid;
      if (eventName === "payment_link.paid") {
        if (uid) {
          try {
            await unlockUserByUid(uid);
          } catch (error) {
            console.error("[razorpay webhook] could not grant premium", error);
            return res.status(500).json({ ok: false, error: "Grant failed" });
          }
        }
        console.log(`[razorpay webhook] ${eventName} · ${event?.entity?.payload?.payment_link?.id ?? "unknown"} · uid ${uid ?? "none"}`);
      }
      return res.status(200).json({ ok: true });
    }
  );

  app.use(express.json());

  app.post("/api/premium/link", async (req, res) => {
    const idToken = bearerToken(req);
    if (!idToken) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }
    const origin = req.headers.origin || `https://${req.headers.host || "localhost"}`;
    const result = await createLinkForUser(idToken, req.body?.currency, origin);
    return res.status(result.status).json(result.body);
  });

  app.post("/api/premium/verify", async (req, res) => {
    const idToken = bearerToken(req);
    if (!idToken) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }
    const result = await verifyAndUnlock(idToken, req.body?.payment_link_id);
    return res.status(result.status).json(result.body);
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
