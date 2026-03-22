import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const SPHERE_RADIUS = 0.07;
const HALO_INNER = 0.09;
const HALO_OUTER = 0.115;
const LABEL_OFFSET_Y = 0.18;
// Overall network radius. Smaller = nodes cluster closer.
const SPREAD = 14;
const EDGE_CONNECTIONS = 3;
const EDGE_TUBE_RADIUS = 0.005;

// Greek palette
const AEGEAN_BLUE = 0x1b3a5c;
const GREEK_GOLD = 0xc9a84c;
const MARBLE_BG = 0xf8f6f1;

export type NeuralNode = { id: string; name: string };

function createLabelSprite(name: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 512;
  canvas.height = 96;
  ctx.clearRect(0, 0, 512, 96);
  ctx.font = "600 36px 'Cinzel', 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#8b7235";
  const shortName = name.length > 14 ? name.slice(0, 12) + "…" : name;
  ctx.fillText(shortName, 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.95, 0.24, 1);
  return sprite;
}

function volumeLayout(count: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const phi = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < count; i++) {
    const r = SPREAD * Math.cbrt((i + 0.5) / count);
    const theta = Math.acos(1 - 2 * (i + 0.5) / count);
    const phiAngle = 2 * Math.PI * i * phi;
    const x = r * Math.sin(theta) * Math.cos(phiAngle);
    const y = r * Math.sin(theta) * Math.sin(phiAngle);
    const z = r * Math.cos(theta);
    positions.push(new THREE.Vector3(x, y, z));
  }
  return positions;
}

function createEdgeTube(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const len = from.distanceTo(to);
  const geom = new THREE.CylinderGeometry(EDGE_TUBE_RADIUS, EDGE_TUBE_RADIUS, len, 4, 1);
  geom.translate(0, len / 2, 0);
  geom.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(from);
  mesh.lookAt(to);
  return mesh;
}

export interface NeuralNetworkSceneHandle {
  resetView: () => void;
}

interface NeuralNetworkSceneProps {
  nodes: NeuralNode[];
  onHoverNode: (id: string | null) => void;
  highlightNodeIds?: string[];
}

