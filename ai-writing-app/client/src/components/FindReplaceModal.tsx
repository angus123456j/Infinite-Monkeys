import { useState, useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/react";

interface FindReplaceModalProps {
  editor: Editor | null;
  onClose: () => void;
}

export default function FindReplaceModal({ editor, onClose }: FindReplaceModalProps) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState<number[]>([]);

  const getFlattenedText = useCallback((ed: Editor) => {
    return ed.state.doc.textBetween(0, ed.state.doc.content.size, " ");
  }, []);

  const updateMatches = useCallback(() => {
    if (!editor || !find.trim()) {
      setMatches([]);
      setIndex(0);
      return;
    }
    const text = getFlattenedText(editor);
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const list: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) list.push(m.index);
    setMatches(list);
    setIndex(0);
  }, [editor, find, getFlattenedText]);

  useEffect(() => {
    updateMatches();
  }, [updateMatches]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const findNext = () => {
    if (!editor || !find.trim() || matches.length === 0) return;
    const targetCharIndex = matches[index % matches.length];
    if (targetCharIndex == null) return;
    const doc = editor.state.doc;
    let charCount = 0;
    let from = -1;
    let lastWasBlock = false;
    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        if (lastWasBlock) charCount += 1;
        lastWasBlock = false;
        const start = charCount;
        charCount += node.text.length;
        if (targetCharIndex >= start && targetCharIndex + find.length <= charCount) {
          const offset = targetCharIndex - start;
          from = pos + offset;
          return false;
        }
      } else if (node.isBlock) {
        lastWasBlock = true;
      }
    });
    if (from >= 0) {
      editor.commands.setTextSelection({ from, to: from + find.length });
      editor.commands.scrollIntoView();
    }
    setIndex((index + 1) % matches.length);
  };

  const replaceOne = () => {
    if (!editor || !find) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, "");
    if (selected.toLowerCase() === find.toLowerCase()) {
      editor.chain().focus().insertContentAt({ from, to }, replace).run();
      updateMatches();
    }
    findNext();
  };

  const replaceAll = () => {
    if (!editor || !find) return;
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    const newText = text.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), replace);
    editor.chain().focus().setContent(newText).run();
    setMatches([]);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-label="Find and replace">
      <div className="modal find-replace-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Find and replace</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label htmlFor="find-input">Find</label>
            <input
              id="find-input"
              type="text"
              className="modal-input"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findNext()}
              placeholder="Search document"
            />
          </div>
          <div className="form-row">
            <label htmlFor="replace-input">Replace with</label>
            <input
              id="replace-input"
              type="text"
              className="modal-input"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && replaceOne()}
              placeholder="Replace with"
            />
          </div>
          {find && (
            <p className="find-replace-count">
              {matches.length} {matches.length === 1 ? "match" : "matches"}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={findNext} disabled={!find || matches.length === 0}>
            Find next
          </button>
          <button type="button" className="btn" onClick={replaceOne} disabled={!editor || !find}>
            Replace
          </button>
          <button type="button" className="btn" onClick={replaceAll} disabled={!editor || !find}>
            Replace all
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
