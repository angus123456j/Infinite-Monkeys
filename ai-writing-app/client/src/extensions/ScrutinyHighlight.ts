import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DecorationSet, type Decoration } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";

export const scrutinyHighlightKey = new PluginKey<DecorationSet>(
  "scrutinyHighlight"
);

export function setScrutinyDecorations(editor: Editor, decorations: Decoration[]): void {
  const doc = editor.state.doc;
  const set = DecorationSet.create(doc, decorations);
  const tr = editor.state.tr.setMeta(scrutinyHighlightKey, set);
  editor.view.dispatch(tr);
}

export const ScrutinyHighlight = Extension.create({
  name: "scrutinyHighlight",

  addProseMirrorPlugins() {
    const key = scrutinyHighlightKey;
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, oldSet) {
            const incoming = tr.getMeta(key) as DecorationSet | undefined;
            if (incoming) return incoming;
            if (tr.docChanged) return DecorationSet.empty;
            return oldSet.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});

