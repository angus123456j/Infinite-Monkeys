export type SentenceSpan = {
  text: string;
  start: number; // char offset in the provided input text
  end: number; // exclusive
};

// Conservative sentence splitter: good enough for UI highlighting and per-sentence scoring.
// We keep punctuation with the sentence and fall back to paragraph chunks.
export function splitSentences(text: string): SentenceSpan[] {
  const t = (text ?? "").replace(/\r\n/g, "\n");
  if (!t.trim()) return [];

  const spans: SentenceSpan[] = [];

  // Split into paragraphs, but preserve offsets.
  const paraRegex = /\n\s*\n+/g;
  let m: RegExpExecArray | null;
  let last = 0;
  const paras: Array<{ start: number; end: number }> = [];
  while ((m = paraRegex.exec(t))) {
    paras.push({ start: last, end: m.index });
    last = m.index + m[0].length;
  }
  paras.push({ start: last, end: t.length });

  for (const p of paras) {
    const raw = t.slice(p.start, p.end);
    const paraStart = p.start;

    // Sentence-ish matches with punctuation, else one chunk.
    const localMatches = raw.matchAll(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    let any = false;
    for (const lm of localMatches) {
      any = true;
      const s = lm[0];
      const localIdx = lm.index ?? 0;
      const start = paraStart + localIdx;
      const trimmed = s.trim();
      if (!trimmed) continue;
      // Adjust to trimmed bounds for nicer highlighting.
      const leftTrim = s.length - s.trimStart().length;
      const rightTrim = s.trimEnd().length;
      const adjStart = start + leftTrim;
      const adjEnd = start + rightTrim;
      spans.push({ text: t.slice(adjStart, adjEnd), start: adjStart, end: adjEnd });
    }
    if (!any) {
      const trimmed = raw.trim();
      if (trimmed) {
        const leftTrim = raw.length - raw.trimStart().length;
        const rightTrim = raw.trimEnd().length;
        const adjStart = paraStart + leftTrim;
        const adjEnd = paraStart + rightTrim;
        spans.push({ text: t.slice(adjStart, adjEnd), start: adjStart, end: adjEnd });
      }
    }
  }

  // Stable sort by start.
  spans.sort((a, b) => a.start - b.start);
  return spans;
}

