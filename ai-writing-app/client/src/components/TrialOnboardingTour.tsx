import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shortcut, modKeyLabel } from "../lib/shortcuts";

type Step = {
  id: string;
  title: string;
  body: string;
  selector: string;
  placement?: "right" | "left" | "bottom" | "top";
  showVideoPlaceholder?: boolean;
  /** If set, Next is disabled until this condition is met. */
  nextEnabledWhen?: () => boolean;
  /** If set, auto-advance uses this condition (otherwise uses nextEnabledWhen). */
  autoAdvanceWhen?: () => boolean;
  /** If true, auto-advance when condition becomes true. */
  autoAdvance?: boolean;
};

const LS_KEY = "im-trial-onboarding-dismissed-v2";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getTargetRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Ignore zero-size targets.
  if (!r.width || !r.height) return null;
  return r;
}

function rectsOverlap(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number }
) {
  const ax2 = a.left + a.width;
  const ay2 = a.top + a.height;
  const bx2 = b.left + b.width;
  const by2 = b.top + b.height;
  return a.left < bx2 && ax2 > b.left && a.top < by2 && ay2 > b.top;
}

export type TrialOnboardingStartMode = "immediate" | "after-interaction";

export default function TrialOnboardingTour({
  startMode = "after-interaction",
  delayMs = 10_000,
  forceOpen = false,
  /** When false, immediate start waits so DOM targets (e.g. toolbar Guide) can mount first. */
  targetsReady = true,
}: {
  startMode?: TrialOnboardingStartMode;
  delayMs?: number;
  /** When true, ignore the dismissed flag and always show. */
  forceOpen?: boolean;
  targetsReady?: boolean;
}) {
  const [guideGate, setGuideGate] = useState<{ opened: boolean; closedAfterOpen: boolean }>({
    opened: false,
    closedAfterOpen: false,
  });
  const [acceptRejectDone, setAcceptRejectDone] = useState(false);
  const [scrutinyScanDone, setScrutinyScanDone] = useState(false);

  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) !== "1";
    } catch {
      return true;
    }
  });
  // When forced (e.g. arriving via Start writing), show regardless of prior dismissal.
  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
  }, [forceOpen]);

  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !started) return;
    const onAccept = () => setAcceptRejectDone(true);
    const onReject = () => setAcceptRejectDone(true);
    window.addEventListener("im:suggestion-accept", onAccept as EventListener);
    window.addEventListener("im:suggestion-reject", onReject as EventListener);
    return () => {
      window.removeEventListener("im:suggestion-accept", onAccept as EventListener);
      window.removeEventListener("im:suggestion-reject", onReject as EventListener);
    };
  }, [open, started]);

  useEffect(() => {
    if (!open || !started) return;
    const onScan = () => setScrutinyScanDone(true);
    window.addEventListener("im:scrutiny-scan-selection", onScan as EventListener);
    return () => {
      window.removeEventListener("im:scrutiny-scan-selection", onScan as EventListener);
    };
  }, [open, started]);

  const steps: Step[] = useMemo(
    () => [
      {
        id: "guide",
        title: "Start here: the Guide",
        body: "Open the Guide to see the full workflow.",
        selector: 'button.toolbar-btn.guide-btn[data-onboard="guide"]',
        placement: "right",
        showVideoPlaceholder: false,
        nextEnabledWhen: () => guideGate.opened || guideGate.closedAfterOpen,
        autoAdvanceWhen: () => guideGate.closedAfterOpen,
        autoAdvance: true,
      },
      {
        id: "rewrite",
        title: `Rewrite with ${modKeyLabel()}+K`,
        body: `Highlight a sentence, then press ${shortcut("K")} to open the rewrite box.`,
        selector: '[data-onboard="editor"]',
        placement: "right",
        nextEnabledWhen: () => !!document.querySelector(".ai-overlay"),
        autoAdvance: true,
      },
      {
        id: "overlay",
        title: "Tell the monkeys what to do",
        body:
          "Type a short instruction (e.g. “tighten and make more vivid”), then Summon.",
        selector: ".ai-overlay",
        placement: "left",
        showVideoPlaceholder: false,
        // As soon as a rewrite starts (suggestion node exists), we advance and hide this tour card.
        nextEnabledWhen: () => !!document.querySelector(".im-suggestion-node"),
        autoAdvance: true,
      },
      {
        id: "editor",
        title: "The editor is the stage",
        body:
          "Write normally. Highlight only what you want changed. Small, reversible steps keep your voice intact.",
        selector: '[data-onboard="document"]',
        placement: "right",
      },
      {
        id: "accept-reject",
        title: "Accept or reject",
        body: "When the rewrite is ready, Accept to apply it or Reject to discard it.",
        selector: ".im-suggestion-node__actions",
        placement: "right",
        nextEnabledWhen: () => acceptRejectDone,
        autoAdvance: true,
      },
      {
        id: "timeline",
        title: "Timeline: expand it",
        body: "Expand Timeline to see your AI actions.",
        selector: '[data-onboard="timeline"]',
        placement: "right",
        nextEnabledWhen: () => !!document.querySelector(".agent-invocation-timeline"),
        autoAdvance: true,
      },
      {
        id: "timeline-node",
        title: "Click a timeline node",
        body: "Click any timeline milestone to expand details.",
        selector: ".agent-invocation-timeline",
        placement: "right",
        nextEnabledWhen: () => !!document.querySelector(".agent-invocation-popover"),
        autoAdvance: true,
      },
      {
        id: "timeline-collapse",
        title: "Collapse Timeline",
        body: "Collapse Timeline when you’re done reviewing.",
        selector: ".agent-invocation-timeline-collapse",
        placement: "left",
        nextEnabledWhen: () => !document.querySelector(".agent-invocation-timeline"),
        autoAdvance: true,
      },
      {
        id: "editor-tab",
        title: "Editor panel",
        body: "Expand this panel to see writing signals as you draft.",
        selector: '[data-onboard="editor-tab"]',
        placement: "left",
        nextEnabledWhen: () => !!document.querySelector('[data-onboard="editor-panel"]'),
        autoAdvance: true,
      },
      {
        id: "editor-panel",
        title: "Editor panel",
        body: "This panel tracks writing signals as you draft.",
        selector: '[data-onboard="editor-panel"]',
        placement: "left",
        nextEnabledWhen: () => !!document.querySelector('[data-onboard="editor-collapse"]'),
      },
      {
        id: "editor-collapse",
        title: "Collapse the Editor panel",
        body: "Collapse this panel to return to the left rail, then we’ll open Scrutiny.",
        selector: '[data-onboard="editor-collapse"]',
        placement: "left",
        // Only advance once the Editor panel is actually collapsed (panel removed from DOM)
        // and the Scrutiny rail tab is visible again.
        nextEnabledWhen: () =>
          !document.querySelector('[data-onboard="editor-panel"]') &&
          !!document.querySelector('[data-onboard="scrutiny-tab"]'),
        autoAdvance: true,
      },
      {
        id: "scrutiny-tab",
        title: "AI Scrutiny",
        body: "Open Scrutiny to scan for suspicious sentences.",
        selector: '[data-onboard="scrutiny-tab"]',
        placement: "left",
        nextEnabledWhen: () => !!document.querySelector('[data-onboard="scrutiny-panel"]'),
        autoAdvance: true,
      },
      {
        id: "scrutiny",
        title: "AI Scrutiny",
        body: "Highlight a section in the document, then click Scan selection.",
        selector: '[data-onboard="scrutiny-panel"]',
        placement: "left",
        showVideoPlaceholder: false,
        nextEnabledWhen: () => scrutinyScanDone,
        autoAdvance: true,
      },
      {
        id: "scrutiny-collapse",
        title: "Collapse AI Scrutiny",
        body: "Collapse Scrutiny to return to the left rail, then we’ll open Orchestrator.",
        selector: '[data-onboard="scrutiny-collapse"]',
        placement: "left",
        nextEnabledWhen: () =>
          !document.querySelector('[data-onboard="scrutiny-panel"]') &&
          !!document.querySelector('[data-onboard="orchestrator-tab"]'),
        autoAdvance: true,
      },
      {
        id: "orchestrator-tab",
        title: "Orchestrator (locked in trial)",
        body: "Open Orchestrator. You can look around, but it’s locked in free trial.",
        selector: '[data-onboard="orchestrator-tab"]',
        placement: "left",
        nextEnabledWhen: () => !!document.querySelector('[data-onboard="orchestrator"] .editor-orchestrator-header'),
        autoAdvance: true,
      },
      {
        id: "orchestrator",
        title: "Orchestrator (locked in trial)",
        body:
          "Orchestrator runs a chain of specialist monkeys. It’s locked in free trial — sign up to unlock.",
        selector: '[data-onboard="orchestrator"]',
        placement: "left",
        showVideoPlaceholder: true,
      },
    ],
    [guideGate.closedAfterOpen, acceptRejectDone, scrutinyScanDone]
  );

  if (!steps.length) return null;

  const safeIdx = clamp(idx, 0, steps.length - 1);
  const step = steps[safeIdx]!;

  // During the "editor" step, force users to click Next in the tour card
  // (prevents skipping ahead by accepting/rejecting a suggestion immediately).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const lock = Boolean(open && started && step.id === "editor");
    document.documentElement.dataset.imTourLockSuggestions = lock ? "1" : "0";
    return () => {
      document.documentElement.dataset.imTourLockSuggestions = "0";
    };
  }, [open, started, step.id]);

  useEffect(() => {
    if (!open || !started) return;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'tour-seq',hypothesisId:'H1',location:'TrialOnboardingTour.tsx:steps',message:'steps_list',data:{steps:steps.map(s=>s.id),len:steps.length,idx,safeIdx,stepId:step.id},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    // Only need this once per tour start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, started]);

  // Gate Step 1 by real Guide open/close.
  useEffect(() => {
    if (!open || !started) return;
    if (step.id !== "guide") return;
    // Reset gate each time we arrive at the Guide step.
    setGuideGate({
      opened: !!document.querySelector(".guide-modal"),
      closedAfterOpen: false,
    });

    const onOpen = () => setGuideGate((s) => ({ ...s, opened: true }));
    const onClose = () =>
      setGuideGate((s) => (s.opened ? { ...s, closedAfterOpen: true } : s));

    window.addEventListener("im:guide-open", onOpen as EventListener);
    window.addEventListener("im:guide-close", onClose as EventListener);
    return () => {
      window.removeEventListener("im:guide-open", onOpen as EventListener);
      window.removeEventListener("im:guide-close", onClose as EventListener);
    };
  }, [open, started, step.id]);

  useEffect(() => {
    if (!open || !started) return;
    // #region agent log
    (() => {
      const theme =
        (document.documentElement as any)?.dataset?.theme ??
        (document.body as any)?.dataset?.theme ??
        null;
      const card = document.querySelector(".im-tour__card") as HTMLElement | null;
      const cs = card ? window.getComputedStyle(card) : null;
      const styles = cs
        ? {
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            borderColor: cs.borderColor,
          }
        : null;
      fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'tour-theme',hypothesisId:'T1',location:'TrialOnboardingTour.tsx:step',message:'card_theme_styles',data:{theme,idx,safeIdx,stepId:step.id,styles},timestamp:Date.now()})}).catch(()=>{});
    })();
    // #endregion agent log
  }, [open, started, step.id, idx, safeIdx, step.selector, step.nextEnabledWhen]);

  useEffect(() => {
    if (!open || !started) return;
    if (step.id !== "editor-panel" && step.id !== "editor-collapse") return;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'tour-seq',hypothesisId:'H3',location:'TrialOnboardingTour.tsx:editorCollapse',message:'editor_panel_state',data:{stepId:step.id,hasEditorPanel:!!document.querySelector('[data-onboard=\"editor-panel\"]'),hasEditorCollapse:!!document.querySelector('[data-onboard=\"editor-collapse\"]'),hasScrutinyTab:!!document.querySelector('[data-onboard=\"scrutiny-tab\"]')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
  }, [open, started, step.id]);

  useEffect(() => {
    if (!open || !started) return;
    if (step.id === "accept-reject") {
      setAcceptRejectDone(false);
    }
  }, [open, started, step.id]);

  useEffect(() => {
    if (!open || !started) return;
    if (step.id === "scrutiny") {
      setScrutinyScanDone(false);
    }
  }, [open, started, step.id]);

  const effectiveSelector =
    step.id === "guide" && guideGate.opened ? ".guide-modal" : step.selector;

  useEffect(() => {
    if (!open || !started) return;
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("im:tour-step", { detail: { stepId: step.id } }));
  }, [open, started, step.id]);

  // Start immediately (when requested) or after the user's first interaction + delay.
  useEffect(() => {
    if (!open) return;
    if (started) return;

    if (startMode === "immediate") {
      if (!targetsReady) return;
      setStarted(true);
      return;
    }

    const arm = () => {
      if (startTimerRef.current != null) return;
      startTimerRef.current = window.setTimeout(() => setStarted(true), delayMs);
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
    };

    window.addEventListener("pointerdown", arm, true);
    window.addEventListener("keydown", arm, true);
    return () => {
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
      if (startTimerRef.current != null) window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    };
  }, [open, started, startMode, delayMs, forceOpen, targetsReady]);

  const close = () => {
    setOpen(false);
    setStarted(false);
    try {
      localStorage.setItem(LS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const next = () => setIdx((i) => clamp(i + 1, 0, steps.length - 1));

  useLayoutEffect(() => {
    if (!open || !started) return;

    const update = () => {
      const r = getTargetRect(effectiveSelector);
      setRect(r);
    };

    update();

    const onAny = () => update();
    window.addEventListener("resize", onAny);
    window.addEventListener("scroll", onAny, true);

    return () => {
      window.removeEventListener("resize", onAny);
      window.removeEventListener("scroll", onAny, true);
    };
  }, [open, started, effectiveSelector]);

  // If target isn't yet mounted, retry for a short window (Editor/Toolbar often land one frame late).
  useEffect(() => {
    if (!open || !started) return;
    if (rect) return;
    let attempts = 0;
    const tick = () => {
      const r = getTargetRect(effectiveSelector);
      if (r) {
        setRect(r);
        return;
      }
      attempts += 1;
      if (attempts < 90) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [open, started, rect, effectiveSelector]);

  // Auto-advance when a gated step condition becomes true.
  useEffect(() => {
    if (!open || !started) return;
    const cond = step.autoAdvanceWhen ?? step.nextEnabledWhen;
    if (!cond || !step.autoAdvance) return;
    let raf: number | null = null;
    const tick = () => {
      if (cond()) {
        setIdx((i) => clamp(i + 1, 0, steps.length - 1));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [
    open,
    started,
    safeIdx,
    step.nextEnabledWhen,
    step.autoAdvanceWhen,
    step.autoAdvance,
    steps.length,
  ]);

  const hideHighlight =
    // For the Scrutiny step, never draw the gold border (the panel grows after scans).
    (open && started && step.id === "scrutiny") ||
    (open &&
      started &&
      step.id === "scrutiny" &&
      typeof document !== "undefined" &&
      !!document.querySelector(".scrutiny-summary"));

  useEffect(() => {
    if (!open || !started) return;
    if (step.id !== "scrutiny") return;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'tour-seq',hypothesisId:'H5',location:'TrialOnboardingTour.tsx:hideHighlight',message:'scrutiny_highlight_visibility',data:{hideHighlight,hasSummary:typeof document!=="undefined"&&!!document.querySelector(".scrutiny-summary")},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
  }, [open, started, step.id, hideHighlight]);

  if (!open || !started) return null;

  const r = rect;
  const isGuideModalSpotlight = step.id === "guide" && guideGate.opened;
  const isEditorTabSpotlight = step.id === "editor-tab";
  const isEditorCollapseSpotlight = step.id === "editor-collapse";
  const isScrutinyTabSpotlight = step.id === "scrutiny-tab";
  const isOrchestratorTabSpotlight = step.id === "orchestrator-tab";
  const isScrutinyPanelSpotlight = step.id === "scrutiny";
  // Give the Editor tab a bit more breathing room so the outline "wraps" it cleanly.
  const pad = isGuideModalSpotlight
    ? 0
    : isEditorTabSpotlight
      ? 18
      : isEditorCollapseSpotlight
        ? 6
        : isScrutinyTabSpotlight
          ? 18
        : isOrchestratorTabSpotlight
          ? 18
        : isScrutinyPanelSpotlight
          ? 10
          : 10;
  const extraHeight = step.id === "editor-panel" ? 260 : 0;
  const flushLeftSpotlight =
    isGuideModalSpotlight || isEditorTabSpotlight || isScrutinyTabSpotlight || isOrchestratorTabSpotlight;
  const highlight = r
    ? {
        left: flushLeftSpotlight
          ? 0
          : Math.max(
              // For left-rail steps, allow flush-to-edge. Otherwise keep a small inset.
              isEditorCollapseSpotlight || isScrutinyPanelSpotlight ? 0 : 8,
              r.left - pad
            ),
        top: Math.max(isGuideModalSpotlight ? 0 : 8, r.top - pad),
        width: flushLeftSpotlight ? Math.max(24, r.left + r.width + pad) : Math.max(24, r.width + pad * 2),
        height: Math.max(24, r.height + pad * 2 + extraHeight),
      }
    : null;

  const dimEnabled = !["rewrite", "accept-reject", "editor", "scrutiny"].includes(step.id);
  // Timeline steps should leave the UI fully visible/clickable.
  const dimEnabledFinal =
    dimEnabled &&
    !["overlay", "accept-reject", "timeline", "timeline-collapse"].includes(step.id);
  const visualsEnabled = !(step.id === "guide" && guideGate.opened);

  const tip = (() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipW = 360;
    const tipH = step.showVideoPlaceholder ? 240 : 190;
    const margin = 16;
    if (!r) {
      return { left: clamp(vw - tipW - 24, 24, vw - tipW - 24), top: clamp(152, 16, vh - tipH - 16) };
    }

    // Keep the Editor-tab steps near the left rail, but avoid overlapping the rail/panel.
    if (step.id === "editor-tab") {
      return { left: 180, top: clamp(130, 16, vh - tipH - 16) };
    }
    if (step.id === "guide" && highlight) {
      const gapGuide = 16;
      return {
        left: clamp(highlight.left, margin, vw - tipW - margin),
        top: clamp(
          highlight.top + highlight.height + gapGuide + 28,
          margin,
          vh - tipH - margin,
        ),
      };
    }
    if (step.id === "editor-collapse") {
      return { left: 180, top: clamp(210, 16, vh - tipH - 16) };
    }
    if (step.id === "scrutiny-tab") {
      // Align the card vertically with the Scrutiny rail tab.
      const hbTop = highlight ? highlight.top : r.top;
      return { left: 180, top: clamp(hbTop, 16, vh - tipH - 16) };
    }
    if (step.id === "orchestrator-tab") {
      const hbTop = highlight ? highlight.top : r.top;
      return { left: 180, top: clamp(hbTop, 16, vh - tipH - 16) };
    }
    // Once the Editor panel is open, move the instruction card further right.
    if (step.id === "editor-panel") {
      return { left: 360, top: clamp(140, 16, vh - tipH - 16) };
    }
    if (step.id === "scrutiny") {
      // Align with the Scrutiny panel (left edge), but place it below.
      const hbLeft = highlight ? highlight.left : r.left;
      return {
        left: clamp(hbLeft, margin, vw - tipW - margin),
        // Keep it out of the way once the results list appears: pin to bottom.
        top: clamp(vh - tipH - margin, margin, vh - tipH - margin),
      };
    }

    const gap = 14;
    const highlightBox = highlight
      ? { left: highlight.left, top: highlight.top, width: highlight.width, height: highlight.height }
      : { left: r.left, top: r.top, width: r.width, height: r.height };

    const preferred = step.placement ?? "right";
    const order: Array<"right" | "left" | "bottom" | "top"> =
      preferred === "right"
        ? ["right", "left", "bottom", "top"]
        : preferred === "left"
          ? ["left", "right", "bottom", "top"]
          : preferred === "bottom"
            ? ["bottom", "top", "right", "left"]
            : ["top", "bottom", "right", "left"];

    // If the highlight is near the top chrome, bias the card downward a bit more.
    const topBias = highlightBox.top < 120 ? 18 : 0;

    const place = (p: "right" | "left" | "bottom" | "top") => {
      let left = 0;
      let top = 0;
      if (p === "right") {
        left = highlightBox.left + highlightBox.width + gap;
        top = highlightBox.top + Math.min(40, highlightBox.height * 0.2) + topBias;
      } else if (p === "left") {
        left = highlightBox.left - tipW - gap;
        if (step.id === "overlay") left -= 120;
        if (step.id === "timeline-collapse") left -= 220;
        top = highlightBox.top + Math.min(40, highlightBox.height * 0.2) + topBias;
      } else if (p === "bottom") {
        left = highlightBox.left;
        top = highlightBox.top + highlightBox.height + gap + topBias;
      } else {
        left = highlightBox.left;
        top = highlightBox.top - tipH - gap + topBias;
      }
      left = clamp(left, margin, vw - tipW - margin);
      top = clamp(top, margin, vh - tipH - margin);
      return { left, top };
    };

    for (const p of order) {
      const pos = place(p);
      let left = pos.left;
      let top = pos.top;
      const tipRect = () => ({ left, top, width: tipW, height: tipH });

      // If bottom placement is wider than the highlight, nudge horizontally to avoid overlap.
      for (let i = 0; i < 24 && rectsOverlap(tipRect(), highlightBox); i++) {
        const dx = i % 2 === 0 ? 12 : -12;
        left = clamp(left + dx, margin, vw - tipW - margin);
      }

      if (!rectsOverlap(tipRect(), highlightBox)) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'tour-debug',hypothesisId:'T1',location:'TrialOnboardingTour.tsx:tip',message:'tip_selected',data:{stepId:step.id,preferred,left,top,highlightBox,tipW,tipH,vw,vh},timestamp:Date.now()})}).catch(()=>{});
        // #endregion agent log
        return { left, top };
      }
    }

    // Fallback: bottom of highlight.
    const fallback = place("bottom");
    let left = fallback.left;
    let top = fallback.top;
    const tipRect = () => ({ left, top, width: tipW, height: tipH });
    for (let i = 0; i < 24 && rectsOverlap(tipRect(), highlightBox); i++) {
      const dx = i % 2 === 0 ? 12 : -12;
      left = clamp(left + dx, margin, vw - tipW - margin);
    }
    return { left, top };
  })();

  return (
    <div className="im-tour" role="dialog" aria-label="Onboarding tour">
      {visualsEnabled && dimEnabledFinal && highlight ? (
        (() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const left = highlight.left;
          const top = highlight.top;
          const right = highlight.left + highlight.width;
          const bottom = highlight.top + highlight.height;
          const safeRightW = Math.max(0, vw - right);
          const safeBottomH = Math.max(0, vh - bottom);
          return (
            <>
              {/* Top */}
              <div
                className="im-tour__shade"
                style={{ left: 0, top: 0, width: vw, height: Math.max(0, top) }}
              />
              {/* Left */}
              <div
                className="im-tour__shade"
                style={{ left: 0, top, width: Math.max(0, left), height: highlight.height }}
              />
              {/* Right */}
              <div
                className="im-tour__shade"
                style={{ left: right, top, width: safeRightW, height: highlight.height }}
              />
              {/* Bottom */}
              <div
                className="im-tour__shade"
                style={{ left: 0, top: bottom, width: vw, height: safeBottomH }}
              />
            </>
          );
        })()
      ) : visualsEnabled && dimEnabledFinal ? (
        <div className="im-tour__shade" style={{ left: 0, top: 0, width: "100%", height: "100%" }} />
      ) : null}

      {visualsEnabled && highlight && !hideHighlight && (
        <div
          className="im-tour__highlight"
          style={{
            left: `${highlight.left}px`,
            top: `${highlight.top}px`,
            width: `${highlight.width}px`,
            height: `${highlight.height}px`,
            boxShadow:
              step.id === "guide"
                ? "0 0 0 3px rgba(179, 134, 45, 0.55), 0 18px 60px rgba(0, 0, 0, 0.32)"
                : dimEnabledFinal
                  ? "0 18px 60px rgba(0, 0, 0, 0.28)"
                  : "0 18px 60px rgba(0, 0, 0, 0.18)",
          }}
        />
      )}

      {/* When the Guide modal is open, don't show an extra instruction card on top of it. */}
      {step.id === "guide" && guideGate.opened ? null : (
        <div
          className={`im-tour__card im-tour__card--${step.id}`}
          style={{ left: tip.left, top: tip.top }}
        >
        <div className="im-tour__top">
          <div className="im-tour__step">
            Step {safeIdx + 1} / {steps.length}
          </div>
          <button type="button" className="im-tour__x" onClick={close} aria-label="Close tour">
            ×
          </button>
        </div>
        <div className="im-tour__title">{step.title}</div>
        <div className="im-tour__body">{step.body}</div>

        {step.showVideoPlaceholder && (
          <div className="im-tour__video" aria-label="Video placeholder">
            Video placeholder
          </div>
        )}

        <div className="im-tour__actions">
          {step.id === "editor" || step.id === "editor-panel" || step.id === "scrutiny" || step.id === "orchestrator" ? (
            <>
              {/* Keep only manual-advance buttons for specific steps. */}
              <button
                type="button"
                className="im-tour__btn im-tour__btn--primary"
                onClick={() => {
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'tour-seq',hypothesisId:'H4',location:'TrialOnboardingTour.tsx:manualNext',message:'manual_next_clicked',data:{idx,safeIdx,stepId:step.id},timestamp:Date.now()})}).catch(()=>{});
                  // #endregion agent log
                  if (step.id === "orchestrator" && safeIdx === steps.length - 1) {
                    close();
                    return;
                  }
                  next();
                }}
              >
                Next
              </button>
            </>
          ) : null}
        </div>
        </div>
      )}
    </div>
  );
}

