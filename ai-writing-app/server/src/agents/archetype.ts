export const AGENT_ARCHETYPES = [
  "Specialist",
  "Synonym Specialist",
  "Orchestrator",
  "Critic",
] as const;

export type AgentArchetype = (typeof AGENT_ARCHETYPES)[number];

function isSynonymSenseiName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("synonym sensei");
}

export function normalizeArchetype(
  nameRaw: unknown,
  roleRaw: unknown
): AgentArchetype {
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (name && isSynonymSenseiName(name)) return "Synonym Specialist";

  const role = typeof roleRaw === "string" ? roleRaw.trim() : "";
  if (role === "Generalist" || !role) return "Specialist";
  if (AGENT_ARCHETYPES.includes(role as AgentArchetype)) {
    return role as AgentArchetype;
  }

  return "Specialist";
}

