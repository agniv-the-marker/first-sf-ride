import { WATER_MASK } from './water-mask.js';

// Water on the map.
//
// ferryri.de renders its bay as a WebGL2 pass: a Bayer 4x4 ordered dither whose
// threshold is pushed around by drifting value noise, a dispersive swell, and a
// damped wave-equation field you splat into by tapping. Only two of those carry
// the feeling — the dither and the tap ripples — and both are cheap on the CPU
// when the wet area is one map panel instead of a whole viewport. So: no WebGL.
// One 2D canvas and one Float32 grid, sized to the map stage.
//
// It lives inside .route-stage, behind the roads and the route, printing in teal
// at a low alpha under the page's own film grain — so the map sits on water that
// stirs when the cursor crosses it.

const CELL = 3;             // css px per dither cell
const STEP = 1 / 30;        // fixed sim step — a leapfrog needs a fixed dt
const MAX_STEPS = 3;        // never try to catch up more than this after a stall
const C2 = 0.20;            // wave speed squared; must stay < 0.25 to be stable
const DAMP = 0.962;         // higher than the original: quieter but rings longer
const TAP = 0.190;          // click splat. Transient, so it can be loud while the idle water stays quiet
const WAKE = 0.0170;        // per-step splat from a moving pointer
const SPLAT_R = 5;          // gaussian radius, cells
const REACH = 160;          // css px outside the map that the pointer is still felt
const AMP = 1.35;           // wave height -> dither threshold
const DRIFT_AMP = 0.20;     // idle mottling depth
const DRIFT_SPEED = 0.055;  // noise cells per second
const NOISE_F = 0.085;      // noise cells per grid cell
const FINE = 0.30;          // weight of the second octave
const BAND = 0.30;          // dither contrast window
// The water takes its colour from the clock at the scrub position: cool and dark
// before dawn, teal through the middle of the day, warm at dusk. Every stop stays
// dark enough to sit under the film grain without lifting off the page.
const HOURS = [
  { hour: 0, ink: [58, 78, 132], accent: [96, 88, 156] },
  { hour: 6, ink: [104, 116, 168], accent: [206, 128, 120] },
  { hour: 9, ink: [104, 166, 168], accent: [150, 176, 146] },
  { hour: 12, ink: [118, 186, 182], accent: [152, 198, 190] },
  { hour: 16, ink: [174, 174, 118], accent: [214, 154, 86] },
  { hour: 19, ink: [214, 130, 66], accent: [238, 168, 74] },
  { hour: 21, ink: [112, 84, 148], accent: [170, 96, 120] },
  { hour: 24, ink: [58, 78, 132], accent: [96, 88, 156] }
];

function colorsAt(hour) {
  const value = ((hour % 24) + 24) % 24;
  let index = 1;
  while (index < HOURS.length - 1 && HOURS[index].hour < value) index += 1;
  const before = HOURS[index - 1];
  const after = HOURS[index];
  const span = after.hour - before.hour;
  const amount = span ? (value - before.hour) / span : 0;
  const mix = key => before[key].map((channel, position) => channel + (after[key][position] - channel) * amount);
  return { ink: mix('ink'), accent: mix('accent') };
}
const INK_A = 0.30;             // peak alpha of a lit cell — the master volume
const ACCENT_FROM = 0.16;       // |height| where a crest starts catching the rust
const ACCENT_SPAN = 0.30;
const IDLE_H = 0.004;       // peak |height| below which the field counts as still
const NOISE_EVERY = 4;      // recompute the drift field every Nth sim step
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const clamp = (value, lo, hi) => (value < lo ? lo : value > hi ? hi : value);

const MASK_BYTES = (() => {
  const binary = atob(WATER_MASK.bits);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
})();

// The mask is stored in Web Mercator, the same space projectBounds() scales
// linearly into SVG units — so this is just that map run backwards.
function isWater(mercX, mercY) {
  // The mask only covers the ride's neighbourhood, but the view can be far wider
  // than that — a phone held sideways spans about three degrees of longitude. West
  // of the mask is open Pacific all the way out, east of it is the Central Valley,
  // and both of those are certain enough to answer without baking them in.
  if (mercX < WATER_MASK.minX) return true;
  if (mercX > WATER_MASK.maxX) return false;
  // Clamped rather than rejected: if the stage ever shows a sliver beyond the
  // baked bounds, the nearest real cell is a better guess than "land".
  const x = clamp(Math.round((mercX - WATER_MASK.minX) / (WATER_MASK.maxX - WATER_MASK.minX) * (WATER_MASK.width - 1)), 0, WATER_MASK.width - 1);
  const y = clamp(Math.round((mercY - WATER_MASK.minY) / (WATER_MASK.maxY - WATER_MASK.minY) * (WATER_MASK.height - 1)), 0, WATER_MASK.height - 1);
  const index = y * WATER_MASK.width + x;
  return Boolean(MASK_BYTES[index >> 3] & (1 << (index & 7)));
}


