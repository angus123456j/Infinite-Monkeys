import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { generateText } from "../_shared/llm.ts";
import { getAuthedUser, isAuthedError, jsonError } from "../_shared/jwtUser.ts";
import { parseJsonBody } from "../_shared/request.ts";
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

    const { query, topK: topKRaw } = body;

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'query'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const topK =
      typeof topKRaw === "number" && Number.isFinite(topKRaw)
        ? Math.max(1, Math.min(15, Math.floor(topKRaw)))
        : 8;

    console.log(`[agent-search] query="${query.slice(0, 80)}" topK=${topK}`);

    const supabase = createServiceClient();
    const { data: allAgents, error: dbErr } = await supabase
      .from("monkey_agents")
      .select("id, name, role, strengths, identity, behavior, constraints")
      .eq("is_template", true)
      .is("user_id", null)
      .order("updatedAt", { ascending: false });

    if (dbErr) {
      console.error("[agent-search] DB query failed:", dbErr.message);
      return new Response(
        JSON.stringify({ error: "Database query failed", details: dbErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!allAgents || !allAgents.length) {
      console.log("[agent-search] no agents found, returning empty matches");
      return new Response(
        JSON.stringify({ matches: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[agent-search] searching across ${allAgents.length} agents`);

    const truncate = (s: string, max: number) =>
      s && s.length > max ? `${s.slice(0, max)}…` : s;

    const agentsForPrompt = allAgents.slice(0, 60).map((a: Record<string, string>) => ({
      id: a.id,
      name: a.name,
      role: truncate(a.role ?? "", 80),
      strengths: truncate(a.strengths ?? "", 220),
      identity: truncate(a.identity ?? "", 220),
      behavior: truncate(a.behavior ?? "", 220),
      constraints: truncate(a.constraints ?? "", 220),
    }));

    const systemInstruction =
      `You are an agent search engine for a writing application.\n` +
      `Given a user's description of the kind of monkey they want, you must rank the best matching agents.\n` +
      `Return ONLY valid JSON in the exact format:\n` +
      `{\n  "matches": [ { "id": "<agentId>", "score": <number 0..100> }, ... ]\n}\n` +
      `- score reflects match confidence (higher is better)\n` +
      `- Include at most ${topK} matches\n` +
      `- Do not include explanations or any other keys\n` +
      `- IDs must be from the provided agent list\n`;

    const userPrompt =
      `User description:\n${query}\n\n` +
      `Agent profiles (pick the best matches):\n` +
      `${JSON.stringify(agentsForPrompt)}\n\n` +
      `Rank the agents that best match the user's description.`;

    const text = await generateText(systemInstruction, userPrompt);

    const jsonCandidate = text.match(/\{[\s\S]*\}/)?.[0];
    if (jsonCandidate) {
      try {
        const parsed = JSON.parse(jsonCandidate) as {
          matches?: Array<{ id: string; score: number }>;
        };
        const matches = parsed.matches ?? [];
        const validIds = new Set(allAgents.map((a: Record<string, string>) => a.id));

        const cleaned = matches
          .filter(
            (m) =>
              m && typeof m.id === "string" && typeof m.score === "number",
          )
          .filter((m) => validIds.has(m.id))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        console.log(`[agent-search] LLM returned ${cleaned.length} matches`);
        return new Response(JSON.stringify({ matches: cleaned }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        console.warn("[agent-search] LLM returned unparseable JSON, falling back to token scoring");
      }
    }

    // Fallback: lightweight token scoring
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 10);

    const scored = allAgents
      .map((a: Record<string, string>) => {
        const blob =
          `${a.name} ${a.role} ${a.strengths} ${a.identity} ${a.behavior} ${a.constraints}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (!t) continue;
          if (blob.includes(t)) score += Math.min(20, 2 + t.length);
        }
        return { id: a.id, score };
      })
      .filter((x: { score: number }) => x.score > 0)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, topK);

    console.log(`[agent-search] token fallback returned ${scored.length} matches`);
    return new Response(JSON.stringify({ matches: scored }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[agent-search] unhandled error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Failed to search agents", details: msg.slice(0, 400) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
