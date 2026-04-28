import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import SuggestionBlockView from "../views/SuggestionBlockView";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export type SuggestionBlockStatus = "loading" | "ready" | "error";

export interface SuggestionBlockAttrs {
  rewriteId: number;
  monkeyId: string;
  status: SuggestionBlockStatus;
  title: string;
  text: string;
  error: string | null;
}

export interface SuggestionBlockOptions {
  onAccept?: (rewriteId: number) => void;
  onReject?: (rewriteId: number) => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    suggestionBlock: {
      insertSuggestionBlock: (attrs: SuggestionBlockAttrs, pos?: number) => ReturnType;
      updateSuggestionBlock: (rewriteId: number, patch: Partial<SuggestionBlockAttrs>) => ReturnType;
      removeSuggestionBlock: (rewriteId: number) => ReturnType;
    };
  }
}

function findSuggestionPos(doc: any, rewriteId: number): number | null {
  let found: number | null = null;
  doc.descendants((node: any, pos: number) => {
    if (node.type?.name === "suggestionBlock" && node.attrs?.rewriteId === rewriteId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function findSuggestionAtPos(doc: any, pos: number): { pos: number; size: number } | null {
  const node = doc.nodeAt(pos);
  if (node?.type?.name === "suggestionBlock") return { pos, size: node.nodeSize };
  return null;
}

function focusEditableSuggestionText(rewriteId: number, atEnd: boolean) {
  const root = document.querySelector(`[data-rewrite-id="${rewriteId}"]`);
  const el = root?.querySelector?.(".im-suggestion-node__text") as HTMLElement | null;
  if (!el) return false;
  el.focus();
  try {
    const sel = window.getSelection();
    if (!sel) return true;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!atEnd ? true : false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore */
  }
  return true;
}

function preventSuggestionDeletion(view: EditorView, event: KeyboardEvent): boolean {
  const state = view.state;
  const sel: any = state.selection;
  if (!sel) return false;
  const $from = sel.$from;

  // If selection is directly on the node, never let Backspace/Delete remove it.
  if (sel.node?.type?.name === "suggestionBlock") {
    if (event.key === "Backspace" || event.key === "Delete") {
      // Move caret to a safe spot instead of deleting the block.
      const to = Math.min(sel.from + (sel.node?.nodeSize ?? 0), state.doc.content.size);
      const tr = state.tr.setSelection(TextSelection.create(state.doc, to));
      view.dispatch(tr);
      return true;
    }
  }

  if (!sel.empty) return false;

  const head = sel.from;

  const resolvePrevBlock = () => {
    for (let d = $from.depth; d > 0; d--) {
      // At the start of this depth’s content? Then previous sibling lives before it.
      const atStart = $from.start(d) === head;
      if (!atStart) continue;
      const $before = state.doc.resolve($from.before(d));
      const prev = $before.nodeBefore;
      if (prev) return { node: prev, size: prev.nodeSize, depth: d };
    }
    return null;
  };
  const resolveNextBlock = () => {
    for (let d = $from.depth; d > 0; d--) {
      // At the end of this depth’s content?
      const atEnd = $from.end(d) === head;
      if (!atEnd) continue;
      const $after = state.doc.resolve($from.after(d));
      const next = $after.nodeAfter;
      if (next) return { node: next, size: next.nodeSize, depth: d };
    }
    return null;
  };

  // If caret is right before a suggestionBlock, prevent Delete
  if (event.key === "Delete") {
    const na = $from.nodeAfter;
    if (na?.type?.name === "suggestionBlock") {
      // Enter the rewrite text instead of deleting the block.
      const rid = (na.attrs as any)?.rewriteId as number | undefined;
      if (typeof rid === "number") {
        focusEditableSuggestionText(rid, false);
        return true;
      }
      // Fallback: skip over the block; do not delete it.
      const to = Math.min(head + na.nodeSize, state.doc.content.size);
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
      return true;
    }
    const nextBlock = resolveNextBlock();
    if (nextBlock?.node?.type?.name === "suggestionBlock") {
      const to = Math.min(head + nextBlock.size, state.doc.content.size);
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
      return true;
    }
    const next = findSuggestionAtPos(state.doc, head);
    if (next) {
      const to = Math.min(head + next.size, state.doc.content.size);
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
      return true;
    }
  }

  // If caret is right after a suggestionBlock, prevent Backspace
  if (event.key === "Backspace") {
    const nb = $from.nodeBefore;
    if (nb?.type?.name === "suggestionBlock") {
      // Enter the rewrite text (end) instead of deleting the block / jumping upward.
      const rid = (nb.attrs as any)?.rewriteId as number | undefined;
      if (typeof rid === "number") {
        focusEditableSuggestionText(rid, true);
        return true;
      }
      // Fallback: skip before the block; do not delete it.
      const to = Math.max(1, head - nb.nodeSize);
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
      return true;
    }
    const prevBlock = resolvePrevBlock();
    if (prevBlock?.node?.type?.name === "suggestionBlock") {
      const to = Math.max(1, head - prevBlock.size);
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
      return true;
    }
    const prevPos = Math.max(0, head - 1);
    const prevNode = state.doc.nodeAt(prevPos);
    if (prevNode?.type?.name === "suggestionBlock") {
      const to = Math.max(1, head - prevNode.nodeSize);
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
      return true;
    }
  }

  return false;
}

export const SuggestionBlock = Node.create<SuggestionBlockOptions>({
  name: "suggestionBlock",
  group: "block",
  atom: true,
  // Critical: prevent NodeSelection so typing can't replace the node.
  selectable: false,
  draggable: false,

  addOptions() {
    return {};
  },

  addAttributes() {
    return {
      rewriteId: { default: 0 },
      monkeyId: { default: "" },
      status: { default: "loading" },
      title: { default: "Rewritten:" },
      text: { default: "" },
      error: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-im-suggestion-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-im-suggestion-block": "true",
        contenteditable: "false",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SuggestionBlockView, {
      stopEvent: (event) => {
        // Let buttons handle clicks; prevent ProseMirror from turning this atom into a NodeSelection.
        const e = (event as unknown as { event?: Event })?.event;
        const target = (e?.target ?? null) as HTMLElement | null;
        if (target?.closest?.(".im-suggestion-node__btn")) return true;
        if (target?.closest?.(".im-suggestion-node__text")) return true;
        return true;
      },
    });
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("imPreventSuggestionDeletion"),
        props: {
          handleKeyDown(view, event) {
            return preventSuggestionDeletion(view, event);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      insertSuggestionBlock:
        (attrs, pos) =>
        ({ commands, editor }) => {
          const at = pos ?? editor.state.selection.to;
          const ok = commands.insertContentAt(at, { type: this.name, attrs });
          if (!ok) return false;
          // After inserting, move caret below the block so typing continues in normal flow.
          // Node is atomic; cursor position immediately after it is `at + nodeSize`.
          try {
            const foundPos = findSuggestionPos(editor.state.doc, attrs.rewriteId);
            const actualPos = foundPos ?? at;
            const node = editor.state.doc.nodeAt(actualPos);
            if (node && node.type?.name === "suggestionBlock") {
              const after = Math.min(
                actualPos + node.nodeSize,
                editor.state.doc.content.size
              );
              editor.commands.setTextSelection(after);
            }
          } catch {
            /* ignore */
          }
          return true;
        },
      updateSuggestionBlock:
        (rewriteId, patch) =>
        ({ tr, state, dispatch }) => {
          const pos = findSuggestionPos(state.doc, rewriteId);
          if (pos == null) return false;
          const node = state.doc.nodeAt(pos);
          if (!node) return false;
          const nextAttrs = { ...node.attrs, ...patch };
          tr.setNodeMarkup(pos, undefined, nextAttrs);
          if (dispatch) dispatch(tr);
          return true;
        },
      removeSuggestionBlock:
        (rewriteId) =>
        ({ tr, state, dispatch }) => {
          const pos = findSuggestionPos(state.doc, rewriteId);
          if (pos == null) return false;
          const node = state.doc.nodeAt(pos);
          if (!node) return false;
          tr.delete(pos, pos + node.nodeSize);
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

