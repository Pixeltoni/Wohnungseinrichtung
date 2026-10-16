'use strict';

// Alle Maße und Koordinaten sind in Zentimetern.
// Raum-Maße (x, y, width, length) sind Innenmaße; die Wände liegen außen herum.
const STORAGE_KEY = 'wohnungseinrichtung.v1';
const GRID = 50;
const SNAP = 5;
const MARGIN = 120;
const WALL = 10;
const ROOM_SNAP = 30;
const FURNITURE_MAGNET = 15;
const MIN_ROOM = 50;
const MIN_OPENING = 30;

const SIDES = ['top', 'right', 'bottom', 'left'];
const SIDE_NAMES = { top: 'oben', right: 'rechts', bottom: 'unten', left: 'links' };
const OPENING_NAMES = { door: 'Tür', window: 'Fenster', passage: 'Durchgang' };
const OPENING_DEFAULT_WIDTH = { door: 90, window: 120, passage: 100 };
const WINDOW_SILL = 90; // übliche Brüstungshöhe (Unterkante Fenster) in cm
const MAX_SILL = 200;
const MIN_THICKNESS = 1;
const MAX_THICKNESS = 100;

// Wand-Details: Nische (Vertiefung nach außen), Vorsprung (ragt in den Raum),
// schräge Ecke. width/depth in cm; Nische und Vorsprung sitzen mit offset an einer Wand.
const FEATURE_NAMES = { niche: 'Nische', pillar: 'Vorsprung', chamfer: 'Schräge Ecke' };
const FEATURE_DEFAULTS = {
  niche: { width: 100, depth: 40 },
  pillar: { width: 40, depth: 30 },
  chamfer: { width: 60, depth: 60 },
};
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const CORNER_NAMES = {
  'top-left': 'oben links', 'top-right': 'oben rechts', 'bottom-right': 'unten rechts', 'bottom-left': 'unten links',
};
const MIN_FEATURE = 5;

// shape: 'rect' oder 'round'; floor: liegt am Boden (Teppich) und darf überlappt werden.
const CATALOG = [
  { group: 'Wohnen', name: 'Sofa', width: 220, depth: 95, color: '#c6b3e6' },
  { group: 'Wohnen', name: 'Sessel', width: 85, depth: 85, color: '#d6c7ee' },
  { group: 'Wohnen', name: 'Couchtisch', width: 110, depth: 60, color: '#e8c9a0' },
  { group: 'Wohnen', name: 'TV-Board', width: 180, depth: 45, color: '#cfd4da' },
  { group: 'Wohnen', name: 'Regal', width: 80, depth: 35, color: '#d6ead0' },
  { group: 'Wohnen', name: 'Teppich', width: 200, depth: 140, color: '#f1d9c7', floor: true },
  { group: 'Wohnen', name: 'Pflanze', width: 40, depth: 40, color: '#a8d5a2', shape: 'round' },
  { group: 'Schlafen', name: 'Doppelbett', width: 160, depth: 200, color: '#a7c7f2' },
  { group: 'Schlafen', name: 'Einzelbett', width: 90, depth: 200, color: '#bcd5f5' },
  { group: 'Schlafen', name: 'Nachttisch', width: 45, depth: 40, color: '#dcc3a1' },
  { group: 'Schlafen', name: 'Kleiderschrank', width: 200, depth: 60, color: '#b8d8b0' },
  { group: 'Schlafen', name: 'Kommode', width: 120, depth: 50, color: '#c9e2c1' },
  { group: 'Essen & Arbeiten', name: 'Esstisch', width: 160, depth: 90, color: '#deb887' },
  { group: 'Essen & Arbeiten', name: 'Runder Tisch', width: 110, depth: 110, color: '#deb887', shape: 'round' },
  { group: 'Essen & Arbeiten', name: 'Stuhl', width: 45, depth: 50, color: '#ecd3b0' },
  { group: 'Essen & Arbeiten', name: 'Schreibtisch', width: 140, depth: 70, color: '#d9b98c' },
  { group: 'Essen & Arbeiten', name: 'Bürostuhl', width: 60, depth: 60, color: '#cfd4da', shape: 'round' },
  { group: 'Küche', name: 'Küchenzeile', width: 240, depth: 60, color: '#e3e7eb' },
  { group: 'Küche', name: 'Kühlschrank', width: 60, depth: 65, color: '#dbe4ee' },
  { group: 'Küche', name: 'Herd', width: 60, depth: 60, color: '#c3ccd6' },
  { group: 'Küche', name: 'Spüle', width: 80, depth: 60, color: '#d5e3ef' },
  { group: 'Bad', name: 'Badewanne', width: 170, depth: 75, color: '#d4ecf7' },
  { group: 'Bad', name: 'Dusche', width: 90, depth: 90, color: '#d4ecf7' },
  { group: 'Bad', name: 'WC', width: 40, depth: 65, color: '#eef3f7' },
  { group: 'Bad', name: 'Waschbecken', width: 60, depth: 45, color: '#eef3f7' },
  { group: 'Bad', name: 'Waschmaschine', width: 60, depth: 60, color: '#dde3e9' },
];
const SHAPE_NAMES = { rect: 'Eckig', round: 'Rund / oval' };
const MIN_FURNITURE = 5;

const svg = document.getElementById('plan');
const selectionEl = document.getElementById('selection');
const snapEl = document.getElementById('snap');
const wallSnapEl = document.getElementById('wall-snap');
const WALL_SNAP_KEY = 'wohnungseinrichtung.wallSnap';

// Einrasten beim Ziehen von Wänden: Einstellung pro Browser merken.
try {
  if (localStorage.getItem(WALL_SNAP_KEY) === 'off') wallSnapEl.checked = false;
} catch {
  // Kein Speicher verfügbar – Standard (an) gilt.
}
wallSnapEl.addEventListener('change', () => {
  try {
    localStorage.setItem(WALL_SNAP_KEY, wallSnapEl.checked ? 'on' : 'off');
  } catch {
    // Einstellung gilt dann nur bis zum Neuladen.
  }
});

let state = load() || defaultState();
let selected = null; // { kind: 'room' | 'furniture' | 'wall' | 'opening', id, side? }
let drag = null;
let viewBox = null;
let planMode = null; // Zeichen-/Kalibriermodus, gesteuert von plan-import.js
let camera = null; // gezoomter/verschobener Ausschnitt { x, y, w, h } in cm; null = alles einpassen

// ---------- Zustand ----------

function defaultState() {
  return {
    rooms: [{
      id: uid(), name: 'Wohnzimmer', x: 0, y: 0, width: 500, length: 400,
      removedWalls: [], thickness: uniformThickness(WALL),
    }],
    furniture: [],
    openings: [],
    features: [],
    customCatalog: [], // eigene Möbel-Vorlagen
    wallHeight: 250, // für die 3D-Ansicht
    planOpacity: 1, // Deckkraft des gezeichneten Grundrisses
    background: null, // Grundrissbild: { dataUrl, width, height (px), scale (cm/px), x, y, opacity, visible }
  };
}

function uniformThickness(t) {
  return { top: t, right: t, bottom: t, left: t };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Ergänzt fehlende Felder, damit auch ältere gespeicherte Planungen funktionieren.
function normalize(data) {
  if (!data || !Array.isArray(data.rooms) || !Array.isArray(data.furniture)) return null;
  if (!Array.isArray(data.openings)) data.openings = [];
  for (const r of data.rooms) {
    if (!Array.isArray(r.removedWalls)) r.removedWalls = [];
    const t = r.thickness || {};
    r.thickness = {};
    for (const side of SIDES) r.thickness[side] = t[side] > 0 ? t[side] : WALL;
  }
  for (const f of data.furniture) {
    f.rotation = Number.isFinite(f.rotation) ? ((f.rotation % 360) + 360) % 360 : 0;
    if (!SHAPE_NAMES[f.shape]) f.shape = 'rect';
    f.floor = !!f.floor;
    if (!(f.height > 0)) delete f.height; // ohne eigene Höhe gilt die Standardhöhe nach Name
    if (typeof f.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(f.color)) f.color = '#cccccc';
  }
  data.openings = data.openings.filter((o) => data.rooms.some((r) => r.id === o.roomId));
  if (!Array.isArray(data.features)) data.features = [];
  data.features = data.features.filter((ft) => FEATURE_NAMES[ft.type]
    && data.rooms.some((r) => r.id === ft.roomId)
    && (ft.type === 'chamfer' ? CORNERS.includes(ft.corner) : SIDES.includes(ft.side))
    && ft.width > 0 && ft.depth > 0);
  if (!(data.wallHeight >= 100 && data.wallHeight <= 600)) data.wallHeight = 250;
  if (!(data.planOpacity >= 0.1 && data.planOpacity <= 1)) data.planOpacity = 1;
  if (!Array.isArray(data.customCatalog)) data.customCatalog = [];
  data.customCatalog = data.customCatalog.filter((c) => c && c.name && c.width > 0 && c.depth > 0);
  const bg = data.background;
  const bgValid = bg && typeof bg.dataUrl === 'string' && bg.dataUrl.startsWith('data:image/')
    && bg.width > 0 && bg.height > 0 && bg.scale > 0;
  data.background = bgValid ? bg : null;
  return data;
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return null;
  }
}

let saveWarningShown = false;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Speichern nicht möglich (privater Modus oder Speicher voll, z. B. durch ein großes
    // Grundrissbild) – Planung bleibt bis zum Neuladen erhalten.
    if (!saveWarningShown) {
      saveWarningShown = true;
      alert('Die Planung konnte nicht im Browser gespeichert werden (Speicher voll?). '
        + 'Nutze „Exportieren“, um sie als Datei zu sichern.');
    }
  }
}

function roomById(id) {
  return state.rooms.find((r) => r.id === id) || null;
}

function findItem(sel) {
  if (!sel) return null;
  if (sel.kind === 'room' || sel.kind === 'wall') return roomById(sel.id);
  if (sel.kind === 'furniture') return state.furniture.find((f) => f.id === sel.id) || null;
  if (sel.kind === 'opening') return state.openings.find((o) => o.id === sel.id) || null;
  if (sel.kind === 'feature') return state.features.find((ft) => ft.id === sel.id) || null;
  return null;
}

function isSelected(kind, id, side) {
  return !!selected && selected.kind === kind && selected.id === id && (side === undefined || selected.side === side);
}

function snap(v) {
  return snapEl.checked ? Math.round(v / SNAP) * SNAP : Math.round(v);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ---------- Geometrie ----------

// Möbel können beliebig gedreht sein (rotation in Grad, im Uhrzeigersinn).
// x/y ist die linke obere Ecke des umschließenden Rechtecks; bei 0/90/180/270°
// ist das genau das Möbelstück.
function trig(deg) {
  const a = ((deg % 360) + 360) % 360;
  if (a === 0) return [1, 0];
  if (a === 90) return [0, 1];
  if (a === 180) return [-1, 0];
  if (a === 270) return [0, -1];
  const rad = (a * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad)];
}

function footprint(f) {
  const [c, s] = trig(f.rotation);
  return {
    x: f.x,
    y: f.y,
    w: f.width * Math.abs(c) + f.depth * Math.abs(s),
    h: f.width * Math.abs(s) + f.depth * Math.abs(c),
  };
}

function furnitureCenter(f) {
  const fp = footprint(f);
  return [fp.x + fp.w / 2, fp.y + fp.h / 2];
}

