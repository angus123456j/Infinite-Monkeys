import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  MouseEvent,
} from "react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import { FontSize } from "../extensions/FontSize";
import Toolbar from "./Toolbar";
import Overlay from "./Overlay";
import AgentInvocationTimeline, {
  type AgentInvocationLogEntry,
} from "./AgentInvocationTimeline";
import type { WritingEffectId } from "./DocMenuBar";
import { joinForward } from "@tiptap/pm/commands";
import { getAgent, listAgents, type AgentMeta } from "../lib/agents";
import { listContexts } from "../lib/contexts";
import { extractSentenceContext } from "../lib/extractSentenceContext";
import { apiFetch } from "../lib/api";
import {
  extraSpacerParagraphsNeeded,
  maxOverlapRepairExtraParas,
} from "../lib/pretextRewriteLayout";

/** Fixed 50 lines per page. Line height in px (11pt × 1.15 ≈ 17). */
const LINES_PER_PAGE = 50;
const LINE_HEIGHT_PX = 17;
/** Top/bottom margin per page in px (matches .tiptap padding). */
const PAGE_MARGIN_PX = 72;
/** Height of one page card: margin + 50 lines + margin */
const PAGE_HEIGHT =
  PAGE_MARGIN_PX + LINES_PER_PAGE * LINE_HEIGHT_PX + PAGE_MARGIN_PX;
/** Gap between stacked page cards in px */
const GAP_HEIGHT = 25;
/** Highlight color used for pending rewrites */
const HIGHLIGHT_COLOR = "#ffcdd2";
/** Initial number of spacer paragraphs for loading state (kept small so short rewrites don't add big gaps) */
const INITIAL_SPACER_COUNT = 1;

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

type OverlayDocSelection = { kind: "doc"; from: number; to: number };
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

interface EditorProps {
  docId?: string;
  initialContent?: string;
  onSaveContent?: (content: string) => void;
  onEditorReady?: (editor: TiptapEditor) => void;
  writingEffect?: WritingEffectId | null;
}

