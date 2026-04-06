import type { Editor } from "@tiptap/core";
import WritingSignals from "./WritingSignals";

interface WritingPulsePanelProps {
  editor: Editor | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/**
 * Editor metrics block — expand/collapse controlled by parent (for fixed-edge tabs).
 */
export default function WritingPulsePanel({
  editor,
  expanded,
  onExpandedChange,
}: WritingPulsePanelProps) {
  if (!expanded) {
    return null;
  }

  return (
    <div className="writing-pulse-panel">
      <div className="writing-pulse-panel-header">
        <h2 className="writing-pulse-panel-title">Editor</h2>
        <button
          type="button"
          className="editor-orchestrator-collapse writing-pulse-panel-collapse"
          onClick={() => onExpandedChange(false)}
          aria-expanded
          aria-label="Collapse Editor"
          title="Hide Editor"
        >
          ‹
        </button>
      </div>
      <WritingSignals editor={editor} />
    </div>
  );
}
