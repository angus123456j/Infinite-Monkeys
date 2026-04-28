import { supabase } from "./supabase";
import { requireUserId } from "./auth";
import type { AgentInvocationLogEntry } from "../components/AgentInvocationTimeline";
import { parseMonkeyTimeline } from "./monkeyTimeline";

export interface ContextItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: number;
  lastUsedAt: number | null;
  monkeyTimeline?: AgentInvocationLogEntry[];
}

interface DbContext {
  id: string;
  title: string;
  description: string;
  tags: string[] | string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  monkeyTimeline?: unknown;
}

function toContextItem(c: DbContext): ContextItem {
  return {
    id: c.id,
    title: c.title,
    description: c.description ?? "",
    tags: Array.isArray(c.tags) ? c.tags : [],
    createdAt: new Date(c.createdAt).getTime(),
    lastUsedAt: c.lastUsedAt ? new Date(c.lastUsedAt).getTime() : null,
    monkeyTimeline: parseMonkeyTimeline(c.monkeyTimeline),
  };
}

export async function listContexts(): Promise<ContextItem[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("contexts")
    .select("*")
    .eq("user_id", userId)
    .order("lastUsedAt", { ascending: false, nullsFirst: false })
    .order("createdAt", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DbContext[]).map(toContextItem);
}

export async function getContext(id: string): Promise<ContextItem | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("contexts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error) return null;
  return toContextItem(data as DbContext);
}

export async function createContext(partial?: {
  title?: string;
  description?: string;
  tags?: string[];
}): Promise<ContextItem> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("contexts")
    .insert({
      user_id: userId,
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
  if (updates.monkeyTimeline !== undefined) body.monkeyTimeline = updates.monkeyTimeline;
  const userId = await requireUserId();
  const { error } = await supabase
    .from("contexts")
    .update(body)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteContext(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("contexts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
