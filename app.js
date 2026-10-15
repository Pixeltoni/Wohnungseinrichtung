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
const MIN_THICKNESS = 1;
const MAX_THICKNESS = 100;

const CATALOG = [
  { name: 'Doppelbett', width: 160, depth: 200, color: '#a7c7f2' },
  { name: 'Einzelbett', width: 90, depth: 200, color: '#bcd5f5' },
  { name: 'Sofa', width: 220, depth: 95, color: '#c6b3e6' },
  { name: 'Sessel', width: 85, depth: 85, color: '#d6c7ee' },
  { name: 'Couchtisch', width: 110, depth: 60, color: '#e8c9a0' },
  { name: 'Esstisch', width: 160, depth: 90, color: '#deb887' },
  { name: 'Stuhl', width: 45, depth: 50, color: '#ecd3b0' },
  { name: 'Schreibtisch', width: 140, depth: 70, color: '#d9b98c' },
  { name: 'Kleiderschrank', width: 200, depth: 60, color: '#b8d8b0' },
  { name: 'Kommode', width: 120, depth: 50, color: '#c9e2c1' },
  { name: 'Regal', width: 80, depth: 35, color: '#d6ead0' },
  { name: 'TV-Board', width: 180, depth: 45, color: '#cfd4da' },
];

const svg = document.getElementById('plan');
const selectionEl = document.getElementById('selection');
const snapEl = document.getElementById('snap');

let state = load() || defaultState();
let selected = null; // { kind: 'room' | 'furniture' | 'wall' | 'opening', id, side? }
let drag = null;
let viewBox = null;

// ---------- Zustand ----------

