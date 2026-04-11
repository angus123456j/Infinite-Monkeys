import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Editor from "../components/Editor";
import DocMenuBar from "../components/DocMenuBar";
import FindReplaceModal from "../components/FindReplaceModal";
import WordCountModal from "../components/WordCountModal";
import KeyboardShortcutsModal from "../components/KeyboardShortcutsModal";
import EditorContext from "../contexts/EditorContext";
import { getDocument, updateDocTitle, saveDoc } from "../lib/docs";
import { parseMonkeyTimeline } from "../lib/monkeyTimeline";
import type { AgentInvocationLogEntry } from "../components/AgentInvocationTimeline";
import { createContext } from "../lib/contexts";
import type { Editor as TiptapEditor } from "@tiptap/react";

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [title, setTitle] = useState("Untitled document");
  const [initialContent, setInitialContent] = useState<string>("<p></p>");
  const [initialMonkeyTimeline, setInitialMonkeyTimeline] = useState<
    AgentInvocationLogEntry[]
  >([]);
  const [loading, setLoading] = useState(!!id);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportingToContext, setExportingToContext] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    getDocument(id)
      .then((doc) => {
        if (doc) {
          setTitle(doc.title);
          setInitialContent(doc.content || "<p></p>");
          setInitialMonkeyTimeline(parseMonkeyTimeline(doc.monkeyTimeline));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setTitle(v);
      if (id) void updateDocTitle(id, v);
    },
    [id]
  );

  const handleSaveContent = useCallback(
    (content: string) => {
      if (id) void saveDoc(id, { content });
    },
    [id]
  );

  const handleExportToContext = useCallback(async () => {
    if (!editor || exportingToContext) return;
    setExportingToContext(true);
    try {
      const html = editor.getHTML();
      const ctx = await createContext({
        title: title.trim() || "Untitled context",
        description: html,
        tags: ["exported"],
      });
      navigate(`/context/${ctx.id}`);
    } catch (err) {
      console.error("Failed to export to context:", err);
      setExportingToContext(false);
    }
  }, [editor, exportingToContext, navigate, title]);

  if (loading) {
    return (
      <div className="app">
        <div className="title-bar">
          <Link to="/docs" className="doc-icon-link" title="Back to documents">
            <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
            </svg>
          </Link>
          <div className="title-area">
            <span className="doc-title">Loading…</span>
          </div>
        </div>
        <div style={{ padding: "2rem", textAlign: "center" }}>Loading document…</div>
      </div>
    );
  }

  return (
    <EditorContext.Provider value={editor}>
      <div className="app">
        <div className="title-bar">
          <Link to="/docs" className="doc-icon-link" title="Back to documents">
            <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
            </svg>
          </Link>
          <div className="title-area">
            <div className="doc-title-row">
              <input
                className="doc-title"
                value={title}
                onChange={handleTitleChange}
                aria-label="Document title"
              />
            </div>
            <DocMenuBar
              onOpenFindReplace={() => setFindReplaceOpen(true)}
              onOpenWordCount={() => setWordCountOpen(true)}
              onOpenKeyboardShortcuts={() => setShortcutsOpen(true)}
            />
          </div>
          <div className="title-bar-actions">
            <button
              type="button"
              className="title-bar-export-btn"
              onClick={() => void handleExportToContext()}
              disabled={!editor || exportingToContext}
              title="Export to Context library"
              aria-label="Export to Context library"
            >
              {exportingToContext ? "Exporting…" : "Export to Context library"}
            </button>
          </div>
        </div>
        <Editor
          key={id}
          docId={id ?? undefined}
          timelineDocumentId={id ?? undefined}
          initialContent={initialContent}
          initialMonkeyTimeline={initialMonkeyTimeline}
          onSaveContent={handleSaveContent}
          onEditorReady={setEditor}
        />
      </div>
      {findReplaceOpen && (
        <FindReplaceModal editor={editor} onClose={() => setFindReplaceOpen(false)} />
      )}
      {wordCountOpen && (
        <WordCountModal editor={editor} onClose={() => setWordCountOpen(false)} />
      )}
      {shortcutsOpen && <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </EditorContext.Provider>
  );
}
