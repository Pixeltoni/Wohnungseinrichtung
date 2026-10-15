'use strict';

// Grundriss importieren: Bild als Hintergrund, Maßstab festlegen, Räume
// nachzeichnen und optional automatische Erkennung per Claude (eigener API-Schlüssel).
// Nutzt die globalen Funktionen und den Zustand aus app.js.

const BG_MAX_PX = 1600; // Bilder werden verkleinert (Speicherplatz, KI-Eingabe)
const BG_DEFAULT_SCALE = 1; // 1 px = 1 cm, bis der Maßstab festgelegt wird
const API_KEY_STORAGE = 'wohnungseinrichtung.apiKey';
const AI_MODEL = 'claude-opus-5-5';

const importEls = {
  file: document.getElementById('plan-file'),
  upload: document.getElementById('plan-upload'),
  tools: document.getElementById('plan-tools'),
  calibrate: document.getElementById('plan-calibrate'),
  trace: document.getElementById('plan-trace'),
  autofind: document.getElementById('plan-autofind'),
  wand: document.getElementById('plan-wand'),
  opacity: document.getElementById('plan-opacity'),
  toggle: document.getElementById('plan-toggle'),
  remove: document.getElementById('plan-remove'),
  scaleInfo: document.getElementById('plan-scale'),
  apiKey: document.getElementById('api-key'),
  rememberKey: document.getElementById('api-key-remember'),
  detect: document.getElementById('plan-detect'),
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
    setStatus('Grundriss geladen. Lege als Nächstes den Maßstab fest oder nutze die automatische Erkennung.');
  } catch (err) {
    alert(err.message);
  }
}

function updateImportPanel() {
  const bg = state.background;
  importEls.tools.hidden = !bg;
  importEls.detect.disabled = !bg;
  if (!bg) return;
  importEls.opacity.value = Math.round(bg.opacity * 100);
  importEls.toggle.textContent = bg.visible ? 'Bild ausblenden' : 'Bild einblenden';
  importEls.scaleInfo.textContent = `Bild: ${Math.round(bg.width * bg.scale)} × ${Math.round(bg.height * bg.scale)} cm`
    + ` (1 Pixel = ${bg.scale.toFixed(2)} cm)`;
  importEls.calibrate.classList.toggle('active', planMode?.type === 'calibrate');
  importEls.trace.classList.toggle('active', planMode?.type === 'trace');
  importEls.wand.classList.toggle('active', planMode?.type === 'wand');
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
  wand: 'Zauberstab: Klicke in einen Raum auf dem Bild, er wird automatisch erkannt. Esc beendet.',
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
  if (detectHighlight) {
    const h = detectHighlight;
    return `<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="#2f6fde" fill-opacity="0.2"
      stroke="#2f6fde" stroke-width="4" pointer-events="none" />`;
  }
  if (!planMode || planMode.type === 'wand') return '';
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
  state.background.calibrated = true;
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
  syncSharedWalls(room);
  state.rooms.push(room);
  resolveAllFurniture();
  save();
  selected = { kind: 'room', id: room.id };
  renderSelection();
  render();
}