// Lokale Möbel-Koordinaten (Mitte = 0/0, -y = Rückseite) in Weltkoordinaten.
function toWorld(f, lx, ly, center = furnitureCenter(f)) {
  const [c, s] = trig(f.rotation);
  return [center[0] + lx * c - ly * s, center[1] + lx * s + ly * c];
}

// Ecken des Möbelstücks; die erste Kante ist die Rückseite.
function furniturePoly(f) {
  const center = furnitureCenter(f);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => toWorld(f, (u * f.width) / 2, (v * f.depth) / 2, center));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function setCenter(f, cx, cy) {
  const fp = footprint(f);
  f.x = round1(cx - fp.w / 2);
  f.y = round1(cy - fp.h / 2);
}

function rectPoly(r) {
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
}

function polyCenter(poly) {
  const n = poly.length;
  return [poly.reduce((a, p) => a + p[0], 0) / n, poly.reduce((a, p) => a + p[1], 0) / n];
}

function projectPoly(poly, nx, ny) {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of poly) {
    const d = x * nx + y * ny;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

// Kleinste Verschiebung, die das (konvexe) Polygon a aus b herausschiebt, oder null.
// Überlappungen unter einem halben Zentimeter zählen nicht.
function satPush(a, b) {
  let best = null;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      let nx = y2 - y1;
      let ny = x1 - x2;
      const len = Math.hypot(nx, ny);
      if (!len) continue;
      nx /= len;
      ny /= len;
      const pa = projectPoly(a, nx, ny);
      const pb = projectPoly(b, nx, ny);
      const overlap = Math.min(pa[1], pb[1]) - Math.max(pa[0], pb[0]);
      if (overlap <= 0.5) return null;
      if (!best || overlap < best.d) best = { nx, ny, d: overlap };
    }
  }
  const [ax, ay] = polyCenter(a);
  const [bx, by] = polyCenter(b);
  if ((ax - bx) * best.nx + (ay - by) * best.ny < 0) {
    best.nx = -best.nx;
    best.ny = -best.ny;
  }
  return best;
}

function polysOverlap(a, b) {
  return satPush(a, b) !== null;
}

