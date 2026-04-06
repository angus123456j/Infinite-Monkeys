import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  computeWritingMetrics,
  findAdverbMatches,
  findPassiveMatches,
  findQualifierMatches,
  uniqueSortedMatchTexts,
} from "../utils/writingAnalysis";

const DEBOUNCE_MS = 200;

type Severity = "safe" | "warn" | "severe";

function gradeSeverity(grade: number): Severity {
  if (Number.isNaN(grade)) return "safe";
  if (grade <= 9) return "safe";
  if (grade <= 12) return "warn";
  return "severe";
}

/** 0 = safe, 1..threshold-1 = warn, threshold+ = severe */
function countSeverity(n: number, severeThreshold: number): Severity {
  if (n === 0) return "safe";
  if (n < severeThreshold) return "warn";
  return "severe";
}

interface WritingSignalsProps {
  editor: Editor | null;
}

export default function WritingSignals({ editor }: WritingSignalsProps) {
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

  const readSev = Number.isFinite(metrics.readabilityGrade)
    ? gradeSeverity(metrics.readabilityGrade)
    : "muted";
  const hardSev = countSeverity(metrics.hardSentences, 5);
  const vHardSev = countSeverity(metrics.veryHardSentences, 3);
  const advSev = countSeverity(metrics.adverbs, 8);
  const passSev = countSeverity(metrics.passiveVoice, 4);
  const qualSev = countSeverity(metrics.qualifiers, 3);

  const gradeLabel = Number.isFinite(metrics.readabilityGrade)
    ? `Grade ${metrics.readabilityGrade}`
    : "—";

  const hasWeakenersDetail =
    adverbWords.length > 0 ||
    passivePhrases.length > 0 ||
    qualifierPhrases.length > 0;

  return (
    <section className="writing-pulse" aria-label="Editor metrics">
      <ul className="writing-pulse-rows">
        <li className="writing-pulse-row">
          <span className="writing-pulse-label">Readability</span>
          <span
            className={`writing-pulse-value writing-pulse-value--${readSev}`}
            title="Approximate Flesch–Kincaid grade level (local)"
          >
            {gradeLabel}
          </span>
        </li>
        <li className="writing-pulse-row">
          <span className="writing-pulse-label">Hard sentence to read</span>
          <span className={`writing-pulse-value writing-pulse-value--${hardSev}`}>
            {metrics.hardSentences}
          </span>
        </li>
        <li className="writing-pulse-row">
          <span className="writing-pulse-label">Very hard sentences to read</span>
          <span className={`writing-pulse-value writing-pulse-value--${vHardSev}`}>
            {metrics.veryHardSentences}
          </span>
        </li>
      </ul>

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
