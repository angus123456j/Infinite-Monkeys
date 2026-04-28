import { Link, useLocation } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Editor from "../components/Editor";
import EditorContext from "../contexts/EditorContext";
import type { Editor as TiptapEditor } from "@tiptap/react";
import TrialOnboardingTour from "../components/TrialOnboardingTour";
import RouteErrorBoundary from "../components/RouteErrorBoundary";

type TrialAction = "rewrite" | "scrutiny-selection" | "scrutiny-document";

const TRIAL_USAGE_LS_KEY = "im-trial-usage-v1";

function readTrialUsage(): Record<TrialAction, number> {
  try {
    const raw = localStorage.getItem(TRIAL_USAGE_LS_KEY);
    if (!raw) return { rewrite: 0, "scrutiny-selection": 0, "scrutiny-document": 0 };
    const parsed = JSON.parse(raw);
    return {
      rewrite: Number(parsed?.rewrite ?? 0) || 0,
      "scrutiny-selection": Number(parsed?.["scrutiny-selection"] ?? 0) || 0,
      "scrutiny-document": Number(parsed?.["scrutiny-document"] ?? 0) || 0,
    };
  } catch {
    return { rewrite: 0, "scrutiny-selection": 0, "scrutiny-document": 0 };
  }
}

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
          Sign up to continue using Rewrite and the AI side panels.
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
  const autoIntro = (location.state as any)?.autoIntro === true;
  const [uiPrimed, setUiPrimed] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const trialLimits = useMemo(
    () => ({
      rewrite: 3,
      "scrutiny-selection": 2,
      // Keep the strongest/most expensive action as a signup moment.
      "scrutiny-document": 0,
    }),
    []
  );

  const [trialUsage, setTrialUsage] = useState<Record<TrialAction, number>>(() => readTrialUsage());
  const trialUsageRef = useRef(trialUsage);
  useEffect(() => {
    trialUsageRef.current = trialUsage;
    try {
      localStorage.setItem(TRIAL_USAGE_LS_KEY, JSON.stringify(trialUsage));
    } catch {
      /* ignore */
    }
  }, [trialUsage]);

  const onTrialGated = useCallback((_action: TrialAction) => {
    setPaywallOpen(true);
  }, []);

  const onTrialConsume = useCallback(
    (action: TrialAction) => {
      const cur = trialUsageRef.current;
      const limit = trialLimits[action];
      const used = cur[action] ?? 0;
      if (used >= limit) return false;
      const next = { ...cur, [action]: used + 1 };
      trialUsageRef.current = next;
      setTrialUsage(next);
      return true;
    },
    [trialLimits]
  );

  // For the free trial (especially when starting the tour), begin with all side panels collapsed.
  // We do this before mounting the Editor so its initial state reads the collapsed flags.
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

  return (
    <RouteErrorBoundary label="Free trial">
      <EditorContext.Provider value={editor}>
        <div className="app">
          <TrialOverModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
          <TrialOnboardingTour
            startMode={autoIntro ? "immediate" : "after-interaction"}
            forceOpen={autoIntro}
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

          {uiPrimed ? (
            <Editor
              initialContent={`<p><strong>Welcome.</strong> This is a free trial document — nothing here is saved.</p>
<p>Try rewriting: highlight the paragraph below, then press <strong>Command K</strong>.</p>
<p>Over time, these aquatic beings develop from specks that are barely visible into creatures that can reach up to two inches in length. They flourish in small, artificial habitats, needing little more than water and an occasional meal. Their resilience and low‑maintenance way of life offer us a fascinating glimpse into the survival strategies of life here on Earth.</p>
<p><em>Playground prompts:</em> “make this more vivid”, “cut 30%”, “make it sound like a documentary narrator”, “simplify for a 12‑year‑old”.</p>
<p></p>`}
              // Critical: omit docId + timelineDocumentId so nothing persists to Supabase.
              docId={undefined}
              timelineDocumentId={undefined}
              onSaveContent={undefined}
              onEditorReady={setEditor}
              trialMode
              onTrialConsume={onTrialConsume}
              onTrialGated={onTrialGated}
            />
          ) : null}
        </div>
      </EditorContext.Provider>
    </RouteErrorBoundary>
  );
}

