interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

const SHORTCUTS: { category: string; keys: { keys: string; desc: string }[] }[] = [
  {
    category: "Editing",
    keys: [
      { keys: "Ctrl+Z", desc: "Undo" },
      { keys: "Ctrl+Shift+Z", desc: "Redo" },
      { keys: "Ctrl+X", desc: "Cut" },
      { keys: "Ctrl+C", desc: "Copy" },
      { keys: "Ctrl+V", desc: "Paste" },
      { keys: "Ctrl+A", desc: "Select all" },
      { keys: "Ctrl+K", desc: "Open rewrite overlay (with selection)" },
    ],
  },
  {
    category: "Formatting",
    keys: [
      { keys: "Ctrl+B", desc: "Bold" },
      { keys: "Ctrl+I", desc: "Italic" },
      { keys: "Ctrl+U", desc: "Underline" },
    ],
  },
  {
    category: "Document",
    keys: [
      { keys: "Ctrl+S", desc: "Save (auto-save is on)" },
      { keys: "Ctrl+P", desc: "Print" },
    ],
  },
];

export default function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-label="Keyboard shortcuts">
      <div className="modal shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Keyboard shortcuts</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {SHORTCUTS.map(({ category, keys }) => (
            <div key={category} className="shortcuts-category">
              <h3 className="shortcuts-category-title">{category}</h3>
              <table className="shortcuts-table">
                <tbody>
                  {keys.map(({ keys: k, desc }) => (
                    <tr key={k}>
                      <td className="shortcuts-keys">{k}</td>
                      <td className="shortcuts-desc">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
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
