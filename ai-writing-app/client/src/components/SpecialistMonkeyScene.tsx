import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const MODEL_PATH = "/models/ancient_greek_kiosk.glb";
const ALTAR_PATH = "/models/altar_lowpoly_concept.glb";

/** Titles for overlays 0–5: architect, sculptor, brainstorm, ethos, logos, pathos. */
const OVERLAY_TITLES = [
  "Architect Monkey",
  "Sculptor Monkey",
  "Brainstorm Monkey",
  "Ethos Monkey",
  "Logos Monkey",
  "Pathos Monkey",
];

/** Image paths for overlays 0–5: architect, sculptor, freepik, ethos, logos, pathos. */
const OVERLAY_IMAGE_PATHS = [
  "/images/architect monkey.png",
  "/images/sculptor monkey.png",
  "/images/freepik__monkey-god-of-brainstorming-ancient-greek-style-po__44436.png",
  "/images/ethos monkey.png",
  "/images/logos monnkey.png",
  "/images/pathosmonkey.png",
];

/** Size of each overlay glass panel. */
const OVERLAY_SIZE = 0.6;

/** Translucent panel: opacity of the liquid-glass (0–1). */
const OVERLAY_OPACITY = 0.65;

/** Liquid glass: depth of the panel slab. */
const OVERLAY_DEPTH = 0.1;

/** Max size of the center altar in world units. */
const ALTAR_MAX_SIZE = 0.6;

/** Where to place the altar. */
const ALTAR_POSITION = { x: 0, y: -5.92, z: -0.3 };

/** Model position. */
const MODEL_POSITION = { x: 0, y: 0, z: 0 };

/** Fixed camera position. */
const CAMERA_POSITION = { x: -0.008, y: -5.244, z: -1.2 };

/** Initial look-at target. */
const CAMERA_LOOK_AT = { x: -0.008, y: -6.144, z: 0.092 };

type OverlayTransform = { x: number; y: number; z: number; tilt: number };

function createLabelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const dpr = 2;
  canvas.width = 256 * dpr;
  canvas.height = 64 * dpr;
  ctx.scale(dpr, dpr);
  ctx.font = "bold 26px 'Uncial Antiqua', 'GFS Neohellenic', serif";
  ctx.fillStyle = "#f0e8d8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const DEFAULT_OVERLAYS: OverlayTransform[] = [
  { x: 1.35, y: -5.1, z: -0.75, tilt: 93 },
  { x: 1.26, y: -5.13, z: 0.259, tilt: 46 },
  { x: 0.43, y: -5.13, z: 0.619, tilt: 12 },
  { x: -0.45, y: -5.13, z: 0.66, tilt: -22 },
  { x: -1.17, y: -5.14, z: 0.18, tilt: -61 },
  { x: -1.47, y: -5.15, z: -0.7, tilt: -94 },
];

