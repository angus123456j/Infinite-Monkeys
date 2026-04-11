/**
 * Scrutiny-only service (Phase 3).
 * Serves ONNX / Hugging Face AI-text detection — cannot run on Supabase Edge Functions.
 *
 * CRUD and LLM traffic live on Supabase; this process only needs scrutiny env vars.
 */
import "./env.js";
import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerScrutinyRoutes } from "./scrutiny/registerScrutinyRoutes.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
const SHARED_SECRET = process.env.SHARED_SECRET;

const defaultCorsOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
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
    allowedHeaders: ["Content-Type", "X-Shared-Secret"],
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

registerScrutinyRoutes({ app, limiter, authMiddleware });

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "scrutiny" });
});

app.listen(PORT, () => {
  console.log(`[scrutiny] listening on http://localhost:${PORT}`);
  console.log(
    `[scrutiny] CORS origins: ${corsOrigins.join(", ")}` +
      (extraOrigins.length ? " (+ SCRUTINY_CORS_ORIGINS)" : ""),
  );
  console.log(
    `[scrutiny] auth: ${SHARED_SECRET ? "X-Shared-Secret required" : "disabled (local dev)"}`,
  );
});
