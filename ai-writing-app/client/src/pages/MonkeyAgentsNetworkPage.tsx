import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import NeuralNetworkScene, { type NeuralNode } from "../components/NeuralNetworkScene";
import type { NeuralNetworkSceneHandle } from "../components/NeuralNetworkScene";
import { listAgents, searchAgents, type AgentMeta } from "../lib/agents";
import "./MonkeyAgentsNetworkPage.css";

export default function MonkeyAgentsNetworkPage() {
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightNodeIds, setHighlightNodeIds] = useState<string[]>([]);
  const sceneRef = useRef<NeuralNetworkSceneHandle>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAgents()
      .then((a) => {
        if (cancelled) return;
        setAgents(a);
      })
      .catch((e) => {
        if (cancelled) return;
        setAgents([]);
        setError(e instanceof Error ? e.message : "Failed to load agents");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nodes = useMemo<NeuralNode[]>(
    () => agents.map((a) => ({ id: a.id, name: a.name })),
    [agents]
  );

  const hoveredAgent = useMemo(
    () => (hoveredId ? agents.find((a) => a.id === hoveredId) ?? null : null),
    [agents, hoveredId]
  );

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setHighlightNodeIds([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      void searchAgents(q, 10)
        .then((matches) => {
          if (cancelled) return;
          setHighlightNodeIds(matches.map((m) => m.id));
        })
        .catch((e) => {
          if (cancelled) return;
          setHighlightNodeIds([]);
          setSearchError(e instanceof Error ? e.message : "Search failed");
        })
        .finally(() => {
          if (cancelled) return;
          setSearchLoading(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  return (
    <div className="monkey-agents-network-page">
      <header className="monkey-agents-network-header">
        <h1 className="monkey-agents-network-title">Monkey Agents Network</h1>
        <p className="monkey-agents-network-subtitle">
          Drag to pan • Scroll to zoom
        </p>
        <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem" }}>
          <Link
            to="/?section=desk"
            className="network-back-btn"
            aria-label="Back to desk view"
          >
            Back to desk
          </Link>
        <button
          type="button"
          className="network-reset-btn"
          onClick={() => sceneRef.current?.resetView()}
        >
          Free view
        </button>
        </div>
      </header>

      <NeuralNetworkScene
        ref={sceneRef}
        nodes={nodes}
        onHoverNode={setHoveredId}
        highlightNodeIds={highlightNodeIds}
      />

      {(loading || error || nodes.length === 0) && (
        <aside className="network-overlay-panel" style={{ pointerEvents: "auto" }}>
          <h2 className="network-overlay-panel-title">
            {loading ? "Loading agents…" : error ? "Couldn’t load agents" : "No agents found"}
          </h2>
          <div className="network-overlay-panel-divider" />
          <p className="network-overlay-panel-text">
            {loading
              ? "Summoning monkeys into the network."
              : error
                ? `Error: ${error}\n\nMake sure the server is running on http://localhost:3001 (or set VITE_API_URL), then refresh.`
                : "Your agent list is empty. Create agents in the Drive (Agents tab) or restart the server to sync markdown agents."}
          </p>
          <div style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="network-reset-btn"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </aside>
      )}

      {hoveredAgent && (
        <aside className="network-overlay-panel">
          <h2 className="network-overlay-panel-title">{hoveredAgent.name}</h2>
          <div className="network-overlay-panel-divider" />
          <p className="network-overlay-panel-text" style={{ whiteSpace: "pre-wrap" }}>
            {[
              hoveredAgent.role ? `Role: ${hoveredAgent.role}` : "",
              hoveredAgent.strengths ? `\nStrengths:\n${hoveredAgent.strengths}` : "",
              hoveredAgent.identity ? `\nIdentity:\n${hoveredAgent.identity}` : "",
              hoveredAgent.behavior ? `\nBehavior:\n${hoveredAgent.behavior}` : "",
              hoveredAgent.constraints ? `\nConstraints:\n${hoveredAgent.constraints}` : "",
            ]
              .filter(Boolean)
              .join("\n")}
          </p>
        </aside>
      )}

      <div className="network-search-panel" role="search" aria-label="Search monkeys">
        <label className="network-search-label" htmlFor="monkey-network-search">
          Search monkeys
        </label>
        <input
          id="monkey-network-search"
          className="network-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="e.g. synonym, continuity, dialogue, hype…"
        />
        <div className="network-search-meta" aria-live="polite">
          {searchQuery.trim() ? (
            searchLoading ? (
              "Searching…"
            ) : searchError ? (
              `Search error: ${searchError}`
            ) : highlightNodeIds.length ? (
              `${highlightNodeIds.length} match${highlightNodeIds.length === 1 ? "" : "es"}`
            ) : (
              "No strong matches"
            )
          ) : (
            "Type to highlight nodes"
          )}
        </div>
      </div>
    </div>
  );
}
