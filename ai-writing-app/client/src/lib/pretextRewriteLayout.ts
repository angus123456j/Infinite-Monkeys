import { prepare, layout } from "@chenglou/pretext";

/** Matches [.editor-content .tiptap](client/src/index.css): 11pt Arial, line-height 1.15; use named fonts (not system-ui) per Pretext. */
export const EDITOR_TIPTAP_CANVAS_FONT = "11pt Arial, sans-serif";

/** Inner width of the page text column: .pages-container width minus horizontal padding (72px * 2 from CSS). */
export const EDITOR_REWRITE_TEXT_MAX_WIDTH_PX = 816 - 96 * 2;

/** Matches [LINE_HEIGHT_PX](Editor.tsx) / .tiptap line box used for page math. */
export const EDITOR_REWRITE_LINE_HEIGHT_PX = 17;

const DEFAULT_MAX_REVEAL_SPACER_LINES = 10;

/**
 * Measure how many lines / total height Pretext predicts for body copy at the editor column width.
 */
export function measureRewriteLayout(text: string): { lineCount: number; height: number } {
  const t = text ?? "";
  if (t.length === 0) {
    return { lineCount: 0, height: 0 };
  }
  const prepared = prepare(t, EDITOR_TIPTAP_CANVAS_FONT, { whiteSpace: "normal" });
  return layout(prepared, EDITOR_REWRITE_TEXT_MAX_WIDTH_PX, EDITOR_REWRITE_LINE_HEIGHT_PX);
}

/**
 * How many extra empty spacer paragraphs to insert beyond `currentSpacerParagraphCount`
 * so the reveal block has room (same formula as before: min(maxTotalLines, lineCount + 2)).
 */
export function extraSpacerParagraphsNeeded(
  rewriteText: string,
  currentSpacerParagraphCount: number,
  maxTotalLines: number = DEFAULT_MAX_REVEAL_SPACER_LINES
): number {
  const { lineCount } = measureRewriteLayout(rewriteText);
  const totalNeeded = Math.min(maxTotalLines, lineCount + 2);
  return Math.max(0, totalNeeded - currentSpacerParagraphCount);
}
