'use strict';

// Grundriss importieren: Bild als Hintergrund, Maßstab festlegen und Räume
// von Hand nachzeichnen.
// Nutzt die globalen Funktionen und den Zustand aus app.js.

const BG_MAX_PX = 1600; // Bilder werden verkleinert (Speicherplatz)
const BG_DEFAULT_SCALE = 1; // 1 px = 1 cm, bis der Maßstab festgelegt wird

const importEls = {
  file: document.getElementById('plan-file'),
  upload: document.getElementById('plan-upload'),
  tools: document.getElementById('plan-tools'),
  calibrate: document.getElementById('plan-calibrate'),
  trace: document.getElementById('plan-trace'),
  opacity: document.getElementById('plan-opacity'),
  toggle: document.getElementById('plan-toggle'),
  remove: document.getElementById('plan-remove'),
  scaleInfo: document.getElementById('plan-scale'),
  status: document.getElementById('plan-status'),
  hint: document.getElementById('mode-hint'),
};

// ---------- Hintergrundbild ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

// Verkleinert das Bild und legt es auf weißen Hintergrund (für transparente PNGs).
async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const factor = Math.min(1, BG_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * factor);
    const height = Math.round(img.naturalHeight * factor);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function handleUpload() {
  const file = importEls.file.files[0];
  importEls.file.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Bitte ein Bild hochladen (JPG, PNG, …). Bei einer PDF am besten einen Screenshot vom Grundriss machen.');
    return;
  }
  try {
    const img = await prepareImage(file);
    const old = state.background;
    state.background = {
      ...img,
      scale: BG_DEFAULT_SCALE,
      x: old ? old.x : 0,
      y: old ? old.y : 0,
      opacity: old ? old.opacity : 0.6,
      visible: true,
    };
    save();
    updateImportPanel();
    render();
    setStatus('Grundriss geladen. Lege als Nächstes den Maßstab fest.');
  } catch (err) {
    alert(err.message);
  }
}

function updateImportPanel() {
  const bg = state.background;
  importEls.tools.hidden = !bg;
  if (!bg) return;
  importEls.opacity.value = Math.round(bg.opacity * 100);
  importEls.toggle.textContent = bg.visible ? 'Bild ausblenden' : 'Bild einblenden';
  importEls.scaleInfo.textContent = `Bild: ${Math.round(bg.width * bg.scale)} × ${Math.round(bg.height * bg.scale)} cm`
    + ` (1 Pixel = ${bg.scale.toFixed(2)} cm)`;
  importEls.calibrate.classList.toggle('active', planMode?.type === 'calibrate');
  importEls.trace.classList.toggle('active', planMode?.type === 'trace');
}

function setStatus(text, isError = false) {
  importEls.status.textContent = text;
  importEls.status.classList.toggle('error', isError);
}

// ---------- Modi: Maßstab festlegen / Räume nachzeichnen ----------

const MODE_HINTS = {
  calibrate: 'Maßstab: Klicke auf den Anfang einer Strecke mit bekannter Länge (z. B. eine bemaßte Wand).',
  calibrate2: 'Maßstab: Klicke jetzt auf das Ende der Strecke.',
  trace: 'Nachzeichnen: Ziehe ein Rechteck entlang der Innenkanten eines Raums. Esc beendet.',
};

function setPlanMode(type) {
  planMode = type ? { type, points: [], preview: null } : null;
  if (type && state.background && !state.background.visible) state.background.visible = true;
  importEls.hint.hidden = !type;
  importEls.hint.textContent = type ? MODE_HINTS[type] : '';
  svg.classList.toggle('drawing', !!type);
  updateImportPanel();
  render();
}

