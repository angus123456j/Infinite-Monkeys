import type { Node } from "@tiptap/pm/model";

/** Sentence enders for punctuation fallback (expand after `.`/`!`/`?` + following spaces). */
function punctuationSentenceBounds(
  s: string,
  relFrom: number,
  relTo: number
): { start: number; end: number } {
  let start = 0;
  for (let i = relFrom - 1; i >= 0; i--) {
    const ch = s.charAt(i);
    if (/[.!?]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /\s/.test(s.charAt(j))) j++;
      start = j;
      break;
    }
  }

  let end = s.length;
  const lastIdx = Math.max(relTo - 1, relFrom);
  for (let i = lastIdx; i < s.length; i++) {
    if (/[.!?]/.test(s.charAt(i))) {
      end = i + 1;
      break;
    }
  }
  return { start, end };
}

/**
 * Prefer `Intl.Segmenter` (sentence) when available; otherwise punctuation heuristics within the block.
 */
function sentenceBoundsInString(
  s: string,
  relFrom: number,
  relTo: number
): { start: number; end: number } {
  const SegmenterApi = (
    Intl as unknown as { Segmenter?: new (locales?: string, options?: { granularity?: string }) => { segment: (input: string) => Iterable<{ segment: string; index: number }> } }
  ).Segmenter;
  if (typeof Intl !== "undefined" && typeof SegmenterApi === "function") {
    try {
      const seg = new SegmenterApi(undefined, { granularity: "sentence" });
      const parts = [...seg.segment(s)];
      let start = 0;
      let end = s.length;
      let found = false;
      for (const p of parts) {
        const os = p.index;
        const oe = os + p.segment.length;
        if (oe <= relFrom) continue;
        if (os >= relTo) break;
        if (!found) {
          start = os;
          found = true;
        }
        end = oe;
      }
      if (found) return { start, end };
    } catch {
      /* fall through */
    }
  }
  return punctuationSentenceBounds(s, relFrom, relTo);
}

/**
 * Returns the full sentence(s) in the current textblock that contain the selection, using the same
 * `textBetween` block separator as `doc.textBetween(from, to, " ")` for consistency with the editor.
 */
export function extractSentenceContext(
  doc: Node,
  from: number,
  to: number
): string | null {
  const $from = doc.resolve(from);
  let blockStart = -1;
  let blockEnd = -1;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.isTextblock) {
      blockStart = $from.start(d);
      blockEnd = $from.end(d);
      break;
    }
  }
  if (blockStart < 0 || blockEnd <= blockStart) return null;

  const blockText = doc.textBetween(blockStart, blockEnd, " ");
  if (!blockText.trim()) return null;

  const relFrom = doc.textBetween(blockStart, from, " ").length;
  const relTo = doc.textBetween(blockStart, to, " ").length;
  if (relFrom > relTo || relFrom < 0 || relTo > blockText.length) return null;

  const { start, end } = sentenceBoundsInString(blockText, relFrom, relTo);
  const sentence = blockText.slice(start, end).trim();
  return sentence.length ? sentence : null;
}