function roomRect(r) {
  return { x: r.x, y: r.y, w: r.width, h: r.length };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

function pointIn(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// Mittellinie einer Wand. axis 'h' = waagrecht, 'v' = senkrecht.
// start/end = Innenmaß der Wand, ext0/ext1 = Verlängerung über die Ecken (Dicke der Querwände).
// t = Wanddicke, inward = Richtung in den Raum.
function wallLine(r, side) {
  const t = r.thickness[side];
  const th = r.thickness;
  switch (side) {
    case 'top':
      return { axis: 'h', t, c: r.y - t / 2, start: r.x, end: r.x + r.width, ext0: th.left, ext1: th.right, inward: 1 };
    case 'bottom':
      return { axis: 'h', t, c: r.y + r.length + t / 2, start: r.x, end: r.x + r.width, ext0: th.left, ext1: th.right, inward: -1 };
    case 'left':
      return { axis: 'v', t, c: r.x - t / 2, start: r.y, end: r.y + r.length, ext0: th.top, ext1: th.bottom, inward: 1 };
    default:
      return { axis: 'v', t, c: r.x + r.width + t / 2, start: r.y, end: r.y + r.length, ext0: th.top, ext1: th.bottom, inward: -1 };
  }
}

function wallLength(r, side) {
  return side === 'top' || side === 'bottom' ? r.width : r.length;
}

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const OUTWARD = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

// Liegt Raum o direkt hinter der Wand `side` von Raum r (getrennt nur durch diese Wand)?
function isAdjacent(r, side, o, t = r.thickness[side]) {
  const near = (a, b) => Math.abs(a - b) < 1;
  const horizontalOverlap = o.x < r.x + r.width && r.x < o.x + o.width;
  const verticalOverlap = o.y < r.y + r.length && r.y < o.y + o.length;
  switch (side) {
    case 'top': return horizontalOverlap && near(o.y + o.length, r.y - t);
    case 'bottom': return horizontalOverlap && near(o.y, r.y + r.length + t);
    case 'left': return verticalOverlap && near(o.x + o.width, r.x - t);
    default: return verticalOverlap && near(o.x, r.x + r.width + t);
  }
}

function bandRect(axis, c, a, b, t) {
  return axis === 'h'
    ? { x: a, y: c - t / 2, w: b - a, h: t }
    : { x: c - t / 2, y: a, w: t, h: b - a };
}

// Zwei Wände liegen übereinander, wenn ihre Bänder sich quer zur Wand überdecken.
function sameWallBand(g, line) {
  return g.axis === line.axis && Math.abs(g.c - line.c) < (g.t + line.t) / 2 - 0.5;
}

// Brüstungshöhe eines Fensters (0 = bodentief).
function windowSill(o) {
  return Number.isFinite(o.sill) ? o.sill : WINDOW_SILL;
}

function openingSpan(o) {
  const r = roomById(o.roomId);
  const line = wallLine(r, o.side);
  const a = line.start + o.offset;
  return { line, a, b: a + o.width };
}

// ---------- Wand-Details ----------

// Abschnitt einer Wand (Innenkante), an dem eine Nische oder ein Vorsprung sitzt.
function featureSpan(ft) {
  const r = roomById(ft.roomId);
  const line = wallLine(r, ft.side);
  const a = line.start + ft.offset;
  return { r, line, a, b: a + ft.width };
}

// Vorsprung: Wandstück, das in den Raum ragt.
function pillarRect(ft) {
  const { r, a, b } = featureSpan(ft);
  const d = ft.depth;
  switch (ft.side) {
    case 'top': return { x: a, y: r.y, w: b - a, h: d };
    case 'bottom': return { x: a, y: r.y + r.length - d, w: b - a, h: d };
    case 'left': return { x: r.x, y: a, w: d, h: b - a };
    default: return { x: r.x + r.width - d, y: a, w: d, h: b - a };
  }
}

// Nische: Die Wand springt auf dem Abschnitt nach außen. Ergebnis: Bodenfläche,
// neue Wandstücke (Rückwand und zwei Seiten) und die Lücke in der alten Wand.
function nicheGeometry(ft) {
  const { r, line, a, b } = featureSpan(ft);
  const d = ft.depth;
  const t = line.t;
  const w = b - a;
  const gap = { kind: 'niche', axis: line.axis, c: line.c, t, a, b };
  switch (ft.side) {
    case 'top':
      return { gap, floor: { x: a, y: r.y - d, w, h: d },
        walls: [{ x: a - t, y: r.y - d - t, w: w + 2 * t, h: t }, { x: a - t, y: r.y - d, w: t, h: d }, { x: b, y: r.y - d, w: t, h: d }] };
    case 'bottom': {
      const y0 = r.y + r.length;
      return { gap, floor: { x: a, y: y0, w, h: d },
        walls: [{ x: a - t, y: y0 + d, w: w + 2 * t, h: t }, { x: a - t, y: y0, w: t, h: d }, { x: b, y: y0, w: t, h: d }] };
    }
    case 'left':
      return { gap, floor: { x: r.x - d, y: a, w: d, h: w },
        walls: [{ x: r.x - d - t, y: a - t, w: t, h: w + 2 * t }, { x: r.x - d, y: a - t, w: d, h: t }, { x: r.x - d, y: b, w: d, h: t }] };
    default: {
      const x0 = r.x + r.width;
      return { gap, floor: { x: x0, y: a, w: d, h: w },
        walls: [{ x: x0 + d, y: a - t, w: t, h: w + 2 * t }, { x: x0, y: a - t, w: d, h: t }, { x: x0, y: b, w: d, h: t }] };
    }
  }
}

// Schräge Ecke: Dreieck in der Raumecke (width waagrecht, depth senkrecht).
function chamferPoly(ft) {
  const r = roomById(ft.roomId);
  const left = r.x;
  const right = r.x + r.width;
  const top = r.y;
  const bottom = r.y + r.length;
  const a = ft.width;
  const b = ft.depth;
  switch (ft.corner) {
    case 'top-left': return [[left, top], [left + a, top], [left, top + b]];
    case 'top-right': return [[right, top], [right, top + b], [right - a, top]];
    case 'bottom-right': return [[right, bottom], [right - a, bottom], [right, bottom - b]];
    default: return [[left, bottom], [left, bottom - b], [left + a, bottom]];
  }
}

// Bodenfläche eines Raums inkl. Nischen, abzüglich Vorsprüngen und schrägen Ecken.
function roomArea(r) {
  let area = r.width * r.length;
  for (const ft of state.features) {
    if (ft.roomId !== r.id) continue;
    if (ft.type === 'niche') area += ft.width * ft.depth;
    else if (ft.type === 'pillar') area -= ft.width * ft.depth;
    else area -= (ft.width * ft.depth) / 2;
  }
  return area;
}

// Lücken in Wänden: entfernte Wände, Türen, Fenster und Durchgänge. Sie gelten
// auch für die deckungsgleiche Wand des Nachbarraums.
function wallGaps() {
  const gaps = [];
  for (const r of state.rooms) {
    for (const side of r.removedWalls) {
      const line = wallLine(r, side);
      gaps.push({ kind: 'removed', axis: line.axis, c: line.c, t: line.t, a: line.start, b: line.end });
    }
  }
  for (const o of state.openings) {
    const { line, a, b } = openingSpan(o);
    gaps.push({ kind: o.type, axis: line.axis, c: line.c, t: line.t, a, b, sill: o.type === 'window' ? windowSill(o) : undefined });
  }
  for (const ft of state.features) {
    if (ft.type === 'niche') gaps.push(nicheGeometry(ft).gap);
  }
  return gaps;
}

function gapRect(g) {
  return bandRect(g.axis, g.c, g.a, g.b, g.t);
}

function wallPieces(gaps = wallGaps()) {
  const pieces = [];
  for (const r of state.rooms) {
    for (const side of SIDES) {
      const line = wallLine(r, side);
      let parts = [[line.start - line.ext0, line.end + line.ext1]];
      for (const g of gaps) {
        if (!sameWallBand(g, line)) continue;
        parts = parts.flatMap(([a, b]) => {
          if (g.b <= a || g.a >= b) return [[a, b]];
          return [[a, g.a], [g.b, b]].filter(([s, e]) => e - s > 0.5);
        });
      }
      for (const [a, b] of parts) {
        pieces.push({ roomId: r.id, side, rect: bandRect(line.axis, line.c, a, b, line.t) });
      }
    }
  }
  for (const ft of state.features) {
    if (ft.type !== 'niche') continue;
    for (const rect of nicheGeometry(ft).walls) pieces.push({ roomId: ft.roomId, featureId: ft.id, rect });
  }
  return pieces;
}

// Bereiche, die Möbel nicht belegen dürfen: Wände, Fenster, Vorsprünge und
// schräge Ecken. rects dient zum Anrasten, polys zur Kollision.
function obstacles() {
  const gaps = wallGaps();
  const rects = wallPieces(gaps).map((p) => p.rect);
  for (const g of gaps) {
    if (g.kind === 'window') rects.push(gapRect(g));
  }
  for (const ft of state.features) {
    if (ft.type === 'pillar') rects.push(pillarRect(ft));
  }
  const polys = rects.map(rectPoly);
  for (const ft of state.features) {
    if (ft.type === 'chamfer') polys.push(chamferPoly(ft));
  }
  return { rects, polys };
}

// Begehbare Fläche: Rauminneres plus Öffnungen (entfernte Wände, Türen, Durchgänge).
function walkableRects() {
  const rects = state.rooms.map(roomRect);
  for (const g of wallGaps()) {
    if (g.kind !== 'window') rects.push(gapRect(g));
  }
  for (const ft of state.features) {
    if (ft.type === 'niche') rects.push(nicheGeometry(ft).floor);
  }
  return rects;
}

// Geometrie einer Tür: Angel H, Türblatt-Ende T (offen), Schließpunkt O.
// Die Tür ist in der Mitte der Wanddicke angeschlagen und schwenkt um 90°.
function doorGeometry(o) {
  const { line, a, b } = openingSpan(o);
  const n = line.inward * (o.swing === 'out' ? -1 : 1);
  const pt = (s, off) => (line.axis === 'h' ? [s, line.c + off] : [line.c + off, s]);
  const hingeT = o.hinge === 'end' ? b : a;
  const otherT = o.hinge === 'end' ? a : b;
  const H = pt(hingeT, 0);
  const O = pt(otherT, 0);
  const T = pt(hingeT, n * o.width);
  const xs = [H[0], O[0], T[0]];
  const ys = [H[1], O[1], T[1]];
  const swingBox = {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
  };
  return { H, O, T, swingBox, radius: o.width };
}

// Liegt ein Rechteck im Viertelkreis, den die Tür beim Öffnen überstreicht?
function hitsDoorSwing(rect, o) {
  const { H, swingBox, radius } = doorGeometry(o);
  const x1 = Math.max(rect.x, swingBox.x);
  const y1 = Math.max(rect.y, swingBox.y);
  const x2 = Math.min(rect.x + rect.w, swingBox.x + swingBox.w);
  const y2 = Math.min(rect.y + rect.h, swingBox.y + swingBox.h);
  if (x2 <= x1 || y2 <= y1) return false;
  const cx = clamp(H[0], x1, x2);
  const cy = clamp(H[1], y1, y2);
  return Math.hypot(cx - H[0], cy - H[1]) < radius;
}

// ---------- Ausrichten ----------

// Schiebt ein Möbelstück aus Wänden heraus; mit magnet rastet es an nahe Wände an.
function resolveFurniture(f, magnet, obs = obstacles()) {
  for (let i = 0; i < 12; i++) {
    const poly = furniturePoly(f);
    let hit = null;
    for (const o of obs.polys) {
      hit = satPush(poly, o);
      if (hit) break;
    }
    if (!hit) break;
    f.x = round1(f.x + hit.nx * hit.d);
    f.y = round1(f.y + hit.ny * hit.d);
  }
  // Anrasten nur bei rechtwinklig stehenden Möbeln.
  if (!magnet || f.rotation % 90 !== 0) return;
  const rects = obs.rects;

  const fp = footprint(f);
  let dx = null;
  let dy = null;
  for (const w of rects) {
    if (fp.y < w.y + w.h && w.y < fp.y + fp.h) {
      for (const d of [w.x + w.w - fp.x, w.x - (fp.x + fp.w)]) {
        if (Math.abs(d) > 0 && Math.abs(d) <= FURNITURE_MAGNET && (dx === null || Math.abs(d) < Math.abs(dx))) {
          if ((d < 0 && fp.x >= w.x + w.w) || (d > 0 && fp.x + fp.w <= w.x)) dx = d;
        }
      }
    }
    if (fp.x < w.x + w.w && w.x < fp.x + fp.w) {
      for (const d of [w.y + w.h - fp.y, w.y - (fp.y + fp.h)]) {
        if (Math.abs(d) > 0 && Math.abs(d) <= FURNITURE_MAGNET && (dy === null || Math.abs(d) < Math.abs(dy))) {
          if ((d < 0 && fp.y >= w.y + w.h) || (d > 0 && fp.y + fp.h <= w.y)) dy = d;
        }
      }
    }
  }
  const before = { x: f.x, y: f.y };
  if (dx !== null) f.x += dx;
  if (dy !== null) f.y += dy;
  // Falls das Anrasten in eine andere Wand führt, lieber nicht anrasten.
  const snapped = furniturePoly(f);
  if (obs.polys.some((o) => polysOverlap(snapped, o))) {
    f.x = before.x;
    f.y = before.y;
  }
}

function resolveAllFurniture() {
  const obs = obstacles();
  for (const f of state.furniture) resolveFurniture(f, false, obs);
}

// Türen, Fenster und Wand-Details an die (evtl. geänderte) Raumgröße anpassen.
function clampOpenings(r) {
  for (const o of state.openings) {
    if (o.roomId !== r.id) continue;
    const len = wallLength(r, o.side);
    o.width = Math.min(o.width, len);
    o.offset = clamp(o.offset, 0, len - o.width);
  }
  for (const ft of state.features) {
    if (ft.roomId !== r.id) continue;
    if (ft.type === 'chamfer') {
      ft.width = clamp(ft.width, MIN_FEATURE, r.width);
      ft.depth = clamp(ft.depth, MIN_FEATURE, r.length);
      continue;
    }
    const len = wallLength(r, ft.side);
    ft.width = clamp(ft.width, MIN_FEATURE, len);
    ft.offset = clamp(ft.offset, 0, len - ft.width);
    if (ft.type === 'pillar') ft.depth = clamp(ft.depth, MIN_FEATURE, wallLength(r, ft.side === 'top' || ft.side === 'bottom' ? 'left' : 'top') - MIN_FEATURE);
  }
}

// Räume rasten an Nachbarräume an, sodass genau eine Wand dazwischen liegt.
function snapRoomPosition(room, x, y) {
  let bestX = null;
  let bestY = null;
  for (const o of state.rooms) {
    if (o.id === room.id) continue;
    const t = o.thickness;
    const xs = [o.x + o.width + t.right, o.x - t.left - room.width, o.x, o.x + o.width - room.width];
    const ys = [o.y + o.length + t.bottom, o.y - t.top - room.length, o.y, o.y + o.length - room.length];
    for (const v of xs) {
      const d = Math.abs(v - x);
      if (d <= ROOM_SNAP && (!bestX || d < bestX.d)) bestX = { v, d };
    }
    for (const v of ys) {
      const d = Math.abs(v - y);
      if (d <= ROOM_SNAP && (!bestY || d < bestY.d)) bestY = { v, d };
    }
  }
  return [bestX ? bestX.v : x, bestY ? bestY.v : y];
}

// Verschiebt einen Raum samt der Möbel darin.
function moveRoom(r, x, y) {
  const dx = x - r.x;
  const dy = y - r.y;
  if (!dx && !dy) return;
  const inner = roomRect(r);
  for (const f of state.furniture) {
    if (contains(inner, footprint(f))) {
      f.x += dx;
      f.y += dy;
    }
  }
  r.x = x;
  r.y = y;
}

// Eine gemeinsame Wand hat auf beiden Seiten dieselbe Dicke: Ein angrenzender
// Raum übernimmt die Dicke vom Nachbarn.
function syncSharedWalls(room) {
  for (const side of SIDES) {
    for (const o of state.rooms) {
      if (o.id !== room.id && isAdjacent(o, OPPOSITE[side], room)) {
        room.thickness[side] = o.thickness[OPPOSITE[side]];
      }
    }
  }
}

// Ändert die Dicke einer Wand. Die Innenmaße bleiben gleich; direkt
// angrenzende Räume werden um die Differenz verschoben.
function setWallThickness(r, side, t) {
  const old = r.thickness[side];
  const delta = t - old;
  if (!delta) return;
  const [nx, ny] = OUTWARD[side];
  for (const o of state.rooms) {
    if (o.id === r.id || !isAdjacent(r, side, o, old)) continue;
    moveRoom(o, o.x + nx * delta, o.y + ny * delta);
    o.thickness[OPPOSITE[side]] = t;
  }
  r.thickness[side] = t;
}

// ---------- Verbundene Räume ----------

// Abstand zwischen den Innenkanten von r und o auf der Seite `side` von r
// (null, wenn o dort nicht gegenüberliegt).
function facingGap(r, side, o) {
  const hOverlap = o.x < r.x + r.width && r.x < o.x + o.width;
  const vOverlap = o.y < r.y + r.length && r.y < o.y + o.length;
  switch (side) {
    case 'right': return vOverlap ? o.x - (r.x + r.width) : null;
    case 'left': return vOverlap ? r.x - (o.x + o.width) : null;
    case 'bottom': return hOverlap ? o.y - (r.y + r.length) : null;
    default: return hOverlap ? r.y - (o.y + o.length) : null;
  }
}

// Berühren oder überlappen sich die Wände zweier Räume, werden sie zu einer
// gemeinsamen Wand: `room` rückt so, dass genau eine Wand dazwischen liegt.
function connectRoom(room) {
  for (const o of state.rooms) {
    if (o.id === room.id) continue;
    for (const side of SIDES) {
      const gap = facingGap(room, side, o);
      if (gap === null || gap < 0) continue;
      const own = room.thickness[side];
      const other = o.thickness[OPPOSITE[side]];
      if (gap > own + other + 2) continue;
      const t = Math.max(own, other);
      const [nx, ny] = OUTWARD[side];
      moveRoom(room, room.x + nx * (gap - t), room.y + ny * (gap - t));
      room.thickness[side] = t;
      o.thickness[OPPOSITE[side]] = t;
    }
  }
}

// Auch ältere Planungen mit doppelten Wänden zusammenführen.
function connectAllRooms() {
  const ordered = [...state.rooms].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const room of ordered.slice(1)) connectRoom(room);
}

// ---------- Räume an den Wänden größer/kleiner ziehen ----------

const EDGE_SNAP = 15;

function edgeOf(r, side) {
  switch (side) {
    case 'left': return r.x;
    case 'right': return r.x + r.width;
    case 'top': return r.y;
    default: return r.y + r.length;
  }
}

function roomSnapshot(r) {
  return {
    r, x: r.x, y: r.y, width: r.width, length: r.length,
    offsets: [...state.openings, ...state.features]
      .filter((o) => o.roomId === r.id && o.side)
      .map((o) => [o, o.offset]),
  };
}

// Türen, Fenster, Nischen und Vorsprünge bleiben an ihrer Stelle, wenn sich der Wandanfang verschiebt.
function keepOpeningsInPlace(s) {
  for (const [o, off] of s.offsets) {
    const horizontal = o.side === 'top' || o.side === 'bottom';
    o.offset = off - (horizontal ? s.r.x - s.x : s.r.y - s.y);
  }
  clampOpenings(s.r);
}

// Merkt sich Raum und Nachbarn hinter den bewegten Wänden. Eine gemeinsame Wand
// wird mitgezogen: Der Nachbarraum wird dabei entsprechend größer bzw. kleiner.
function beginResize(room, sides) {
  const neighbours = {};
  for (const side of sides) {
    neighbours[side] = state.rooms
      .filter((o) => o.id !== room.id && isAdjacent(room, side, o))
      .map(roomSnapshot);
  }
  return { room, sides, start: roomSnapshot(room), neighbours };
}

function applyResizeEdge(ctx, side, edge) {
  const { room: r, start: s } = ctx;
  const t = r.thickness[side];
  const ns = ctx.neighbours[side];
  let min = -Infinity;
  let max = Infinity;
  if (side === 'right') {
    min = s.x + MIN_ROOM;
    for (const n of ns) max = Math.min(max, n.x + n.width - MIN_ROOM - t);
  } else if (side === 'left') {
    max = s.x + s.width - MIN_ROOM;
    for (const n of ns) min = Math.max(min, n.x + MIN_ROOM + t);
  } else if (side === 'bottom') {
    min = s.y + MIN_ROOM;
    for (const n of ns) max = Math.min(max, n.y + n.length - MIN_ROOM - t);
  } else {
    max = s.y + s.length - MIN_ROOM;
    for (const n of ns) min = Math.max(min, n.y + MIN_ROOM + t);
  }
  edge = clamp(edge, min, max);

  if (side === 'left') { r.x = edge; r.width = s.x + s.width - edge; }
  if (side === 'right') r.width = edge - r.x;
  if (side === 'top') { r.y = edge; r.length = s.y + s.length - edge; }
  if (side === 'bottom') r.length = edge - r.y;

  for (const n of ns) {
    const o = n.r;
    if (side === 'right') { o.x = edge + t; o.width = n.x + n.width - o.x; }
    if (side === 'left') o.width = edge - t - o.x;
    if (side === 'bottom') { o.y = edge + t; o.length = n.y + n.length - o.y; }
    if (side === 'top') o.length = edge - t - o.y;
    keepOpeningsInPlace(n);
  }
  keepOpeningsInPlace(s);
}

// Gezogene Wand rastet an Kanten anderer Räume ein (bündig oder als gemeinsame Wand).
function snapEdge(ctx, side, edge) {
  const r = ctx.room;
  const moving = new Set([r.id, ...Object.values(ctx.neighbours).flat().map((n) => n.r.id)]);
  const vertical = side === 'left' || side === 'right';
  let best = null;
  for (const o of state.rooms) {
    if (moving.has(o.id)) continue;
    const candidates = vertical
      ? [o.x, o.x + o.width, side === 'right' ? o.x - r.thickness.right : o.x + o.width + r.thickness.left]
      : [o.y, o.y + o.length, side === 'bottom' ? o.y - r.thickness.bottom : o.y + o.length + r.thickness.top];
    for (const v of candidates) {
      const d = Math.abs(v - edge);
      if (d <= EDGE_SNAP && (!best || d < best.d)) best = { v, d };
    }
  }
  return best ? best.v : edge;
}

// Größe über das Panel ändern: wie das Ziehen der rechten bzw. unteren Wand.
function resizeRoomTo(r, key, value) {
  const side = key === 'width' ? 'right' : 'bottom';
  const ctx = beginResize(r, [side]);
  applyResizeEdge(ctx, side, (side === 'right' ? r.x : r.y) + value);
}

// ---------- Prüfungen ----------

function furnitureStatus() {
  const polys = state.furniture.map(furniturePoly);
  const walkable = walkableRects();
  const doors = state.openings.filter((o) => o.type === 'door');
  const status = new Map();
  state.furniture.forEach((f, i) => {
    // Teppiche (floor) dürfen unter anderen Möbeln und im Türschwenk liegen.
    const blocked = !f.floor && (
      state.furniture.some((g, j) => j !== i && !g.floor && polysOverlap(polys[i], polys[j]))
      || doors.some((o) => hitsDoorSwing(footprint(f), o)));
    status.set(f.id, blocked ? 'overlap' : isInside(f, walkable) ? 'ok' : 'outside');
  });
  return status;
}

// Stichproben-Prüfung, ob ein Möbelstück vollständig auf begehbarer Fläche steht.
function isInside(f, walkable) {
  const steps = 8;
  const center = furnitureCenter(f);
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const [x, y] = toWorld(f, f.width * (i / steps - 0.5) * 0.999, f.depth * (j / steps - 0.5) * 0.999, center);
      if (!walkable.some((r) => pointIn(r, x, y))) return false;
    }
  }
  return true;
}

