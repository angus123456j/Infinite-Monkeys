/**
 * Unauthenticated rewrite endpoint for the public "Start writing" trial.
 *
 * Differences vs `rewrite/index.ts`:
 *  - No JWT, no Supabase user, no anonymous trial RPC, no quotas,
 *    no agent loading, no context documents, no usage tracking.
 *  - The single allowed call is enforced **on the client** (sessionStorage);
 *    refresh = a new free attempt. Platform-level Edge Function rate limits
 *    plus the upstream LLM provider rate limits are the abuse backstop.
 *
 * Deploy with `--no-verify-jwt`:
 *   supabase functions deploy rewrite-demo --no-verify-jwt
 */
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { generateText, getHttpStatusDeep, type LlmProviderMode } from "../_shared/llm.ts";
import {
  fieldTooLargeResponse,
  MAX_BODY_BYTES_REWRITE,
  parseJsonBodyLimited,
} from "../_shared/request.ts";
import { sanitizeRewriteOutput } from "../_shared/sanitize.ts";
import {
  MAX_REWRITE_PROMPT_CHARS,
  MAX_REWRITE_TEXT_CHARS,
} from "../_shared/rateLimit.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_INSTRUCTION =
  `You are a helpful writing assistant. Rewrite the provided text according to the user's instructions.
Return only the rewritten text, without explanations or meta-commentary.
Preserve the meaning and intent while improving clarity, style, or following the specific instructions given.
Output plain prose only: no markdown (no asterisks, underscores, or backticks used for emphasis), no bullet lists with asterisks, no LaTeX or math delimiters.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const { body, error: parseErr } = await parseJsonBodyLimited<{
      text?: unknown;
      prompt?: unknown;
      llmProvider?: unknown;
    }>(req, MAX_BODY_BYTES_REWRITE);
    if (parseErr) return parseErr;

    const text = typeof body.text === "string" ? body.text : "";
    const prompt = typeof body.prompt === "string" ? body.prompt : "";

    if (!text) return jsonResponse({ error: "Missing or invalid 'text'" }, 400);
    if (!prompt) return jsonResponse({ error: "Missing or invalid 'prompt'" }, 400);

    if (text.length > MAX_REWRITE_TEXT_CHARS) {
      return fieldTooLargeResponse("text", MAX_REWRITE_TEXT_CHARS);
    }
    if (prompt.length > MAX_REWRITE_PROMPT_CHARS) {
      return fieldTooLargeResponse("prompt", MAX_REWRITE_PROMPT_CHARS);
    }

    const rawLlm = body.llmProvider;
    const llmProvider: LlmProviderMode =
      rawLlm === "gemini" || rawLlm === "deepseek" || rawLlm === "auto"
        ? rawLlm
        : "auto";

    console.log(`[rewrite-demo] provider=${llmProvider} textLen=${text.length}`);

    const userPrompt =
      `Text to rewrite:\n\n${text}\n\nUser instruction: ${prompt}\n\n` +
      `Please rewrite the text according to the instruction. Reply with plain text only (no markdown asterisks, no LaTeX).`;

    const rewrite = sanitizeRewriteOutput(
      await generateText(SYSTEM_INSTRUCTION, userPrompt, llmProvider),
    );

    console.log(`[rewrite-demo] success outputLen=${rewrite.length}`);
    return jsonResponse({ rewrite });
  } catch (error) {
    console.error("[rewrite-demo] unhandled error:", error);
    const status = getHttpStatusDeep(error);
    const msg = error instanceof Error ? error.message : String(error);

    if (status === 429) {
      return jsonResponse(
        { error: "Rate limit exceeded. Try again shortly.", details: msg.slice(0, 400) },
        429,
      );
    }

    return jsonResponse(
      { error: "Failed to generate rewrite", details: msg.slice(0, 400) },
      500,
    );
  }
});
