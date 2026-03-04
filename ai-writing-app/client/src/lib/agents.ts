export interface AgentMeta {
  id: string;
  name: string;
  role: string;
  strengths: string;
  avatar?: string;
  /** Combined prompt built from identity, behavior, and constraints. */
  defaultPrompt: string;
  /** Who this monkey is, voice, background, etc. */
  identity: string;
  /** How this monkey should behave and respond. */
  behavior: string;
  /** Guardrails and things this monkey must avoid. */
  constraints: string;
  createdAt: number;
  updatedAt: number;
}

const AGENTS_STORAGE_KEY = "infinite-monkeys-agents";

function loadAgents(): AgentMeta[] {
  try {
    const raw = localStorage.getItem(AGENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AgentMeta[];
    return parsed.map((a) => ({
      ...a,
      // Backwards compatibility for older agents without structured fields
      identity: a.identity ?? "",
      behavior: a.behavior ?? "",
      constraints: a.constraints ?? "",
      updatedAt: a.updatedAt ?? a.createdAt ?? Date.now(),
    }));
  } catch {
    return [];
  }
}

function saveAgents(items: AgentMeta[]) {
  localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(items));
}

export function listAgents(): AgentMeta[] {
  return loadAgents().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getAgent(id: string): AgentMeta | undefined {
  return loadAgents().find((a) => a.id === id);
}

export function createAgent(partial?: {
  name?: string;
  role?: string;
  strengths?: string;
  defaultPrompt?: string;
  avatar?: string;
}): AgentMeta {
  const agents = loadAgents();
  const now = Date.now();
  const id = `agent-${now}-${Math.random().toString(36).slice(2, 9)}`;
  const identity = "";
  const behavior = "";
  const constraints = "";
  const agent: AgentMeta = {
    id,
    name: partial?.name?.trim() || "New monkey",
    role: partial?.role ?? "Generalist",
    strengths: partial?.strengths ?? "",
    avatar: partial?.avatar,
    defaultPrompt:
      partial?.defaultPrompt ??
      buildDefaultPrompt(identity, behavior, constraints),
    identity,
    behavior,
    constraints,
    createdAt: now,
    updatedAt: now,
  };
  agents.unshift(agent);
  saveAgents(agents);
  return agent;
}

export function updateAgent(id: string, updates: Partial<Omit<AgentMeta, "id" | "createdAt">>) {
  const agents = loadAgents();
  const agent = agents.find((a) => a.id === id);
  if (!agent) return;
  if (updates.name !== undefined) agent.name = updates.name;
  if (updates.role !== undefined) agent.role = updates.role;
  if (updates.strengths !== undefined) agent.strengths = updates.strengths;
  if (updates.identity !== undefined) agent.identity = updates.identity;
  if (updates.behavior !== undefined) agent.behavior = updates.behavior;
  if (updates.constraints !== undefined) agent.constraints = updates.constraints;
  if (updates.defaultPrompt !== undefined) {
    agent.defaultPrompt = updates.defaultPrompt;
  } else {
    // Keep defaultPrompt in sync when structured fields change.
    agent.defaultPrompt = buildDefaultPrompt(
      agent.identity,
      agent.behavior,
      agent.constraints
    );
  }
  if (updates.avatar !== undefined) agent.avatar = updates.avatar;
  agent.updatedAt = Date.now();
  saveAgents(agents);
}

function buildDefaultPrompt(identity: string, behavior: string, constraints: string): string {
  const sections: string[] = [];
  if (identity.trim()) {
    sections.push(`Identity:\n${identity.trim()}`);
  }
  if (behavior.trim()) {
    sections.push(`Behavior:\n${behavior.trim()}`);
  }
  if (constraints.trim()) {
    sections.push(`Constraints:\n${constraints.trim()}`);
  }
  return sections.join("\n\n");
}

export function deleteAgent(id: string) {
  const agents = loadAgents().filter((a) => a.id !== id);
  saveAgents(agents);
}

