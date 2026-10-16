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
  wallTop: 0x4a5561,
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
let ground;
let lowWalls = false;
let updatePending = false;
let resizeObserver;

const materials = {};
function material(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
  return materials[key];
}

// ---------- Texturen (im Browser gezeichnet, keine Bilddateien) ----------

const TEX = 512;

// Gleichbleibende Zufallszahlen, damit Texturen bei jedem Neuaufbau gleich aussehen.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amount >= 0 ? 0xffffff : 0x000000), Math.abs(amount));
  return `#${c.getHexString()}`;
}

function speckle(ctx, rand, alpha, count) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1 + rand() * 2);
  }
}

const PAINTERS = {
  // Dielen in Reihen mit versetzten Fugen und Maserung.
  planks(ctx, rand, { base, rows, variation, grain = 3, vertical = false }) {
    if (vertical) {
      ctx.translate(TEX, 0);
      ctx.rotate(Math.PI / 2);
    }
    const rowH = TEX / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * TEX * 0.5;
      while (x < TEX) {
        const len = TEX * (0.35 + rand() * 0.45);
        ctx.fillStyle = shade(base, (rand() - 0.5) * variation);
        ctx.fillRect(x, r * rowH, len, rowH);
        ctx.strokeStyle = 'rgba(60,35,15,0.12)';
        ctx.lineWidth = 1;
        for (let g = 0; g < grain; g++) {
          const y = r * rowH + 3 + rand() * (rowH - 6);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + len * 0.3, y + (rand() - 0.5) * 6, x + len * 0.7, y + (rand() - 0.5) * 6, x + len, y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,25,10,0.35)';
        ctx.fillRect(x, r * rowH, 2, rowH);
        x += len;
      }
      ctx.fillStyle = 'rgba(40,25,10,0.35)';
      ctx.fillRect(0, r * rowH, TEX, 2);
    }
  },
  tiles(ctx, rand, { base, grout, n, variation }) {
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, TEX, TEX);
    const cell = TEX / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade(base, (rand() - 0.5) * variation);
        ctx.fillRect(i * cell + 3, j * cell + 3, cell - 6, cell - 6);
      }
    }
    speckle(ctx, rand, 0.05, 3000);
  },
  bricks(ctx, rand, { base, mortar, rows }) {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, TEX, TEX);
    const rowH = TEX / rows;
    const brickW = rowH * 2.6;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 ? brickW / 2 : 0;
      for (let x = -offset; x < TEX; x += brickW) {
        ctx.fillStyle = shade(base, (rand() - 0.5) * 0.3);
        ctx.fillRect(x + 3, r * rowH + 3, brickW - 6, rowH - 6);
      }
    }
    speckle(ctx, rand, 0.08, 6000);
  },
  stones(ctx, rand, { base, mortar }) {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, TEX, TEX);
    let y = 0;
    while (y < TEX) {
      const h = 40 + rand() * 50;
      let x = -rand() * 40;
      while (x < TEX) {
        const w = 50 + rand() * 90;
        ctx.fillStyle = shade(base, (rand() - 0.5) * 0.45);
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 10);
        ctx.fill();
        x += w;
      }
      y += h;
    }
    speckle(ctx, rand, 0.1, 8000);
  },
  grass(ctx, rand, { base }) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, TEX, TEX);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9000; i++) {
      const x = rand() * TEX;
      const y = rand() * TEX;
      ctx.strokeStyle = shade(base, (rand() - 0.5) * 0.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 6, y - 4 - rand() * 8);
      ctx.stroke();
    }
  },
  plain(ctx, rand, { base, specks = 4000, alpha = 0.04, blotches = 0 }) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, TEX, TEX);
    for (let i = 0; i < blotches; i++) {
      const x = rand() * TEX;
      const y = rand() * TEX;
      const r = 30 + rand() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},0.08)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(ctx, rand, alpha, specks);
  },
};

// tile = wie viele cm eine Texturkachel in der Wirklichkeit abdeckt.
const FLOOR_TEXTURES = {
  parkett: { tile: 160, painter: 'planks', base: '#b98a5a', rows: 8, variation: 0.25 },
  laminat: { tile: 200, painter: 'planks', base: '#d6bb93', rows: 6, variation: 0.12, grain: 2 },
  fliesen: { tile: 120, painter: 'tiles', base: '#e4e3df', grout: '#b9b7b0', n: 2, variation: 0.05 },
  stein: { tile: 160, painter: 'tiles', base: '#a39d93', grout: '#857f76', n: 2, variation: 0.3 },
  teppich: { tile: 100, painter: 'plain', base: '#a9a196', specks: 40000, alpha: 0.08 },
  beton: { tile: 250, painter: 'plain', base: '#b4b2ad', specks: 12000, alpha: 0.06, blotches: 40 },
  terrasse: { tile: 150, painter: 'planks', base: '#9a6b43', rows: 6, variation: 0.2, grain: 2 },
  wiese: { tile: 150, painter: 'grass', base: '#6ea84f' },
};
const WALL_TEXTURES = {
  weiss: { tile: 200, painter: 'plain', base: '#f1efe9', specks: 3000, alpha: 0.025 },
  stein: { tile: 160, painter: 'stones', base: '#9c958b', mortar: '#cfc8bc' },
  ziegel: { tile: 120, painter: 'bricks', base: '#a8583b', mortar: '#d9d2c6', rows: 8 },
  holz: { tile: 120, painter: 'planks', base: '#b58457', rows: 6, variation: 0.18, vertical: true },
  beton: { tile: 250, painter: 'plain', base: '#c4c2bd', specks: 12000, alpha: 0.06, blotches: 40 },
  fliesen: { tile: 80, painter: 'tiles', base: '#f4f4f2', grout: '#c9c9c4', n: 4, variation: 0.03 },
};

