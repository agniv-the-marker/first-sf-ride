export function createRoute({ svg, dot, pathData, onProgress, points, projection }) {
  svg.querySelectorAll('[data-route-path]').forEach(path => path.setAttribute('d', pathData));
  const line = svg.querySelector('.route-line');
  const length = line.getTotalLength();
  if (!Number.isFinite(length) || length === 0) throw new Error('Unable to measure generated GPX route');
  const labels = document.querySelector('#cityLabels');
  const cityMarkers = [];
  labels.innerHTML = '';

  points.forEach(city => {
    const nearest = projection.projected.reduce((best, candidate, index) => {
      const distance = Math.abs(candidate.lat - city.lat) + Math.abs(candidate.lon - city.lon);
      return distance < best.distance ? { distance, index } : best;
    }, { distance: Infinity, index: 0 });
    const progress = nearest.index / Math.max(1, projection.projected.length - 1);
    const routePoint = line.getPointAtLength(length * progress);
    const label = document.createElement('span');
    label.className = 'city-label'; label.textContent = city.name;
    label.style.left = `${routePoint.x}%`; label.style.top = `${routePoint.y}%`;
    labels.append(label); cityMarkers.push({ label, progress });
  });

  let progress = 0, dragging = false;
  const set = (next, shouldScroll = false) => {
    progress = Math.max(0, Math.min(1, next));
    const point = line.getPointAtLength(length * progress);
    dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y); dot.setAttribute('aria-valuenow', Math.round(progress * 100));
    cityMarkers.forEach(marker => marker.label.classList.toggle('reached', progress >= marker.progress - 0.025));
    onProgress(progress, shouldScroll);
  };
  const closest = event => {
    const rect = svg.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * 100, y = (event.clientY - rect.top) / rect.height * 100;
    let best = { distance: Infinity, progress };
    for (let index = 0; index <= 360; index += 1) { const candidateProgress = index / 360, candidate = line.getPointAtLength(length * candidateProgress), distance = (candidate.x - x) ** 2 + (candidate.y - y) ** 2; if (distance < best.distance) best = { distance, progress: candidateProgress }; }
    return best.progress;
  };
  dot.addEventListener('pointerdown', event => { dragging = true; dot.setPointerCapture(event.pointerId); set(closest(event), true); });
  dot.addEventListener('pointermove', event => { if (dragging) set(closest(event), true); });
  dot.addEventListener('pointerup', () => { dragging = false; });
  dot.addEventListener('keydown', event => { if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -0.02 : event.key === 'Home' ? -1 : event.key === 'End' ? 1 : 0.02; set(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : progress + delta, true); });
  return { setProgress: set, getProgress: () => progress };
}
