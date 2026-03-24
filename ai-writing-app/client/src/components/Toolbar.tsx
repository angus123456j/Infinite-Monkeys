import { useState, useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import ColorPicker from "./ColorPicker";
import Guide from "./Guide";

const FONT_FAMILIES = [
  "Arial",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Verdana",
  "Garamond",
  "Comic Sans MS",
  "Trebuchet MS",
  "Palatino",
  "Impact",
];

/** Prevent toolbar buttons from stealing editor focus */
const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault();

interface ToolbarProps {
  editor: Editor | null;
  llmProvider: "auto" | "gemini" | "deepseek";
  onLlmProviderChange: (value: "auto" | "gemini" | "deepseek") => void;
}

function Toolbar({ editor, llmProvider, onLlmProviderChange }: ToolbarProps) {
  const [editingFontSize, setEditingFontSize] = useState<string | null>(null);
  const [pendingFontSize, setPendingFontSize] = useState<number | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "forest" | "blue" | "pink">(() => {
    return (localStorage.getItem("theme") as "light" | "dark" | "forest" | "blue" | "pink") || "light";
  });


  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Reset pending size when editor content/selection changes
  const clearPending = useCallback(() => setPendingFontSize(null), []);
  if (editor) {
    // Safe: Tiptap deduplicates listeners by reference via useCallback
    editor.on("selectionUpdate", clearPending);
    editor.on("update", clearPending);
  }

  if (!editor) return null;

  // Current states from editor
  const textStyleAttrs = editor.getAttributes("textStyle");
  const currentFontFamily = (textStyleAttrs.fontFamily as string) || "Arial";
  const currentFontSizeRaw = textStyleAttrs.fontSize as string | undefined;
  const editorFontSize = currentFontSizeRaw ? parseInt(currentFontSizeRaw) : 11;
  const currentFontSize = pendingFontSize ?? editorFontSize;
  const currentTextColor = (textStyleAttrs.color as string) || "#000000";
  const currentHighlight = editor.getAttributes("highlight").color as string | undefined;

  // Paragraph style
  const currentStyle = editor.isActive("heading", { level: 1 })
    ? "heading1"
    : editor.isActive("heading", { level: 2 })
      ? "heading2"
      : editor.isActive("heading", { level: 3 })
        ? "heading3"
        : "paragraph";

  // Font size handlers
  function applyFontSize(size: number) {
    if (size > 0 && size <= 400) {
      editor!.chain().focus().setFontSize(`${size}pt`).run();
      setPendingFontSize(size);
    }
  }

  function decreaseFontSize() {
    if (currentFontSize > 1) applyFontSize(currentFontSize - 1);
  }

  function increaseFontSize() {
    if (currentFontSize < 400) applyFontSize(currentFontSize + 1);
  }

  return (
    <div className="toolbar">
      {/* Undo / Redo */}
      <button
        type="button"
        className="toolbar-btn"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Cmd+Z)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button
        type="button"
        className="toolbar-btn"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Cmd+Shift+Z)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
        </svg>
      </button>

      <span className="toolbar-divider" />

      {/* Paragraph style */}
      <select
        className="toolbar-select style-select"
        value={currentStyle}
        onChange={(e) => {
          const value = e.target.value;
          if (value === "paragraph") {
            editor.chain().focus().setParagraph().run();
          } else if (value === "heading1") {
            editor.chain().focus().toggleHeading({ level: 1 }).run();
          } else if (value === "heading2") {
            editor.chain().focus().toggleHeading({ level: 2 }).run();
          } else if (value === "heading3") {
            editor.chain().focus().toggleHeading({ level: 3 }).run();
          }
        }}
      >
        <option value="paragraph">Normal text</option>
        <option value="heading1">Heading 1</option>
        <option value="heading2">Heading 2</option>
        <option value="heading3">Heading 3</option>
      </select>

      <span className="toolbar-divider" />

      {/* Font family */}
      <select
        className="toolbar-select font-select"
        value={currentFontFamily}
        style={{ fontFamily: currentFontFamily }}
        onChange={(e) => {
          editor.chain().focus().setFontFamily(e.target.value).run();
        }}
      >
        {FONT_FAMILIES.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>

      <span className="toolbar-divider" />

      {/* Font size */}
      <div className="font-size-control">
        <button
          type="button"
          className="toolbar-btn font-size-btn"
          onMouseDown={preventFocusLoss}
          onClick={decreaseFontSize}
          title="Decrease font size"
        >
          &minus;
        </button>
        <input
          className="font-size-input"
          value={editingFontSize ?? String(currentFontSize)}
          onChange={(e) => setEditingFontSize(e.target.value)}
          onFocus={() => setEditingFontSize(String(currentFontSize))}
          onBlur={() => {
            if (editingFontSize !== null) {
              const size = parseInt(editingFontSize);
              if (!isNaN(size)) applyFontSize(size);
              setEditingFontSize(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="toolbar-btn font-size-btn"
          onMouseDown={preventFocusLoss}
          onClick={increaseFontSize}
          title="Increase font size"
        >
          +
        </button>
      </div>

      <span className="toolbar-divider" />

      {/* Bold / Italic / Underline */}
      <button
        type="button"
        className={`toolbar-btn bold-btn${editor.isActive("bold") ? " is-active" : ""}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Cmd+B)"
      >
        B
      </button>
      <button
        type="button"
        className={`toolbar-btn italic-btn${editor.isActive("italic") ? " is-active" : ""}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Cmd+I)"
      >
        I
      </button>
      <button
        type="button"
        className={`toolbar-btn underline-btn${editor.isActive("underline") ? " is-active" : ""}`}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Cmd+U)"
      >
        U
      </button>

      <span className="toolbar-divider" />

      {/* Text color */}
      <ColorPicker
        activeColor={currentTextColor}
        onSelect={(color) => editor.chain().focus().setColor(color).run()}
        onRemove={() => editor.chain().focus().unsetColor().run()}
        title="Text color"
      >
        <span className="text-color-indicator">
          <span className="text-color-letter">A</span>
          <span className="color-bar" style={{ backgroundColor: currentTextColor }} />
        </span>
      </ColorPicker>

      {/* Highlight color */}
      <ColorPicker
        activeColor={currentHighlight}
        onSelect={(color) => editor.chain().focus().setHighlight({ color }).run()}
        onRemove={() => editor.chain().focus().unsetHighlight().run()}
        title="Highlight color"
      >
        <span className="highlight-color-indicator">
          <span
            className="highlight-color-letter"
            style={{ backgroundColor: currentHighlight || "#feff00" }}
          >
            A
          </span>
          <span className="color-bar" style={{ backgroundColor: currentHighlight || "#feff00" }} />
        </span>
      </ColorPicker>

      <span className="toolbar-divider" />

      {/* Bullet list */}
      <button
        type="button"
        className={`toolbar-btn${editor.isActive("bulletList") ? " is-active" : ""}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="9" y1="6" x2="21" y2="6" />
          <line x1="9" y1="12" x2="21" y2="12" />
          <line x1="9" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {/* Ordered list */}
      <button
        type="button"
        className={`toolbar-btn${editor.isActive("orderedList") ? " is-active" : ""}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="9" y="5" width="12" height="2" rx="0.5" />
          <rect x="9" y="11" width="12" height="2" rx="0.5" />
          <rect x="9" y="17" width="12" height="2" rx="0.5" />
          <text x="1" y="8" fontSize="7.5" fontFamily="Arial" fontWeight="600">1.</text>
          <text x="1" y="14" fontSize="7.5" fontFamily="Arial" fontWeight="600">2.</text>
          <text x="1" y="20" fontSize="7.5" fontFamily="Arial" fontWeight="600">3.</text>
        </svg>
      </button>

      <div className="toolbar-spacer" />

      <div className="toolbar-api-picker" aria-label="Rewrite API control">
        <span className="toolbar-api-picker-label">Rewrite API</span>
        <select
          className="toolbar-api-picker-select"
          value={llmProvider}
          onChange={(e) =>
            onLlmProviderChange(e.target.value as "auto" | "gemini" | "deepseek")
          }
        >
          <option value="auto">Auto</option>
          <option value="gemini">Gemini</option>
          <option value="deepseek">DeepSeek</option>
        </select>
      </div>

      {/* Guide */}
      <button
        type="button"
        className="toolbar-btn guide-btn"
        onClick={() => setIsGuideOpen(true)}
        title="How to use Infinite Monkeys"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="guide-btn-label">Guide</span>
      </button>

      {/* Theme picker — three options side by side */}
      <div className="theme-picker" role="group" aria-label="Theme">
        <button
          type="button"
          className={`toolbar-btn theme-picker-btn${theme === "light" ? " is-active" : ""}`}
          onClick={() => setTheme("light")}
          title="Light theme"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </button>
        <button
          type="button"
          className={`toolbar-btn theme-picker-btn${theme === "dark" ? " is-active" : ""}`}
          onClick={() => setTheme("dark")}
          title="Dark theme"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
        <button
          type="button"
          className={`toolbar-btn theme-picker-btn${theme === "forest" ? " is-active" : ""}`}
          onClick={() => setTheme("forest")}
          title="Forest theme"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22V12" />
            <path d="M12 12C12 12 7 8 7 5a5 5 0 0 1 10 0c0 3-5 7-5 7z" />
            <path d="M7 22h10" />
          </svg>
        </button>
        <button
          type="button"
          className={`toolbar-btn theme-picker-btn${theme === "blue" ? " is-active" : ""}`}
          onClick={() => setTheme("blue")}
          title="Dark blue theme"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />
          </svg>
        </button>
        <button
          type="button"
          className={`toolbar-btn theme-picker-btn${theme === "pink" ? " is-active" : ""}`}
          onClick={() => setTheme("pink")}
          title="Light pink theme"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      <Guide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}

export default Toolbar;
