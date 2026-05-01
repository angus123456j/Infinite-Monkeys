import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { generateText, getHttpStatusDeep, type LlmProviderMode } from "../_shared/llm.ts";
import { getAuthedUser, isAuthedError, jsonError } from "../_shared/jwtUser.ts";
import {
  fieldTooLargeResponse,
  MAX_BODY_BYTES_REWRITE,
  parseJsonBodyLimited,
} from "../_shared/request.ts";
import { sanitizeRewriteOutput } from "../_shared/sanitize.ts";
import {
  guardRewriteBursts,
  MAX_REWRITE_PROMPT_CHARS,
  MAX_REWRITE_SENTENCE_CTX_CHARS,
  MAX_REWRITE_TEXT_CHARS,
} from "../_shared/rateLimit.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const FREE_TIER_DAILY_SENTENCES = 100;
const PRO_TIER_DAILY_SENTENCES = 1500;
/** Same 5h epoch as client trial hint (UTC ms since epoch). */
const TRIAL_FIVE_H_MS = 5 * 3600 * 1000;

function trialBucketId(): number {
  return Math.floor(Date.now() / TRIAL_FIVE_H_MS);
}
/** ~75 output characters ≈ one “assisted sentence” for quota display. */
const OUTPUT_CHARS_PER_SENTENCE = 75;

