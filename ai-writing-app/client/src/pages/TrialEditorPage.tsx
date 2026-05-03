import { Link, useLocation } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import Editor from "../components/Editor";
import EditorContext from "../contexts/EditorContext";
import type { Editor as TiptapEditor } from "@tiptap/react";
import TrialOnboardingTour from "../components/TrialOnboardingTour";
import RouteErrorBoundary from "../components/RouteErrorBoundary";
import ViewportScale from "../components/ViewportScale";
import { supabase } from "../lib/supabase";
import { shortcut } from "../lib/shortcuts";

function TrialOverModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(5, 10, 18, 0.62)",
        backdropFilter: "blur(2px)",
      }}
      role="dialog"
      aria-label="Trial over"
    >
      <div
        style={{
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          background: "rgba(245, 250, 255, 0.96)",
          border: "1px solid rgba(12, 35, 64, 0.45)",
          borderRadius: 0,
          padding: 16,
          fontFamily: '"Cormorant Garamond", serif',
          color: "rgba(6, 18, 33, 0.98)",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(3, 14, 28, 0.98)" }}>
            Free trial is over
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: 0,
              border: "1px solid rgba(12, 35, 64, 0.35)",
              background: "rgba(255, 255, 255, 0.5)",
              color: "rgba(6, 18, 33, 0.95)",
              cursor: "pointer",
              lineHeight: 1,
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.35, opacity: 0.92, color: "rgba(6, 18, 33, 0.92)" }}>
          Sign up to continue using Rewrite and the AI side panels. Trial limits are enforced on the
          server (about 3 rewrites and 1 AI scan per ~5 hours while you explore without an account).
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <Link
            to="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 36,
              padding: "0 14px",
              borderRadius: 0,
              border: "1px solid rgba(6, 95, 70, 0.55)",
              background: "linear-gradient(180deg, rgba(16, 185, 129, 0.18), rgba(34, 197, 94, 0.10))",
              textDecoration: "none",
              color: "rgba(3, 48, 33, 0.98)",
              fontSize: 16,
            }}
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TrialEditorPage() {
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const location = useLocation();
  const autoIntro = (location.state as { autoIntro?: boolean } | null)?.autoIntro === true;
  const [uiPrimed, setUiPrimed] = useState(false);
  const [anonReady, setAnonReady] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useLayoutEffect(() => {
    try {
      localStorage.setItem("im-orchestrator-expanded", "false");
      localStorage.setItem("im-writing-pulse-expanded", "false");
      localStorage.setItem("im-scrutiny-expanded", "false");
      localStorage.setItem("im-editor-timeline-visible", "false");
    } catch {
      /* ignore */
    }
    setUiPrimed(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          setAnonReady(true);
          return;
        }
        const { error } = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (error) {
          console.warn("[trial] signInAnonymously failed:", error.message);
        }
        setAnonReady(true);
      } catch (e) {
        console.warn("[trial] session bootstrap failed:", e);
        if (!cancelled) setAnonReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onTrialGated = useCallback(
    (_action: "rewrite" | "scrutiny-selection" | "scrutiny-document") => {
      setPaywallOpen(true);
    },
    [],
  );

  return (
    <RouteErrorBoundary label="Free trial">
      <EditorContext.Provider value={editor}>
        <ViewportScale>
          <div className="app">
            <TrialOverModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
            <TrialOnboardingTour
              startMode={autoIntro ? "immediate" : "after-interaction"}
              forceOpen={autoIntro}
              targetsReady={uiPrimed && anonReady}
            />
            <div className="title-bar im-trial-titlebar">
              <Link to="/?skipIntro=1" className="doc-icon-link" title="Back to home">
                <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </Link>
              <div className="title-area">
                <span className="doc-title im-trial-title">Free trial</span>
              </div>
              <div className="title-bar-actions">
                <Link to="/signup" className="title-bar-export-btn im-trial-signup-btn">
                  Sign up to save
                </Link>
              </div>
            </div>

            {uiPrimed && anonReady ? (
              <Editor
                initialContent={`<p><strong>Welcome.</strong> This is a free trial document — nothing here is saved.</p>
<p>Try rewriting: highlight the paragraph below, then press <strong>${shortcut("K")}</strong>.</p>
<p>Over time, these aquatic beings develop from specks that are barely visible into creatures that can reach up to two inches in length. They flourish in small, artificial habitats, needing little more than water and an occasional meal. Their resilience and low‑maintenance way of life offer us a fascinating glimpse into the survival strategies of life here on Earth.</p>
<p><em>Playground prompts:</em> “make this more vivid”, “cut 30%”, “make it sound like a documentary narrator”, “simplify for a 12‑year‑old”.</p>
<p></p>`}
                docId={undefined}
                timelineDocumentId={undefined}
                onSaveContent={undefined}
                onEditorReady={setEditor}
                trialMode
                trialSkipClientQuota
                onTrialGated={onTrialGated}
              />
            ) : null}
          </div>
        </ViewportScale>
      </EditorContext.Provider>
    </RouteErrorBoundary>
  );
}
