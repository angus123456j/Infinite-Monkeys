import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { generateText, type LlmProviderMode } from "../_shared/llm.ts";
import { getAuthedUser, isAuthedError, jsonError } from "../_shared/jwtUser.ts";
import { parseJsonBody } from "../_shared/request.ts";
import { sanitizeRewriteOutput } from "../_shared/sanitize.ts";
import { createServiceClient } from "../_shared/supabase.ts";

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

    const { body, error: parseErr } = await parseJsonBody(req);
    if (parseErr) return parseErr;

    const { text, prompt, llmProvider: rawLlm } = body;

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'text'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const llmProvider: LlmProviderMode =
      rawLlm === "gemini" || rawLlm === "deepseek" || rawLlm === "auto"
        ? rawLlm
        : "auto";

    const instruction = typeof prompt === "string" ? prompt : "";

    console.log(`[orchestrator-plan] provider=${llmProvider} textLen=${text.length}`);

    const supabase = createServiceClient();
    const { data: candidates, error: dbErr } = await supabase
      .from("monkey_agents")
      .select("id, name, role, strengths, identity, behavior, constraints")
      .eq("is_template", true)
      .is("user_id", null)
      .in("role", ["Specialist", "Synonym Specialist"])
      .order("updatedAt", { ascending: false });

    if (dbErr) {
      console.error("[orchestrator-plan] DB query failed:", dbErr.message);
      return new Response(
        JSON.stringify({ error: "Database query failed", details: dbErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!candidates || !candidates.length) {
      return new Response(
        JSON.stringify({ error: "No specialist monkeys configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[orchestrator-plan] found ${candidates.length} specialist candidates`);

    const truncate = (s: string, max: number) =>
      s && s.length > max ? `${s.slice(0, max)}…` : s;

    const agentsForPrompt = candidates.slice(0, 60).map((a: Record<string, string>) => ({
      id: a.id,
      name: a.name,
      role: truncate(a.role ?? "", 80),
      strengths: truncate(a.strengths ?? "", 220),
      identity: truncate(a.identity ?? "", 220),
      behavior: truncate(a.behavior ?? "", 220),
      constraints: truncate(a.constraints ?? "", 220),
    }));

    const systemInstruction =
      `You are Orchestrator, a higher-order writing assistant.\n` +
      `Given an input text and a user instruction, you must propose an ordered sequence of 1 to 3 specialist agents.\n` +
      `Return ONLY valid JSON with this exact shape:\n` +
      `{\n` +
      `  "sequence": [ { "agentId": "<string>" } ]\n` +
      `}\n` +
      `Rules:\n` +
      `- Choose agentIds ONLY from the provided agent list.\n` +
      `- The first agent in the sequence should be the Synonym Specialist if it is appropriate for the text.\n` +
      `- Keep the sequence short (1 to 3 agents).\n` +
      `- Do not include explanations.`;

    const userPrompt =
      `Input text:\n${text}\n\n` +
      (instruction
        ? `User instruction:\n${instruction}\n\n`
        : `User instruction is not provided.\n\n`) +
      `Specialist agents:\n${JSON.stringify(agentsForPrompt)}\n\n` +
      `Propose the best sequence of agentIds.`;

    const raw = await generateText(systemInstruction, userPrompt, llmProvider);
    const cleaned = sanitizeRewriteOutput(raw);

    const jsonCandidate = cleaned.match(/\{[\s\S]*\}/)?.[0];
    let parsed: { sequence?: Array<{ agentId?: unknown }> } | null = null;
    if (jsonCandidate) {
      try {
        parsed = JSON.parse(jsonCandidate);
      } catch {
        console.warn("[orchestrator-plan] LLM returned unparseable JSON, using fallback");
        parsed = null;
      }
    }

    const agentIdSet = new Set(candidates.map((c: Record<string, string>) => c.id));
    const rawSeq = parsed?.sequence ?? [];
    const seqIds: string[] = [];
    for (const row of rawSeq) {
      const id = row?.agentId;
      if (typeof id === "string" && agentIdSet.has(id) && !seqIds.includes(id)) {
        seqIds.push(id);
      }
    }

    if (!seqIds.length) seqIds.push(candidates[0]!.id as string);

    // Enforce synonym specialist first if present
    const synonymIds = candidates
      .filter(
        (c: Record<string, string>) =>
          c.role === "Synonym Specialist" ||
          c.name.toLowerCase().includes("synonym sensei") ||
          c.name.toLowerCase().includes("synonym monkey"),
      )
      .map((c: Record<string, string>) => c.id);
    const synonymSet = new Set(synonymIds);
    const hasSynonym = seqIds.some((id) => synonymSet.has(id));
    const reordered = hasSynonym
      ? [
          ...seqIds.filter((id) => synonymSet.has(id)),
          ...seqIds.filter((id) => !synonymSet.has(id)),
        ]
      : seqIds;

    const result = reordered.slice(0, 3);
    console.log(`[orchestrator-plan] success, sequence=${JSON.stringify(result)}`);

    return new Response(
      JSON.stringify({ sequence: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[orchestrator-plan] unhandled error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Failed to generate orchestrator plan", details: msg.slice(0, 400) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