function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const top = a + (b - a) * ux;
  return top + (c + (d - c) * ux - top) * uy;
}

function makeField(width, height) {
  const gw = Math.max(4, Math.round(width / CELL));
  const gh = Math.max(4, Math.round(height / CELL));
  const count = gw * gh;
  const off = document.createElement('canvas');
  off.width = gw;
  off.height = gh;
  const ctx = off.getContext('2d');
  return {
    gw, gh, off, ctx,
    img: ctx.createImageData(gw, gh),
    cur: new Float32Array(count),
    prev: new Float32Array(count),
    next: new Float32Array(count),
    nz: new Float32Array(count),
    wet: new Uint8Array(count)
  };
}

// Leapfrog wave equation. Edge cells are held at rest — a Dirichlet wall, so
// fronts reflect off the edges of the map instead of leaking out.
function step(strip) {
  const { gw, gh, cur, prev, next, wet } = strip;
  let peak = 0;
  for (let y = 1; y < gh - 1; y += 1) {
    const row = y * gw;
    for (let x = 1; x < gw - 1; x += 1) {
      const i = row + x;
      if (!wet[i]) { next[i] = 0; continue; }
      const c = cur[i];
      const lap = cur[i - 1] + cur[i + 1] + cur[i - gw] + cur[i + gw] - 4 * c;
      const value = (2 * c - prev[i] + C2 * lap) * DAMP;
      next[i] = value;
      const size = value < 0 ? -value : value;
      if (size > peak) peak = size;
    }
  }
  const count = gw * gh;
  next.fill(0, 0, gw);
  next.fill(0, count - gw, count);
  for (let y = 1; y < gh - 1; y += 1) {
    next[y * gw] = 0;
    next[y * gw + gw - 1] = 0;
  }
  strip.prev = cur;
  strip.cur = next;
  strip.next = prev;
  return peak;
}

// Added to both fields, so the drop starts at rest and spreads.
function splat(strip, cx, cy, strength) {
  const { gw, gh, cur, prev } = strip;
  const r2 = SPLAT_R * SPLAT_R;
  const x0 = Math.max(1, Math.floor(cx - SPLAT_R * 2));
  const x1 = Math.min(gw - 2, Math.ceil(cx + SPLAT_R * 2));
  const y0 = Math.max(1, Math.floor(cy - SPLAT_R * 2));
  const y1 = Math.min(gh - 2, Math.ceil(cy + SPLAT_R * 2));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const i = y * gw + x;
      if (!strip.wet[i]) continue;
      const g = strength * Math.exp(-(dx * dx + dy * dy) / r2);
      cur[i] -= g;
      prev[i] -= g;
    }
  }
}

function fillNoise(strip, time) {
  const { gw, gh, nz } = strip;
  for (let y = 0; y < gh; y += 1) {
    const ny = y * NOISE_F - time * DRIFT_SPEED;
    const row = y * gw;
    for (let x = 0; x < gw; x += 1) {
      const nx = x * NOISE_F;
      nz[row + x] = (1 - FINE) * vnoise(nx, ny)
        + FINE * vnoise(nx * 2.7 + 31.7, ny * 2.7 - time * DRIFT_SPEED * 0.8);
    }
  }
}

