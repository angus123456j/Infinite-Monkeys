/**
 * Scrutiny-only service (Phase 3).
 * Serves ONNX / Hugging Face AI-text detection — cannot run on Supabase Edge Functions.
 *
 * CRUD and LLM traffic live on Supabase; this process only needs scrutiny env vars.
 */
import "./env.js";
import { appendFileSync } from "node:fs";
import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerScrutinyRoutes } from "./scrutiny/registerScrutinyRoutes.js";
import { enforceAnonymousScrutinyTrialQuota } from "./scrutiny/anonTrialQuota.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
const SHARED_SECRET = process.env.SHARED_SECRET;

const defaultCorsOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  // Production scrutiny client (same-origin as Vercel app); SCRUTINY_CORS_ORIGINS can add more.
  "https://www.infinitemonkeys.world",
  "https://infinitemonkeys.world",
];
const extraOrigins =
  process.env.SCRUTINY_CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
const corsOrigins = [...new Set([...defaultCorsOrigins, ...extraOrigins])];

app.use(
  cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Shared-Secret", "Authorization"],
  }),
);

app.use(express.json({ limit: "2mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 60 : 400,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!SHARED_SECRET) {
    return next();
  }
  const providedSecret = req.headers["x-shared-secret"];
  if (providedSecret !== SHARED_SECRET) {
    return res.status(401).json({
      error: "Unauthorized. Invalid or missing X-Shared-Secret header.",
    });
  }
  next();
};

registerScrutinyRoutes({ app, limiter, authMiddleware, enforceAnonymousScrutinyTrialQuota });

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "scrutiny" });
});

const listenPort = Number(PORT);
if (!Number.isFinite(listenPort)) {
  throw new Error(`Invalid PORT: ${PORT}`);
}

// Bind all interfaces so Railway / Docker health checks can reach the process (not only ::1).
app.listen(listenPort, "0.0.0.0", () => {
  console.log(`[scrutiny] listening on http://0.0.0.0:${listenPort}`);
  console.log(
    `[scrutiny] CORS origins: ${corsOrigins.join(", ")}` +
      (extraOrigins.length ? " (+ SCRUTINY_CORS_ORIGINS)" : ""),
  );
  console.log(
    `[scrutiny] auth: ${SHARED_SECRET ? "X-Shared-Secret required" : "disabled (local dev)"}`,
  );
  // #region agent log
  try {
    const line = JSON.stringify({
      sessionId: "6fdb8f",
      hypothesisId: "H2",
      location: "server/src/index.ts:listen",
      message: "scrutiny_server_listen",
      data: { port: listenPort, corsCount: corsOrigins.length, hasSharedSecret: Boolean(SHARED_SECRET) },
      timestamp: Date.now(),
    });
    appendFileSync(
      "/Users/angoos/Documents/infinite monkeys/.cursor/debug-6fdb8f.log",
      line + "\n",
    );
  } catch {
    /* ignore: path only valid on dev machine */
  }
  // #endregion
});
