import type { AgentMeta } from "./agents";
import { STOPWORDS, tokenizeForClustering } from "./agentSemanticEmbedding";

/** All fields used for naming (same family as embedding). */
export function agentCorpusText(a: AgentMeta): string {
  return [
    a.name,
    a.role,
    a.strengths,
    a.identity,
    a.behavior,
    a.constraints,
    a.defaultPrompt,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Short human-readable cluster titles from TF–IDF–style distinctive terms
 * (same corpus stats as embedding, so labels match what clustering sees).
 */
export function computeClusterTitles(
  agents: AgentMeta[],
  assignments: number[],
  k: number
): Map<number, string> {
  const n = agents.length;
  const corpus = agents.map(agentCorpusText);
  const df = new Map<string, number>();
  for (const text of corpus) {
    const seen = new Set(tokenizeForClustering(text));
    for (const w of seen) {
      df.set(w, (df.get(w) ?? 0) + 1);
    }
  }

  const titles = new Map<number, string>();

  for (let c = 0; c < k; c++) {
    const idxs = agents
      .map((_, i) => i)
      .filter((i) => (assignments[i] ?? 0) === c);
    if (idxs.length === 0) {
      titles.set(c, `Cluster ${c + 1}`);
      continue;
    }

    const clusterBlob = idxs.map((i) => corpus[i]).join(" ");
    const tf = new Map<string, number>();
    for (const w of tokenizeForClustering(clusterBlob)) {
      tf.set(w, (tf.get(w) ?? 0) + 1);
    }

    const scored: { w: string; score: number }[] = [];
    for (const [w, tfc] of tf) {
      if (STOPWORDS.has(w)) continue;
      const dfi = df.get(w) ?? 1;
      const idf = Math.log((n + 1) / (dfi + 0.5)) + 1;
      const tfw = 1 + Math.log(tfc);
      scored.push({ w, score: tfw * idf * idf });
    }
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 4).map((s) => capitalizeWord(s.w));
    const label =
      top.length > 0
        ? top.join(" · ")
        : idxs.length === 1
          ? agents[idxs[0]!]!.name.slice(0, 48)
          : `Group ${c + 1}`;
    titles.set(c, label);
  }

  return titles;
}

function capitalizeWord(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}