function Editor({ docId, initialContent = "<p></p>", onSaveContent, onEditorReady, writingEffect = "none" }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
    ],
    content: initialContent,
    autofocus: true,
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [containerMinHeight, setContainerMinHeight] = useState(PAGE_HEIGHT);
  const [contentVersion, setContentVersion] = useState(0);
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

  useEffect(() => {
    try {
      localStorage.setItem(LLM_PROVIDER_STORAGE_KEY, llmProvider);
    } catch {
      /* ignore */
    }
  }, [llmProvider]);

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
    []
  );

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

  // Keep ref in sync with state
  useEffect(() => {
    pendingRewritesRef.current = pendingRewrites;
  }, [pendingRewrites]);

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
        const gapTop = i * (PAGE_HEIGHT + GAP_HEIGHT) - GAP_HEIGHT;
        const gapBottom = i * (PAGE_HEIGHT + GAP_HEIGHT);
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
    [editor, pageCount]
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
      (contentHeight + GAP_HEIGHT) / (PAGE_HEIGHT + GAP_HEIGHT)
    );
    const newPageCount = Math.max(1, contentPages);
    setPageCount(newPageCount);
  }, [editor]);

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
    if (!editor || pendingRewrites.length === 0) return;

    let frameId: number | null = null;
    let adjusting = false;

    const adjustSpacers = () => {
      if (adjusting) return;
      adjusting = true;

      for (const rw of pendingRewritesRef.current) {
        if (rw.parentId != null) continue;
        const el = suggestionElRefs.current[rw.id];
        if (!el) continue;

        const suggestionRect = el.getBoundingClientRect();
        if (suggestionRect.height <= 0) continue;

        try {
          const docSize = editor.state.doc.content.size;
          const safePos = Math.min(rw.spacerTo, docSize);
          if (safePos >= docSize) continue;

          const contentAfter = editor.view.coordsAtPos(safePos, 1);
          const overlap = suggestionRect.bottom - contentAfter.top;
          // If the suggestion overlaps the content that follows it, insert some
          // extra spacer paragraphs after spacerTo so the document below is
          // pushed down instead of being covered by the overlay.
          //
          // We allow multiple small nudges per rewrite so that as the rewritten
          // text grows line‑by‑line, we keep adding just enough space rather
          // than guessing all at once. The cap scales with Pretext-predicted
          // card height so long multi-line rewrites are not stuck after a few px.
          const currentExtra = spacerAdjustedRef.current[rw.id] ?? 0;
          const rewriteForMeasure = rw.rewriteText ?? rw.originalText ?? "";
          const MAX_EXTRA_PARAS = maxOverlapRepairExtraParas(rewriteForMeasure);

          if (overlap > 0 && currentExtra < MAX_EXTRA_PARAS) {
            const pixelsPerPara = LINE_HEIGHT_PX + 4;
            const remaining = MAX_EXTRA_PARAS - currentExtra;
            const extraParas = Math.max(
              1,
              Math.min(remaining, Math.ceil(overlap / pixelsPerPara))
            );

            editor
              .chain()
              .command(({ tr, state }) => {
                let pos = rw.spacerTo;
                const paragraphType = state.schema.nodes["paragraph"];
                if (!paragraphType) return false;
                for (let i = 0; i < extraParas; i++) {
                  const para = paragraphType.create();
                  tr.insert(pos, para);
                  pos += 2;
                }
                return true;
              })
              .run();

            spacerAdjustedRef.current[rw.id] = currentExtra + extraParas;

            const newSpacerTo = rw.spacerTo + extraParas * 2;
            const updated = pendingRewritesRef.current.map((r) =>
              r.id === rw.id ? { ...r, spacerTo: newSpacerTo } : r
            );
            pendingRewritesRef.current = updated;
            setPendingRewrites(updated);
          }
        } catch {
          // position may be invalid during transitions
        }
      }

      adjusting = false;
    };

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
      if (frameId !== null) cancelAnimationFrame(frameId);
      observers.forEach((obs) => obs.disconnect());
    };
  }, [editor, pendingRewrites, suggestionPositions]);

  // Word-by-word reveal animation — pre-allocates spacers for full text first
  useEffect(() => {
    for (const rw of pendingRewrites) {
      if (
        rw.rewriteText &&
        rw.isRevealing &&
        !(rw.id in revealTimersRef.current)
      ) {
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
              currentSpacers
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

        const words = rw.rewriteText.split(" ");
        let wordIndex = 0;

        const timer = window.setInterval(() => {
          wordIndex++;
          const contentEl = revealContentRefs.current[rw.id];
          if (contentEl) {
            contentEl.innerText = words.slice(0, wordIndex).join(" ");
          }

          if (wordIndex >= words.length) {
            clearInterval(timer);
            delete revealTimersRef.current[rw.id];
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
  }, [pendingRewrites, editor]);

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
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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

        setStoredSelection({ kind: "doc", from, to });
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
      const payload: Record<string, unknown> = { text, prompt: userPrompt };
      if (agentId) payload.agentId = agentId;
      if (contextIds && contextIds.length) {
        payload.contextIds = contextIds.slice(0, 5);
      }
      const trimmedCtx = sentenceContext?.trim();
      if (trimmedCtx) payload.sentenceContext = trimmedCtx;
      payload.llmProvider = llmProvider;

      const data = await apiFetch<{ rewrite: string }>("/api/rewrite", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return data.rewrite;
    },
    [llmProvider]
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
      const extra = extraSpacerParagraphsNeeded(rewriteText, currentCount);
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
    [editor]
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
      const instruction = (orchestratorInstruction.trim() || prompt.trim()).trim();
      const resp = await apiFetch<{ sequence: string[] }>("/api/orchestrator/plan", {
        method: "POST",
        body: JSON.stringify({
          text: sel.text,
          prompt: instruction,
          llmProvider,
        }),
      });

      const seq = (resp.sequence ?? []).filter((id) =>
        orchestratorSpecialists.some((a) => a.id === id)
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

      setOrchestratorIsExecuting(true);
      setOrchestratorError(null);

      const sentenceForSynonym = extractSentenceContext(doc, sel.from, sel.to) ?? "";
      const spacerInsertPos = computeSpacerInsertPos(doc, sel.to);

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
        .setTextSelection(sel.to)
        .run();

      const id = nextRewriteId++;
      const monkeyId = randomMonkeyId();
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
        spacerTo: spacerInsertPos + INITIAL_SPACER_COUNT * 2,
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

        insertPretextRevealSpacers(id, finalText);
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
        const msg = err?.message ?? "Failed to execute orchestrator chain";
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
    const currentAgentId = selectedAgentId;
    const currentContextIds = selectedContextIds;
    const trimmedPrompt = prompt.trim();
    const currentPrompt =
      trimmedPrompt ||
      (currentAgentId
        ? "Rewrite this selection in the agent's voice, improving clarity, flow, and style."
        : "Rewrite this selection to improve clarity, flow, and style.");

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
          agentMeta?.name ?? (currentAgentId ? "Unknown agent" : "No agent");

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
            id,
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
            entry.id === id
              ? { ...entry, status: "done" as const, response: result }
              : entry
          )
        );
      } catch (err: any) {
        const msg = err.message || "Failed to generate rewrite";
        setPendingRewrites((prev) =>
          prev.map((rw) =>
            rw.id === id ? { ...rw, error: msg, isLoading: false } : rw
          )
        );
        pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
          rw.id === id ? { ...rw, error: msg, isLoading: false } : rw
        );
        setInvocationLog((prev) => {
          if (!prev.some((e) => e.id === id)) return prev;
          return prev.map((entry) =>
            entry.id === id
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
      .setTextSelection(sel.to)
      .run();

    // Create the pending rewrite entry
    const id = nextRewriteId++;
    const monkeyId = randomMonkeyId();

    const pending: PendingRewrite = {
      id,
      monkeyId,
      from: sel.from,
      to: sel.to,
      originalText: selectedText,
      prompt: currentPrompt,
      rewriteText: null,
      isLoading: true,
      isRevealing: false,
      error: null,
      spacerFrom: spacerInsertPos,
      spacerTo: spacerInsertPos + INITIAL_SPACER_COUNT * 2,
    };

    // Add to array
    pendingRewritesRef.current = [...pendingRewritesRef.current, pending];
    setPendingRewrites((prev) => [...prev, pending]);

    // Call API in background
    try {
      const agentMeta = currentAgentId ? await getAgent(currentAgentId) : null;
      const agentName =
        agentMeta?.name ?? (currentAgentId ? "Unknown agent" : "No agent");

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

      setInvocationLog((prev) => [
        ...prev,
        {
          id,
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
      insertPretextRevealSpacers(id, result);
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
          entry.id === id
            ? { ...entry, status: "done" as const, response: result }
            : entry
        )
      );
    } catch (err: any) {
      const msg = err.message || "Failed to generate rewrite";
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
        if (!prev.some((e) => e.id === id)) return prev;
        return prev.map((entry) =>
          entry.id === id
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
    fetchRewrite,
    llmProvider,
    insertPretextRevealSpacers,
  ]);

  // Accept a specific inline suggestion — merge nested into parent, or apply root to document
  const handleSuggestionAccept = useCallback(
    (rewriteId: number) => {
      const current = pendingRewritesRef.current.find(
        (rw) => rw.id === rewriteId
      );
      if (!current?.rewriteText) return;

      if (current.parentId != null) {
        const pid = current.parentId;
        const start = current.parentReplaceStart!;
        const end = current.parentReplaceEnd!;
        const parent = pendingRewritesRef.current.find((r) => r.id === pid);
        if (!parent?.rewriteText) return;

        const merged =
          parent.rewriteText.slice(0, start) +
          current.rewriteText +
          parent.rewriteText.slice(end);

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
      const rewriteText = current.rewriteText;

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
        // Delete spacers first (after highlighted text, so from/to stay valid)
        .command(({ tr }) => {
          tr.delete(spacerFrom, spacerTo);
          return true;
        })
        // Now replace highlighted text — unset highlight first so new text is clean
        .setTextSelection({ from, to })
        .unsetHighlight()
        .deleteSelection()
        .insertContent(rewriteText)
        .run();

      joinSplitParagraphsAfterSpacerRemoval(editor);
    },
    [editor]
  );

  // Dismiss/reject — nested drops only the child; root also removes nested children and document highlight
  const handleSuggestionReject = useCallback(
    (rewriteId: number) => {
      const current = pendingRewritesRef.current.find(
        (rw) => rw.id === rewriteId
      );
      if (!current) return;

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
        // Delete spacers first
        .command(({ tr }) => {
          tr.delete(spacerFrom, spacerTo);
          return true;
        })
        // Remove highlight
        .setTextSelection({ from, to })
        .unsetHighlight()
        .setTextSelection(to)
        .run();

      joinSplitParagraphsAfterSpacerRemoval(editor);
    },
    [editor]
  );

  return (
    <>
      <Toolbar
        editor={editor}
        llmProvider={llmProvider}
        onLlmProviderChange={setLlmProvider}
      />
      <div className="editor-page-area">
        <aside
          className="editor-orchestrator-rail"
          aria-label="Orchestrator"
        >
          <div className="editor-orchestrator-title">Orchestrator</div>

          <div className="editor-orchestrator-block">
            <div className="editor-orchestrator-subtitle">
              Build a sequential specialist chain. Requires a non-empty selection.
            </div>

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
                disabled={orchestratorIsExecuting || orchestratorIsProposing}
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
                disabled={orchestratorIsExecuting || orchestratorIsProposing || orchestratorSpecialists.length === 0}
              >
                Add monkey
              </button>
              <button
                type="button"
                className="editor-orchestrator-btn"
                onClick={handleOrchestratorSequential}
                disabled={
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
          </div>
        </aside>

        <div className="editor-main-column">
          <div className="editor-document-center">
          <div
            className="writing-effect-wrapper"
            data-writing-effect={writingEffect ?? "none"}
          >
          <div
            ref={pageRef}
            className="pages-container"
            style={{ minHeight: containerMinHeight }}
            onClick={handlePageClick}
          >
            <div className="page-card" />
            <div ref={contentRef} className="editor-content">
              <EditorContent editor={editor} />
            </div>

          {/* Inline suggestions — root rewrites only; nested refinements render inside the parent card */}
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
                          Rewritten:
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
        </div>
          </div>
          </div>
        </div>
        </div>
        <AgentInvocationTimeline entries={invocationLog} />
      <Overlay
        isOpen={isOverlayOpen}
        onClose={handleOverlayClose}
        onSubmit={handleOverlaySubmit}
        prompt={prompt}
        onPromptChange={setPrompt}
        selectedAgentId={selectedAgentId}
        onAgentChange={setSelectedAgentId}
        selectedContextIds={selectedContextIds}
        onContextChange={setSelectedContextIds}
      />
    </>
  );
}

export default Editor;
