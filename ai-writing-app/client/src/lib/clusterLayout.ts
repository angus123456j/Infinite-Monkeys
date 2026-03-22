/**
 * Deterministic 3D positions: cluster centers on a ring + local jitter.
 */

const SPREAD = 14;

function seeded01(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function layoutClusteredNodes(
  assignments: number[],
  k: number
): Array<{ x: number; y: number; z: number }> {
  const n = assignments.length;
  const kk = Math.max(1, k);
  const CLUSTER_JITTER = 3.8;
  const ringR = SPREAD * 0.52;

  const centers: Array<{ x: number; y: number; z: number }> = [];
  for (let c = 0; c < kk; c++) {
    const theta = (2 * Math.PI * c) / kk - Math.PI / 2;
    const tilt = 0.38;
    centers.push({
      x: ringR * Math.cos(theta) * Math.cos(tilt),
      y: ringR * Math.sin(theta) * 0.42,
      z: ringR * Math.sin(theta) * Math.cos(tilt),
    });
  }

  return Array.from({ length: n }, (_, i) => {
    const cid = assignments[i] ?? 0;
    const center = centers[Math.min(cid, centers.length - 1)]!;
    return {
      x: center.x + (seeded01(i, 1) - 0.5) * CLUSTER_JITTER,
      y: center.y + (seeded01(i, 2) - 0.5) * CLUSTER_JITTER,
      z: center.z + (seeded01(i, 3) - 0.5) * CLUSTER_JITTER,
    };
  });
}
