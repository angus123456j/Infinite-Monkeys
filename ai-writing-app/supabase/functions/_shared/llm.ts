const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const GEMINI_MODEL = "gemini-2.5-flash";

export type LlmProviderMode = "auto" | "gemini" | "deepseek";

async function deepSeekChat(
  apiKey: string,
  systemInstruction: string,
  userPrompt: string,
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
    const err = new Error(
      `DeepSeek API ${res.status}: ${raw.slice(0, 500)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`DeepSeek returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("DeepSeek returned empty content");
  return text;
}

async function geminiChat(
  apiKey: string,
  systemInstruction: string,
  userPrompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(
      `Gemini API ${res.status}: ${raw.slice(0, 500)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  let data: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned empty text");
  return text;
}

function summarizeErr(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 400);
  return String(err).slice(0, 400);
}

export function getHttpStatusDeep(err: unknown): number | undefined {
  const seen = new Set<unknown>();
  let e: unknown = err;
  let depth = 0;
  while (e != null && depth++ < 10 && !seen.has(e)) {
    seen.add(e);
    if (typeof e === "object") {
      const o = e as Record<string, unknown>;
      for (const key of ["status", "statusCode"]) {
        const v = o[key];
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && /^\d{3}$/.test(v)) return Number(v);
      }
      if (o.cause != null) {
        e = o.cause;
        continue;
      }
      break;
    }
    break;
  }
  return undefined;
}

export async function generateText(
  systemInstruction: string,
  userPrompt: string,
  provider: LlmProviderMode = "auto",
): Promise<string> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY")?.trim();

  if (provider === "deepseek") {
    if (!deepseekKey) throw new Error("DEEPSEEK_API_KEY not configured");
    return deepSeekChat(deepseekKey, systemInstruction, userPrompt);
  }

  if (provider === "gemini") {
    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");
    return geminiChat(geminiKey, systemInstruction, userPrompt);
  }

  // auto: try Gemini first, fall back to DeepSeek
  if (geminiKey) {
    try {
      return await geminiChat(geminiKey, systemInstruction, userPrompt);
    } catch (err) {
      if (deepseekKey) {
        console.warn("[llm] Gemini failed, falling back to DeepSeek:", summarizeErr(err));
        return deepSeekChat(deepseekKey, systemInstruction, userPrompt);
      }
      throw err;
    }
  }

  if (deepseekKey) {
    return deepSeekChat(deepseekKey, systemInstruction, userPrompt);
  }

  throw new Error("No LLM API key configured (set GEMINI_API_KEY and/or DEEPSEEK_API_KEY)");
}
