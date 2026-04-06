/**
 * Maps editor.getText() character indices → ProseMirror positions for inline decorations.
 */
import { Decoration } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import { getTextSerializersFromSchema } from "@tiptap/core";
import {
  findAdverbMatches,
  findPassiveMatches,
  findQualifierMatches,
  getSentenceList,
  wordCount,
} from "./writingAnalysis";

export type TextCharMap = {
  text: string;
  /** Position in doc for each character, or null for synthetic block separators / serialized nodes */
  charPos: (index: number) => number | null;
};

/**
 * Build a flat string matching TipTap `getText({ blockSeparator: '\\n\\n' })` with per-char positions.
 * Uses the same traversal as `@tiptap/core` `getTextBetween` so regex indices align with PM positions.
 */
export function buildTextCharMap(editor: Editor): TextCharMap | null {
  const doc = editor.state.doc;
  const refText = editor.getText();
  const chars: string[] = [];
  const positions: (number | null)[] = [];

  const blockSeparator = "\n\n";
  const textSerializers = getTextSerializersFromSchema(editor.schema);
  const range = { from: 0, to: doc.content.size };
  const rangeFrom = range.from;
  const rangeTo = range.to;

  doc.nodesBetween(rangeFrom, rangeTo, (node, pos, parent, index) => {
    if (node.isBlock && pos > rangeFrom) {
      for (const ch of blockSeparator) {
        chars.push(ch);
        positions.push(null);
      }
    }

    const serializer = textSerializers[node.type.name];
    if (serializer && parent) {
      const fragment = serializer({
        node,
        pos,
        parent,
        index,
        range,
      });
      for (let i = 0; i < fragment.length; i++) {
        chars.push(fragment[i]!);
        positions.push(null);
      }
      return false;
    }

    if (node.isText) {
      const t = node.text ?? "";
      const sliceFrom = Math.max(rangeFrom, pos) - pos;
      const sliceTo = rangeTo - pos;
      const slice = t.slice(sliceFrom, sliceTo);
      for (let k = 0; k < slice.length; k++) {
        chars.push(slice[k]!);
        positions.push(pos + sliceFrom + k);
      }
    }
  });

  const text = chars.join("");
  if (text !== refText) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "[Editor] Text map mismatch; skipping in-doc highlights.",
        { built: text.length, getText: refText.length }
      );
    }
    return null;
  }

  const charPos = (i: number): number | null => {
    if (i < 0 || i >= positions.length) return null;
    return positions[i] ?? null;
  };

  return { text, charPos };
}

function rangeToDecoration(
  map: TextCharMap,
  start: number,
  end: number,
  className: string
): Decoration | null {
  if (end <= start) return null;
  const from = map.charPos(start);
  const last = end - 1;
  const toPos = map.charPos(last);
  if (from == null || toPos == null) return null;
  return Decoration.inline(from, toPos + 1, {
    class: `writing-signal ${className}`,
  });
}

/**
 * Sentences (hard / very hard) and weakeners (blue).
 */
export function buildWritingHighlightDecorations(
  editor: Editor
): Decoration[] {
  const map = buildTextCharMap(editor);
  if (!map) return [];
  const { text } = map;
  if (!text.trim()) return [];

  const sentenceDecorations: Decoration[] = [];
  const wordDecorations: Decoration[] = [];

  const sentences = getSentenceList(text);
  let cursor = 0;
  for (const sent of sentences) {
    const idx = text.indexOf(sent, cursor);
    if (idx === -1) continue;
    const wc = wordCount(sent);
    const end = idx + sent.length;
    if (wc > 24) {
      const d = rangeToDecoration(
        map,
        idx,
        end,
        "writing-signal--sentence-very-hard"
      );
      if (d) sentenceDecorations.push(d);
    } else if (wc > 14) {
      const d = rangeToDecoration(
        map,
        idx,
        end,
        "writing-signal--sentence-hard"
      );
      if (d) sentenceDecorations.push(d);
    }
    cursor = end;
  }

  for (const m of findAdverbMatches(text)) {
    const d = rangeToDecoration(map, m.start, m.end, "writing-signal--weakener");
    if (d) wordDecorations.push(d);
  }
  for (const m of findPassiveMatches(text)) {
    const d = rangeToDecoration(map, m.start, m.end, "writing-signal--weakener");
    if (d) wordDecorations.push(d);
  }
  for (const m of findQualifierMatches(text)) {
    const d = rangeToDecoration(map, m.start, m.end, "writing-signal--weakener");
    if (d) wordDecorations.push(d);
  }

  /*
   * Word-level decorations must be listed before sentence-level so ProseMirror nests
   * smaller ranges inside larger ones — blue/purple sit above the sentence tint.
   */
  return [...wordDecorations, ...sentenceDecorations];
}