const texturedMaterials = {};
let buildGaps = []; // Wandöffnungen, einmal pro Aufbau berechnet

function texturedMaterial(kind, key) {
  const id = `${kind}:${key}`;
  if (texturedMaterials[id]) return texturedMaterials[id];
  const def = (kind === 'floor' ? FLOOR_TEXTURES : WALL_TEXTURES)[key];
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d');
  PAINTERS[def.painter](ctx, seeded(id.length * 7919 + key.charCodeAt(0)), def);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Die Geometrie hat Texturkoordinaten in cm; eine Kachel deckt def.tile cm ab.
  texture.repeat.set(1 / def.tile, 1 / def.tile);
  texturedMaterials[id] = new THREE.MeshStandardMaterial({ map: texture, roughness: key === 'fliesen' ? 0.45 : 0.85 });
  return texturedMaterials[id];
}

const floorMaterial = (key) => texturedMaterial('floor', key);
const wallMaterial = (key) => texturedMaterial('wall', key);

// Texturkoordinaten aus Weltkoordinaten (cm): waagrechte Flächen x/z, Wände entlang der Wand und Höhe.
function worldUV(geo) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) { u = pos.getX(i); v = pos.getZ(i); }
    else if (ax >= az) { u = pos.getZ(i); v = pos.getY(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Raum an einem Punkt des Grundrisses (inkl. Nischen und Wandöffnungen des Raums).
function roomAtPoint(x, y) {
  const inside = (r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  const room = state.rooms.find((r) => inside(roomRect(r)));
  if (room) return room;
  const niche = state.features.find((ft) => ft.type === 'niche' && inside(nicheGeometry(ft).floor));
  if (niche) return roomById(niche.roomId);
  const gap = buildGaps.find((g) => g.kind !== 'window' && inside(gapRect(g)));
  return gap ? roomById(gap.roomId) : null;
}

// Materialien der sechs Seiten eines Wandquaders (+x, -x, oben, unten, +z, -z):
// Jede Seite bekommt das Wandmaterial des Raums, in den sie zeigt.
function wallFaceMaterials(rect) {
  const cx = rect.x + rect.w / 2;
  const cz = rect.y + rect.h / 2;
  const outside = wallMaterial('weiss');
  const face = (x, y, side) => {
    const room = roomAtPoint(x, y);
    return room ? wallMaterial(roomWall(room, side)) : outside;
  };
  return [
    face(rect.x + rect.w + 1, cz, 'left'),
    face(rect.x - 1, cz, 'right'),
    material(COLORS.wallTop),
    outside,
    face(cx, rect.y + rect.h + 1, 'top'),
    face(cx, rect.y - 1, 'bottom'),
  ];
}

// Quader über einem Grundriss-Rechteck { x, y, w, h } zwischen den Höhen y0 und y1.
// mat: ein Material oder 'wall' (Material je Seite nach angrenzendem Raum).
function box(rect, y0, y1, mat, shadows = true) {
  const h = y1 - y0;
  if (h <= 0 || rect.w <= 0 || rect.h <= 0) return null;
  const geo = new THREE.BoxGeometry(rect.w, h, rect.h);
  geo.translate(rect.x + rect.w / 2, y0 + h / 2, rect.y + rect.h / 2);
  worldUV(geo);
  const mesh = new THREE.Mesh(geo, mat === 'wall' ? wallFaceMaterials(rect) : mat);
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
  const wallMat = 'wall';
  buildGaps = wallGaps();

  // Böden mit dem Belag des jeweiligen Raums: Räume, Nischen und Durchgänge.
  for (const r of state.rooms) box(roomRect(r), -2, 0, floorMaterial(roomFloor(r)), false);
  for (const ft of state.features) {
    if (ft.type === 'niche') box(nicheGeometry(ft).floor, -2, 0, floorMaterial(roomFloor(roomById(ft.roomId))), false);
  }
  for (const g of buildGaps) {
    const room = roomById(g.roomId);
    if (g.kind !== 'window' && room) box(gapRect(g), -2, 0, floorMaterial(roomFloor(room)), false);
  }

  // Wände, Vorsprünge und schräge Ecken.
  for (const p of wallPieces()) box(p.rect, 0, H, wallMat);
  for (const ft of state.features) {
    if (ft.type === 'pillar') box(pillarRect(ft), 0, H, wallMat);
    if (ft.type === 'chamfer') {
      const pts = chamferPoly(ft);
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      worldUV(geo);
      const room = roomById(ft.roomId);
      const mesh = new THREE.Mesh(geo, [material(COLORS.wallTop), wallMaterial(roomWall({ ...room, wallMaterials: {} }, 'top'))]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      content.add(mesh);
    }
  }

  // Stürze über Türen/Durchgängen, Brüstung, Sturz und Glas bei Fenstern.
  for (const g of buildGaps) {
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
  ground.material = state.ground === 'wiese' ? groundGrass() : material(COLORS.ground);
  fitShadows();
}

let grassGround = null;
function groundGrass() {
  if (!grassGround) {
    const base = floorMaterial('wiese');
    const texture = base.map.clone();
    texture.repeat.set(1 / 150, 1 / 150);
    grassGround = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
  }
  return grassGround;
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

  const groundGeo = new THREE.PlaneGeometry(100000, 100000);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, -3, 0);
  worldUV(groundGeo);
  ground = new THREE.Mesh(groundGeo, material(COLORS.ground));
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
