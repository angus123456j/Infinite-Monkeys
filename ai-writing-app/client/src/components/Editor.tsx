import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { useRef, useState, useEffect, useCallback, MouseEvent } from "react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import { FontSize } from "../extensions/FontSize";
import Toolbar from "./Toolbar";
import Overlay from "./Overlay";
import type { WritingEffectId } from "./DocMenuBar";
import { joinForward } from "@tiptap/pm/commands";
import { getAgent } from "../lib/agents";
import { extractSentenceContext } from "../lib/extractSentenceContext";

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

/** Synonym specialist agents: seeded "Synonym Sensei Monkey" or common renames like "Synonym Monkey". */
function isSynonymSpecialistAgentName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("synonym sensei") || n.includes("synonym monkey");
}

const SAVE_DEBOUNCE_MS = 1500;
const PERIODIC_SAVE_MS = 30_000;

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

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // Overlay state
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [storedSelection, setStoredSelection] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);

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
          const approxRewriteLen =
            (rw.rewriteText?.length ?? rw.originalText.length ?? 0);

          // If the suggestion overlaps the content that follows it, insert some
          // extra spacer paragraphs after spacerTo so the document below is
          // pushed down instead of being covered by the overlay.
          //
          // We allow multiple small nudges per rewrite so that as the rewritten
          // text grows line‑by‑line, we keep adding just enough space rather
          // than guessing all at once. Cap extra paras so short rewrites don't
          // add too much blank space; long rewrites can use more.
          const currentExtra = spacerAdjustedRef.current[rw.id] ?? 0;
          const isShortRewrite = approxRewriteLen < 120;
          const MAX_EXTRA_PARAS = isShortRewrite ? 3 : 8;

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

            break;
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
          if (currentRef) {
            const contentWidth = 816 - 96 * 2; // page width minus padding
            const avgCharWidth = 7; // approximate for 11pt Arial
            const charsPerLine = Math.floor(contentWidth / avgCharWidth);
            const textLines = Math.ceil(rw.rewriteText.length / charsPerLine);
            // Reserve more room for long rewrites so they don't overlap text
            // below. Short phrases get ~2–3 spacer paragraphs, while long
            // paragraphs can reserve up to ~10 lines of spacers.
            const totalNeeded = Math.min(10, textLines + 2);
            const currentSpacers =
              (currentRef.spacerTo - currentRef.spacerFrom) / 2;
            const extraNeeded = Math.max(0, totalNeeded - currentSpacers);

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

  // Handle Cmd+K to open overlay — does NOT dismiss existing rewrites
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();

        const { from, to } = editor.state.selection;
        if (from === to) return; // Need a selection

        // Highlight the selected text immediately
        editor
          .chain()
          .setTextSelection({ from, to })
          .setHighlight({ color: HIGHLIGHT_COLOR })
          .run();

        setStoredSelection({ from, to });
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

    if (editor && storedSelection) {
      editor
        .chain()
        .setTextSelection({
          from: storedSelection.from,
          to: storedSelection.to,
        })
        .unsetHighlight()
        .focus()
        .run();
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

      const response = await fetch("http://localhost:3001/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "Server not found. Make sure the server is running on http://localhost:3001"
          );
        }
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      const data = await response.json();
      return data.rewrite;
    },
    []
  );

  // Handle overlay submit — close overlay, highlight text, insert spacers, start async API call
  const handleOverlaySubmit = useCallback(async () => {
    if (!editor || !storedSelection) return;
    const doc = editor.state.doc;
    const currentAgentId = selectedAgentId;
    const currentContextIds = selectedContextIds;
    const trimmedPrompt = prompt.trim();
    const currentPrompt =
      trimmedPrompt ||
      (currentAgentId
        ? "Rewrite this selection in the agent's voice, improving clarity, flow, and style."
        : "Rewrite this selection to improve clarity, flow, and style.");
    const sel = { ...storedSelection };

    const selectedText = doc.textBetween(sel.from, sel.to, " ");
    // Before spacer insert (which can shift positions), capture sentence for Synonym Sensei.
    const sentenceForSynonym = extractSentenceContext(doc, sel.from, sel.to);

    // Close overlay immediately
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
      let sentenceContext: string | undefined;
      let promptForApi = currentPrompt;
      if (currentAgentId && sentenceForSynonym) {
        const agent = await getAgent(currentAgentId);
        if (agent && isSynonymSpecialistAgentName(agent.name)) {
          sentenceContext = sentenceForSynonym;
          const synonymCore =
            "The phrase appears inside the sentence above. Pick one substitute that fits that exact meaning and grammar. For ambiguous words (e.g. draft, bank, bark), use only the sense supported by the surrounding words—never a different meaning. Return only the replacement phrase, same part of speech as the original where possible—no titles, glosses, or explanations.";
          promptForApi = trimmedPrompt
            ? `${trimmedPrompt}\n\n${synonymCore}`
            : synonymCore;
        }
      }

      const result = await fetchRewrite(
        selectedText,
        promptForApi,
        currentAgentId,
        currentContextIds,
        sentenceContext
      );
      setPendingRewrites((prev) =>
        prev.map((rw) =>
          rw.id === id
            ? { ...rw, rewriteText: result, isLoading: false, isRevealing: true }
            : rw
        )
      );
      pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
        rw.id === id
          ? { ...rw, rewriteText: result, isLoading: false, isRevealing: true }
          : rw
      );
    } catch (err: any) {
      setPendingRewrites((prev) =>
        prev.map((rw) =>
          rw.id === id
            ? {
                ...rw,
                error: err.message || "Failed to generate rewrite",
                isLoading: false,
              }
            : rw
        )
      );
      pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
        rw.id === id
          ? {
              ...rw,
              error: err.message || "Failed to generate rewrite",
              isLoading: false,
            }
          : rw
      );
    }
  }, [prompt, editor, storedSelection, selectedAgentId, selectedContextIds, fetchRewrite]);

  // Accept a specific inline suggestion — remove spacers, replace highlighted text
  const handleSuggestionAccept = useCallback(
    (rewriteId: number) => {
      // Read from ref to get the latest (possibly user-edited) text
      const current = pendingRewritesRef.current.find(
        (rw) => rw.id === rewriteId
      );
      if (!editor || !current?.rewriteText) return;

      const { from, to, spacerFrom, spacerTo } = current;
      const rewriteText = current.rewriteText;

      // Remove from array BEFORE editor changes
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

  // Dismiss/reject a specific inline suggestion — remove spacers & unhighlight
  const handleSuggestionReject = useCallback(
    (rewriteId: number) => {
      const current = pendingRewritesRef.current.find(
        (rw) => rw.id === rewriteId
      );
      if (!editor || !current) return;

      const { from, to, spacerFrom, spacerTo } = current;

      // Remove from array BEFORE editor changes
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
      <Toolbar editor={editor} />
      <div className="editor-page-area">
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

          {/* Inline suggestions — one per pending rewrite */}
          {pendingRewrites.map((rw) => {
            const pos = suggestionPositions[rw.id];
            if (!pos) return null;

            return (
              <div
                key={rw.id}
                ref={(el) => {
                  suggestionElRefs.current[rw.id] = el;
                }}
                className={`inline-suggestion${rw.rewriteText && rw.rewriteText.length <= 60 ? " inline-suggestion-compact" : ""}`}
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
                      <em
                        className="inline-suggestion-content"
                        contentEditable={!rw.isRevealing}
                        suppressContentEditableWarning
                        spellCheck={false}
                        ref={(el) => {
                          revealContentRefs.current[rw.id] = el;
                          if (
                            el &&
                            !rw.isRevealing &&
                            el.dataset.initialized !== "true"
                          ) {
                            el.innerText = rw.rewriteText!;
                            el.dataset.initialized = "true";
                          }
                        }}
                        onInput={(e) => {
                          if (rw.isRevealing) return;
                          const newText = (e.target as HTMLElement).innerText;
                          const idx = pendingRewritesRef.current.findIndex(
                            (r) => r.id === rw.id
                          );
                          if (idx !== -1) {
                            const existing = pendingRewritesRef.current[idx];
                            if (existing) {
                              pendingRewritesRef.current[idx] = {
                                ...existing,
                                rewriteText: newText,
                              };
                            }
                          }
                        }}
                      />
                    </div>
                    {!rw.isRevealing && (
                      <div className="inline-suggestion-actions">
                        <button
                          className="inline-suggestion-btn accept"
                          onClick={() => handleSuggestionAccept(rw.id)}
                        >
                          ✓ Accept
                        </button>
                        <button
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