function planModeOverlay(font) {
  if (!planMode) return '';
  const style = 'stroke="#d92d20" stroke-width="3" pointer-events="none"';
  if (planMode.type === 'calibrate') {
    const [a, b] = [planMode.points[0], planMode.preview];
    if (!a) return '';
    const dot = (p) => `<circle cx="${p.x}" cy="${p.y}" r="${font * 0.35}" fill="#d92d20" pointer-events="none" />`;
    return `${dot(a)}${b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${style} />${dot(b)}` : ''}`;
  }
  const r = planMode.preview;
  if (!r) return '';
  return `
    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#d92d20" fill-opacity="0.1" ${style} stroke-dasharray="10 6" />
    <text x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" font-size="${font}" text-anchor="middle" fill="#d92d20" pointer-events="none">
      ${Math.round(r.w)} × ${Math.round(r.h)} cm</text>`;
}

function rectFromPoints(a, b) {
  const x1 = snap(Math.min(a.x, b.x));
  const y1 = snap(Math.min(a.y, b.y));
  const x2 = snap(Math.max(a.x, b.x));
  const y2 = snap(Math.max(a.y, b.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function finishCalibration(a, b) {
  const measured = Math.hypot(b.x - a.x, b.y - a.y);
  setPlanMode(null);
  if (measured < 1) return;
  const answer = prompt('Wie lang ist diese Strecke in Wirklichkeit? (in cm, z. B. 350)');
  if (answer === null) return;
  const real = Number(answer.replace(',', '.'));
  if (!(real > 0)) {
    alert('Bitte eine Länge in Zentimetern eingeben.');
    return;
  }
  // Bild um seine linke obere Ecke skalieren.
  state.background.scale *= real / measured;
  save();
  updateImportPanel();
  render();
  setStatus('Maßstab festgelegt. Jetzt kannst du die Räume nachzeichnen.');
}

function finishTrace(rect) {
  if (rect.w < MIN_ROOM || rect.h < MIN_ROOM) return;
  const thickness = Number(document.querySelector('#room-form [name=thickness]').value) || WALL;
  const room = {
    id: uid(),
    name: `Raum ${state.rooms.length + 1}`,
    x: rect.x,
    y: rect.y,
    width: rect.w,
    length: rect.h,
    removedWalls: [],
    thickness: uniformThickness(thickness),
  };
  const [x, y] = snapRoomPosition(room, room.x, room.y);
  room.x = x;
  room.y = y;
  connectRoom(room);
  state.rooms.push(room);
  resolveAllFurniture();
  save();
  selected = { kind: 'room', id: room.id };
  renderSelection();
  render();
}

// Läuft vor den normalen Klick-Handlern (Capture), solange ein Modus aktiv ist.
svg.addEventListener('pointerdown', (e) => {
  // Mittlere Maustaste verschiebt auch in diesen Modi die Ansicht.
  if (!planMode || e.button === 1 || pinch) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  const p = toSvgPoint(e);
  if (planMode.type === 'calibrate') {
    if (!planMode.points.length) {
      planMode.points.push(p);
      importEls.hint.textContent = MODE_HINTS.calibrate2;
      render();
    } else {
      finishCalibration(planMode.points[0], p);
    }
    return;
  }
  planMode.points = [p];
  planMode.preview = rectFromPoints(p, p);
  svg.setPointerCapture(e.pointerId);
  render();
}, true);

svg.addEventListener('pointermove', (e) => {
  if (!planMode || !planMode.points.length) return;
  e.stopImmediatePropagation();
  const p = toSvgPoint(e);
  planMode.preview = planMode.type === 'calibrate' ? p : rectFromPoints(planMode.points[0], p);
  render();
}, true);

svg.addEventListener('pointerup', (e) => {
  if (!planMode || planMode.type !== 'trace' || !planMode.points.length) return;
  e.stopImmediatePropagation();
  const rect = planMode.preview;
  planMode.points = [];
  planMode.preview = null;
  finishTrace(rect);
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && planMode) {
    e.stopImmediatePropagation();
    setPlanMode(null);
  }
}, true);

// ---------- Bedienelemente ----------

importEls.upload.addEventListener('click', () => importEls.file.click());
importEls.file.addEventListener('change', handleUpload);
importEls.calibrate.addEventListener('click', () => setPlanMode(planMode?.type === 'calibrate' ? null : 'calibrate'));
importEls.trace.addEventListener('click', () => setPlanMode(planMode?.type === 'trace' ? null : 'trace'));
importEls.opacity.addEventListener('input', () => {
  state.background.opacity = Number(importEls.opacity.value) / 100;
  save();
  render();
});
importEls.toggle.addEventListener('click', () => {
  state.background.visible = !state.background.visible;
  if (!state.background.visible) setPlanMode(null);
  save();
  updateImportPanel();
  render();
});
importEls.remove.addEventListener('click', () => {
  if (!confirm('Grundrissbild entfernen? Die Räume bleiben erhalten.')) return;
  state.background = null;
  setPlanMode(null);
  save();
  updateImportPanel();
  render();
  setStatus('');
});

updateImportPanel();
