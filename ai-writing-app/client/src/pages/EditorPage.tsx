import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Editor from "../components/Editor";
import DocMenuBar from "../components/DocMenuBar";
import FindReplaceModal from "../components/FindReplaceModal";
import WordCountModal from "../components/WordCountModal";
import KeyboardShortcutsModal from "../components/KeyboardShortcutsModal";
import EditorContext from "../contexts/EditorContext";
import { getDocument, updateDocTitle, saveDoc } from "../lib/docs";
import { parseMonkeyTimeline } from "../lib/monkeyTimeline";
import type { AgentInvocationLogEntry } from "../components/AgentInvocationTimeline";
import { createContext, listContexts } from "../lib/contexts";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { getMySubscription, type SubscriptionTier } from "../lib/subscriptions";
import UpgradeModal from "../components/UpgradeModal";
import ViewportScale from "../components/ViewportScale";
import { contextLimitForTier } from "../lib/freeTierLimits";

/** True when the doc is still the default empty state (new or never edited in a meaningful way). */
function isEffectivelyEmptyDocument(
  contentHtml: string,
  timeline: AgentInvocationLogEntry[],
): boolean {
  if (timeline.length > 0) return false;
  const textOnly = contentHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return textOnly.length === 0;
}

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
  const [sessionReady, setSessionReady] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("free");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");

  const collapseSidePanelsOnMount = useMemo(
    () => isEffectivelyEmptyDocument(initialContent, initialMonkeyTimeline),
    [initialContent, initialMonkeyTimeline],
  );

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        navigate("/?skipIntro=1", { replace: true });
        return;
      }
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) {
        navigate("/?skipIntro=1", { replace: true });
        setSessionReady(false);
      } else {
        setSessionReady(true);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    void getMySubscription()
      .then((row) => {
        if (!cancelled) setSubscriptionTier(row?.tier ?? "free");
      })
      .catch(() => {
        if (!cancelled) setSubscriptionTier("free");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
  }, [id, sessionReady]);

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
    const ctxLimit = contextLimitForTier(subscriptionTier);
    if (ctxLimit != null) {
      try {
        const contexts = await listContexts();
        if (contexts.length >= ctxLimit) {
          setUpgradeReason(
            subscriptionTier === "free"
              ? `Free accounts can have up to ${ctxLimit} context books in the library. Delete a context from the drive or upgrade to export another.`
              : `Your plan can have up to ${ctxLimit} context books in the library. Delete a context from the drive or upgrade to export another.`,
          );
          setUpgradeModalOpen(true);
          return;
        }
      } catch (err) {
        console.error("Failed to check context library size:", err);
      }
    }
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
  }, [editor, exportingToContext, navigate, subscriptionTier, title]);

  if (loading) {
    return (
      <ViewportScale>
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
      </ViewportScale>
    );
  }

  return (
    <EditorContext.Provider value={editor}>
      <ViewportScale>
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
            collapseSidePanelsOnMount={collapseSidePanelsOnMount}
            initialContent={initialContent}
            initialMonkeyTimeline={initialMonkeyTimeline}
            subscriptionTier={subscriptionTier}
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
        <UpgradeModal
          open={upgradeModalOpen}
          reason={upgradeReason}
          onClose={() => setUpgradeModalOpen(false)}
        />
      </ViewportScale>
    </EditorContext.Provider>
  );
}
