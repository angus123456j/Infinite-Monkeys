/**
 * Local writing analysis helpers (readability, sentence shape, rough style signals).
 * Pure functions — safe for agents and UI to share.
 */

const SENTENCE_SPLIT = /[.!?]+/g;

/** Words ending in -ly that are usually not manner adverbs (reduce false positives). */
export const LY_EXCLUSIONS = new Set([
  "only",
  "family",
  "supply",
  "reply",
  "July",
  "fly",
  "early",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "likely",
  "unlikely",
  "silly",
  "holy",
  "ugly",
  "bully",
  "anomaly",
  "Italy",
  "comply",
  "imply",
  "apply",
  "rely",
]);

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Split prose into sentences using `.` `!` `?` as boundaries.
 * Empty fragments are removed.
 */
export function getSentenceList(text: string): string[] {
  if (!text || !text.trim()) return [];
  const raw = text.split(SENTENCE_SPLIT);
  const out: string[] = [];
  for (const chunk of raw) {
    const s = normalizeWhitespace(chunk);
    if (s.length > 0) out.push(s);
  }
  /* No `.` `!` `?` yet — treat whole draft as one sentence for metrics. */
  if (out.length === 0 && text.trim()) {
    return [normalizeWhitespace(text)];
  }
  return out;
}

export function wordCount(sentence: string): number {
  const parts = sentence.trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

/** Rough syllable count for English words (good enough for aggregate readability). */
export function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z']/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;

  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");

  const matches = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

function totalWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w'-]+|[^\w'-]+$/g, ""))
    .filter((w) => w.length > 0);
}

function totalSyllablesInText(text: string): number {
  const words = totalWords(text);
  let n = 0;
  for (const w of words) {
    n += countSyllables(w);
  }
  return n;
}

/**
 * Flesch–Kincaid grade level (approximate).
 * grade = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 */
export function getReadabilityScore(text: string): number {
  const sentences = getSentenceList(text);
  const words = totalWords(text);
  if (words.length === 0 || sentences.length === 0) return NaN;

  const w = words.length;
  const s = sentences.length;
  const syllables = totalSyllablesInText(text);

  const grade = 0.39 * (w / s) + 11.8 * (syllables / w) - 15.59;
  return Math.round(Math.max(0, Math.min(20, grade)) * 10) / 10;
}

/** Word count strictly greater than 14 (i.e. 15+ words). */
export function countHardSentences(text: string): number {
  return getSentenceList(text).filter((sent) => wordCount(sent) > 14).length;
}

/** Word count strictly greater than 24 (i.e. 25+ words). */
export function countVeryHardSentences(text: string): number {
  return getSentenceList(text).filter((sent) => wordCount(sent) > 24).length;
}

/**
 * Sentences longer than `minWords` words (default: 30).
 * Distinct from "very hard" so you can tune thresholds later.
 */
export function countLongSentences(text: string, minWords = 30): number {
  return getSentenceList(text).filter((sent) => wordCount(sent) > minWords).length;
}

const BE_VERB =
  /\b(?:am|is|are|was|were|be|been|being)\s+([a-z][a-z'-]*(?:ed|en))\b/gi;

/**
 * Rough passive-voice style: be-verb + word ending in -ed / -en.
 * Intentionally approximate.
 */
export function countPassiveVoice(text: string): number {
  if (!text.trim()) return 0;
  let n = 0;
  const t = text;
  BE_VERB.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BE_VERB.exec(t)) !== null) {
    const participle = (m[1] ?? "").toLowerCase();
    if (participle.length < 3) continue;
    n += 1;
  }
  return n;
}

const ADVERB_LY = /\b([a-z][a-z'-]*ly)\b/gi;

export function countAdverbs(text: string): number {
  if (!text.trim()) return 0;
  let n = 0;
  const t = text;
  ADVERB_LY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ADVERB_LY.exec(t)) !== null) {
    const w = (m[1] ?? "").toLowerCase();
    if (w.length < 4) continue;
    if (LY_EXCLUSIONS.has(w)) continue;
    n += 1;
  }
  return n;
}

/** Hedge / qualifier phrases (local heuristic). */
const QUALIFIER_RE =
  /\b(?:I\s+think|I\s+believe|I\s+guess|I\s+suppose|I\s+feel\s+that|maybe|perhaps|possibly|sort\s+of|kind\s+of|a\s+little|somewhat|rather)\b/gi;

export function countQualifiers(text: string): number {
  if (!text.trim()) return 0;
  let n = 0;
  QUALIFIER_RE.lastIndex = 0;
  while (QUALIFIER_RE.exec(text) !== null) n += 1;
  return n;
}

/** Character-range match in `editor.getText()` space (for highlights + sidebar lists). */
export type TextMatch = { text: string; start: number; end: number };

/** Unique matched substrings, sorted for sidebar display. */
export function uniqueSortedMatchTexts(matches: TextMatch[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of matches) {
    const t = x.text.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

export function findAdverbMatches(text: string): TextMatch[] {
  if (!text.trim()) return [];
  const out: TextMatch[] = [];
  ADVERB_LY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ADVERB_LY.exec(text)) !== null) {
    const w = (m[1] ?? "").toLowerCase();
    if (w.length < 4 || LY_EXCLUSIONS.has(w)) continue;
    const full = m[0] ?? "";
    const start = m.index;
    out.push({ text: full, start, end: start + full.length });
  }
  return out;
}

export function findPassiveMatches(text: string): TextMatch[] {
  if (!text.trim()) return [];
  const out: TextMatch[] = [];
  BE_VERB.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BE_VERB.exec(text)) !== null) {
    const participle = (m[1] ?? "").toLowerCase();
    if (participle.length < 3) continue;
    const full = m[0] ?? "";
    const start = m.index;
    out.push({ text: full, start, end: start + full.length });
  }
  return out;
}

export function findQualifierMatches(text: string): TextMatch[] {
  if (!text.trim()) return [];
  const out: TextMatch[] = [];
  QUALIFIER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUALIFIER_RE.exec(text)) !== null) {
    const full = m[0] ?? "";
    const start = m.index;
    out.push({ text: full, start, end: start + full.length });
  }
  return out;
}

export interface WritingMetrics {
  readabilityGrade: number;
  hardSentences: number;
  veryHardSentences: number;
  longSentences: number;
  passiveVoice: number;
  adverbs: number;
  qualifiers: number;
  sentenceCount: number;
  wordCount: number;
}

/** Single pass over sentences + full text for UI / agents (debounced). */
export function computeWritingMetrics(text: string): WritingMetrics {
  const sentences = getSentenceList(text);
  const words = totalWords(text);
  const wc = words.length;
  let hard = 0;
  let veryHard = 0;
  let long = 0;
  for (const sent of sentences) {
    const wcSent = wordCount(sent);
    if (wcSent > 14) hard += 1;
    if (wcSent > 24) veryHard += 1;
    if (wcSent > 30) long += 1; /* configurable “long” band; distinct from very hard */
  }

  const readabilityGrade = getReadabilityScore(text);

  return {
    readabilityGrade,
    hardSentences: hard,
    veryHardSentences: veryHard,
    longSentences: long,
    passiveVoice: countPassiveVoice(text),
    adverbs: countAdverbs(text),
    qualifiers: countQualifiers(text),
    sentenceCount: sentences.length,
    wordCount: wc,
  };
}
