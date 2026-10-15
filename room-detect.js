'use strict';

// Raumerkennung aus einem Grundrissbild ohne KI.
// Idee: dunkle Pixel sind Wände. Ein Raum ist ein Rechteck, das von einem
// Startpunkt aus wächst, bis jede Seite überwiegend auf Wand trifft. Türöffnungen
// sind kürzer als die halbe Wand und halten das Wachstum daher nicht auf.

const DETECT_STOP = 0.5; // Anteil Wandpixel, ab dem eine Kante als Wand gilt

function otsuThreshold(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

// Häufigste Länge dunkler Abschnitte (≥ 3 px) entlang Zeilen und Spalten ≈ Wanddicke.
function estimateWallThickness(mask, w, h) {
  const counts = new Uint32Array(81);
  const scan = (len, get) => {
    let run = 0;
    for (let i = 0; i <= len; i++) {
      if (i < len && get(i)) run++;
      else {
        if (run >= 3 && run <= 80) counts[run]++;
        run = 0;
      }
    }
  };
  for (let y = 0; y < h; y++) scan(w, (x) => mask[y * w + x]);
  for (let x = 0; x < w; x++) scan(h, (y) => mask[y * w + x]);
  let best = 0;
  for (let i = 3; i <= 80; i++) if (counts[i] > counts[best]) best = i;
  return best || 6;
}

// Erosion bzw. Dilatation mit quadratischem Fenster (2r+1), getrennt nach Richtung.
function morph(mask, w, h, r, erode) {
  const pass = (src, horizontal) => {
    const out = new Uint8Array(w * h);
    const lines = horizontal ? h : w;
    const len = horizontal ? w : h;
    const prefix = new Int32Array(len + 1);
    for (let l = 0; l < lines; l++) {
      const idx = (i) => (horizontal ? l * w + i : i * w + l);
      for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i] + src[idx(i)];
      for (let i = 0; i < len; i++) {
        const a = Math.max(0, i - r);
        const b = Math.min(len - 1, i + r);
        const s = prefix[b + 1] - prefix[a];
        out[idx(i)] = erode ? (s === 2 * r + 1 ? 1 : 0) : (s > 0 ? 1 : 0);
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

function analyzePlanImage(imageData) {
  const { width: w, height: h, data } = imageData;
  const lum = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) {
    const l = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    lum[i] = l;
    hist[l]++;
  }
  const threshold = clamp(otsuThreshold(hist, w * h), 60, 200);
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) raw[i] = lum[i] < threshold ? 1 : 0;

  // Dünne Linien (Text, Türbögen, Bemaßung, Möbel) entfernen, Wände behalten.
  // Der Filter bleibt klein, damit auch dünne Innenwände erhalten bleiben
  // (die geschätzte Dicke entspricht oft eher den dicken Außenwänden).
  const wallPx = estimateWallThickness(raw, w, h);
  const r = wallPx >= 10 ? 2 : 1;
  const mask = morph(morph(raw, w, h, r, true), w, h, r, false);

  // Präfixsummen für schnelle Abfragen "Anteil Wand auf dieser Zeile/Spalte".
  const rowSum = new Int32Array((w + 1) * h);
  const colSum = new Int32Array((h + 1) * w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) rowSum[y * (w + 1) + x + 1] = rowSum[y * (w + 1) + x] + mask[y * w + x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) colSum[x * (h + 1) + y + 1] = colSum[x * (h + 1) + y] + mask[y * w + x];
  }
  return { w, h, mask, wallPx, rowSum, colSum };
}

function rowFrac(a, y, x0, x1) {
  const base = y * (a.w + 1);
  return (a.rowSum[base + x1 + 1] - a.rowSum[base + x0]) / (x1 - x0 + 1);
}

function colFrac(a, x, y0, y1) {
  const base = x * (a.h + 1);
  return (a.colSum[base + y1 + 1] - a.colSum[base + y0]) / (y1 - y0 + 1);
}

function growFrom(a, r) {
  let grew = true;
  while (grew) {
    grew = false;
    if (r.x0 > 0 && colFrac(a, r.x0 - 1, r.y0, r.y1) < DETECT_STOP) { r.x0--; grew = true; }
    if (r.x1 < a.w - 1 && colFrac(a, r.x1 + 1, r.y0, r.y1) < DETECT_STOP) { r.x1++; grew = true; }
    if (r.y0 > 0 && rowFrac(a, r.y0 - 1, r.x0, r.x1) < DETECT_STOP) { r.y0--; grew = true; }
    if (r.y1 < a.h - 1 && rowFrac(a, r.y1 + 1, r.x0, r.x1) < DETECT_STOP) { r.y1++; grew = true; }
  }
}

// Ist das Rechteck durch eine Türöffnung in einen Nachbarraum "ausgelaufen",
// liegt eine Wand quer darin: auf die Seite des Startpunkts zurückschneiden.
function trimAtInnerWalls(a, r, sx, sy) {
  let changed = false;
  for (let x = sx - 1; x > r.x0; x--) {
    if (colFrac(a, x, r.y0, r.y1) >= DETECT_STOP) { r.x0 = x + 1; changed = true; break; }
  }
  for (let x = sx + 1; x < r.x1; x++) {
    if (colFrac(a, x, r.y0, r.y1) >= DETECT_STOP) { r.x1 = x - 1; changed = true; break; }
  }
  for (let y = sy - 1; y > r.y0; y--) {
    if (rowFrac(a, y, r.x0, r.x1) >= DETECT_STOP) { r.y0 = y + 1; changed = true; break; }
  }
  for (let y = sy + 1; y < r.y1; y++) {
    if (rowFrac(a, y, r.x0, r.x1) >= DETECT_STOP) { r.y1 = y - 1; changed = true; break; }
  }
  return changed;
}

// Raum am Pixel (sx, sy). Ergebnis: { rect, outside } oder null (Klick auf Wand).
// outside = das Rechteck reicht bis an den Bildrand, liegt also außerhalb der Wohnung.
function detectRoomAt(a, sx, sy) {
  sx = Math.round(sx);
  sy = Math.round(sy);
  if (sx < 0 || sy < 0 || sx >= a.w || sy >= a.h || a.mask[sy * a.w + sx]) return null;
  const r = { x0: sx, x1: sx, y0: sy, y1: sy };
  for (let i = 0; i < 4; i++) {
    growFrom(a, r);
    if (!trimAtInnerWalls(a, r, sx, sy)) break;
  }
  const outside = r.x0 === 0 || r.y0 === 0 || r.x1 === a.w - 1 || r.y1 === a.h - 1;
  return { rect: { x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1 }, outside };
}

// Dicke der Wand an einer Seite eines erkannten Raums (in px): an mehreren Stellen
// nach außen zählen, wie viele Wandpixel folgen; Türöffnungen (0) werden ignoriert.
function measureWallPx(a, rect, side) {
  const samples = [];
  for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    let x;
    let y;
    let dx = 0;
    let dy = 0;
    if (side === 'top' || side === 'bottom') {
      x = Math.round(rect.x + rect.w * f);
      y = side === 'top' ? rect.y - 1 : rect.y + rect.h;
      dy = side === 'top' ? -1 : 1;
    } else {
      y = Math.round(rect.y + rect.h * f);
      x = side === 'left' ? rect.x - 1 : rect.x + rect.w;
      dx = side === 'left' ? -1 : 1;
    }
    let n = 0;
    while (n < 80 && x >= 0 && y >= 0 && x < a.w && y < a.h && a.mask[y * a.w + x]) {
      n++;
      x += dx;
      y += dy;
    }
    if (n > 0 && n < 80) samples.push(n);
  }
  if (!samples.length) return a.wallPx;
  samples.sort((p, q) => p - q);
  return samples[Math.floor(samples.length / 2)];
}

