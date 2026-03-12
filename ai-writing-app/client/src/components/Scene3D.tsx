import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createDoc } from "../lib/docs";

const MODEL_PATH = "/models/antique_desk.glb";

const OVERLAY_LEFT_RATIO = 0.58;
const OVERLAY_TOP_RATIO = 0.35;
const BOOK_STACK_OVERLAY_LEFT_RATIO = 0.42;
const BOOK_STACK_OVERLAY_TOP_RATIO = 0.35;
const MAP_OVERLAY_LEFT_RATIO = 0.55;
const MAP_OVERLAY_TOP_RATIO = 0.26;

/**
 * Loads the antique_desk.glb 3D model. Hovering the open book shows an arrow
 * to a "Create document" overlay; clicking it creates a doc and navigates to the editor.
 */
export default function Scene3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [bookHover, setBookHover] = useState<{
    show: boolean;
    bookX: number;
    bookY: number;
  }>({ show: false, bookX: 0, bookY: 0 });
  const [bookStackHover, setBookStackHover] = useState<{
    show: boolean;
    x: number;
    y: number;
  }>({ show: false, x: 0, y: 0 });
  const [lampHover, setLampHover] = useState(false);
  const [mapHover, setMapHover] = useState<{
    show: boolean;
    mapX: number;
    mapY: number;
  }>({ show: false, mapX: 0, mapY: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, -2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.pointerEvents = "auto";
    container.appendChild(renderer.domElement);

    const mouse = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const bookMeshes: THREE.Object3D[] = [];

    // Lights for the model
    const ambient = new THREE.AmbientLight(0x8899aa, 0.65);
    scene.add(ambient);
    const positions: [number, number, number][] = [
      [6, 6, 6], [-6, 4, 5], [5, -5, 5], [-4, -4, 6],
      [0, 7, 3], [0, -6, 4], [7, 0, 3], [-7, 0, 4],
      [4, 5, 9], [-5, 4, 7], [3, -5, 7], [8, 3, 2], [-8, 2, 3],
      [2, 7, 4], [-3, -6, 5], [6, -3, 4],
    ];
    positions.forEach(([x, y, z]) => {
      const light = new THREE.DirectionalLight(0xffffff, 0.55);
      light.position.set(x, y, z);
      scene.add(light);
    });
    const frontLight = new THREE.DirectionalLight(0xe8ecf0, 0.85);
    frontLight.position.set(0, 0, 10);
    scene.add(frontLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(4, 2, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.4);
    fillLight.position.set(-3, 1, 5);
    scene.add(fillLight);
    const rimLight = new THREE.PointLight(0xffffff, 0.6, 20);
    rimLight.position.set(2, 0, 0);
    scene.add(rimLight);

    let modelGroup: THREE.Group | null = null;
    let animationId: number;

    const loader = new GLTFLoader();
    loader.load(
      MODEL_PATH,
      (gltf) => {
        modelGroup = gltf.scene;
        modelGroup.position.set(1.4, -0.5, -2.2);
        modelGroup.rotation.x = 0.32;
        modelGroup.rotation.y = Math.PI * 0.06;

        const box = new THREE.Box3().setFromObject(modelGroup);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 10 / maxDim : 10;
        modelGroup.scale.setScalar(scale);

        const lampKeywords = ["lamp", "lantern", "light", "oil", "candle", "torch", "luminaire", "fixture", "bulb", "glow"];
        const nameMatchesLamp = (n: string) => lampKeywords.some((k) => n.includes(k));
        modelGroup.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            const name = (obj.name || "").toLowerCase();
            const hasPageOrOpen = name.includes("page") || name.includes("open");
            const hasBook = name.includes("book");
            let parentHasPageOrOpen = false;
            let parentHasBook = false;
            let par: THREE.Object3D | null = obj.parent;
            while (par) {
              const pn = (par.name || "").toLowerCase();
              if (pn.includes("page") || pn.includes("open")) parentHasPageOrOpen = true;
              if (pn.includes("book")) parentHasBook = true;
              par = par.parent;
            }
            const isOpenBook = hasPageOrOpen || parentHasPageOrOpen;
            const isStack = hasBook || parentHasBook;
            if (isOpenBook) {
              obj.userData.isBook = true;
              bookMeshes.push(obj);
            } else if (isStack) {
              obj.userData.isBookStack = true;
            }
            let isLamp = nameMatchesLamp(name);
            if (!isLamp) {
              let p: THREE.Object3D | null = obj.parent;
              while (p) {
                if (nameMatchesLamp((p.name || "").toLowerCase())) {
                  isLamp = true;
                  break;
                }
                p = p.parent;
              }
            }
            if (isLamp) {
              obj.userData.isLamp = true;
            }
            const mapKeywords = ["map", "parchment", "chart", "scroll"];
            const nameMatchesMap = (n: string) => mapKeywords.some((k) => n.includes(k));
            let isMap = nameMatchesMap(name);
            if (!isMap && obj.parent) {
              let p: THREE.Object3D | null = obj.parent;
              while (p) {
                if (nameMatchesMap((p.name || "").toLowerCase())) {
                  isMap = true;
                  break;
                }
                p = p.parent;
              }
            }
            if (isMap) {
              obj.userData.isMap = true;
            }
          }
        });

        scene.add(modelGroup);
      },
      undefined,
      () => {
        console.warn("Scene3D: Failed to load model", MODEL_PATH);
      }
    );

    function animate() {
      animationId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const bookHit = intersects.find((i) => i.object.userData?.isBook === true);
      const bookStackHit = intersects.find((i) => i.object.userData?.isBookStack === true);
      const lampHit = intersects.find((i) => i.object.userData?.isLamp === true);
      const mapHit = intersects.find((i) => i.object.userData?.isMap === true);
      if (bookHit) {
        const p = bookHit.point.clone().project(camera);
        const bookX = ((p.x + 1) / 2) * rect.width + rect.left;
        const bookY = ((-p.y + 1) / 2) * rect.height + rect.top;
        setBookHover({ show: true, bookX, bookY });
        setBookStackHover((prev) => (prev.show ? { ...prev, show: false } : prev));
        setLampHover(false);
        setMapHover((prev) => (prev.show ? { ...prev, show: false } : prev));
      } else {
        setBookHover((prev) => (prev.show ? { ...prev, show: false } : prev));
      }
      if (bookStackHit) {
        const p = bookStackHit.point.clone().project(camera);
        const stackX = ((p.x + 1) / 2) * rect.width + rect.left;
        const stackY = ((-p.y + 1) / 2) * rect.height + rect.top;
        setBookStackHover({ show: true, x: stackX, y: stackY });
        setBookHover((prev) => (prev.show ? { ...prev, show: false } : prev));
        setLampHover(false);
        setMapHover((prev) => (prev.show ? { ...prev, show: false } : prev));
      } else if (!bookHit) {
        setBookStackHover((prev) => (prev.show ? { ...prev, show: false } : prev));
      }
      if (lampHit) {
        setLampHover(true);
        setBookHover((prev) => (prev.show ? { ...prev, show: false } : prev));
        setBookStackHover((prev) => (prev.show ? { ...prev, show: false } : prev));
        setMapHover((prev) => (prev.show ? { ...prev, show: false } : prev));
      } else if (!bookHit) {
        setLampHover(false);
      }
      if (mapHit) {
        const p = mapHit.point.clone().project(camera);
        const mapX = ((p.x + 1) / 2) * rect.width + rect.left;
        const mapY = ((-p.y + 1) / 2) * rect.height + rect.top;
        setMapHover({ show: true, mapX, mapY });
        setBookHover((prev) => (prev.show ? { ...prev, show: false } : prev));
        setBookStackHover((prev) => (prev.show ? { ...prev, show: false } : prev));
        setLampHover(false);
      } else if (!bookHit && !lampHit) {
        setMapHover((prev) => (prev.show ? { ...prev, show: false } : prev));
      }
    };
    const onPointerLeave = () => {
      setBookHover((prev) => ({ ...prev, show: false }));
      setBookStackHover((prev) => ({ ...prev, show: false }));
      setLampHover(false);
      setMapHover((prev) => (prev.show ? { ...prev, show: false } : prev));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const bookHit = intersects.find((i) => i.object.userData?.isBook === true);
      const mapHit = intersects.find((i) => i.object.userData?.isMap === true);
      if (bookHit) {
        const meta = createDoc();
        navigate(`/doc/${meta.id}`);
      } else if (mapHit) {
        navigate("/monkey-agents-network");
      }
      // book stack click does nothing for now
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      cancelAnimationFrame(animationId);
      if (modelGroup) scene.remove(modelGroup);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [navigate]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const overlayX = vw * OVERLAY_LEFT_RATIO;
  const overlayY = vh * OVERLAY_TOP_RATIO;
  const bookStackOverlayX = vw * BOOK_STACK_OVERLAY_LEFT_RATIO;
  const bookStackOverlayY = vh * BOOK_STACK_OVERLAY_TOP_RATIO;
  const mapOverlayX = vw * MAP_OVERLAY_LEFT_RATIO;
  const mapOverlayY = vh * MAP_OVERLAY_TOP_RATIO;

  const handleCreateDocument = () => {
    const meta = createDoc();
    navigate(`/doc/${meta.id}`);
  };

  /* Hint positions (percent of viewport): 1=book stack, 2=open book, 3=map, 4=lamp — tuned for desk layout */
  const hint1 = { left: "43%", top: "40%" };
  const hint2 = { left: "40%", top: "60%" };
  const hint3 = { left: "85%", top: "46%" };
  const hint4 = { left: "70%", top: "34%" };

  return (
    <div ref={containerRef} className="scene3d" aria-hidden="true">
      <span className="scene3d-desk-hint" style={{ left: hint1.left, top: hint1.top }} aria-hidden="true">1</span>
      <span className="scene3d-desk-hint" style={{ left: hint2.left, top: hint2.top }} aria-hidden="true">2</span>
      <span className="scene3d-desk-hint" style={{ left: hint3.left, top: hint3.top }} aria-hidden="true">3</span>
      <span className="scene3d-desk-hint" style={{ left: hint4.left, top: hint4.top }} aria-hidden="true">4</span>
      {bookHover.show && (
        <>
          <svg
            className="scene3d-book-arrow"
            viewBox={`0 0 ${vw} ${vh}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="scene3d-arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#b8860b" />
              </marker>
            </defs>
            <line
              x1={bookHover.bookX}
              y1={bookHover.bookY}
              x2={overlayX}
              y2={overlayY}
              stroke="#b8860b"
              strokeWidth="2"
              markerEnd="url(#scene3d-arrowhead)"
            />
          </svg>
          <button
            type="button"
            className="scene3d-create-overlay"
            onClick={handleCreateDocument}
          >
            Create document
          </button>
        </>
      )}
      {bookStackHover.show && (
        <>
          <svg
            className="scene3d-book-arrow"
            viewBox={`0 0 ${vw} ${vh}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="scene3d-arrowhead-stack"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#b8860b" />
              </marker>
            </defs>
            <line
              x1={bookStackHover.x}
              y1={bookStackHover.y}
              x2={bookStackOverlayX}
              y2={bookStackOverlayY}
              stroke="#b8860b"
              strokeWidth="2"
              markerEnd="url(#scene3d-arrowhead-stack)"
            />
          </svg>
          <button type="button" className="scene3d-create-overlay scene3d-context-library-overlay">
            Create context library
          </button>
        </>
      )}
      {lampHover && (
        <div className="scene3d-theorem-overlay" role="tooltip">
          <h3 className="scene3d-theorem-title">The Infinite Monkey Theorem</h3>
          <p className="scene3d-theorem-text">
            The infinite monkey theorem states that a monkey hitting keys at random on a typewriter
            for an infinite amount of time will almost surely type any given text—including the
            complete works of Shakespeare. In practice, the probability is so vanishingly small
            that it would take far longer than the age of the universe. The idea illustrates
            concepts of probability, infinity, and the difference between possible and probable.
          </p>
        </div>
      )}
      {mapHover.show && (
        <>
          <svg
            className="scene3d-book-arrow"
            viewBox={`0 0 ${vw} ${vh}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="scene3d-arrowhead-map"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#b8860b" />
              </marker>
            </defs>
            <line
              x1={mapHover.mapX}
              y1={mapHover.mapY}
              x2={mapOverlayX}
              y2={mapOverlayY}
              stroke="#b8860b"
              strokeWidth="2"
              markerEnd="url(#scene3d-arrowhead-map)"
            />
          </svg>
          <div className="scene3d-mappen-overlay" role="tooltip">
            <button
              type="button"
              className="scene3d-mappen-btn"
              onClick={() => navigate("/monkey-agents-network")}
            >
              Create your specialist monkey
            </button>
            <button type="button" className="scene3d-mappen-btn">
              Browse the already made collection and blue prints
            </button>
          </div>
        </>
      )}
    </div>
  );
}