// ---------- Darstellung ----------

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function backgroundRect() {
  const bg = state.background;
  return bg ? { x: bg.x, y: bg.y, w: bg.width * bg.scale, h: bg.height * bg.scale } : null;
}

function computeViewBox() {
  const rects = [...state.rooms.map(roomRect), ...state.furniture.map(footprint)];
  if (state.background && state.background.visible) rects.push(backgroundRect());
  if (rects.length === 0) return { x: -MARGIN, y: -MARGIN, w: 600, h: 500 };
  const minX = Math.min(...rects.map((r) => r.x)) - MARGIN;
  const minY = Math.min(...rects.map((r) => r.y)) - MARGIN;
  const maxX = Math.max(...rects.map((r) => r.x + r.w)) + MARGIN;
  const maxY = Math.max(...rects.map((r) => r.y + r.h)) + MARGIN;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function render() {
  if (is3d && view3d) view3d.requestUpdate();
  // Hat man gezoomt oder verschoben, gilt dieser Ausschnitt (camera). Sonst wird
  // alles eingepasst; während des Ziehens bleibt der Ausschnitt stehen.
  if (camera) viewBox = camera;
  else if ((!drag && !planMode) || !viewBox) viewBox = computeViewBox();
  const vb = viewBox;
  const font = Math.max(10, Math.min(vb.w, vb.h) / 50);
  const status = furnitureStatus();
  const gaps = wallGaps();
  const pieces = wallPieces(gaps);
  // Mit sichtbarem Grundrissbild werden Räume durchscheinend, damit man nachzeichnen kann.
  const showBg = !!(state.background && state.background.visible);
  const roomOpacity = showBg ? 0.55 : 1;

  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  renderBackground(vb);

  const roomFills = state.rooms.map((r) => `
    <rect class="room" data-kind="room" data-id="${r.id}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.length}"
      fill="${isSelected('room', r.id) ? '#eef4ff' : '#ffffff'}" fill-opacity="${roomOpacity}" />`).join('');

  const passages = gaps.filter((g) => g.kind === 'removed').map((g) => {
    const b = gapRect(g);
    return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#ffffff" fill-opacity="${roomOpacity}" pointer-events="none" />`;
  }).join('');

  const roomLabels = state.rooms.map((r) => roomLabelSvg(r, font)).join('');

  // Teppiche zuerst, damit sie unter den anderen Möbeln liegen.
  const furniture = [...state.furniture.filter((f) => f.floor), ...state.furniture.filter((f) => !f.floor)]
    .map((f) => furnitureSvg(f, status.get(f.id), font)).join('');

  const walls = pieces.map((p) => (p.featureId ? `
    <rect class="wall" data-kind="feature" data-id="${p.featureId}"
      x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" fill="${isSelected('feature', p.featureId) ? '#2f6fde' : '#3e4c59'}" />` : `
    <rect class="wall" data-kind="wall" data-id="${p.roomId}" data-side="${p.side}"
      x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" fill="#3e4c59" />`)).join('');

  // Nischen-Böden (wie Raumfläche) sowie Vorsprünge und schräge Ecken (wie Wand).
  const nicheFloors = state.features.filter((ft) => ft.type === 'niche').map((ft) => {
    const { floor: f, gap } = nicheGeometry(ft);
    const g = gapRect(gap);
    const fill = isSelected('feature', ft.id) ? '#dbe7ff' : '#ffffff';
    return `<g class="feature" data-kind="feature" data-id="${ft.id}">
      <rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="${fill}" fill-opacity="${roomOpacity}" />
      <rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="${fill}" fill-opacity="${roomOpacity}" /></g>`;
  }).join('');
  const solidFeatures = state.features.filter((ft) => ft.type !== 'niche').map((ft) => {
    const color = isSelected('feature', ft.id) ? '#2f6fde' : '#3e4c59';
    const shape = ft.type === 'pillar'
      ? (() => { const r = pillarRect(ft); return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${color}" />`; })()
      : `<polygon points="${chamferPoly(ft).map((pt) => pt.join(',')).join(' ')}" fill="${color}" />`;
    return `<g class="feature" data-kind="feature" data-id="${ft.id}">${shape}</g>`;
  }).join('');

  const removedWalls = state.rooms.flatMap((r) => r.removedWalls.map((side) => {
    const l = wallLine(r, side);
    const [x1, y1, x2, y2] = l.axis === 'h' ? [l.start, l.c, l.end, l.c] : [l.c, l.start, l.c, l.end];
    return `
      <g class="wall" data-kind="wall" data-id="${r.id}" data-side="${side}">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${Math.max(l.t, WALL) * 1.5}" />
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa5b1" stroke-width="1.5" stroke-dasharray="8 6" />
      </g>`;
  })).join('');

  const openings = state.openings.map(openingSvg).join('');
  // Türschwenk nochmals über den Möbeln, damit er sichtbar bleibt (nicht anklickbar).
  const doorSwings = state.openings.filter((o) => o.type === 'door')
    .map((o) => `<g pointer-events="none" opacity="0.8">${doorSwingSvg(o)}</g>`).join('');

  contentLayer.innerHTML = `
    ${roomFills}
    ${nicheFloors}
    ${passages}
    ${roomLabels}
    ${walls}
    ${solidFeatures}
    ${removedWalls}
    ${openings}
    ${furniture}
    ${doorSwings}`;
  // Deckkraft des gezeichneten Grundrisses (z. B. um das Grundrissbild darunter zu sehen).
  contentLayer.setAttribute('opacity', state.planOpacity);
  // Auswahl, Griffe und Hilfslinien bleiben immer voll sichtbar.
  overlayLayer.innerHTML = `
    ${selectionOverlay()}
    ${resizeHandles(font)}
    ${furnitureHandles(font)}
    ${typeof planModeOverlay === 'function' ? planModeOverlay(font) : ''}
    ${scaleBar(vb, font)}`;
}

// Raster und Grundrissbild liegen in eigenen Ebenen, damit das (große) Bild
// nicht bei jedem Neuzeichnen neu eingefügt werden muss.
svg.innerHTML = `
  <defs>
    <pattern id="grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">
      <path d="M ${GRID} 0 L 0 0 0 ${GRID}" fill="none" stroke="#dfe3e8" stroke-width="1" />
    </pattern>
  </defs>
  <rect id="grid-layer" fill="url(#grid)" />
  <image id="bg-layer" preserveAspectRatio="none" pointer-events="none" />
  <g id="content-layer"></g>
  <g id="overlay-layer"></g>`;
const gridLayer = svg.querySelector('#grid-layer');
const bgLayer = svg.querySelector('#bg-layer');
const contentLayer = svg.querySelector('#content-layer');
const overlayLayer = svg.querySelector('#overlay-layer');
let bgLayerSrc = null;

function renderBackground(vb) {
  // Raster großzügig über den Ausschnitt hinaus, damit auch die Ränder neben dem
  // (seitenverhältnis-treuen) Ausschnitt ein Raster haben.
  const grid = { x: vb.x - vb.w, y: vb.y - vb.h, width: vb.w * 3, height: vb.h * 3 };
  for (const [k, v] of Object.entries(grid)) gridLayer.setAttribute(k, v);
  const bg = state.background;
  if (!bg || !bg.visible) {
    bgLayer.setAttribute('display', 'none');
    return;
  }
  if (bgLayerSrc !== bg.dataUrl) {
    bgLayer.setAttribute('href', bg.dataUrl);
    bgLayerSrc = bg.dataUrl;
  }
  const r = backgroundRect();
  bgLayer.removeAttribute('display');
  for (const [k, v] of Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h, opacity: bg.opacity })) bgLayer.setAttribute(k, v);
}

function roomLabelSvg(r, font) {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.length / 2;
  const dim = font * 0.75;
  const pad = dim * 0.9;
  return `
    <g pointer-events="none" fill="#697586" font-size="${dim}">
      <text x="${cx}" y="${cy - font * 0.3}" font-size="${font}" text-anchor="middle" fill="#3e4c59" font-weight="600">${esc(r.name)}</text>
      <text x="${cx}" y="${cy + font * 0.9}" text-anchor="middle">${(roomArea(r) / 10000).toFixed(1)} m²</text>
      <text x="${cx}" y="${r.y + pad + dim * 0.4}" text-anchor="middle">${r.width} cm</text>
      <text x="${cx}" y="${r.y + r.length - pad}" text-anchor="middle">${r.width} cm</text>
      <text transform="translate(${r.x + pad + dim * 0.4} ${cy}) rotate(-90)" text-anchor="middle">${r.length} cm</text>
      <text transform="translate(${r.x + r.width - pad - dim * 0.4} ${cy}) rotate(90)" text-anchor="middle">${r.length} cm</text>
    </g>`;
}

function furnitureSvg(f, st, font) {
  const [cx, cy] = furnitureCenter(f);
  const isSel = isSelected('furniture', f.id);
  const stroke = isSel ? '#2f6fde' : st === 'overlap' ? '#d92d20' : st === 'outside' ? '#f79009' : '#52606d';
  const dash = (st === 'outside' && !isSel) || f.floor ? 'stroke-dasharray="8 6"' : '';
  const w = f.width;
  const d = f.depth;
  const style = `fill="${f.color}" fill-opacity="${f.floor ? 0.55 : 0.9}" stroke="${stroke}" stroke-width="${isSel ? 4 : 2.5}" ${dash}`;
  const body = f.shape === 'round'
    ? `<ellipse cx="0" cy="0" rx="${w / 2}" ry="${d / 2}" ${style} />`
    : `<rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" rx="4" ${style} />`;
  // Dicke Linie an der Rückseite (z. B. Kopfende vom Bett, Lehne vom Sofa).
  const back = f.shape === 'round' || f.floor ? ''
    : `<line x1="${-w / 2 + 4}" y1="${-d / 2 + 4}" x2="${w / 2 - 4}" y2="${-d / 2 + 4}" stroke="#1f2933" stroke-opacity="0.45" stroke-width="5" stroke-linecap="round" pointer-events="none" />`;
  const labelSize = Math.min(font * 0.8, Math.max(w, d) / 5, Math.min(w, d) / 2.5);
  return `
    <g class="furniture" data-kind="furniture" data-id="${f.id}">
      <g transform="translate(${cx} ${cy}) rotate(${f.rotation})">${body}${back}</g>
      <text x="${cx}" y="${cy}" font-size="${labelSize}" pointer-events="none"
        text-anchor="middle" dominant-baseline="middle" fill="#1f2933">${esc(f.name)}</text>
    </g>`;
}

// Griffe am ausgewählten Möbelstück: Größe (Seiten, Ecken) und Drehen (Kreis oben).
function furnitureHandles(font) {
  if (!selected || selected.kind !== 'furniture') return '';
  const f = findItem(selected);
  if (!f) return '';
  const [cx, cy] = furnitureCenter(f);
  const w = f.width / 2;
  const d = f.depth / 2;
  const size = font * 0.9;
  const sw = font * 0.15;
  const handle = (side, x, y) => `
    <rect class="handle" data-kind="fhandle" data-id="${f.id}" data-side="${side}"
      x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" rx="${size / 4}"
      fill="#ffffff" stroke="#2f6fde" stroke-width="${sw}" />`;
  const rotY = -d - font * 2;
  return `
    <g transform="translate(${cx} ${cy}) rotate(${f.rotation})">
      <line x1="0" y1="${-d}" x2="0" y2="${rotY}" stroke="#2f6fde" stroke-width="${sw}" pointer-events="none" />
      <circle class="rotate-handle" data-kind="frotate" data-id="${f.id}" cx="0" cy="${rotY}" r="${size * 0.65}"
        fill="#2f6fde" stroke="#ffffff" stroke-width="${sw}" />
      ${handle('top', 0, -d)}${handle('bottom', 0, d)}${handle('left', -w, 0)}${handle('right', w, 0)}
      ${handle('top-left', -w, -d)}${handle('top-right', w, -d)}${handle('bottom-left', -w, d)}${handle('bottom-right', w, d)}
    </g>`;
}

function openingSvg(o) {
  const { line, a, b } = openingSpan(o);
  const gap = bandRect(line.axis, line.c, a, b, line.t);
  const color = isSelected('opening', o.id) ? '#2f6fde' : '#3e4c59';
  const rect = `<rect x="${gap.x}" y="${gap.y}" width="${gap.w}" height="${gap.h}"`;
  let inner;
  if (o.type === 'passage') {
    // Wandöffnung ohne Tür: nur die Laibungen werden angedeutet.
    const jamb = (s) => (line.axis === 'h'
      ? `M ${s} ${gap.y} V ${gap.y + gap.h}`
      : `M ${gap.x} ${s} H ${gap.x + gap.w}`);
    const mid = line.axis === 'h' ? `M ${a} ${line.c} H ${b}` : `M ${line.c} ${a} V ${b}`;
    inner = `
      ${rect} fill="#ffffff" />
      <path d="${jamb(a)} ${jamb(b)}" stroke="${color}" stroke-width="3" />
      <path d="${mid}" stroke="${color}" stroke-width="1" stroke-dasharray="4 6" />`;
  } else if (o.type === 'window') {
    const along = (off) => (line.axis === 'h' ? `M ${a} ${line.c + off} H ${b}` : `M ${line.c + off} ${a} V ${b}`);
    // Bodentiefes Fenster: zwei Glaslinien statt einer, damit man es im Grundriss erkennt.
    const glass = windowSill(o) === 0 ? `${along(-line.t / 6)} ${along(line.t / 6)}` : along(0);
    inner = `
      ${rect} fill="#dbeafe" stroke="${color}" stroke-width="2" />
      <path d="${glass}" stroke="${color}" stroke-width="1.5" />`;
  } else {
    inner = `${rect} fill="#ffffff" />${doorSwingSvg(o)}`;
  }
  return `<g class="opening" data-kind="opening" data-id="${o.id}">${inner}</g>`;
}

// Türblatt (geöffnet) und Schwenkbogen.
function doorSwingSvg(o) {
  const { H, O, T, radius } = doorGeometry(o);
  const color = isSelected('opening', o.id) ? '#2f6fde' : '#3e4c59';
  const cross = (T[0] - H[0]) * (O[1] - H[1]) - (T[1] - H[1]) * (O[0] - H[0]);
  const sweep = cross > 0 ? 1 : 0;
  return `
    <path d="M ${T[0]} ${T[1]} A ${radius} ${radius} 0 0 ${sweep} ${O[0]} ${O[1]}"
      fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4" />
    <line x1="${H[0]}" y1="${H[1]}" x2="${T[0]}" y2="${T[1]}" stroke="${color}" stroke-width="4" stroke-linecap="round" />`;
}

function selectionOverlay() {
  if (!selected || selected.kind !== 'wall') return '';
  const r = roomById(selected.id);
  if (!r) return '';
  const l = wallLine(r, selected.side);
  const b = bandRect(l.axis, l.c, l.start, l.end, l.t);
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#2f6fde" fill-opacity="0.25"
    stroke="#2f6fde" stroke-width="3" pointer-events="none" />`;
}

// Griffe zum Größer-/Kleinerziehen am ausgewählten Raum: Wandmitten und Ecken.
function resizeHandles(font) {
  if (!selected || selected.kind !== 'room') return '';
  const r = roomById(selected.id);
  if (!r) return '';
  const t = r.thickness;
  const left = r.x - t.left / 2;
  const right = r.x + r.width + t.right / 2;
  const top = r.y - t.top / 2;
  const bottom = r.y + r.length + t.bottom / 2;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.length / 2;
  const long = font * 2.6;
  const short = font * 1.1;
  const handle = (side, x, y, w, h) => `
    <rect class="handle" data-kind="handle" data-id="${r.id}" data-side="${side}"
      x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) / 3}"
      fill="#ffffff" stroke="#2f6fde" stroke-width="${font * 0.15}" />`;
  return `
    <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.length}" fill="none"
      stroke="#2f6fde" stroke-width="${font * 0.12}" stroke-dasharray="${font * 0.5} ${font * 0.3}" pointer-events="none" />
    ${handle('top', cx, top, long, short)}
    ${handle('bottom', cx, bottom, long, short)}
    ${handle('left', left, cy, short, long)}
    ${handle('right', right, cy, short, long)}
    ${handle('top-left', left, top, short, short)}
    ${handle('top-right', right, top, short, short)}
    ${handle('bottom-left', left, bottom, short, short)}
    ${handle('bottom-right', right, bottom, short, short)}`;
}

function scaleBar(vb, font) {
  const x = vb.x + 20;
  const y = vb.y + vb.h - 25;
  return `
    <g pointer-events="none">
      <line x1="${x}" y1="${y}" x2="${x + 100}" y2="${y}" stroke="#3e4c59" stroke-width="3" />
      <line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y + 8}" stroke="#3e4c59" stroke-width="3" />
      <line x1="${x + 100}" y1="${y - 8}" x2="${x + 100}" y2="${y + 8}" stroke="#3e4c59" stroke-width="3" />
      <text x="${x + 50}" y="${y - 12}" font-size="${font * 0.8}" text-anchor="middle" fill="#3e4c59">1 m</text>
    </g>`;
}

function catalogButton(c, attrs) {
  return `<button type="button" ${attrs}>
      <span class="dot${c.shape === 'round' ? ' round' : ''}" style="background:${esc(c.color)}"></span><span class="label">${esc(c.name)}</span>
      <small>${c.width}×${c.depth}</small>
    </button>`;
}

function renderCatalog() {
  const el = document.getElementById('catalog');
  const groups = [];
  for (const [i, c] of CATALOG.entries()) {
    let g = groups.find((x) => x.name === c.group);
    if (!g) groups.push(g = { name: c.group, items: [] });
    g.items.push(catalogButton(c, `data-index="${i}"`));
  }
  const custom = state.customCatalog.map((c) => `<div class="custom-item">
      ${catalogButton(c, `data-custom="${c.id}"`)}
      <button type="button" class="remove" data-remove="${c.id}" title="Aus „Eigene Möbel“ entfernen" aria-label="${esc(c.name)} entfernen">×</button>
    </div>`).join('');
  el.innerHTML = (custom ? `<p class="catalog-group">Eigene Möbel</p><div class="catalog-grid">${custom}</div>` : '')
    + groups.map((g) => `<p class="catalog-group">${g.name}</p><div class="catalog-grid">${g.items.join('')}</div>`).join('');
}

document.getElementById('catalog').addEventListener('click', (e) => {
  const remove = e.target.closest('[data-remove]');
  if (remove) {
    state.customCatalog = state.customCatalog.filter((c) => c.id !== remove.dataset.remove);
    save();
    renderCatalog();
    return;
  }
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.custom) addFurniture(state.customCatalog.find((c) => c.id === btn.dataset.custom));
  else addFurniture(CATALOG[Number(btn.dataset.index)]);
});

// Eigenes Möbelstück aus dem Formular einfügen (und optional als Vorlage merken).
document.getElementById('custom-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const template = {
    id: uid(),
    name: String(data.get('name')).trim() || 'Möbelstück',
    width: Number(data.get('width')),
    depth: Number(data.get('depth')),
    color: String(data.get('color')),
    shape: SHAPE_NAMES[data.get('shape')] ? String(data.get('shape')) : 'rect',
    floor: data.get('floor') === 'on',
  };
  if (!(template.width >= MIN_FURNITURE && template.depth >= MIN_FURNITURE)) return;
  if (data.get('keep') === 'on') {
    state.customCatalog.push(template);
    renderCatalog();
  }
  addFurniture(template);
});

// ---------- Auswahl-Panel ----------

function numField(field, label, value, min) {
  const minAttr = min !== undefined ? `min="${min}"` : '';
  return `<label>${label} <input type="number" step="1" ${minAttr} data-field="${field}" value="${value}"></label>`;
}

function selectField(field, label, value, options) {
  const opts = options.map(([v, text]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${text}</option>`).join('');
  return `<label>${label} <select data-field="${field}">${opts}</select></label>`;
}

