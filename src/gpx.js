const EARTH_RADIUS_KM = 6371.0088;

export function parseGPX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.querySelectorAll('trkpt')]
    .map(node => ({
      lat: Number(node.getAttribute('lat')),
      lon: Number(node.getAttribute('lon')),
      time: node.querySelector('time')?.textContent || null
    }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

export function distanceKm(a, b) {
  const toRadians = value => value * Math.PI / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(value));
}

export function measureTrack(points) {
  let totalKm = 0;
  const measured = points.map((point, index) => {
    if (index) totalKm += distanceKm(points[index - 1], point);
    return { ...point, distanceKm: totalKm };
  });
  return { points: measured, totalKm };
}

function interpolatePoint(a, b, amount, distance) {
  const startTime = Date.parse(a.time);
  const endTime = Date.parse(b.time);
  const time = Number.isFinite(startTime) && Number.isFinite(endTime)
    ? new Date(startTime + (endTime - startTime) * amount).toISOString()
    : a.time || b.time;
  return {
    lat: a.lat + (b.lat - a.lat) * amount,
    lon: a.lon + (b.lon - a.lon) * amount,
    time,
    distanceKm: distance
  };
}

export function pointAtDistance(measured, distance) {
  const points = measured.points;
  if (!points.length) return null;
  const target = Math.max(0, Math.min(measured.totalKm, distance));
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].distanceKm < target) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return points[0];
  const after = points[low];
  const before = points[low - 1];
  const span = after.distanceKm - before.distanceKm;
  return interpolatePoint(before, after, span ? (target - before.distanceKm) / span : 0, target);
}

export function pointAtProgress(measured, progress) {
  return pointAtDistance(measured, measured.totalKm * Math.max(0, Math.min(1, progress)));
}

export function sampleByDistance(measured, max = 1100) {
  if (measured.points.length <= max) return measured.points.map(point => ({ ...point, progress: measured.totalKm ? point.distanceKm / measured.totalKm : 0 }));
  return Array.from({ length: max }, (_, index) => {
    const progress = index / (max - 1);
    return { ...pointAtProgress(measured, progress), progress };
  });
}

export function webMercator(point) {
  const latitude = Math.max(-85.051129, Math.min(85.051129, point.lat));
  const radians = latitude * Math.PI / 180;
  return {
    ...point,
    x: (point.lon + 180) / 360,
    y: (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2
  };
}

export function projectBounds(points, { width = 100, height = 150, padding = 8 } = {}) {
  const projected = points.map(webMercator);
  const xs = projected.map(point => point.x);
  const ys = projected.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  const scale = Math.min((width - padding * 2) / xRange, (height - padding * 2) / yRange);
  return {
    projected,
    minX,
    minY,
    maxX,
    maxY,
    scale,
    width,
    height,
    left: (width - xRange * scale) / 2,
    top: (height - yRange * scale) / 2
  };
}

export function projectPoint(point, projection) {
  const projected = webMercator(point);
  return {
    x: projection.left + (projected.x - projection.minX) * projection.scale,
    y: projection.top + (projected.y - projection.minY) * projection.scale
  };
}

export function toPath(points, projection) {
  return points.map((point, index) => {
    const position = point.x === undefined ? projectPoint(point, projection) : {
      x: projection.left + (point.x - projection.minX) * projection.scale,
      y: projection.top + (point.y - projection.minY) * projection.scale
    };
    return `${index ? 'L' : 'M'}${position.x.toFixed(3)},${position.y.toFixed(3)}`;
  }).join(' ');
}

export function formatTime(time) {
  return time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
}

export function formatDistance(kilometers) {
  return `${(kilometers * 0.621371).toFixed(1)} mi`;
}
