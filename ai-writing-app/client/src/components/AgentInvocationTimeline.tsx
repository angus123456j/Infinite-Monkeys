import { useCallback, useState } from "react";

export interface AgentInvocationLogEntry {
  id: number;
  at: number;
  agentId: string | null;
  agentName: string;
  contextLabels: string[];
  userPrompt: string;
  apiPromptSent: string;
  originalText: string;
  response: string | null;
  error: string | null;
  status: "loading" | "done" | "error";
}

interface AgentInvocationTimelineProps {
  entries: AgentInvocationLogEntry[];
  onCollapse?: () => void;
}

const TIMELINE_TITLE = "Monkey timeline";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AgentInvocationTimeline({
  entries,
  onCollapse,
}: AgentInvocationTimelineProps) {
  // Note: we intentionally key expansion by row index (not entry.id).
  // Entry IDs can collide (e.g. older sessions or mixed counters), and using index
  // guarantees a click only expands the exact row the user clicked.
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const toggleOpen = useCallback((idx: number) => {
    setOpenIdx((prev) => (prev === idx ? null : idx));
  }, []);

  return (
    <aside className="agent-invocation-timeline" aria-label="Monkey timeline">
      <div className="agent-invocation-timeline-inner">
        <div className="agent-invocation-timeline-header">
          <div className="agent-invocation-timeline-header-main">
            <h3 className="agent-invocation-timeline-heading">{TIMELINE_TITLE}</h3>
            <p className="agent-invocation-timeline-hint">
              Click a milestone to expand it.
            </p>
          </div>
          {onCollapse ? (
            <button
              type="button"
              className="agent-invocation-timeline-collapse"
              onClick={onCollapse}
              aria-label="Hide Monkey timeline"
              title="Hide timeline"
            >
              ›
            </button>
          ) : null}
        </div>

        {entries.length === 0 ? null : (
          <ol className="agent-invocation-timeline-list">
          {entries.map((e, idx) => (
            <li
              key={`${e.id}-${e.at}-${idx}`}
              className="agent-invocation-timeline-item"
            >
              <button
                type="button"
                className="agent-invocation-timeline-item-head"
                onClick={() => toggleOpen(idx)}
                aria-expanded={openIdx === idx}
                aria-controls={`agent-invocation-details-${idx}`}
              >
                <div className="agent-invocation-timeline-connector">
                  <span className="agent-invocation-dash" aria-hidden />
                  <span className="agent-invocation-dot-wrap">
                    <span
                      className={`agent-invocation-dot agent-invocation-dot--${e.status}`}
                      aria-hidden
                    />
                  </span>
                </div>
                <span className="agent-invocation-timeline-meta">
                  <span className="agent-invocation-timeline-time">
                    {formatTime(e.at)}
                  </span>
                  <span className="agent-invocation-timeline-agent">
                    {e.agentName}
                  </span>
                </span>
              </button>
              {openIdx === idx && (
                <div
                  id={`agent-invocation-details-${idx}`}
                  className="agent-invocation-popover"
                >
                  <div className="agent-invocation-popover-section">
                    <span className="agent-invocation-popover-label">Agent</span>
                    <p className="agent-invocation-popover-value">{e.agentName}</p>
                  </div>
                  <div className="agent-invocation-popover-section">
                    <span className="agent-invocation-popover-label">Context</span>
                    <p className="agent-invocation-popover-value">
                      {e.contextLabels.length
                        ? e.contextLabels.join(" · ")
                        : "—"}
                    </p>
                  </div>
                  <div className="agent-invocation-popover-section">
                    <span className="agent-invocation-popover-label">
                      Instruction sent
                    </span>
                    <p className="agent-invocation-popover-value agent-invocation-popover-pre">
                      {e.apiPromptSent.trim()
                        ? e.apiPromptSent
                        : "(empty — default instruction used)"}
                    </p>
                  </div>
                  <div className="agent-invocation-popover-section">
                    <span className="agent-invocation-popover-label">Highlighted</span>
                    <p className="agent-invocation-popover-value agent-invocation-popover-pre">
                      {e.originalText || "—"}
                    </p>
                  </div>
                  <div className="agent-invocation-popover-section">
                    <span className="agent-invocation-popover-label">Returned</span>
                    {e.status === "loading" && (
                      <p className="agent-invocation-popover-value agent-invocation-popover-muted">
                        Loading…
                      </p>
                    )}
                    {e.status === "error" && (
                      <p className="agent-invocation-popover-value agent-invocation-popover-error">
                        {e.error ?? "Error"}
                      </p>
                    )}
                    {e.status === "done" && e.response != null && (
                      <p className="agent-invocation-popover-value agent-invocation-popover-pre">
                        {e.response}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