function renderSelection() {
  const item = findItem(selected);
  if (!item) {
    selected = null;
    selectionEl.innerHTML = '<p class="hint">Nichts ausgewählt. Klicke auf einen Raum, eine Wand oder ein Möbelstück.</p>';
    return;
  }
  const renderers = { room: roomPanel, wall: wallPanel, opening: openingPanel, feature: featurePanel, furniture: furniturePanel };
  selectionEl.innerHTML = renderers[selected.kind](item);
}

function roomPanel(r) {
  const walls = SIDES.map((side) => {
    const removed = r.removedWalls.includes(side);
    return `<button type="button" data-action="select-wall" data-side="${side}">
      Wand ${SIDE_NAMES[side]} · ${wallLength(r, side)} cm, ${r.thickness[side]} cm dick${removed ? ' (entfernt)' : ''}</button>`;
  }).join('');
  return `
    <p class="panel-title">Raum</p>
    <div class="grid-form">
      <label>Name <input data-field="name" value="${esc(r.name)}"></label>
      ${numField('width', 'Breite innen (cm)', r.width, MIN_ROOM)}
      ${numField('length', 'Länge innen (cm)', r.length, MIN_ROOM)}
      ${numField('x', 'Position X (cm)', r.x)}
      ${numField('y', 'Position Y (cm)', r.y)}
    </div>
    <p class="hint">Wände bearbeiten (Dicke, Türen, Fenster, Nischen, Vorsprünge, entfernen):</p>
    <div class="buttons stack">${walls}</div>
    <p class="hint">Ecke abschrägen:</p>
    <div class="buttons">${CORNERS.map((c) => `<button type="button" data-action="add-chamfer" data-corner="${c}">${CORNER_NAMES[c]}</button>`).join('')}</div>
    ${featureList(state.features.filter((ft) => ft.roomId === r.id && ft.type === 'chamfer'), 'Schräge Ecken:')}
    <div class="buttons">
      <button type="button" data-action="delete" class="danger">Raum löschen</button>
    </div>`;
}

