export interface ContextItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: number;
  lastUsedAt: number | null;
}

const CONTEXTS_STORAGE_KEY = "infinite-monkeys-contexts";

function loadContexts(): ContextItem[] {
  try {
    const raw = localStorage.getItem(CONTEXTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ContextItem[];
    return parsed.map((c) => ({
      ...c,
      tags: c.tags ?? [],
      lastUsedAt: c.lastUsedAt ?? null,
    }));
  } catch {
    return [];
  }
}

function saveContexts(items: ContextItem[]) {
  localStorage.setItem(CONTEXTS_STORAGE_KEY, JSON.stringify(items));
}

export function listContexts(): ContextItem[] {
  return loadContexts().sort(
    (a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt)
  );
}

export function getContext(id: string): ContextItem | undefined {
  return loadContexts().find((c) => c.id === id);
}

export function createContext(partial?: {
  title?: string;
  description?: string;
  tags?: string[];
}): ContextItem {
  const items = loadContexts();
  const now = Date.now();
  const id = `ctx-${now}-${Math.random().toString(36).slice(2, 9)}`;
  const item: ContextItem = {
    id,
    title: partial?.title?.trim() || "Untitled context",
    description: partial?.description ?? "",
    tags: partial?.tags ?? [],
    createdAt: now,
    lastUsedAt: null,
  };
  items.unshift(item);
  saveContexts(items);
  return item;
}

export function updateContext(id: string, updates: Partial<Omit<ContextItem, "id" | "createdAt">>) {
  const items = loadContexts();
  const item = items.find((c) => c.id === id);
  if (!item) return;
  if (updates.title !== undefined) item.title = updates.title;
  if (updates.description !== undefined) item.description = updates.description;
  if (updates.tags !== undefined) item.tags = updates.tags;
  if (updates.lastUsedAt !== undefined) item.lastUsedAt = updates.lastUsedAt;
  saveContexts(items);
}

export function deleteContext(id: string) {
  const items = loadContexts().filter((c) => c.id !== id);
  saveContexts(items);
}

