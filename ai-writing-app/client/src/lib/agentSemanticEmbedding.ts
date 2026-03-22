import type { AgentMeta } from "./agents";

const DIM = 96;

/** Simple bag-of-words style embedding: hashed word buckets + L2 norm (good enough for clustering). */
export function embedAgentText(a: AgentMeta): number[] {
  const text = [
    a.name,
    a.role,
    a.strengths,
    a.identity,
    a.behavior,
    a.constraints,
  ]
    .join(" ")
    .toLowerCase();

  const v = new Array(DIM).fill(0);
  const words = text.split(/\W+/).filter((w) => w.length > 1);
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % DIM;
    v[idx]! += 1 + w.length * 0.02;
  }

  // Bigrams
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]}_${words[i + 1]}`;
    let h = 0;
    for (let j = 0; j < bg.length; j++) {
      h = ((h << 5) - h + bg.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(h) % DIM;
    v[idx]! += 1.5;
  }

  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function agentsToFeatureMatrix(agents: AgentMeta[]): number[][] {
  return agents.map(embedAgentText);
}