const NeuralNetworkScene = forwardRef<NeuralNetworkSceneHandle, NeuralNetworkSceneProps>(
  function NeuralNetworkScene({ nodes, onHoverNode, highlightNodeIds }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<string | null>(null);
  const highlightSetRef = useRef<Set<string>>(new Set());
  const currentHoveredMeshRef = useRef<THREE.Mesh | null>(null);
  const spheresRef = useRef<THREE.Mesh[]>([]);
  const meshToIdRef = useRef<Map<THREE.Object3D, string>>(new Map());
  const defaultMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const hoverMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const highlightMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const resetRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    resetView: () => resetRef.current?.(),
  }));

  const notify = useCallback(
    (id: string | null) => {
      if (id === hoveredRef.current) return;
      hoveredRef.current = id;
      onHoverNode(id);
    },
    [onHoverNode]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(MARBLE_BG);

    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Bring camera a bit closer to match tighter spread.
    const INITIAL_POS = new THREE.Vector3(0, 1.2, SPREAD * 0.55);
    const INITIAL_TARGET = new THREE.Vector3(0, 0, 0);
    camera.position.copy(INITIAL_POS);
    camera.lookAt(INITIAL_TARGET);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 2;
    controls.maxDistance = 80;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xfff5e6, 0.5);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.1);
    keyLight.position.set(8, 12, 10);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xe8dcc8, 0.35);
    fillLight.position.set(-8, 4, -6);
    scene.add(fillLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.2);
    backLight.position.set(0, -6, -10);
    scene.add(backLight);

    const positions = volumeLayout(nodes.length);

    const sphereGeom = new THREE.SphereGeometry(SPHERE_RADIUS, 32, 24);

    const defaultMat = new THREE.MeshPhysicalMaterial({
      color: AEGEAN_BLUE,
      roughness: 0.18,
      metalness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    });
    defaultMatRef.current = defaultMat;

    const hoverMat = new THREE.MeshPhysicalMaterial({
      color: GREEK_GOLD,
      roughness: 0.12,
      metalness: 0.5,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      emissive: GREEK_GOLD,
      emissiveIntensity: 0.3,
    });
    hoverMatRef.current = hoverMat;

    // Search highlight (blue) for matching nodes
    const highlightMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a73e8,
      roughness: 0.18,
      metalness: 0.35,
      clearcoat: 0.7,
      clearcoatRoughness: 0.12,
      emissive: 0x1a73e8,
      emissiveIntensity: 0.18,
    });
    highlightMatRef.current = highlightMat;

    const haloGeom = new THREE.RingGeometry(HALO_INNER, HALO_OUTER, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: GREEK_GOLD,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const spheres: THREE.Mesh[] = [];
    const halos: THREE.Mesh[] = [];
    const labels: THREE.Sprite[] = [];
    const meshToId = new Map<THREE.Object3D, string>();
    const meshToName = new Map<THREE.Object3D, string>();

    nodes.forEach((node, i) => {
      const name = node.name;
      const pos = positions[i]!;

      const mesh = new THREE.Mesh(sphereGeom, defaultMat);
      mesh.position.copy(pos);
      scene.add(mesh);
      spheres.push(mesh);
      meshToId.set(mesh, node.id);
      meshToName.set(mesh, name);

      const halo = new THREE.Mesh(haloGeom, haloMat);
      halo.position.copy(pos);
      scene.add(halo);
      halos.push(halo);

      const label = createLabelSprite(name);
      label.position.set(pos.x, pos.y + LABEL_OFFSET_Y, pos.z);
      scene.add(label);
      labels.push(label);
    });

    spheresRef.current = spheres;
    meshToIdRef.current = meshToId;

    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0xd4c4a0,
      transparent: true,
      opacity: 0.4,
    });
    const edgeMeshes: THREE.Mesh[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < positions.length; i++) {
      const from = positions[i]!;
      const distances = positions
        .map((p, j) => ({ j, d: from.distanceTo(p) }))
        .filter((x) => x.j !== i)
        .sort((a, b) => a.d - b.d);

      for (let k = 0; k < Math.min(EDGE_CONNECTIONS, distances.length); k++) {
        const j = distances[k]!.j;
        const edgeKey = [Math.min(i, j), Math.max(i, j)].join(",");
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        const to = positions[j]!;
        const tube = createEdgeTube(from, to, edgeMat);
        scene.add(tube);
        edgeMeshes.push(tube);
      }
    }

    // Raycasting for hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(spheres, false);
      const hit = hits[0];

      if (hit?.object instanceof THREE.Mesh && meshToId.has(hit.object)) {
        if (currentHoveredMeshRef.current !== hit.object) {
          const prev = currentHoveredMeshRef.current;
          if (prev) {
            const prevId = meshToId.get(prev) ?? null;
            prev.material = highlightSetRef.current.has(prevId ?? "") ? (highlightMatRef.current ?? defaultMat) : defaultMat;
          }

          currentHoveredMeshRef.current = hit.object;

          const id = meshToId.get(hit.object) ?? null;
          const shouldHighlight = id ? highlightSetRef.current.has(id) : false;
          currentHoveredMeshRef.current.material = shouldHighlight
            ? highlightMat
            : hoverMatRef.current ?? hoverMat;

          notify(meshToId.get(hit.object) ?? null);
        }
      } else {
        const prev = currentHoveredMeshRef.current;
        if (prev) {
          const prevId = meshToId.get(prev) ?? null;
          prev.material = highlightSetRef.current.has(prevId ?? "") ? (highlightMatRef.current ?? defaultMat) : defaultMat;
          currentHoveredMeshRef.current = null;
          notify(null);
        }
      }
    };

    const onPointerLeave = () => {
      const prev = currentHoveredMeshRef.current;
      if (prev) {
        const prevId = meshToId.get(prev) ?? null;
        prev.material = highlightSetRef.current.has(prevId ?? "") ? (highlightMatRef.current ?? defaultMat) : defaultMat;
        currentHoveredMeshRef.current = null;
        notify(null);
      }
    };

    // Smooth camera pan to clicked node
    let flyTarget: THREE.Vector3 | null = null;
    let flyStart: THREE.Vector3 | null = null;
    let flyTargetLook: THREE.Vector3 | null = null;
    let flyStartLook: THREE.Vector3 | null = null;
    let flyProgress = 0;
    const FLY_DURATION = 60; // frames (~1s at 60fps)
    const FLY_OFFSET = 3; // how far the camera sits from the node

    resetRef.current = () => {
      flyStart = camera.position.clone();
      flyTarget = INITIAL_POS.clone();
      flyStartLook = controls.target.clone();
      flyTargetLook = INITIAL_TARGET.clone();
      flyProgress = 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(spheres, false);
      const hit = hits[0];
      if (hit?.object instanceof THREE.Mesh && meshToId.has(hit.object)) {
        const nodePos = hit.object.position.clone();
        const dir = new THREE.Vector3().subVectors(camera.position, nodePos).normalize();
        flyStart = camera.position.clone();
        flyTarget = nodePos.clone().add(dir.multiplyScalar(FLY_OFFSET));
        flyStartLook = controls.target.clone();
        flyTargetLook = nodePos.clone();
        flyProgress = 0;
      }
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    let animationId: number;
    function animate() {
      animationId = requestAnimationFrame(animate);

      // Animate camera fly-to
      if (flyTarget && flyStart && flyTargetLook && flyStartLook) {
        flyProgress++;
        const t = Math.min(flyProgress / FLY_DURATION, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        camera.position.lerpVectors(flyStart, flyTarget, ease);
        controls.target.lerpVectors(flyStartLook, flyTargetLook, ease);
        if (t >= 1) {
          flyTarget = null;
          flyStart = null;
          flyTargetLook = null;
          flyStartLook = null;
        }
      }

      controls.update();
      for (const halo of halos) {
        halo.quaternion.copy(camera.quaternion);
      }
      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animationId);
      sphereGeom.dispose();
      defaultMat.dispose();
      hoverMat.dispose();
      highlightMat.dispose();
      haloGeom.dispose();
      haloMat.dispose();
      labels.forEach((s) => {
        s.material.map?.dispose();
        s.material.dispose();
      });
      edgeMeshes.forEach((m) => m.geometry.dispose());
      edgeMat.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [notify, nodes]);

  // Search highlight updates (blue nodes) without rebuilding the whole scene.
  useEffect(() => {
    highlightSetRef.current = new Set(highlightNodeIds ?? []);
    const spheres = spheresRef.current;
    const meshToId = meshToIdRef.current;
    const defaultMat = defaultMatRef.current;
    const hoverMat = hoverMatRef.current;
    const highlightMat = highlightMatRef.current;
    if (!defaultMat || !hoverMat || !highlightMat) return;

    const hoveredMesh = currentHoveredMeshRef.current;
    for (const mesh of spheres) {
      const id = meshToId.get(mesh);
      const shouldHighlight = id ? highlightSetRef.current.has(id) : false;
      if (shouldHighlight) {
        mesh.material = highlightMat;
      } else if (hoveredMesh && mesh === hoveredMesh) {
        mesh.material = hoverMat;
      } else {
        mesh.material = defaultMat;
      }
    }
  }, [highlightNodeIds]);

  return <div ref={containerRef} className="neural-network-scene" aria-hidden="true" />;
});

export default NeuralNetworkScene;
