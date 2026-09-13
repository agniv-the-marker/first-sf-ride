const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bounds = { south: 37.35, west: -122.56, north: 37.82, east: -122.08 };
const roadTypes = 'motorway|trunk|primary';
const query = `[out:json][timeout:90];way["highway"~"^(${roadTypes})$"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out tags geom qt;`;

function simplify(points, tolerance = 0.00006) {
  if (points.length <= 2) return points;
  const squareTolerance = tolerance ** 2;
  const kept = [points[0]];
  let previous = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const dx = point.lon - previous.lon;
    const dy = point.lat - previous.lat;
    if (dx * dx + dy * dy >= squareTolerance) {
      kept.push(point);
      previous = point;
    }
  }
  kept.push(points.at(-1));
  return kept;
}

async function run() {
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  let response;
  for (const endpoint of endpoints) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'first-sf-ride-map-data-builder/1.0'
      },
      body: `data=${encodeURIComponent(query)}`
    });
    if (response.ok) break;
  }
  if (!response?.ok) throw new Error(`Overpass request failed (${response?.status || 'no response'})`);
  const data = await response.json();
  const grouped = new Map();
  data.elements
    .filter(element => element.type === 'way' && element.geometry?.length > 1)
    .forEach(element => {
      const type = element.tags.highway;
      const name = element.tags.name || element.tags.ref || 'unnamed';
      const key = `${type}|${name}`;
      if (!grouped.has(key)) grouped.set(key, { type, name, segments: [] });
      grouped.get(key).segments.push(simplify(element.geometry.map(point => ({
        lat: Number(point.lat.toFixed(5)),
        lon: Number(point.lon.toFixed(5))
      }))).map(point => [point.lon, point.lat]));
    });
  const roads = [...grouped.values()];
  const source = `// Generated from OpenStreetMap via Overpass. No runtime map request is made.\nexport const MAP_DATA = ${JSON.stringify({ bounds, roads })};\n`;
  fs.writeFileSync(path.join(root, 'src', 'map-data.js'), source);
  console.log(`Wrote ${roads.length} road segments to src/map-data.js`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
