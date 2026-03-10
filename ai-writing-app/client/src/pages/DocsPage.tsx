import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  listDocs,
  createDoc,
  type DocMeta,
  type FolderMeta,
  listAllFolders,
  createFolder,
  deleteDoc,
  deleteFolder,
} from "../lib/docs";
import { listContexts, createContext, deleteContext, type ContextItem } from "../lib/contexts";
import { listAgents, createAgent, deleteAgent, type AgentMeta } from "../lib/agents";

export default function DocsPage() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [contextSearch, setContextSearch] = useState("");
  const [agents, setAgents] = useState<AgentMeta[]>([]);
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
  const navigate = useNavigate();

  useEffect(() => {
    listDocs()
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
    setFolders(listAllFolders());
    listContexts()
      .then(setContexts)
      .catch(() => setContexts([]));
    listAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  function handleNewDoc() {
    setNewDocTitle("Untitled document");
    setIsNewDocModalOpen(true);
  }

  async function handleConfirmNewDoc() {
    try {
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

  async function handleDeleteFolder(id: string) {
    if (!window.confirm("Delete this folder and all documents inside it?")) return;
    try {
      await deleteFolder(id);
      setFolders(listAllFolders());
      listDocs().then(setDocs);
      if (activeFolderId === id) {
        setActiveFolderId(null);
      }
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

  async function handleContextDelete(id: string) {
    if (!window.confirm("Delete this context?")) return;
    try {
      await deleteContext(id);
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

  function handleNewAgent() {
    setNewAgentName("New monkey");
    setIsNewAgentModalOpen(true);
  }

  async function handleConfirmNewAgent() {
    try {
      const trimmed = newAgentName.trim() || "New monkey";
      const agent = await createAgent({ name: trimmed });
      setIsNewAgentModalOpen(false);
      listAgents().then(setAgents);
      navigate(`/monkey-agent/${agent.id}`);
    } catch (err) {
      console.error("Failed to create agent:", err);
    }
  }

  function handleCancelNewAgent() {
    setIsNewAgentModalOpen(false);
  }

  async function handleAgentDelete(id: string) {
    if (!window.confirm("Delete this monkey agent?")) return;
    try {
      await deleteAgent(id);
      listAgents().then(setAgents);
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
  }

  function renderFolderTree(parentId: string | null, depth = 0): JSX.Element[] {
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
            <img src="/images/folder.png" alt="" className="docs-folder-icon" />
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
        <Link to="/" className="docs-logo">
          Infinite Monkeys
        </Link>
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
                  <img src="/images/root.png" alt="" className="docs-folder-icon" />
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
              <div className="docs-sidebar-note">
                Define specialist monkeys you can later summon in the editor.
              </div>
            </>
          )}
        </aside>
        <section className="docs-list-section">
          {activeDrive === "documents" && (
            <div className="docs-list">
              {docsLoading ? (
                <div className="docs-empty">
                  <p>Loading documents…</p>
                </div>
              ) : docs.filter((d) => (d.folderId ?? null) === activeFolderId).length === 0 ? (
                <div className="docs-empty">
                  <p>No documents yet in this folder.</p>
                  <button type="button" className="docs-new-btn-inline" onClick={handleNewDoc}>
                    Create a document
                  </button>
                </div>
              ) : (
                docs
                  .filter((doc) => (doc.folderId ?? null) === activeFolderId)
                  .map((doc) => (
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
                      <span className="docs-card-title">{doc.title}</span>
                    </article>
                  ))
              )}
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
                        <h3 className="docs-context-title">{ctx.title}</h3>
                        <button
                          type="button"
                          className="docs-context-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContextDelete(ctx.id);
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
              {agents.length === 0 ? (
                <div className="docs-empty">
                  <p>No agents yet.</p>
                  <button
                    type="button"
                    className="docs-new-btn-inline"
                    onClick={handleNewAgent}
                  >
                    Create your first monkey agent
                  </button>
                </div>
              ) : (
                <div className="docs-agents-grid">
                  {agents.map((agent) => (
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
                          <h3 className="docs-agent-name">{agent.name}</h3>
                          <div className="docs-agent-role">{agent.role}</div>
                        </div>
                        <button
                          type="button"
                          className="docs-agent-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAgentDelete(agent.id);
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
    </div>
  );
}
