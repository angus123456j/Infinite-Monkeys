import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Editor from "../components/Editor";
import DocMenuBar from "../components/DocMenuBar";
import FindReplaceModal from "../components/FindReplaceModal";
import WordCountModal from "../components/WordCountModal";
import KeyboardShortcutsModal from "../components/KeyboardShortcutsModal";
import ViewportScale from "../components/ViewportScale";
import EditorContext from "../contexts/EditorContext";
import { getContext, updateContext } from "../lib/contexts";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { parseMonkeyTimeline } from "../lib/monkeyTimeline";
import type { AgentInvocationLogEntry } from "../components/AgentInvocationTimeline";
import { getMySubscription, type SubscriptionTier } from "../lib/subscriptions";

export default function ContextEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [title, setTitle] = useState("Untitled context");
  const [initialContent, setInitialContent] = useState<string>("<p></p>");
  const [initialMonkeyTimeline, setInitialMonkeyTimeline] = useState<
    AgentInvocationLogEntry[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("free");

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
    getContext(id)
      .then((ctx) => {
        if (ctx) {
          setTitle(ctx.title);
          setInitialContent(ctx.description || "<p></p>");
          setInitialMonkeyTimeline(parseMonkeyTimeline(ctx.monkeyTimeline));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, sessionReady]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setTitle(v);
      if (id) void updateContext(id, { title: v });
    },
    [id]
  );

  const handleSaveContent = useCallback(
    (content: string) => {
      if (id) void updateContext(id, { description: content });
    },
    [id]
  );

  if (loading) {
    return (
      <ViewportScale>
        <div className="app">
          <div className="title-bar">
            <Link to="/docs" className="doc-icon-link" title="Back to drive">
              <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
              </svg>
            </Link>
            <div className="title-area">
              <span className="doc-title">Loading…</span>
            </div>
          </div>
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading context…</div>
        </div>
      </ViewportScale>
    );
  }

  return (
    <EditorContext.Provider value={editor}>
      <ViewportScale>
        <div className="app">
          <div className="title-bar">
            <Link to="/docs?drive=context" className="doc-icon-link" title="Back to drive">
              <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
              </svg>
            </Link>
            <div className="title-area">
              <input
                className="doc-title"
                value={title}
                onChange={handleTitleChange}
                aria-label="Context title"
              />
              <DocMenuBar
                onOpenFindReplace={() => setFindReplaceOpen(true)}
                onOpenWordCount={() => setWordCountOpen(true)}
                onOpenKeyboardShortcuts={() => setShortcutsOpen(true)}
              />
            </div>
          </div>
          <Editor
            key={id}
            docId={id ?? undefined}
            initialContent={initialContent}
            initialMonkeyTimeline={initialMonkeyTimeline}
            subscriptionTier={subscriptionTier}
            onSaveMonkeyTimeline={(entries) => {
              if (id) void updateContext(id, { monkeyTimeline: entries });
            }}
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
      </ViewportScale>
    </EditorContext.Provider>
  );
}

