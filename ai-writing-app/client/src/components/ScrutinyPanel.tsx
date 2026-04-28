import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { Decoration, type EditorView } from "@tiptap/pm/view";
import { apiFetch } from "../lib/api";
import { setScrutinyDecorations } from "../extensions/ScrutinyHighlight";

type ScrutinySentence = {
  text: string;
  start: number;
  end: number;
  aiProbability: number;
};

type ScrutinyResponse = {
  mode: "selection" | "document";
  model: { modelId: string };
  threshold: number;
  truncated: boolean;
  overallProbability: number;
  sentences: ScrutinySentence[];
};

interface ScrutinyPanelProps {
  editor: TiptapEditor | null;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  trialMode?: boolean;
  onTrialConsume?: (action: "scrutiny-selection" | "scrutiny-document") => boolean;
  onTrialGated?: (action: "scrutiny-selection" | "scrutiny-document") => void;
}

function safeGetEditorViewDom(editor: TiptapEditor): HTMLElement | null {
  try {
    // Tiptap can throw if view isn't mounted yet.
    const view = (editor as unknown as { view?: { dom?: unknown } }).view;
    const dom = view?.dom;
    return dom instanceof HTMLElement ? dom : null;
  } catch {
    return null;
  }
}

function safeGetEditorView(editor: TiptapEditor): EditorView | null {
  try {
    return (editor as unknown as { view?: EditorView }).view ?? null;
  } catch {
    return null;
  }
}

/**
 * Flatten doc text between [from, to) for the API and map each character index to a ProseMirror
 * position (the position *at* that character). For a text node starting at `pos`, char i is at `pos + i`.
 */
function extractPlainTextAndMap(editor: TiptapEditor, from: number, to: number): { text: string; posByIndex: number[] } {
  const doc = editor.state.doc;
  let out = "";
  const map: number[] = [];
  let lastWasSpace = true;

  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const t = node.text ?? "";
    if (!t) return;

    const firstIsSpace = /^\s/.test(t);
    if (out.length > 0 && !lastWasSpace && !firstIsSpace) {
      out += " ";
      // Synthetic space between adjacent non-space runs; align to boundary before this run.
      map.push(pos);
      lastWasSpace = true;
    }

    for (let i = 0; i < t.length; i++) {
      const ch = t[i]!;
      out += ch;
      map.push(pos + i);
      lastWasSpace = /\s/.test(ch);
    }
  });

  return { text: out, posByIndex: map };
}

function plainRangeToDocHighlight(
  posByIndex: number[],
  plainStart: number,
  plainEndExclusive: number,
  fallbackFrom: number
): { startPos: number; endPos: number } | null {
  if (!posByIndex.length || plainStart >= plainEndExclusive) return null;
  const last = posByIndex.length - 1;
  const i0 = Math.min(Math.max(0, plainStart), last);
  const i1 = Math.min(Math.max(plainStart, plainEndExclusive - 1), last);
  const startPos = posByIndex[i0] ?? fallbackFrom;
  const endPos = (posByIndex[i1] ?? startPos) + 1;
  if (endPos <= startPos) return null;
  return { startPos, endPos };
}

/** Map browser selection inside the editor DOM to doc positions (works when PM state lags or blurs). */
function domSelectionToDocRange(view: EditorView, root: HTMLElement): { from: number; to: number } | null {
  if (typeof document === "undefined") return null;
  const domSel = document.getSelection();
  if (!domSel || domSel.rangeCount === 0 || domSel.isCollapsed) return null;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = domSel;
  if (!anchorNode || !focusNode || !root.contains(anchorNode) || !root.contains(focusNode)) {
    return null;
  }
  try {
    const a = view.posAtDOM(anchorNode, anchorOffset);
    const f = view.posAtDOM(focusNode, focusOffset);
    const from = Math.min(a, f);
    const to = Math.max(a, f);
    return from !== to ? { from, to } : null;
  } catch {
    return null;
  }
}

