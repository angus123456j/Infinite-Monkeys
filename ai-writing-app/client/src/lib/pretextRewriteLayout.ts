import { prepare, layout } from "@chenglou/pretext";

/** Matches [.editor-content .tiptap](client/src/index.css): 11pt Arial, line-height 1.15; use named fonts (not system-ui) per Pretext. */
export const EDITOR_TIPTAP_CANVAS_FONT = "11pt Arial, sans-serif";

/** Inner width of the page text column: .pages-container width minus horizontal padding (96px * 2 from CSS). */
export const EDITOR_REWRITE_TEXT_MAX_WIDTH_PX = 816 - 96 * 2;

/** Matches [LINE_HEIGHT_PX](Editor.tsx) / .tiptap line box used for page math (each empty spacer `<p>` pushes ~this much). */
export const EDITOR_REWRITE_LINE_HEIGHT_PX = 17;

/**
 * Inline suggestion (`.inline-suggestion`) uses line-height 1.4 — taller line boxes than body copy, so more vertical space than body `layout()` with 17px.
 * 11pt ≈ 14.67px; × 1.4 ≈ 20.5px per line in the floating card.
 */
export const EDITOR_INLINE_SUGGESTION_LAYOUT_LINE_HEIGHT_PX = (11 / 72) * 96 * 1.4;

/**
 * Text in the card wraps narrower than full column width because "↪ Rewritten:" sits on the first line.
 * Underestimating width made Pretext predict too few lines and left the overlay covering text below.
 */
export const EDITOR_INLINE_SUGGESTION_TEXT_MAX_WIDTH_PX = Math.max(
  320,
  EDITOR_REWRITE_TEXT_MAX_WIDTH_PX - 140
);

/** Extra vertical slack for `.inline-suggestion` padding and chrome above/below the text block. */
const INLINE_SUGGESTION_CHROME_VERTICAL_PX = 36;

/** Hard ceiling so pathological input cannot insert thousands of empty paragraphs. */
const MAX_SPACER_PARAGRAPHS = 220;

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
 * Predict total pixel height of the floating rewrite card (text + inline line-height + chrome).
 */
export function measureInlineSuggestionBlockHeightPx(text: string): number {
  const t = text ?? "";
  if (t.length === 0) return INLINE_SUGGESTION_CHROME_VERTICAL_PX;
  const prepared = prepare(t, EDITOR_TIPTAP_CANVAS_FONT, { whiteSpace: "normal" });
  const { height } = layout(
    prepared,
    EDITOR_INLINE_SUGGESTION_TEXT_MAX_WIDTH_PX,
    EDITOR_INLINE_SUGGESTION_LAYOUT_LINE_HEIGHT_PX
  );
  return height + INLINE_SUGGESTION_CHROME_VERTICAL_PX;
}

/**
 * How many empty spacer paragraphs are needed so document flow reserves roughly the same vertical
 * space as the overlay (map pixel height → `.tiptap` line boxes).
 */
export function targetSpacerParagraphCountForRewrite(rewriteText: string): number {
  const blockPx = measureInlineSuggestionBlockHeightPx(rewriteText);
  const lines = Math.ceil(blockPx / EDITOR_REWRITE_LINE_HEIGHT_PX);
  const withBuffer = lines + 3;
  return Math.min(MAX_SPACER_PARAGRAPHS, Math.max(1, withBuffer));
}

/**
 * How many extra empty spacer paragraphs to insert beyond `currentSpacerParagraphCount`
 * so content below stays pushed down as the suggestion grows (reveal + line wraps).
 */
export function extraSpacerParagraphsNeeded(
  rewriteText: string,
  currentSpacerParagraphCount: number,
  maxTotalLines: number = MAX_SPACER_PARAGRAPHS
): number {
  const target = Math.min(maxTotalLines, targetSpacerParagraphCountForRewrite(rewriteText));
  return Math.max(0, target - currentSpacerParagraphCount);
}

/** Upper bound for overlap-repair inserts so long rewrites can still nudge until the card clears. */
export function maxOverlapRepairExtraParas(rewriteText: string): number {
  const target = targetSpacerParagraphCountForRewrite(rewriteText);
  return Math.min(MAX_SPACER_PARAGRAPHS, target + 24);
}
