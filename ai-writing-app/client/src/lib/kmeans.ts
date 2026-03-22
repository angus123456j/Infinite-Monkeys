/**
 * K-means clustering (Euclidean) on L2-normalized feature rows.
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

/** Seeded shuffle then take first k indices as initial centroids. */
function pickInitialIndices(n: number, k: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % (i + 1));
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  return idx.slice(0, k);
}

export interface KMeansResult {
  assignments: number[];
  centroids: number[][];
  iterations: number;
}

export function kMeans(
  points: number[][],
  k: number,
  opts?: { maxIter?: number; seed?: number }
): KMeansResult {
  const n = points.length;
  const d = points[0]?.length ?? 0;
  if (n === 0 || d === 0 || k < 1) {
    return { assignments: [], centroids: [], iterations: 0 };
  }
  const kk = Math.min(k, n);
  const maxIter = opts?.maxIter ?? 80;
  const seed = opts?.seed ?? 42;

  let centroids: number[][] = pickInitialIndices(n, kk, seed).map((i) =>
    cloneCentroid(points[i]!)
  );

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