// n -> smoothstep -> Bayer 4x4 threshold -> on/off. Two levels, like the grain.
function render(strip, ink, accent) {
  const { gw, gh, cur, nz, img, wet } = strip;
  const data = img.data;
  for (let y = 0; y < gh; y += 1) {
    const row = y * gw;
    const brow = (y & 3) * 4;
    for (let x = 0; x < gw; x += 1) {
      const i = row + x;
      const o = i * 4;
      if (!wet[i]) { data[o + 3] = 0; continue; }
      const height = cur[i];
      const n = 0.5 + (nz[i] - 0.5) * DRIFT_AMP + height * AMP;
      const t = smoothstep(0.5 - BAND, 0.5 + BAND, n);
      if (t <= (BAYER[brow + (x & 3)] + 0.5) / 16) { data[o + 3] = 0; continue; }
      const k = clamp(((height < 0 ? -height : height) - ACCENT_FROM) / ACCENT_SPAN, 0, 1);
      data[o] = ink[0] + (accent[0] - ink[0]) * k;
      data[o + 1] = ink[1] + (accent[1] - ink[1]) * k;
      data[o + 2] = ink[2] + (accent[2] - ink[2]) * k;
      data[o + 3] = 255 * INK_A * (0.55 + 0.45 * t);
    }
  }
  strip.ctx.putImageData(img, 0, 0);
}

const cssRGB = channels => `rgb(${Math.round(channels[0])} ${Math.round(channels[1])} ${Math.round(channels[2])})`;

// The exact ink the canvas prints with, so other chrome can borrow the water's
// colour rather than approximating it from the type palette.
export function waterColorAt(hour) {
  const { ink, accent } = colorsAt(hour);
  return { ink: cssRGB(ink), accent: cssRGB(accent) };
}

