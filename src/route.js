import { projectPoint, toPath } from './gpx.js';
import { MAP_DATA } from './map-data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function drawRoadMap(svg, projection) {
  const group = svg.querySelector('[data-map-roads]');
  group.innerHTML = '';
  MAP_DATA.roads.forEach(road => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', `map-road map-road-${road.type}`);
    path.setAttribute('d', road.segments.map(segment => toPath(segment.map(([lon, lat]) => ({ lat, lon })), projection)).join(' '));
    group.append(path);
  });
}

function eventPoint(event, svg) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}

export function createRoute({ svg, dot, marker, onProgress, cities, samples, projection, getPoint, canScrub = () => true }) {
  const clip = svg.querySelector('[data-map-clip]');

  // Everything geometric is re-runnable, because the stage changes shape when a
  // phone is rotated and a projection built for one aspect ratio is wrong for the
  // other — the labels would sit well off their dots.
  // The marker is drawn in user units, so it would double in size when the viewBox
  // gets short and wide. Scale it against a reference so it stays put in pixels.
  const REFERENCE_PX_PER_UNIT = 4.2;
  let markerScale = 1;

  const applyProjection = geometry => {
    projection = geometry;
    const pxPerUnit = svg.getBoundingClientRect().width / projection.width;
    markerScale = pxPerUnit > 0 ? Math.max(0.35, Math.min(2, REFERENCE_PX_PER_UNIT / pxPerUnit)) : 1;
    svg.setAttribute('viewBox', `0 0 ${projection.width} ${projection.height}`);
    clip.setAttribute('width', projection.width);
    clip.setAttribute('height', projection.height);
    drawRoadMap(svg, projection);
    const drawn = toPath(samples, projection);
    svg.querySelectorAll('[data-route-path], [data-route-progress]').forEach(path => path.setAttribute('d', drawn));
  };

  applyProjection(projection);
  document.querySelector('#routeLoading')?.remove();
  const routeLine = svg.querySelector('.route-line');
  const progressLine = svg.querySelector('[data-route-progress]');
  const routeLength = routeLine.getTotalLength();
  if (!Number.isFinite(routeLength) || routeLength === 0) throw new Error('Unable to measure generated GPX route');
  progressLine.setAttribute('pathLength', '1');

  // The marker turns to face the direction of travel, so a ±3-sample window smooths GPS jitter.
  const indexAtProgress = value => {
    let low = 0;
    let high = samples.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (samples[middle].progress < value) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  const headingAt = value => {
    const last = samples.length - 1;
    const index = indexAtProgress(value);
    const from = projectPoint(samples[Math.max(0, index - 3)], projection);
    const to = projectPoint(samples[Math.min(last, index + 3)], projection);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return dx || dy ? Math.atan2(dy, dx) * 180 / Math.PI : 0;
  };

  const labels = document.querySelector('#cityLabels');
  const cityMarkers = [];
  labels.innerHTML = '';
  const placeLabel = (label, city) => {
    const position = projectPoint(city, projection);
    label.style.left = `${position.x / projection.width * 100}%`;
    label.style.top = `${position.y / projection.height * 100}%`;
  };
  cities.forEach(city => {
    const nearest = samples.reduce((best, candidate) => {
      const distance = (candidate.lat - city.lat) ** 2 + (candidate.lon - city.lon) ** 2;
      return distance < best.distance ? { distance, point: candidate } : best;
    }, { distance: Infinity, point: samples[0] });
    const label = document.createElement('span');
    label.className = `city-label${city.major ? ' major' : ''}${city.stack ? ' stacked' : ''}`;
    label.textContent = city.name;
    label.dataset.anchor = city.anchor || 'right';
    placeLabel(label, city);
    labels.append(label);
    cityMarkers.push({ label, city, progress: nearest.point.progress });
  });

  let progress = 0;
  let dragging = false;

  const set = (next, shouldScroll = false) => {
    progress = Math.max(0, Math.min(1, next));
    const ridePoint = getPoint(progress);
    const position = projectPoint(ridePoint, projection);
    dot.setAttribute('cx', position.x);
    dot.setAttribute('cy', position.y);
    marker.setAttribute('transform', `translate(${position.x.toFixed(3)} ${position.y.toFixed(3)}) rotate(${headingAt(progress).toFixed(1)}) scale(${markerScale.toFixed(3)})`);
    dot.setAttribute('aria-valuenow', Math.round(progress * 100));
    dot.setAttribute('aria-valuetext', `${Math.round(progress * 100)} percent of the ride`);
    progressLine.setAttribute('stroke-dasharray', `${Math.max(0.001, progress)} 1`);
    cityMarkers.forEach(city => city.label.classList.toggle('reached', progress >= city.progress - 0.015));
    onProgress(progress, shouldScroll, ridePoint);
  };

  const closest = event => {
    const target = eventPoint(event, svg);
    let best = { distance: Infinity, progress };
    samples.forEach((sample, index) => {
      if (index % 2 && samples.length > 700) return;
      const candidate = projectPoint(sample, projection);
      const distance = (candidate.x - target.x) ** 2 + (candidate.y - target.y) ** 2;
      if (distance < best.distance) best = { distance, progress: sample.progress };
    });
    return best.progress;
  };

  // Dragging the marker is a desktop affordance. On a phone the map is a
  // full-screen overlay you tapped into, and scrubbing it there reads as the page
  // jumping around under you — so the owner can switch it off.
  svg.addEventListener('pointerdown', event => {
    if (!canScrub()) return;
    dragging = true;
    // Capture keeps a drag alive past the edge of the svg, but it throws for a
    // pointer the browser no longer considers active — and an uncaught throw here
    // would take the scrub with it.
    try { svg.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    set(closest(event), true);
  });
  svg.addEventListener('pointermove', event => { if (dragging && canScrub()) set(closest(event), true); });
  const endDrag = () => { dragging = false; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  dot.addEventListener('keydown', event => {
    if (!canScrub()) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -0.01 : 0.01;
    set(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : progress + delta, true);
  });

  return {
    setProgress: set,
    getProgress: () => progress,
    // Rebuild every piece of geometry against a projection measured from the
    // stage's new shape, then put the marker back where it was.
    reproject: geometry => {
      applyProjection(geometry);
      cityMarkers.forEach(marker => placeLabel(marker.label, marker.city));
      set(progress);
    }
  };
}
