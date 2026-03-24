import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_MODEL = "gemini-2.5-flash";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

export type LlmProviderMode = "auto" | "gemini" | "deepseek";

function summarizeErr(err: unknown): string {
  const st = getHttpStatusDeep(err);
  const msg = fullErrorText(err).slice(0, 400);
  return [st, msg].filter(Boolean).join(" ") || String(err);
}

/** Coerce SDK / fetch errors that use number, string "429", or nested { error: { code } }. */
export function getHttpStatusDeep(err: unknown): number | undefined {
  const seen = new Set<unknown>();
  let e: unknown = err;
  let depth = 0;
  while (e != null && depth++ < 10 && !seen.has(e)) {
    seen.add(e);
    if (typeof e === "object") {
      const o = e as Record<string, unknown>;
      for (const key of ["status", "statusCode"] as const) {
        const v = o[key];
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && /^\d{3}$/.test(v)) return Number(v);
      }
      const nested = o.error;
      if (nested && typeof nested === "object") {
        const c = (nested as { code?: unknown }).code;
        if (typeof c === "number" && Number.isFinite(c)) return c;
        if (typeof c === "string" && /^\d{3}$/.test(c)) return Number(c);
      }
      const cause = o.cause;
      if (cause != null) {
        e = cause;
        continue;
      }
      const resp = o.response;
      if (resp && typeof resp === "object") {
        const st = (resp as { status?: unknown }).status;
        if (typeof st === "number" && Number.isFinite(st)) return st;
        if (typeof st === "string" && /^\d{3}$/.test(st)) return Number(st);
      }
      break;
    }
    break;
  }
  return undefined;
}

function fullErrorText(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  let depth = 0;
  while (e != null && depth++ < 8) {
    if (e instanceof Error) {
      parts.push(e.message);
      e = (e as Error & { cause?: unknown }).cause;
    } else {
      try {
        parts.push(typeof e === "string" ? e : JSON.stringify(e));
      } catch {
        parts.push(String(e));
      }
      break;
    }
  }
  return parts.join(" | ");
}

async function deepSeekChat(
  apiKey: string,
  systemInstruction: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(`DeepSeek API ${res.status}: ${raw.slice(0, 500)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(`DeepSeek returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("DeepSeek returned empty content");
  }
  return text;
}

/** Single Gemini attempt; throws on failure (no DeepSeek). */
async function geminiOnce(
  genAI: GoogleGenerativeAI,
  systemInstruction: string,
  userPrompt: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
  });
  const result = await model.generateContent(userPrompt);
  const response = result.response;
  const withCandidates = response as unknown as { candidates?: unknown[] };
  if (!withCandidates.candidates?.length) {
    throw new Error("Gemini returned no candidates (blocked, quota, or empty response)");
  }
  const textOut = response.text();
  if (!textOut?.trim()) {
    throw new Error("Gemini returned empty text");
  }
  return textOut;
}

/** Gemini with optional DeepSeek fallback (auto mode). */
async function geminiWithAutoFallback(
  genAI: GoogleGenerativeAI,
  deepseekKey: string | undefined,
  systemInstruction: string,
  userPrompt: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction,
    });
    const result = await model.generateContent(userPrompt);
    const response = result.response;
    const withCandidates = response as unknown as { candidates?: unknown[] };
    if (!withCandidates.candidates?.length) {
      if (!deepseekKey) {
        throw new Error(
          "Gemini returned no candidates (blocked, quota, or empty response)"
        );
      }
      console.warn("[llm] Gemini returned no candidates; using DeepSeek fallback");
      return deepSeekChat(deepseekKey, systemInstruction, userPrompt);
    }

    let textOut: string;
    try {
      textOut = response.text();
    } catch (textErr) {
      if (!deepseekKey) {
        throw textErr;
      }
      console.warn(
        "[llm] Gemini response.text() failed; using DeepSeek fallback:",
        summarizeErr(textErr)
      );
      return deepSeekChat(deepseekKey, systemInstruction, userPrompt);
    }

    if (!textOut?.trim()) {
      if (!deepseekKey) {
        throw new Error("Gemini returned empty text");
      }
      console.warn("[llm] Gemini returned empty text; using DeepSeek fallback");
      return deepSeekChat(deepseekKey, systemInstruction, userPrompt);
    }

    return textOut;
  } catch (err) {
    if (!deepseekKey) {
      throw err;
    }
    console.warn("[llm] Gemini failed; using DeepSeek fallback:", summarizeErr(err));
    return deepSeekChat(deepseekKey, systemInstruction, userPrompt);
  }
}

export interface LlmClientsOptions {
  geminiApiKey?: string;
  deepseekApiKey?: string;
}

export function createLlmClients(opts: LlmClientsOptions) {
  const genAI = opts.geminiApiKey ? new GoogleGenerativeAI(opts.geminiApiKey) : null;

  return {
    async generateText(
      systemInstruction: string,
      userPrompt: string,
      provider: LlmProviderMode = "auto"
    ): Promise<string> {
      if (provider === "deepseek") {
        if (!opts.deepseekApiKey) {
          throw new Error(
            "DeepSeek is not configured (set DEEPSEEK_API_KEY on the server)"
          );
        }
        return deepSeekChat(opts.deepseekApiKey, systemInstruction, userPrompt);
      }

      if (provider === "gemini") {
        if (!genAI) {
          throw new Error("Gemini is not configured (set GEMINI_API_KEY on the server)");
        }
        return geminiOnce(genAI, systemInstruction, userPrompt);
      }

      // auto
      if (genAI) {
        return geminiWithAutoFallback(
          genAI,
          opts.deepseekApiKey,
          systemInstruction,
          userPrompt
        );
      }

      if (opts.deepseekApiKey) {
        console.warn("[llm] No GEMINI_API_KEY; using DeepSeek only.");
        return deepSeekChat(opts.deepseekApiKey, systemInstruction, userPrompt);
      }

      throw new Error("No LLM API key configured (set GEMINI_API_KEY and/or DEEPSEEK_API_KEY)");
    },
  };
}