function wallPanel(r) {
  const side = selected.side;
  const removed = r.removedWalls.includes(side);
  const list = state.openings
    .filter((o) => o.roomId === r.id && o.side === side)
    .map((o) => `<button type="button" data-action="select-opening" data-id="${o.id}">
      ${OPENING_NAMES[o.type]} · ${o.width} cm</button>`).join('');
  return `
    <p class="panel-title">Wand ${SIDE_NAMES[side]} – ${esc(r.name)}</p>
    <div class="grid-form">
      ${numField('wall-length', 'Länge innen (cm)', wallLength(r, side), MIN_ROOM)}
      ${numField('wall-thickness', 'Wanddicke (cm)', r.thickness[side], MIN_THICKNESS)}
    </div>
    <p class="hint">Bei einer gemeinsamen Wand ändert sich die Dicke für beide Räume; der Nachbarraum rückt entsprechend.</p>
    <div class="buttons">
      ${removed ? '' : '<button type="button" data-action="add-door">+ Tür</button>'}
      ${removed ? '' : '<button type="button" data-action="add-window">+ Fenster</button>'}
      ${removed ? '' : '<button type="button" data-action="add-passage">+ Durchgang (ohne Tür)</button>'}
      <button type="button" data-action="toggle-wall">${removed ? 'Wand wiederherstellen' : 'Ganze Wand entfernen'}</button>
    </div>
    ${list ? `<p class="hint">Öffnungen in dieser Wand:</p><div class="buttons stack">${list}</div>` : ''}
    ${removed ? '' : `
    <p class="hint">Wandform:</p>
    <div class="buttons">
      <button type="button" data-action="add-niche">+ Nische (Vertiefung)</button>
      <button type="button" data-action="add-pillar">+ Vorsprung</button>
    </div>`}
    ${featureList(state.features.filter((ft) => ft.roomId === r.id && ft.side === side), 'Nischen und Vorsprünge in dieser Wand:')}
    <div class="buttons"><button type="button" data-action="select-room">← Zum Raum</button></div>`;
}

function featureList(features, title) {
  if (!features.length) return '';
  const buttons = features.map((ft) => `<button type="button" data-action="select-feature" data-id="${ft.id}">
    ${FEATURE_NAMES[ft.type]}${ft.corner ? ` ${CORNER_NAMES[ft.corner]}` : ''} · ${ft.width} × ${ft.depth} cm</button>`).join('');
  return `<p class="hint">${title}</p><div class="buttons stack">${buttons}</div>`;
}

function featurePanel(ft) {
  const r = roomById(ft.roomId);
  if (ft.type === 'chamfer') {
    return `
      <p class="panel-title">Schräge Ecke ${CORNER_NAMES[ft.corner]} – ${esc(r.name)}</p>
      <div class="grid-form">
        ${numField('width', 'Länge waagrecht (cm)', ft.width, MIN_FEATURE)}
        ${numField('depth', 'Länge senkrecht (cm)', ft.depth, MIN_FEATURE)}
      </div>
      <div class="buttons">
        <button type="button" data-action="select-room" data-room="${r.id}">← Zum Raum</button>
        <button type="button" data-action="delete" class="danger">Löschen</button>
      </div>`;
  }
  const horizontal = ft.side === 'top' || ft.side === 'bottom';
  const what = ft.type === 'niche' ? 'Wie weit die Wand nach außen springt' : 'Wie weit es in den Raum ragt';
  return `
    <p class="panel-title">${FEATURE_NAMES[ft.type]} in Wand ${SIDE_NAMES[ft.side]} – ${esc(r.name)}</p>
    <div class="grid-form">
      ${numField('width', 'Breite (cm)', ft.width, MIN_FEATURE)}
      ${numField('depth', 'Tiefe (cm)', ft.depth, MIN_FEATURE)}
      ${numField('offset', `Abstand von ${horizontal ? 'links' : 'oben'} (cm)`, ft.offset, 0)}
    </div>
    <p class="hint">Tiefe: ${what}. Lässt sich auch mit der Maus entlang der Wand ziehen.</p>
    <div class="buttons">
      <button type="button" data-action="select-wall" data-side="${ft.side}" data-room="${ft.roomId}">← Zur Wand</button>
      <button type="button" data-action="delete" class="danger">Löschen</button>
    </div>`;
}

function openingPanel(o) {
  const r = roomById(o.roomId);
  const horizontal = o.side === 'top' || o.side === 'bottom';
  const doorFields = o.type === 'door' ? `
      ${selectField('hinge', 'Türangel', o.hinge, horizontal
        ? [['start', 'links'], ['end', 'rechts']]
        : [['start', 'oben'], ['end', 'unten']])}
      ${selectField('swing', 'Öffnet', o.swing, [['in', `in den Raum „${esc(r.name)}“`], ['out', 'nach außen / in den Nachbarraum']])}` : '';
  const windowFields = o.type === 'window' ? `
      <label class="check"><input type="checkbox" data-field="floorLevel" ${windowSill(o) === 0 ? 'checked' : ''}> Bis zum Boden (bodentief)</label>
      ${numField('sill', 'Brüstungshöhe über dem Boden (cm)', windowSill(o), 0)}` : '';
  return `
    <p class="panel-title">${OPENING_NAMES[o.type]} in Wand ${SIDE_NAMES[o.side]} – ${esc(r.name)}</p>
    <div class="grid-form">
      ${numField('width', 'Breite (cm)', o.width, MIN_OPENING)}
      ${numField('offset', `Abstand von ${horizontal ? 'links' : 'oben'} (cm)`, o.offset, 0)}
      ${doorFields}
      ${windowFields}
    </div>
    <p class="hint">Tipp: Die Öffnung lässt sich auch mit der Maus entlang der Wand ziehen.</p>
    <div class="buttons">
      <button type="button" data-action="select-wall" data-side="${o.side}" data-room="${o.roomId}">← Zur Wand</button>
      <button type="button" data-action="delete" class="danger">Löschen</button>
    </div>`;
}

function furniturePanel(f) {
  return `
    <p class="panel-title">Möbelstück</p>
    <div class="grid-form">
      <label>Name <input data-field="name" value="${esc(f.name)}"></label>
      ${numField('width', 'Breite (cm)', f.width, MIN_FURNITURE)}
      ${numField('depth', 'Tiefe (cm)', f.depth, MIN_FURNITURE)}
      <label>Höhe (cm, für 3D) <input type="number" step="1" min="1" data-field="height" value="${f.height || ''}" placeholder="automatisch"></label>
      ${numField('rotation', 'Drehung (Grad)', round1(f.rotation))}
      ${selectField('shape', 'Form', f.shape, Object.entries(SHAPE_NAMES))}
      <label>Farbe <input type="color" data-field="color" value="${esc(f.color)}"></label>
      <label class="check"><input type="checkbox" data-field="floor" ${f.floor ? 'checked' : ''}> Liegt am Boden (Teppich, darf überlappt werden)</label>
      ${numField('x', 'Position X (cm)', f.x)}
      ${numField('y', 'Position Y (cm)', f.y)}
    </div>
    <p class="hint">Am Plan: Griffe ziehen ändert die Größe, der runde Griff oben dreht (in 15°-Schritten, mit Alt frei).</p>
    <div class="buttons">
      <button type="button" data-action="rotate">Drehen (90°)</button>
      <button type="button" data-action="duplicate">Duplizieren</button>
      <button type="button" data-action="save-template">Als eigenes Möbel speichern</button>
      <button type="button" data-action="delete" class="danger">Löschen</button>
    </div>`;
}

// Aktualisiert Zahlenfelder im Panel, ohne gerade bearbeitete Felder zu stören.
function refreshFields() {
  const item = findItem(selected);
  if (!item) return;
  for (const input of selectionEl.querySelectorAll('[data-field]')) {
    if (document.activeElement === input) continue;
    const field = input.dataset.field;
    if (field === 'wall-length') input.value = wallLength(item, selected.side);
    else if (field === 'wall-thickness') input.value = item.thickness[selected.side];
    else if (field === 'floorLevel') input.checked = windowSill(item) === 0;
    else if (input.type === 'checkbox') input.checked = !!item[field];
    else if (field === 'rotation') input.value = round1(item.rotation);
    else if (field === 'height') input.value = item.height || '';
    else if (field === 'sill') input.value = windowSill(item);
    else if (field in item) input.value = item[field];
  }
}

// ---------- Aktionen ----------

function select(sel) {
  selected = sel;
  renderSelection();
  render();
}

function commit() {
  save();
  refreshFields();
  render();
}

function addRoom(name, width, length, thickness) {
  let x = 0;
  let y = 0;
  if (state.rooms.length) {
    const rightmost = state.rooms.reduce((a, b) => (a.x + a.width >= b.x + b.width ? a : b));
    x = rightmost.x + rightmost.width + rightmost.thickness.right;
    y = rightmost.y;
  }
  const room = { id: uid(), name, x, y, width, length, removedWalls: [], thickness: uniformThickness(thickness) };
  connectRoom(room);
  state.rooms.push(room);
  resolveAllFurniture();
  save();
  select({ kind: 'room', id: room.id });
}

