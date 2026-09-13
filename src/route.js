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

export function createRoute({ svg, dot, halo, pathData, onProgress, cities, samples, projection, getPoint }) {
  svg.setAttribute('viewBox', `0 0 ${projection.width} ${projection.height}`);
  const clip = svg.querySelector('[data-map-clip]');
  clip.setAttribute('width', projection.width);
  clip.setAttribute('height', projection.height);
  drawRoadMap(svg, projection);
  document.querySelector('#routeLoading')?.remove();

  svg.querySelectorAll('[data-route-path], [data-route-progress]').forEach(path => path.setAttribute('d', pathData));
  const routeLine = svg.querySelector('.route-line');
  const progressLine = svg.querySelector('[data-route-progress]');
  const routeLength = routeLine.getTotalLength();
  if (!Number.isFinite(routeLength) || routeLength === 0) throw new Error('Unable to measure generated GPX route');
  progressLine.setAttribute('pathLength', '1');

  const labels = document.querySelector('#cityLabels');
  const cityMarkers = [];
  labels.innerHTML = '';
  cities.forEach(city => {
    const nearest = samples.reduce((best, candidate) => {
      const distance = (candidate.lat - city.lat) ** 2 + (candidate.lon - city.lon) ** 2;
      return distance < best.distance ? { distance, point: candidate } : best;
    }, { distance: Infinity, point: samples[0] });
    const position = projectPoint(city, projection);
    const label = document.createElement('span');
    label.className = `city-label${city.major ? ' major' : ''}`;
    label.textContent = city.name;
    label.style.left = `${position.x / projection.width * 100}%`;
    label.style.top = `${position.y / projection.height * 100}%`;
    label.dataset.anchor = city.anchor || 'right';
    labels.append(label);
    cityMarkers.push({ label, progress: nearest.point.progress });
  });

  let progress = 0;
  let dragging = false;

  const set = (next, shouldScroll = false) => {
    progress = Math.max(0, Math.min(1, next));
    const ridePoint = getPoint(progress);
    const position = projectPoint(ridePoint, projection);
    dot.setAttribute('cx', position.x);
    dot.setAttribute('cy', position.y);
    halo.setAttribute('cx', position.x);
    halo.setAttribute('cy', position.y);
    dot.setAttribute('aria-valuenow', Math.round(progress * 100));
    dot.setAttribute('aria-valuetext', `${Math.round(progress * 100)} percent of the ride`);
    progressLine.setAttribute('stroke-dasharray', `${Math.max(0.001, progress)} 1`);
    cityMarkers.forEach(marker => marker.label.classList.toggle('reached', progress >= marker.progress - 0.015));
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

  svg.addEventListener('pointerdown', event => {
    dragging = true;
    svg.setPointerCapture(event.pointerId);
    set(closest(event), true);
  });
  svg.addEventListener('pointermove', event => { if (dragging) set(closest(event), true); });
  const endDrag = () => { dragging = false; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  dot.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -0.01 : 0.01;
    set(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : progress + delta, true);
  });

  return { setProgress: set, getProgress: () => progress };
}
