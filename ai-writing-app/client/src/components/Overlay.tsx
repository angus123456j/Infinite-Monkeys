import { useEffect, useRef } from "react";

interface OverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
}

function Overlay({
  isOpen,
  onClose,
  onSubmit,
  prompt,
  onPromptChange,
}: OverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Handle clicks outside overlay to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        overlayRef.current &&
        !overlayRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    // Small delay to avoid closing immediately when opening
    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="ai-overlay"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
      }}
    >
      <div className="ai-overlay-header">
        <span className="ai-overlay-title">Summon Infinite Monkeys</span>
        <button
          type="button"
          className="ai-overlay-close"
          onClick={onClose}
          title="Close (Esc)"
        >
          ×
        </button>
      </div>
      <div className="ai-overlay-body">
        <input
          ref={inputRef}
          type="text"
          className="ai-overlay-input"
          placeholder="Tell the monkeys what to rewrite..."
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && prompt.trim()) {
              onSubmit();
            }
          }}
        />
      </div>
      <div className="ai-overlay-footer">
        <button
          type="button"
          className="ai-overlay-btn ai-overlay-btn-reject"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ai-overlay-btn ai-overlay-btn-accept"
          onClick={onSubmit}
          disabled={!prompt.trim()}
        >
          Summon
        </button>
      </div>
    </div>
  );
}

export default Overlay;
