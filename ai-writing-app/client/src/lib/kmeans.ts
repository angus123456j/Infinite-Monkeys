/**
 * K-means clustering (Euclidean) on L2-normalized feature rows.
 * Optional k-means++ initialization for better, more stable partitions.
 */

function euclidean2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return s;
}

function cloneCentroid(c: number[]): number[] {
  return c.slice();
}

function meanOfPoints(points: number[][], indices: number[]): number[] {
  const d = points[0]!.length;
  const out = new Array(d).fill(0);
  if (indices.length === 0) return out;
  for (const idx of indices) {
    const p = points[idx]!;
    for (let j = 0; j < d; j++) out[j]! += p[j]!;
  }
  const inv = 1 / indices.length;
  for (let j = 0; j < d; j++) out[j]! *= inv;
  return out;
}

/** Mulberry32 PRNG for deterministic k-means++. */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded shuffle then take first k indices as initial centroids. */
function pickInitialIndices(n: number, k: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j =
      Math.floor(
        Math.abs(Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % (i + 1)
      );
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  return idx.slice(0, k);
}

function pickInitialCentroidsKMeansPlusPlus(
  points: number[][],
  k: number,
  seed: number
): number[][] {
  const n = points.length;
  const kk = Math.min(k, n);
  const rand = mulberry32(seed);
  const centroids: number[][] = [];

  const first = Math.floor(rand() * n);
  centroids.push(cloneCentroid(points[first]!));

  for (let c = 1; c < kk; c++) {
    const weights: number[] = new Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      for (const cent of centroids) {
        minD = Math.min(minD, euclidean2(points[i]!, cent));
      }
      const w = minD;
      weights[i] = w;
      sum += w;
    }
    if (sum <= 0 || !Number.isFinite(sum)) {
      centroids.push(cloneCentroid(points[Math.floor(rand() * n)]!));
      continue;
    }
    let r = rand() * sum;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push(cloneCentroid(points[pick]!));
  }

  return centroids;
}

export interface KMeansResult {
  assignments: number[];
  centroids: number[][];
  iterations: number;
}

export function kMeans(
  points: number[][],
  k: number,
  opts?: { maxIter?: number; seed?: number; init?: "forgy" | "kmeans++" }
): KMeansResult {
  const n = points.length;
  const d = points[0]?.length ?? 0;
  if (n === 0 || d === 0 || k < 1) {
    return { assignments: [], centroids: [], iterations: 0 };
  }
  const kk = Math.min(k, n);
  const maxIter = opts?.maxIter ?? 80;
  const seed = opts?.seed ?? 42;
  const init = opts?.init ?? "kmeans++";

  let centroids: number[][] =
    init === "kmeans++"
      ? pickInitialCentroidsKMeansPlusPlus(points, kk, seed)
      : pickInitialIndices(n, kk, seed).map((i) => cloneCentroid(points[i]!));

  const assignments = new Array(n).fill(0);
  let changed = true;
  let iter = 0;

  while (changed && iter < maxIter) {
    changed = false;
    iter++;

    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        const dist = euclidean2(p, centroids[c]!);
        if (dist < bestD) {
          bestD = dist;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }

    const clusters: number[][] = Array.from({ length: kk }, () => []);
    for (let i = 0; i < n; i++) {
      clusters[assignments[i]!]!.push(i);
    }

    for (let c = 0; c < kk; c++) {
      const idx = clusters[c]!;
      if (idx.length === 0) continue;
      centroids[c] = meanOfPoints(points, idx);
    }
  }

  return { assignments, centroids, iterations: iter };
}
