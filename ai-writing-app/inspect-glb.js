#!/usr/bin/env node
/**
 * Inspect a GLB file and output the scene graph hierarchy.
 * Usage: node inspect-glb.js <path-to.glb>
 */

import fs from "fs";
import path from "path";

const glbPath = process.argv[2] || path.join(process.cwd(), "client/public/models/ancient_greek_kiosk.glb");
const buffer = fs.readFileSync(glbPath);

// GLB format: 12-byte header, then chunks
// Header: magic(4) version(4) length(4)
const magic = buffer.readUInt32LE(0);
if (magic !== 0x46546C67) {
  console.error("Not a valid GLB file (bad magic)");
  process.exit(1);
}

// First chunk is JSON (type 0x4E4F534A)
const jsonChunkLength = buffer.readUInt32LE(12);
const jsonChunkType = buffer.readUInt32LE(16);
if (jsonChunkType !== 0x4E4F534A) {
  console.error("Expected JSON chunk first");
  process.exit(1);
}

const jsonStart = 20;
const jsonEnd = jsonStart + jsonChunkLength;
const jsonStr = buffer.toString("utf8", jsonStart, jsonEnd);
const gltf = JSON.parse(jsonStr);

// Build node id -> node map
const nodes = gltf.nodes || [];
const meshes = gltf.meshes || [];
const scenes = gltf.scenes || [];

function getNodeName(node, index) {
  return node.name || `Node_${index}`;
}

function traverse(nodes, nodeIndex, indent = "", visited = new Set()) {
  if (nodeIndex === undefined || nodeIndex === null || visited.has(nodeIndex)) return;
  visited.add(nodeIndex);

  const node = nodes[nodeIndex];
  if (!node) return;

  const name = getNodeName(node, nodeIndex);
  const meshIdx = node.mesh;
  const meshInfo = meshIdx !== undefined && meshes[meshIdx]
    ? ` [MESH: ${meshes[meshIdx].name || `Mesh_${meshIdx}`}]`
    : "";
  const children = node.children || [];

  console.log(`${indent}${name}${meshInfo}`);

  for (const c of children) {
    traverse(nodes, c, indent + "  ", visited);
  }
}

console.log("=== ancient_greek_kiosk.glb Scene Graph ===\n");
console.log("Nodes:", nodes.length);
console.log("Meshes:", meshes.length);
console.log("Scenes:", scenes.length);
console.log();

// List all node names (flat) for pillar search
const allNames = nodes.map((n, i) => ({ index: i, name: getNodeName(n, i) }));
const pillarKeywords = ["pillar", "column", "columna", "pilar", "col", "post"];
const pillarLike = allNames.filter(
  ({ name }) => pillarKeywords.some((kw) => name.toLowerCase().includes(kw))
);

console.log("--- Nodes matching pillar/column-related names ---");
if (pillarLike.length) {
  pillarLike.forEach(({ index, name }) => {
    const node = nodes[index];
    const meshIdx = node?.mesh;
    console.log(`  [${index}] "${name}"${meshIdx !== undefined ? ` (mesh ${meshIdx})` : ""}`);
  });
} else {
  console.log("  (none found)");
}

console.log("\n--- Full node list (index: name) ---");
allNames.forEach(({ index, name }) => console.log(`  [${index}] "${name}"`));

console.log("\n--- Hierarchy (scene roots) ---");
const sceneNodes = scenes.length ? scenes[0].nodes : (nodes.length ? [0] : []);
for (const rootIdx of sceneNodes) {
  traverse(nodes, rootIdx);
}

// Output mesh names and primitives
console.log("\n--- Mesh names and primitives (for lookup) ---");
meshes.forEach((m, i) => {
  const prims = m.primitives || [];
  console.log(`  Mesh[${i}]: "${m.name || `(unnamed)`}" (${prims.length} primitives)`);
  prims.forEach((p, pi) => {
    const attr = p.attributes || {};
    const posAcc = gltf.accessors?.[attr.POSITION];
    const minMax = posAcc?.min && posAcc?.max ? ` min=[${posAcc.min.map((n) => n.toFixed(2)).join(", ")}] max=[${posAcc.max.map((n) => n.toFixed(2)).join(", ")}]` : "";
    console.log(`    Primitive[${pi}]: POSITION accessor ${attr.POSITION}${posAcc ? `, count=${posAcc.count}${minMax}` : ""}`);
  });
});

console.log("\n--- Pillar mesh (colonnes_low) bounding box ---");
const colonnesMesh = meshes[0];
if (colonnesMesh?.primitives?.[0]) {
  const posAcc = gltf.accessors?.[colonnesMesh.primitives[0].attributes?.POSITION];
  if (posAcc?.min && posAcc?.max) {
    const cx = (posAcc.min[0] + posAcc.max[0]) / 2;
    const cy = (posAcc.min[1] + posAcc.max[1]) / 2;
    const cz = (posAcc.min[2] + posAcc.max[2]) / 2;
    console.log("  Local bounds min:", posAcc.min.map((n) => n.toFixed(4)).join(", "));
    console.log("  Local bounds max:", posAcc.max.map((n) => n.toFixed(4)).join(", "));
    console.log("  Local center:", [cx.toFixed(4), cy.toFixed(4), cz.toFixed(4)].join(", "));
  }
}