function sentencesFromRewriteOutput(text: string): number {
  const t = (text ?? "").trim();
  if (!t.length) return 0;
  return Math.max(1, Math.ceil(t.length / OUTPUT_CHARS_PER_SENTENCE));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Server misconfiguration", 500);
  }

  try {
    const userResult = await getAuthedUser(req, supabaseUrl, supabaseAnonKey);
    if (isAuthedError(userResult)) {
      return jsonError(userResult.error, userResult.status);
    }
    const userId = userResult.id;
    const isAnon = (userResult as { is_anonymous?: boolean }).is_anonymous === true;

    const { body, error: parseErr } = await parseJsonBodyLimited(req, MAX_BODY_BYTES_REWRITE);
    if (parseErr) return parseErr;

    const { text, prompt, agentId, contextId, contextIds, sentenceContext, llmProvider: rawLlm } = body;

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'text'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'prompt'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (text.length > MAX_REWRITE_TEXT_CHARS) {
      return fieldTooLargeResponse("text", MAX_REWRITE_TEXT_CHARS);
    }
    if (prompt.length > MAX_REWRITE_PROMPT_CHARS) {
      return fieldTooLargeResponse("prompt", MAX_REWRITE_PROMPT_CHARS);
    }
    const rawSentenceCtx = typeof sentenceContext === "string" ? sentenceContext : "";
    if (rawSentenceCtx.length > MAX_REWRITE_SENTENCE_CTX_CHARS) {
      return fieldTooLargeResponse("sentenceContext", MAX_REWRITE_SENTENCE_CTX_CHARS);
    }

    const llmProvider: LlmProviderMode =
      rawLlm === "gemini" || rawLlm === "deepseek" || rawLlm === "auto"
        ? rawLlm
        : "auto";

    console.log(`[rewrite] provider=${llmProvider} agentId=${agentId ?? "none"} textLen=${text.length}`);

    const supabase = createServiceClient();

    const burst = await guardRewriteBursts(supabase, userId, req);
    if (burst) return burst;

    const authHeader = req.headers.get("Authorization") ?? "";

    if (isAnon) {
      const userSb = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const bucketId = trialBucketId();
      const { data: allowed, error: trialRpcErr } = await userSb.rpc("try_consume_anonymous_trial_rewrite", {
        p_bucket_id: bucketId,
      });
      if (trialRpcErr) {
        console.warn(`[rewrite] anonymous trial RPC failed: ${trialRpcErr.message}`);
        return jsonError("Trial quota check failed", 500, trialRpcErr.message);
      }
      if (allowed !== true) {
        return new Response(
          JSON.stringify({ error: "trial_quota_exceeded", type: "rewrite" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const todayUtc = new Date().toISOString().slice(0, 10);

    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();

    const tier = (subRow as { tier?: string } | null)?.tier ?? "free";

    const sentenceLimit = isAnon
      ? null
      : tier === "free"
        ? FREE_TIER_DAILY_SENTENCES
        : tier === "pro"
          ? PRO_TIER_DAILY_SENTENCES
          : null;

    if (sentenceLimit != null) {
      const { data: usageRow } = await supabase
        .from("daily_usage")
        .select("sentences_used")
        .eq("user_id", userId)
        .eq("date", todayUtc)
        .maybeSingle();

      const used = (usageRow as { sentences_used?: number } | null)?.sentences_used ?? 0;
      if (used >= sentenceLimit) {
        return new Response(
          JSON.stringify({
            error: "quota_exceeded",
            type: "sentences",
            used,
            limit: sentenceLimit,
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Load agent if specified
    let loadedAgent: Record<string, unknown> | null = null;
    if (agentId && typeof agentId === "string") {
      const { data, error: agentErr } = await supabase
        .from("monkey_agents")
        .select("*")
        .eq("id", agentId)
        .single();
      if (agentErr) {
        console.warn(`[rewrite] agent lookup failed for ${agentId}: ${agentErr.message}`);
      } else if (data) {
        const isT = (data as Record<string, unknown>).is_template === true;
        const uid = (data as Record<string, unknown>).user_id as string | null | undefined;
        if (isT || uid === userId) {
          loadedAgent = data;
        } else {
          console.warn(`[rewrite] denied agent ${agentId} for user ${userId}`);
        }
      }
    }

    const isSynonymSpecialist =
      !!loadedAgent &&
      typeof loadedAgent.name === "string" &&
      (() => {
        const n = (loadedAgent!.name as string).toLowerCase();
        return n.includes("synonym sensei") || n.includes("synonym monkey");
      })();

    const sentenceCtx = rawSentenceCtx.trim() ? rawSentenceCtx.trim() : "";

    const useSentenceSynonymMode = isSynonymSpecialist && sentenceCtx.length > 0;

    // Build system instruction
    let systemInstruction = `You are a helpful writing assistant. Rewrite the provided text according to the user's instructions.
Return only the rewritten text, without explanations or meta-commentary.
Preserve the meaning and intent while improving clarity, style, or following the specific instructions given.
Output plain prose only: no markdown (no asterisks, underscores, or backticks used for emphasis), no bullet lists with asterisks, no LaTeX or math delimiters.`;

    if (loadedAgent) {
      const parts = [
        `You are "${loadedAgent.name}", a specialist monkey writing agent.`,
        loadedAgent.identity ? `Identity: ${loadedAgent.identity}` : "",
        loadedAgent.role ? `Role: ${loadedAgent.role}` : "",
        loadedAgent.behavior ? `Behavior: ${loadedAgent.behavior}` : "",
        loadedAgent.constraints ? `Constraints: ${loadedAgent.constraints}` : "",
        loadedAgent.strengths ? `Strengths: ${loadedAgent.strengths}` : "",
        "",
        "Rewrite the provided text according to the user's instructions.",
        "Return only the rewritten text, without explanations or meta-commentary.",
        "Use plain prose only: no markdown formatting and no LaTeX.",
      ];
      if (useSentenceSynonymMode) {
        parts.push(
          "",
          "The user message includes a full sentence and a phrase that occurs inside that sentence. The phrase must be replaced using the meaning the phrase has IN THAT SENTENCE. For homonyms (e.g. draft as air current vs document, bank as river vs money), you must use neighboring words to choose the correct sense—never substitute using a different sense. Output ONLY the replacement words that could drop into the same grammatical slot—never a definition, title, gloss, or meta phrase like 'preliminary version' unless it truly fits the slot.",
        );
      }
      systemInstruction = parts.filter(Boolean).join("\n");
    }

    // Load context documents
    const contextIdsArr: string[] = [];
    if (Array.isArray(contextIds)) {
      for (const v of contextIds) {
        if (typeof v === "string" && v.trim()) contextIdsArr.push(v);
      }
    } else if (typeof contextId === "string" && contextId.trim()) {
      contextIdsArr.push(contextId.trim());
    }
    const uniqueContextIds = [...new Set(contextIdsArr)].slice(0, 5);

    let contextBlock = "";
    if (uniqueContextIds.length) {
      const { data: ctxs, error: ctxErr } = await supabase
        .from("contexts")
        .select("*")
        .in("id", uniqueContextIds)
        .eq("user_id", userId);

      if (ctxErr) {
        console.warn(`[rewrite] context lookup failed: ${ctxErr.message}`);
      } else if (ctxs && ctxs.length) {
        const byId = new Map(ctxs.map((c: Record<string, unknown>) => [c.id, c]));
        const ordered = uniqueContextIds
          .map((id) => byId.get(id))
          .filter((x): x is Record<string, unknown> => !!x);

        if (ordered.length) {
          contextBlock = `\n\nContext documents:\n${ordered
            .map((ctx, idx) => {
              const tagsArr = Array.isArray(ctx.tags) ? ctx.tags : [];
              const tagsStr =
                tagsArr.length && tagsArr.every((t: unknown) => typeof t === "string")
                  ? `Tags: ${(tagsArr as string[]).join(", ")}`
                  : "";
              return [
                `Context document ${idx + 1}:`,
                ctx.title ? `Title: ${ctx.title}` : "",
                ctx.description ? `Description: ${ctx.description}` : "",
                tagsStr,
              ]
                .filter(Boolean)
                .join("\n");
            })
            .join("\n\n")}`;
        }
      }
    }

    const userPrompt = useSentenceSynonymMode
      ? `The phrase to replace appears inside the following sentence (treat the sentence as ground truth for word sense):\n\n"${sentenceCtx}"\n\nExact phrase to replace (substring of that sentence):\n\n${text}${contextBlock}\n\nUser instruction: ${prompt}\n\nReply with ONLY the substitute phrase—plain words, no quotes or asterisks, not the full sentence.`
      : `Text to rewrite:\n\n${text}\n${contextBlock}\n\nUser instruction: ${prompt}\n\nPlease rewrite the text according to the instruction. Reply with plain text only (no markdown asterisks, no LaTeX).`;

    let rewrite = sanitizeRewriteOutput(
      await generateText(systemInstruction, userPrompt, llmProvider),
    );

    if (useSentenceSynonymMode) {
      rewrite = rewrite
        .replace(/^\*+|\*+$/g, "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .trim();
    }

    console.log(`[rewrite] success, outputLen=${rewrite.length}`);

    if (sentenceLimit != null) {
      const delta = sentencesFromRewriteOutput(rewrite);
      if (delta > 0) {
        const { error: rpcErr } = await supabase.rpc("add_daily_sentences", {
          p_user_id: userId,
          p_date: todayUtc,
          p_delta: delta,
        });
        if (rpcErr) {
          console.warn(`[rewrite] add_daily_sentences failed: ${rpcErr.message}`);
        }
      }
    }

    return new Response(JSON.stringify({ rewrite }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[rewrite] unhandled error:", error);
    const status = getHttpStatusDeep(error);
    const msg = error instanceof Error ? error.message : String(error);

    if (status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again shortly.", details: msg.slice(0, 400) }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Failed to generate rewrite", details: msg.slice(0, 400) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
