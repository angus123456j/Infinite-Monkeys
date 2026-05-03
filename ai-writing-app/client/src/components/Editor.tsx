import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type CSSProperties,
  MouseEvent,
} from "react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import { FontSize } from "../extensions/FontSize";
import {
  WritingAnalysisHighlight,
  setWritingAnalysisDecorations,
} from "../extensions/WritingAnalysisHighlight";
import { ScrutinyHighlight, setScrutinyDecorations } from "../extensions/ScrutinyHighlight";
import {
  OrchestratorSelectionHighlight,
  setOrchestratorSelectionDecorations,
} from "../extensions/OrchestratorSelectionHighlight";
import {
  buildWritingHighlightDecorations,
  buildTextCharMap,
  charRangeToDocRange,
} from "../utils/writingHighlightDecorations";
import {
  analyzeGrammarSentences,
  type GrammarSentenceCard,
} from "../lib/harperGrammar";
import Toolbar from "./Toolbar";
import WritingPulsePanel from "./WritingPulsePanel";
import ScrutinyPanel from "./ScrutinyPanel.tsx";
import Overlay from "./Overlay";
import AgentInvocationTimeline, {
  type AgentInvocationLogEntry,
} from "./AgentInvocationTimeline";
import { joinForward } from "@tiptap/pm/commands";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration } from "@tiptap/pm/view";
import { getAgent, listAgents, type AgentMeta } from "../lib/agents";
import { listContexts } from "../lib/contexts";
import { saveDoc } from "../lib/docs";
import { extractSentenceContext } from "../lib/extractSentenceContext";
import { supabase } from "../lib/supabase";
import { callTrialDemoRewrite } from "../lib/trialDemo";
import type { SubscriptionTier } from "../lib/subscriptions";
import {
  FREE_TIER_DAILY_SENTENCES,
  dailyScrutinyLimitForTier,
  dailySentenceLimitForTier,
} from "../lib/freeTierLimits";
import { readEdgeInvokeParsed } from "../lib/readFunctionInvokeError";
import {
  BurstRateLimitError,
  PayloadTooLargeError,
  QuotaExceededError,
  TrialQuotaExceededError,
  isBurstRateLimitError,
  isPayloadTooLargeError,
  isQuotaExceededError,
  isTrialQuotaExceededError,
} from "../lib/quotaErrors";
import UpgradeModal from "./UpgradeModal";
import {
  editorBodyLineHeightPx,
  extraSpacerParagraphsNeeded,
  maxOverlapRepairExtraParas,
} from "../lib/pretextRewriteLayout";
import { SuggestionBlock } from "../extensions/SuggestionBlock";

const USE_INFLOW_SUGGESTIONS = true;

/** Fixed 50 lines per page (visual guide). Line box height follows toolbar line spacing. */
const LINES_PER_PAGE = 50;
/** Top/bottom margin per page in px (matches .tiptap padding). */
const PAGE_MARGIN_PX = 72;
/** Gap between stacked page cards in px */
const GAP_HEIGHT = 25;
const LS_LINE_SPACING = "im-editor-line-spacing";

function clampLineSpacing(n: number): number {
  if (!Number.isFinite(n)) return 1.15;
  return Math.min(3, Math.max(1, Math.round(n * 100) / 100));
}

function readLineSpacing(): number {
  try {
    const raw = localStorage.getItem(LS_LINE_SPACING);
    if (raw == null || raw === "") return 1.15;
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return 1.15;
    return clampLineSpacing(v);
  } catch {
    return 1.15;
  }
}
/** Highlight color used for pending rewrites */
const HIGHLIGHT_COLOR = "#ffcdd2";
/**
 * Empty paragraphs under the highlight when a rewrite starts. The caret is placed *after*
 * this strip so typing stays clear of the floating card (loading + full rewrite + buttons).
 */
const INITIAL_SPACER_COUNT = 14;

const LS_ORCHESTRATOR_EXPANDED = "im-orchestrator-expanded";
const LS_WRITING_PULSE_EXPANDED = "im-writing-pulse-expanded";
const LS_TIMELINE_VISIBLE = "im-editor-timeline-visible";
const LS_SCRUTINY_EXPANDED = "im-scrutiny-expanded";
const HIGHLIGHT_DEBOUNCE_MS = 200;
const LOCAL_GRAMMAR_DEBOUNCE_MS = 350;

function readStoredSidebarVisible(key: string, defaultVisible: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "false") return false;
    if (v === "true") return true;
  } catch {
    /* ignore */
  }
  return defaultVisible;
}

let nextRewriteId = 0;
let nextInvocationId = 0;

/** Generate a fun random monkey identifier */
function randomMonkeyId(): string {
  const styles = [
    // Plain number (1–99999)
    () => String(Math.floor(Math.random() * 99999) + 1),
    // Exponent expressions
    () => `${Math.floor(Math.random() * 9) + 2}⁰⁰${['¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹'][Math.floor(Math.random()*9)]}`.replace('⁰⁰', ['¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹'][Math.floor(Math.random()*9)] as string),
    // n^m style
    () => `${Math.floor(Math.random() * 12) + 2}^${Math.floor(Math.random() * 50) + 2}`,
    // e^n
    () => `e^${Math.floor(Math.random() * 30) + 1}`,
    // π × n
    () => `π×${Math.floor(Math.random() * 9999) + 1}`,
    // √n
    () => `√${Math.floor(Math.random() * 99999) + 2}`,
    // n!
    () => `${Math.floor(Math.random() * 20) + 3}!`,
    // Hex
    () => `0x${Math.floor(Math.random() * 0xFFFFF).toString(16).toUpperCase()}`,
    // Binary
    () => `0b${Math.floor(Math.random() * 255).toString(2)}`,
    // φ^n (golden ratio)
    () => `φ^${Math.floor(Math.random() * 40) + 2}`,
    // log expression
    () => `log₂(${Math.floor(Math.random() * 99999) + 2})`,
    // ∞-n
    () => `∞−${Math.floor(Math.random() * 999) + 1}`,
    // Big plain number with commas
    () => {
      const n = Math.floor(Math.random() * 99999) + 1;
      return n.toLocaleString();
    },
  ];
  const pick = styles[Math.floor(Math.random() * styles.length)] ?? styles[0];
  return (pick ?? (() => "1"))();
}

// Compute where spacer paragraphs should be inserted. If the selection ends
// in the middle of a word (e.g. "C|oleridge"), we move the spacer insert
// position back to the start of that word so the *entire* word appears
// below the inline suggestion rather than being split.
function computeSpacerInsertPos(doc: any, selTo: number): number {
  const maxSteps = 64; // safety guard
  const charBefore = doc.textBetween(Math.max(0, selTo - 1), selTo, " ");
  const charAfter = doc.textBetween(selTo, selTo + 1, " ");
  const isWordChar = (ch: string) => !!ch && /\w/.test(ch);

  // Case 1: selection ends RIGHT BEFORE a word (start-of-word boundary),
  // e.g. "... materialism. |Coleridge". In that case we want the entire
  // following word to move below the suggestion, so we insert spacers
  // *before* the first character of that word.
  if (!isWordChar(charBefore) && isWordChar(charAfter)) {
    return selTo;
  }

  // Case 2: selection ends in the MIDDLE of a word, e.g. "C|oleridge".
  // Walk backwards to the beginning of the word and insert spacers there.
  if (isWordChar(charBefore) && isWordChar(charAfter)) {
    let cur = selTo;
    for (let i = 0; i < maxSteps && cur > 0; i++) {
      const prev = doc.textBetween(cur - 1, cur, " ");
      if (!prev || /\s/.test(prev) || /[.,!?;:]/.test(prev)) {
        break;
      }
      cur--;
    }
    return cur;
  }

  // Case 3: at a normal boundary (end of word/sentence, or newline). Insert
  // spacers just after the selection so the next word/paragraph stays below.
  return selTo + 1;
}

/** Doc position after `count` empty paragraphs inserted starting at `insertPos` (each empty `<p>` is size 2). */
function docPosAfterSpacerParagraphs(insertPos: number, count: number): number {
  return insertPos + count * 2;
}

/** Vertical size in px of the spacer strip in the document flow (measured; avoids collapsed empty-`<p>` math errors). */
function measureRewriteSpacerStripPx(
  view: EditorView,
  spacerFrom: number,
  spacerTo: number
): number {
  const docSize = view.state.doc.content.size;
  if (spacerTo <= spacerFrom || docSize <= 1) return 0;
  try {
    const fromProbe = Math.min(Math.max(spacerFrom, 1), docSize - 1);
    const toProbe = Math.min(Math.max(spacerTo - 1, fromProbe), docSize - 1);
    const top = view.coordsAtPos(fromProbe, 1).top;
    const bottom = view.coordsAtPos(toProbe, -1).bottom;
    return Math.max(0, bottom - top);
  } catch {
    return 0;
  }
}

function normalizeForSentenceDiff(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function splitIntoSentenceChunks(text: string): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const paragraphs = t.split(/\n\s*\n+/g);
  const chunks: string[] = [];
  for (const p of paragraphs) {
    const para = p.trim();
    if (!para) continue;
    // Keep punctuation with the sentence; fall back to full paragraph.
    const matches = para.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (!matches || matches.length === 0) {
      chunks.push(para);
      continue;
    }
    for (const m of matches) {
      const s = m.trim();
      if (s) chunks.push(s);
    }
  }
  return chunks;
}

function computeSentenceAttribution(
  originalText: string,
  steps: Array<{ agentName: string; text: string }>
): Array<{ sentence: string; agentName: string }> {
  let prevChunks = splitIntoSentenceChunks(originalText);
  let attrib: string[] = new Array(prevChunks.length).fill("Original");

  for (const step of steps) {
    const nextChunks = splitIntoSentenceChunks(step.text);
    if (nextChunks.length !== prevChunks.length) {
      // If sentence boundaries drift, mark whole output as last writer for clarity.
      prevChunks = nextChunks;
      attrib = new Array(nextChunks.length).fill(step.agentName);
      continue;
    }
    for (let i = 0; i < nextChunks.length; i++) {
      const a = normalizeForSentenceDiff(prevChunks[i] ?? "");
      const b = normalizeForSentenceDiff(nextChunks[i] ?? "");
      if (a !== b) attrib[i] = step.agentName;
    }
    prevChunks = nextChunks;
  }

  return prevChunks.map((sentence, i) => ({
    sentence,
    agentName: attrib[i] ?? "Unknown",
  }));
}

