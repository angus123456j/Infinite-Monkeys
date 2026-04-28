import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DecorationSet, type Decoration } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";

export const orchestratorSelectionHighlightKey = new PluginKey<DecorationSet>(
  "orchestratorSelectionHighlight"
);

export function setOrchestratorSelectionDecorations(
  editor: Editor,
  decorations: Decoration[]
): void {
  const doc = editor.state.doc;
  const set = DecorationSet.create(doc, decorations);
  const tr = editor.state.tr.setMeta(orchestratorSelectionHighlightKey, set);
  editor.view.dispatch(tr);
}

export const OrchestratorSelectionHighlight = Extension.create({
  name: "orchestratorSelectionHighlight",

  addProseMirrorPlugins() {
    const key = orchestratorSelectionHighlightKey;
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, oldSet) {
            const incoming = tr.getMeta(key) as DecorationSet | undefined;
            if (incoming) return incoming;
            if (tr.docChanged) return oldSet.map(tr.mapping, tr.doc);
            return oldSet;
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
