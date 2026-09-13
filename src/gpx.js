export function parseGPX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.querySelectorAll('trkpt')].map(node => ({ lat: Number(node.getAttribute('lat')), lon: Number(node.getAttribute('lon')), time: node.querySelector('time')?.textContent })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

export function thin(points, max = 900) {
  if (points.length <= max) return points;
  const stride = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * stride)]);
}

export function projectBounds(points) {
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const cosLat = Math.cos(meanLat * Math.PI / 180);
  const projected = points.map(point => ({ ...point, x: point.lon * cosLat, y: -point.lat }));
  const xs = projected.map(point => point.x), ys = projected.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const xRange = maxX - minX || 1, yRange = maxY - minY || 1, scale = Math.min(86 / xRange, 92 / yRange);
  return { projected, minX, minY, scale, left: (100 - xRange * scale) / 2, top: (100 - yRange * scale) / 2 };
}

export function toPath(points, projection = projectBounds(points)) {
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const cosLat = Math.cos(meanLat * Math.PI / 180);
  return points.map((point, index) => { const x = point.x ?? point.lon * cosLat; const y = point.y ?? -point.lat; return `${index ? 'L' : 'M'}${(projection.left + (x - projection.minX) * projection.scale).toFixed(3)},${(projection.top + (y - projection.minY) * projection.scale).toFixed(3)}`; }).join(' ');
}

export function pointToSVG(point, projection) {
  return { x: projection.left + (point.lon * Math.cos((projection.meanLat || 0) * Math.PI / 180) - projection.minX) * projection.scale, y: projection.top + (-point.lat - projection.minY) * projection.scale };
}

export function formatTime(time) { return time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'; }
