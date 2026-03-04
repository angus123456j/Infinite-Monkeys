import { useEffect, useRef, useState, useCallback } from "react";

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Reset position to center when overlay opens
  useEffect(() => {
    if (isOpen) {
      setPosition(null); // null = centered via CSS
    }
  }, [isOpen]);

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag from the header
    if (!overlayRef.current) return;
    e.preventDefault();

    const rect = overlayRef.current.getBoundingClientRect();
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // If starting from centered position, initialize actual pixel position
    if (!position) {
      setPosition({ x: rect.left, y: rect.top });
    }
  }, [position]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isDragging.current) return;

      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
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

  // When position is null, use centered CSS; otherwise use dragged pixel position
  const overlayStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 1000,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
      };

  return (
    <div
      ref={overlayRef}
      className="ai-overlay"
      style={overlayStyle}
    >
      <div
        className="ai-overlay-header"
        onMouseDown={handleMouseDown}
        style={{ cursor: "grab" }}
      >
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
        <textarea
          ref={inputRef}
          className="ai-overlay-input"
          placeholder="Tell the monkeys what to rewrite..."
          value={prompt}
          rows={1}
          onChange={(e) => {
            onPromptChange(e.target.value);
            // Auto-resize: reset height then set to scrollHeight
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
              e.preventDefault();
              onSubmit();
            }
            // Shift+Enter naturally inserts a newline in textarea
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