// Läuft vor den normalen Klick-Handlern (Capture), solange ein Modus aktiv ist.
svg.addEventListener('pointerdown', (e) => {
  if (!planMode) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  const p = toSvgPoint(e);
  if (planMode.type === 'wand') {
    wandClick(p);
    return;
  }
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

// ---------- Erkennung ohne KI (room-detect.js) ----------

let detectHighlight = null; // Rechteck in cm, das beim Nachfragen markiert wird
let analysisCache = null;

async function getAnalysis() {
  const bg = state.background;
  if (analysisCache && analysisCache.src === bg.dataUrl) return analysisCache.result;
  const img = await loadImage(bg.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = bg.width;
  canvas.height = bg.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, bg.width, bg.height);
  const result = analyzePlanImage(ctx.getImageData(0, 0, bg.width, bg.height));
  analysisCache = { src: bg.dataUrl, result };
  return result;
}

function pxRectToCm(r) {
  const bg = state.background;
  return { x: bg.x + r.x * bg.scale, y: bg.y + r.y * bg.scale, w: r.w * bg.scale, h: r.h * bg.scale };
}

// Ohne festgelegten Maßstab: nach der echten Breite eines erkannten Raums fragen.
async function ensureScale(pxRect) {
  const bg = state.background;
  if (bg.calibrated) return true;
  detectHighlight = pxRectToCm(pxRect);
  render();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const answer = prompt('Der Maßstab ist noch nicht festgelegt.\n'
    + 'Wie breit ist der blau markierte Raum in Wirklichkeit (waagrecht, Innenmaß in cm)?');
  detectHighlight = null;
  const real = Number(String(answer ?? '').replace(',', '.'));
  if (!(real > 0)) {
    render();
    return false;
  }
  bg.scale = real / pxRect.w;
  bg.calibrated = true;
  updateImportPanel();
  return true;
}

// Position und Wanddicken kommen direkt aus dem Bild (pro Seite gemessen).
function roomFromPxRect(r, analysis, name) {
  const c = pxRectToCm(r);
  const thickness = {};
  for (const side of SIDES) {
    thickness[side] = clamp(Math.round(measureWallPx(analysis, r, side) * state.background.scale), 5, 60);
  }
  return {
    id: uid(),
    name,
    x: snap(c.x),
    y: snap(c.y),
    width: Math.max(MIN_ROOM, snap(c.w)),
    length: Math.max(MIN_ROOM, snap(c.h)),
    removedWalls: [],
    thickness,
  };
}

// Benachbarte Räume teilen sich genau eine Wand: Ihr Abstand wird zur Wanddicke
// beider Seiten (gleicht Rundungen beim Umrechnen aus).
const MAX_SHARED_WALL = 60;

function joinNeighbours(room) {
  for (const o of state.rooms) {
    if (o.id === room.id) continue;
    const hOverlap = o.x < room.x + room.width && room.x < o.x + o.width;
    const vOverlap = o.y < room.y + room.length && room.y < o.y + o.length;
    const pairs = [
      [vOverlap, o.x - (room.x + room.width), 'right'],
      [vOverlap, room.x - (o.x + o.width), 'left'],
      [hOverlap, o.y - (room.y + room.length), 'bottom'],
      [hOverlap, room.y - (o.y + o.length), 'top'],
    ];
    for (const [overlap, gap, side] of pairs) {
      if (overlap && gap > 0 && gap <= MAX_SHARED_WALL) {
        room.thickness[side] = gap;
        o.thickness[OPPOSITE[side]] = gap;
      }
    }
  }
}

// Stoßen zwei erkannte Räume aneinander, ohne dass im Bild eine Wand dazwischen ist
// (z. B. die zwei Teile eines L-förmigen Raums), wird dort ein Durchgang eingesetzt.
function addOpenConnections(analysis) {
  const bg = state.background;
  const toPx = (v, origin) => (v - origin) / bg.scale;
  for (const r of state.rooms) {
    for (const o of state.rooms) {
      if (o === r) continue;
      let span;
      let band;
      if (o.x > r.x + r.width - 1 && isAdjacent(r, 'right', o)) {
        span = [Math.max(r.y, o.y), Math.min(r.y + r.length, o.y + o.length)];
        band = [r.x + r.width, span[0], o.x, span[1]];
        if (span[1] - span[0] < MIN_OPENING) continue;
        if (rectWallFraction(analysis, toPx(band[0], bg.x), toPx(band[1], bg.y), toPx(band[2], bg.x), toPx(band[3], bg.y)) > 0.3) continue;
        state.openings.push({ id: uid(), type: 'passage', roomId: r.id, side: 'right', offset: span[0] - r.y, width: span[1] - span[0], hinge: 'start', swing: 'in' });
      } else if (o.y > r.y + r.length - 1 && isAdjacent(r, 'bottom', o)) {
        span = [Math.max(r.x, o.x), Math.min(r.x + r.width, o.x + o.width)];
        band = [span[0], r.y + r.length, span[1], o.y];
        if (span[1] - span[0] < MIN_OPENING) continue;
        if (rectWallFraction(analysis, toPx(band[0], bg.x), toPx(band[1], bg.y), toPx(band[2], bg.x), toPx(band[3], bg.y)) > 0.3) continue;
        state.openings.push({ id: uid(), type: 'passage', roomId: r.id, side: 'bottom', offset: span[0] - r.x, width: span[1] - span[0], hinge: 'start', swing: 'in' });
      }
    }
  }
}

async function wandClick(p) {
  const bg = state.background;
  const analysis = await getAnalysis();
  const found = detectRoomAt(analysis, (p.x - bg.x) / bg.scale, (p.y - bg.y) / bg.scale);
  if (!found) {
    setStatus('Dort ist eine Wand oder außerhalb des Bilds – bitte mitten in einen Raum klicken.', true);
    return;
  }
  if (found.outside) {
    setStatus('Hier wurde kein geschlossener Raum gefunden (reicht bis zum Bildrand).', true);
    return;
  }
  if (!(await ensureScale(found.rect))) return;
  const room = roomFromPxRect(found.rect, analysis, `Raum ${state.rooms.length + 1}`);
  state.rooms.push(room);
  joinNeighbours(room);
  resolveAllFurniture();
  save();
  selected = { kind: 'room', id: room.id };
  renderSelection();
  render();
  setStatus(`„${room.name}“ erkannt: ${room.width} × ${room.length} cm. Name und Maße kannst du links anpassen.`);
}

async function autoFindRooms() {
  if (!state.background) return;
  const hasRooms = state.rooms.length > 0;
  if (hasRooms && !confirm('Die gefundenen Räume ersetzen die aktuellen Räume, Türen und Fenster. Möbel bleiben erhalten. Fortfahren?')) return;
  setPlanMode(null);
  setStatus('Suche Räume …');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const analysis = await getAnalysis();
  const rects = detectAllRooms(analysis);
  if (!rects.length) {
    setStatus('Keine Räume gefunden. Klappt am besten mit dunklen Wänden auf hellem Grund – sonst den Zauberstab oder das Nachzeichnen nutzen.', true);
    return;
  }
  const largest = rects.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
  if (!(await ensureScale(largest))) {
    setStatus('Abgebrochen – ohne Maßstab lassen sich keine Maße berechnen.', true);
    return;
  }
  state.rooms = [];
  state.openings = [];
  const ordered = [...rects].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  ordered.forEach((r, i) => state.rooms.push(roomFromPxRect(r, analysis, `Raum ${i + 1}`)));
  state.rooms.forEach(joinNeighbours);
  addOpenConnections(analysis);
  state.background.visible = true;
  resolveAllFurniture();
  save();
  selected = null;
  renderSelection();
  render();
  setStatus(`${state.rooms.length} Räume gefunden. Bitte prüfen: Fehlende Räume mit dem Zauberstab ergänzen, `
    + 'falsche anklicken und löschen. Türen und Fenster über die Wände einsetzen.');
}

// ---------- Automatische Erkennung per Claude ----------

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cm_per_pixel', 'wall_thickness_cm', 'rooms', 'openings'],
  properties: {
    cm_per_pixel: { type: 'number', description: 'Real centimeters per image pixel' },
    wall_thickness_cm: { type: 'number', description: 'Typical interior wall thickness in cm' },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'x_px', 'y_px', 'width_px', 'height_px', 'width_cm', 'length_cm'],
        properties: {
          name: { type: 'string' },
          x_px: { type: 'number' },
          y_px: { type: 'number' },
          width_px: { type: 'number' },
          height_px: { type: 'number' },
          width_cm: { type: 'number', description: 'Labeled interior width in cm, 0 if not readable' },
          length_cm: { type: 'number', description: 'Labeled interior length (vertical) in cm, 0 if not readable' },
        },
      },
    },
    openings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'room_index', 'side', 'offset_px', 'width_px', 'hinge', 'swing'],
        properties: {
          type: { type: 'string', enum: ['door', 'window', 'passage'] },
          room_index: { type: 'integer' },
          side: { type: 'string', enum: ['top', 'right', 'bottom', 'left'] },
          offset_px: { type: 'number' },
          width_px: { type: 'number' },
          hinge: { type: 'string', enum: ['start', 'end'] },
          swing: { type: 'string', enum: ['in', 'out'] },
        },
      },
    },
  },
};

