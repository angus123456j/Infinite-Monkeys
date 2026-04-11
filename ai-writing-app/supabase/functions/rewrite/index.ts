import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { generateText, getHttpStatusDeep, type LlmProviderMode } from "../_shared/llm.ts";
import { parseJsonBody } from "../_shared/request.ts";
import { sanitizeRewriteOutput } from "../_shared/sanitize.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const { body, error: parseErr } = await parseJsonBody(req);
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

    const llmProvider: LlmProviderMode =
      rawLlm === "gemini" || rawLlm === "deepseek" || rawLlm === "auto"
        ? rawLlm
        : "auto";

    console.log(`[rewrite] provider=${llmProvider} agentId=${agentId ?? "none"} textLen=${text.length}`);

    const supabase = createServiceClient();

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
      }
      loadedAgent = data;
    }

    const isSynonymSpecialist =
      !!loadedAgent &&
      typeof loadedAgent.name === "string" &&
      (() => {
        const n = (loadedAgent!.name as string).toLowerCase();
        return n.includes("synonym sensei") || n.includes("synonym monkey");
      })();

    const sentenceCtx =
      typeof sentenceContext === "string" && sentenceContext.trim()
        ? sentenceContext.trim()
        : "";

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
        .in("id", uniqueContextIds);

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
