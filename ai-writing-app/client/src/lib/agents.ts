import { supabase } from "./supabase";

export const AGENT_ARCHETYPES = [
  "Specialist",
  "Synonym Specialist",
  "Orchestrator",
  "Critic",
] as const;
export type AgentArchetype = (typeof AGENT_ARCHETYPES)[number];

export function archetypeDescription(role: string): string {
  if (role === "Specialist") {
    return "Acts only on highlighted text. Executes one focused transformation within the selected region.";
  }
  if (role === "Synonym Specialist") {
    return "A Specialist subtype. Replaces highlighted words by reading the full sentence around them to preserve meaning and tone.";
  }
  if (role === "Orchestrator") {
    return "Higher-order monkey. Operates across the broader document context and delegates tasks to Specialist monkeys when multi-step coordination is needed.";
  }
  if (role === "Critic") {
    return "Persistent evaluator. Continuously analyzes writing quality across the document and scores clarity, diction, tone, professionalism, and structural strength.";
  }
  return "Acts only on highlighted text. Executes one focused transformation within the selected region.";
}

export interface AgentMeta {
  id: string;
  name: string;
  role: string;
  strengths: string;
  avatar?: string;
  defaultPrompt: string;
  identity: string;
  behavior: string;
  constraints: string;
  createdAt: number;
  updatedAt: number;
}

interface DbAgent {
  id: string;
  name: string;
  role: string;
  strengths: string;
  avatar: string | null;
  defaultPrompt: string;
  identity: string;
  behavior: string;
  constraints: string;
  createdAt: string;
  updatedAt: string;
}

function toAgentMeta(a: DbAgent): AgentMeta {
  return {
    id: a.id,
    name: a.name,
    role: a.role,
    strengths: a.strengths ?? "",
    avatar: a.avatar ?? undefined,
    defaultPrompt: a.defaultPrompt ?? "",
    identity: a.identity ?? "",
    behavior: a.behavior ?? "",
    constraints: a.constraints ?? "",
    createdAt: new Date(a.createdAt).getTime(),
    updatedAt: new Date(a.updatedAt).getTime(),
  };
}

function buildDefaultPrompt(identity: string, behavior: string, constraints: string): string {
  const sections: string[] = [];
  if (identity.trim()) sections.push(`Identity:\n${identity.trim()}`);
  if (behavior.trim()) sections.push(`Behavior:\n${behavior.trim()}`);
  if (constraints.trim()) sections.push(`Constraints:\n${constraints.trim()}`);
  return sections.join("\n\n");
}

export async function listAgents(): Promise<AgentMeta[]> {
  const { data, error } = await supabase
    .from("monkey_agents")
    .select("*")
    .order("updatedAt", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DbAgent[]).map(toAgentMeta);
}

export async function getAgent(id: string): Promise<AgentMeta | null> {
  const { data, error } = await supabase
    .from("monkey_agents")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return toAgentMeta(data as DbAgent);
}

export async function createAgent(partial?: {
  name?: string;
  role?: AgentArchetype;
  strengths?: string;
  defaultPrompt?: string;
  avatar?: string;
}): Promise<AgentMeta> {
  const { data, error } = await supabase
    .from("monkey_agents")
    .insert({
      name: partial?.name?.trim() || "New monkey",
      role: partial?.role ?? "Specialist",
      strengths: partial?.strengths ?? "",
      avatar: partial?.avatar ?? null,
      defaultPrompt: partial?.defaultPrompt ?? "",
      identity: "",
      behavior: "",
      constraints: "",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toAgentMeta(data as DbAgent);
}

export async function updateAgent(
  id: string,
  updates: Partial<Omit<AgentMeta, "id" | "createdAt">>
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.name !== undefined) body.name = updates.name;
  if (updates.role !== undefined) body.role = updates.role;
  if (updates.strengths !== undefined) body.strengths = updates.strengths;
  if (updates.avatar !== undefined) body.avatar = updates.avatar;
  if (updates.identity !== undefined) body.identity = updates.identity;
  if (updates.behavior !== undefined) body.behavior = updates.behavior;
  if (updates.constraints !== undefined) body.constraints = updates.constraints;
  if (updates.defaultPrompt !== undefined) {
    body.defaultPrompt = updates.defaultPrompt;
  } else if (
    updates.identity !== undefined ||
    updates.behavior !== undefined ||
    updates.constraints !== undefined
  ) {
    const current = await getAgent(id);
    if (current) {
      body.defaultPrompt = buildDefaultPrompt(
        updates.identity ?? current.identity,
        updates.behavior ?? current.behavior,
        updates.constraints ?? current.constraints
      );
    }
  }
  const { error } = await supabase
    .from("monkey_agents")
    .update(body)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAgent(id: string): Promise<void> {
  const { error } = await supabase.from("monkey_agents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ——— Search (still hits Express server — uses LLM) ———

export interface AgentSearchMatch {
  id: string;
  score: number;
}

export async function searchAgents(
  query: string,
  topK = 10
): Promise<AgentSearchMatch[]> {
  const { data, error } = await supabase.functions.invoke("agent-search", {
    body: { query, topK },
  });
  if (error) throw error;
  return (data as { matches: AgentSearchMatch[] }).matches;
}
