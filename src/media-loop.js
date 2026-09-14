// The right-hand photo columns drift downward forever. Each column wraps on its own
// period, so the seams never line up and no column is ever short of cards.
const DRIFT = 28;            // px/sec — roughly a screen every half minute
const IDLE_RESUME_MS = 850;  // hold after the last input before drift creeps back
const RESUME_RAMP_MS = 1200;
const FRICTION = 0.93;       // per 1/60s
const MAX_V = 2600;

import { phone } from './breakpoints.js';

export function createMediaLoop({ panel, columns, rail = null, onMeasure = null, onTap = null, startStopped = false, speed = DRIFT, hijackWheel = true }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const state = [...columns, ...(rail ? [rail] : [])].map(el => ({ el, period: 1, offset: 0, rail: el === rail }));

  let active = false, paused = false, stopped = startStopped, frame = 0, last = 0;
  let dragging = false, velocity = 0, idle = 0, lastY = 0, lastT = 0, moved = 0;

  const measure = () => state.forEach(item => {
    const first = item.el.children[0];
    const second = item.el.children[1];
    item.period = Math.max(1, second ? second.offsetTop - first.offsetTop : (first?.offsetHeight || 1));
  });

  let builtFor = 0;

  // Clones are inert: no ids, no videos, hidden from assistive tech.
  const ensureCopies = (force = false) => {
    // Clear last pass's floor first, or this measures itself.
    state.forEach(item => {
      if (item.el.firstElementChild) item.el.firstElementChild.style.minHeight = '';
    });
    // Every column — and the rail — wraps on one shared period. Left to their own
    // measured heights they slide out of phase with each other, and the rail could
    // not stay pinned to the photographs it is labelling.
    const tallest = state
      .filter(item => !item.rail && item.el.firstElementChild)
      .reduce((best, item) => Math.max(best, item.el.firstElementChild.offsetHeight), 0);
    const shared = Math.max(panel.clientHeight, tallest);
    // A floor, not a fixed height. Forcing the height made a copy whose content was
    // a pixel or two taller than the shared period overflow its own box — and with
    // the slack distributed at both ends, that overflow landed on top of the next
    // copy, so the tail of one pass slid under the head of the next.
    state.forEach(item => {
      if (item.el.firstElementChild) item.el.firstElementChild.style.minHeight = `${shared}px`;
    });
    onMeasure?.(shared);

    // Rebuilding the clones on every lazily-loaded image is what makes the column
    // flicker while you scroll, so only do it when the period actually moved.
    const built = state.every(item => !item.el.firstElementChild || item.el.children.length > 1);
    if (!force && built && Math.abs(shared - builtFor) < 2) {
      measure();
      return;
    }
    builtFor = shared;
    state.forEach(item => {
      const primary = item.el.firstElementChild;
      if (!primary) return;
      while (item.el.children.length > 1) item.el.lastElementChild.remove();
      const copies = Math.max(1, Math.ceil(panel.clientHeight / Math.max(1, primary.offsetHeight)));
      for (let index = 0; index < copies; index += 1) {
        const clone = primary.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('[data-media-id]').forEach(node => node.removeAttribute('data-media-id'));
        clone.querySelectorAll('video').forEach(video => video.closest('.media-card')?.remove());
        item.el.append(clone);
      }
    });
    measure();
  };

  // Whole pixels only. A fractional translate makes the browser resample every
  // photograph on every frame, which reads as a constant shimmer down the column —
  // the sub-pixel offset is invisible, the flicker it causes is not. The fractional
  // part stays in `offset`, so the motion itself is still smooth.
  const apply = () => state.forEach(item => {
    const y = ((item.offset % item.period) + item.period) % item.period;
    item.el.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
  });

  const tick = now => {
    frame = requestAnimationFrame(tick);
    const delta = Math.min(0.05, (now - last) / 1000) || 0;
    last = now;
    if (paused) { idle = now; return; }
    if (!dragging) {
      if (Math.abs(velocity) > 1) {
        velocity *= Math.pow(FRICTION, delta * 60);
        state.forEach(item => { item.offset += velocity * delta; });
      } else {
        velocity = 0;
        const drift = reduced.matches || stopped ? 0 : speed;
        const t = Math.min(1, Math.max(0, (now - idle - IDLE_RESUME_MS) / RESUME_RAMP_MS));
        const ease = t * t * (3 - 2 * t);
        if (ease > 0) state.forEach(item => { item.offset += drift * ease * delta; });
      }
    }
    apply();
  };

  const nudge = distance => { state.forEach(item => { item.offset += distance; }); idle = performance.now(); apply(); };

  const onWheel = event => {
    if (!active || paused) return;
    if (hijackWheel) event.preventDefault();
    velocity = 0;
    nudge(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? panel.clientHeight : 1));
  };

  const onDown = event => {
    if (!active || paused || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest('.media-pause')) return;
    dragging = true; moved = 0; velocity = 0;
    lastY = event.clientY; lastT = event.timeStamp; idle = performance.now();
    // Capture is a nicety — it keeps a drag alive past the panel's edge. It throws
    // for a pointer the browser no longer considers active, and an uncaught throw
    // here would take the rest of the handler with it.
    try { panel.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    panel.classList.add('is-dragging');
  };

  const onMove = event => {
    if (!dragging) return;
    const dy = event.clientY - lastY;
    const dt = Math.max(8, event.timeStamp - lastT) / 1000;
    lastY = event.clientY; lastT = event.timeStamp; moved += Math.abs(dy);
    velocity = Math.max(-MAX_V, Math.min(MAX_V, velocity * 0.6 + (-dy / dt) * 0.4));
    nudge(-dy);
  };

  const onUp = event => {
    if (!dragging) return;
    dragging = false; idle = performance.now();
    try { panel.releasePointerCapture(event.pointerId); } catch { /* never captured */ }
    panel.classList.remove('is-dragging');
    if (moved >= 4) return;
    velocity = 0;
    // Pointer capture retargets the follow-up click at the panel, so a plain click
    // listener on a card never fires. Resolve the tap by position instead.
    onTap?.(event.clientX, event.clientY);
  };

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (active) ensureCopies(); }, 180);
  };

  const enable = () => {
    if (active) return;
    active = true;
    panel.classList.add('is-looping');
    panel.addEventListener('wheel', onWheel, { passive: !hijackWheel });
    panel.addEventListener('pointerdown', onDown);
    panel.addEventListener('pointermove', onMove);
    panel.addEventListener('pointerup', onUp);
    panel.addEventListener('pointercancel', onUp);
    addEventListener('resize', onResize, { passive: true });
    ensureCopies(true);
    last = performance.now();
    idle = last - IDLE_RESUME_MS - RESUME_RAMP_MS;
    frame = requestAnimationFrame(tick);
  };

  const disable = () => {
    if (!active) return;
    active = false; dragging = false; velocity = 0;
    cancelAnimationFrame(frame); frame = 0;
    panel.classList.remove('is-looping', 'is-dragging');
    panel.removeEventListener('wheel', onWheel);
    panel.removeEventListener('pointerdown', onDown);
    panel.removeEventListener('pointermove', onMove);
    panel.removeEventListener('pointerup', onUp);
    panel.removeEventListener('pointercancel', onUp);
    removeEventListener('resize', onResize);
    state.forEach(item => {
      item.offset = 0;
      item.el.style.transform = '';
      while (item.el.children.length > 1) item.el.lastElementChild.remove();
    });
  };

  const sync = () => (phone.matches ? disable() : enable());
  phone.addEventListener('change', sync);

  // Hold still while the inline editor is open.
  new MutationObserver(() => { paused = document.body.classList.contains('editing'); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  sync();
  return {
    refresh: () => { if (active) ensureCopies(); },
    setPaused: value => { paused = value; },
    toggleStopped: () => { stopped = !stopped; idle = performance.now(); return stopped; },
    isStopped: () => stopped,
    destroy: disable
  };
}