function minRoomPx(a) {
  return Math.max(a.wallPx * 3, Math.round(Math.min(a.w, a.h) * 0.04));
}

function rectOverlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function insideRect(r, x, y) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

// Kürzt Rechteck b so, dass es a nicht mehr überdeckt (mit Platz für eine Wand).
function trimAgainst(b, a, gap) {
  const options = [
    { ...b, w: a.x - gap - b.x },
    { ...b, x: a.x + a.w + gap, w: b.x + b.w - (a.x + a.w + gap) },
    { ...b, h: a.y - gap - b.y },
    { ...b, y: a.y + a.h + gap, h: b.y + b.h - (a.y + a.h + gap) },
  ].filter((o) => o.w > 0 && o.h > 0);
  return options.sort((p, q) => q.w * q.h - p.w * p.h)[0] || null;
}

// Sucht alle Räume: Startpunkte im Raster, jeder bekommt ein wachsendes Rechteck.
function detectAllRooms(a) {
  const minPx = minRoomPx(a);
  const step = Math.max(4, Math.round(Math.min(a.w, a.h) / 50));
  const rooms = [];
  const skip = [];
  for (let y = step; y < a.h; y += step) {
    for (let x = step; x < a.w; x += step) {
      if (a.mask[y * a.w + x]) continue;
      if (rooms.some((r) => insideRect(r, x, y)) || skip.some((r) => insideRect(r, x, y))) continue;
      const found = detectRoomAt(a, x, y);
      if (!found) continue;
      if (found.outside) {
        skip.push(found.rect);
        continue;
      }
      let rect = found.rect;
      for (const other of rooms) {
        if (rect && rectOverlap(rect, other)) rect = trimAgainst(rect, other, a.wallPx);
      }
      if (!rect || rect.w < minPx || rect.h < minPx) {
        skip.push(found.rect);
        continue;
      }
      rooms.push(rect);
    }
  }
  return rooms;
}