function detectionPrompt(width, height) {
  return `This image is an apartment floor plan, ${width} × ${height} pixels. Convert it into data for a furniture-planning app.

Rooms: Approximate every room (including hallway, bathroom, kitchen, storage, balcony) as an axis-aligned rectangle covering its interior floor, i.e. bounded by the inner faces of the surrounding walls. Give x_px/y_px (top-left corner) and width_px/height_px in pixels of this image, origin at the image's top-left. Split L-shaped or irregular rooms into several rectangles that share the same name plus a suffix ("Flur 1", "Flur 2"). Use the room names printed on the plan (keep their language); if none, use a descriptive German name. If the plan prints the room's dimensions (e.g. "3,50 × 4,20" or "3.50 m"), put the interior width (horizontal) and length (vertical) in cm into width_cm/length_cm; otherwise 0.

Scale: Estimate cm_per_pixel from printed dimensions or dimension lines first, then from room areas (m²), and only if neither exists from typical sizes (interior doors are about 80–90 cm wide).

Walls: wall_thickness_cm is the typical interior wall thickness.

Openings: List every door, window and doorless opening ("passage") in a room's wall. room_index refers to the rooms array; side is which wall of that room's rectangle it is in. offset_px is the distance from the wall's start (left end for top/bottom walls, top end for left/right walls) of that room's rectangle to the opening, width_px its width. Assign a door to the room it swings into, with swing "in"; hinge "start" if the hinge is at the end nearer the wall's start, otherwise "end". For windows and passages use hinge "start" and swing "in".`;
}

