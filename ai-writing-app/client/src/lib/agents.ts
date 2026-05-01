import { supabase } from "./supabase";
import { requireUserId } from "./auth";

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
  userId?: string | null;
  isTemplate?: boolean;
  sourceTemplateId?: string | null;
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
  user_id?: string | null;
  is_template?: boolean | null;
  source_template_id?: string | null;
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
    userId: a.user_id ?? null,
    isTemplate: Boolean(a.is_template),
    sourceTemplateId: a.source_template_id ?? null,
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
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("monkey_agents")
    .select("*")
    .or(`is_template.eq.true,user_id.eq.${userId}`)
    .order("updatedAt", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DbAgent[]).map(toAgentMeta);
}

// These are the 3 core monkeys that every new user sees in Drive.
// Must match the template row names in `supabase/seed-agents.sql`.
const BAKED_IN_NAMES = ["Pathos Monkey", "Logic Monkey", "Synonym Sensei"] as const;

export function isBakedInAgentName(name: string): boolean {
  const n = name.trim();
  if (BAKED_IN_NAMES.includes(n as (typeof BAKED_IN_NAMES)[number])) return true;
  const lower = n.toLowerCase();
  if (lower.includes("synonym sensei") || lower.includes("synonym monkey")) return true;
  return false;
}

/** User-owned monkeys created from scratch (Drive “New monkey”), not copies saved from templates. */
export function countUserCustomMonkeys(agents: AgentMeta[]): number {
  return agents.filter((a) => !a.isTemplate && !a.sourceTemplateId).length;
}

/** Drive should show only baked-ins + user-owned agents (saved copies). */
export async function listDriveAgents(): Promise<AgentMeta[]> {
  const userId = await requireUserId();
  const [{ data: templates, error: templateErr }, { data: owned, error: ownedErr }] =
    await Promise.all([
      supabase
        .from("monkey_agents")
        .select("*")
        .eq("is_template", true)
        .is("user_id", null)
        .in("name", [...BAKED_IN_NAMES])
        .order("updatedAt", { ascending: false }),
      supabase
        .from("monkey_agents")
        .select("*")
        .eq("user_id", userId)
        .order("updatedAt", { ascending: false }),
    ]);
  if (templateErr) throw new Error(templateErr.message);
  if (ownedErr) throw new Error(ownedErr.message);
  const all = [...((templates ?? []) as DbAgent[]), ...((owned ?? []) as DbAgent[])].map(toAgentMeta);
  // Dedupe by id (shouldn't collide, but safe).
  const seen = new Set<string>();
  return all.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

/** Neural net should show templates only (including core baked-ins). */
export async function listNetworkAgents(): Promise<AgentMeta[]> {
  await requireUserId();
  const { data, error } = await supabase
    .from("monkey_agents")
    .select("*")
    .eq("is_template", true)
    .is("user_id", null)
    .order("updatedAt", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DbAgent[]).map(toAgentMeta);
}

/** Save/unlock a network agent into Drive by creating a user-owned copy. */
export async function saveAgentFromNetwork(templateId: string): Promise<AgentMeta> {
  const userId = await requireUserId();
  const template = await getAgent(templateId);
  if (!template) throw new Error("Template agent not found.");
  const allowManyCopies = isBakedInAgentName(template.name);
  if (!allowManyCopies) {
    const { data: existing, error: existingErr } = await supabase
      .from("monkey_agents")
      .select("*")
      .eq("user_id", userId)
      .eq("source_template_id", templateId)
      .limit(1);
    if (existingErr) throw new Error(existingErr.message);
    if (existing && existing.length > 0) return toAgentMeta(existing[0] as DbAgent);
  }

  const { data, error } = await supabase
    .from("monkey_agents")
    .insert({
      user_id: userId,
      is_template: false,
      source_template_id: templateId,
      name: template.name,
      role: template.role,
      strengths: template.strengths ?? "",
      avatar: template.avatar ?? null,
      defaultPrompt: template.defaultPrompt ?? "",
      identity: template.identity ?? "",
      behavior: template.behavior ?? "",
      constraints: template.constraints ?? "",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toAgentMeta(data as DbAgent);
}

export async function getAgent(id: string): Promise<AgentMeta | null> {
  await requireUserId();
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
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("monkey_agents")
    .insert({
      user_id: userId,
      is_template: false,
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
  const userId = await requireUserId();
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
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteAgent(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("monkey_agents")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
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
