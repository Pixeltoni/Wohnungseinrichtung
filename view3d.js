// 3D-Ansicht der Wohnung mit three.js. Baut aus dem Grundriss (state und
// Geometrie-Funktionen aus app.js) Böden, Wände, Öffnungen und Möbel.
// Koordinaten: Grundriss x → 3D x, Grundriss y → 3D z, Höhe → 3D y; Einheit cm.
import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/addons/controls/OrbitControls.js';

const DOOR_HEIGHT = 210;
const WINDOW_SILL = 90;
const WINDOW_TOP = 220;
const LOW_WALL = 100;

const COLORS = {
  wall: 0xf3f1ec,
  wallTop: 0x4a5561,
  floor: 0xe6d6bd,
  ground: 0xe9ecef,
  glass: 0x9cc8ea,
  selected: 0x2f6fde,
};

let renderer;
let scene;
let camera;
let controls;
let container;
let content;
let sun;
let lowWalls = false;
let updatePending = false;
let resizeObserver;

const materials = {};
function material(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
  return materials[key];
}

// Quader über einem Grundriss-Rechteck { x, y, w, h } zwischen den Höhen y0 und y1.
function box(rect, y0, y1, mat, shadows = true) {
  const h = y1 - y0;
  if (h <= 0 || rect.w <= 0 || rect.h <= 0) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(rect.w, h, rect.h), mat);
  mesh.position.set(rect.x + rect.w / 2, y0 + h / 2, rect.y + rect.h / 2);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  content.add(mesh);
  return mesh;
}

function wallHeight() {
  return lowWalls ? Math.min(LOW_WALL, state.wallHeight) : state.wallHeight;
}

// ---------- Möbel ----------

// Standardhöhe nach Name (eigene Höhe hat Vorrang).
const HEIGHTS = [
  ['teppich', 1], ['kleiderschrank', 210], ['kühlschrank', 180], ['regal', 180], ['dusche', 200],
  ['pflanze', 120], ['couchtisch', 45], ['nachttisch', 55], ['bürostuhl', 100], ['stuhl', 90],
  ['sofa', 85], ['sessel', 85], ['bett', 50], ['tv', 50], ['badewanne', 60], ['wc', 40],
  ['waschbecken', 85], ['waschmaschine', 85], ['küche', 90], ['herd', 90], ['spüle', 90],
  ['kommode', 90], ['schrank', 200], ['tisch', 75],
];

export function defaultHeight(f) {
  const name = f.name.toLowerCase();
  if (f.floor) return 1;
  const hit = HEIGHTS.find(([key]) => name.includes(key));
  return hit ? hit[1] : 75;
}

function furnitureKind(f) {
  const name = f.name.toLowerCase();
  if (f.floor) return 'rug';
  if (name.includes('pflanze')) return 'plant';
  if (name.includes('bett')) return 'bed';
  if (name.includes('sofa') || name.includes('sessel')) return 'sofa';
  if (name.includes('stuhl')) return 'chair';
  if (name.includes('tisch') && !name.includes('nachttisch')) return 'table';
  return 'block';
}

// Teil eines Möbelstücks in lokalen Koordinaten (Mitte 0/0, -z = Rückseite).
function part(group, w, h, d, x, y, z, mat, round = false) {
  if (w <= 0 || h <= 0 || d <= 0) return;
  const geo = round ? new THREE.CylinderGeometry(0.5, 0.5, 1, 32) : new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function buildFurniture(f) {
  const group = new THREE.Group();
  const w = f.width;
  const d = f.depth;
  const h = f.height > 0 ? f.height : defaultHeight(f);
  const round = f.shape === 'round';
  const isSel = selected && selected.kind === 'furniture' && selected.id === f.id;
  const color = new THREE.Color(f.color);
  const main = material(color.getHex(), isSel ? { emissive: COLORS.selected, emissiveIntensity: 0.35 } : {});
  const darker = material(color.clone().multiplyScalar(0.8).getHex(), isSel ? { emissive: COLORS.selected, emissiveIntensity: 0.35 } : {});
  const back = -d / 2;

  switch (furnitureKind(f)) {
    case 'rug':
      part(group, w, 1, d, 0, 0.2, 0, main, round);
      break;
    case 'plant':
      part(group, w * 0.6, h * 0.3, d * 0.6, 0, 0, 0, material(0xb5835a), true);
      part(group, w, h * 0.7, d, 0, h * 0.3, 0, material(0x6aa86a), true);
      break;
    case 'bed': {
      const base = Math.min(h, 50);
      part(group, w, base, d, 0, 0, 0, main, round);
      part(group, w, 90, 6, 0, 0, back + 3, darker);
      part(group, w * 0.8, 10, Math.min(40, d * 0.2), 0, base, back + 30, material(0xffffff));
      break;
    }
    case 'sofa': {
      const seat = Math.min(45, h);
      const backDepth = Math.min(20, d * 0.3);
      const arm = Math.min(15, w * 0.15);
      part(group, w, seat, d, 0, 0, 0, main);
      part(group, w, h, backDepth, 0, 0, back + backDepth / 2, darker);
      part(group, arm, h * 0.7, d, -w / 2 + arm / 2, 0, 0, darker);
      part(group, arm, h * 0.7, d, w / 2 - arm / 2, 0, 0, darker);
      break;
    }
    case 'chair': {
      const seat = Math.min(45, h);
      part(group, w, 5, d, 0, seat - 5, 0, main, round);
      part(group, round ? 6 : w, h - seat, 5, 0, seat, back + 3, darker);
      part(group, 6, seat - 5, 6, 0, 0, 0, darker, true);
      break;
    }
    case 'table': {
      const top = 4;
      part(group, w, top, d, 0, h - top, 0, main, round);
      if (round) {
        part(group, 8, h - top, 8, 0, 0, 0, darker, true);
      } else {
        const lx = w / 2 - 5;
        const lz = d / 2 - 5;
        for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) part(group, 5, h - top, 5, x, 0, z, darker);
      }
      break;
    }
    default:
      part(group, w, h, d, 0, 0, 0, main, round);
  }

  const [cx, cy] = furnitureCenter(f);
  group.position.set(cx, 0, cy);
  group.rotation.y = (-f.rotation * Math.PI) / 180;
  content.add(group);
}

