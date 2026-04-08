import { useMemo, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { Decoration } from "@tiptap/pm/view";
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
}

function extractPlainTextAndMap(editor: TiptapEditor, from: number, to: number): { text: string; posByIndex: number[] } {
  const doc = editor.state.doc;
  let out = "";
  const map: number[] = [];
  let lastWasSpace = true;
  let lastPos = from;

  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const t = node.text ?? "";
    if (!t) return;

    const firstIsSpace = /^\s/.test(t);
    if (out.length > 0 && !lastWasSpace && !firstIsSpace) {
      out += " ";
      map.push(lastPos);
      lastWasSpace = true;
    }

    for (let i = 0; i < t.length; i++) {
      const ch = t[i]!;
      out += ch;
      map.push(pos + 1 + i);
      lastWasSpace = /\s/.test(ch);
      lastPos = pos + 1 + i;
    }
  });

  return { text: out, posByIndex: map };
}

function ScrutinyPanel({ editor, expanded, onExpandedChange }: ScrutinyPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrutinyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightsOn, setHighlightsOn] = useState(true);

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
    try {
      const sel = editor.state.selection;
      const from = mode === "selection" ? sel.from : 0;
      const to = mode === "selection" ? sel.to : editor.state.doc.content.size;
      const { text, posByIndex } = extractPlainTextAndMap(editor, from, to);

      const resp = await apiFetch<ScrutinyResponse>("/api/scrutiny/detect", {
        method: "POST",
        body: JSON.stringify({ text, mode }),
      });

      setResult(resp);

      if (!highlightsOn || !resp.sentences.length) {
        setScrutinyDecorations(editor, []);
      } else {
        // Default highlight: top few suspicious sentences
        const top = resp.sentences
          .filter((s) => s.aiProbability >= resp.threshold)
          .slice(0, 8);
        const decos: Decoration[] = [];
        for (const s of top) {
          const startPos = posByIndex[s.start] ?? from;
          const endPos = (posByIndex[Math.max(s.end - 1, 0)] ?? startPos) + 1;
          if (endPos > startPos) {
            decos.push(Decoration.inline(startPos, endPos, { class: "scrutiny-highlight" }));
          }
        }
        setScrutinyDecorations(editor, decos);
      }
    } catch (e) {
      setError("Scrutiny scan failed. Try again.");
      setResult(null);
      if (editor) setScrutinyDecorations(editor, []);
    } finally {
      setLoading(false);
    }
  }

  if (!editor) return null;

  return (
    <div className="scrutiny-panel">
      <div className="writing-pulse-panel-header">
        <h2 className="writing-pulse-panel-title">AI Scrutiny</h2>
        <button
          type="button"
          className="editor-orchestrator-collapse writing-pulse-panel-collapse"
          onClick={() => {
            onExpandedChange(false);
            if (editor) setScrutinyDecorations(editor, []);
          }}
          aria-expanded
          aria-label="Collapse AI Scrutiny"
          title="Hide AI Scrutiny"
        >
          ‹
        </button>
      </div>

          <div className="scrutiny-actions">
            <button
              type="button"
              className="editor-orchestrator-btn"
              onClick={() => void run("selection")}
              disabled={loading || editor.state.selection.from === editor.state.selection.to}
              title="Analyze the selected text"
            >
              {loading ? "Scanning…" : "Scan selection"}
            </button>
            <button
              type="button"
              className="editor-orchestrator-btn"
              onClick={() => void run("document")}
              disabled={loading}
              title="Analyze the whole document"
            >
              {loading ? "Scanning…" : "Scan document"}
            </button>

            <label className="scrutiny-toggle">
              <input
                type="checkbox"
                checked={highlightsOn}
                onChange={(e) => {
                  setHighlightsOn(e.target.checked);
                  if (!e.target.checked) setScrutinyDecorations(editor, []);
                }}
              />
              Highlight
            </label>
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
            <div className="scrutiny-empty">Select text and scan to get a score.</div>
          )}

          {result?.sentences?.length ? (
            <ul className="scrutiny-sentences" aria-label="Scrutiny results">
              {result.sentences.slice(0, 24).map((s, i) => {
                const pct = Math.round(s.aiProbability * 100);
                const level = pct >= 80 ? "high" : pct >= 60 ? "med" : "low";
                return (
                  <li
                    key={`${s.start}-${s.end}-${i}`}
                    className={`scrutiny-sentence scrutiny-sentence--${level}`}
                    onClick={() => {
                      if (!highlightsOn) return;
                      const sel = editor.state.selection;
                      const baseFrom = result.mode === "selection" ? sel.from : 0;
                      const baseTo =
                        result.mode === "selection"
                          ? sel.to
                          : editor.state.doc.content.size;
                      const { posByIndex } = extractPlainTextAndMap(editor, baseFrom, baseTo);
                      const startPos = posByIndex[s.start] ?? baseFrom;
                      const endPos = (posByIndex[Math.max(s.end - 1, 0)] ?? startPos) + 1;
                      if (endPos > startPos) {
                        setScrutinyDecorations(editor, [
                          Decoration.inline(startPos, endPos, { class: "scrutiny-highlight" }),
                        ]);
                      }
                    }}
                    title="Click to highlight this sentence"
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