function addFurniture(template) {
  const selRoom = selected && (selected.kind === 'room' || selected.kind === 'wall') ? findItem(selected) : null;
  const room = selRoom || state.rooms[0];
  const cx = room ? room.x + room.width / 2 : 0;
  const cy = room ? room.y + room.length / 2 : 0;
  const f = {
    id: uid(),
    name: template.name,
    width: template.width,
    depth: template.depth,
    color: template.color,
    shape: template.shape || 'rect',
    floor: !!template.floor,
    rotation: 0,
    x: snap(cx - template.width / 2),
    y: snap(cy - template.depth / 2),
  };
  state.furniture.push(f);
  resolveFurniture(f, false);
  save();
  select({ kind: 'furniture', id: f.id });
}

function addOpening(type) {
  const r = findItem(selected);
  const side = selected.side;
  const len = wallLength(r, side);
  const width = Math.min(OPENING_DEFAULT_WIDTH[type], len);
  const o = {
    id: uid(),
    type,
    roomId: r.id,
    side,
    width,
    offset: snap((len - width) / 2),
    hinge: 'start',
    swing: 'in',
  };
  state.openings.push(o);
  clampOpenings(r);
  resolveAllFurniture();
  save();
  select({ kind: 'opening', id: o.id });
}

function addFeature(type, corner) {
  const r = findItem(selected);
  const ft = { id: uid(), type, roomId: r.id, ...FEATURE_DEFAULTS[type] };
  if (type === 'chamfer') {
    ft.corner = corner;
  } else {
    ft.side = selected.side;
    ft.offset = snap((wallLength(r, ft.side) - ft.width) / 2);
  }
  state.features.push(ft);
  clampOpenings(r);
  resolveAllFurniture();
  save();
  select({ kind: 'feature', id: ft.id });
}

function toggleWall() {
  const r = findItem(selected);
  const side = selected.side;
  if (r.removedWalls.includes(side)) {
    r.removedWalls = r.removedWalls.filter((s) => s !== side);
    resolveAllFurniture();
  } else {
    r.removedWalls.push(side);
    // Öffnungen und Wand-Details einer entfernten Wand entfallen.
    state.openings = state.openings.filter((o) => !(o.roomId === r.id && o.side === side));
    state.features = state.features.filter((ft) => !(ft.roomId === r.id && ft.side === side));
  }
  save();
  renderSelection();
  render();
}

// Drehen um den Mittelpunkt.
function setRotation(f, deg) {
  const [cx, cy] = furnitureCenter(f);
  f.rotation = ((round1(deg) % 360) + 360) % 360;
  setCenter(f, cx, cy);
}

function rotateSelected(step = 90) {
  if (!selected || selected.kind !== 'furniture') return;
  const f = findItem(selected);
  setRotation(f, f.rotation + step);
  resolveFurniture(f, false);
  commit();
}

function saveAsTemplate() {
  const f = findItem(selected);
  if (!f) return;
  state.customCatalog.push({ id: uid(), name: f.name, width: f.width, depth: f.depth, color: f.color, shape: f.shape, floor: f.floor });
  save();
  renderCatalog();
  const btn = selectionEl.querySelector('[data-action="save-template"]');
  if (btn) btn.textContent = 'Gespeichert ✓';
}

function duplicateSelected() {
  if (!selected || selected.kind !== 'furniture') return;
  const f = findItem(selected);
  const copy = { ...f, id: uid(), x: f.x + 20, y: f.y + 20 };
  state.furniture.push(copy);
  resolveFurniture(copy, false);
  save();
  select({ kind: 'furniture', id: copy.id });
}

function deleteSelected() {
  if (!selected) return;
  const item = findItem(selected);
  if (selected.kind === 'room') {
    if (!confirm(`Raum „${item.name}“ löschen? Die Möbel darin bleiben erhalten.`)) return;
    state.rooms = state.rooms.filter((r) => r.id !== item.id);
    state.openings = state.openings.filter((o) => o.roomId !== item.id);
    state.features = state.features.filter((ft) => ft.roomId !== item.id);
  } else if (selected.kind === 'wall') {
    if (!item.removedWalls.includes(selected.side)) toggleWall();
    return;
  } else if (selected.kind === 'opening') {
    state.openings = state.openings.filter((o) => o.id !== item.id);
    save();
    select({ kind: 'wall', id: item.roomId, side: item.side });
    return;
  } else if (selected.kind === 'feature') {
    state.features = state.features.filter((ft) => ft.id !== item.id);
    save();
    select(item.side ? { kind: 'wall', id: item.roomId, side: item.side } : { kind: 'room', id: item.roomId });
    return;
  } else {
    state.furniture = state.furniture.filter((f) => f.id !== item.id);
  }
  save();
  select(null);
}

function moveSelected(dx, dy) {
  const item = findItem(selected);
  if (!item) return;
  if (selected.kind === 'room') {
    moveRoom(item, item.x + dx, item.y + dy);
    resolveAllFurniture();
  } else if (selected.kind === 'furniture') {
    item.x += dx;
    item.y += dy;
    resolveFurniture(item, false);
  } else if (selected.kind === 'opening' || (selected.kind === 'feature' && item.side)) {
    const horizontal = item.side === 'top' || item.side === 'bottom';
    item.offset += horizontal ? dx : dy;
    clampOpenings(roomById(item.roomId));
    resolveAllFurniture();
  } else {
    return;
  }
  commit();
}

function applyField(field, raw) {
  const item = findItem(selected);
  if (!item) return;
  if (field === 'name') {
    item.name = raw;
    commit();
    return;
  }
  if (field === 'hinge' || field === 'swing') {
    item[field] = raw;
    resolveAllFurniture();
    commit();
    return;
  }
  if (field === 'color' || field === 'shape') {
    item[field] = raw;
    commit();
    return;
  }
  if (field === 'floor') {
    item.floor = raw;
    commit();
    return;
  }
  if (field === 'floorLevel') {
    item.sill = raw ? 0 : WINDOW_SILL;
    commit();
    return;
  }
  if (field === 'sill') {
    const sill = Number(raw);
    if (raw === '' || !(sill >= 0 && sill <= MAX_SILL)) return;
    item.sill = sill;
    commit();
    return;
  }
  if (field === 'height' && raw === '') {
    delete item.height;
    commit();
    return;
  }
  const value = Number(raw);
  if (raw === '' || !Number.isFinite(value)) return;

  if (selected.kind === 'room' || selected.kind === 'wall') {
    if (field === 'x' || field === 'y') {
      moveRoom(item, field === 'x' ? value : item.x, field === 'y' ? value : item.y);
      connectRoom(item);
    } else if (field === 'wall-thickness') {
      if (value < MIN_THICKNESS || value > MAX_THICKNESS) return;
      setWallThickness(item, selected.side, value);
    } else {
      if (value < MIN_ROOM) return;
      const key = field === 'wall-length'
        ? (selected.side === 'top' || selected.side === 'bottom' ? 'width' : 'length')
        : field;
      resizeRoomTo(item, key, value);
    }
    resolveAllFurniture();
  } else if (selected.kind === 'opening') {
    if (field === 'width' && value < MIN_OPENING) return;
    if (field === 'offset' && value < 0) return;
    item[field] = value;
    clampOpenings(roomById(item.roomId));
    resolveAllFurniture();
  } else if (selected.kind === 'feature') {
    if ((field === 'width' || field === 'depth') && value < MIN_FEATURE) return;
    if (field === 'offset' && value < 0) return;
    item[field] = value;
    clampOpenings(roomById(item.roomId));
    resolveAllFurniture();
  } else {
    if ((field === 'width' || field === 'depth') && value < MIN_FURNITURE) return;
    if (field === 'height') {
      if (value < 1) return;
      item.height = value;
    } else if (field === 'rotation') {
      setRotation(item, value);
    } else if (field === 'width' || field === 'depth') {
      const [cx, cy] = furnitureCenter(item);
      item[field] = value;
      setCenter(item, cx, cy);
    } else {
      item[field] = value;
    }
    resolveFurniture(item, false);
  }
  commit();
}

// ---------- Ereignisse ----------

function toSvgPoint(e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// ---------- Ansicht: zoomen und verschieben ----------

const MIN_VIEW = 50; // cm
const MAX_VIEW = 50000;

function svgScale() {
  return svg.getScreenCTM().a; // Bildschirmpixel pro cm
}

function zoomAt(clientX, clientY, factor) {
  const cam = camera || { ...viewBox };
  const size = clamp(cam.w * factor, MIN_VIEW, MAX_VIEW);
  factor = size / cam.w;
  const p = toSvgPoint({ clientX, clientY });
  camera = {
    x: p.x - (p.x - cam.x) * factor,
    y: p.y - (p.y - cam.y) * factor,
    w: cam.w * factor,
    h: cam.h * factor,
  };
  render();
}

function zoomCenter(factor) {
  const box = svg.getBoundingClientRect();
  zoomAt(box.left + box.width / 2, box.top + box.height / 2, factor);
}

function panBy(dxPx, dyPx) {
  const cam = camera || { ...viewBox };
  const s = svgScale();
  camera = { ...cam, x: cam.x - dxPx / s, y: cam.y - dyPx / s };
  render();
}

function fitView() {
  camera = null;
  viewBox = null;
  render();
}

svg.addEventListener('wheel', (e) => {
  // Auch Strg+Mausrad und Trackpad-Zoom abfangen, damit nicht die ganze Seite zoomt.
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : 1;
  const factor = Math.exp(e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015));
  zoomAt(e.clientX, e.clientY, clamp(factor, 0.67, 1.5));
}, { passive: false });

document.getElementById('zoom-in').addEventListener('click', () => zoomCenter(1 / 1.3));
document.getElementById('zoom-out').addEventListener('click', () => zoomCenter(1.3));
document.getElementById('zoom-fit').addEventListener('click', fitView);

// Zwei Finger: zoomen und verschieben.
const touches = new Map();
let pinch = null;

function pinchState() {
  const [a, b] = [...touches.values()];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

svg.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    if (drag) endDrag();
    pinch = pinchState();
    e.stopImmediatePropagation();
  }
}, true);

svg.addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pinch || touches.size !== 2) return;
  e.stopImmediatePropagation();
  const now = pinchState();
  if (now.dist > 0) zoomAt(now.mid.x, now.mid.y, pinch.dist / now.dist);
  panBy(now.mid.x - pinch.mid.x, now.mid.y - pinch.mid.y);
  pinch = now;
}, true);

function endTouch(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
}
svg.addEventListener('pointerup', endTouch, true);
svg.addEventListener('pointercancel', endTouch, true);

// ---------- Ziehen: Räume, Wände, Möbel, Öffnungen, Ansicht ----------

// Wand des ausgewählten Raums (auch die gemeinsame Wand, die der Nachbar zeichnet)?
function selectedRoomSide(el) {
  if (!selected || selected.kind !== 'room') return null;
  const room = roomById(selected.id);
  if (!room) return null;
  if (el.dataset.id === room.id) return el.dataset.side;
  const other = roomById(el.dataset.id);
  const side = OPPOSITE[el.dataset.side];
  return other && isAdjacent(room, side, other) ? side : null;
}

function startResize(room, sides, e) {
  const p = toSvgPoint(e);
  drag = { kind: 'resize', item: room, ctx: beginResize(room, sides), grab: p, moved: false };
  svg.setPointerCapture(e.pointerId);
}

