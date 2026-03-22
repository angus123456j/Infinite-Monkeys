import { useEffect, useRef, useState, useCallback } from "react";
import { listAgents, type AgentMeta } from "../lib/agents";
import { listContexts, type ContextItem } from "../lib/contexts";

interface OverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  selectedAgentId: string | null;
  onAgentChange: (agentId: string | null) => void;
  selectedContextIds: string[];
  onContextChange: (contextIds: string[]) => void;
}

function Overlay({
  isOpen,
  onClose,
  onSubmit,
  prompt,
  onPromptChange,
  selectedAgentId,
  onAgentChange,
  selectedContextIds,
  onContextChange,
}: OverlayProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [contextsLoaded, setContextsLoaded] = useState(false);

  const [contextError, setContextError] = useState<string | null>(null);

  // Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Fetch agents once when overlay first opens
  useEffect(() => {
    if (isOpen && !agentsLoaded) {
      listAgents()
        .then(setAgents)
        .catch(() => setAgents([]))
        .finally(() => setAgentsLoaded(true));
    }
    if (isOpen && !contextsLoaded) {
      listContexts()
        .then(setContexts)
        .catch(() => setContexts([]))
        .finally(() => setContextsLoaded(true));
    }
  }, [isOpen, agentsLoaded, contextsLoaded]);

  // Reset position to center when overlay opens
  useEffect(() => {
    if (isOpen) {
      setPosition(null);
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
    if (!overlayRef.current) return;
    e.preventDefault();

    const rect = overlayRef.current.getBoundingClientRect();
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    if (!position) {
      setPosition({ x: rect.left, y: rect.top });
    }
  }, [position]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isDragging.current) return;
      setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
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
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Handle clicks outside overlay to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = position
    ? { position: "fixed", top: position.y, left: position.x, zIndex: 1000 }
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1000 };

  return (
    <div ref={overlayRef} className="ai-overlay" style={overlayStyle}>
      <div className="ai-overlay-header" onMouseDown={handleMouseDown} style={{ cursor: "grab" }}>
        <span className="ai-overlay-title">Summon Infinite Monkeys</span>
        <button type="button" className="ai-overlay-close" onClick={onClose} title="Close (Esc)">
          ×
        </button>
      </div>
      <div className="ai-overlay-body">
        <div className="ai-overlay-agent-picker">
          <label className="ai-overlay-agent-label" htmlFor="agent-select">Monkey Agent</label>
          <select
            id="agent-select"
            className="ai-overlay-agent-select"
            value={selectedAgentId ?? ""}
            onChange={(e) => onAgentChange(e.target.value || null)}
          >
            <option value="">No agent (default)</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.role}
              </option>
            ))}
          </select>
        </div>
        <div className="ai-overlay-context-picker">
          <label className="ai-overlay-context-label" htmlFor="context-select">Context (up to 5)</label>
          <div className="ai-overlay-context-list" id="context-select" role="group" aria-label="Select contexts">
            {contexts.length === 0 ? (
              <div className="ai-overlay-context-empty">No contexts found.</div>
            ) : (
              contexts.map((c) => {
                const checked = selectedContextIds.includes(c.id);
                const disabled = !checked && selectedContextIds.length >= 5;
                return (
                  <label key={c.id} className={`ai-overlay-context-option${disabled ? " is-disabled" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => {
                        const has = selectedContextIds.includes(c.id);
                        if (has) {
                          setContextError(null);
                          onContextChange(selectedContextIds.filter((x) => x !== c.id));
                          return;
                        }
                        if (selectedContextIds.length >= 5) {
                          setContextError("You can select up to 5 contexts.");
                          return;
                        }
                        setContextError(null);
                        onContextChange([...selectedContextIds, c.id]);
                      }}
                    />
                    <span className="ai-overlay-context-option-title">{c.title}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
        {contextError && <div className="ai-overlay-context-error">{contextError}</div>}
        <textarea
          ref={inputRef}
          className="ai-overlay-input"
          placeholder="Tell the monkeys what to rewrite..."
          value={prompt}
          rows={1}
          onChange={(e) => {
            onPromptChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              (prompt.trim() || selectedAgentId)
            ) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>
      <div className="ai-overlay-footer">
        <button type="button" className="ai-overlay-btn ai-overlay-btn-reject" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="ai-overlay-btn ai-overlay-btn-accept"
          onClick={onSubmit}
          disabled={!prompt.trim() && !selectedAgentId}
        >
          Summon
        </button>
      </div>
    </div>
  );
}

export default Overlay;
