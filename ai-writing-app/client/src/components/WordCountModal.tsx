import type { Editor } from "@tiptap/react";

interface WordCountModalProps {
  editor: Editor | null;
  onClose: () => void;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function countChars(text: string): number {
  return text.length;
}

function countCharsNoSpaces(text: string): number {
  return text.replace(/\s/g, "").length;
}

export default function WordCountModal({ editor, onClose }: WordCountModalProps) {
  const text = editor?.state.doc.textBetween(0, editor.state.doc.content.size, " ") ?? "";
  const words = countWords(text);
  const chars = countChars(text);
  const charsNoSpaces = countCharsNoSpaces(text);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-label="Word count">
      <div className="modal word-count-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Word count</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <table className="word-count-table">
            <tbody>
              <tr>
                <td>Words</td>
                <td>{words.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Characters (with spaces)</td>
                <td>{chars.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Characters (no spaces)</td>
                <td>{charsNoSpaces.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
