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
/** Padding top + bottom on .editor-page */
const PAGE_PADDING = 144;
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

  // Keep ref in sync with state
  useEffect(() => {
    pendingRewritesRef.current = pendingRewrites;
  }, [pendingRewrites]);

  /** Handle clicks on empty page area to jump cursor there */
  const handlePageClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!editor || !pageRef.current || !contentRef.current) return;

      // Don't intercept clicks on the inline suggestion
      const target = e.target as HTMLElement;
      if (target.closest(".inline-suggestion")) return;

      if (target.closest(".tiptap")) {
        const tiptapEl = contentRef.current.querySelector(".tiptap");
        if (!tiptapEl) return;

        const children = tiptapEl.children;
        if (children.length === 0) return;

        const lastChild = children[children.length - 1];
        const lastChildRect = lastChild.getBoundingClientRect();
        const clickY = e.clientY;

        if (clickY <= lastChildRect.bottom + 5) return;

        const distanceBelowContent = clickY - lastChildRect.bottom;
        const linesToAdd = Math.max(
          1,
          Math.ceil(distanceBelowContent / LINE_HEIGHT)
        );

        editor
          .chain()
          .focus("end")
          .command(({ tr, state }) => {
            for (let i = 0; i < linesToAdd; i++) {
              const paragraph = state.schema.nodes.paragraph.create();
              tr.insert(tr.doc.content.size, paragraph);
            }
            return true;
          })
          .focus("end")
          .run();

        return;
      }

      const tiptapEl = contentRef.current.querySelector(".tiptap");
      if (!tiptapEl) return;

      const children = tiptapEl.children;
      const lastChild =
        children.length > 0 ? children[children.length - 1] : null;
      const contentBottom = lastChild
        ? lastChild.getBoundingClientRect().bottom
        : tiptapEl.getBoundingClientRect().top;

      const clickY = e.clientY;
      const distanceBelowContent = clickY - contentBottom;
      const linesToAdd = Math.max(
        1,
        Math.ceil(distanceBelowContent / LINE_HEIGHT)
      );

      editor
        .chain()
        .focus("end")
        .command(({ tr, state }) => {
          for (let i = 0; i < linesToAdd; i++) {
            const paragraph = state.schema.nodes.paragraph.create();
            tr.insert(tr.doc.content.size, paragraph);
          }
          return true;
        })
        .focus("end")
        .run();
    },
    [editor]
  );

  const updatePageCount = useCallback(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const tiptapEl = contentEl.querySelector(".tiptap");
    if (!tiptapEl) return;

    const contentHeight = tiptapEl.scrollHeight + PAGE_PADDING;
    const contentPages = Math.ceil(contentHeight / PAGE_HEIGHT);
    const newPageCount = Math.max(1, contentPages + 1);
    setPageCount(newPageCount);
  }, []);

  // Watch for content changes via ResizeObserver
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const observer = new ResizeObserver(updatePageCount);
    observer.observe(contentEl);

    return () => observer.disconnect();
  }, [updatePageCount]);

  // Also update on editor transactions
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      requestAnimationFrame(updatePageCount);
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
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
          const coords = editor.view.coordsAtPos(safeEnd, -1);
          positions[rw.id] = { top: coords.bottom - pageRect.top + 4 };
        } catch {
          // skip if position is invalid
        }
      }

      setSuggestionPositions(positions);
    });
  }, [editor, pendingRewrites]);

  // Adjust spacer count when any rewrite text arrives
  useEffect(() => {
    if (!editor || pendingRewrites.length === 0) return;

    for (const rw of pendingRewrites) {
      if (rw.isLoading || !rw.rewriteText) continue;

      // Estimate how many spacer lines the suggestion needs
      const charsPerLine = 75;
      const textLines = Math.ceil(rw.rewriteText.length / charsPerLine);
      const neededLines = textLines + 7;
      const currentSpacerSize = rw.spacerTo - rw.spacerFrom;
      const currentLines = currentSpacerSize / 2;

      if (neededLines > currentLines) {
        const extraNeeded = neededLines - currentLines;
        const currentRef = pendingRewritesRef.current.find(
          (r) => r.id === rw.id
        );
        if (!currentRef) continue;

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
        // The transaction handler will update spacerTo via mapping
        break; // Only adjust one at a time; next render will handle others
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pendingRewrites]);

  // Handle Cmd+K to open overlay — does NOT dismiss existing rewrites
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();

        const { from, to } = editor.state.selection;
        if (from === to) return; // Need a selection

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

  // Handle overlay close (cancel)
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
      // Update just this rewrite in the array
      setPendingRewrites((prev) =>
        prev.map((rw) =>
          rw.id === id ? { ...rw, rewriteText: result, isLoading: false } : rw
        )
      );
      pendingRewritesRef.current = pendingRewritesRef.current.map((rw) =>
        rw.id === id ? { ...rw, rewriteText: result, isLoading: false } : rw
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
          className="editor-page"
          style={{ minHeight: pageCount * PAGE_HEIGHT }}
          onClick={handlePageClick}
        >
          <div ref={contentRef} className="editor-content">
            <EditorContent editor={editor} />
          </div>
          {Array.from({ length: pageCount - 1 }, (_, i) => (
            <div
              key={i}
              className="page-break"
              style={{ top: (i + 1) * PAGE_HEIGHT }}
            />
          ))}

          {/* Inline suggestions — one per pending rewrite */}
          {pendingRewrites.map((rw) => {
            const pos = suggestionPositions[rw.id];
            if (!pos) return null;

            return (
              <div
                key={rw.id}
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
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        ref={(el) => {
                          // Only set initial text content once; after that the user controls it
                          if (el && el.dataset.initialized !== "true") {
                            el.innerText = rw.rewriteText!;
                            el.dataset.initialized = "true";
                          }
                        }}
                        onInput={(e) => {
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