let anthropicModule = null;

async function loadAnthropic() {
  if (!anthropicModule) anthropicModule = await import('./vendor/anthropic-sdk.mjs');
  return anthropicModule.default;
}

function describeApiError(Anthropic, err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Der API-Schlüssel ist ungültig.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Der API-Schlüssel hat keine Berechtigung für dieses Modell.';
  if (err instanceof Anthropic.RateLimitError) return 'Zu viele Anfragen oder kein Guthaben – bitte später erneut versuchen.';
  if (err instanceof Anthropic.APIConnectionError) return 'Keine Verbindung zur API. Bist du online?';
  if (err instanceof Anthropic.APIError) return `Fehler der API (${err.status ?? '?'}): ${err.message}`;
  return err.message || String(err);
}

async function detectRooms() {
  const bg = state.background;
  if (!bg) return;
  const apiKey = importEls.apiKey.value.trim();
  if (!apiKey) {
    setStatus('Bitte zuerst deinen Anthropic-API-Schlüssel eingeben.', true);
    importEls.apiKey.focus();
    return;
  }
  const hasPlan = state.rooms.length > 0 || state.furniture.length > 0;
  if (hasPlan && !confirm('Die erkannten Räume ersetzen die aktuellen Räume, Türen und Fenster. Möbel bleiben erhalten. Fortfahren?')) return;
  rememberApiKey();

  importEls.detect.disabled = true;
  setStatus('Grundriss wird analysiert … das kann bis zu einer Minute dauern.');
  let Anthropic;
  try {
    Anthropic = await loadAnthropic();
  } catch {
    setStatus('Die KI-Erkennung funktioniert nur über die veröffentlichte Webseite, nicht beim direkten Öffnen der Datei.', true);
    importEls.detect.disabled = false;
    return;
  }

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: bg.dataUrl.split(',')[1] } },
          { type: 'text', text: detectionPrompt(bg.width, bg.height) },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.');
    if (response.stop_reason === 'max_tokens') throw new Error('Die Antwort der KI war zu lang. Versuche einen kleineren Ausschnitt.');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const plan = JSON.parse(text);
    const count = applyDetectedPlan(plan);
    setStatus(`${count} Räume erkannt. Bitte prüfen: Maße, Türen und Fenster lassen sich anklicken und korrigieren.`);
  } catch (err) {
    setStatus(err instanceof SyntaxError ? 'Die Antwort der KI konnte nicht gelesen werden.' : describeApiError(Anthropic, err), true);
  } finally {
    importEls.detect.disabled = false;
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

// Wandelt die KI-Antwort (Pixel) in Räume, Wände und Öffnungen (cm) um.
function applyDetectedPlan(plan) {
  const bg = state.background;
  // index = Position in der KI-Antwort, auf die sich openings[].room_index bezieht.
  const rooms = (Array.isArray(plan.rooms) ? plan.rooms : [])
    .map((r, index) => ({ ...r, index }))
    .filter((r) => r.width_px > 0 && r.height_px > 0);
  if (!rooms.length) throw new Error('Im Bild wurden keine Räume erkannt.');

  // Maßstab: bevorzugt aus beschrifteten Raummaßen, sonst die Schätzung der KI.
  const ratios = rooms.flatMap((r) => [
    r.width_cm > 0 ? r.width_cm / r.width_px : null,
    r.length_cm > 0 ? r.length_cm / r.height_px : null,
  ]).filter((v) => v > 0);
  const scale = median(ratios) || (plan.cm_per_pixel > 0 ? plan.cm_per_pixel : bg.scale);
  const thickness = clamp(Math.round(plan.wall_thickness_cm) || WALL, 5, 50);

  bg.scale = scale;
  bg.calibrated = true;
  bg.x = 0;
  bg.y = 0;
  bg.visible = true;

  const idMap = new Map();
  state.rooms = [];
  state.openings = [];
  // Von oben links nach unten rechts einfügen, damit Räume aneinander einrasten.
  const ordered = [...rooms].sort((a, b) => (a.y_px - b.y_px) || (a.x_px - b.x_px));
  for (const r of ordered) {
    const room = {
      id: uid(),
      name: String(r.name || `Raum ${state.rooms.length + 1}`).slice(0, 60),
      x: snap(r.x_px * scale),
      y: snap(r.y_px * scale),
      width: Math.max(MIN_ROOM, Math.round(r.width_cm > 0 ? r.width_cm : snap(r.width_px * scale))),
      length: Math.max(MIN_ROOM, Math.round(r.length_cm > 0 ? r.length_cm : snap(r.height_px * scale))),
      removedWalls: [],
      thickness: uniformThickness(thickness),
    };
    const [x, y] = snapRoomPosition(room, room.x, room.y);
    room.x = x;
    room.y = y;
    state.rooms.push(room);
    idMap.set(r.index, room);
  }

  for (const o of Array.isArray(plan.openings) ? plan.openings : []) {
    const room = idMap.get(o.room_index);
    if (!room || !SIDES.includes(o.side) || !OPENING_NAMES[o.type]) continue;
    state.openings.push({
      id: uid(),
      type: o.type,
      roomId: room.id,
      side: o.side,
      width: Math.max(MIN_OPENING, snap(o.width_px * scale)),
      offset: Math.max(0, snap(o.offset_px * scale)),
      hinge: o.hinge === 'end' ? 'end' : 'start',
      swing: o.swing === 'out' ? 'out' : 'in',
    });
  }
  state.rooms.forEach(clampOpenings);
  resolveAllFurniture();
  save();
  selected = null;
  renderSelection();
  updateImportPanel();
  render();
  return state.rooms.length;
}

function rememberApiKey() {
  try {
    if (importEls.rememberKey.checked) localStorage.setItem(API_KEY_STORAGE, importEls.apiKey.value.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    // Kein Speicher verfügbar – Schlüssel gilt nur für diese Sitzung.
  }
}

// ---------- Bedienelemente ----------

importEls.upload.addEventListener('click', () => importEls.file.click());
importEls.file.addEventListener('change', handleUpload);
importEls.calibrate.addEventListener('click', () => setPlanMode(planMode?.type === 'calibrate' ? null : 'calibrate'));
importEls.trace.addEventListener('click', () => setPlanMode(planMode?.type === 'trace' ? null : 'trace'));
importEls.wand.addEventListener('click', () => setPlanMode(planMode?.type === 'wand' ? null : 'wand'));
importEls.autofind.addEventListener('click', autoFindRooms);
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
importEls.detect.addEventListener('click', detectRooms);
importEls.rememberKey.addEventListener('change', rememberApiKey);

try {
  const storedKey = localStorage.getItem(API_KEY_STORAGE);
  if (storedKey) importEls.apiKey.value = storedKey;
} catch {
  // Kein Speicher verfügbar.
}

updateImportPanel();
