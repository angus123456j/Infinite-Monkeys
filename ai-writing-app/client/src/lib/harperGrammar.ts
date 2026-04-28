/**
 * Grammar via Harper (Apache-2.0): WASM + Web Worker, fully on-device.
 * @see https://writewithharper.com/docs/harperjs/introduction
 */
import { WorkerLinter, Dialect, SuggestionKind, type Lint } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";
import { getSentenceList } from "../utils/writingAnalysis";

export type GrammarSentenceCard = {
  id: string;
  startChar: number;
  endChar: number;
  original: string;
  suggested: string;
  hints: string[];
};

type PlainFix = {
  start: number;
  end: number;
  message: string;
  replacement: string;
  kind: SuggestionKind;
};

let linterPromise: Promise<WorkerLinter> | null = null;

async function getLinter(): Promise<WorkerLinter> {
  if (!linterPromise) {
    linterPromise = (async () => {
      const linter = new WorkerLinter({
        binary: binaryInlined,
        dialect: Dialect.American,
      });
      await linter.setup();
      return linter;
    })();
  }
  return linterPromise;
}

function disposeSpan(span: { free?: () => void } | null): void {
  try {
    span?.free?.();
  } catch {
    /* ignore */
  }
}

function disposeSuggestion(s: { free?: () => void } | null): void {
  try {
    s?.free?.();
  } catch {
    /* ignore */
  }
}

function disposeLint(lint: Lint): void {
  try {
    lint.free?.();
  } catch {
    /* ignore */
  }
}

function lintToPlainFixes(lints: Lint[]): PlainFix[] {
  const out: PlainFix[] = [];
  for (const lint of lints) {
    const span = lint.span();
    const start = span.start;
    const end = span.end;
    disposeSpan(span);

    const sugs = lint.suggestions();
    if (sugs.length === 0) {
      disposeLint(lint);
      continue;
    }

    const s0 = sugs[0]!;
    const kind = s0.kind();
    const replacement = s0.get_replacement_text();
    const message = lint.message();

    for (let i = 1; i < sugs.length; i++) {
      disposeSuggestion(sugs[i]!);
    }
    disposeSuggestion(s0);
    disposeLint(lint);

    out.push({ start, end, message, replacement, kind });
  }
  return out;
}

function filterNonOverlapping(fixes: PlainFix[]): PlainFix[] {
  const sorted = [...fixes].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });
  const kept: PlainFix[] = [];
  for (const f of sorted) {
    if (
      kept.some(
        (t) => f.start < t.end && f.end > t.start
      )
    ) {
      continue;
    }
    kept.push(f);
  }
  return kept;
}

function applyFixesToSentence(
  sentence: string,
  sentenceStart: number,
  fixes: PlainFix[]
): string {
  const rel = fixes
    .filter(
      (f) =>
        f.start >= sentenceStart &&
        f.end <= sentenceStart + sentence.length
    )
    .map((f) => ({
      relStart: f.start - sentenceStart,
      relEnd: f.end - sentenceStart,
      replacement: f.replacement,
      kind: f.kind,
    }))
    .sort((a, b) => b.relStart - a.relStart);

  let result = sentence;
  for (const x of rel) {
    if (x.relStart < 0 || x.relEnd > result.length) continue;
    if (x.kind === SuggestionKind.Remove) {
      result =
        result.slice(0, x.relStart) + result.slice(x.relEnd);
    } else if (x.kind === SuggestionKind.InsertAfter) {
      result =
        result.slice(0, x.relEnd) +
        x.replacement +
        result.slice(x.relEnd);
    } else {
      result =
        result.slice(0, x.relStart) +
        x.replacement +
        result.slice(x.relEnd);
    }
  }
  return result;
}

/**
 * Sentences that overlap at least one Harper lint, with a patched suggestion string.
 */
export async function analyzeGrammarSentences(
  text: string
): Promise<GrammarSentenceCard[]> {
  if (!text.trim()) return [];

  const linter = await getLinter();
  const lints = await linter.lint(text, { language: "plaintext" });
  const allFixes = lintToPlainFixes(lints);
  const fixes = filterNonOverlapping(allFixes);

  const sentences = getSentenceList(text);
  let cursor = 0;
  const cards: GrammarSentenceCard[] = [];

  for (const sent of sentences) {
    const idx = text.indexOf(sent, cursor);
    if (idx === -1) continue;
    const end = idx + sent.length;
    cursor = end;

    const sentFixes = fixes.filter(
      (f) => f.start < end && f.end > idx
    );
    if (sentFixes.length === 0) continue;

    const suggested = applyFixesToSentence(sent, idx, sentFixes);
    if (suggested === sent) continue;

    const hints = [...new Set(sentFixes.map((f) => f.message))];
    cards.push({
      id: `${idx}:${end}`,
      startChar: idx,
      endChar: end,
      original: sent,
      suggested,
      hints,
    });
  }

  return cards;
}