// Compute world transforms for nodes (identity matrix as 4x4)
function getLocalMatrix(node) {
  if (node.matrix) {
    return node.matrix; // column-major 16 floats
  }
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  // Build matrix from TRS (simplified: output translation for position)
  return { translation: t, rotation: r, scale: s };
}

function multiplyMatrix4(a, b) {
  const out = new Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let sum = 0;
      for (let i = 0; i < 4; i++) sum += (a[i * 4 + col] ?? (col === i ? 1 : 0)) * (b[row * 4 + i] ?? (row === i ? 1 : 0));
      out[row * 4 + col] = sum;
    }
  }
  return out;
}

function getWorldPosition(nodes, nodeIndex, parentMatrix = null) {
  const node = nodes[nodeIndex];
  if (!node) return null;
  const local = node.matrix
    ? { matrix: node.matrix }
    : { translation: node.translation || [0, 0, 0] };
  let worldPos;
  if (local.matrix) {
    worldPos = [local.matrix[12], local.matrix[13], local.matrix[14]];
  } else {
    worldPos = [...local.translation];
  }
  if (parentMatrix) {
    const wx = parentMatrix[0] * worldPos[0] + parentMatrix[4] * worldPos[1] + parentMatrix[8] * worldPos[2] + parentMatrix[12];
    const wy = parentMatrix[1] * worldPos[0] + parentMatrix[5] * worldPos[1] + parentMatrix[9] * worldPos[2] + parentMatrix[13];
    const wz = parentMatrix[2] * worldPos[0] + parentMatrix[6] * worldPos[1] + parentMatrix[10] * worldPos[2] + parentMatrix[14];
    worldPos = [wx, wy, wz];
  }
  return worldPos;
}

function getFullWorldMatrix(nodes, nodeIndex, parentMat = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) {
  const node = nodes[nodeIndex];
  if (!node) return parentMat;
  let local;
  if (node.matrix) {
    local = node.matrix;
  } else {
    const t = node.translation || [0, 0, 0];
    const s = node.scale || [1, 1, 1];
    local = [
      s[0], 0, 0, 0,
      0, s[1], 0, 0,
      0, 0, s[2], 0,
      t[0], t[1], t[2], 1
    ];
    if (node.rotation) {
      const [x, y, z, w] = node.rotation;
      const r = [
        1-2*y*y-2*z*z, 2*x*y-2*z*w, 2*x*z+2*y*w, 0,
        2*x*y+2*z*w, 1-2*x*x-2*z*z, 2*y*z-2*x*w, 0,
        2*x*z-2*y*w, 2*y*z+2*x*w, 1-2*x*x-2*y*y, 0,
        0, 0, 0, 1
      ];
      local = multiplyMatrix4(local, r);
    }
  }
  const world = multiplyMatrix4(parentMat, local);
  return world;
}

function traverseWithMatrix(nodes, nodeIndex, parentMat, results) {
  const node = nodes[nodeIndex];
  if (!node) return;
  const worldMat = getFullWorldMatrix(nodes, nodeIndex, parentMat);
  const pos = [worldMat[12], worldMat[13], worldMat[14]];
  results.push({ index: nodeIndex, name: getNodeName(node, nodeIndex), position: pos, matrix: worldMat });
  for (const c of node.children || []) {
    traverseWithMatrix(nodes, c, worldMat, results);
  }
}

const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const allWorld = [];
for (const rootIdx of sceneNodes) {
  traverseWithMatrix(nodes, rootIdx, identity, allWorld);
}

console.log("\n--- Pillar node world positions ---");
pillarLike.forEach(({ index }) => {
  const entry = allWorld.find((e) => e.index === index);
  if (entry) {
    console.log(`  "${entry.name}" [${index}]: position [${entry.position.map((n) => n.toFixed(4)).join(", ")}]`);
  }
});

console.log("\n--- All nodes with world position (for programmatic use) ---");
allWorld.forEach(({ index, name, position }) => {
  console.log(`  [${index}] "${name}" => [${position.map((n) => n.toFixed(4)).join(", ")}]`);
});

console.log("\n--- Three.js: programmatic pillar lookup ---");
console.log(`
  // After loading with GLTFLoader:
  loader.load(MODEL_PATH, (gltf) => {
    const model = gltf.scene;

    // Find pillar mesh by name:
    const pillarNode = model.getObjectByName("colonnes_low");
    const pillarMesh = model.getObjectByName("colonnes_low_Material.003_0");

    // Get world position (after model transform):
    pillarNode?.getWorldPosition(new THREE.Vector3());

    // Get bounding box of pillars:
    const box = new THREE.Box3().setFromObject(pillarNode ?? pillarMesh ?? model);
    const center = box.getCenter(new THREE.Vector3());
  });
`);
