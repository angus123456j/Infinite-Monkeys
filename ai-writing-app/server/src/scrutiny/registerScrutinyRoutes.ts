import type { Express, Request, Response } from "express";
import type rateLimit from "express-rate-limit";
import { getScrutinyClassifier, normalizeAiProbability } from "./model.js";
import { splitSentences } from "./splitSentences.js";

type Limiter = ReturnType<typeof rateLimit>;

export function registerScrutinyRoutes(options: {
  app: Express;
  limiter: Limiter;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}) {
  const { app, limiter, authMiddleware } = options;

  app.post("/api/scrutiny/detect", limiter, authMiddleware, async (req, res) => {
    try {
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const mode =
        req.body?.mode === "selection" || req.body?.mode === "document"
          ? (req.body.mode as "selection" | "document")
          : "document";
      const thresholdRaw = Number(process.env.SCRUTINY_THRESHOLD ?? "0.72");
      const threshold = Number.isFinite(thresholdRaw)
        ? Math.max(0, Math.min(1, thresholdRaw))
        : 0.72;

      if (!text.trim()) {
        return res.json({
          mode,
          model: { modelId: process.env.SCRUTINY_MODEL_ID ?? null },
          threshold,
          truncated: false,
          overallProbability: 0,
          sentences: [],
        });
      }

      const maxCharsRaw = Number(process.env.SCRUTINY_MAX_CHARS ?? "20000");
      const maxChars = Number.isFinite(maxCharsRaw) ? Math.max(2000, Math.round(maxCharsRaw)) : 20000;
      const effectiveText = text.length > maxChars ? text.slice(0, maxChars) : text;
      const truncated = effectiveText.length !== text.length;

      const { meta, classify } = await getScrutinyClassifier();
      const spans = splitSentences(effectiveText);

      // Score each sentence; cap count to keep CPU latency sane.
      const maxSentences = Number(process.env.SCRUTINY_MAX_SENTENCES ?? "64");
      const limited = spans.slice(0, Number.isFinite(maxSentences) ? maxSentences : 64);

      const scored = [];
      let sum = 0;
      for (const s of limited) {
        const out = await classify(s.text);
        const p = normalizeAiProbability(out);
        sum += p;
        scored.push({
          text: s.text,
          start: s.start,
          end: s.end,
          aiProbability: p,
        });
      }

      const overall = scored.length ? sum / scored.length : 0;

      return res.json({
        mode,
        model: meta,
        threshold,
        truncated,
        overallProbability: overall,
        sentences: scored,
      });
    } catch (error: any) {
      console.error("[scrutiny] detect failed:", error);
      return res.status(500).json({ error: "Scrutiny detection failed" });
    }
  });
}