export default function SpecialistMonkeyScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayGroupsRef = useRef<THREE.Group[]>([]);
  const [overlayState, setOverlayState] = useState<OverlayTransform[]>(() =>
    JSON.parse(JSON.stringify(DEFAULT_OVERLAYS))
  );

  const updateOverlay = (i: number, field: keyof OverlayTransform, value: number) => {
    setOverlayState((prev) => {
      const next = [...prev];
      next[i] = { ...next[i]!, [field]: value };
      return next;
    });
  };

  useEffect(() => {
    overlayGroupsRef.current.forEach((g, i) => {
      const p = overlayState[i];
      if (p && g) {
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = (p.tilt * Math.PI) / 180;
      }
    });
  }, [overlayState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
    camera.lookAt(CAMERA_LOOK_AT.x, CAMERA_LOOK_AT.y, CAMERA_LOOK_AT.z);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0f0e0c, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(CAMERA_LOOK_AT.x, CAMERA_LOOK_AT.y, CAMERA_LOOK_AT.z);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.ROTATE };
    const lookDistance = 1;
    const clampCameraToFixed = () => {
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
      camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
      controls.target.copy(camera.position).add(dir.multiplyScalar(lookDistance));
    };
    controls.addEventListener("change", () => clampCameraToFixed());

    const ambient = new THREE.AmbientLight(0x8899aa, 0.5);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1);
    keyLight.position.set(5, 5, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.5);
    fillLight.position.set(-4, 2, 5);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
    rimLight.position.set(0, 4, 6);
    scene.add(rimLight);
    const panelLight1 = new THREE.PointLight(0xc8e0ff, 0.4, 8);
    panelLight1.position.set(2, -5, 1);
    scene.add(panelLight1);
    const panelLight2 = new THREE.PointLight(0xffeedd, 0.25, 6);
    panelLight2.position.set(-2.5, -5.5, 0.5);
    scene.add(panelLight2);

    let overlayGroups: THREE.Group[] = [];

    const loadTemple = (): Promise<void> =>
      new Promise((resolve, reject) => {
        const templeLoader = new GLTFLoader();
        templeLoader.load(
          MODEL_PATH,
          (gltf) => {
            const model = gltf.scene;
            model.position.set(0, 0, 0);
            model.rotation.set(0, 0, 0);
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = maxDim > 0 ? 6 / maxDim : 6;
            model.position.sub(center);
            model.scale.setScalar(scale);
            model.position.x += MODEL_POSITION.x;
            model.position.y += MODEL_POSITION.y;
            model.position.z += MODEL_POSITION.z;
            scene.add(model);
            resolve();
          },
          undefined,
          () => reject(new Error("Failed to load temple"))
        );
      });

    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (path: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        textureLoader.load(encodeURI(path), resolve, undefined, reject);
      });

    Promise.all([loadTemple(), Promise.all(OVERLAY_IMAGE_PATHS.map(loadTexture))])
      .then(([, textures]) => {
        textures.forEach((tex) => {
          if ("colorSpace" in tex) (tex as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
        });
      const panelW = OVERLAY_SIZE;
      const panelH = OVERLAY_SIZE * 1.25;

      for (let i = 0; i < 6; i++) {
        const tex = textures[i]!;
        const img = tex.image as HTMLImageElement | undefined;
        const aspect =
          img && typeof img.width === "number" && typeof img.height === "number"
            ? img.width / img.height
            : 1;
        let imgW: number, imgH: number;
        if (aspect >= 1) {
          imgW = panelW;
          imgH = panelW / aspect;
        } else {
          imgH = panelH;
          imgW = panelH * aspect;
        }

        const group = new THREE.Group();
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0xe0ecff,
          transparent: true,
          opacity: OVERLAY_OPACITY,
          roughness: 0.04,
          metalness: 0.01,
          transmission: 0.65,
          thickness: 0.25,
          clearcoat: 0.8,
          clearcoatRoughness: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const glassSlab = new THREE.Mesh(
          new THREE.BoxGeometry(panelW, panelH, OVERLAY_DEPTH),
          glassMat
        );
        group.add(glassSlab);
        const imageMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const imageMesh = new THREE.Mesh(new THREE.PlaneGeometry(imgW, imgH), imageMat);
        imageMesh.position.z = OVERLAY_DEPTH / 2 - 0.02;
        group.add(imageMesh);
        const frontGlassMat = new THREE.MeshPhysicalMaterial({
          color: 0xf0f5ff,
          transparent: true,
          opacity: 0.25,
          roughness: 0.02,
          metalness: 0,
          transmission: 0.9,
          thickness: 0.05,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const frontGlass = new THREE.Mesh(
          new THREE.PlaneGeometry(panelW, panelH),
          frontGlassMat
        );
        frontGlass.position.z = OVERLAY_DEPTH / 2 + 0.001;
        group.add(frontGlass);

        const labelTex = createLabelTexture(OVERLAY_TITLES[i]!);
        const labelMat = new THREE.MeshBasicMaterial({
          map: labelTex,
          transparent: true,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: false,
          alphaTest: 0.1,
        });
        const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), labelMat);
        labelMesh.position.y = panelH / 2 + 0.1;
        labelMesh.rotation.y = Math.PI;
        labelMesh.name = "Label";
        group.add(labelMesh);

        const p = DEFAULT_OVERLAYS[i]!;
        group.position.set(p.x, p.y, p.z);
        group.rotation.y = (p.tilt * Math.PI) / 180;
        group.name = `Overlay${i}`;
        scene.add(group);
        overlayGroups.push(group);
      }

      overlayGroupsRef.current = overlayGroups;
      })
      .catch((err) => console.warn("SpecialistMonkeyScene: Failed to load overlays", err));

    const altarLoader = new GLTFLoader();
    altarLoader.load(
      ALTAR_PATH,
      (gltf) => {
        const altar = gltf.scene;
        altar.position.set(0, 0, 0);
        altar.rotation.set(0, 0, 0);
        const box = new THREE.Box3().setFromObject(altar);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? ALTAR_MAX_SIZE / maxDim : 1;
        altar.scale.setScalar(scale);
        altar.position.copy(center).multiplyScalar(-scale);
        altar.position.x += ALTAR_POSITION.x;
        altar.position.y += ALTAR_POSITION.y;
        altar.position.z += ALTAR_POSITION.z;
        altar.rotateY(Math.PI);
        altar.frustumCulled = false;
        scene.add(altar);
      },
      undefined,
      (err) => console.warn("SpecialistMonkeyScene: Failed to load altar", ALTAR_PATH, err)
    );

    let animationId: number;
    function animate() {
      animationId = requestAnimationFrame(animate);
      controls.update();
      clampCameraToFixed();
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
      overlayGroupsRef.current = [];
      overlayGroups.forEach((group) => {
        group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            const mat = obj.material as THREE.Material & { map?: THREE.Texture };
            if (mat) {
              mat.map?.dispose();
              mat.dispose();
            }
          }
        });
        scene.remove(group);
      });
      controls.dispose();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const copyAll = () => {
    const code = `const OVERLAY_TRANSFORMS = ${JSON.stringify(overlayState, null, 2)};`;
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="specialist-monkey-scene-wrapper">
      <div ref={containerRef} className="specialist-monkey-scene" aria-hidden="true" />
      <div className="specialist-monkey-controls specialist-monkey-overlay-controls" aria-live="polite">
        <div className="specialist-monkey-coords-title">Overlay positions (x, y, z, tilt°)</div>
        {overlayState.map((p, i) => (
          <div key={i} className="specialist-monkey-overlay-row">
            <span className="specialist-monkey-overlay-label">[{i}]</span>
            <label>
              x
              <input
                type="number"
                step="0.01"
                value={p.x}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) updateOverlay(i, "x", v);
                }}
                className="specialist-monkey-overlay-input"
              />
            </label>
            <label>
              y
              <input
                type="number"
                step="0.01"
                value={p.y}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) updateOverlay(i, "y", v);
                }}
                className="specialist-monkey-overlay-input"
              />
            </label>
            <label>
              z
              <input
                type="number"
                step="0.01"
                value={p.z}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) updateOverlay(i, "z", v);
                }}
                className="specialist-monkey-overlay-input"
              />
            </label>
            <label>
              tilt°
              <input
                type="number"
                step="1"
                value={p.tilt}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) updateOverlay(i, "tilt", v);
                }}
                className="specialist-monkey-overlay-input"
              />
            </label>
          </div>
        ))}
        <button type="button" className="specialist-monkey-copy-btn" onClick={copyAll}>
          Copy all
        </button>
        <div className="specialist-monkey-coords-hint">
          Edit values to position overlays in real time • Left drag to look around
        </div>
      </div>
    </div>
  );
}
