import { useEditor, EditorContent } from "@tiptap/react";
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

/** Page dimensions at 96 DPI (US Letter) */
const PAGE_HEIGHT = 1056;
/** Gap between stacked page cards in px */
const GAP_HEIGHT = 16;
/** Top/bottom margin per page in px (1 inch at 96 DPI) */
const PAGE_MARGIN = 72;
/** Approximate line height in pixels (11pt font with 1.15 line-height) */
const LINE_HEIGHT = 17;
/** Highlight color used for pending rewrites */
const HIGHLIGHT_COLOR = "#ffcdd2";
/** Initial number of spacer paragraphs for loading state */
const INITIAL_SPACER_COUNT = 5;

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
  return styles[Math.floor(Math.random() * styles.length)]();
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

function Editor() {
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
    content: "<p></p>",
    autofocus: true,
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);

  // Overlay state
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [storedSelection, setStoredSelection] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [prompt, setPrompt] = useState("");

  // Multiple inline suggestions state
  const [pendingRewrites, setPendingRewrites] = useState<PendingRewrite[]>([]);
  const pendingRewritesRef = useRef<PendingRewrite[]>([]);
  const [suggestionPositions, setSuggestionPositions] = useState<
    Record<number, { top: number }>
  >({});
  const suggestionElRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const revealTimersRef = useRef<Record<number, number>>({});
  const revealContentRefs = useRef<Record<number, HTMLElement | null>>({});

  // Keep ref in sync with state
  useEffect(() => {
    pendingRewritesRef.current = pendingRewrites;
  }, [pendingRewrites]);

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

      // If the click is at or above the last content line, let TipTap handle it
      if (e.clientY <= lastChildRect.bottom + 5) return;

      // Click is below all content — add enough paragraphs to reach it
      const distanceBelowContent = e.clientY - lastChildRect.bottom;
      const linesToAdd = Math.max(
        1,
        Math.ceil(distanceBelowContent / LINE_HEIGHT)
      );

      editor
        .chain()
        .focus("end")
        .command(({ tr, state }) => {
          const paragraphType = state.schema.nodes["paragraph"];
          if (!paragraphType) return false;
          for (let i = 0; i < linesToAdd; i++) {
            tr.insert(tr.doc.content.size, paragraphType.create());
          }
          return true;
        })
        .focus("end")
        .run();
    },
    [editor, pageCount]
  );

  const updatePageCount = useCallback(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const tiptapEl = contentEl.querySelector(".tiptap");
    if (!tiptapEl) return;

    // scrollHeight includes padding + any pagination margins paginateContent injected.
    // Each page slot in the container is PAGE_HEIGHT + GAP_HEIGHT wide except the last,
    // so the correct formula is ceil((h + GAP) / (PAGE_HEIGHT + GAP_HEIGHT)).
    const contentHeight = tiptapEl.scrollHeight;
    const contentPages = Math.ceil(
      (contentHeight + GAP_HEIGHT) / (PAGE_HEIGHT + GAP_HEIGHT)
    );
    const newPageCount = Math.max(1, contentPages);
    setPageCount(newPageCount);
  }, []);

  /**
   * Pushes block-level elements past page boundary "forbidden zones".
   *
   * Each zone spans: (bottom margin of page N) → (top margin of page N+1)
   *   = PAGE_HEIGHT - PAGE_MARGIN  →  N*(PAGE_HEIGHT+GAP_HEIGHT) + PAGE_MARGIN
   *
   * We walk blocks in document order, accumulating any extra offset we've
   * injected, so every block's effective position is always up to date.
   */
  const paginateContent = useCallback(() => {
    const tiptapEl = contentRef.current?.querySelector(
      ".tiptap"
    ) as HTMLElement | null;
    if (!tiptapEl) return;

    const blocks = Array.from(tiptapEl.children) as HTMLElement[];
    if (blocks.length === 0) return;

    // 1. Clear all pagination margins we previously injected
    blocks.forEach((el) => {
      el.style.marginTop = "";
    });

    // 2. One forced reflow so offsetTop values reflect cleared state
    void tiptapEl.offsetHeight;

    // 3. Snapshot all positions (no custom margins in play)
    const positions = blocks.map((el) => ({
      top: el.offsetTop,
      height: el.offsetHeight,
    }));

    const maxGaps = Math.ceil(tiptapEl.scrollHeight / PAGE_HEIGHT) + 2;
    let extraOffset = 0;

    for (let idx = 0; idx < blocks.length; idx++) {
      const pos = positions[idx];
      if (!pos) continue;
      let top = pos.top + extraOffset;
      const bottom = top + pos.height;

      for (let g = 1; g <= maxGaps; g++) {
        // Forbidden zone g:
        //   fStart = where the bottom margin of page g begins
        //   fEnd   = where the top margin of page g+1 ends
        const fStart =
          g * PAGE_HEIGHT + (g - 1) * GAP_HEIGHT - PAGE_MARGIN;
        const fEnd = g * (PAGE_HEIGHT + GAP_HEIGHT) + PAGE_MARGIN;

        if (fStart > bottom) break; // gap is entirely below this block

        if (top < fEnd && bottom > fStart) {
          const push = fEnd - top;
          if (push > 0) {
            blocks[idx].style.marginTop = `${push}px`;
            extraOffset += push;
            top = fEnd; // update local top for subsequent gap checks
          }
          // keep looping — a very tall block might cross the next gap too
        }
      }
    }
  }, []);

  // Watch for content changes via ResizeObserver
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const observer = new ResizeObserver(() => {
      paginateContent();
      updatePageCount();
    });
    observer.observe(contentEl);

    return () => observer.disconnect();
  }, [updatePageCount, paginateContent]);

  // Also update on editor transactions
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      requestAnimationFrame(() => {
        paginateContent();
        updatePageCount();
      });
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, updatePageCount, paginateContent]);

  // Run pagination once after the editor first mounts
  useEffect(() => {
    if (!editor) return;
    requestAnimationFrame(() => {
      paginateContent();
      updatePageCount();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Track ALL pending rewrite positions through editor transactions
  useEffect(() => {
    if (!editor || pendingRewrites.length === 0) return;

    const handleTransaction = ({ transaction }: any) => {
      if (!transaction.docChanged) return;
      const prev = pendingRewritesRef.current;
      if (prev.length === 0) return;

      const sel = transaction.selection as { from?: number };
      const cursorPos = sel?.from ?? 0;
      const anyAfterSpacer = prev.some((rw) => cursorPos >= rw.spacerTo);
      if (anyAfterSpacer) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/12f206ba-113d-4c02-ba79-bc5d13cdf020',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'848b57'},body:JSON.stringify({sessionId:'848b57',hypothesisId:'C',location:'Editor.tsx:transaction',message:'Typing below rewrite',data:{cursorPos,rewrites:prev.map(r=>({id:r.id,spacerTo:r.spacerTo}))},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }

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
          // Position at end of paragraph, not end of selection,
          // so the suggestion doesn't cover trailing text in the same paragraph
          const $to = editor.state.doc.resolve(safeEnd);
          const endOfBlock = Math.min($to.end($to.depth), docSize);
          const coords = editor.view.coordsAtPos(endOfBlock, -1);
          positions[rw.id] = { top: coords.bottom - pageRect.top + 4 };
        } catch {
          // skip if position is invalid
        }
      }

      setSuggestionPositions(positions);
    });
  }, [editor, pendingRewrites]);

  // Measure actual suggestion element height and adjust spacers to prevent overlap
  useEffect(() => {
    if (!editor || pendingRewrites.length === 0) return;

    let frameId: number | null = null;
    let adjusting = false;

    const adjustSpacers = () => {
      if (adjusting) return;
      adjusting = true;

      let overlapCount = 0;
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

          if (overlap > 4) {
            overlapCount++;
            const currentRef = pendingRewritesRef.current.find(
              (r) => r.id === rw.id
            );
            if (!currentRef) continue;

            const extraNeeded = Math.ceil(overlap / LINE_HEIGHT) + 1;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/12f206ba-113d-4c02-ba79-bc5d13cdf020',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'848b57'},body:JSON.stringify({sessionId:'848b57',hypothesisId:'B',location:'Editor.tsx:adjustSpacers',message:'Adjust spacers overlap',data:{rwId:rw.id,overlap,suggestionHeight:suggestionRect.height,contentAfterTop:contentAfter.top,extraNeeded},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            editor
              .chain()
              .command(({ tr, state }) => {
                let pos = currentRef.spacerTo;
                for (let i = 0; i < extraNeeded; i++) {
                  const para = state.schema.nodes.paragraph.create();
                  tr.insert(pos, para);
                  pos += 2;
                }
                return true;
              })
              .run();
            if (overlapCount > 1) {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/12f206ba-113d-4c02-ba79-bc5d13cdf020',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'848b57'},body:JSON.stringify({sessionId:'848b57',hypothesisId:'D',location:'Editor.tsx:adjustBreak',message:'Breaking after first fix',data:{overlapCount,rwId:rw.id},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
            }
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
        // Pre-allocate spacers for the FULL text before starting reveal
        // so content below is pushed down before words start appearing
        if (editor) {
          const currentRef = pendingRewritesRef.current.find(
            (r) => r.id === rw.id
          );
          if (currentRef) {
            const contentWidth = 816 - 96 * 2; // page width minus padding
            const avgCharWidth = 7; // approximate for 11pt Arial
            const charsPerLine = Math.floor(contentWidth / avgCharWidth);
            const textLines = Math.ceil(rw.rewriteText.length / charsPerLine);
            const totalNeeded = textLines + 5; // text + buttons + padding
            const currentSpacers =
              (currentRef.spacerTo - currentRef.spacerFrom) / 2;
            const extraNeeded = Math.max(0, totalNeeded - currentSpacers);

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/12f206ba-113d-4c02-ba79-bc5d13cdf020',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'848b57'},body:JSON.stringify({sessionId:'848b57',hypothesisId:'A',location:'Editor.tsx:prealloc',message:'Pre-allocation',data:{rwId:rw.id,rewriteLen:rw.rewriteText.length,charsPerLine,textLines,totalNeeded,currentSpacers,extraNeeded},timestamp:Date.now()})}).catch(()=>{});
            // #endregion

            if (extraNeeded > 0) {
              editor
                .chain()
                .command(({ tr, state }) => {
                  let pos = currentRef.spacerTo;
                  for (let i = 0; i < extraNeeded; i++) {
                    const para = state.schema.nodes.paragraph.create();
                    tr.insert(pos, para);
                    pos += 2;
                  }
                  return true;
                })
                .run();
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
    async (text: string, userPrompt: string): Promise<string> => {
      const response = await fetch("http://localhost:3001/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, prompt: userPrompt }),
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
    if (!prompt.trim() || !editor || !storedSelection) return;

    const selectedText = editor.state.doc.textBetween(
      storedSelection.from,
      storedSelection.to,
      " "
    );

    const currentPrompt = prompt;
    const sel = { ...storedSelection };

    // Close overlay immediately
    setIsOverlayOpen(false);
    setPrompt("");
    setStoredSelection(null);

    // Find end of the paragraph containing the selection
    const $to = editor.state.doc.resolve(sel.to);
    const endOfBlock = $to.end($to.depth);
    const spacerInsertPos = endOfBlock + 1;

    // Highlight text + insert spacer paragraphs in one transaction
    editor
      .chain()
      .focus()
      .setTextSelection({ from: sel.from, to: sel.to })
      .setHighlight({ color: HIGHLIGHT_COLOR })
      .command(({ tr, state }) => {
        let pos = spacerInsertPos;
        for (let i = 0; i < INITIAL_SPACER_COUNT; i++) {
          const para = state.schema.nodes.paragraph.create();
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
      const result = await fetchRewrite(selectedText, currentPrompt);
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
  }, [prompt, editor, storedSelection, fetchRewrite]);

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
    },
    [editor]
  );

  return (
    <>
      <Toolbar editor={editor} />
      <div className="editor-page-area">
        <div
          ref={pageRef}
          className="pages-container"
          style={{ height: pageCount * PAGE_HEIGHT + (pageCount - 1) * GAP_HEIGHT }}
          onClick={handlePageClick}
        >
          {Array.from({ length: pageCount }, (_, i) => (
            <div
              key={i}
              className="page-card"
              style={{ top: i * (PAGE_HEIGHT + GAP_HEIGHT) }}
            />
          ))}

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
                className="inline-suggestion"
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
                            pendingRewritesRef.current[idx] = {
                              ...pendingRewritesRef.current[idx],
                              rewriteText: newText,
                            };
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
      <Overlay
        isOpen={isOverlayOpen}
        onClose={handleOverlayClose}
        onSubmit={handleOverlaySubmit}
        prompt={prompt}
        onPromptChange={setPrompt}
      />
    </>
  );
}

export default Editor;