// ---------- Szene aufbauen ----------

function build() {
  if (content) {
    scene.remove(content);
    content.traverse((obj) => obj.geometry && obj.geometry.dispose());
  }
  content = new THREE.Group();
  const H = wallHeight();
  const wallMat = material(COLORS.wall);
  const floorMat = material(COLORS.floor, { roughness: 0.7 });

  // Böden: Räume, Nischen und Durchgänge (Türen, Durchgänge, entfernte Wände).
  const floors = walkableRects();
  for (const rect of floors) box(rect, -2, 0, floorMat, false);

  // Wände, Vorsprünge und schräge Ecken.
  for (const p of wallPieces()) box(p.rect, 0, H, wallMat);
  for (const ft of state.features) {
    if (ft.type === 'pillar') box(pillarRect(ft), 0, H, wallMat);
    if (ft.type === 'chamfer') {
      const pts = chamferPoly(ft);
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      content.add(mesh);
    }
  }

  // Stürze über Türen/Durchgängen, Brüstung, Sturz und Glas bei Fenstern.
  for (const g of wallGaps()) {
    const rect = gapRect(g);
    if (g.kind === 'door' || g.kind === 'passage') {
      box(rect, DOOR_HEIGHT, H, wallMat);
    } else if (g.kind === 'window') {
      const sill = Math.min(Number.isFinite(g.sill) ? g.sill : WINDOW_SILL, WINDOW_TOP - 10);
      box(rect, 0, Math.min(sill, H), wallMat);
      box(rect, WINDOW_TOP, H, wallMat);
      const glass = g.axis === 'h'
        ? { x: rect.x, y: rect.y + rect.h / 2 - 1, w: rect.w, h: 2 }
        : { x: rect.x + rect.w / 2 - 1, y: rect.y, w: 2, h: rect.h };
      box(glass, sill, Math.min(WINDOW_TOP, H), material(COLORS.glass, { transparent: true, opacity: 0.35, roughness: 0.1 }), false);
    }
  }

  for (const f of state.furniture) buildFurniture(f);
  scene.add(content);
  fitShadows();
}

// Umfang aller Räume (für Kamera und Schatten).
function bounds() {
  const rects = walkableRects();
  if (!rects.length) return { x: -250, y: -250, w: 500, h: 500 };
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function fitShadows() {
  const b = bounds();
  const cx = b.x + b.w / 2;
  const cz = b.y + b.h / 2;
  const size = Math.max(b.w, b.h) / 2 + 200;
  sun.position.set(cx + size, size * 2, cz + size * 0.6);
  sun.target.position.set(cx, 0, cz);
  const cam = sun.shadow.camera;
  cam.left = -size * 1.5;
  cam.right = size * 1.5;
  cam.top = size * 1.5;
  cam.bottom = -size * 1.5;
  cam.near = 1;
  cam.far = size * 6;
  cam.updateProjectionMatrix();
}

export function resetCamera() {
  const b = bounds();
  const cx = b.x + b.w / 2;
  const cz = b.y + b.h / 2;
  const dist = Math.max(b.w, b.h) * 1.1 + 300;
  controls.target.set(cx, 0, cz);
  camera.position.set(cx + dist * 0.45, dist * 1.05, cz + dist * 0.65);
  controls.update();
  draw();
}

function draw() {
  if (renderer && container && !container.hidden) renderer.render(scene, camera);
}

function resize() {
  const { clientWidth: w, clientHeight: h } = container;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  draw();
}

function init(el) {
  container = el;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'view3d-canvas';
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f5f7);
  camera = new THREE.PerspectiveCamera(45, 1, 5, 50000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.6));
  sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100000, 100000), material(COLORS.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  ground.receiveShadow = true;
  scene.add(ground);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // nicht unter den Boden
  controls.minDistance = 50;
  controls.maxDistance = 20000;
  controls.addEventListener('change', draw);

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
}

// ---------- Schnittstelle für app.js ----------

export function show(el) {
  const first = !renderer;
  if (first) init(el);
  container.hidden = false;
  // Bedienhinweis nach ein paar Sekunden ausblenden.
  const hint = container.querySelector('.view3d-hint');
  if (hint) {
    hint.classList.remove('faded');
    setTimeout(() => hint.classList.add('faded'), 6000);
  }
  build();
  resize();
  if (first) resetCamera();
  draw();
}

export function hide() {
  if (container) container.hidden = true;
}

// Änderungen am Plan gesammelt einmal pro Frame übernehmen.
export function requestUpdate() {
  if (!renderer || container.hidden || updatePending) return;
  updatePending = true;
  requestAnimationFrame(() => {
    updatePending = false;
    build();
    draw();
  });
}

export function setLowWalls(value) {
  lowWalls = value;
  requestUpdate();
}
