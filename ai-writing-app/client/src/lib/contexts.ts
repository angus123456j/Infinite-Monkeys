import { supabase } from "./supabase";

export interface ContextItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: number;
  lastUsedAt: number | null;
}

interface DbContext {
  id: string;
  title: string;
  description: string;
  tags: string[] | string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

function toContextItem(c: DbContext): ContextItem {
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
  const { data, error } = await supabase
    .from("contexts")
    .select("*")
    .order("lastUsedAt", { ascending: false, nullsFirst: false })
    .order("createdAt", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DbContext[]).map(toContextItem);
}

export async function getContext(id: string): Promise<ContextItem | null> {
  const { data, error } = await supabase
    .from("contexts")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return toContextItem(data as DbContext);
}

export async function createContext(partial?: {
  title?: string;
  description?: string;
  tags?: string[];
}): Promise<ContextItem> {
  const { data, error } = await supabase
    .from("contexts")
    .insert({
      title: partial?.title?.trim() || "Untitled context",
      description: partial?.description ?? "",
      tags: partial?.tags ?? [],
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toContextItem(data as DbContext);
}

export async function updateContext(
  id: string,
  updates: Partial<Omit<ContextItem, "id" | "createdAt">>
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.tags !== undefined) body.tags = updates.tags;
  if (updates.lastUsedAt !== undefined) {
    body.lastUsedAt = updates.lastUsedAt
      ? new Date(updates.lastUsedAt).toISOString()
      : null;
  }
  const { error } = await supabase
    .from("contexts")
    .update(body)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteContext(id: string): Promise<void> {
  const { error } = await supabase.from("contexts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
