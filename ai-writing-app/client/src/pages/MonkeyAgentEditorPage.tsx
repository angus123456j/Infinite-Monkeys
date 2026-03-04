import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAgent, updateAgent, type AgentMeta } from "../lib/agents";

interface RouteParams {
  id: string;
}

export default function MonkeyAgentEditorPage() {
  const { id } = useParams<RouteParams>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<AgentMeta | null>(null);
  const [identity, setIdentity] = useState("");
  const [behavior, setBehavior] = useState("");
  const [constraints, setConstraints] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    const existing = getAgent(id);
    if (!existing) {
      // If we somehow cannot find the agent, send the user back to the Drive.
      navigate("/docs", { replace: true });
      return;
    }
    setAgent(existing);
    setIdentity(existing.identity ?? "");
    setBehavior(existing.behavior ?? "");
    setConstraints(existing.constraints ?? "");
  }, [id, navigate]);

  if (!id) {
    return null;
  }

  const handleSave = () => {
    if (!agent) return;
    setIsSaving(true);
    updateAgent(agent.id, {
      identity,
      behavior,
      constraints,
    });
    setIsSaving(false);
    setLastSavedAt(Date.now());
  };

  return (
    <div className="agent-editor-page">
      <header className="agent-editor-topbar">
        <div className="agent-editor-title-group">
          <button
            type="button"
            className="agent-editor-back"
            onClick={() => navigate("/docs")}
          >
            ← Back to Monkey Agents
          </button>
          <h1 className="agent-editor-title">
            {agent ? agent.name : "Monkey agent"}
          </h1>
        </div>
        <div className="agent-editor-actions">
          {lastSavedAt && (
            <span className="agent-editor-saved">
              Saved
            </span>
          )}
          <button
            type="button"
            className="agent-editor-save-btn"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <main className="agent-editor-body">
        <div className="agent-editor-body-inner">
          <div className="agent-doc-header">
            <span className="agent-doc-filename">Monkey Souls.md</span>
          </div>
          <section className="agent-section">
            <h2 className="agent-section-heading">Identity</h2>
            <p className="agent-section-hint">
              Who is this monkey? Voice, background, domain focus.
            </p>
            <textarea
              className="agent-section-textarea"
              placeholder={"e.g.\n- A meticulous research librarian monkey.\n- Speaks in concise, calm sentences."}
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
            />
          </section>

          <section className="agent-section">
            <h2 className="agent-section-heading">Behavior</h2>
            <p className="agent-section-hint">
              How should this monkey act when helping you?
            </p>
            <textarea
              className="agent-section-textarea"
              placeholder={"e.g.\n- Always proposes 3 options with pros and cons.\n- Asks clarifying questions before giving long answers."}
              value={behavior}
              onChange={(e) => setBehavior(e.target.value)}
            />
          </section>

          <section className="agent-section">
            <h2 className="agent-section-heading">Constraints</h2>
            <p className="agent-section-hint">
              What should this monkey avoid or strictly follow?
            </p>
            <textarea
              className="agent-section-textarea"
              placeholder={"e.g.\n- Never invent citations.\n- Keep responses under 400 words unless asked."}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

