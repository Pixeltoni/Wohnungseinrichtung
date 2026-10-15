'use strict';

// Alle Maße und Koordinaten sind in Zentimetern.
const STORAGE_KEY = 'wohnungseinrichtung.v1';
const GRID = 50;
const SNAP = 5;
const MARGIN = 100;
const WALL = 10;

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
let selected = null; // { kind: 'room' | 'furniture', id }
let drag = null;
let viewBox = null;

// ---------- Zustand ----------

function defaultState() {
  return {
    rooms: [{ id: uid(), name: 'Wohnzimmer', x: 0, y: 0, width: 500, length: 400 }],
    furniture: [],
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return isValidState(data) ? data : null;
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

function isValidState(data) {
  return data && Array.isArray(data.rooms) && Array.isArray(data.furniture);
}

function findItem(sel) {
  if (!sel) return null;
  const list = sel.kind === 'room' ? state.rooms : state.furniture;
  return list.find((item) => item.id === sel.id) || null;
}

// Gedrehte Möbel: bei 90°/270° sind Breite und Tiefe vertauscht.
function footprint(f) {
  const turned = f.rotation % 180 !== 0;
  return {
    x: f.x,
    y: f.y,
    w: turned ? f.depth : f.width,
    h: turned ? f.width : f.depth,
  };
}

function roomRect(r) {
  return { x: r.x, y: r.y, w: r.width, h: r.length };
}

function snap(v) {
  return snapEl.checked ? Math.round(v / SNAP) * SNAP : Math.round(v);
}

// ---------- Prüfungen ----------

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

function furnitureStatus() {
  const rects = state.furniture.map(footprint);
  const rooms = state.rooms.map(roomRect);
  const status = new Map();
  state.furniture.forEach((f, i) => {
    const overlap = rects.some((r, j) => j !== i && overlaps(rects[i], r));
    const inside = rooms.some((room) => contains(room, rects[i]));
    status.set(f.id, overlap ? 'overlap' : inside ? 'ok' : 'outside');
  });
  return status;
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
  const font = Math.max(10, Math.min(vb.w, vb.h) / 45);
  const status = furnitureStatus();

  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  const rooms = state.rooms.map((r) => {
    const isSel = selected && selected.kind === 'room' && selected.id === r.id;
    return `
      <g class="room" data-kind="room" data-id="${r.id}">
        <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.length}"
          fill="#ffffff" stroke="${isSel ? '#2f6fde' : '#3e4c59'}" stroke-width="${WALL}" />
        <text x="${r.x + 12}" y="${r.y + 12 + font}" font-size="${font}" fill="#3e4c59" font-weight="600">${esc(r.name)}</text>
        <text x="${r.x + 12}" y="${r.y + 16 + font * 2}" font-size="${font * 0.8}" fill="#697586">${r.width} × ${r.length} cm · ${(r.width * r.length / 10000).toFixed(1)} m²</text>
      </g>`;
  }).join('');

  const furniture = state.furniture.map((f) => {
    const fp = footprint(f);
    const isSel = selected && selected.kind === 'furniture' && selected.id === f.id;
    const st = status.get(f.id);
    const stroke = isSel ? '#2f6fde' : st === 'overlap' ? '#d92d20' : st === 'outside' ? '#f79009' : '#52606d';
    const dash = st === 'outside' && !isSel ? `stroke-dasharray="8 6"` : '';
    const labelSize = Math.min(font * 0.8, fp.w / 5, fp.h / 2.5);
    return `
      <g class="furniture" data-kind="furniture" data-id="${f.id}">
        <rect x="${fp.x}" y="${fp.y}" width="${fp.w}" height="${fp.h}" rx="4"
          fill="${f.color}" fill-opacity="0.9" stroke="${stroke}" stroke-width="${isSel ? 4 : 2.5}" ${dash} />
        ${backEdge(f, fp)}
        <text x="${fp.x + fp.w / 2}" y="${fp.y + fp.h / 2}" font-size="${labelSize}"
          text-anchor="middle" dominant-baseline="middle" fill="#1f2933">${esc(f.name)}</text>
      </g>`;
  }).join('');

  svg.innerHTML = `
    <defs>
      <pattern id="grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">
        <path d="M ${GRID} 0 L 0 0 0 ${GRID}" fill="none" stroke="#dfe3e8" stroke-width="1" />
      </pattern>
    </defs>
    <rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="url(#grid)" />
    ${rooms}
    ${furniture}
    ${scaleBar(vb, font)}`;
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

function renderSelection() {
  const item = findItem(selected);
  if (!item) {
    selectionEl.innerHTML = '<p class="hint">Nichts ausgewählt. Klicke auf einen Raum oder ein Möbelstück.</p>';
    return;
  }
  const isRoom = selected.kind === 'room';
  const sizeFields = isRoom
    ? `${numField('width', 'Breite (cm)', item.width, 50)}${numField('length', 'Länge (cm)', item.length, 50)}`
    : `${numField('width', 'Breite (cm)', item.width, 5)}${numField('depth', 'Tiefe (cm)', item.depth, 5)}`;
  selectionEl.innerHTML = `
    <div class="grid-form">
      <label>Name <input data-field="name" value="${esc(item.name)}"></label>
      ${sizeFields}
      ${numField('x', 'Position X (cm)', item.x)}
      ${numField('y', 'Position Y (cm)', item.y)}
    </div>
    <div class="buttons">
      ${isRoom ? '' : '<button type="button" data-action="rotate">Drehen (90°)</button>'}
      ${isRoom ? '' : '<button type="button" data-action="duplicate">Duplizieren</button>'}
      <button type="button" data-action="delete" class="danger">Löschen</button>
    </div>`;
}

function numField(field, label, value, min) {
  const minAttr = min !== undefined ? `min="${min}"` : '';
  return `<label>${label} <input type="number" step="1" ${minAttr} data-field="${field}" value="${value}"></label>`;
}

function updatePositionFields() {
  const item = findItem(selected);
  if (!item) return;
  for (const field of ['x', 'y']) {
    const input = selectionEl.querySelector(`[data-field="${field}"]`);
    if (input && document.activeElement !== input) input.value = item[field];
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
  render();
}

function addRoom(name, width, length) {
  const right = state.rooms.length ? Math.max(...state.rooms.map((r) => r.x + r.width)) : 0;
  const room = { id: uid(), name, x: state.rooms.length ? right : 0, y: 0, width, length };
  state.rooms.push(room);
  save();
  select({ kind: 'room', id: room.id });
}

function addFurniture(template) {
  const selRoom = selected && selected.kind === 'room' ? findItem(selected) : null;
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
  save();
  select({ kind: 'furniture', id: f.id });
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
  updatePositionFields();
  commit();
}

function duplicateSelected() {
  if (!selected || selected.kind !== 'furniture') return;
  const f = findItem(selected);
  const copy = { ...f, id: uid(), x: f.x + 20, y: f.y + 20 };
  state.furniture.push(copy);
  save();
  select({ kind: 'furniture', id: copy.id });
}

function deleteSelected() {
  if (!selected) return;
  if (selected.kind === 'room') {
    const room = findItem(selected);
    if (!confirm(`Raum „${room.name}“ löschen? Die Möbel darin bleiben erhalten.`)) return;
    state.rooms = state.rooms.filter((r) => r.id !== selected.id);
  } else {
    state.furniture = state.furniture.filter((f) => f.id !== selected.id);
  }
  save();
  select(null);
}

function moveSelected(dx, dy) {
  const item = findItem(selected);
  if (!item) return;
  item.x += dx;
  item.y += dy;
  updatePositionFields();
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
  const el = e.target.closest('[data-id]');
  if (!el) {
    select(null);
    return;
  }
  const sel = { kind: el.dataset.kind, id: el.dataset.id };
  const item = findItem(sel);
  const p = toSvgPoint(e);
  drag = { item, dx: p.x - item.x, dy: p.y - item.y, moved: false };
  svg.setPointerCapture(e.pointerId);
  svg.classList.add('dragging');
  select(sel);
});

svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toSvgPoint(e);
  const x = snap(p.x - drag.dx);
  const y = snap(p.y - drag.dy);
  if (x === drag.item.x && y === drag.item.y) return;
  // Räume nehmen beim Verschieben die Möbel darin mit.
  if (selected.kind === 'room') {
    const roomBefore = roomRect(drag.item);
    const ddx = x - drag.item.x;
    const ddy = y - drag.item.y;
    for (const f of state.furniture) {
      if (contains(roomBefore, footprint(f))) {
        f.x += ddx;
        f.y += ddy;
      }
    }
  }
  drag.item.x = x;
  drag.item.y = y;
  drag.moved = true;
  updatePositionFields();
  render();
});

function endDrag() {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  svg.classList.remove('dragging');
  if (moved) commit();
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

document.getElementById('room-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const width = Number(data.get('width'));
  const length = Number(data.get('length'));
  if (width > 0 && length > 0) addRoom(String(data.get('name')).trim() || 'Zimmer', width, length);
});

selectionEl.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const item = findItem(selected);
  if (!field || !item) return;
  if (field === 'name') {
    item.name = e.target.value;
  } else {
    const value = Number(e.target.value);
    if (!Number.isFinite(value)) return;
    if (['width', 'length', 'depth'].includes(field) && value <= 0) return;
    item[field] = value;
  }
  commit();
});

selectionEl.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (action === 'rotate') rotateSelected();
  if (action === 'duplicate') duplicateSelected();
  if (action === 'delete') deleteSelected();
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || !selected) return;
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
    const data = JSON.parse(await file.text());
    if (!isValidState(data)) throw new Error('ungültig');
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

renderCatalog();
renderSelection();
render();