function defaultState() {
  return {
    rooms: [{
      id: uid(), name: 'Wohnzimmer', x: 0, y: 0, width: 500, length: 400,
      removedWalls: [], thickness: uniformThickness(WALL),
    }],
    furniture: [],
    openings: [],
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
    if (![0, 90, 180, 270].includes(f.rotation)) f.rotation = 0;
  }
  data.openings = data.openings.filter((o) => data.rooms.some((r) => r.id === o.roomId));
  return data;
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Speichern nicht möglich (z. B. privater Modus) – Planung bleibt nur im Speicher.
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

// Gedrehte Möbel: bei 90°/270° sind Breite und Tiefe vertauscht.
function footprint(f) {
  const turned = f.rotation % 180 !== 0;
  return { x: f.x, y: f.y, w: turned ? f.depth : f.width, h: turned ? f.width : f.depth };
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

function openingSpan(o) {
  const r = roomById(o.roomId);
  const line = wallLine(r, o.side);
  const a = line.start + o.offset;
  return { line, a, b: a + o.width };
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
    gaps.push({ kind: o.type, axis: line.axis, c: line.c, t: line.t, a, b });
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
  return pieces;
}

// Bereiche, die Möbel nicht belegen dürfen: Wände und Fenster.
function obstacles() {
  const gaps = wallGaps();
  const rects = wallPieces(gaps).map((p) => p.rect);
  for (const g of gaps) {
    if (g.kind === 'window') rects.push(gapRect(g));
  }
  return rects;
}

// Begehbare Fläche: Rauminneres plus Öffnungen (entfernte Wände, Türen, Durchgänge).
function walkableRects() {
  const rects = state.rooms.map(roomRect);
  for (const g of wallGaps()) {
    if (g.kind !== 'window') rects.push(gapRect(g));
  }
  return rects;
}

// Geometrie einer Tür: Angel H, Türblatt-Ende T (offen), Schließpunkt O.
function doorGeometry(o) {
  const { line, a, b } = openingSpan(o);
  const n = line.inward * (o.swing === 'out' ? -1 : 1);
  const face = n * line.t / 2;
  const pt = (s, off) => (line.axis === 'h' ? [s, line.c + off] : [line.c + off, s]);
  const hingeT = o.hinge === 'end' ? b : a;
  const otherT = o.hinge === 'end' ? a : b;
  const H = pt(hingeT, face);
  const O = pt(otherT, face);
  const T = pt(hingeT, face + n * o.width);
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
function resolveFurniture(f, magnet, rects = obstacles()) {
  for (let i = 0; i < 10; i++) {
    const fp = footprint(f);
    const hit = rects.find((w) => overlaps(fp, w));
    if (!hit) break;
    const ox = Math.min(fp.x + fp.w - hit.x, hit.x + hit.w - fp.x);
    const oy = Math.min(fp.y + fp.h - hit.y, hit.y + hit.h - fp.y);
    if (ox < oy) {
      f.x += fp.x + fp.w / 2 < hit.x + hit.w / 2 ? hit.x - (fp.x + fp.w) : hit.x + hit.w - fp.x;
    } else {
      f.y += fp.y + fp.h / 2 < hit.y + hit.h / 2 ? hit.y - (fp.y + fp.h) : hit.y + hit.h - fp.y;
    }
  }
  if (!magnet) return;

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
  if (rects.some((w) => overlaps(footprint(f), w))) {
    f.x = before.x;
    f.y = before.y;
  }
}

function resolveAllFurniture() {
  const rects = obstacles();
  for (const f of state.furniture) resolveFurniture(f, false, rects);
}

function clampOpenings(r) {
  for (const o of state.openings) {
    if (o.roomId !== r.id) continue;
    const len = wallLength(r, o.side);
    o.width = Math.min(o.width, len);
    o.offset = clamp(o.offset, 0, len - o.width);
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

// ---------- Prüfungen ----------

function furnitureStatus() {
  const rects = state.furniture.map(footprint);
  const walkable = walkableRects();
  const doors = state.openings.filter((o) => o.type === 'door');
  const status = new Map();
  state.furniture.forEach((f, i) => {
    const fp = rects[i];
    const blocked = rects.some((r, j) => j !== i && overlaps(fp, r)) || doors.some((o) => hitsDoorSwing(fp, o));
    status.set(f.id, blocked ? 'overlap' : isInside(fp, walkable) ? 'ok' : 'outside');
  });
  return status;
}

// Stichproben-Prüfung, ob ein Möbelstück vollständig auf begehbarer Fläche steht.
function isInside(fp, walkable) {
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = fp.x + (fp.w * i) / steps;
      const y = fp.y + (fp.h * j) / steps;
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

function computeViewBox() {
  const rects = [...state.rooms.map(roomRect), ...state.furniture.map(footprint)];
  if (rects.length === 0) return { x: -MARGIN, y: -MARGIN, w: 600, h: 500 };
  const minX = Math.min(...rects.map((r) => r.x)) - MARGIN;
  const minY = Math.min(...rects.map((r) => r.y)) - MARGIN;
  const maxX = Math.max(...rects.map((r) => r.x + r.w)) + MARGIN;
  const maxY = Math.max(...rects.map((r) => r.y + r.h)) + MARGIN;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function render() {
  // Während des Ziehens bleibt der Ausschnitt stehen, damit nichts springt.
  if (!drag || !viewBox) viewBox = computeViewBox();
  const vb = viewBox;
  const font = Math.max(10, Math.min(vb.w, vb.h) / 50);
  const status = furnitureStatus();
  const gaps = wallGaps();
  const pieces = wallPieces(gaps);

  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  const roomFills = state.rooms.map((r) => `
    <rect class="room" data-kind="room" data-id="${r.id}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.length}"
      fill="${isSelected('room', r.id) ? '#eef4ff' : '#ffffff'}" />`).join('');

  const passages = gaps.filter((g) => g.kind === 'removed').map((g) => {
    const b = gapRect(g);
    return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#ffffff" pointer-events="none" />`;
  }).join('');

  const roomLabels = state.rooms.map((r) => roomLabelSvg(r, font)).join('');

  const furniture = state.furniture.map((f) => furnitureSvg(f, status.get(f.id), font)).join('');

  const walls = pieces.map((p) => `
    <rect class="wall" data-kind="wall" data-id="${p.roomId}" data-side="${p.side}"
      x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" fill="#3e4c59" />`).join('');

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

  svg.innerHTML = `
    <defs>
      <pattern id="grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">
        <path d="M ${GRID} 0 L 0 0 0 ${GRID}" fill="none" stroke="#dfe3e8" stroke-width="1" />
      </pattern>
    </defs>
    <rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="url(#grid)" />
    ${roomFills}
    ${passages}
    ${roomLabels}
    ${walls}
    ${removedWalls}
    ${openings}
    ${furniture}
    ${doorSwings}
    ${selectionOverlay()}
    ${scaleBar(vb, font)}`;
}

function roomLabelSvg(r, font) {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.length / 2;
  const dim = font * 0.75;
  const pad = dim * 0.9;
  return `
    <g pointer-events="none" fill="#697586" font-size="${dim}">
      <text x="${cx}" y="${cy - font * 0.3}" font-size="${font}" text-anchor="middle" fill="#3e4c59" font-weight="600">${esc(r.name)}</text>
      <text x="${cx}" y="${cy + font * 0.9}" text-anchor="middle">${(r.width * r.length / 10000).toFixed(1)} m²</text>
      <text x="${cx}" y="${r.y + pad + dim * 0.4}" text-anchor="middle">${r.width} cm</text>
      <text x="${cx}" y="${r.y + r.length - pad}" text-anchor="middle">${r.width} cm</text>
      <text transform="translate(${r.x + pad + dim * 0.4} ${cy}) rotate(-90)" text-anchor="middle">${r.length} cm</text>
      <text transform="translate(${r.x + r.width - pad - dim * 0.4} ${cy}) rotate(90)" text-anchor="middle">${r.length} cm</text>
    </g>`;
}

function furnitureSvg(f, st, font) {
  const fp = footprint(f);
  const isSel = isSelected('furniture', f.id);
  const stroke = isSel ? '#2f6fde' : st === 'overlap' ? '#d92d20' : st === 'outside' ? '#f79009' : '#52606d';
  const dash = st === 'outside' && !isSel ? 'stroke-dasharray="8 6"' : '';
  const labelSize = Math.min(font * 0.8, fp.w / 5, fp.h / 2.5);
  return `
    <g class="furniture" data-kind="furniture" data-id="${f.id}">
      <rect x="${fp.x}" y="${fp.y}" width="${fp.w}" height="${fp.h}" rx="4"
        fill="${f.color}" fill-opacity="0.9" stroke="${stroke}" stroke-width="${isSel ? 4 : 2.5}" ${dash} />
      ${backEdge(f, fp)}
      <text x="${fp.x + fp.w / 2}" y="${fp.y + fp.h / 2}" font-size="${labelSize}"
        text-anchor="middle" dominant-baseline="middle" fill="#1f2933">${esc(f.name)}</text>
    </g>`;
}

// Dicke Linie an der Rückseite (z. B. Kopfende vom Bett, Lehne vom Sofa).
function backEdge(f, fp) {
  const inset = 4;
  const lines = {
    0: [fp.x + inset, fp.y + inset, fp.x + fp.w - inset, fp.y + inset],
    90: [fp.x + fp.w - inset, fp.y + inset, fp.x + fp.w - inset, fp.y + fp.h - inset],
    180: [fp.x + inset, fp.y + fp.h - inset, fp.x + fp.w - inset, fp.y + fp.h - inset],
    270: [fp.x + inset, fp.y + inset, fp.x + inset, fp.y + fp.h - inset],
  };
  const [x1, y1, x2, y2] = lines[f.rotation];
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1f2933" stroke-opacity="0.45" stroke-width="5" stroke-linecap="round" pointer-events="none" />`;
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
    const mid = line.axis === 'h' ? `M ${a} ${line.c} H ${b}` : `M ${line.c} ${a} V ${b}`;
    inner = `
      ${rect} fill="#dbeafe" stroke="${color}" stroke-width="2" />
      <path d="${mid}" stroke="${color}" stroke-width="1.5" />`;
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

function renderCatalog() {
  const el = document.getElementById('catalog');
  el.innerHTML = CATALOG.map((c, i) => `
    <button type="button" data-index="${i}">
      <span class="dot" style="background:${c.color}"></span><span class="label">${esc(c.name)}</span>
      <small>${c.width}×${c.depth}</small>
    </button>`).join('');
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) addFurniture(CATALOG[Number(btn.dataset.index)]);
  });
}

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
  const renderers = { room: roomPanel, wall: wallPanel, opening: openingPanel, furniture: furniturePanel };
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
    <p class="hint">Wände bearbeiten (Dicke, Türen, Fenster, Durchgänge, entfernen):</p>
    <div class="buttons stack">${walls}</div>
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
    <div class="buttons"><button type="button" data-action="select-room">← Zum Raum</button></div>`;
}

function openingPanel(o) {
  const r = roomById(o.roomId);
  const horizontal = o.side === 'top' || o.side === 'bottom';
  const doorFields = o.type === 'door' ? `
      ${selectField('hinge', 'Türangel', o.hinge, horizontal
        ? [['start', 'links'], ['end', 'rechts']]
        : [['start', 'oben'], ['end', 'unten']])}
      ${selectField('swing', 'Öffnet', o.swing, [['in', `in den Raum „${esc(r.name)}“`], ['out', 'nach außen / in den Nachbarraum']])}` : '';
  return `
    <p class="panel-title">${OPENING_NAMES[o.type]} in Wand ${SIDE_NAMES[o.side]} – ${esc(r.name)}</p>
    <div class="grid-form">
      ${numField('width', 'Breite (cm)', o.width, MIN_OPENING)}
      ${numField('offset', `Abstand von ${horizontal ? 'links' : 'oben'} (cm)`, o.offset, 0)}
      ${doorFields}
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
      ${numField('width', 'Breite (cm)', f.width, 5)}
      ${numField('depth', 'Tiefe (cm)', f.depth, 5)}
      ${numField('x', 'Position X (cm)', f.x)}
      ${numField('y', 'Position Y (cm)', f.y)}
    </div>
    <div class="buttons">
      <button type="button" data-action="rotate">Drehen (90°)</button>
      <button type="button" data-action="duplicate">Duplizieren</button>
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
  syncSharedWalls(room);
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

function toggleWall() {
  const r = findItem(selected);
  const side = selected.side;
  if (r.removedWalls.includes(side)) {
    r.removedWalls = r.removedWalls.filter((s) => s !== side);
    resolveAllFurniture();
  } else {
    r.removedWalls.push(side);
    // Öffnungen einer entfernten Wand entfallen.
    state.openings = state.openings.filter((o) => !(o.roomId === r.id && o.side === side));
  }
  save();
  renderSelection();
  render();
}

function rotateSelected() {
  if (!selected || selected.kind !== 'furniture') return;
  const f = findItem(selected);
  const before = footprint(f);
  f.rotation = (f.rotation + 90) % 360;
  const after = footprint(f);
  // Um den Mittelpunkt drehen.
  f.x = snap(before.x + before.w / 2 - after.w / 2);
  f.y = snap(before.y + before.h / 2 - after.h / 2);
  resolveFurniture(f, false);
  commit();
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
  } else if (selected.kind === 'wall') {
    if (!item.removedWalls.includes(selected.side)) toggleWall();
    return;
  } else if (selected.kind === 'opening') {
    state.openings = state.openings.filter((o) => o.id !== item.id);
    save();
    select({ kind: 'wall', id: item.roomId, side: item.side });
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
  } else if (selected.kind === 'opening') {
    const horizontal = item.side === 'top' || item.side === 'bottom';
    item.offset += horizontal ? dx : dy;
    clampOpenings(roomById(item.roomId));
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
  const value = Number(raw);
  if (raw === '' || !Number.isFinite(value)) return;

  if (selected.kind === 'room' || selected.kind === 'wall') {
    if (field === 'x' || field === 'y') {
      moveRoom(item, field === 'x' ? value : item.x, field === 'y' ? value : item.y);
      syncSharedWalls(item);
    } else if (field === 'wall-thickness') {
      if (value < MIN_THICKNESS || value > MAX_THICKNESS) return;
      setWallThickness(item, selected.side, value);
    } else {
      if (value < MIN_ROOM) return;
      const key = field === 'wall-length'
        ? (selected.side === 'top' || selected.side === 'bottom' ? 'width' : 'length')
        : field;
      item[key] = value;
      clampOpenings(item);
    }
    resolveAllFurniture();
  } else if (selected.kind === 'opening') {
    if (field === 'width' && value < MIN_OPENING) return;
    if (field === 'offset' && value < 0) return;
    item[field] = value;
    clampOpenings(roomById(item.roomId));
    resolveAllFurniture();
  } else {
    if ((field === 'width' || field === 'depth') && value <= 0) return;
    item[field] = value;
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

svg.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-kind]');
  if (!el) {
    select(null);
    return;
  }
  const kind = el.dataset.kind;
  const sel = kind === 'wall'
    ? { kind, id: el.dataset.id, side: el.dataset.side }
    : { kind, id: el.dataset.id };
  select(sel);
  if (kind === 'wall') return;

  const item = findItem(sel);
  const p = toSvgPoint(e);
  if (kind === 'opening') {
    const { line } = openingSpan(item);
    const along = line.axis === 'h' ? p.x : p.y;
    drag = { kind, item, grab: along - (line.start + item.offset), moved: false };
  } else {
    drag = { kind, item, dx: p.x - item.x, dy: p.y - item.y, moved: false };
  }
  svg.setPointerCapture(e.pointerId);
  svg.classList.add('dragging');
});

svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toSvgPoint(e);
  const item = drag.item;
  if (drag.kind === 'opening') {
    const { line } = openingSpan(item);
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

function endDrag() {
  if (!drag) return;
  const { moved, kind, item } = drag;
  drag = null;
  svg.classList.remove('dragging');
  if (moved) {
    if (kind === 'room') syncSharedWalls(item);
    resolveAllFurniture();
    commit();
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
  if (field) applyField(field, e.target.value);
});

selectionEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'rotate') rotateSelected();
  else if (action === 'duplicate') duplicateSelected();
  else if (action === 'delete') deleteSelected();
  else if (action === 'toggle-wall') toggleWall();
  else if (action === 'add-door') addOpening('door');
  else if (action === 'add-window') addOpening('window');
  else if (action === 'add-passage') addOpening('passage');
  else if (action === 'select-room') select({ kind: 'room', id: selected.id });
  else if (action === 'select-opening') select({ kind: 'opening', id: btn.dataset.id });
  else if (action === 'select-wall') {
    select({ kind: 'wall', id: btn.dataset.room || selected.id, side: btn.dataset.side });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || !selected) return;
  const step = e.shiftKey ? 10 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) {
    e.preventDefault();
    moveSelected(...moves[e.key]);
  } else if (e.key === 'r' || e.key === 'R') {
    rotateSelected();
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
    state = data;
    save();
    select(null);
  } catch {
    alert('Die Datei konnte nicht gelesen werden. Ist es eine exportierte Planung?');
  }
});

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Gesamte Planung löschen und neu beginnen?')) return;
  state = defaultState();
  save();
  select(null);
});

resolveAllFurniture();
renderCatalog();
renderSelection();
render();
