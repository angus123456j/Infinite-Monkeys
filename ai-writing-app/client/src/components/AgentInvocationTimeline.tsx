import { useCallback, useRef, useState } from "react";

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
}: AgentInvocationTimelineProps) {
  const [openId, setOpenId] = useState<number | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeave = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const handleEnter = useCallback(
    (id: number) => {
      clearLeave();
      setOpenId(id);
    },
    [clearLeave]
  );

  const handleLeave = useCallback(() => {
    clearLeave();
    leaveTimer.current = setTimeout(() => setOpenId(null), 180);
  }, [clearLeave]);

  if (entries.length === 0) {
    return (
      <aside className="agent-invocation-timeline" aria-label="Monkey timeline">
        <div className="agent-invocation-timeline-inner">
          <h3 className="agent-invocation-timeline-heading">{TIMELINE_TITLE}</h3>
        </div>
      </aside>
    );
  }

  return (
    <aside className="agent-invocation-timeline" aria-label="Monkey timeline">
      <div className="agent-invocation-timeline-inner">
        <h3 className="agent-invocation-timeline-heading">{TIMELINE_TITLE}</h3>
        <ol className="agent-invocation-timeline-list">
          {entries.map((e) => (
            <li
              key={e.id}
              className="agent-invocation-timeline-item"
              onMouseEnter={() => handleEnter(e.id)}
              onMouseLeave={handleLeave}
            >
              <div className="agent-invocation-timeline-item-head">
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
              </div>
              {openId === e.id && (
                <div
                  className="agent-invocation-popover"
                  onMouseEnter={() => handleEnter(e.id)}
                  onMouseLeave={handleLeave}
                  role="tooltip"
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
      </div>
    </aside>
  );
}
