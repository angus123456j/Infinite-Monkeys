import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { GrammarSentenceCard } from "../lib/harperGrammar";
import {
  computeWritingMetrics,
  findAdverbMatches,
  findPassiveMatches,
  findQualifierMatches,
  uniqueSortedMatchTexts,
} from "../utils/writingAnalysis";

const DEBOUNCE_MS = 200;

type Severity = "safe" | "warn" | "severe";

/** 0 = safe, 1..threshold-1 = warn, threshold+ = severe */
function countSeverity(n: number, severeThreshold: number): Severity {
  if (n === 0) return "safe";
  if (n < severeThreshold) return "warn";
  return "severe";
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

interface WritingSignalsProps {
  editor: Editor | null;
  grammarCards: GrammarSentenceCard[];
  selectedGrammarId: string | null;
  onSelectGrammarCard: (id: string | null) => void;
  onAcceptGrammarSuggestion: (id: string) => void;
}

export default function WritingSignals({
  editor,
  grammarCards,
  selectedGrammarId,
  onSelectGrammarCard,
  onAcceptGrammarSuggestion,
}: WritingSignalsProps) {
  const [text, setText] = useState("");
  const [weakenersOpen, setWeakenersOpen] = useState(false);

  useEffect(() => {
    if (!editor) {
      setText("");
      return;
    }

    setText(editor.getText());

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setText(editor.getText());
        timeoutId = null;
      }, DEBOUNCE_MS);
    };

    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [editor]);

  const metrics = useMemo(() => computeWritingMetrics(text), [text]);

  const adverbMatches = useMemo(() => findAdverbMatches(text), [text]);
  const passiveMatches = useMemo(() => findPassiveMatches(text), [text]);
  const qualifierMatches = useMemo(() => findQualifierMatches(text), [text]);

  const adverbWords = useMemo(
    () => uniqueSortedMatchTexts(adverbMatches),
    [adverbMatches]
  );
  const passivePhrases = useMemo(
    () => uniqueSortedMatchTexts(passiveMatches),
    [passiveMatches]
  );
  const qualifierPhrases = useMemo(
    () => uniqueSortedMatchTexts(qualifierMatches),
    [qualifierMatches]
  );

  const grammarSev = countSeverity(grammarCards.length, 4);
  const advSev = countSeverity(metrics.adverbs, 8);
  const passSev = countSeverity(metrics.passiveVoice, 4);
  const qualSev = countSeverity(metrics.qualifiers, 3);

  const hasWeakenersDetail =
    adverbWords.length > 0 ||
    passivePhrases.length > 0 ||
    qualifierPhrases.length > 0;

  return (
    <section className="writing-pulse" aria-label="Editor metrics">
      <ul className="writing-pulse-rows">
        <li className="writing-pulse-row">
          <span className="writing-pulse-label">Grammar errors</span>
          <span
            className={`writing-pulse-value writing-pulse-value--${grammarSev}`}
            title="Harper — offline grammar & spelling (WASM, open source)"
          >
            {grammarCards.length}
          </span>
        </li>
      </ul>

      {grammarCards.length > 0 && (
        <div
          className="writing-pulse-grammar-list"
          role="list"
          aria-label="Sentences with suggested fixes"
        >
          {grammarCards.map((card) => {
            const active = card.id === selectedGrammarId;
            return (
              <div
                key={card.id}
                className={`writing-pulse-grammar-card${
                  active ? " writing-pulse-grammar-card--active" : ""
                }`}
                role="listitem"
              >
                <button
                  type="button"
                  className="writing-pulse-grammar-card-hit"
                  onClick={() =>
                    onSelectGrammarCard(active ? null : card.id)
                  }
                  aria-pressed={active}
                >
                  <span className="writing-pulse-grammar-card-preview">
                    {truncate(card.original, 120)}
                  </span>
                </button>
                {active && (
                  <div className="writing-pulse-grammar-detail">
                    {card.hints.slice(0, 3).map((h, hi) => (
                      <p
                        key={`${card.id}-hint-${hi}`}
                        className="writing-pulse-grammar-hint"
                      >
                        {h}
                      </p>
                    ))}
                    <div className="writing-pulse-grammar-suggestion-label">
                      Suggested
                    </div>
                    <div className="writing-pulse-grammar-suggestion-text">
                      {card.suggested}
                    </div>
                    <button
                      type="button"
                      className="writing-pulse-grammar-accept"
                      onClick={() => onAcceptGrammarSuggestion(card.id)}
                    >
                      Accept
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="writing-pulse-group">
        <button
          type="button"
          className="writing-pulse-group-toggle"
          onClick={() => setWeakenersOpen((o) => !o)}
          aria-expanded={weakenersOpen}
          aria-controls="writing-pulse-weakeners-detail"
          id="writing-pulse-weakeners-trigger"
        >
          <span className="writing-pulse-subhead">Weakeners</span>
          <span className="writing-pulse-group-chevron" aria-hidden>
            {weakenersOpen ? "▼" : "▶"}
          </span>
        </button>
        <ul className="writing-pulse-rows">
          <li className="writing-pulse-row">
            <span className="writing-pulse-label">Adverbs</span>
            <span
              className={`writing-pulse-value writing-pulse-value--weakener writing-pulse-value--${advSev}`}
            >
              {metrics.adverbs}
            </span>
          </li>
          <li className="writing-pulse-row">
            <span className="writing-pulse-label">Passive voice</span>
            <span
              className={`writing-pulse-value writing-pulse-value--weakener writing-pulse-value--${passSev}`}
            >
              {metrics.passiveVoice}
            </span>
          </li>
          <li className="writing-pulse-row">
            <span className="writing-pulse-label">Qualifiers</span>
            <span
              className={`writing-pulse-value writing-pulse-value--weakener writing-pulse-value--${qualSev}`}
              title='Hedges like “maybe”, “I think”, “sort of” (local heuristic)'
            >
              {metrics.qualifiers}
            </span>
          </li>
        </ul>
        {weakenersOpen && (
          <div
            className="writing-pulse-expand-panel"
            id="writing-pulse-weakeners-detail"
            role="region"
            aria-labelledby="writing-pulse-weakeners-trigger"
          >
            {!hasWeakenersDetail ? (
              <p className="writing-pulse-empty-hint">None detected.</p>
            ) : (
              <>
                {adverbWords.length > 0 && (
                  <>
                    <div className="writing-pulse-detail-title">Adverbs</div>
                    <ul className="writing-pulse-word-list">
                      {adverbWords.map((w) => (
                        <li key={`adv-${w}`}>{w}</li>
                      ))}
                    </ul>
                  </>
                )}
                {passivePhrases.length > 0 && (
                  <>
                    <div className="writing-pulse-detail-title">
                      Passive voice
                    </div>
                    <ul className="writing-pulse-word-list">
                      {passivePhrases.map((w) => (
                        <li key={`pass-${w}`}>{w}</li>
                      ))}
                    </ul>
                  </>
                )}
                {qualifierPhrases.length > 0 && (
                  <>
                    <div className="writing-pulse-detail-title">Qualifiers</div>
                    <ul className="writing-pulse-word-list">
                      {qualifierPhrases.map((w) => (
                        <li key={`qual-${w}`}>{w}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
