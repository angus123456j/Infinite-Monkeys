import { pipeline, env as hfEnv } from "@huggingface/transformers";

// Use a writable cache inside the repo (so it works in dev + deploy).
// You can override with SCRUTINY_MODEL_CACHE_DIR.
hfEnv.cacheDir =
  process.env.SCRUTINY_MODEL_CACHE_DIR?.trim() ||
  process.env.TRANSFORMERS_CACHE?.trim() ||
  ".cache/hf";

// Default upgraded to a modern RAID-trained detector (not GPT-2-era).
// You can still override this with SCRUTINY_MODEL_ID.
const DEFAULT_MODEL_ID = "onnx-community/tmr-ai-text-detector-ONNX";

let classifierPromise:
  | Promise<(text: string) => Promise<unknown>>
  | null = null;

export type ScrutinyModelMeta = {
  modelId: string;
};

export async function getScrutinyClassifier(): Promise<{
  meta: ScrutinyModelMeta;
  classify: (text: string) => Promise<unknown>;
}> {
  const modelId = process.env.SCRUTINY_MODEL_ID?.trim() || DEFAULT_MODEL_ID;

  if (!classifierPromise) {
    classifierPromise = (async () => {
      const fn = await pipeline("text-classification", modelId);
      // Request all label scores so we can reliably extract P(AI),
      // regardless of whether the model's top label is human vs AI.
      return async (text: string) => fn(text, { top_k: null } as any);
    })();
  }

  return {
    meta: { modelId },
    classify: await classifierPromise,
  };
}

export function normalizeAiProbability(output: unknown): number {
  // Transformers.js text-classification can return:
  // - default: [{ label, score }]
  // - with top_k: null: [[{ label, score }, { label, score }, ...]]
  // We'll try to extract P(AI) robustly from "all scores", then fall back.

  const all = extractAllScores(output);
  const p = extractAiProbabilityFromScores(all);
  if (p != null) return clamp01(p);

  const best = extractBestScore(output);
  const label = (best?.label ?? "").toLowerCase();
  const score = typeof best?.score === "number" ? best.score : 0;

  // Back-compat for GPT-2-era RoBERTa detector ("Real" vs "Fake").
  if (label.includes("fake") || label.includes("ai") || label.includes("generated")) return clamp01(score);
  if (label.includes("real") || label.includes("human")) return clamp01(1 - score);

  // Generic heuristic: many binary classifiers use LABEL_1 as the positive/"AI" class.
  if (label === "label_1" || /label[\s_-]?1$/.test(label)) return clamp01(score);
  if (label === "label_0" || /label[\s_-]?0$/.test(label)) return clamp01(1 - score);

  return clamp01(score);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

type ScoreItem = { label?: string; score?: number };

function extractAllScores(output: unknown): ScoreItem[] {
  if (!output) return [];

  // Common case with top_k=null in transformers.js: [[{label,score}, ...]]
  if (Array.isArray(output)) {
    if (output.length === 1 && Array.isArray(output[0])) {
      return (output[0] as any[]).filter(Boolean);
    }
    // Or: [{label,score}, ...]
    if (output.every((x) => x && typeof x === "object" && "score" in (x as any))) {
      return output as any[];
    }
  }

  return [];
}

function extractBestScore(output: unknown): ScoreItem | null {
  if (!output) return null;
  if (Array.isArray(output)) {
    // [[scores]]
    if (output.length === 1 && Array.isArray(output[0])) return (output[0][0] as any) ?? null;
    return (output[0] as any) ?? null;
  }
  if (typeof output === "object") return output as any;
  return null;
}

function extractAiProbabilityFromScores(scores: ScoreItem[]): number | null {
  if (!scores.length) return null;

  const norm = scores
    .map((s) => ({
      label: String(s.label ?? "").toLowerCase(),
      score: typeof s.score === "number" ? s.score : NaN,
    }))
    .filter((s) => Number.isFinite(s.score));

  if (!norm.length) return null;

  const byLabel = (pred: (l: string) => boolean) => norm.find((s) => pred(s.label))?.score;

  // Strong signals first.
  const ai =
    byLabel((l) => l.includes("fake")) ??
    byLabel((l) => l.includes("generated")) ??
    byLabel((l) => l === "ai" || l.includes("ai_") || l.includes("_ai") || l.includes(" ai"));
  if (ai != null) return ai;

  const human = byLabel((l) => l.includes("real")) ?? byLabel((l) => l.includes("human"));
  if (human != null) return 1 - human;

  // Common convention for binary classifiers.
  const label1 = byLabel((l) => l === "label_1" || /label[\s_-]?1$/.test(l));
  if (label1 != null) return label1;

  const label0 = byLabel((l) => l === "label_0" || /label[\s_-]?0$/.test(l));
  if (label0 != null) return 1 - label0;

  return null;
}

