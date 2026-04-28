import type { Editor } from "@tiptap/core";
import type { GrammarSentenceCard } from "../lib/harperGrammar";
import WritingSignals from "./WritingSignals";

interface WritingPulsePanelProps {
  editor: Editor | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  grammarCards: GrammarSentenceCard[];
  selectedGrammarId: string | null;
  onSelectGrammarCard: (id: string | null) => void;
  onAcceptGrammarSuggestion: (id: string) => void;
}

/**
 * Editor metrics block — expand/collapse controlled by parent (for fixed-edge tabs).
 */
export default function WritingPulsePanel({
  editor,
  expanded,
  onExpandedChange,
  grammarCards,
  selectedGrammarId,
  onSelectGrammarCard,
  onAcceptGrammarSuggestion,
}: WritingPulsePanelProps) {
  if (!expanded) {
    return null;
  }

  return (
    <div className="writing-pulse-panel" data-onboard="editor-panel">
      <div className="writing-pulse-panel-header">
        <h2 className="writing-pulse-panel-title">Editor</h2>
        <button
          type="button"
          className="editor-orchestrator-collapse writing-pulse-panel-collapse"
          onClick={() => onExpandedChange(false)}
          aria-expanded
          aria-label="Collapse Editor"
          title="Hide Editor"
          data-onboard="editor-collapse"
        >
          ‹
        </button>
      </div>
      <WritingSignals
        editor={editor}
        grammarCards={grammarCards}
        selectedGrammarId={selectedGrammarId}
        onSelectGrammarCard={onSelectGrammarCard}
        onAcceptGrammarSuggestion={onAcceptGrammarSuggestion}
      />
    </div>
  );
}
