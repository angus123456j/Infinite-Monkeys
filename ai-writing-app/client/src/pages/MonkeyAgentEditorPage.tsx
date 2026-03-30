import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { archetypeDescription, getAgent, updateAgent, type AgentMeta } from "../lib/agents";

const SAVE_DEBOUNCE_MS = 1500;
const PERIODIC_SAVE_MS = 30_000;

export default function MonkeyAgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<AgentMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState("");
  const [behavior, setBehavior] = useState("");
  const [constraints, setConstraints] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const dirtyRef = useRef(false);
  const latestRef = useRef({ identity: "", behavior: "", constraints: "" });

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getAgent(id)
      .then((existing) => {
        if (!existing) {
          navigate("/docs?drive=agents", { replace: true });
          return;
        }
        setAgent(existing);
        setIdentity(existing.identity ?? "");
        setBehavior(existing.behavior ?? "");
        setConstraints(existing.constraints ?? "");
        latestRef.current = {
          identity: existing.identity ?? "",
          behavior: existing.behavior ?? "",
          constraints: existing.constraints ?? "",
        };
        setLoading(false);
      })
      .catch(() => {
        navigate("/docs?drive=agents", { replace: true });
      });
  }, [id, navigate]);

  const flush = useCallback(() => {
    if (!dirtyRef.current || !id) return;
    dirtyRef.current = false;
    const { identity: i, behavior: b, constraints: c } = latestRef.current;
    void updateAgent(id, { identity: i, behavior: b, constraints: c });
    setSaveStatus("saved");
  }, [id]);

  // Debounced + periodic + visibility/beforeunload auto-save
  useEffect(() => {
    if (!id) return;
    let debounceTimer: number | undefined;
    let periodicTimer: number | undefined;

    const scheduleSave = () => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    };

    const onVisChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onUnload = () => flush();

    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("beforeunload", onUnload);
    periodicTimer = window.setInterval(flush, PERIODIC_SAVE_MS);

    // Expose scheduleSave so field handlers can trigger it
    scheduleRef.current = scheduleSave;

    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("beforeunload", onUnload);
      if (debounceTimer != null) clearTimeout(debounceTimer);
      if (periodicTimer != null) clearInterval(periodicTimer);
      flush();
    };
  }, [id, flush]);

  const scheduleRef = useRef<(() => void) | null>(null);

  const handleFieldChange = useCallback(
    (field: "identity" | "behavior" | "constraints", value: string) => {
      latestRef.current[field] = value;
      dirtyRef.current = true;
      setSaveStatus("idle");
      if (field === "identity") setIdentity(value);
      else if (field === "behavior") setBehavior(value);
      else setConstraints(value);
      scheduleRef.current?.();
    },
    []
  );

  if (!id || loading) {
    return (
      <div className="agent-editor-page">
        <div style={{ padding: "2rem", textAlign: "center" }}>Loading agent…</div>
      </div>
    );
  }

  return (
    <div className="agent-editor-page">
      <header className="agent-editor-topbar">
        <div className="agent-editor-title-group">
          <button
            type="button"
            className="agent-editor-back"
            onClick={() => navigate("/docs?drive=agents")}
          >
            ← Back to Monkey Agents
          </button>
          <h1 className="agent-editor-title">
            {agent ? agent.name : "Monkey agent"}
          </h1>
        </div>
        <div className="agent-editor-actions">
          {saveStatus === "saved" && (
            <span className="agent-editor-saved">
              Saved
            </span>
          )}
        </div>
      </header>

      <main className="agent-editor-body">
        <div className="agent-editor-body-inner">
          <div className="agent-doc-header">
            <span className="agent-doc-filename">Monkey Souls.md</span>
          </div>
          <section className="agent-section">
            <h2 className="agent-section-heading">Archetype</h2>
            <p className="agent-section-hint">
              <strong>{agent?.role ?? "Specialist"}</strong> -{" "}
              {archetypeDescription(agent?.role ?? "Specialist")}
            </p>
          </section>

          <section className="agent-section">
            <h2 className="agent-section-heading">Identity</h2>
            <p className="agent-section-hint">
              Who is this monkey? Voice, background, domain focus.
            </p>
            <textarea
              className="agent-section-textarea"
              placeholder={"e.g.\n- A meticulous research librarian monkey.\n- Speaks in concise, calm sentences."}
              value={identity}
              onChange={(e) => handleFieldChange("identity", e.target.value)}
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
              onChange={(e) => handleFieldChange("behavior", e.target.value)}
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
              onChange={(e) => handleFieldChange("constraints", e.target.value)}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

