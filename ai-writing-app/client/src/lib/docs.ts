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

const DOCS_STORAGE_KEY = "infinite-monkeys-docs";
const FOLDERS_STORAGE_KEY = "infinite-monkeys-folders";

function loadDocs(): DocMeta[] {
  try {
    const raw = localStorage.getItem(DOCS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DocMeta[];
    // Backwards compatibility for older docs without updatedAt/folderId
    return parsed.map((d) => ({
      ...d,
      updatedAt: d.updatedAt ?? d.createdAt ?? Date.now(),
      folderId: d.folderId ?? null,
    }));
  } catch {
    return [];
  }
}

function saveDocs(docs: DocMeta[]) {
  localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(docs));
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

export function listDocs(): DocMeta[] {
  return loadDocs().sort((a, b) => b.createdAt - a.createdAt);
}

export function createDoc(): DocMeta {
  const docs = loadDocs();
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();
  const meta: DocMeta = {
    id,
    title: "Untitled document",
    createdAt: now,
    updatedAt: now,
    folderId: null,
  };
  docs.unshift(meta);
  saveDocs(docs);
  return meta;
}

export function getDoc(id: string): DocMeta | undefined {
  return loadDocs().find((d) => d.id === id);
}

export function deleteDoc(id: string) {
  const docs = loadDocs().filter((d) => d.id !== id);
  saveDocs(docs);
}

export function updateDocTitle(id: string, title: string) {
  const docs = loadDocs();
  const meta = docs.find((d) => d.id === id);
  if (!meta) return;
  meta.title = title;
  meta.updatedAt = Date.now();
  saveDocs(docs);
}

/** List documents in the given folder (root when folderId is null). */
export function listDocsInFolder(folderId: string | null): DocMeta[] {
  return loadDocs()
    .filter((d) => (d.folderId ?? null) === folderId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Move a document into a different folder (null for root). */
export function moveDoc(id: string, targetFolderId: string | null) {
  const docs = loadDocs();
  const meta = docs.find((d) => d.id === id);
  if (!meta) return;
  meta.folderId = targetFolderId;
  meta.updatedAt = Date.now();
  saveDocs(docs);
}

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

/** Delete a folder and all of its descendant folders and documents. */
export function deleteFolder(id: string) {
  const folders = loadFolders();
  const docs = loadDocs();

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
  const remainingDocs = docs.filter(
    (d) => !d.folderId || !toDelete.has(d.folderId)
  );

  saveFolders(remainingFolders);
  saveDocs(remainingDocs);
}

/** List all folders (unsorted by parent). */
export function listAllFolders(): FolderMeta[] {
  return loadFolders().sort((a, b) => a.name.localeCompare(b.name));
}