/** Character offsets of a DOM range within an element's text content (for selections inside suggestion cards). */
function getTextOffsetsInElement(
  el: HTMLElement,
  range: Range
): { start: number; end: number } | null {
  if (!el.contains(range.commonAncestorContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  pre.setEnd(range.endContainer, range.endOffset);
  const end = pre.toString().length;
  if (start > end) return null;
  return { start, end };
}

/** Merge paragraphs split by spacer `<p>` inserts so the sentence flows in one block again. */
function joinSplitParagraphsAfterSpacerRemoval(editor: TiptapEditor) {
  const st0 = editor.state;
  const $h0 = st0.selection.$head;
  // joinForward only runs when the caret is at the *end* of a textblock (see prosemirror-commands
  // atBlockEnd). After insertContent the caret is usually mid-paragraph, so move to block end first.
  let tbDepth = $h0.depth;
  while (tbDepth > 0 && !$h0.node(tbDepth).isTextblock) tbDepth--;
  if (tbDepth > 0) {
    const endPos = $h0.end(tbDepth);
    editor.chain().focus().setTextSelection(endPos).run();
  }
  for (let i = 0; i < 8; i++) {
    if (!joinForward(editor.state, editor.view.dispatch, editor.view)) break;
  }
}

interface PendingRewrite {
  id: number;
  /** If set, this entry refines a slice of the parent card’s `rewriteText` (not the document). */
  parentId?: number;
  parentReplaceStart?: number;
  parentReplaceEnd?: number;
  /** Root doc action: rewrite replaces; expand appends below selection. */
  docAction?: "rewrite" | "expand";
  orchestratorMode?: "synthesis" | "sequential";
  orchestratorSteps?: Array<{ agentId: string; agentName: string; text: string }>;
  sentenceAttribution?: Array<{ sentence: string; agentName: string }>;
  monkeyId: string;
  from: number;
  to: number;
  originalText: string;
  prompt: string;
  rewriteText: string | null;
  isLoading: boolean;
  isRevealing: boolean;
  error: string | null;
  spacerFrom: number;
  spacerTo: number;
}

type OverlayDocSelection = {
  kind: "doc";
  from: number;
  to: number;
  action: "rewrite" | "expand";
};
type OverlaySuggestionSelection = {
  kind: "suggestion";
  parentRewriteId: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};
type OverlaySelection = OverlayDocSelection | OverlaySuggestionSelection;

/** Synonym specialist agents: seeded "Synonym Sensei Monkey" or common renames like "Synonym Monkey". */
function isSynonymSpecialistAgentName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("synonym sensei") || n.includes("synonym monkey");
}

const SAVE_DEBOUNCE_MS = 1500;
const TIMELINE_SAVE_DEBOUNCE_MS = 1500;
const PERIODIC_SAVE_MS = 30_000;

const LLM_PROVIDER_STORAGE_KEY = "im-llm-provider";
type LlmProviderChoice = "auto" | "gemini" | "deepseek";

function readStoredLlmProvider(): LlmProviderChoice {
  try {
    const v = localStorage.getItem(LLM_PROVIDER_STORAGE_KEY);
    if (v === "gemini" || v === "deepseek" || v === "auto") return v;
  } catch {
    /* ignore */
  }
  return "auto";
}

function findHighlightRange(doc: any, color: string): { from: number; to: number } | null {
  let from: number | null = null;
  let to: number | null = null;
  doc.descendants((node: any, pos: number) => {
    if (!node || !node.isText) return true;
    const marks = node.marks ?? [];
    const hit = marks.find(
      (m: any) => m?.type?.name === "highlight" && (m?.attrs?.color ?? null) === color
    );
    if (!hit) return true;
    // For text nodes, the text spans [pos, pos + node.nodeSize).
    from = from == null ? pos : Math.min(from, pos);
    to = to == null ? pos + node.nodeSize : Math.max(to, pos + node.nodeSize);
    return true;
  });
  if (from == null || to == null || from >= to) return null;
  return { from, to };
}

interface EditorProps {
  docId?: string;
  /** When set, monkey timeline is loaded/saved for this document (not used on context-only pages). */
  timelineDocumentId?: string;
  /** Persist monkey timeline for the current entity (document or context). */
  onSaveMonkeyTimeline?: (entries: AgentInvocationLogEntry[]) => void;
  /**
   * When true (e.g. brand-new empty document), all side rails + timeline start collapsed
   * instead of restoring the last localStorage layout.
   */
  collapseSidePanelsOnMount?: boolean;
  /** Trial mode: used to gate premium features and onboarding. */
  trialMode?: boolean;
  /**
   * With `trialMode`, when true, skip client-side trial counters; quotas are enforced on the server
   * (anonymous Supabase session + edge / scrutiny service).
   */
  trialSkipClientQuota?: boolean;
  /** When set (signed-in editor), used with `trialMode` for free-tier limits. Omit on trial page. */
  subscriptionTier?: SubscriptionTier;
  onTrialConsume?: (action: "rewrite" | "scrutiny-selection" | "scrutiny-document") => boolean;
  onTrialGated?: (action: "rewrite" | "scrutiny-selection" | "scrutiny-document") => void;
  initialContent?: string;
  initialMonkeyTimeline?: AgentInvocationLogEntry[];
  onSaveContent?: (content: string) => void;
  onEditorReady?: (editor: TiptapEditor) => void;
}

function Editor({
  docId,
  timelineDocumentId,
  onSaveMonkeyTimeline,
  collapseSidePanelsOnMount = false,
  trialMode = false,
  trialSkipClientQuota = false,
  subscriptionTier,
  onTrialConsume,
  onTrialGated,
  initialContent = "<p></p>",
  initialMonkeyTimeline = [],
  onSaveContent,
  onEditorReady,
}: EditorProps) {
  const [tourStepId, setTourStepId] = useState<string | null>(null);
  useEffect(() => {
    if (!trialMode) return;
    const onStep = (e: Event) => {
      const ce = e as CustomEvent;
      const id = (ce?.detail as any)?.stepId;
      setTourStepId(typeof id === "string" ? id : null);
    };
    window.addEventListener("im:tour-step", onStep as EventListener);
    return () => window.removeEventListener("im:tour-step", onStep as EventListener);
  }, [trialMode]);

  // In trial onboarding, make sure the Editor panel isn't auto-opened.
  useEffect(() => {
    if (!trialMode) return;
    if (tourStepId === "editor-tab") {
      setWritingPulseExpanded(false);
    }
  }, [trialMode, tourStepId]);

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");

  const showUpgradeForQuotaType = useCallback(
    (type: string, meta?: { used?: number; limit?: number }) => {
      const tier = subscriptionTier ?? "free";
      const fallbackSentenceLimit = dailySentenceLimitForTier(tier) ?? FREE_TIER_DAILY_SENTENCES;
      const limit = meta?.limit ?? fallbackSentenceLimit;
      const used = meta?.used;
      if (type === "sentences") {
        setUpgradeReason(
          used != null
            ? `You've used about ${used} of ${limit} assisted “sentences” on your plan for today (estimate from rewrite length; resets daily UTC). Upgrade for higher limits.`
            : `You've reached your daily limit for assisted rewrites (${limit} sentence-equivalents, resets daily UTC). Upgrade to continue.`,
        );
      } else if (type === "orchestrator") {
        setUpgradeReason(
          "Orchestrator (multi-monkey chains) is not included on the free plan. Upgrade to unlock it.",
        );
      } else {
        setUpgradeReason("This action requires a higher plan. See pricing for details.");
      }
      setUpgradeModalOpen(true);
    },
    [subscriptionTier],
  );

  const acceptSuggestionRef = useRef<(rewriteId: number) => void>(() => {});
  const rejectSuggestionRef = useRef<(rewriteId: number) => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
      WritingAnalysisHighlight,
      OrchestratorSelectionHighlight,
      ScrutinyHighlight,
      SuggestionBlock.configure({
        onAccept: (rewriteId: number) => acceptSuggestionRef.current(rewriteId),
        onReject: (rewriteId: number) => rejectSuggestionRef.current(rewriteId),
      }),
    ],
    content: initialContent,
    autofocus: true,
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const editorPageAreaRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [containerMinHeight, setContainerMinHeight] = useState(() => {
    const lh = editorBodyLineHeightPx(readLineSpacing());
    return PAGE_MARGIN_PX + LINES_PER_PAGE * lh + PAGE_MARGIN_PX;
  });
  const [contentVersion, setContentVersion] = useState(0);
  const [lineSpacing, setLineSpacing] = useState(readLineSpacing);
  const lineHeightPx = useMemo(() => editorBodyLineHeightPx(lineSpacing), [lineSpacing]);
  const pageHeightPx = useMemo(
    () => PAGE_MARGIN_PX + LINES_PER_PAGE * lineHeightPx + PAGE_MARGIN_PX,
    [lineHeightPx]
  );
  const [llmProvider, setLlmProvider] = useState<LlmProviderChoice>(() =>
    readStoredLlmProvider()
  );

  // Orchestrator: build a proposed sequential chain of Specialist monkeys
  const [orchestratorAgents, setOrchestratorAgents] = useState<AgentMeta[]>([]);
  const [orchestratorInstruction, setOrchestratorInstruction] = useState("");
  const [orchestratorChain, setOrchestratorChain] = useState<string[]>([]);
  const [orchestratorIsProposing, setOrchestratorIsProposing] = useState(false);
  const [orchestratorIsExecuting, setOrchestratorIsExecuting] = useState(false);
  const [orchestratorError, setOrchestratorError] = useState<string | null>(null);

  const [orchestratorSectionExpanded, setOrchestratorSectionExpanded] = useState(
    () =>
      collapseSidePanelsOnMount
        ? false
        : readStoredSidebarVisible(LS_ORCHESTRATOR_EXPANDED, true)
  );
  /** Bumps when the document selection changes so Orchestrator UI stays in sync (TipTap does not re-render React on selection alone). */
  const [orchestratorSelVersion, setOrchestratorSelVersion] = useState(0);
  const [writingPulseExpanded, setWritingPulseExpanded] = useState(() =>
    collapseSidePanelsOnMount
      ? false
      : readStoredSidebarVisible(LS_WRITING_PULSE_EXPANDED, true)
  );
  const [scrutinyExpanded, setScrutinyExpanded] = useState(() =>
    collapseSidePanelsOnMount
      ? false
      : readStoredSidebarVisible(LS_SCRUTINY_EXPANDED, true)
  );
  const [showMonkeyTimeline, setShowMonkeyTimeline] = useState(() =>
    collapseSidePanelsOnMount
      ? false
      : readStoredSidebarVisible(LS_TIMELINE_VISIBLE, true)
  );
  const [grammarCards, setGrammarCards] = useState<GrammarSentenceCard[]>([]);
  const [selectedGrammarId, setSelectedGrammarId] = useState<string | null>(null);
  const grammarCardsRef = useRef<GrammarSentenceCard[]>([]);
  const selectedGrammarIdRef = useRef<string | null>(null);
  grammarCardsRef.current = grammarCards;
  selectedGrammarIdRef.current = selectedGrammarId;

  useEffect(() => {
    try {
      localStorage.setItem(LS_ORCHESTRATOR_EXPANDED, String(orchestratorSectionExpanded));
    } catch {
      /* ignore */
    }
  }, [orchestratorSectionExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_WRITING_PULSE_EXPANDED, String(writingPulseExpanded));
    } catch {
      /* ignore */
    }
  }, [writingPulseExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SCRUTINY_EXPANDED, String(scrutinyExpanded));
    } catch {
      /* ignore */
    }
  }, [scrutinyExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TIMELINE_VISIBLE, String(showMonkeyTimeline));
    } catch {
      /* ignore */
    }
  }, [showMonkeyTimeline]);

  useEffect(() => {
    try {
      localStorage.setItem(LLM_PROVIDER_STORAGE_KEY, llmProvider);
    } catch {
      /* ignore */
    }
  }, [llmProvider]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LINE_SPACING, String(lineSpacing));
    } catch {
      /* ignore */
    }
  }, [lineSpacing]);

  /** Fixed Monkey timeline + rail tabs: set --agent-invocation-timeline-top from a scroll-invariant anchor so they do not move when the document scrolls. */
  useLayoutEffect(() => {
    const el = pageRef.current;
    const scrollArea = editorPageAreaRef.current;
    if (!el) return;

    const syncTimelineTop = () => {
      const scrollRect = scrollArea?.getBoundingClientRect();
      const pageRect = el.getBoundingClientRect();
      const minTop = scrollRect?.top ?? 0;
      const scrollTop = scrollArea?.scrollTop ?? 0;
      // `pageRect.top` moves with document scroll inside the pane; add `scrollTop` so the sum is
      // stable (paper position in document space). Fixed rail tabs + timeline then stay put.
      const paperAnchorViewportTop = pageRect.top + scrollTop;
      const timelineTop = Math.max(minTop, paperAnchorViewportTop);
      document.documentElement.style.setProperty(
        "--agent-invocation-timeline-top",
        `${timelineTop}px`
      );
      const collapsedTabCount =
        (!writingPulseExpanded ? 1 : 0) + (!orchestratorSectionExpanded ? 1 : 0) + (!scrutinyExpanded ? 1 : 0);
      if (collapsedTabCount > 0) {
        document.documentElement.style.setProperty(
          "--editor-rail-tabs-dock-top",
          `${timelineTop}px`
        );
      } else {
        document.documentElement.style.removeProperty("--editor-rail-tabs-dock-top");
      }
    };

    const scheduleSync = () => {
      syncTimelineTop();
      requestAnimationFrame(() => {
        requestAnimationFrame(syncTimelineTop);
      });
    };

    scheduleSync();

    const ro = new ResizeObserver(scheduleSync);
    ro.observe(el);
    if (scrollArea) {
      ro.observe(scrollArea);
    }
    window.addEventListener("resize", scheduleSync);

    const mo = new MutationObserver(scheduleSync);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    if (document.fonts?.ready) {
      void document.fonts.ready.then(scheduleSync);
    }

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleSync);
      mo.disconnect();
      document.documentElement.style.removeProperty("--agent-invocation-timeline-top");
      document.documentElement.style.removeProperty("--editor-rail-tabs-dock-top");
    };
  }, [orchestratorSectionExpanded, writingPulseExpanded, scrutinyExpanded]);

  const applyWritingPulseDecorations = useCallback(() => {
    if (!editor || !writingPulseExpanded) return;
    const selId = selectedGrammarIdRef.current;
    const cards = grammarCardsRef.current;
    const sel = selId ? cards.find((c) => c.id === selId) : undefined;
    const ranges = sel ? [{ start: sel.startChar, end: sel.endChar }] : [];
    setWritingAnalysisDecorations(
      editor,
      buildWritingHighlightDecorations(editor, ranges)
    );
  }, [editor, writingPulseExpanded]);

  const handleSelectGrammarCard = useCallback(
    (id: string | null) => {
      setSelectedGrammarId(id);
      if (!editor || !id) return;
      const card = grammarCardsRef.current.find((c) => c.id === id);
      if (!card) return;
      const map = buildTextCharMap(editor);
      if (!map) return;
      const range = charRangeToDocRange(map, card.startChar, card.endChar);
      if (!range) return;
      editor
        .chain()
        .focus()
        .setTextSelection({ from: range.from, to: range.to })
        .scrollIntoView()
        .run();
    },
    [editor]
  );

  const handleAcceptGrammarSuggestion = useCallback(
    (id: string) => {
      if (!editor) return;
      const card = grammarCardsRef.current.find((c) => c.id === id);
      if (!card) return;
      const map = buildTextCharMap(editor);
      if (!map) return;
      const range = charRangeToDocRange(map, card.startChar, card.endChar);
      if (!range) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: range.from, to: range.to })
        .insertContentAt(range.from, card.suggested)
        .run();
      setSelectedGrammarId(null);
    },
    [editor]
  );

  /** Harper (WASM) grammar list + weakeners; only the selected sentence is tinted. */
  useEffect(() => {
    if (!editor) return;

    if (!writingPulseExpanded) {
      setGrammarCards([]);
      setSelectedGrammarId(null);
      setWritingAnalysisDecorations(editor, []);
      return;
    }

    let fastTimer: ReturnType<typeof setTimeout> | null = null;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    let harperGeneration = 0;

    const runFast = () => {
      applyWritingPulseDecorations();
    };

    const runHarperAsync = () => {
      harperGeneration += 1;
      const gen = harperGeneration;
      void (async () => {
        const text = editor.getText();
        let cards: GrammarSentenceCard[] = [];
        try {
          cards = await analyzeGrammarSentences(text);
        } catch (e) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[grammar] Harper lint failed:", e);
          }
        }
        if (gen !== harperGeneration) return;
        grammarCardsRef.current = cards;
        const prevSel = selectedGrammarIdRef.current;
        const nextSel =
          !prevSel || cards.some((c) => c.id === prevSel) ? prevSel : null;
        selectedGrammarIdRef.current = nextSel;
        setGrammarCards(cards);
        setSelectedGrammarId(nextSel);
        applyWritingPulseDecorations();
      })();
    };

    const schedule = () => {
      if (fastTimer !== null) clearTimeout(fastTimer);
      fastTimer = setTimeout(() => {
        fastTimer = null;
        runFast();
      }, HIGHLIGHT_DEBOUNCE_MS);
      if (slowTimer !== null) clearTimeout(slowTimer);
      slowTimer = setTimeout(() => {
        slowTimer = null;
        runHarperAsync();
      }, LOCAL_GRAMMAR_DEBOUNCE_MS);
    };

    runHarperAsync();
    editor.on("update", schedule);
    return () => {
      editor.off("update", schedule);
      if (fastTimer !== null) clearTimeout(fastTimer);
      if (slowTimer !== null) clearTimeout(slowTimer);
      harperGeneration += 1;
      setWritingAnalysisDecorations(editor, []);
    };
  }, [editor, writingPulseExpanded, applyWritingPulseDecorations]);

  useEffect(() => {
    if (!editor || !writingPulseExpanded) return;
    applyWritingPulseDecorations();
  }, [selectedGrammarId, editor, writingPulseExpanded, applyWritingPulseDecorations]);

  // Clear AI scrutiny highlights while the panel is collapsed.
  useEffect(() => {
    if (!editor) return;
    if (!scrutinyExpanded) {
      setScrutinyDecorations(editor, []);
    }
  }, [editor, scrutinyExpanded]);

  useEffect(() => {
    let cancelled = false;
    void listAgents()
      .then((all) => {
        if (cancelled) return;
        setOrchestratorAgents(all);
      })
      .catch(() => {
        if (cancelled) return;
        setOrchestratorAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const orchestratorSpecialists = orchestratorAgents.filter(
    (a) => a.role === "Specialist" || a.role === "Synonym Specialist"
  );

  const orchestratorHasSelection =
    !!editor &&
    editor.state.selection &&
    editor.state.selection.from !== editor.state.selection.to;

  const orchestratorTargetSnippet = useMemo(() => {
    if (!editor || !orchestratorSectionExpanded) return "";
    const { from, to } = editor.state.selection;
    if (from === to) return "";
    const raw = editor.state.doc
      .textBetween(from, to, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "";
    const max = 380;
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  }, [editor, orchestratorSectionExpanded, orchestratorSelVersion, contentVersion]);

  useEffect(() => {
    if (!editor || !orchestratorSectionExpanded) return;
    const bump = () => setOrchestratorSelVersion((n) => n + 1);
    editor.on("selectionUpdate", bump);
    return () => {
      editor.off("selectionUpdate", bump);
    };
  }, [editor, orchestratorSectionExpanded]);

  useEffect(() => {
    if (!editor) return;
    if (!orchestratorSectionExpanded) {
      setOrchestratorSelectionDecorations(editor, []);
      return;
    }
    const sync = () => {
      const { from, to } = editor.state.selection;
      if (from === to) {
        setOrchestratorSelectionDecorations(editor, []);
      } else {
        setOrchestratorSelectionDecorations(editor, [
          Decoration.inline(from, to, { class: "orchestrator-target-range" }),
        ]);
      }
    };
    sync();
    editor.on("selectionUpdate", sync);
    editor.on("update", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("update", sync);
      setOrchestratorSelectionDecorations(editor, []);
    };
  }, [editor, orchestratorSectionExpanded]);

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // Overlay state
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [storedSelection, setStoredSelection] = useState<OverlaySelection | null>(
    null
  );
  const [prompt, setPrompt] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [invocationLog, setInvocationLog] = useState<AgentInvocationLogEntry[]>(
    () => initialMonkeyTimeline
  );

  const invocationLogRef = useRef(invocationLog);
  useEffect(() => {
    invocationLogRef.current = invocationLog;
  }, [invocationLog]);

  useEffect(() => {
    if (!initialMonkeyTimeline.length) return;
    const maxId = Math.max(...initialMonkeyTimeline.map((e) => e.id));
    if (Number.isFinite(maxId)) {
      nextInvocationId = Math.max(nextInvocationId, maxId + 1);
    }
  }, [initialMonkeyTimeline]);

  const timelineSaveSkippedRef = useRef(true);
  useEffect(() => {
    if (!timelineDocumentId && !onSaveMonkeyTimeline) return;
    if (timelineSaveSkippedRef.current) {
      timelineSaveSkippedRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      if (onSaveMonkeyTimeline) {
        onSaveMonkeyTimeline(invocationLogRef.current);
      } else if (timelineDocumentId) {
        void saveDoc(timelineDocumentId, { monkeyTimeline: invocationLogRef.current });
      }
    }, TIMELINE_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [invocationLog, timelineDocumentId, onSaveMonkeyTimeline]);

  useEffect(() => {
    if (!timelineDocumentId && !onSaveMonkeyTimeline) return;
    const flush = () => {
      if (onSaveMonkeyTimeline) {
        onSaveMonkeyTimeline(invocationLogRef.current);
      } else if (timelineDocumentId) {
        void saveDoc(timelineDocumentId, {
          monkeyTimeline: invocationLogRef.current,
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = () => {
      flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [timelineDocumentId, onSaveMonkeyTimeline]);

  // Multiple inline suggestions state
  const [pendingRewrites, setPendingRewrites] = useState<PendingRewrite[]>([]);
  const pendingRewritesRef = useRef<PendingRewrite[]>([]);
  const [suggestionPositions, setSuggestionPositions] = useState<
    Record<number, { top: number }>
  >({});
  const suggestionElRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const revealTimersRef = useRef<Record<number, number>>({});
  const revealContentRefs = useRef<Record<number, HTMLElement | null>>({});
  // Track how many extra spacer paragraphs we've added per rewrite so we can
  // keep nudging content down until there is no overlap, without adding an
  // unbounded number of blank lines.
  const spacerAdjustedRef = useRef<Record<number, number>>({});
  /** Latest overlap-repair spacer adjust (also invoked during word reveal DOM updates). */
  const adjustRewriteOverlapSpacersRef = useRef<() => void>(() => {});

  // Keep ref in sync with state
  useEffect(() => {
    pendingRewritesRef.current = pendingRewrites;
  }, [pendingRewrites]);

  /** When the card is changing size (loading/reveal/streaming), nudge overlap repair immediately. */
  const rewriteGrowthSig = useMemo(
    () =>
      pendingRewrites
        .filter((rw) => rw.parentId == null)
        .map(
          (rw) =>
            `${rw.id}:${rw.isRevealing ? 1 : 0}:${rw.isLoading ? 1 : 0}:${
              (rw.rewriteText ?? rw.originalText ?? "").length
            }`
        )
        .join("|"),
    [pendingRewrites]
  );

  // Track the latest HTML so we can save without touching the editor DOM
  const lastHtmlRef = useRef<string>(initialContent);
  const dirtyRef = useRef(false);

  // Robust auto-save: debounced on edit, periodic 30s fallback,
  // visibilitychange + beforeunload for tab/navigation saves,
  // and safe unmount flush that avoids DOM access.
  useEffect(() => {
    if (!editor || !docId || !onSaveContent) return;

    let debounceTimer: number | undefined;
    let periodicTimer: number | undefined;

    const save = () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      onSaveContent(lastHtmlRef.current);
    };

    const scheduleDebounceSave = () => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(save, SAVE_DEBOUNCE_MS);
    };

    const onEditorUpdate = () => {
      try {
        lastHtmlRef.current = editor.getHTML();
      } catch {
        return;
      }
      dirtyRef.current = true;
      scheduleDebounceSave();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") save();
    };

    const onBeforeUnload = () => {
      save();
    };

    editor.on("update", onEditorUpdate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    periodicTimer = window.setInterval(save, PERIODIC_SAVE_MS);

    return () => {
      editor.off("update", onEditorUpdate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (debounceTimer != null) clearTimeout(debounceTimer);
      if (periodicTimer != null) clearInterval(periodicTimer);
      // Flush on unmount using the cached HTML (no DOM access)
      save();
    };
  }, [editor, docId, onSaveContent]);

  /** Handle clicks on empty page area to jump cursor there */
  const handlePageClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!editor || !pageRef.current || !contentRef.current) return;

      // Don't interfere if the user just finished a drag-selection
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;

      const target = e.target as HTMLElement;
      if (target.closest(".inline-suggestion")) return;

      // Convert click to pages-container-local Y (accounts for scroll)
      const containerRect = pageRef.current.getBoundingClientRect();
      const containerY = e.clientY - containerRect.top;

      // Ignore clicks that land inside a gray inter-page gap
      for (let i = 1; i < pageCount; i++) {
        const gapTop = i * (pageHeightPx + GAP_HEIGHT) - GAP_HEIGHT;
        const gapBottom = i * (pageHeightPx + GAP_HEIGHT);
        if (containerY >= gapTop && containerY < gapBottom) return;
      }

      // Find the last block of content to determine where content ends
      const tiptapEl = contentRef.current.querySelector(".tiptap");
      if (!tiptapEl) return;

      const children = tiptapEl.children;
      if (children.length === 0) return;

      const lastChild = children[children.length - 1] as Element | undefined;
      if (!lastChild) return;
      const lastChildRect = lastChild.getBoundingClientRect();

      // Only allow normal TipTap positioning within existing content.
      // If the click is below all content, do nothing — later lines/pages are
      // reached only by typing/Enter.
      if (e.clientY <= lastChildRect.bottom + 5) return;
      return;
    },
    [editor, pageCount, pageHeightPx]
  );

  const updatePageCount = useCallback(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const tiptapEl = contentEl.querySelector(".tiptap");
    if (!tiptapEl) return;

    // Continuous page: container and page background grow with content.
    const contentHeight = tiptapEl.scrollHeight;
    setContainerMinHeight(contentHeight);
    const contentPages = Math.ceil(
      (contentHeight + GAP_HEIGHT) / (pageHeightPx + GAP_HEIGHT)
    );
    const newPageCount = Math.max(1, contentPages);
    setPageCount(newPageCount);
  }, [pageHeightPx]);

  // Watch for content changes so the scrollable area grows with the document.
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const observer = new ResizeObserver(() => {
      updatePageCount();
    });
    observer.observe(contentEl);

    return () => observer.disconnect();
  }, [updatePageCount]);

  // Update page count (container height) on editor changes.
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      requestAnimationFrame(() => {
        updatePageCount();
        setContentVersion((v) => v + 1);
      });
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, updatePageCount]);

  // Initial container height after mount.
  useEffect(() => {
    if (!editor) return;
    requestAnimationFrame(() => {
      updatePageCount();
    });
  }, [editor, updatePageCount]);

  // Track ALL pending rewrite positions through editor transactions
  useEffect(() => {
    if (!editor || pendingRewrites.length === 0) return;

    const handleTransaction = ({ transaction }: any) => {
      if (!transaction.docChanged) return;
      const prev = pendingRewritesRef.current;
      if (prev.length === 0) return;

      const updated = prev.map((rw) => ({
        ...rw,
        from: transaction.mapping.map(rw.from),
        to: transaction.mapping.map(rw.to),
        spacerFrom: transaction.mapping.map(rw.spacerFrom),
        spacerTo: transaction.mapping.map(rw.spacerTo),
      }));
      pendingRewritesRef.current = updated;
      setPendingRewrites(updated);
    };

    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pendingRewrites.length > 0]);

  // Compute suggestion positions for ALL pending rewrites
  useEffect(() => {
    if (USE_INFLOW_SUGGESTIONS) {
      setSuggestionPositions({});
      return;
    }
    if (!editor || pendingRewrites.length === 0 || !pageRef.current) {
      setSuggestionPositions({});
      return;
    }

    requestAnimationFrame(() => {
      if (!editor || !pageRef.current) return;
      const current = pendingRewritesRef.current;
      if (current.length === 0) {
        setSuggestionPositions({});
        return;
      }

      const positions: Record<number, { top: number }> = {};
      const pageRect = pageRef.current.getBoundingClientRect();

      for (const rw of current) {
        if (rw.parentId != null) continue;
        try {
          const docSize = editor.state.doc.content.size;
          const safeEnd = Math.min(rw.to, docSize);
          if (safeEnd <= 0) continue;
          // Position the suggestion directly under the end of the selected
          // span, so it appears attached to the phrase you are rewriting.
          const coords = editor.view.coordsAtPos(safeEnd, 1);
          positions[rw.id] = { top: coords.bottom - pageRect.top + 4 };
        } catch {
          // skip if position is invalid
        }
      }

      setSuggestionPositions(positions);
    });
  }, [editor, pendingRewrites, contentVersion]);

  // Measure actual suggestion element height and adjust spacers to prevent overlap
  useEffect(() => {
    if (USE_INFLOW_SUGGESTIONS) {
      adjustRewriteOverlapSpacersRef.current = () => {};
      return;
    }
    if (!editor || pendingRewrites.length === 0) {
      adjustRewriteOverlapSpacersRef.current = () => {};
      return;
    }

    let frameId: number | null = null;
    let adjusting = false;

    const adjustSpacers = () => {
      if (adjusting) return;
      adjusting = true;

      for (const rw of pendingRewritesRef.current) {
        if (rw.parentId != null) continue;
        const el = suggestionElRefs.current[rw.id];
        if (!el) continue;

        const rewriteForMeasure =
          pendingRewritesRef.current.find((r) => r.id === rw.id)?.rewriteText ??
          rw.rewriteText ??
          rw.originalText ??
          "";
        const MAX_EXTRA_PARAS = maxOverlapRepairExtraParas(rewriteForMeasure, lineHeightPx);
        /** Conservative: assume each new empty `<p>` adds ~this much flow height after min-height CSS. */
        const pixelsPerPara = lineHeightPx;

        /** Pixels of clearance required between card bottom and top of following doc content. */
        const CARD_CLEARANCE_PX = 44;
        /** Extra slack: measured spacer strip should be at least card height + this. */
        const STRIP_VS_CARD_BUFFER_PX = 92;
        /**
         * Tie minimum spacer *count* to measured card height (includes Accept/Reject).
         * Converts a shortfall into px so overlap repair inserts enough rows even if coords lag.
         */
        const CARD_PARA_SLOT_PX = lineHeightPx;
        const CARD_PARA_EXTRA_RESERVE_PX = 136;

        let rwSpacersChanged = false;
        for (let round = 0; round < 22; round++) {
          const cur = pendingRewritesRef.current.find((r) => r.id === rw.id);
          if (!cur || cur.parentId != null) break;

          const rectNow = el.getBoundingClientRect();
          if (rectNow.height <= 0) break;

          const docSize = editor.state.doc.content.size;
          const safePos = Math.min(cur.spacerTo, docSize);

          let contentAfterTop: number;
          try {
            if (safePos >= docSize) {
              const probe = Math.max(1, Math.min(cur.spacerTo - 1, docSize - 1));
              const c = editor.view.coordsAtPos(probe, -1);
              contentAfterTop = c.bottom;
            } else {
              const a = editor.view.coordsAtPos(safePos, 1);
              const b = editor.view.coordsAtPos(safePos, -1);
              contentAfterTop = Math.min(a.top, b.top);
            }
          } catch {
            break;
          }

          const overlap = rectNow.bottom - contentAfterTop;
          const spacerParas = (cur.spacerTo - cur.spacerFrom) / 2;
          const measuredStripPx = measureRewriteSpacerStripPx(
            editor.view,
            cur.spacerFrom,
            cur.spacerTo
          );
          const reservedFlowPx =
            measuredStripPx > 4 ? measuredStripPx : spacerParas * pixelsPerPara;
          const heightGap = rectNow.height - reservedFlowPx + STRIP_VS_CARD_BUFFER_PX;
          const stripVsCardShortfall = Math.max(
            0,
            rectNow.height + STRIP_VS_CARD_BUFFER_PX - measuredStripPx
          );

          const minParasForCardHeight = Math.ceil(
            (rectNow.height + CARD_PARA_EXTRA_RESERVE_PX) / CARD_PARA_SLOT_PX
          );
          const paraCountShortfallPx =
            Math.max(0, minParasForCardHeight - spacerParas) * CARD_PARA_SLOT_PX;

          const overlapNeed = Math.max(
            overlap + CARD_CLEARANCE_PX,
            heightGap,
            stripVsCardShortfall,
            paraCountShortfallPx
          );

          const currentExtra = spacerAdjustedRef.current[cur.id] ?? 0;
          if (overlapNeed <= 0 || currentExtra >= MAX_EXTRA_PARAS) break;

          const remaining = MAX_EXTRA_PARAS - currentExtra;
          const extraParas = Math.max(
            1,
            Math.min(
              remaining,
              Math.ceil((overlapNeed / pixelsPerPara) * 1.2)
            )
          );

          editor
            .chain()
            .command(({ tr, state }) => {
              let pos = cur.spacerTo;
              const paragraphType = state.schema.nodes["paragraph"];
              if (!paragraphType) return false;
              for (let i = 0; i < extraParas; i++) {
                tr.insert(pos, paragraphType.create());
                pos += 2;
              }
              return true;
            })
            .run();

          spacerAdjustedRef.current[cur.id] = currentExtra + extraParas;

          const newSpacerTo = cur.spacerTo + extraParas * 2;
          pendingRewritesRef.current = pendingRewritesRef.current.map((r) =>
            r.id === cur.id ? { ...r, spacerTo: newSpacerTo } : r
          );
          rwSpacersChanged = true;
        }
        if (rwSpacersChanged) {
          setPendingRewrites(pendingRewritesRef.current.slice());
        }
      }

      adjusting = false;
    };

    adjustRewriteOverlapSpacersRef.current = adjustSpacers;

    const scheduleAdjust = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(adjustSpacers);
    };

    const observers: ResizeObserver[] = [];
    for (const rw of pendingRewrites) {
      const el = suggestionElRefs.current[rw.id];
      if (!el) continue;

      const observer = new ResizeObserver(scheduleAdjust);
      observer.observe(el);
      observers.push(observer);
    }

    scheduleAdjust();

    return () => {
      adjustRewriteOverlapSpacersRef.current = () => {};
      if (frameId !== null) cancelAnimationFrame(frameId);
      observers.forEach((obs) => obs.disconnect());
    };
  }, [editor, pendingRewrites, suggestionPositions, lineHeightPx]);

  // Re-check overlap when the doc or caret moves — ResizeObserver only sees card size.
  useEffect(() => {
    if (!editor || pendingRewrites.length === 0) return;
    let timeoutId: number | undefined;
    const schedule = () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        adjustRewriteOverlapSpacersRef.current();
      }, 16);
    };
    editor.on("update", schedule);
    editor.on("selectionUpdate", schedule);
    return () => {
      editor.off("update", schedule);
      editor.off("selectionUpdate", schedule);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [editor, pendingRewrites.length]);

  /* Nudge spacers after paint: loading card mounts, reveal ends, actions appear — not only Accept/Reject. */
  useLayoutEffect(() => {
    if (!editor) return;
    if (!pendingRewrites.some((rw) => rw.parentId == null)) return;
    requestAnimationFrame(() => {
      adjustRewriteOverlapSpacersRef.current();
      requestAnimationFrame(() => adjustRewriteOverlapSpacersRef.current());
      requestAnimationFrame(() =>
        requestAnimationFrame(() => adjustRewriteOverlapSpacersRef.current())
      );
    });
  }, [editor, rewriteGrowthSig]);

  // Enter: move the caret from the rewritten passage / spacer strip to the doc below the card
  useEffect(() => {
    if (USE_INFLOW_SUGGESTIONS) return;
    if (!editor) return;
    const dom = editor.view.dom;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.defaultPrevented) return;
      if (e.isComposing) return;
      if (!editor.isFocused) return;
      const head = editor.state.selection.$head.pos;
      for (const rw of pendingRewritesRef.current) {
        if (rw.parentId != null) continue;
        if (head >= rw.from && head < rw.spacerTo) {
          e.preventDefault();
          e.stopPropagation();
          const docSize = editor.state.doc.content.size;
          const target = Math.min(Math.max(1, rw.spacerTo), docSize);
          editor.chain().focus().setTextSelection(target).scrollIntoView().run();
          requestAnimationFrame(() => {
            adjustRewriteOverlapSpacersRef.current();
            requestAnimationFrame(() => {
              adjustRewriteOverlapSpacersRef.current();
              requestAnimationFrame(() => adjustRewriteOverlapSpacersRef.current());
            });
          });
          return;
        }
        const cardEl = suggestionElRefs.current[rw.id];
        if (!cardEl) continue;
        try {
          const cardRect = cardEl.getBoundingClientRect();
          const caretTop = editor.view.coordsAtPos(head).top;
          if (
            head >= rw.spacerTo &&
            caretTop < cardRect.bottom - 2
          ) {
            e.preventDefault();
            e.stopPropagation();
            adjustRewriteOverlapSpacersRef.current();
            requestAnimationFrame(() => {
              adjustRewriteOverlapSpacersRef.current();
              requestAnimationFrame(() => {
                adjustRewriteOverlapSpacersRef.current();
                if (!editor.isDestroyed) {
                  editor.chain().focus().splitBlock().run();
                }
              });
            });
            return;
          }
        } catch {
          /* ignore */
        }
      }
    };
    dom.addEventListener("keydown", onKeyDown, true);
    return () => dom.removeEventListener("keydown", onKeyDown, true);
  }, [editor]);

  // Safety: if the caret ends up visually under a growing rewrite card, jump it to the end of the spacer strip.
  useEffect(() => {
    if (USE_INFLOW_SUGGESTIONS) return;
    if (!editor || pendingRewrites.length === 0) return;
    const lastNudgeAtRef = { current: 0 };
    const nudge = () => {
      if (!editor.isFocused || editor.isDestroyed) return;
      const head = editor.state.selection.$head.pos;
      const now = performance.now();
      if (now - lastNudgeAtRef.current < 80) return;

      for (const rw of pendingRewritesRef.current) {
        if (rw.parentId != null) continue;
        const cardEl = suggestionElRefs.current[rw.id];
        if (!cardEl) continue;
        try {
          const cardRect = cardEl.getBoundingClientRect();
          const caretTop = editor.view.coordsAtPos(head).top;
          if (caretTop < cardRect.bottom - 2) {
            lastNudgeAtRef.current = now;
            adjustRewriteOverlapSpacersRef.current();
            requestAnimationFrame(() => {
              if (editor.isDestroyed) return;
              const latest = pendingRewritesRef.current.find((r) => r.id === rw.id);
              if (!latest) return;
              const docSize = editor.state.doc.content.size;
              const target = Math.min(Math.max(1, latest.spacerTo), docSize);
              editor.chain().focus().setTextSelection(target).scrollIntoView().run();
              requestAnimationFrame(() => adjustRewriteOverlapSpacersRef.current());
            });
            return;
          }
        } catch {
          /* ignore */
        }
      }
    };

    editor.on("selectionUpdate", nudge);
    return () => {
      editor.off("selectionUpdate", nudge);
    };
  }, [editor, pendingRewrites.length]);

  // Word-by-word reveal animation — pre-allocates spacers for full text first
  useEffect(() => {
    for (const rw of pendingRewrites) {
      if (
        rw.rewriteText &&
        rw.isRevealing &&
        !(rw.id in revealTimersRef.current)
      ) {
        if (USE_INFLOW_SUGGESTIONS) {
          // Ensure the node starts empty before revealing.
          editor?.commands.updateSuggestionBlock(rw.id, {
            status: "ready",
            text: "",
            error: null,
          });
        } else {
          // Pre-allocate spacers for the FULL text before starting reveal so
          // content below is pushed down before words start appearing, but keep
          // the baseline modest so short rewrites (e.g. synonyms) don't create a
          // huge empty gap.
          if (editor) {
            const currentRef = pendingRewritesRef.current.find(
              (r) => r.id === rw.id
            );
            if (currentRef && currentRef.parentId == null) {
              const currentSpacers =
                (currentRef.spacerTo - currentRef.spacerFrom) / 2;
              const extraNeeded = extraSpacerParagraphsNeeded(
                rw.rewriteText,
                currentSpacers,
                undefined,
                lineHeightPx
              );

              if (extraNeeded > 0) {
                editor
                  .chain()
                  .command(({ tr, state }) => {
                    let pos = currentRef.spacerTo;
                    const paragraphType = state.schema.nodes["paragraph"];
                    if (!paragraphType) return false;
                    for (let i = 0; i < extraNeeded; i++) {
                      const para = paragraphType.create();
                      tr.insert(pos, para);
                      pos += 2;
                    }
                    return true;
                  })
                  .run();

                const newSpacerTo = currentRef.spacerTo + extraNeeded * 2;
                const updated = pendingRewritesRef.current.map((r) =>
                  r.id === rw.id ? { ...r, spacerTo: newSpacerTo } : r
                );
                pendingRewritesRef.current = updated;
                setPendingRewrites(updated);
              }
            }
          }
        }

        const words = rw.rewriteText.split(" ");
        let wordIndex = 0;

        const timer = window.setInterval(() => {
          wordIndex++;
          const partial = words.slice(0, wordIndex).join(" ");
          if (USE_INFLOW_SUGGESTIONS) {
            editor?.commands.updateSuggestionBlock(rw.id, {
              status: "ready",
              text: partial,
              error: null,
            });
          } else {
            const contentEl = revealContentRefs.current[rw.id];
            if (contentEl) {
              contentEl.innerText = partial;
            }
            requestAnimationFrame(() => adjustRewriteOverlapSpacersRef.current());
          }

          if (wordIndex >= words.length) {
            clearInterval(timer);
            delete revealTimersRef.current[rw.id];
            if (!USE_INFLOW_SUGGESTIONS) {
              requestAnimationFrame(() => adjustRewriteOverlapSpacersRef.current());
            }
            setPendingRewrites((prev) =>
              prev.map((r) =>
                r.id === rw.id ? { ...r, isRevealing: false } : r
              )
            );
            pendingRewritesRef.current = pendingRewritesRef.current.map((r) =>
              r.id === rw.id ? { ...r, isRevealing: false } : r
            );
          }
        }, 50);

        revealTimersRef.current[rw.id] = timer;
      }
    }
  }, [pendingRewrites, editor, lineHeightPx]);

  // Clean up all reveal timers on unmount
  useEffect(() => {
    return () => {
      Object.values(revealTimersRef.current).forEach((t) => clearInterval(t));
      revealTimersRef.current = {};
    };
  }, []);

  // Handle Cmd+K to open overlay — doc selection or a selection inside an inline suggestion (nested rewrite)
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "k" || e.key === "j")
      ) {
        const action: OverlayDocSelection["action"] =
          e.key === "j" ? "expand" : "rewrite";

        const domSel = window.getSelection();
        if (domSel && !domSel.isCollapsed && domSel.rangeCount > 0) {
          const range = domSel.getRangeAt(0);
          const anchorEl =
            range.commonAncestorContainer.nodeType === Node.TEXT_NODE
              ? (range.commonAncestorContainer.parentElement as HTMLElement | null)
              : (range.commonAncestorContainer as HTMLElement);
          const contentHost = anchorEl?.closest?.(
            ".inline-suggestion-content"
          ) as HTMLElement | null;
          if (contentHost) {
            // Cmd/Ctrl+E is only supported for document selections (not within suggestion cards).
            if (action === "expand") return;
            e.preventDefault();
            const card = contentHost.closest("[data-rewrite-id]");
            const rwIdAttr = card?.getAttribute("data-rewrite-id");
            const rwId = rwIdAttr ? Number(rwIdAttr) : NaN;
            const offsets = getTextOffsetsInElement(contentHost, range);
            if (
              !Number.isFinite(rwId) ||
              !offsets ||
              offsets.start >= offsets.end
            ) {
              return;
            }
            const parentRw = pendingRewritesRef.current.find(
              (r) => r.id === rwId
            );
            if (
              !parentRw ||
              parentRw.parentId != null ||
              parentRw.isLoading ||
              !parentRw.rewriteText ||
              parentRw.isRevealing
            ) {
              return;
            }
            if (pendingRewritesRef.current.some((c) => c.parentId === rwId)) {
              return;
            }
            const inner = parentRw.rewriteText;
            const selectedText = inner.slice(offsets.start, offsets.end);
            if (!selectedText.trim()) return;

            setStoredSelection({
              kind: "suggestion",
              parentRewriteId: rwId,
              startOffset: offsets.start,
              endOffset: offsets.end,
              selectedText,
            });
            setIsOverlayOpen(true);
            setPrompt("");
            return;
          }
        }

        e.preventDefault();

        const { from, to } = editor.state.selection;
        if (from === to) return;

        editor
          .chain()
          .setTextSelection({ from, to })
          .setHighlight({ color: HIGHLIGHT_COLOR })
          .run();

        setStoredSelection({ kind: "doc", from, to, action });
        setIsOverlayOpen(true);
        setPrompt("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor]);

  // Handle overlay close (cancel) — remove the preview highlight
  const handleOverlayClose = useCallback(() => {
    setIsOverlayOpen(false);
    setPrompt("");

    if (editor && storedSelection?.kind === "doc") {
      editor
        .chain()
        .setTextSelection({
          from: storedSelection.from,
          to: storedSelection.to,
        })
        .unsetHighlight()
        .focus()
        .run();
    } else if (storedSelection?.kind === "suggestion") {
      requestAnimationFrame(() => {
        revealContentRefs.current[storedSelection.parentRewriteId]?.focus();
      });
    }

    setStoredSelection(null);
  }, [editor, storedSelection]);

  // Fetch rewrite from API
  const fetchRewrite = useCallback(
    async (
      text: string,
      userPrompt: string,
      agentId?: string | null,
      contextIds?: string[] | null,
      sentenceContext?: string | null
    ): Promise<string> => {
      // Trial mode: no Supabase user, no agents/contexts/sentence synonym mode.
      // Hits the unauthenticated rewrite-demo edge function.
      if (trialMode) {
        const { rewrite } = await callTrialDemoRewrite({
          text,
          prompt: userPrompt,
          llmProvider,
        });
        return rewrite;
      }

      const payload: Record<string, unknown> = { text, prompt: userPrompt };
      if (agentId) payload.agentId = agentId;
      if (contextIds && contextIds.length) {
        payload.contextIds = contextIds.slice(0, 5);
      }
      const trimmedCtx = sentenceContext?.trim();
      if (trimmedCtx) payload.sentenceContext = trimmedCtx;
      payload.llmProvider = llmProvider;

      const { data, error } = await supabase.functions.invoke("rewrite", {
        body: payload,
      });
      if (error) {
        const p = await readEdgeInvokeParsed(error, data);
        if (p?.kind === "quota_exceeded") {
          throw new QuotaExceededError(p.type ?? "sentences", {
            used: p.used,
            limit: p.limit,
          });
        }
        if (p?.kind === "trial_quota_exceeded") {
          throw new TrialQuotaExceededError(p.type === "scrutiny" ? "scrutiny" : "rewrite");
        }
        if (p?.kind === "rate_limit") {
          throw new BurstRateLimitError(p.bucket);
        }
        if (p?.kind === "payload_too_large") {
          throw new PayloadTooLargeError({
            field: p.field,
            maxChars: p.maxChars,
            maxBytes: p.maxBytes,
          });
        }
        throw error;
      }
      return (data as { rewrite: string }).rewrite;
    },
    [llmProvider, trialMode]
  );

  const getSelectionInfo = useCallback(() => {
    if (!editor) return null;
    const doc = editor.state.doc;
    const { from, to } = editor.state.selection;
    if (from === to) return null;
    const text = doc.textBetween(from, to, " ");
    return { from, to, text };
  }, [editor]);

  const addOrchestratorStep = useCallback(() => {
    if (orchestratorSpecialists.length === 0) return;
    setOrchestratorChain((prev) => {
      if (prev.length === 0) return [orchestratorSpecialists[0]!.id];
      return [...prev, orchestratorSpecialists[0]!.id];
    });
  }, [orchestratorSpecialists]);

  const removeOrchestratorStep = useCallback((idx: number) => {
    setOrchestratorChain((prev) => prev.filter((_x, i) => i !== idx));
  }, []);

  const moveOrchestratorStep = useCallback((idx: number, delta: number) => {
    setOrchestratorChain((prev) => {
      const next = [...prev];
      const to = idx + delta;
      if (to < 0 || to >= next.length) return prev;
      const tmp = next[idx]!;
      next[idx] = next[to]!;
      next[to] = tmp;
      return next;
    });
  }, []);

  const replaceOrchestratorStep = useCallback(
    (idx: number, agentId: string) => {
      setOrchestratorChain((prev) => prev.map((v, i) => (i === idx ? agentId : v)));
    },
    []
  );

  /** Pretext-based spacer inserts so reveal height matches body column (see pretextRewriteLayout.ts). */
  const insertPretextRevealSpacers = useCallback(
    (rwId: number, rewriteText: string) => {
      if (!editor) return;
      const p = pendingRewritesRef.current.find((r) => r.id === rwId);
      if (!p || p.parentId != null) return;
      const currentCount = (p.spacerTo - p.spacerFrom) / 2;
      const extra = extraSpacerParagraphsNeeded(rewriteText, currentCount, undefined, lineHeightPx);
      if (extra <= 0) return;
      editor
        .chain()
        .command(({ tr, state }) => {
          let pos = p.spacerTo;
          const paragraphType = state.schema.nodes["paragraph"];
          if (!paragraphType) return false;
          for (let i = 0; i < extra; i++) {
            tr.insert(pos, paragraphType.create());
            pos += 2;
          }
          return true;
        })
        .run();
      const newSpacerTo = p.spacerTo + extra * 2;
      pendingRewritesRef.current = pendingRewritesRef.current.map((r) =>
        r.id === rwId ? { ...r, spacerTo: newSpacerTo } : r
      );
    },
    [editor, lineHeightPx]
  );

  const handleOrchestratorPropose = useCallback(async () => {
    if (!orchestratorHasSelection) {
      setOrchestratorError("Select some text to orchestrate.");
      return;
    }
    const sel = getSelectionInfo();
    if (!sel) return;
    setOrchestratorError(null);
    setOrchestratorIsProposing(true);
    try {
      if (!trialMode && subscriptionTier === "free") {
        showUpgradeForQuotaType("orchestrator");
        return;
      }
      const instruction = (orchestratorInstruction.trim() || prompt.trim()).trim();
      const { data: resp, error: orchErr } = await supabase.functions.invoke(
        "orchestrator-plan",
        {
          body: {
            text: sel.text,
            prompt: instruction,
            llmProvider,
          },
        },
      );
      if (orchErr) {
        const p = await readEdgeInvokeParsed(orchErr, resp);
        if (p?.kind === "quota_exceeded") {
          showUpgradeForQuotaType(p.type ?? "orchestrator", {
            used: p.used,
            limit: p.limit,
          });
          return;
        }
        if (p?.kind === "rate_limit") {
          setOrchestratorError(
            "Too many orchestrator requests in a short period. Wait about a minute and try again.",
          );
          return;
        }
        if (p?.kind === "payload_too_large") {
          setOrchestratorError(
            p.maxBytes != null
              ? "Request is too large."
              : "Selection or instruction is larger than allowed.",
          );
          return;
        }
        throw orchErr;
      }

      const seq = (((resp as { sequence?: string[] })?.sequence) ?? []).filter(
        (id: string) => orchestratorSpecialists.some((a) => a.id === id)
      );

      if (seq.length === 0) {
        setOrchestratorError("No valid sequence returned.");
        setOrchestratorChain([]);
        return;
      }

      // If user put Synonym Specialist later, move it to the first position.
      const synonymIds = new Set(
        orchestratorSpecialists
          .filter((a) => a.name.toLowerCase().includes("synonym sensei") || a.name.toLowerCase().includes("synonym monkey"))
          .map((a) => a.id)
      );
      const hasSynonym = seq.some((id) => synonymIds.has(id));
      const reordered = hasSynonym
        ? [
            ...seq.filter((id) => synonymIds.has(id)),
            ...seq.filter((id) => !synonymIds.has(id)),
          ]
        : seq;

      setOrchestratorChain(reordered);
    } catch (e: any) {
      setOrchestratorError(e?.message ?? "Failed to propose sequence.");
    } finally {
      setOrchestratorIsProposing(false);
    }
  }, [
    orchestratorHasSelection,
    getSelectionInfo,
    orchestratorInstruction,
    prompt,
    llmProvider,
    orchestratorSpecialists,
    trialMode,
    subscriptionTier,
    showUpgradeForQuotaType,
  ]);

  const runOrchestratorChain = useCallback(
    async (
      inputText: string,
      chainForExec: string[],
      currentPrompt: string,
      currentContextIds: string[],
      sentenceForSynonym: string
    ): Promise<Array<{ agentId: string; agentName: string; text: string }>> => {
      const steps: Array<{ agentId: string; agentName: string; text: string }> = [];
      let cur = inputText;
      for (const agentId of chainForExec) {
        const agentName =
          orchestratorSpecialists.find((a) => a.id === agentId)?.name ??
          "Unknown agent";
        cur = await fetchRewrite(
          cur,
          currentPrompt,
          agentId,
          currentContextIds,
          sentenceForSynonym
        );
        steps.push({ agentId, agentName, text: cur });
      }
      return steps;
    },
    [fetchRewrite, orchestratorSpecialists]
  );

  const executeOrchestrator = useCallback(
    async (mode: "synthesis" | "sequential") => {
      if (orchestratorChain.length === 0) {
        setOrchestratorError("Add at least one monkey to the chain.");
        return;
      }
      const sel = getSelectionInfo();
      if (!sel) {
        setOrchestratorError("Select some text to execute the chain.");
        return;
      }

      const doc = editor!.state.doc;
      const currentContextIds = selectedContextIds;
      const trimmedPrompt = (orchestratorInstruction.trim() || prompt.trim()).trim();
      const currentPrompt =
        trimmedPrompt ||
        "Rewrite this selection in the agent's voice, improving clarity, flow, and style.";

      if (!trialMode && subscriptionTier === "free") {
        showUpgradeForQuotaType("orchestrator");
        return;
      }

      setOrchestratorIsExecuting(true);
      setOrchestratorError(null);

      const sentenceForSynonym = extractSentenceContext(doc, sel.from, sel.to) ?? "";
      const spacerInsertPos = computeSpacerInsertPos(doc, sel.to);

      if (USE_INFLOW_SUGGESTIONS) {
        // Insert an in-flow suggestion block so document layout pushes content down naturally.
        editor!
          .chain()
          .focus()
          .setTextSelection({ from: sel.from, to: sel.to })
          .setHighlight({ color: HIGHLIGHT_COLOR })
          .insertSuggestionBlock(
            {
              rewriteId: nextRewriteId,
              monkeyId: "", // filled after id is allocated below
              status: "loading",
              title: "Rewritten:",
              text: "",
              error: null,
              selFrom: sel.from,
              selTo: sel.to,
              docAction: "rewrite",
            },
            spacerInsertPos
          )
          .setTextSelection(spacerInsertPos + 2)
          .scrollIntoView()
          .run();
      } else {
        editor!
          .chain()
          .focus()
          .setTextSelection({ from: sel.from, to: sel.to })
          .setHighlight({ color: HIGHLIGHT_COLOR })
          .command(({ tr, state }) => {
            const paragraphType = state.schema.nodes["paragraph"];
            if (!paragraphType) return false;
            let pos = spacerInsertPos;
            for (let i = 0; i < INITIAL_SPACER_COUNT; i++) {
              tr.insert(pos, paragraphType.create());
              pos += 2;
            }
            return true;
          })
          .setTextSelection(
            docPosAfterSpacerParagraphs(spacerInsertPos, INITIAL_SPACER_COUNT)
          )
          .scrollIntoView()
          .run();
      }

      const id = nextRewriteId++;
      const monkeyId = randomMonkeyId();

      if (USE_INFLOW_SUGGESTIONS && editor) {
        editor.commands.updateSuggestionBlock(id, { monkeyId, rewriteId: id });
      }
      const pending: PendingRewrite = {
        id,
        orchestratorMode: mode,
        monkeyId,
        from: sel.from,
        to: sel.to,
        originalText: sel.text,
        prompt: currentPrompt,
        rewriteText: null,
        isLoading: true,
        isRevealing: false,
        error: null,
        spacerFrom: spacerInsertPos,
        spacerTo: spacerInsertPos,
      };
      pendingRewritesRef.current = [...pendingRewritesRef.current, pending];
      setPendingRewrites((prev) => [...prev, pending]);

      try {
        let contextLabels: string[] = [];
        try {
          const allCtx = await listContexts();
          contextLabels = currentContextIds.map(
            (cid) => allCtx.find((c) => c.id === cid)?.title ?? cid
          );
        } catch {
          contextLabels = currentContextIds.slice();
        }

        const synonymIds = new Set(
          orchestratorSpecialists
            .filter(
              (a) =>
                a.name.toLowerCase().includes("synonym sensei") ||
                a.name.toLowerCase().includes("synonym monkey")
            )
            .map((a) => a.id)
        );
        const hasSynonym = orchestratorChain.some((id2) => synonymIds.has(id2));
        const chainForExec = hasSynonym
          ? [
              ...orchestratorChain.filter((id2) => synonymIds.has(id2)),
              ...orchestratorChain.filter((id2) => !synonymIds.has(id2)),
            ]
          : orchestratorChain;

        // Log each step in the timeline as it happens.
        const baseInvocationIds = chainForExec.map(() => nextInvocationId++);
        setInvocationLog((prev) => [
          ...prev,
          ...chainForExec.map((agentId, i) => ({
            id: baseInvocationIds[i]!,
            at: Date.now(),
            agentId,
            agentName:
              orchestratorSpecialists.find((a) => a.id === agentId)?.name ??
              "Unknown agent",
            contextLabels,
            userPrompt: currentPrompt,
            apiPromptSent: currentPrompt,
            originalText: sel.text,
            response: null,
            error: null,
            status: "loading" as const,
          })),
        ]);

        const steps = await runOrchestratorChain(
          sel.text,
          chainForExec,
          currentPrompt,
          currentContextIds,
          sentenceForSynonym
        );

        setInvocationLog((prev) =>
          prev.map((e) => {
            const idx = baseInvocationIds.indexOf(e.id);
            if (idx === -1) return e;
            const text = steps[idx]?.text ?? null;
            return text != null ? { ...e, status: "done" as const, response: text } : e;
          })
        );

        let finalText = steps.length ? steps[steps.length - 1]!.text : sel.text;
        let orchestratorSteps = steps;

        if (mode === "synthesis") {
          const synthesisPrompt =
            "Synthesize the following rewrite into one clean final version. Preserve intent, remove redundancy, keep tone consistent, and avoid introducing new facts. Return only the rewritten text.";
          const synthId = nextInvocationId++;
          setInvocationLog((prev) => [
            ...prev,
            {
              id: synthId,
              at: Date.now(),
              agentId: null,
              agentName: "Synthesis",
              contextLabels,
              userPrompt: synthesisPrompt,
              apiPromptSent: synthesisPrompt,
              originalText: finalText,
              response: null,
              error: null,
              status: "loading",
            },
          ]);
          finalText = await fetchRewrite(
            finalText,
            synthesisPrompt,
            null,
            currentContextIds,
            null
          );
          setInvocationLog((prev) =>
            prev.map((e) =>
              e.id === synthId
                ? { ...e, status: "done" as const, response: finalText }
                : e
            )
          );
          orchestratorSteps = [
            ...steps,
            { agentId: "__synthesis__", agentName: "Synthesis", text: finalText },
          ];
        }

        if (!USE_INFLOW_SUGGESTIONS) {
          insertPretextRevealSpacers(id, finalText);
        } else if (editor) {
          editor.commands.updateSuggestionBlock(id, {
            status: "ready",
            text: "",
            error: null,
          });
        }
        const latest = pendingRewritesRef.current.find((r) => r.id === id)!;
        const sentenceAttribution =
          mode === "sequential"
            ? computeSentenceAttribution(sel.text, steps.map((s) => ({ agentName: s.agentName, text: s.text })))
            : undefined;

        setPendingRewrites((prev) =>
          prev.map((rw) =>
            rw.id === id
              ? {
                  ...rw,
                  rewriteText: finalText,
                  orchestratorSteps,
                  sentenceAttribution,
                  isLoading: false,
                  isRevealing: true,
                  spacerTo: latest.spacerTo,
                }
              : rw
          )
        );
        pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
          rw.id === id
            ? {
                ...rw,
                rewriteText: finalText,
                orchestratorSteps,
                sentenceAttribution,
                isLoading: false,
                isRevealing: true,
                spacerTo: latest.spacerTo,
              }
            : rw
        );
      } catch (err: any) {
        if (isQuotaExceededError(err)) {
          showUpgradeForQuotaType(err.quotaType, { used: err.used, limit: err.limit });
        }
        if (trialMode && isTrialQuotaExceededError(err)) {
          onTrialGated?.(err.trialType === "scrutiny" ? "scrutiny-selection" : "rewrite");
        }
        const msg = isQuotaExceededError(err)
          ? "Daily rewrite limit reached"
          : isTrialQuotaExceededError(err)
            ? "Trial limit for this period. Sign up to continue."
            : isBurstRateLimitError(err)
              ? err.message
              : isPayloadTooLargeError(err)
                ? err.message
                : err?.message ?? "Failed to execute orchestrator chain";
        if (USE_INFLOW_SUGGESTIONS && editor) {
          editor.commands.updateSuggestionBlock(id, {
            status: "error",
            error: msg,
          });
        }
        setPendingRewrites((prev) =>
          prev.map((rw) =>
            rw.id === id ? { ...rw, error: msg, isLoading: false } : rw
          )
        );
        pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
          rw.id === id ? { ...rw, error: msg, isLoading: false } : rw
        );
        setOrchestratorError(msg);
      } finally {
        setOrchestratorIsExecuting(false);
      }
    },
    [
      editor,
      orchestratorChain,
      orchestratorInstruction,
      prompt,
      selectedContextIds,
      getSelectionInfo,
      fetchRewrite,
      orchestratorSpecialists,
      insertPretextRevealSpacers,
      runOrchestratorChain,
      trialMode,
      subscriptionTier,
      showUpgradeForQuotaType,
      onTrialGated,
    ]
  );

  const handleOrchestratorSynthesis = useCallback(
    async () => executeOrchestrator("synthesis"),
    [executeOrchestrator]
  );

  const handleOrchestratorSequential = useCallback(
    async () => executeOrchestrator("sequential"),
    [executeOrchestrator]
  );

  // Handle overlay submit — doc selection (highlight + spacers) or nested selection inside a suggestion card
  const handleOverlaySubmit = useCallback(async () => {
    if (!storedSelection) return;
    if (trialMode && !trialSkipClientQuota && onTrialConsume) {
      const ok = onTrialConsume("rewrite");
      if (!ok) {
        onTrialGated?.("rewrite");
        return;
      }
    }
    const currentAgentId = selectedAgentId;
    const currentContextIds = selectedContextIds;
    const trimmedPrompt = prompt.trim();
    const defaultPrompt =
      storedSelection.kind === "doc" && storedSelection.action === "expand"
        ? currentAgentId
          ? "Continue writing from this selection in the agent's voice, adding a few more sentences that flow naturally. Do not repeat the original text."
          : "Continue writing from this selection, adding a few more sentences that flow naturally. Do not repeat the original text."
        : currentAgentId
          ? "Rewrite this selection in the agent's voice, improving clarity, flow, and style."
          : "Rewrite this selection to improve clarity, flow, and style.";
    const currentPrompt = trimmedPrompt || defaultPrompt;

    if (storedSelection.kind === "suggestion") {
      const sug = storedSelection;
      const parentRw = pendingRewritesRef.current.find(
        (r) => r.id === sug.parentRewriteId
      );
      if (!parentRw || parentRw.parentId != null) return;
      if (pendingRewritesRef.current.some((c) => c.parentId === sug.parentRewriteId))
        return;

      setIsOverlayOpen(false);
      setPrompt("");
      setStoredSelection(null);

      const id = nextRewriteId++;
      const timelineLogId = nextInvocationId++;
      const monkeyId = randomMonkeyId();
      const pending: PendingRewrite = {
        id,
        parentId: sug.parentRewriteId,
        parentReplaceStart: sug.startOffset,
        parentReplaceEnd: sug.endOffset,
        monkeyId,
        from: parentRw.from,
        to: parentRw.to,
        originalText: sug.selectedText,
        prompt: currentPrompt,
        rewriteText: null,
        isLoading: true,
        isRevealing: false,
        error: null,
        spacerFrom: parentRw.spacerFrom,
        spacerTo: parentRw.spacerTo,
      };

      pendingRewritesRef.current = [...pendingRewritesRef.current, pending];
      setPendingRewrites((prev) => [...prev, pending]);

      try {
        const agentMeta = currentAgentId ? await getAgent(currentAgentId) : null;
        const agentName =
          agentMeta?.name ?? (currentAgentId ? "Unknown agent" : "Default Agent");

        let contextLabels: string[] = [];
        try {
          const allCtx = await listContexts();
          contextLabels = currentContextIds.map(
            (cid) => allCtx.find((c) => c.id === cid)?.title ?? cid
          );
        } catch {
          contextLabels = currentContextIds.slice();
        }

        setInvocationLog((prev) => [
          ...prev,
          {
            id: timelineLogId,
            at: Date.now(),
            agentId: currentAgentId,
            agentName,
            contextLabels,
            userPrompt: trimmedPrompt,
            apiPromptSent: currentPrompt,
            originalText: sug.selectedText,
            response: null,
            error: null,
            status: "loading",
          },
        ]);

        const result = await fetchRewrite(
          sug.selectedText,
          currentPrompt,
          currentAgentId,
          currentContextIds,
          null
        );

        setPendingRewrites((prev) =>
          prev.map((rw) =>
            rw.id === id
              ? {
                  ...rw,
                  rewriteText: result,
                  isLoading: false,
                  isRevealing: true,
                }
              : rw
          )
        );
        pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
          rw.id === id
            ? {
                ...rw,
                rewriteText: result,
                isLoading: false,
                isRevealing: true,
              }
            : rw
        );

        setInvocationLog((prev) =>
          prev.map((entry) =>
            entry.id === timelineLogId
              ? { ...entry, status: "done" as const, response: result }
              : entry
          )
        );
      } catch (err: any) {
        if (isQuotaExceededError(err)) {
          showUpgradeForQuotaType(err.quotaType, { used: err.used, limit: err.limit });
        }
        if (trialMode && isTrialQuotaExceededError(err)) {
          onTrialGated?.(err.trialType === "scrutiny" ? "scrutiny-selection" : "rewrite");
        }
        const msg = isQuotaExceededError(err)
          ? "Daily rewrite limit reached"
          : isTrialQuotaExceededError(err)
            ? "Trial limit for this period. Sign up to continue."
            : isBurstRateLimitError(err)
              ? err.message
              : isPayloadTooLargeError(err)
                ? err.message
                : err.message || "Failed to generate rewrite";
        setPendingRewrites((prev) =>
          prev.map((rw) =>
            rw.id === id ? { ...rw, error: msg, isLoading: false } : rw
          )
        );
        pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
          rw.id === id ? { ...rw, error: msg, isLoading: false } : rw
        );
        setInvocationLog((prev) => {
          if (!prev.some((e) => e.id === timelineLogId)) return prev;
          return prev.map((entry) =>
            entry.id === timelineLogId
              ? { ...entry, status: "error" as const, error: msg }
              : entry
          );
        });
      }
      return;
    }

    if (!editor) return;
    const doc = editor.state.doc;
    const sel = storedSelection;
    const selectedText = doc.textBetween(sel.from, sel.to, " ");
    const sentenceForSynonym = extractSentenceContext(doc, sel.from, sel.to);

    setIsOverlayOpen(false);
    setPrompt("");
    setStoredSelection(null);

    // Insert spacers starting at a word boundary. If the selection ended in
    // the middle of a word, this moves the *whole* word below the suggestion.
    const spacerInsertPos = computeSpacerInsertPos(doc, sel.to);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'B1',location:'Editor.tsx:handleOverlaySubmit',message:'start_rewrite',data:{from:sel.from,to:sel.to,spacerInsertPos,isInflow:USE_INFLOW_SUGGESTIONS,selectedPreview:selectedText.slice(0,60)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    if (USE_INFLOW_SUGGESTIONS) {
      const inflowId = nextRewriteId;
      const suggestionTitle = sel.action === "expand" ? "Expanding:" : "Rewritten:";
      editor
        .chain()
        .focus()
        .setTextSelection({ from: sel.from, to: sel.to })
        .setHighlight({ color: HIGHLIGHT_COLOR })
        .insertSuggestionBlock(
          {
            rewriteId: inflowId,
            monkeyId: "",
            status: "loading",
            title: suggestionTitle,
            text: "",
            error: null,
            selFrom: sel.from,
            selTo: sel.to,
            docAction: sel.action,
          },
          spacerInsertPos
        )
        .scrollIntoView()
        .run();
      // #region agent log
      requestAnimationFrame(() => {
        try {
          fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'B2',location:'Editor.tsx:handleOverlaySubmit',message:'after_insert_node',data:{selFrom:editor.state.selection.from,selTo:editor.state.selection.to},timestamp:Date.now()})}).catch(()=>{});
        } catch {}
      });
      // #endregion agent log

      // Hard guarantee: move caret below the inserted suggestion block (in case PM keeps it above).
      requestAnimationFrame(() => {
        try {
          let foundPos: number | null = null;
          editor.state.doc.descendants((node, pos) => {
            if (node.type?.name === "suggestionBlock" && (node.attrs as any)?.rewriteId === inflowId) {
              foundPos = pos;
              return false;
            }
            return true;
          });
          const n = foundPos != null ? editor.state.doc.nodeAt(foundPos) : null;
          const after = foundPos != null && n ? Math.min(foundPos + n.nodeSize, editor.state.doc.content.size) : null;
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'B3',location:'Editor.tsx:handleOverlaySubmit',message:'caret_move_attempt',data:{inflowId,foundPos,nodeSize:n?.nodeSize ?? null,after,selFromBefore:editor.state.selection.from,selToBefore:editor.state.selection.to},timestamp:Date.now()})}).catch(()=>{});
          // #endregion agent log
          if (after != null) {
            editor.chain().focus().setTextSelection(after).scrollIntoView().run();
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'B4',location:'Editor.tsx:handleOverlaySubmit',message:'caret_move_done',data:{inflowId,after,selFromAfter:editor.state.selection.from,selToAfter:editor.state.selection.to},timestamp:Date.now()})}).catch(()=>{});
            // #endregion agent log
          }
        } catch {
          /* ignore */
        }
      });
    } else {
      // Highlight text + insert spacer paragraphs in one transaction
      editor
        .chain()
        .focus()
        .setTextSelection({ from: sel.from, to: sel.to })
        .setHighlight({ color: HIGHLIGHT_COLOR })
        .command(({ tr, state }) => {
          const paragraphType = state.schema.nodes["paragraph"];
          if (!paragraphType) return false;
          let pos = spacerInsertPos;
          for (let i = 0; i < INITIAL_SPACER_COUNT; i++) {
            const para = paragraphType.create();
            tr.insert(pos, para);
            pos += 2;
          }
          return true;
        })
        .setTextSelection(
          docPosAfterSpacerParagraphs(spacerInsertPos, INITIAL_SPACER_COUNT)
        )
        .scrollIntoView()
        .run();
    }

    // Create the pending rewrite entry
    const id = nextRewriteId++;
    const timelineLogId = nextInvocationId++;
    const monkeyId = randomMonkeyId();

    if (USE_INFLOW_SUGGESTIONS && editor) {
      editor.commands.updateSuggestionBlock(id, { monkeyId, rewriteId: id });
    }

    const pending: PendingRewrite = {
      id,
      monkeyId,
      from: sel.from,
      to: sel.to,
      originalText: selectedText,
      prompt: currentPrompt,
      docAction: sel.action,
      rewriteText: null,
      isLoading: true,
      isRevealing: false,
      error: null,
      spacerFrom: spacerInsertPos,
      spacerTo: USE_INFLOW_SUGGESTIONS ? spacerInsertPos : spacerInsertPos + INITIAL_SPACER_COUNT * 2,
    };

    // Add to array
    pendingRewritesRef.current = [...pendingRewritesRef.current, pending];
    setPendingRewrites((prev) => [...prev, pending]);

    // Call API in background
    try {
      const agentMeta = currentAgentId ? await getAgent(currentAgentId) : null;
      const agentName =
        agentMeta?.name ?? (currentAgentId ? "Unknown agent" : "Default Agent");

      let contextLabels: string[] = [];
      try {
        const allCtx = await listContexts();
        contextLabels = currentContextIds.map(
          (cid) => allCtx.find((c) => c.id === cid)?.title ?? cid
        );
      } catch {
        contextLabels = currentContextIds.slice();
      }

      let sentenceContext: string | undefined;
      let promptForApi = currentPrompt;
      if (
        currentAgentId &&
        sentenceForSynonym &&
        agentMeta &&
        isSynonymSpecialistAgentName(agentMeta.name)
      ) {
        sentenceContext = sentenceForSynonym;
        const synonymCore =
          "The phrase appears inside the sentence above. Pick one substitute that fits that exact meaning and grammar. For ambiguous words (e.g. draft, bank, bark), use only the sense supported by the surrounding words—never a different meaning. Return only the replacement phrase, same part of speech as the original where possible—no titles, glosses, or explanations.";
        promptForApi = trimmedPrompt
          ? `${trimmedPrompt}\n\n${synonymCore}`
          : synonymCore;
      }
      if (sel.action === "expand") {
        const expandCore =
          "Write ONLY the next sentences that should come AFTER the selected text. Do NOT rewrite, rephrase, or repeat any part of the selected text. Output only the new continuation text (no quotes, no headings). Keep it in the same paragraph unless the prompt explicitly asks for a new paragraph.";
        promptForApi = trimmedPrompt ? `${promptForApi}\n\n${expandCore}` : expandCore;
      }

      setInvocationLog((prev) => [
        ...prev,
        {
          id: timelineLogId,
          at: Date.now(),
          agentId: currentAgentId,
          agentName,
          contextLabels,
          userPrompt: trimmedPrompt,
          apiPromptSent: promptForApi,
          originalText: selectedText,
          response: null,
          error: null,
          status: "loading",
        },
      ]);

      const result = await fetchRewrite(
        selectedText,
        promptForApi,
        currentAgentId,
        currentContextIds,
        sentenceContext
      );
      if (!USE_INFLOW_SUGGESTIONS) {
        insertPretextRevealSpacers(id, result);
      } else if (editor) {
        editor.commands.updateSuggestionBlock(id, {
          status: "ready",
          text: "",
          error: null,
        });
      }
      const latestRw = pendingRewritesRef.current.find((r) => r.id === id)!;
      setPendingRewrites((prev) =>
        prev.map((rw) =>
          rw.id === id
            ? {
                ...rw,
                rewriteText: result,
                isLoading: false,
                isRevealing: true,
                spacerTo: latestRw.spacerTo,
              }
            : rw
        )
      );
      pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
        rw.id === id
          ? {
              ...rw,
              rewriteText: result,
              isLoading: false,
              isRevealing: true,
              spacerTo: latestRw.spacerTo,
            }
          : rw
      );
      setInvocationLog((prev) =>
        prev.map((entry) =>
          entry.id === timelineLogId
            ? { ...entry, status: "done" as const, response: result }
            : entry
        )
      );
    } catch (err: any) {
      if (isQuotaExceededError(err)) {
        showUpgradeForQuotaType(err.quotaType, { used: err.used, limit: err.limit });
      }
      if (trialMode && isTrialQuotaExceededError(err)) {
        onTrialGated?.(err.trialType === "scrutiny" ? "scrutiny-selection" : "rewrite");
      }
      const msg = isQuotaExceededError(err)
        ? "Daily rewrite limit reached"
        : isTrialQuotaExceededError(err)
          ? "Trial limit for this period. Sign up to continue."
          : isBurstRateLimitError(err)
            ? err.message
            : isPayloadTooLargeError(err)
              ? err.message
              : err.message || "Failed to generate rewrite";
      if (USE_INFLOW_SUGGESTIONS && editor) {
        editor.commands.updateSuggestionBlock(id, {
          status: "error",
          error: msg,
        });
      }
      setPendingRewrites((prev) =>
        prev.map((rw) =>
          rw.id === id
            ? {
                ...rw,
                error: msg,
                isLoading: false,
              }
            : rw
        )
      );
      pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
        rw.id === id
          ? {
              ...rw,
              error: msg,
              isLoading: false,
            }
          : rw
      );
      setInvocationLog((prev) => {
        if (!prev.some((e) => e.id === timelineLogId)) return prev;
        return prev.map((entry) =>
          entry.id === timelineLogId
            ? { ...entry, status: "error" as const, error: msg }
            : entry
        );
      });
    }
  }, [
    prompt,
    editor,
    storedSelection,
    selectedAgentId,
    selectedContextIds,
    trialMode,
    trialSkipClientQuota,
    onTrialConsume,
    onTrialGated,
    fetchRewrite,
    llmProvider,
    insertPretextRevealSpacers,
    showUpgradeForQuotaType,
  ]);

  // Accept a specific inline suggestion — merge nested into parent, or apply root to document
  const handleSuggestionAccept = useCallback(
    (rewriteId: number) => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'A1',location:'Editor.tsx:handleSuggestionAccept',message:'accept_called',data:{rewriteId,pendingCount:pendingRewritesRef.current.length,hasEditor:!!editor,isInflow:USE_INFLOW_SUGGESTIONS,selFrom:editor?.state.selection.from ?? null,selTo:editor?.state.selection.to ?? null,selType:(editor as any)?.state?.selection?.constructor?.name ?? null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
      const current = pendingRewritesRef.current.find((rw) => rw.id === rewriteId);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'A1',location:'Editor.tsx:handleSuggestionAccept',message:'accept_current',data:{found:!!current,parentId:current?.parentId ?? null,from:current?.from ?? null,to:current?.to ?? null,spacerFrom:current?.spacerFrom ?? null,spacerTo:current?.spacerTo ?? null,hasRewriteText:!!current?.rewriteText,rewriteLen:current?.rewriteText?.length ?? null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
      if (!current?.rewriteText) {
        if (USE_INFLOW_SUGGESTIONS && editor) {
          // Fallback: after refresh/undo, the suggestion block can exist without in-memory pending state.
          let nodePos: number | null = null;
          let nodeAttrs: any = null;
          editor.state.doc.descendants((node: any, pos: number) => {
            if (node.type?.name === "suggestionBlock" && (node.attrs as any)?.rewriteId === rewriteId) {
              nodePos = pos;
              nodeAttrs = node.attrs;
              return false;
            }
            return true;
          });
          const text = String((nodeAttrs?.text ?? "") as any).trim();
          if (!nodePos || !text) return;
          const action: "rewrite" | "expand" =
            nodeAttrs?.docAction === "expand" ? "expand" : "rewrite";
          const range =
            findHighlightRange(editor.state.doc, HIGHLIGHT_COLOR) ??
            (typeof nodeAttrs?.selFrom === "number" && typeof nodeAttrs?.selTo === "number"
              ? { from: nodeAttrs.selFrom, to: nodeAttrs.selTo }
              : null);
          if (!range) return;

          editor
            .chain()
            .focus()
            .command(({ tr, state }) => {
              const n = state.doc.nodeAt(nodePos!);
              if (n) tr.delete(nodePos!, nodePos! + n.nodeSize);
              return true;
            })
            .setTextSelection({ from: range.from, to: range.to })
            .unsetHighlight()
            .command(({ tr }) => {
              if (action === "expand") {
                tr.insertText(`\n\n${text}`, range.to);
                return true;
              }
              tr.deleteSelection();
              tr.insertText(text, tr.selection.from);
              return true;
            })
            .run();
        }
        return;
      }

      if (current.parentId != null) {
        const pid = current.parentId;
        const start = current.parentReplaceStart!;
        const end = current.parentReplaceEnd!;
        const parent = pendingRewritesRef.current.find((r) => r.id === pid);
        if (!parent?.rewriteText) return;

        const childEdited =
          revealContentRefs.current[rewriteId]?.innerText ?? current.rewriteText;
        const parentEdited =
          revealContentRefs.current[pid]?.innerText ?? parent.rewriteText;

        const merged =
          parentEdited.slice(0, start) +
          childEdited +
          parentEdited.slice(end);

        pendingRewritesRef.current = pendingRewritesRef.current
          .filter((r) => r.id !== rewriteId)
          .map((r) => (r.id === pid ? { ...r, rewriteText: merged } : r));
        setPendingRewrites(pendingRewritesRef.current.slice());

        delete suggestionElRefs.current[rewriteId];
        delete revealContentRefs.current[rewriteId];
        if (revealTimersRef.current[rewriteId]) {
          clearInterval(revealTimersRef.current[rewriteId]);
          delete revealTimersRef.current[rewriteId];
        }
        delete spacerAdjustedRef.current[rewriteId];
        const mergedEl = revealContentRefs.current[pid];
        if (mergedEl) {
          delete mergedEl.dataset.initialized;
        }
        return;
      }

      if (!editor) return;
      if (pendingRewritesRef.current.some((c) => c.parentId === rewriteId)) {
        return;
      }

      const { from, to, spacerFrom, spacerTo } = current;
      const isExpand = current.docAction === "expand";
      const rewriteText = (() => {
        // Prefer the live edited content, even if React state hasn't flushed yet.
        if (USE_INFLOW_SUGGESTIONS && editor) {
          let nodeText: string | null = null;
          editor.state.doc.descendants((node) => {
            if (node.type?.name === "suggestionBlock" && (node.attrs as any)?.rewriteId === rewriteId) {
              nodeText = String(((node.attrs as any)?.text ?? "") as any);
              return false;
            }
            return true;
          });
          const t = (nodeText ?? "").trim();
          if (t) return t;
        } else {
          const elText = (revealContentRefs.current[rewriteId]?.innerText ?? "").trim();
          if (elText) return elText;
        }
        return current.rewriteText;
      })();
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'A2',location:'Editor.tsx:handleSuggestionAccept',message:'accept_pre_replace',data:{rewriteId,from,to,selectedText:editor.state.doc.textBetween(from,to,' '),rewritePreview:rewriteText.slice(0,80)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log

      pendingRewritesRef.current = pendingRewritesRef.current.filter(
        (rw) => rw.id !== rewriteId
      );
      setPendingRewrites((prev) => prev.filter((rw) => rw.id !== rewriteId));
      setSuggestionPositions((prev) => {
        const next = { ...prev };
        delete next[rewriteId];
        return next;
      });
      delete suggestionElRefs.current[rewriteId];
      delete revealContentRefs.current[rewriteId];
      if (revealTimersRef.current[rewriteId]) {
        clearInterval(revealTimersRef.current[rewriteId]);
        delete revealTimersRef.current[rewriteId];
      }

      editor
        .chain()
        .focus()
        // Remove the suggestion UI first (spacers for overlay mode; node for in-flow mode)
        .command(({ tr, state }) => {
          if (USE_INFLOW_SUGGESTIONS) {
            const pos = (() => {
              let found: number | null = null;
              state.doc.descendants((node, p) => {
                if (node.type?.name === "suggestionBlock" && (node.attrs as any)?.rewriteId === rewriteId) {
                  found = p;
                  return false;
                }
                return true;
              });
              return found;
            })();
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'A3',location:'Editor.tsx:handleSuggestionAccept',message:'accept_remove_node',data:{rewriteId,foundPos:pos},timestamp:Date.now()})}).catch(()=>{});
            // #endregion agent log
            if (pos != null) {
              const n = state.doc.nodeAt(pos);
              if (n) tr.delete(pos, pos + n.nodeSize);
            }
          } else {
            tr.delete(spacerFrom, spacerTo);
          }
          return true;
        })
        // Apply to document (rewrite replaces; expand appends below)
        .setTextSelection({ from, to })
        .unsetHighlight()
        .command(({ tr }) => {
          const text = String(rewriteText ?? "").trim();
          if (!text) return false;
          if (isExpand) {
            tr.insertText(`\n\n${text}`, spacerFrom);
            return true;
          }
          tr.deleteSelection();
          tr.insertText(text, tr.selection.from);
          return true;
        })
        .run();

      // #region agent log
      requestAnimationFrame(() => {
        try {
          fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'A4',location:'Editor.tsx:handleSuggestionAccept',message:'accept_post',data:{rewriteId,selFrom:editor.state.selection.from,selTo:editor.state.selection.to,docSize:editor.state.doc.content.size,afterAround:editor.state.doc.textBetween(Math.max(0,from-20),Math.min(editor.state.doc.content.size,to+20),' ')},timestamp:Date.now()})}).catch(()=>{});
        } catch {}
      });
      // #endregion agent log

      if (!USE_INFLOW_SUGGESTIONS && !isExpand) {
        joinSplitParagraphsAfterSpacerRemoval(editor);
      }
    },
    [editor]
  );

  useEffect(() => {
    acceptSuggestionRef.current = handleSuggestionAccept;
  }, [handleSuggestionAccept]);

  // Dismiss/reject — nested drops only the child; root also removes nested children and document highlight
  const handleSuggestionReject = useCallback(
    (rewriteId: number) => {
      const current = pendingRewritesRef.current.find(
        (rw) => rw.id === rewriteId
      );
      if (!current) {
        if (USE_INFLOW_SUGGESTIONS && editor) {
          let nodePos: number | null = null;
          editor.state.doc.descendants((node: any, pos: number) => {
            if (node.type?.name === "suggestionBlock" && (node.attrs as any)?.rewriteId === rewriteId) {
              nodePos = pos;
              return false;
            }
            return true;
          });
          if (nodePos == null) return;
          const range = findHighlightRange(editor.state.doc, HIGHLIGHT_COLOR);
          editor
            .chain()
            .focus()
            .command(({ tr, state }) => {
              const n = state.doc.nodeAt(nodePos!);
              if (n) tr.delete(nodePos!, nodePos! + n.nodeSize);
              return true;
            })
            .command(({ tr, state }) => {
              if (!range) return true;
              // Clear highlight if we can still find it.
              tr.setSelection(TextSelection.create(state.doc, range.from, range.to));
              return true;
            })
            .unsetHighlight()
            .run();
        }
        return;
      }

      if (current.parentId != null) {
        pendingRewritesRef.current = pendingRewritesRef.current.filter(
          (rw) => rw.id !== rewriteId
        );
        setPendingRewrites(pendingRewritesRef.current.slice());
        delete suggestionElRefs.current[rewriteId];
        delete revealContentRefs.current[rewriteId];
        if (revealTimersRef.current[rewriteId]) {
          clearInterval(revealTimersRef.current[rewriteId]);
          delete revealTimersRef.current[rewriteId];
        }
        delete spacerAdjustedRef.current[rewriteId];
        return;
      }

      if (!editor) return;

      const { from, to, spacerFrom, spacerTo } = current;
      const childIds = pendingRewritesRef.current
        .filter((r) => r.parentId === rewriteId)
        .map((r) => r.id);

      pendingRewritesRef.current = pendingRewritesRef.current.filter(
        (rw) => rw.parentId !== rewriteId && rw.id !== rewriteId
      );
      setPendingRewrites(pendingRewritesRef.current.slice());
      setSuggestionPositions((prev) => {
        const next = { ...prev };
        delete next[rewriteId];
        for (const cid of childIds) delete next[cid];
        return next;
      });
      const cleanupId = (id: number) => {
        delete suggestionElRefs.current[id];
        delete revealContentRefs.current[id];
        if (revealTimersRef.current[id]) {
          clearInterval(revealTimersRef.current[id]);
          delete revealTimersRef.current[id];
        }
        delete spacerAdjustedRef.current[id];
      };
      cleanupId(rewriteId);
      for (const cid of childIds) cleanupId(cid);

      editor
        .chain()
        .focus()
        // Remove the suggestion UI first (spacers for overlay mode; node for in-flow mode)
        .command(({ tr, state }) => {
          if (USE_INFLOW_SUGGESTIONS) {
            const pos = (() => {
              let found: number | null = null;
              state.doc.descendants((node, p) => {
                if (node.type?.name === "suggestionBlock" && (node.attrs as any)?.rewriteId === rewriteId) {
                  found = p;
                  return false;
                }
                return true;
              });
              return found;
            })();
            if (pos != null) {
              const n = state.doc.nodeAt(pos);
              if (n) tr.delete(pos, pos + n.nodeSize);
            }
          } else {
            tr.delete(spacerFrom, spacerTo);
          }
          return true;
        })
        // Remove highlight
        .setTextSelection({ from, to })
        .unsetHighlight()
        .setTextSelection(to)
        .run();

      if (!USE_INFLOW_SUGGESTIONS) {
        joinSplitParagraphsAfterSpacerRemoval(editor);
      }
    },
    [editor]
  );

  useEffect(() => {
    rejectSuggestionRef.current = handleSuggestionReject;
  }, [handleSuggestionReject]);

  useEffect(() => {
    const id = requestAnimationFrame(() => updatePageCount());
    return () => cancelAnimationFrame(id);
  }, [lineSpacing, updatePageCount]);

  const handleLineSpacingChange = useCallback((value: number) => {
    setLineSpacing(clampLineSpacing(value));
  }, []);

  return (
    <>
      <Toolbar
        editor={editor}
        llmProvider={llmProvider}
        onLlmProviderChange={setLlmProvider}
        lineSpacing={lineSpacing}
        onLineSpacingChange={handleLineSpacingChange}
      />
      <div ref={editorPageAreaRef} className="editor-page-area">
        <aside
          className="editor-orchestrator-rail"
          aria-label="Writing tools"
          data-onboard="rail"
        >
          <ScrutinyPanel
            editor={editor}
            expanded={scrutinyExpanded}
            onExpandedChange={setScrutinyExpanded}
            trialMode={trialMode}
            trialSkipClientQuota={trialSkipClientQuota}
            subscriptionTier={subscriptionTier}
            onTrialConsume={
              trialSkipClientQuota || !onTrialConsume ? undefined : (a) => onTrialConsume(a)
            }
            onTrialGated={(a) => onTrialGated?.(a)}
            onUpgradeRequired={() => {
              const tier = subscriptionTier ?? "free";
              const limit = dailyScrutinyLimitForTier(tier);
              setUpgradeReason(
                limit != null
                  ? `Your plan includes ${limit} AI Scrutiny scans per day (UTC). Upgrade for more.`
                  : "Upgrade your plan to unlock higher Scrutiny usage.",
              );
              setUpgradeModalOpen(true);
            }}
          />
          <WritingPulsePanel
            editor={editor}
            expanded={writingPulseExpanded}
            onExpandedChange={setWritingPulseExpanded}
            grammarCards={grammarCards}
            selectedGrammarId={selectedGrammarId}
            onSelectGrammarCard={handleSelectGrammarCard}
            onAcceptGrammarSuggestion={handleAcceptGrammarSuggestion}
          />
          <div className="editor-orchestrator-section" data-onboard="orchestrator">
            {orchestratorSectionExpanded ? (
              <>
            <div className="editor-orchestrator-header">
              <div className="editor-orchestrator-title">Orchestrator</div>
              <button
                type="button"
                className="editor-orchestrator-collapse"
                onClick={() => setOrchestratorSectionExpanded(false)}
                aria-expanded
                aria-label="Collapse Orchestrator"
                title="Hide Orchestrator"
              >
                ‹
              </button>
            </div>

            <div className="editor-orchestrator-block">
            <div className="editor-orchestrator-subtitle">
              <p className="editor-orchestrator-lead">
                In the document, <strong>highlight the sentence or passage</strong> you want this chain to
                run on. The same text is tinted in the page and shown below so the target is always obvious.
              </p>
              <p className="editor-orchestrator-subnote">
                Nothing runs until you choose Propose sequence or run Sequential / Synthesis.
              </p>
            </div>

            {orchestratorTargetSnippet ? (
              <div className="editor-orchestrator-target-preview">
                <div className="editor-orchestrator-target-label">Orchestrator target</div>
                <div className="editor-orchestrator-target-quote">{orchestratorTargetSnippet}</div>
              </div>
            ) : (
              <div className="editor-orchestrator-target-empty">
                No selection yet — click and drag in the document to highlight the text for this chain.
              </div>
            )}

            <textarea
              className="editor-orchestrator-textarea"
              value={orchestratorInstruction}
              onChange={(e) => setOrchestratorInstruction(e.target.value)}
              placeholder="Instruction for each monkey in the chain (optional)"
            />

            <div className="editor-orchestrator-actions">
              <button
                type="button"
                className={`editor-orchestrator-btn${orchestratorIsProposing ? " primary" : ""}`}
                onClick={handleOrchestratorPropose}
                disabled={trialMode || orchestratorIsExecuting || orchestratorIsProposing}
              >
                {orchestratorIsProposing ? "Scanning..." : "Propose sequence"}
              </button>
            </div>

            <div className="editor-orchestrator-chain">
              {orchestratorChain.length === 0 ? (
                <div className="editor-orchestrator-muted">
                  No chain yet.
                </div>
              ) : (
                orchestratorChain.map((stepAgentId, idx) => {
                  return (
                    <div key={`${stepAgentId}-${idx}`} className="editor-orchestrator-step">
                      <div className="editor-orchestrator-step-head">
                        <span className="editor-orchestrator-step-label">Step {idx + 1}</span>
                        <div className="editor-orchestrator-step-controls">
                          <button
                            type="button"
                            className="editor-orchestrator-icon-btn"
                            onClick={() => moveOrchestratorStep(idx, -1)}
                            disabled={idx === 0 || orchestratorIsExecuting || orchestratorIsProposing}
                            aria-label="Move up"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="editor-orchestrator-icon-btn"
                            onClick={() => moveOrchestratorStep(idx, +1)}
                            disabled={
                              idx === orchestratorChain.length - 1 || orchestratorIsExecuting || orchestratorIsProposing
                            }
                            aria-label="Move down"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="editor-orchestrator-icon-btn"
                            onClick={() => removeOrchestratorStep(idx)}
                            disabled={orchestratorIsExecuting || orchestratorIsProposing}
                            aria-label="Remove"
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      <select
                        className="editor-orchestrator-step-select"
                        value={stepAgentId}
                        onChange={(e) => replaceOrchestratorStep(idx, e.target.value)}
                        disabled={orchestratorIsExecuting || orchestratorIsProposing}
                      >
                        {orchestratorSpecialists.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>

            {orchestratorError && <div className="editor-orchestrator-error">{orchestratorError}</div>}

            <div className="editor-orchestrator-actions">
              <button
                type="button"
                className="editor-orchestrator-btn"
                onClick={addOrchestratorStep}
                disabled={trialMode || orchestratorIsExecuting || orchestratorIsProposing || orchestratorSpecialists.length === 0}
              >
                Add monkey
              </button>
              <button
                type="button"
                className="editor-orchestrator-btn"
                onClick={handleOrchestratorSequential}
                disabled={
                  trialMode ||
                  orchestratorIsExecuting ||
                  orchestratorIsProposing ||
                  orchestratorChain.length === 0 ||
                  !orchestratorHasSelection
                }
                title={!orchestratorHasSelection ? "Select some text to orchestrate" : "Run sequential and show each step"}
              >
                Sequential
              </button>
              <button
                type="button"
                className="editor-orchestrator-btn primary"
                onClick={handleOrchestratorSynthesis}
                disabled={
                  trialMode ||
                  orchestratorIsExecuting ||
                  orchestratorIsProposing ||
                  orchestratorChain.length === 0 ||
                  !orchestratorHasSelection
                }
                title={!orchestratorHasSelection ? "Select some text to orchestrate" : "Run sequential then synthesize a final clean rewrite"}
              >
                Synthesis
              </button>
            </div>
            {trialMode ? (
              <div className="editor-orchestrator-muted" data-onboard="orchestrator-locked">
                Locked in free trial. Sign up to unlock Orchestrator.
              </div>
            ) : subscriptionTier === "free" ? (
              <div className="editor-orchestrator-muted">
                Orchestrator isn&apos;t included on the free plan. Upgrade to unlock multi-monkey chains.
              </div>
            ) : null}
          </div>
              </>
            ) : null}
          </div>
          </aside>

        <div className="editor-main-column">
          <div className="editor-document-center">
          <div
            className="writing-effect-wrapper"
            data-writing-effect="none"
          >
          <div
            ref={pageRef}
            className="pages-container"
            data-onboard="document"
            style={{ minHeight: containerMinHeight }}
            onClick={handlePageClick}
          >
            <div className="page-card" />
            <div
              ref={contentRef}
              className="editor-content"
              style={{ "--editor-line-height": String(lineSpacing) } as CSSProperties}
              data-onboard="editor"
            >
              <EditorContent editor={editor} />
            </div>

          {!USE_INFLOW_SUGGESTIONS && (
            <>
              {/* Inline suggestions (overlay mode) — root rewrites only; nested refinements render inside the parent card */}
              {pendingRewrites
                .filter((rw) => rw.parentId == null)
                .map((rw) => {
                  const pos = suggestionPositions[rw.id];
                  if (!pos) return null;

                  const nestedChildren = pendingRewrites.filter(
                    (c) => c.parentId === rw.id
                  );
                  const hasNested = nestedChildren.length > 0;
                  const nestedChild = nestedChildren[0];
                  const splitRanges =
                    hasNested && nestedChild && rw.rewriteText
                      ? (() => {
                          const t = rw.rewriteText;
                          const s = Math.max(
                            0,
                            Math.min(
                              nestedChild.parentReplaceStart ?? 0,
                              t.length
                            )
                          );
                          const e = Math.max(
                            s,
                            Math.min(nestedChild.parentReplaceEnd ?? 0, t.length)
                          );
                          return {
                            before: t.slice(0, s),
                            anchor: t.slice(s, e),
                            after: t.slice(e),
                          };
                        })()
                      : null;

                  return (
                    <div
                      key={rw.id}
                      data-rewrite-id={rw.id}
                      ref={(el) => {
                        suggestionElRefs.current[rw.id] = el;
                      }}
                      className={`inline-suggestion${rw.rewriteText && rw.rewriteText.length <= 60 && !hasNested ? " inline-suggestion-compact" : ""}`}
                      style={{
                        position: "absolute",
                        top: `${pos.top}px`,
                        left: 0,
                        right: 0,
                      }}
                    >
                  {rw.isLoading && (
                    <div className="inline-suggestion-loading">
                      <div className="inline-suggestion-spinner" />
                      <span>Monkey {rw.monkeyId} is typing...</span>
                    </div>
                  )}
                  {rw.error && (
                    <div className="inline-suggestion-error">
                      <span>{rw.error}</span>
                      <button
                        className="inline-suggestion-dismiss"
                        onClick={() => handleSuggestionReject(rw.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  {rw.rewriteText && (
                    <>
                      <div className="inline-suggestion-text">
                        <span className="inline-suggestion-arrow">↪</span>
                        <span className="inline-suggestion-label">
                          {rw.docAction === "expand" ? "Expanded:" : "Rewritten:"}
                        </span>{" "}
                        {!splitRanges ? (
                          rw.orchestratorMode === "sequential" &&
                          !rw.isRevealing &&
                          (rw.sentenceAttribution?.length ?? 0) > 0 ? (
                            <div className="inline-suggestion-attributed">
                              {rw.sentenceAttribution!.map((row, idx) => (
                                <span
                                  key={`${rw.id}-sent-${idx}`}
                                  className="inline-suggestion-attributed-sentence"
                                >
                                  <span className="inline-suggestion-sentence-tag">
                                    {row.agentName}
                                  </span>{" "}
                                  {row.sentence}{" "}
                                </span>
                              ))}

                              {rw.orchestratorSteps?.length ? (
                                <details className="inline-suggestion-steps">
                                  <summary>Sequential steps</summary>
                                  <ol className="inline-suggestion-steps-list">
                                    {rw.orchestratorSteps.map((s, i) => (
                                      <li
                                        key={`${rw.id}-step-${i}`}
                                        className="inline-suggestion-step"
                                      >
                                        <div className="inline-suggestion-step-head">
                                          <span className="inline-suggestion-step-agent">
                                            {s.agentName}
                                          </span>
                                        </div>
                                        <pre className="inline-suggestion-step-text">
                                          {s.text}
                                        </pre>
                                      </li>
                                    ))}
                                  </ol>
                                </details>
                              ) : null}
                            </div>
                          ) : (
                            <em
                              className="inline-suggestion-content"
                              contentEditable={!rw.isRevealing && !hasNested}
                              suppressContentEditableWarning
                              spellCheck={false}
                              ref={(el) => {
                                revealContentRefs.current[rw.id] = el;
                                if (
                                  el &&
                                  !rw.isRevealing &&
                                  !hasNested &&
                                  el.dataset.initialized !== "true"
                                ) {
                                  el.innerText = rw.rewriteText!;
                                  el.dataset.initialized = "true";
                                }
                              }}
                              onInput={(e) => {
                                if (rw.isRevealing || hasNested) return;
                                const newText = (e.target as HTMLElement)
                                  .innerText;
                                const idx = pendingRewritesRef.current.findIndex(
                                  (r) => r.id === rw.id
                                );
                                if (idx !== -1) {
                                  const existing =
                                    pendingRewritesRef.current[idx];
                                  if (existing) {
                                    pendingRewritesRef.current[idx] = {
                                      ...existing,
                                      rewriteText: newText,
                                    };
                                  }
                                }
                              }}
                            />
                          )
                        ) : (
                          <div
                            key={`split-${rw.id}-${nestedChild?.id}`}
                            className="inline-suggestion-content inline-suggestion-content--split"
                            ref={(el) => {
                              revealContentRefs.current[rw.id] = el;
                            }}
                          >
                            {splitRanges.before ? (
                              <span className="inline-suggestion-fragment">
                                {splitRanges.before}
                              </span>
                            ) : null}
                            {splitRanges.anchor ? (
                              <span className="inline-suggestion-refine-anchor">
                                {splitRanges.anchor}
                              </span>
                            ) : null}
                            {nestedChild ? (
                              <div
                                className="inline-suggestion-nested inline-suggestion-nested--inline"
                                data-rewrite-id={nestedChild.id}
                              >
                                {nestedChild.isLoading && (
                                  <div className="inline-suggestion-loading">
                                    <div className="inline-suggestion-spinner" />
                                    <span>
                                      Monkey {nestedChild.monkeyId} is typing...
                                    </span>
                                  </div>
                                )}
                                {nestedChild.error && (
                                  <div className="inline-suggestion-error">
                                    <span>{nestedChild.error}</span>
                                    <button
                                      type="button"
                                      className="inline-suggestion-dismiss"
                                      onClick={() =>
                                        handleSuggestionReject(nestedChild.id)
                                      }
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                )}
                                {nestedChild.rewriteText && (
                                  <>
                                    <div className="inline-suggestion-text inline-suggestion-text--nested-refine">
                                      <span className="inline-suggestion-arrow">
                                        ↪
                                      </span>
                                      <span className="inline-suggestion-label">
                                        Refine:
                                      </span>{" "}
                                      <em
                                        className="inline-suggestion-content"
                                        contentEditable={
                                          !nestedChild.isRevealing
                                        }
                                        suppressContentEditableWarning
                                        spellCheck={false}
                                        ref={(el) => {
                                          revealContentRefs.current[
                                            nestedChild.id
                                          ] = el;
                                          if (
                                            el &&
                                            !nestedChild.isRevealing &&
                                            el.dataset.initialized !== "true"
                                          ) {
                                            el.innerText =
                                              nestedChild.rewriteText!;
                                            el.dataset.initialized = "true";
                                          }
                                        }}
                                        onInput={(e) => {
                                          if (nestedChild.isRevealing) return;
                                          const newText = (
                                            e.target as HTMLElement
                                          ).innerText;
                                          const idx =
                                            pendingRewritesRef.current.findIndex(
                                              (r) => r.id === nestedChild.id
                                            );
                                          if (idx !== -1) {
                                            const existing =
                                              pendingRewritesRef.current[idx];
                                            if (existing) {
                                              pendingRewritesRef.current[idx] =
                                                {
                                                  ...existing,
                                                  rewriteText: newText,
                                                };
                                            }
                                          }
                                        }}
                                      />
                                    </div>
                                    {!nestedChild.isRevealing && (
                                      <div className="inline-suggestion-actions">
                                        <button
                                          type="button"
                                          className="inline-suggestion-btn accept"
                                          onClick={() =>
                                            handleSuggestionAccept(
                                              nestedChild.id
                                            )
                                          }
                                        >
                                          ✓ Merge
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-suggestion-btn reject"
                                          onClick={() =>
                                            handleSuggestionReject(
                                              nestedChild.id
                                            )
                                          }
                                        >
                                          ✕ Dismiss
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : null}
                            {splitRanges.after ? (
                              <span className="inline-suggestion-fragment inline-suggestion-fragment-after">
                                {splitRanges.after}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {!rw.isRevealing && (
                        <div className="inline-suggestion-actions">
                          <button
                            type="button"
                            className="inline-suggestion-btn accept"
                            disabled={hasNested}
                            title={
                              hasNested
                                ? "Merge or dismiss the nested suggestion first"
                                : undefined
                            }
                            onClick={() => handleSuggestionAccept(rw.id)}
                          >
                            ✓ Accept
                          </button>
                          <button
                            type="button"
                            className="inline-suggestion-btn reject"
                            onClick={() => handleSuggestionReject(rw.id)}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      )}
                    </>
                  )}
                    </div>
                  );
                })}
            </>
          )}
        </div>
          </div>
          </div>
        </div>
        </div>
        {(!writingPulseExpanded || !orchestratorSectionExpanded || !scrutinyExpanded) && (
          <div className="editor-rail-tabs-dock" aria-label="Collapsed writing tools">
            {!scrutinyExpanded && (
              <button
                type="button"
                className="editor-sidebar-reveal editor-sidebar-reveal--rail-tab"
                onClick={() => setScrutinyExpanded(true)}
                aria-expanded={false}
                aria-label="Expand AI Scrutiny"
                title="Show AI Scrutiny"
                data-onboard="scrutiny-tab"
              >
                <span className="editor-sidebar-reveal-label">Scrutiny</span>
              </button>
            )}
            {!writingPulseExpanded && (
              <button
                type="button"
                className="editor-sidebar-reveal editor-sidebar-reveal--rail-tab"
                onClick={() => setWritingPulseExpanded(true)}
                aria-expanded={false}
                aria-label="Expand Editor"
                title="Show Editor"
                data-onboard="editor-tab"
              >
                <span className="editor-sidebar-reveal-label">Editor</span>
              </button>
            )}
            {!orchestratorSectionExpanded && (
              <button
                type="button"
                className="editor-sidebar-reveal editor-sidebar-reveal--rail-tab"
                onClick={() => setOrchestratorSectionExpanded(true)}
                aria-expanded={false}
                aria-label="Expand Orchestrator"
                title="Show Orchestrator"
                data-onboard="orchestrator-tab"
              >
                <span className="editor-sidebar-reveal-label">Orchestrator</span>
              </button>
            )}
          </div>
        )}
        {showMonkeyTimeline ? (
          <AgentInvocationTimeline
            entries={invocationLog}
            onCollapse={() => setShowMonkeyTimeline(false)}
          />
        ) : (
          <button
            type="button"
            className="editor-sidebar-reveal editor-sidebar-reveal--timeline"
            onClick={() => setShowMonkeyTimeline(true)}
            aria-label="Show Monkey timeline"
            title="Show Monkey timeline"
            data-onboard="timeline"
          >
            <span className="editor-sidebar-reveal-label">Timeline</span>
          </button>
        )}
      <Overlay
        isOpen={isOverlayOpen}
        mode={
          storedSelection?.kind === "doc" && storedSelection.action === "expand"
            ? "expand"
            : "rewrite"
        }
        onClose={handleOverlayClose}
        onSubmit={handleOverlaySubmit}
        prompt={prompt}
        onPromptChange={setPrompt}
        selectedAgentId={selectedAgentId}
        onAgentChange={setSelectedAgentId}
        selectedContextIds={selectedContextIds}
        onContextChange={setSelectedContextIds}
        disableOutsideClose={trialMode && tourStepId === "overlay"}
      />
      <UpgradeModal
        open={upgradeModalOpen}
        reason={upgradeReason}
        onClose={() => setUpgradeModalOpen(false)}
      />
    </>
  );
}

export default Editor;
