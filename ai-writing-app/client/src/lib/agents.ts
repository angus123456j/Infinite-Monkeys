import { apiFetch } from "./api";

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

interface ApiAgent {
  id: string;
  name: string;
  role: string;
  strengths: string;
  avatar?: string | null;
  defaultPrompt: string;
  identity: string;
  behavior: string;
  constraints: string;
  createdAt: string;
  updatedAt: string;
}

function mapFromApi(a: ApiAgent): AgentMeta {
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
  const list = await apiFetch<ApiAgent[]>("/api/agents");
  return list.map(mapFromApi).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getAgent(id: string): Promise<AgentMeta | null> {
  try {
    const a = await apiFetch<ApiAgent>(`/api/agents/${id}`);
    return mapFromApi(a);
  } catch {
    return null;
  }
}

export async function createAgent(partial?: {
  name?: string;
  role?: string;
  strengths?: string;
  defaultPrompt?: string;
  avatar?: string;
}): Promise<AgentMeta> {
  const a = await apiFetch<ApiAgent>("/api/agents", {
    method: "POST",
    body: JSON.stringify({
      name: partial?.name?.trim() || "New monkey",
      role: partial?.role ?? "Generalist",
      strengths: partial?.strengths ?? "",
      avatar: partial?.avatar ?? null,
      defaultPrompt: partial?.defaultPrompt ?? "",
      identity: "",
      behavior: "",
      constraints: "",
    }),
  });
  return mapFromApi(a);
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
    // Rebuild defaultPrompt from the fields we know about.
    // We need the current values for fields not in `updates`, so fetch first.
    const current = await getAgent(id);
    if (current) {
      body.defaultPrompt = buildDefaultPrompt(
        updates.identity ?? current.identity,
        updates.behavior ?? current.behavior,
        updates.constraints ?? current.constraints
      );
    }
  }
  await apiFetch(`/api/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  await apiFetch(`/api/agents/${id}`, { method: "DELETE" });
}

export interface AgentSearchMatch {
  id: string;
  score: number;
}

export async function searchAgents(
  query: string,
  topK = 10
): Promise<AgentSearchMatch[]> {
  const data = await apiFetch<{ matches: AgentSearchMatch[] }>(
    "/api/agents/search",
    {
      method: "POST",
      body: JSON.stringify({ query, topK }),
    }
  );
  return data.matches;
}
