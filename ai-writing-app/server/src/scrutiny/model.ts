import { pipeline, env as hfEnv, type TextClassificationOutput } from "@huggingface/transformers";

// Use a writable cache inside the repo (so it works in dev + deploy).
// You can override with SCRUTINY_MODEL_CACHE_DIR.
hfEnv.cacheDir =
  process.env.SCRUTINY_MODEL_CACHE_DIR?.trim() ||
  process.env.TRANSFORMERS_CACHE?.trim() ||
  ".cache/hf";

const DEFAULT_MODEL_ID = "onnx-community/roberta-base-openai-detector-ONNX";

let classifierPromise:
  | Promise<(text: string) => Promise<TextClassificationOutput>>
  | null = null;

export type ScrutinyModelMeta = {
  modelId: string;
};

export async function getScrutinyClassifier(): Promise<{
  meta: ScrutinyModelMeta;
  classify: (text: string) => Promise<TextClassificationOutput>;
}> {
  const modelId = process.env.SCRUTINY_MODEL_ID?.trim() || DEFAULT_MODEL_ID;

  if (!classifierPromise) {
    classifierPromise = (async () => {
      const fn = await pipeline("text-classification", modelId);
      return async (text: string) => fn(text);
    })();
  }

  return {
    meta: { modelId },
    classify: await classifierPromise,
  };
}

export function normalizeAiProbability(output: TextClassificationOutput): number {
  // roberta-base-openai-detector uses labels like "Real" vs "Fake" (GPT-2).
  // Treat "Fake" as AI-ish.
  const items = Array.isArray(output) ? output : [output];
  const best = items[0];
  const label = (best?.label ?? "").toLowerCase();
  const score = typeof best?.score === "number" ? best.score : 0;
  if (label.includes("fake") || label.includes("ai") || label.includes("generated")) {
    return clamp01(score);
  }
  if (label.includes("real") || label.includes("human")) {
    return clamp01(1 - score);
  }
  // Unknown label: interpret score as “AI-ish”.
  return clamp01(score);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

