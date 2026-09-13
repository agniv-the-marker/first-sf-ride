const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gpx = fs.readFileSync(path.join(root, 'calm_lil_wednesday_excursion.gpx'), 'utf8');
const rawPoints = [...gpx.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">[\s\S]*?<time>([^<]+)<\/time>[\s\S]*?<\/trkpt>/g)]
  .map(match => ({ lat: Number(match[1]), lon: Number(match[2]), time: match[3] }));

function distanceKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(b.lat - a.lat);
  const deltaLon = radians(b.lon - a.lon);
  const latA = radians(a.lat);
  const latB = radians(b.lat);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(value));
}

let totalKm = 0;
const measured = rawPoints.map((point, index) => {
  if (index) totalKm += distanceKm(rawPoints[index - 1], point);
  return { ...point, distanceKm: totalKm };
});

function pointAtDistance(target) {
  let low = 0;
  let high = measured.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (measured[middle].distanceKm < target) low = middle + 1;
    else high = middle;
  }
  if (!low) return measured[0];
  const before = measured[low - 1];
  const after = measured[low];
  const span = after.distanceKm - before.distanceKm;
  const amount = span ? (target - before.distanceKm) / span : 0;
  return {
    lat: before.lat + (after.lat - before.lat) * amount,
    lon: before.lon + (after.lon - before.lon) * amount,
    time: new Date(Date.parse(before.time) + (Date.parse(after.time) - Date.parse(before.time)) * amount).toISOString(),
    distanceKm: target
  };
}

const pointCount = 1100;
const points = Array.from({ length: pointCount }, (_, index) => pointAtDistance(totalKm * index / (pointCount - 1)));
const routeSource = `// Generated from calm_lil_wednesday_excursion.gpx. Run this script to refresh.\nexport const ROUTE_DATA = ${JSON.stringify({ totalKm, points })};\n`;
const media = JSON.parse(fs.readFileSync(path.join(root, 'media-manifest.json'), 'utf8'));
const mediaSource = `// Generated from media-manifest.json. Run this script to refresh.\nexport const MEDIA_DATA = ${JSON.stringify(media)};\n`;

fs.writeFileSync(path.join(root, 'src', 'route-data.js'), routeSource);
fs.writeFileSync(path.join(root, 'src', 'media-data.js'), mediaSource);
