import { apiFetch } from "./api";

export interface ContextItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: number;
  lastUsedAt: number | null;
}

interface ApiContext {
  id: string;
  title: string;
  description: string;
  tags: string[] | string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

function mapFromApi(c: ApiContext): ContextItem {
  return {
    id: c.id,
    title: c.title,
    description: c.description ?? "",
    tags: Array.isArray(c.tags) ? c.tags : [],
    createdAt: new Date(c.createdAt).getTime(),
    lastUsedAt: c.lastUsedAt ? new Date(c.lastUsedAt).getTime() : null,
  };
}

export async function listContexts(): Promise<ContextItem[]> {
  const list = await apiFetch<ApiContext[]>("/api/contexts");
  return list.map(mapFromApi).sort(
    (a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt)
  );
}

export async function getContext(id: string): Promise<ContextItem | null> {
  try {
    const c = await apiFetch<ApiContext>(`/api/contexts/${id}`);
    return mapFromApi(c);
  } catch {
    return null;
  }
}

export async function createContext(partial?: {
  title?: string;
  description?: string;
  tags?: string[];
}): Promise<ContextItem> {
  const c = await apiFetch<ApiContext>("/api/contexts", {
    method: "POST",
    body: JSON.stringify({
      title: partial?.title?.trim() || "Untitled context",
      description: partial?.description ?? "",
      tags: partial?.tags ?? [],
    }),
  });
  return mapFromApi(c);
}

export async function updateContext(
  id: string,
  updates: Partial<Omit<ContextItem, "id" | "createdAt">>
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.tags !== undefined) body.tags = updates.tags;
  if (updates.lastUsedAt !== undefined) body.lastUsedAt = updates.lastUsedAt;
  await apiFetch(`/api/contexts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteContext(id: string): Promise<void> {
  await apiFetch(`/api/contexts/${id}`, { method: "DELETE" });
}
