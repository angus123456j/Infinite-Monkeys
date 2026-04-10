import { useState, useRef, useEffect } from "react";
import { useEditorContext } from "../contexts/EditorContext";

const MENU_ITEMS = ["Edit", "Tools"] as const;

type MenuKey = (typeof MENU_ITEMS)[number];

interface MenuOption {
  label: string;
  action: string;
}

const MENU_OPTIONS: Record<MenuKey, MenuOption[]> = {
  Edit: [
    { label: "Undo", action: "edit.undo" },
    { label: "Redo", action: "edit.redo" },
    { label: "Cut", action: "edit.cut" },
    { label: "Copy", action: "edit.copy" },
    { label: "Paste", action: "edit.paste" },
    { label: "Find and replace", action: "edit.findReplace" },
    { label: "Select all", action: "edit.selectAll" },
  ],
  Tools: [
    { label: "Spelling and grammar", action: "tools.spelling" },
    { label: "Word count", action: "tools.wordCount" },
    { label: "Voice typing", action: "tools.voice" },
    { label: "Translate document", action: "tools.translate" },
    { label: "Preferences", action: "tools.prefs" },
  ],
};

export interface DocMenuBarCallbacks {
  onOpenFindReplace?: () => void;
  onOpenWordCount?: () => void;
  onOpenKeyboardShortcuts?: () => void;
  onDownload?: (html: string) => void;
}

export default function DocMenuBar(callbacks: DocMenuBarCallbacks = {}) {
  const { onOpenFindReplace, onOpenWordCount } = callbacks;
  const editor = useEditorContext();
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openMenu === null) return;
    const el = itemRefs.current[openMenu];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom, left: rect.left });
  }, [openMenu]);

  useEffect(() => {
    if (openMenu === null) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current?.contains(target) ||
        Object.values(itemRefs.current).some((node) => node?.contains(target))
      ) {
        return;
      }
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu]);

  const runAction = (action: string) => {
    setOpenMenu(null);

    if (action === "edit.undo" && editor) editor.chain().focus().undo().run();
    else if (action === "edit.redo" && editor) editor.chain().focus().redo().run();
    else if (action === "edit.cut") document.execCommand("cut");
    else if (action === "edit.copy") document.execCommand("copy");
    else if (action === "edit.paste") document.execCommand("paste");
    else if (action === "edit.findReplace") onOpenFindReplace?.();
    else if (action === "edit.selectAll" && editor) editor.chain().focus().selectAll().run();

    else if (action === "tools.wordCount") onOpenWordCount?.();
  };

  return (
    <>
      <div className="menu-bar">
        {MENU_ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            ref={(el) => {
              itemRefs.current[item] = el;
            }}
            className={`menu-item${openMenu === item ? " menu-item-open" : ""}`}
            onClick={() => setOpenMenu(openMenu === item ? null : item)}
            aria-haspopup="menu"
            aria-expanded={openMenu === item}
          >
            {item}
          </button>
        ))}
      </div>
      {openMenu !== null && menuPosition && (
        <div
          ref={dropdownRef}
          className="menu-dropdown"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          role="menu"
        >
          {MENU_OPTIONS[openMenu].map(({ label, action }) => (
            <button
              key={action}
              type="button"
              className="menu-dropdown-item"
              role="menuitem"
              onClick={() => runAction(action)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
