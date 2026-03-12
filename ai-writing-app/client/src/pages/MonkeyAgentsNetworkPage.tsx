import { useState, useRef } from "react";
import NeuralNetworkScene from "../components/NeuralNetworkScene";
import type { NeuralNetworkSceneHandle } from "../components/NeuralNetworkScene";
import "./MonkeyAgentsNetworkPage.css";

const LOREM = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.`;

export default function MonkeyAgentsNetworkPage() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const sceneRef = useRef<NeuralNetworkSceneHandle>(null);

  return (
    <div className="monkey-agents-network-page">
      <header className="monkey-agents-network-header">
        <h1 className="monkey-agents-network-title">Monkey Agents Network</h1>
        <p className="monkey-agents-network-subtitle">
          Drag to pan • Scroll to zoom
        </p>
        <button
          type="button"
          className="network-reset-btn"
          onClick={() => sceneRef.current?.resetView()}
        >
          Free view
        </button>
      </header>

      <NeuralNetworkScene ref={sceneRef} onHoverNode={setHoveredNode} />

      {hoveredNode && (
        <aside className="network-overlay-panel">
          <h2 className="network-overlay-panel-title">{hoveredNode}</h2>
          <div className="network-overlay-panel-divider" />
          <p className="network-overlay-panel-text">{LOREM}</p>
        </aside>
      )}
    </div>
  );
}
