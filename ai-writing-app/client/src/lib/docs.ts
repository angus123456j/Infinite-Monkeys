import { supabase } from "./supabase";
import type { AgentInvocationLogEntry } from "../components/AgentInvocationTimeline";
import { requireUserId } from "./auth";

export interface DocMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Folder this doc belongs to; null or undefined means root. */
  folderId?: string | null;
}

export interface FolderMeta {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Full document from API (meta + content). */
export interface DocumentWithContent extends DocMeta {
  content: string;
  /** Raw timeline JSON from API; normalize with `parseMonkeyTimeline` from `lib/monkeyTimeline`. */
  monkeyTimeline?: unknown;
}

interface DbDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  folderId: string | null;
  monkeyTimeline: unknown;
}

function toDocMeta(d: DbDocument): DocMeta {
  return {
    id: d.id,
    title: d.title,
    createdAt: new Date(d.createdAt).getTime(),
    updatedAt: new Date(d.updatedAt).getTime(),
    folderId: d.folderId ?? null,
  };
}

const FOLDERS_STORAGE_KEY = "infinite-monkeys-folders";
const FOLDERS_OWNER_STORAGE_KEY = "infinite-monkeys-folders-owner";

/**
 * Folders are stored in localStorage (for now). Since localStorage is shared across
 * accounts in the same browser, we scope the stored folder tree to the current user.
 */
export function ensureFolderStorageForUser(userId: string) {
  try {
    const prev = localStorage.getItem(FOLDERS_OWNER_STORAGE_KEY);
    if (prev && prev === userId) return;
    localStorage.setItem(FOLDERS_OWNER_STORAGE_KEY, userId);
    localStorage.removeItem(FOLDERS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function loadFolders(): FolderMeta[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FolderMeta[];
    return parsed.map((f) => ({
      ...f,
      parentId: f.parentId ?? null,
      updatedAt: f.updatedAt ?? f.createdAt ?? Date.now(),
    }));
  } catch {
    return [];
  }
}

function saveFolders(folders: FolderMeta[]) {
  localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
}

// ——— Documents (Supabase) ———

export async function listDocs(): Promise<DocMeta[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, createdAt, updatedAt, folderId")
    .eq("user_id", userId)
    .order("createdAt", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DbDocument[]).map(toDocMeta);
}

export async function createDoc(options?: {
  title?: string;
  folderId?: string | null;
}): Promise<DocMeta> {
  const userId = await requireUserId();
  const title = options?.title?.trim() || "Untitled document";
  const folderId = options?.folderId ?? null;
  const { data, error } = await supabase
    .from("documents")
    .insert({ user_id: userId, title, content: "<p></p>", folderId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toDocMeta(data as DbDocument);
}

export async function getDoc(id: string): Promise<DocMeta | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, createdAt, updatedAt, folderId")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error) return null;
  return toDocMeta(data as DbDocument);
}

/** Fetch full document including content (for editor). */
export async function getDocument(id: string): Promise<DocumentWithContent | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error) return null;
  const d = data as DbDocument;
  return {
    ...toDocMeta(d),
    content: d.content ?? "<p></p>",
    monkeyTimeline: d.monkeyTimeline,
  };
}

export async function deleteDoc(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function updateDocTitle(id: string, title: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("documents")
    .update({ title })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function saveDoc(
  id: string,
  updates: {
    title?: string;
    content?: string;
    folderId?: string | null;
    monkeyTimeline?: AgentInvocationLogEntry[];
  }
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("documents")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** List documents in the given folder (root when folderId is null). */
export function listDocsInFolder(docs: DocMeta[], folderId: string | null): DocMeta[] {
  return docs
    .filter((d) => (d.folderId ?? null) === folderId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function moveDoc(id: string, targetFolderId: string | null): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("documents")
    .update({ folderId: targetFolderId })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ——— Folders (localStorage for now) ———

/** List folders directly under the given parent (root when parentId is null). */
export function listFolders(parentId: string | null): FolderMeta[] {
  return loadFolders()
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createFolder(parentId: string | null, name: string): FolderMeta {
  const folders = loadFolders();
  const now = Date.now();
  const id = `folder-${now}-${Math.random().toString(36).slice(2, 9)}`;
  const folder: FolderMeta = { id, name, parentId, createdAt: now, updatedAt: now };
  folders.push(folder);
  saveFolders(folders);
  return folder;
}

export function renameFolder(id: string, name: string) {
  const folders = loadFolders();
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;
  folder.name = name;
  folder.updatedAt = Date.now();
  saveFolders(folders);
}

/** Move a folder under a new parent (null for root). */
export function moveFolder(id: string, parentId: string | null) {
  const folders = loadFolders();
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;
  folder.parentId = parentId;
  folder.updatedAt = Date.now();
  saveFolders(folders);
}

/** Delete a folder and all of its descendant folders and documents (in DB we only unlink docs in this folder; folders are local). */
export async function deleteFolder(id: string) {
  const folders = loadFolders();
  const docs = await listDocs();

  const toDelete = new Set<string>();
  function collect(folderId: string) {
    if (toDelete.has(folderId)) return;
    toDelete.add(folderId);
    folders
      .filter((f) => f.parentId === folderId)
      .forEach((child) => collect(child.id));
  }
  collect(id);

  const remainingFolders = folders.filter((f) => !toDelete.has(f.id));
  saveFolders(remainingFolders);

  for (const doc of docs) {
    if (doc.folderId && toDelete.has(doc.folderId)) {
      await moveDoc(doc.id, null);
    }
  }
}

/** List all folders (unsorted by parent). */
export function listAllFolders(): FolderMeta[] {
  return loadFolders().sort((a, b) => a.name.localeCompare(b.name));
}