svg.addEventListener('pointerdown', (e) => {
  if (pinch) return;
  const el = e.target.closest('[data-kind]');
  // Leere Fläche oder mittlere Maustaste: Ansicht verschieben.
  if (!el || e.button === 1) {
    e.preventDefault();
    drag = { kind: 'pan', last: { x: e.clientX, y: e.clientY }, start: { x: e.clientX, y: e.clientY }, moved: false };
    svg.setPointerCapture(e.pointerId);
    return;
  }
  const kind = el.dataset.kind;
  if (kind === 'handle') {
    startResize(roomById(el.dataset.id), el.dataset.side.split('-'), e);
    return;
  }
  if (kind === 'fhandle' || kind === 'frotate') {
    const f = state.furniture.find((x) => x.id === el.dataset.id);
    drag = {
      kind, item: f, sides: kind === 'fhandle' ? el.dataset.side.split('-') : [],
      grab: toSvgPoint(e), start: { width: f.width, depth: f.depth, center: furnitureCenter(f) }, moved: false,
    };
    svg.setPointerCapture(e.pointerId);
    return;
  }
  if (kind === 'wall') {
    const side = selectedRoomSide(el);
    if (side) {
      startResize(roomById(selected.id), [side], e);
      return;
    }
  }
  const sel = kind === 'wall'
    ? { kind, id: el.dataset.id, side: el.dataset.side }
    : { kind, id: el.dataset.id };
  select(sel);
  if (kind === 'wall') return;

  const item = findItem(sel);
  const p = toSvgPoint(e);
  if (kind === 'feature' && !item.side) return; // schräge Ecken nur über das Panel
  if (kind === 'opening' || kind === 'feature') {
    const { line } = kind === 'opening' ? openingSpan(item) : featureSpan(item);
    const along = line.axis === 'h' ? p.x : p.y;
    drag = { kind, item, grab: along - (line.start + item.offset), moved: false };
  } else {
    drag = { kind, item, dx: p.x - item.x, dy: p.y - item.y, moved: false };
  }
  svg.setPointerCapture(e.pointerId);
  svg.classList.add('dragging');
});

svg.addEventListener('pointermove', (e) => {
  if (!drag || pinch) return;
  if (drag.kind === 'pan') {
    if (!drag.moved && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < 4) return;
    drag.moved = true;
    svg.classList.add('panning');
    panBy(e.clientX - drag.last.x, e.clientY - drag.last.y);
    drag.last = { x: e.clientX, y: e.clientY };
    return;
  }
  const p = toSvgPoint(e);
  const item = drag.item;
  if (drag.kind === 'resize') {
    const { ctx, grab } = drag;
    for (const side of ctx.sides) {
      const delta = side === 'left' || side === 'right' ? p.x - grab.x : p.y - grab.y;
      const raw = edgeOf(ctx.start, side) + delta;
      // Mit gedrückter Alt-Taste gilt beim Ziehen jeweils das Gegenteil der Einstellung.
      const snapping = wallSnapEl.checked !== e.altKey;
      applyResizeEdge(ctx, side, snapping ? snapEdge(ctx, side, snap(raw)) : Math.round(raw));
    }
  } else if (drag.kind === 'fhandle') {
    resizeFurniture(drag, p);
  } else if (drag.kind === 'frotate') {
    const [cx, cy] = drag.start.center;
    let deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
    if (snapEl.checked && !e.altKey) deg = Math.round(deg / 15) * 15;
    setRotation(item, deg);
    setCenter(item, cx, cy);
  } else if (drag.kind === 'opening' || drag.kind === 'feature') {
    const { line } = drag.kind === 'opening' ? openingSpan(item) : featureSpan(item);
    const along = line.axis === 'h' ? p.x : p.y;
    const offset = snap(along - drag.grab - line.start);
    if (offset === item.offset) return;
    item.offset = offset;
    clampOpenings(roomById(item.roomId));
  } else if (drag.kind === 'room') {
    const [x, y] = snapRoomPosition(item, snap(p.x - drag.dx), snap(p.y - drag.dy));
    if (x === item.x && y === item.y) return;
    moveRoom(item, x, y);
  } else {
    const x = snap(p.x - drag.dx);
    const y = snap(p.y - drag.dy);
    item.x = x;
    item.y = y;
    resolveFurniture(item, true);
  }
  drag.moved = true;
  refreshFields();
  render();
});

// Möbel-Größe über die Griffe: Die Maus wird ins gedrehte Möbel-Koordinatensystem
// umgerechnet; die gegenüberliegende Kante bleibt stehen.
function resizeFurniture(d, p) {
  const f = d.item;
  const [c, s] = trig(f.rotation);
  const dx = p.x - d.grab.x;
  const dy = p.y - d.grab.y;
  const du = dx * c + dy * s;
  const dv = -dx * s + dy * c;
  let left = -d.start.width / 2;
  let right = d.start.width / 2;
  let top = -d.start.depth / 2;
  let bottom = d.start.depth / 2;
  const size = (v) => Math.max(MIN_FURNITURE, snapEl.checked ? Math.round(v / SNAP) * SNAP : Math.round(v));
  if (d.sides.includes('right')) right = left + size(right + du - left);
  if (d.sides.includes('left')) left = right - size(right - (left + du));
  if (d.sides.includes('bottom')) bottom = top + size(bottom + dv - top);
  if (d.sides.includes('top')) top = bottom - size(bottom - (top + dv));
  f.width = right - left;
  f.depth = bottom - top;
  const [cx, cy] = toWorld(f, (left + right) / 2, (top + bottom) / 2, d.start.center);
  setCenter(f, cx, cy);
}

function endDrag() {
  if (!drag) return;
  const { moved, kind, item } = drag;
  drag = null;
  svg.classList.remove('dragging', 'panning');
  if (kind === 'pan') {
    if (!moved) select(null); // einfacher Klick ins Leere hebt die Auswahl auf
    return;
  }
  if (moved) {
    if (kind === 'room') connectRoom(item);
    if (kind === 'resize') syncSharedWalls(item);
    resolveAllFurniture();
    commit();
  } else if (kind === 'fhandle' || kind === 'frotate') {
    render();
  }
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

document.getElementById('room-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const width = Number(data.get('width'));
  const length = Number(data.get('length'));
  const thickness = Number(data.get('thickness'));
  if (width >= MIN_ROOM && length >= MIN_ROOM && thickness >= MIN_THICKNESS && thickness <= MAX_THICKNESS) {
    addRoom(String(data.get('name')).trim() || 'Zimmer', width, length, thickness);
  }
});

selectionEl.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (field) applyField(field, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
});

selectionEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'rotate') rotateSelected();
  else if (action === 'save-template') saveAsTemplate();
  else if (action === 'duplicate') duplicateSelected();
  else if (action === 'delete') deleteSelected();
  else if (action === 'toggle-wall') toggleWall();
  else if (action === 'add-door') addOpening('door');
  else if (action === 'add-window') addOpening('window');
  else if (action === 'add-passage') addOpening('passage');
  else if (action === 'add-niche') addFeature('niche');
  else if (action === 'add-pillar') addFeature('pillar');
  else if (action === 'add-chamfer') addFeature('chamfer', btn.dataset.corner);
  else if (action === 'select-feature') select({ kind: 'feature', id: btn.dataset.id });
  else if (action === 'select-room') select({ kind: 'room', id: btn.dataset.room || selected.id });
  else if (action === 'select-opening') select({ kind: 'opening', id: btn.dataset.id });
  else if (action === 'select-wall') {
    select({ kind: 'wall', id: btn.dataset.room || selected.id, side: btn.dataset.side });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if (is3d) return;
  if (e.key === '+' || e.key === '=') { zoomCenter(1 / 1.3); return; }
  if (e.key === '-') { zoomCenter(1.3); return; }
  if (e.key === '0') { fitView(); return; }
  if (!selected) return;
  const step = e.shiftKey ? 10 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) {
    e.preventDefault();
    moveSelected(...moves[e.key]);
  } else if (e.key === 'r' || e.key === 'R') {
    rotateSelected(e.shiftKey ? 15 : 90);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  } else if (e.key === 'Escape') {
    select(null);
  }
});

document.getElementById('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wohnungsplanung.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

const importFile = document.getElementById('import-file');
document.getElementById('import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file) return;
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!data) throw new Error('ungültig');
    replaceState(data);
  } catch {
    alert('Die Datei konnte nicht gelesen werden. Ist es eine exportierte Planung?');
  }
});

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Gesamte Planung löschen und neu beginnen?')) return;
  replaceState(defaultState());
});

// ---------- 3D-Ansicht ----------

let is3d = false;
let view3d = null; // Modul view3d.js, wird beim ersten Öffnen geladen
const view3dEl = document.getElementById('view3d');
const toggle3dBtn = document.getElementById('toggle-3d');
const lowWallsBtn = document.getElementById('low-walls');
const wallHeightEl = document.getElementById('wall-height');

// Muss bei Änderungen an view3d.js erhöht werden (umgeht alte Dateien im Browser-Cache).
const VIEW3D_VERSION = 10;

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

async function setView3d(on) {
  if (on && !hasWebGL()) {
    alert('Die 3D-Ansicht braucht WebGL, das in diesem Browser gerade nicht verfügbar ist.\n\n'
      + 'Meist hilft es, in den Browser-Einstellungen die Hardwarebeschleunigung einzuschalten '
      + '(Chrome/Edge: Einstellungen → System → „Grafikbeschleunigung verwenden“) und den Browser neu zu starten.');
    return;
  }
  if (on && !view3d) {
    toggle3dBtn.disabled = true;
    try {
      view3d = await import(`./view3d.js?v=${VIEW3D_VERSION}`);
    } catch (err) {
      alert('Die 3D-Ansicht konnte nicht geladen werden. Sie funktioniert nur über die Webseite '
        + `(nicht beim direkten Öffnen der Datei).\n\nTechnische Meldung: ${err && err.message ? err.message : err}`);
      return;
    } finally {
      toggle3dBtn.disabled = false;
    }
  }
  if (on) {
    try {
      view3d.show(view3dEl);
    } catch (err) {
      view3d.hide();
      alert(`Die 3D-Ansicht konnte nicht gestartet werden.\n\nTechnische Meldung: ${err && err.message ? err.message : err}`);
      return;
    }
  }
  is3d = on;
  document.body.classList.toggle('mode-3d', on);
  toggle3dBtn.textContent = on ? '2D-Grundriss' : '3D-Ansicht';
  wallHeightEl.value = state.wallHeight;
  if (on) {
    if (typeof setPlanMode === 'function' && planMode) setPlanMode(null);
  } else {
    view3d.hide();
    render();
  }
}

toggle3dBtn.addEventListener('click', () => setView3d(!is3d));
lowWallsBtn.addEventListener('click', () => {
  const low = !lowWallsBtn.classList.contains('active');
  lowWallsBtn.classList.toggle('active', low);
  view3d.setLowWalls(low);
});
document.getElementById('reset-camera').addEventListener('click', () => view3d.resetCamera());
wallHeightEl.addEventListener('input', () => {
  const value = Number(wallHeightEl.value);
  if (!(value >= 100 && value <= 600)) return;
  state.wallHeight = value;
  save();
  view3d.requestUpdate();
});

function replaceState(next) {
  state = next;
  planMode = null;
  camera = null;
  connectAllRooms();
  save();
  select(null);
  if (typeof updateImportPanel === 'function') updateImportPanel();
}

connectAllRooms();
resolveAllFurniture();
save();
renderCatalog();
renderSelection();
render();
