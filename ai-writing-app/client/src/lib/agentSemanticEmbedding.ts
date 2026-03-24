import type { AgentMeta } from "./agents";

/** Wider space → fewer accidental collisions than 96-dim. */
const DIM = 256;

/** Common English + theme words that rarely help separate agents. */
export const STOPWORDS = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "they",
    "them",
    "their",
    "with",
    "from",
    "by",
    "about",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "also",
    "now",
    "monkey",
    "monkeys",
    "agent",
    "agents",
  ]
);

function hashBucket(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % DIM;
}

export function tokenizeForClustering(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function wordCounts(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of tokenizeForClustering(text)) {
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return m;
}

function agentText(a: AgentMeta): string {
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
 * Build TF–IDF weighted hash vectors: distinctive words get higher weight,
 * so agents that differ in role/strengths (e.g. rebuttal vs rhythm) pull apart.
 */
export function agentsToFeatureMatrix(agents: AgentMeta[]): number[][] {
  const n = agents.length;
  if (n === 0) return [];

  const corpus = agents.map(agentText);
  const docCounts = corpus.map(wordCounts);

  const df = new Map<string, number>();
  for (const counts of docCounts) {
    for (const w of counts.keys()) {
      df.set(w, (df.get(w) ?? 0) + 1);
    }
  }

  const rawVectors: number[][] = [];

  for (let i = 0; i < n; i++) {
    const v = new Array(DIM).fill(0);
    const counts = docCounts[i]!;
    for (const [w, tfRaw] of counts) {
      const dfi = df.get(w) ?? 1;
      const idf = Math.log((n + 1) / (dfi + 0.5)) + 1;
      const tf = 1 + Math.log(tfRaw);
      const wgt = tf * idf;
      const idx = hashBucket(w);
      v[idx]! += wgt;
      if (w.length > 3) {
        const idx2 = hashBucket(`_${w}_`);
        v[idx2]! += wgt * 0.35;
      }
    }

    // Bigrams: extra signal for phrases like "synonym sensei"
    const words = tokenizeForClustering(corpus[i]!);
    for (let j = 0; j < words.length - 1; j++) {
      const bg = `${words[j]}_${words[j + 1]}`;
      let h = 0;
      for (let k = 0; k < bg.length; k++) {
        h = ((h << 5) - h + bg.charCodeAt(k)!) | 0;
      }
      const idx = Math.abs(h) % DIM;
      v[idx]! += 1.2;
    }

    rawVectors.push(v);
  }

  return rawVectors.map((v) => {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  });
}