function ScrutinyPanel({
  editor,
  expanded,
  onExpandedChange,
  trialMode = false,
  onTrialConsume,
  onTrialGated,
}: ScrutinyPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrutinyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Sidebar row for which the document highlight is shown (click-to-highlight only). */
  const [activeSentenceKey, setActiveSentenceKey] = useState<string | null>(null);
  /**
   * Last non-empty doc selection. Cleared when the selection collapses so we never reuse
   * a stale range (e.g. after Select All + click to place the caret).
   */
  const lastTextRangeRef = useRef<{ from: number; to: number } | null>(null);
  /** Set on Scan selection mousedown so we use the range at press time, not a stale ref. */
  const pendingScanSelectionRef = useRef<{ from: number; to: number } | null>(null);
  /** Doc positions for the latest successful selection-mode scan (sentence row → highlight map). */
  const lastSelectionScanRangeRef = useRef<{ from: number; to: number } | null>(null);
  /**
   * Range to use when the user leaves the editor for the sidebar: PM selection often collapses on blur
   * before click handlers run, and lastTextRangeRef is cleared on collapse — this ref is only cleared
   * when the user collapses the selection while the editor still has focus (caret click).
   */
  const blurOrLeaveRangeRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const root = safeGetEditorViewDom(editor);
    if (!root) {
      let raf: number | null = null;
      const retry = () => {
        if (!editor) return;
        const next = safeGetEditorViewDom(editor);
        if (!next) {
          raf = requestAnimationFrame(retry);
          return;
        }
      };
      raf = requestAnimationFrame(retry);
      return () => {
        if (raf != null) cancelAnimationFrame(raf);
      };
    }

    const snapshotRangeLeavingEditor = () => {
      requestAnimationFrame(() => {
        const { from, to } = editor.state.selection;
        if (from !== to) blurOrLeaveRangeRef.current = { from, to };
      });
    };

    root.addEventListener("pointerleave", snapshotRangeLeavingEditor);
    root.addEventListener("focusout", snapshotRangeLeavingEditor);

    const remember = () => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        lastTextRangeRef.current = { from, to };
        blurOrLeaveRangeRef.current = { from, to };
      } else {
        lastTextRangeRef.current = null;
        if (editor.view.hasFocus()) {
          blurOrLeaveRangeRef.current = null;
        }
      }
    };
    remember();
    editor.on("selectionUpdate", remember);
    editor.on("transaction", remember);
    return () => {
      root.removeEventListener("pointerleave", snapshotRangeLeavingEditor);
      root.removeEventListener("focusout", snapshotRangeLeavingEditor);
      editor.off("selectionUpdate", remember);
      editor.off("transaction", remember);
    };
  }, [editor]);

  function resolveScanSelectionRange(): { from: number; to: number } | null {
    if (!editor) return null;
    const view = safeGetEditorView(editor);
    const root = view ? safeGetEditorViewDom(editor) : null;
    if (!view || !root) return null;
    const fromDom = domSelectionToDocRange(view, root);
    if (fromDom) return fromDom;
    const { from, to } = editor.state.selection;
    if (from !== to) return { from, to };
    if (blurOrLeaveRangeRef.current) return blurOrLeaveRangeRef.current;
    if (lastTextRangeRef.current) return lastTextRangeRef.current;
    return null;
  }

  const overallLabel = useMemo(() => {
    const p = result?.overallProbability ?? 0;
    if (p >= 0.8) return "High";
    if (p >= 0.6) return "Moderate";
    if (p >= 0.4) return "Low";
    return "Very low";
  }, [result?.overallProbability]);

  if (!expanded) return null;

  async function run(mode: "selection" | "document") {
    if (!editor || loading) return;
    setLoading(true);
    setError(null);
    setActiveSentenceKey(null);
    setScrutinyDecorations(editor, []);
    if (mode === "selection") {
      setResult(null);
      lastSelectionScanRangeRef.current = null;
    }
    try {
      let from = 0;
      let to = editor.state.doc.content.size;
      if (mode === "selection") {
        const pending = pendingScanSelectionRef.current;
        pendingScanSelectionRef.current = null;

        const resolved = pending ?? resolveScanSelectionRange();
        if (resolved) {
          from = resolved.from;
          to = resolved.to;
        } else {
          from = editor.state.selection.from;
          to = editor.state.selection.to;
        }
        if (from === to) {
          lastSelectionScanRangeRef.current = null;
          setError("Select text in the document, then press Scan selection.");
          setLoading(false);
          return;
        }
      } else {
        lastSelectionScanRangeRef.current = null;
      }

      const { text } = extractPlainTextAndMap(editor, from, to);
      if (mode === "selection" && !text.trim()) {
        lastSelectionScanRangeRef.current = null;
        setError("No text in that selection. Try again.");
        setLoading(false);
        return;
      }

      const resp = await apiFetch<ScrutinyResponse>("/api/scrutiny/detect", {
        method: "POST",
        body: JSON.stringify({ text, mode }),
      });

      if (mode === "selection") lastSelectionScanRangeRef.current = { from, to };
      else lastSelectionScanRangeRef.current = null;

      setResult(resp);

      // Highlights only after the user clicks a sentence in the list (not immediately after scan).
      setScrutinyDecorations(editor, []);
    } catch (e) {
      lastSelectionScanRangeRef.current = null;
      setError("Scrutiny scan failed. Try again.");
      setResult(null);
      setActiveSentenceKey(null);
      if (editor) setScrutinyDecorations(editor, []);
    } finally {
      setLoading(false);
    }
  }

  if (!editor) return null;

  return (
    <div className="scrutiny-panel" data-onboard="scrutiny-panel">
      <div className="writing-pulse-panel-header">
        <h2 className="writing-pulse-panel-title">AI Scrutiny</h2>
        <button
          type="button"
          className="editor-orchestrator-collapse writing-pulse-panel-collapse"
          onClick={() => {
            onExpandedChange(false);
            setActiveSentenceKey(null);
            if (editor) setScrutinyDecorations(editor, []);
          }}
          aria-expanded
          aria-label="Collapse AI Scrutiny"
          title="Hide AI Scrutiny"
          data-onboard="scrutiny-collapse"
        >
          ‹
        </button>
      </div>

          <div className="scrutiny-actions" data-onboard="scrutiny-actions">
            <button
              type="button"
              className="editor-orchestrator-btn"
              data-onboard="scrutiny-scan-selection"
              onMouseDown={(e) => {
                e.preventDefault();
                if (!editor) return;
                pendingScanSelectionRef.current = resolveScanSelectionRange();
              }}
              onClick={() => {
                if (trialMode && onTrialConsume) {
                  const ok = onTrialConsume("scrutiny-selection");
                  if (!ok) {
                    onTrialGated?.("scrutiny-selection");
                    return;
                  }
                }
                try {
                  window.dispatchEvent(new CustomEvent("im:scrutiny-scan-selection"));
                } catch {
                  /* ignore */
                }
                void run("selection");
              }}
              disabled={loading}
              title="Analyze the text you selected in the document"
            >
              {loading ? "Scanning…" : "Scan selection"}
            </button>
            <button
              type="button"
              className="editor-orchestrator-btn"
              data-onboard="scrutiny-scan-document"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (trialMode && onTrialConsume) {
                  const ok = onTrialConsume("scrutiny-document");
                  if (!ok) {
                    onTrialGated?.("scrutiny-document");
                    return;
                  }
                }
                void run("document");
              }}
              disabled={loading}
              title="Analyze the whole document"
            >
              {loading ? "Scanning…" : "Scan document"}
            </button>
          </div>

          {error ? <div className="scrutiny-error">{error}</div> : null}

          {result ? (
            <div className="scrutiny-summary">
              <div className="scrutiny-score">
                <span className="scrutiny-score-label">AI-likeness</span>
                <span className="scrutiny-score-value">{overallLabel}</span>
              </div>
              <div className="scrutiny-note">
                Estimate only. False positives are possible—use as a signal, not proof.
              </div>
              <div className="scrutiny-meta">
                Model: <span className="scrutiny-mono">{result.model.modelId}</span>
                {result.truncated ? (
                  <>
                    {" "}
                    · <span>Document truncated for speed</span>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="scrutiny-empty">
              Select text in the document, then press Scan selection—or scan the whole document.
            </div>
          )}

          {result?.sentences?.length ? (
            <ul className="scrutiny-sentences" aria-label="Scrutiny results">
              {result.sentences.slice(0, 24).map((s, i) => {
                const pct = Math.round(s.aiProbability * 100);
                const level = pct >= 80 ? "high" : pct >= 60 ? "med" : "low";
                const rowKey = `${s.start}-${s.end}-${i}`;
                return (
                  <li
                    key={rowKey}
                    className={`scrutiny-sentence scrutiny-sentence--${level}${
                      activeSentenceKey === rowKey ? " scrutiny-sentence--active" : ""
                    }`}
                    onClick={() => {
                      let baseFrom = 0;
                      let baseTo = editor.state.doc.content.size;
                      if (result.mode === "selection") {
                        const r = lastSelectionScanRangeRef.current;
                        if (r) {
                          baseFrom = r.from;
                          baseTo = r.to;
                        } else {
                          const sel = editor.state.selection;
                          baseFrom = sel.from;
                          baseTo = sel.to;
                          if (baseFrom === baseTo && lastTextRangeRef.current) {
                            baseFrom = lastTextRangeRef.current.from;
                            baseTo = lastTextRangeRef.current.to;
                          }
                        }
                      }
                      const { posByIndex } = extractPlainTextAndMap(editor, baseFrom, baseTo);
                      const range = plainRangeToDocHighlight(posByIndex, s.start, s.end, baseFrom);
                      if (range) {
                        setActiveSentenceKey(rowKey);
                        setScrutinyDecorations(editor, [
                          Decoration.inline(range.startPos, range.endPos, { class: "scrutiny-highlight" }),
                        ]);
                      } else {
                        setActiveSentenceKey(null);
                        setScrutinyDecorations(editor, []);
                      }
                    }}
                    title="Click to highlight this sentence in the document"
                  >
                    <span className="scrutiny-sentence-text">{s.text}</span>
                    <span className="scrutiny-sentence-score">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
    </div>
  );
}

export default ScrutinyPanel;

