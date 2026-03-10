import { apiFetch } from "./api";

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
}

function mapDocFromApi(d: {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  folderId?: string | null;
}): DocMeta {
  return {
    id: d.id,
    title: d.title,
    createdAt: new Date(d.createdAt).getTime(),
    updatedAt: new Date(d.updatedAt).getTime(),
    folderId: d.folderId ?? null,
  };
}

const FOLDERS_STORAGE_KEY = "infinite-monkeys-folders";

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

// ——— Documents (API) ———

export async function listDocs(): Promise<DocMeta[]> {
  const list = (await apiFetch<Array<{ id: string; title: string; createdAt: string; updatedAt: string; folderId?: string | null }>>(
    "/api/documents"
  )) as Array<{ id: string; title: string; createdAt: string; updatedAt: string; folderId?: string | null }>;
  return list.map(mapDocFromApi).sort((a, b) => b.createdAt - a.createdAt);
}

export async function createDoc(options?: {
  title?: string;
  folderId?: string | null;
}): Promise<DocMeta> {
  const title = options?.title?.trim() || "Untitled document";
  const folderId = options?.folderId ?? null;
  const d = await apiFetch<{ id: string; title: string; createdAt: string; updatedAt: string; folderId?: string | null }>(
    "/api/documents",
    {
      method: "POST",
      body: JSON.stringify({
        title,
        content: "<p></p>",
        folderId,
      }),
    }
  );
  return mapDocFromApi(d);
}

export async function getDoc(id: string): Promise<DocMeta | null> {
  try {
    const d = await apiFetch<{ id: string; title: string; createdAt: string; updatedAt: string; folderId?: string | null }>(
      `/api/documents/${id}`
    );
    return mapDocFromApi(d);
  } catch {
    return null;
  }
}

/** Fetch full document including content (for editor). */
export async function getDocument(id: string): Promise<DocumentWithContent | null> {
  try {
    const d = await apiFetch<{
      id: string;
      title: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      folderId?: string | null;
    }>(`/api/documents/${id}`);
    return {
      ...mapDocFromApi(d),
      content: d.content ?? "<p></p>",
    };
  } catch {
    return null;
  }
}

export async function deleteDoc(id: string): Promise<void> {
  await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
}

export async function updateDocTitle(id: string, title: string): Promise<void> {
  await apiFetch(`/api/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function saveDoc(
  id: string,
  updates: { title?: string; content?: string; folderId?: string | null }
): Promise<void> {
  await apiFetch(`/api/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** List documents in the given folder (root when folderId is null). */
export function listDocsInFolder(docs: DocMeta[], folderId: string | null): DocMeta[] {
  return docs
    .filter((d) => (d.folderId ?? null) === folderId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function moveDoc(id: string, targetFolderId: string | null): Promise<void> {
  await apiFetch(`/api/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ folderId: targetFolderId }),
  });
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

  // Move documents in deleted folders to root (or delete them — we move to root)
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
