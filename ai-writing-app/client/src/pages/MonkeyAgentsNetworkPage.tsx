import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import NeuralNetworkScene, {
  CLUSTER_SPHERE_COLORS,
  type NeuralNetworkSceneHandle,
  type NeuralNode,
} from "../components/NeuralNetworkScene";
import { agentsToFeatureMatrix } from "../lib/agentSemanticEmbedding";
import { computeClusterTitles } from "../lib/clusterLabels";
import { layoutClusteredNodes } from "../lib/clusterLayout";
import { kMeans } from "../lib/kmeans";
import { listAgents, searchAgents, type AgentMeta } from "../lib/agents";
import "./MonkeyAgentsNetworkPage.css";

/** Heuristic K (sqrt-ish), capped so the legend stays readable. */
function automaticClusterCount(agentCount: number): number {
  if (agentCount < 2) return 2;
  return Math.min(12, Math.max(2, Math.round(Math.sqrt(agentCount))));
}

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

  const clustered = useMemo(() => {
    if (agents.length < 2) return null;
    const k = Math.min(automaticClusterCount(agents.length), agents.length);
    const matrix = agentsToFeatureMatrix(agents);
    const { assignments } = kMeans(matrix, k, {
      seed: 42,
      maxIter: 100,
      init: "kmeans++",
    });
    const positions = layoutClusteredNodes(assignments, k);
    const clusterTitles = computeClusterTitles(agents, assignments, k);
    const neuralNodes: NeuralNode[] = agents.map((a, i) => ({
      id: a.id,
      name: a.name,
      clusterId: assignments[i],
    }));
    return { assignments, positions, neuralNodes, clusterTitles };
  }, [agents]);

  const nodes = useMemo<NeuralNode[]>(() => {
    if (clustered) return clustered.neuralNodes;
    return agents.map((a) => ({ id: a.id, name: a.name }));
  }, [agents, clustered]);

  const clusterPositions = clustered?.positions;
  const edgeMode = clustered ? "cluster" : "global";

  const clusterLegend = useMemo(() => {
    if (!clustered) return [];
    const byCluster = new Map<number, string[]>();
    agents.forEach((a, i) => {
      const c = clustered.assignments[i] ?? 0;
      const list = byCluster.get(c) ?? [];
      list.push(a.name);
      byCluster.set(c, list);
    });
    return [...byCluster.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, names]) => ({
        id,
        title: clustered.clusterTitles.get(id) ?? `Group ${id + 1}`,
        preview: names.slice(0, 4).join(", ") + (names.length > 4 ? "…" : ""),
      }));
  }, [agents, clustered]);

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
            to="/"
            state={{ skipIntro: true }}
            className="network-back-btn"
            aria-label="Back to home"
          >
            Back to home
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
        positions={clusterPositions}
        edgeMode={edgeMode}
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
              hoveredAgent.role ? `Archetype: ${hoveredAgent.role}` : "",
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

      {clusterLegend.length > 0 && (
        <aside className="network-cluster-legend" aria-label="Cluster legend">
          <div className="network-cluster-legend-title">Clusters</div>
          <ul className="network-cluster-legend-list">
            {clusterLegend.map((row) => (
              <li key={row.id} className="network-cluster-legend-item">
                <span
                  className="network-cluster-swatch"
                  style={{
                    background: `#${CLUSTER_SPHERE_COLORS[row.id % CLUSTER_SPHERE_COLORS.length]!
                      .toString(16)
                      .padStart(6, "0")}`,
                  }}
                />
                <span className="network-cluster-legend-text">
                  <strong>{row.title}</strong>
                  <span className="network-cluster-legend-preview">{row.preview}</span>
                </span>
              </li>
            ))}
          </ul>
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