export function createWater({ host = '.route-stage', svg, projection } = {}) {
  // Reassigned when the stage changes shape, so the mask keeps lining up.
  const stage = typeof host === 'string' ? document.querySelector(host) : host;
  const map = typeof svg === 'string' ? document.querySelector(svg) : svg;
  if (!stage || !map || !projection) return { refresh: () => {}, destroy: () => {} };
  // Whether this page wants water at all right now. The owner decides: everywhere
  // on a wide screen, and on a phone only while the full-screen map is open.
  let allowed = true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const canvas = document.createElement('canvas');
  canvas.className = 'water';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d', { alpha: true });
  stage.prepend(canvas);

  let field = null;
  let rect = { left: 0, top: 0, width: 0, height: 0 };
  let running = false;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let clock = 0;
  let steps = 0;
  let peak = 0;
  let renderTick = 0;
  let frozen = false;
  let noiseDirty = true;
  let px = 0;
  let py = 0;
  let pSpeed = 0;
  let pTime = -1e9;
  let tap = null;
  let palette = colorsAt(12);
  let paletteHour = 12;

  const layout = () => {
    const box = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    field = makeField(width, height);
    // The stage has a 1px top border and the canvas is inset inside it, so hit
    // testing has to use the canvas box or every tap sits a pixel off.
    rect = canvas.getBoundingClientRect();

    // The SVG is fitted xMidYMid meet, so one scale and two offsets take a stage
    // pixel back to SVG units, and from there to Web Mercator and the mask.
    const fit = Math.min(width / projection.width, height / projection.height);
    const offsetX = (width - projection.width * fit) / 2;
    const offsetY = (height - projection.height * fit) / 2;
    const { gw, gh, wet } = field;
    for (let y = 0; y < gh; y += 1) {
      const user = ((y + 0.5) * CELL - offsetY) / fit;
      const mercY = projection.minY + (user - projection.top) / projection.scale;
      for (let x = 0; x < gw; x += 1) {
        const userX = ((x + 0.5) * CELL - offsetX) / fit;
        const mercX = projection.minX + (userX - projection.left) / projection.scale;
        wet[y * gw + x] = isWater(mercX, mercY) ? 1 : 0;
      }
    }
    noiseDirty = true;
  };

  const paint = () => {
    ctx.clearRect(0, 0, rect.width, rect.height);
    render(field, palette.ink, palette.accent);
    ctx.drawImage(field.off, 0, 0, field.gw, field.gh, 0, 0, field.gw * CELL, field.gh * CELL);
  };

  // Distance from the pointer to the stage, so the water still answers a cursor
  // travelling past the map without ever being clamped to a wall inside it.
  const reachFalloff = (x, y) => {
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    return distance > REACH ? 0 : 1 - distance / REACH;
  };

  const cellFor = (x, y) => ({
    cx: clamp((x - rect.left) / CELL, 1, field.gw - 2),
    cy: clamp((y - rect.top) / CELL, 1, field.gh - 2)
  });

  // Exactly the cell under the pointer, and only if it is wet. Snapping to nearby
  // water was tempting for the shoreline, but the route hugs the coast for most of
  // its length, so a generous radius ate the drags that scrub the ride.
  const wetCellAt = (x, y) => {
    if (!field) return null;
    const { gw, wet } = field;
    const { cx, cy } = cellFor(x, y);
    const column = Math.round(cx);
    const row = Math.round(cy);
    return wet[row * gw + column] ? { cx: column, cy: row } : null;
  };

  const simulate = () => {
    steps += 1;
    if (noiseDirty || steps % NOISE_EVERY === 0) {
      fillNoise(field, clock);
      noiseDirty = false;
    }

    if (!frozen) {
      if (tap) {
        splat(field, tap.cx, tap.cy, TAP);
        tap = null;
      }
      if (performance.now() - pTime < 140) {
        const falloff = reachFalloff(px, py);
        const target = falloff > 0 ? wetCellAt(px, py) : null;
        if (target) {
          const speed = Math.min(1, 0.2 + pSpeed / 900);
          splat(field, target.cx, target.cy, WAKE * falloff * falloff * speed);
        }
      }
    }

    peak = step(field);
    clock += STEP;
  };

  const tick = now => {
    frame = requestAnimationFrame(tick);
    const delta = Math.min(0.1, (now - last) / 1000) || 0;
    last = now;

    acc = Math.min(acc + delta, STEP * MAX_STEPS);
    let stepped = false;
    while (acc >= STEP) { acc -= STEP; simulate(); stepped = true; }
    if (!stepped) return;

    // Still water drifts at 0.055 cells/sec. Nobody can see 20fps on that.
    renderTick += 1;
    if (peak < IDLE_H && performance.now() - pTime > 600 && renderTick % 3) return;
    paint();
  };

  const onMove = event => {
    const now = performance.now();
    const delta = Math.max(8, now - pTime);
    if (now - pTime < 400) pSpeed = Math.hypot(event.clientX - px, event.clientY - py) / (delta / 1000);
    px = event.clientX;
    py = event.clientY;
    pTime = now;
  };
  // Clicking water drops a ripple and keeps the click: the map's own pointerdown
  // would otherwise yank the route scrubber to wherever you tapped the sea.
  const onStageDown = event => {
    onMove(event);
    if (!running || frozen) return;
    const target = wetCellAt(event.clientX, event.clientY);
    if (!target) return;
    tap = target;
    event.stopPropagation();
  };

  // The stage is sticky, so its viewport rect only moves while the page settles.
  const onScroll = () => { rect = canvas.getBoundingClientRect(); };

  const still = () => {
    canvas.hidden = false;
    layout();
    fillNoise(field, 0);
    paint();
  };

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!allowed) return;
      if (running) layout();
      else if (reduced.matches) still();
    }, 160);
  };

  const start = () => {
    if (running) return;
    running = true;
    canvas.hidden = false;
    layout();
    addEventListener('pointermove', onMove, { passive: true });
    stage.addEventListener('pointerdown', onStageDown, true);
    addEventListener('scroll', onScroll, { passive: true });
    last = performance.now();
    acc = 0;
    frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
    removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onStageDown, true);
    removeEventListener('scroll', onScroll);
    ctx.clearRect(0, 0, rect.width, rect.height);
  };

  const sync = () => {
    if (!allowed) { stop(); canvas.hidden = true; return; }
    // Reduced motion keeps the texture and loses the motion: one static print.
    if (reduced.matches) { stop(); still(); }
    else start();
  };

  reduced.addEventListener('change', sync);
  addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else if (running) { last = performance.now(); acc = 0; frame = requestAnimationFrame(tick); }
  });
  // Hold still while the inline editor is open, exactly as media-loop.js does.
  new MutationObserver(() => { frozen = document.body.classList.contains('editing'); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });

  sync();
  // The stage only reaches its final height once the layout settles.
  setTimeout(() => { if (running) layout(); else if (allowed && reduced.matches) still(); }, 700);

  return {
    refresh: layout,
    setProjection: next => { projection = next; if (running || reduced.matches) layout(); },
    setActive: value => { if (value === allowed) return; allowed = value; sync(); },
    // Fractional hour in the ride's own timezone, so the colour slides rather than
    // steps and dusk lands when it actually did.
    setHour: hour => {
      if (typeof hour !== 'number' || Number.isNaN(hour)) return;
      if (Math.abs(hour - paletteHour) < 0.02) return;
      paletteHour = hour;
      palette = colorsAt(hour);
      if (running || reduced.matches) paint();
    },
    destroy: () => { stop(); canvas.remove(); }
  };
}
