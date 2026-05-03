import { useEffect, useRef, useState, type ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  listDocs,
  createDoc,
  type DocMeta,
  type FolderMeta,
  listAllFolders,
  ensureFolderStorageForUser,
  createFolder,
  deleteDoc,
  deleteFolder,
} from "../lib/docs";
import { isRegisteredSession, requireUserId } from "../lib/auth";
import { listContexts, createContext, deleteContext, type ContextItem } from "../lib/contexts";
import {
  isBakedInAgentName,
  listDriveAgents,
  createAgent,
  countUserCustomMonkeys,
  deleteAgent,
  type AgentMeta,
} from "../lib/agents";
import { redirectToStripeBillingPortal } from "../lib/billingPortal";
import {
  getMySubscription,
  type SubscriptionTier,
} from "../lib/subscriptions";
import UpgradeModal from "../components/UpgradeModal";
import {
  FREE_TIER_MAX_DOCUMENTS,
  contextLimitForTier,
  customMonkeyLimitForTier,
} from "../lib/freeTierLimits";


function truncateDisplayName(value: string, maxChars = 20): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [contextSearch, setContextSearch] = useState("");
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [agentSearch, setAgentSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const driveParam = searchParams.get("drive");
  const [activeDrive, _setActiveDrive] = useState<"documents" | "context" | "agents">(
    driveParam === "context" || driveParam === "agents" ? driveParam : "documents"
  );
  const setActiveDrive = (drive: "documents" | "context" | "agents") => {
    _setActiveDrive(drive);
    setSearchParams(drive === "documents" ? {} : { drive }, { replace: true });
  };
  const [isNewDocModalOpen, setIsNewDocModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("Untitled document");
  const [isNewAgentModalOpen, setIsNewAgentModalOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("New monkey");
  const [isNewContextModalOpen, setIsNewContextModalOpen] = useState(false);
  const [newContextTitle, setNewContextTitle] = useState("Untitled context");
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("New folder");

  const [isDeleteContextModalOpen, setIsDeleteContextModalOpen] = useState(false);
  const [deleteContextId, setDeleteContextId] = useState<string | null>(null);
  const [deleteContextTitle, setDeleteContextTitle] = useState("");
  const [deleteContextTypedTitle, setDeleteContextTypedTitle] = useState("");

  const [isDeleteAgentModalOpen, setIsDeleteAgentModalOpen] = useState(false);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [deleteAgentTitle, setDeleteAgentTitle] = useState("");
  const [deleteAgentTypedTitle, setDeleteAgentTypedTitle] = useState("");
  const [isDeleteFolderModalOpen, setIsDeleteFolderModalOpen] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [deleteFolderTitle, setDeleteFolderTitle] = useState("");
  const [deleteFolderTypedTitle, setDeleteFolderTypedTitle] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [subTier, setSubTier] = useState<SubscriptionTier>("free");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const [driveMenuOpen, setDriveMenuOpen] = useState(false);
  const driveMenuRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  // Guide now lives on a dedicated docs-style page.

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!isRegisteredSession(data.session)) navigate("/?skipIntro=1", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!isRegisteredSession(session)) navigate("/?skipIntro=1", { replace: true });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (!driveMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (driveMenuRef.current && !driveMenuRef.current.contains(e.target as Node)) {
        setDriveMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDriveMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [driveMenuOpen]);

  useEffect(() => {
    getMySubscription()
      .then((row) => setSubTier(row?.tier ?? "free"))
      .catch(() => setSubTier("free"));
  }, []);

  useEffect(() => {
    void requireUserId()
      .then((uid) => {
        ensureFolderStorageForUser(uid);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        setFolders(listAllFolders());
        setActiveFolderId(null);
      });

    listDocs()
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
    listContexts()
      .then(setContexts)
      .catch(() => setContexts([]));
    listDriveAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  function handleNewDoc() {
    setNewDocTitle("Untitled document");
    setIsNewDocModalOpen(true);
  }

  async function handleConfirmNewDoc() {
    try {
      if (subTier === "free" && docs.length >= FREE_TIER_MAX_DOCUMENTS) {
        setUpgradeReason(
          `Free accounts can have up to ${FREE_TIER_MAX_DOCUMENTS} documents. Upgrade to create more.`,
        );
        setUpgradeModalOpen(true);
        return;
      }
      const title = newDocTitle.trim() || "Untitled document";
      const meta = await createDoc({ title, folderId: activeFolderId });
      setIsNewDocModalOpen(false);
      listDocs().then(setDocs);
      navigate(`/doc/${meta.id}`);
    } catch (err) {
      console.error("Failed to create document:", err);
    }
  }

  function handleCancelNewDoc() {
    setIsNewDocModalOpen(false);
  }

  async function handleDeleteDoc(id: string) {
    try {
      await deleteDoc(id);
      listDocs().then(setDocs);
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  }

  function handleNewFolder() {
    setNewFolderName("New folder");
    setIsNewFolderModalOpen(true);
  }

  function handleConfirmNewFolder() {
    const name = newFolderName.trim() || "New folder";
    createFolder(activeFolderId, name);
    setFolders(listAllFolders());
    setIsNewFolderModalOpen(false);
  }

  function handleCancelNewFolder() {
    setIsNewFolderModalOpen(false);
  }

  function handleDeleteFolder(id: string) {
    const folder = folders.find((f) => f.id === id);
    setDeleteFolderId(id);
    setDeleteFolderTitle(folder?.name ?? "");
    setDeleteFolderTypedTitle("");
    setIsDeleteFolderModalOpen(true);
  }

  function handleCancelDeleteFolder() {
    setIsDeleteFolderModalOpen(false);
    setDeleteFolderId(null);
    setDeleteFolderTitle("");
    setDeleteFolderTypedTitle("");
  }

  async function handleConfirmDeleteFolder() {
    if (!deleteFolderId) return;
    if (deleteFolderTypedTitle.trim() !== deleteFolderTitle.trim()) return;
    try {
      await deleteFolder(deleteFolderId);
      setFolders(listAllFolders());
      listDocs().then(setDocs);
      if (activeFolderId === deleteFolderId) {
        setActiveFolderId(null);
      }
      handleCancelDeleteFolder();
    } catch (err) {
      console.error("Failed to delete folder:", err);
    }
  }

  function handleNewContext() {
    setNewContextTitle("Untitled context");
    setIsNewContextModalOpen(true);
  }

  async function handleConfirmNewContext() {
    try {
      const limit = contextLimitForTier(subTier);
      if (limit != null && contexts.length >= limit) {
        setUpgradeReason(
          `Your plan can have up to ${limit} context books. Upgrade to create more.`,
        );
        setUpgradeModalOpen(true);
        return;
      }
      const title = newContextTitle.trim() || "Untitled context";
      const item = await createContext({ title });
      setIsNewContextModalOpen(false);
      listContexts().then(setContexts);
      navigate(`/context/${item.id}`);
    } catch (err) {
      console.error("Failed to create context:", err);
    }
  }

  function handleCancelNewContext() {
    setIsNewContextModalOpen(false);
  }

  async function handleContextDelete(id: string, title: string) {
    setDeleteContextId(id);
    setDeleteContextTitle(title);
    setDeleteContextTypedTitle("");
    setIsDeleteContextModalOpen(true);
  }

  function handleCancelDeleteContext() {
    setIsDeleteContextModalOpen(false);
    setDeleteContextId(null);
    setDeleteContextTitle("");
    setDeleteContextTypedTitle("");
  }

  async function handleConfirmDeleteContext() {
    if (!deleteContextId) return;
    if (deleteContextTypedTitle.trim() !== deleteContextTitle.trim()) return;

    try {
      await deleteContext(deleteContextId);
      setIsDeleteContextModalOpen(false);
      setDeleteContextId(null);
      setDeleteContextTitle("");
      setDeleteContextTypedTitle("");
      listContexts().then(setContexts);
    } catch (err) {
      console.error("Failed to delete context:", err);
    }
  }

  const filteredContexts = contexts.filter((ctx) => {
    const q = contextSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      ctx.title.toLowerCase().includes(q) ||
      ctx.description.toLowerCase().includes(q) ||
      ctx.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const filteredDocs = docs.filter((doc) => {
    if ((doc.folderId ?? null) !== activeFolderId) return false;
    const q = docSearch.trim().toLowerCase();
    if (!q) return true;
    return doc.title.toLowerCase().includes(q);
  });

  const filteredAgents = agents.filter((agent) => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      agent.name.toLowerCase().includes(q) ||
      agent.role.toLowerCase().includes(q) ||
      agent.strengths.toLowerCase().includes(q)
    );
  });

  function handleNewAgent() {
    setNewAgentName("New monkey");
    setIsNewAgentModalOpen(true);
  }

  async function handleConfirmNewAgent() {
    try {
      const customCount = countUserCustomMonkeys(agents);
      const limit = customMonkeyLimitForTier(subTier);
      if (limit != null && customCount >= limit) {
        setUpgradeReason(
          subTier === "free"
            ? `Free accounts can create one custom monkey from scratch. You can still save more copies of Pathos Monkey, Logic Monkey, or Synonym Sensei from the network. Upgrade to add more custom monkeys.`
            : `Your plan can create up to ${limit} custom monkeys from scratch. Upgrade to add more.`,
        );
        setUpgradeModalOpen(true);
        return;
      }
      const trimmed = newAgentName.trim() || "New monkey";
      const agent = await createAgent({ name: trimmed });
      setIsNewAgentModalOpen(false);
      listDriveAgents().then(setAgents);
      navigate(`/monkey-agent/${agent.id}`);
    } catch (err) {
      console.error("Failed to create agent:", err);
    }
  }

  function handleCancelNewAgent() {
    setIsNewAgentModalOpen(false);
  }

  async function handleAgentDelete(id: string, title: string) {
    // Core baked-in monkeys are not deletable.
    if (isBakedInAgentName(title)) return;
    setDeleteAgentId(id);
    setDeleteAgentTitle(title);
    setDeleteAgentTypedTitle("");
    setIsDeleteAgentModalOpen(true);
  }

  function handleCancelDeleteAgent() {
    setIsDeleteAgentModalOpen(false);
    setDeleteAgentId(null);
    setDeleteAgentTitle("");
    setDeleteAgentTypedTitle("");
  }

  async function handleConfirmDeleteAgent() {
    if (!deleteAgentId) return;
    if (deleteAgentTypedTitle.trim() !== deleteAgentTitle.trim()) return;

    try {
      await deleteAgent(deleteAgentId);
      setIsDeleteAgentModalOpen(false);
      setDeleteAgentId(null);
      setDeleteAgentTitle("");
      setDeleteAgentTypedTitle("");
      listDriveAgents().then(setAgents);
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
  }

  function renderFolderTree(parentId: string | null, depth = 0): ReactElement[] {
    return folders
      .filter((f) => f.parentId === parentId)
      .map((folder) => (
        <div key={folder.id} className="docs-folder-branch">
          <div
            className={
              activeFolderId === folder.id
                ? "docs-folder-item is-active"
                : "docs-folder-item"
            }
            style={{ paddingLeft: `${depth * 12}px` }}
            onClick={() => setActiveFolderId(folder.id)}
          >
            <img src="/images/folder.png" alt="" className="docs-folder-icon docs-folder-icon-folder" />
            <span className="docs-folder-name">{folder.name}</span>
            <button
              type="button"
              className="docs-folder-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder.id);
              }}
              aria-label="Delete folder"
            >
              ✕
            </button>
          </div>
          {renderFolderTree(folder.id, depth + 1)}
        </div>
      ));
  }

  return (
    <div className="docs-page">
      <header className="docs-header">
        <button
          type="button"
          className="docs-logo"
          onClick={() => navigate("/drive")}
          aria-label="Infinite Monkeys (Drive home)"
        >
          Infinite Monkeys
        </button>
        <div className="docs-header-main">
          <h2 className="docs-title">Infinite Monkeys Drive</h2>
          <div className="docs-drive-tabs" role="tablist" aria-label="Drive type">
            <button
              type="button"
              role="tab"
              aria-selected={activeDrive === "documents"}
              className={
                activeDrive === "documents"
                  ? "docs-drive-tab is-active"
                  : "docs-drive-tab"
              }
              onClick={() => setActiveDrive("documents")}
            >
              Documents
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeDrive === "context"}
              className={
                activeDrive === "context"
                  ? "docs-drive-tab is-active"
                  : "docs-drive-tab"
              }
              onClick={() => setActiveDrive("context")}
            >
              Context Library
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeDrive === "agents"}
              className={
                activeDrive === "agents"
                  ? "docs-drive-tab is-active"
                  : "docs-drive-tab"
              }
              onClick={() => setActiveDrive("agents")}
            >
              Monkey Agents
            </button>
          </div>
        </div>
        <div
          className="docs-header-menu"
          ref={driveMenuRef}
          onMouseEnter={() => setDriveMenuOpen(true)}
          onMouseLeave={() => setDriveMenuOpen(false)}
        >
          <button
            type="button"
            className="docs-header-menu-trigger"
            aria-expanded={driveMenuOpen}
            aria-haspopup="true"
            aria-controls={driveMenuOpen ? "drive-header-menu" : undefined}
            aria-label="Menu"
            onClick={() => setDriveMenuOpen((o) => !o)}
          >
            <span className="docs-header-menu-trigger-bars" aria-hidden>
              <span className="docs-header-menu-trigger-bar" />
              <span className="docs-header-menu-trigger-bar" />
              <span className="docs-header-menu-trigger-bar" />
            </span>
          </button>
          {driveMenuOpen && (
            <div
              id="drive-header-menu"
              className="docs-header-menu-dropdown"
              role="menu"
              aria-label="Account and help"
            >
              {subTier !== "free" && (
                <button
                  type="button"
                  role="menuitem"
                  className="docs-header-menu-item"
                  disabled={portalBusy}
                  onClick={async () => {
                    setPortalBusy(true);
                    try {
                      await redirectToStripeBillingPortal();
                    } catch (e) {
                      console.error(e);
                      window.alert(
                        e instanceof Error ? e.message : "Could not open billing portal.",
                      );
                      setPortalBusy(false);
                    }
                  }}
                >
                  {portalBusy ? "Opening…" : "Manage billing"}
                </button>
              )}
              {(subTier === "free" || subTier === "pro") && (
                <button
                  type="button"
                  role="menuitem"
                  className="docs-header-menu-item"
                  onClick={() => {
                    setDriveMenuOpen(false);
                    navigate("/pricing");
                  }}
                >
                  Upgrade
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="docs-header-menu-item"
                onClick={() => {
                  setDriveMenuOpen(false);
                  navigate("/guide");
                }}
              >
                Total guide
              </button>
              <button
                type="button"
                role="menuitem"
                className="docs-header-menu-item docs-header-menu-item--signout"
                onClick={async () => {
                  setDriveMenuOpen(false);
                  await supabase.auth.signOut();
                  navigate("/?skipIntro=1", { replace: true });
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="docs-main">
        {isNewDocModalOpen && (
          <div className="agent-modal-backdrop">
            <div className="agent-modal">
              <h2 className="agent-modal-title">New Document</h2>
              <label className="agent-modal-label" htmlFor="new-doc-title">
                Document title
              </label>
              <input
                id="new-doc-title"
                type="text"
                className="agent-modal-input"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                autoFocus
              />
              <div className="agent-modal-actions">
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-secondary"
                  onClick={handleCancelNewDoc}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-primary"
                  onClick={handleConfirmNewDoc}
                >
                  Create &amp; open
                </button>
              </div>
            </div>
          </div>
        )}
        {isNewAgentModalOpen && (
          <div className="agent-modal-backdrop">
            <div className="agent-modal">
              <h2 className="agent-modal-title">New Monkey Agent</h2>
              <label className="agent-modal-label" htmlFor="new-agent-name">
                Monkey name
              </label>
              <input
                id="new-agent-name"
                type="text"
                className="agent-modal-input"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                autoFocus
              />
              <div className="agent-modal-actions">
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-secondary"
                  onClick={handleCancelNewAgent}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-primary"
                  onClick={handleConfirmNewAgent}
                >
                  Create &amp; open
                </button>
              </div>
            </div>
          </div>
        )}
        {isNewContextModalOpen && (
          <div className="agent-modal-backdrop">
            <div className="agent-modal">
              <h2 className="agent-modal-title">New Context</h2>
              <label className="agent-modal-label" htmlFor="new-context-title">
                Context title
              </label>
              <input
                id="new-context-title"
                type="text"
                className="agent-modal-input"
                value={newContextTitle}
                onChange={(e) => setNewContextTitle(e.target.value)}
                autoFocus
              />
              <div className="agent-modal-actions">
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-secondary"
                  onClick={handleCancelNewContext}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-primary"
                  onClick={handleConfirmNewContext}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
        {isNewFolderModalOpen && (
          <div className="agent-modal-backdrop">
            <div className="agent-modal">
              <h2 className="agent-modal-title">New Folder</h2>
              <label className="agent-modal-label" htmlFor="new-folder-name">
                Folder name
              </label>
              <input
                id="new-folder-name"
                type="text"
                className="agent-modal-input"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
              />
              <div className="agent-modal-actions">
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-secondary"
                  onClick={handleCancelNewFolder}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-primary"
                  onClick={handleConfirmNewFolder}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {isDeleteContextModalOpen && (
          <div className="agent-modal-backdrop">
            <div className="agent-modal">
              <h2 className="agent-modal-title">Delete Context</h2>
              <label className="agent-modal-label" htmlFor="delete-context-title">
                Type the context name to confirm
              </label>
              <input
                id="delete-context-title"
                type="text"
                className="agent-modal-input"
                value={deleteContextTypedTitle}
                onChange={(e) => setDeleteContextTypedTitle(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#5f6368" }}>
                Context: <strong>{deleteContextTitle}</strong>
              </div>
              <div className="agent-modal-actions">
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-secondary"
                  onClick={handleCancelDeleteContext}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-primary"
                  onClick={handleConfirmDeleteContext}
                  disabled={deleteContextTypedTitle.trim() !== deleteContextTitle.trim()}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {isDeleteAgentModalOpen && (
          <div className="agent-modal-backdrop">
            <div className="agent-modal">
              <h2 className="agent-modal-title">Delete Monkey Agent</h2>
              <label className="agent-modal-label" htmlFor="delete-agent-title">
                Type the agent name to confirm
              </label>
              <input
                id="delete-agent-title"
                type="text"
                className="agent-modal-input"
                value={deleteAgentTypedTitle}
                onChange={(e) => setDeleteAgentTypedTitle(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#5f6368" }}>
                Agent: <strong>{deleteAgentTitle}</strong>
              </div>
              <div className="agent-modal-actions">
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-secondary"
                  onClick={handleCancelDeleteAgent}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-primary"
                  onClick={handleConfirmDeleteAgent}
                  disabled={deleteAgentTypedTitle.trim() !== deleteAgentTitle.trim()}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        {isDeleteFolderModalOpen && (
          <div className="agent-modal-backdrop">
            <div className="agent-modal">
              <h2 className="agent-modal-title">Delete Folder</h2>
              <label className="agent-modal-label" htmlFor="delete-folder-title">
                Type folder name to confirm deletion:
              </label>
              <p className="agent-delete-warning">
                This will delete the folder and all documents inside it.
              </p>
              <input
                id="delete-folder-title"
                className="agent-modal-input"
                value={deleteFolderTypedTitle}
                onChange={(e) => setDeleteFolderTypedTitle(e.target.value)}
                placeholder={deleteFolderTitle}
                autoFocus
              />
              <div className="agent-modal-actions">
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-secondary"
                  onClick={handleCancelDeleteFolder}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="agent-modal-btn agent-modal-btn-primary"
                  onClick={handleConfirmDeleteFolder}
                  disabled={deleteFolderTypedTitle.trim() !== deleteFolderTitle.trim()}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        <aside className="docs-sidebar">
          {activeDrive === "documents" && (
            <>
              <button
                type="button"
                className="docs-new-btn"
                onClick={handleNewDoc}
              >
                <span className="docs-new-icon">+</span>
                New document
              </button>
              <button
                type="button"
                className="docs-new-btn docs-new-folder-btn"
                onClick={handleNewFolder}
              >
                <img src="/images/folder.png" alt="" className="docs-new-icon docs-new-icon-img" />
                New folder
              </button>
              <div className="docs-folder-tree">
                <div
                  className={
                    activeFolderId === null
                      ? "docs-folder-item is-active"
                      : "docs-folder-item"
                  }
                  onClick={() => setActiveFolderId(null)}
                >
                  <img src="/images/root.png" alt="" className="docs-folder-icon docs-folder-icon-root" />
                  <span className="docs-folder-name">Root</span>
                </div>
                {renderFolderTree(null)}
              </div>
            </>
          )}
          {activeDrive === "context" && (
            <>
              <button
                type="button"
                className="docs-new-btn"
                onClick={handleNewContext}
              >
                <span className="docs-new-icon">+</span>
                New context
              </button>
              <div className="docs-sidebar-note">
                Save characters, worlds, research snippets and more.
              </div>
            </>
          )}
          {activeDrive === "agents" && (
            <>
              <button
                type="button"
                className="docs-new-btn"
                onClick={handleNewAgent}
              >
                <span className="docs-new-icon">+</span>
                New monkey agent
              </button>
              <button
                type="button"
                className="docs-new-btn docs-new-btn-secondary"
                onClick={() => navigate("/monkey-agents-network")}
              >
                Explore agent net
              </button>
              <div className="docs-sidebar-note">
                Define specialist monkeys you can later summon in the editor.
              </div>
              <div className="docs-sidebar-archetypes">
                <div className="docs-sidebar-archetypes-title">Archetypes</div>
                <div className="docs-sidebar-archetype-item">
                  <strong>Specialist</strong>
                  <span>Acts only on highlighted text. Executes one focused transformation within the selected region.</span>
                </div>
                <div className="docs-sidebar-archetype-item">
                  <strong>Synonym Specialist</strong>
                  <span>A Specialist subtype. Replaces highlighted words by reading the full sentence around them to preserve meaning and tone.</span>
                </div>
                <div className="docs-sidebar-archetype-item">
                  <strong>Orchestrator</strong>
                  <span>Higher-order monkey. Operates across the broader document context and delegates tasks to Specialist monkeys when multi-step coordination is needed.</span>
                </div>
                <div className="docs-sidebar-archetype-item">
                  <strong>Critic</strong>
                  <span>Persistent evaluator. Continuously analyzes writing quality across the document and scores clarity, diction, tone, professionalism, and structural strength.</span>
                </div>
              </div>
            </>
          )}
        </aside>
        <section className={`docs-list-section docs-list-section--${activeDrive}`}>
          {activeDrive === "documents" && (
            <div className="docs-documents-drive">
              <div className="docs-drive-toolbar">
                <input
                  type="search"
                  className="docs-drive-search"
                  placeholder="Search documents…"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                />
              </div>
              <div className="docs-list">
              {docsLoading ? (
                <div className="docs-empty">
                  <p>Loading documents…</p>
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="docs-empty">
                  <p>No documents match this folder/search.</p>
                  <button type="button" className="docs-new-btn-inline" onClick={handleNewDoc}>
                    Create a document
                  </button>
                </div>
              ) : (
                filteredDocs.map((doc) => (
                    <article
                      key={doc.id}
                      className="docs-card"
                      onClick={() => navigate(`/doc/${doc.id}`)}
                    >
                      <button
                        type="button"
                        className="docs-card-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDoc(doc.id);
                        }}
                        aria-label="Delete document"
                      >
                        ✕
                      </button>
                      <div className="docs-card-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
                        </svg>
                      </div>
                      <span className="docs-card-title">
                        {truncateDisplayName(doc.title)}
                      </span>
                    </article>
                  ))
              )}
              </div>
            </div>
          )}
          {activeDrive === "context" && (
            <div className="docs-context-drive">
              <div className="docs-context-toolbar">
                <input
                  type="search"
                  className="docs-context-search"
                  placeholder="Search contexts…"
                  value={contextSearch}
                  onChange={(e) => setContextSearch(e.target.value)}
                />
              </div>
              {filteredContexts.length === 0 ? (
                <div className="docs-empty">
                  <p>No contexts yet.</p>
                  <button
                    type="button"
                    className="docs-new-btn-inline"
                    onClick={handleNewContext}
                  >
                    Create your first context
                  </button>
                </div>
              ) : (
                <div className="docs-context-grid">
                  {filteredContexts.map((ctx) => (
                    <article
                      key={ctx.id}
                      className="docs-context-card"
                      onClick={() => navigate(`/context/${ctx.id}`)}
                    >
                      <header className="docs-context-header">
                        <h3 className="docs-context-title">
                          {truncateDisplayName(ctx.title)}
                        </h3>
                        <button
                          type="button"
                          className="docs-context-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContextDelete(ctx.id, ctx.title);
                          }}
                          aria-label="Delete context"
                        >
                          ✕
                        </button>
                      </header>
                      {ctx.tags.length > 0 && (
                        <div className="docs-context-tags">
                          {ctx.tags.map((tag) => (
                            <span key={tag} className="docs-context-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeDrive === "agents" && (
            <div className="docs-agents-drive">
              <div className="docs-drive-toolbar">
                <input
                  type="search"
                  className="docs-drive-search"
                  placeholder="Search monkey agents…"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                />
              </div>
              {filteredAgents.length === 0 ? (
                <div className="docs-empty">
                  <p>
                    {agentSearch.trim()
                      ? "No monkey agents match this search."
                      : "No agents yet."}
                  </p>
                  {!agentSearch.trim() && (
                    <button
                      type="button"
                      className="docs-new-btn-inline"
                      onClick={handleNewAgent}
                    >
                      Create your first monkey agent
                    </button>
                  )}
                </div>
              ) : (
                <div className="docs-agents-grid">
                  {filteredAgents.map((agent) => (
                    <article
                      key={agent.id}
                      className="docs-agent-card"
                      onClick={() => navigate(`/monkey-agent/${agent.id}`)}
                    >
                      <header className="docs-agent-header">
                        <div className="docs-agent-avatar">
                          <img src="/images/monkey%20(1).png" alt="Monkey" className="docs-agent-avatar-img" />
                        </div>
                        <div className="docs-agent-meta">
                          <h3 className="docs-agent-name">
                            {truncateDisplayName(agent.name)}
                          </h3>
                          <div className="docs-agent-role">{agent.role}</div>
                        </div>
                        <button
                          type="button"
                          className="docs-agent-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAgentDelete(agent.id, agent.name);
                          }}
                          aria-label="Delete agent"
                        >
                          ✕
                        </button>
                      </header>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <UpgradeModal
        open={upgradeModalOpen}
        reason={upgradeReason}
        onClose={() => setUpgradeModalOpen(false)}
      />
    </div>
  );
}
