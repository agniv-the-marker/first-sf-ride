// Bakes a land/water mask from OpenStreetMap coastlines so the map's water only
// ever paints on water. The mask is stored in Web Mercator space, which is the
// same space projectBounds() scales linearly into screen units — so sampling it
// at runtime is just the inverse of that linear map, no reprojection.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
// Generous margins: the map panel's viewport is taller than the route's own
// bounding box, so the mask has to cover well beyond the ride to avoid a dry
// band at the top and bottom of the stage.
const bounds = { south: 37.02, west: -122.72, north: 38.08, east: -121.92 };
const WIDTH = 520;
// One seed is enough: the bay reaches the Pacific through the Golden Gate, so the
// whole wet region is connected. A seed that lands on a beach floods the entire
// peninsula instead, which is what CHECKS below exists to catch.
const SEEDS = [{ lat: 37.45, lon: -122.55 }];

const CHECKS = [
  { lat: 37.406132, lon: -122.126204, water: false, name: 'stanford' },
  { lat: 37.4292, lon: -122.2539, water: false, name: 'woodside' },
  { lat: 37.4636, lon: -122.4286, water: false, name: 'half moon bay' },
  { lat: 37.782112, lon: -122.393594, water: false, name: 'san francisco' },
  { lat: 37.5, lon: -122.54, water: true, name: 'open pacific' },
  { lat: 37.58, lon: -122.27, water: true, name: 'san francisco bay' }
];

const query = `[out:json][timeout:120];way["natural"="coastline"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out geom qt;`;

const mercatorY = lat => {
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat));
  return (1 - Math.asinh(Math.tan(clamped * Math.PI / 180)) / Math.PI) / 2;
};
const mercatorX = lon => (lon + 180) / 360;

const minX = mercatorX(bounds.west);
const maxX = mercatorX(bounds.east);
const minY = mercatorY(bounds.north);
const maxY = mercatorY(bounds.south);
const HEIGHT = Math.round(WIDTH * (maxY - minY) / (maxX - minX));

const toCell = (lat, lon) => ({
  x: Math.round((mercatorX(lon) - minX) / (maxX - minX) * (WIDTH - 1)),
  y: Math.round((mercatorY(lat) - minY) / (maxY - minY) * (HEIGHT - 1))
});

function drawLine(blocked, a, b) {
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let error = dx + dy;
  for (let guard = 0; guard < 1e6; guard += 1) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) blocked[y * WIDTH + x] = 1;
    if (x === b.x && y === b.y) return;
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
}

function flood(blocked, water, seed) {
  const start = toCell(seed.lat, seed.lon);
  if (start.x < 0 || start.x >= WIDTH || start.y < 0 || start.y >= HEIGHT) throw new Error(`seed off-raster: ${JSON.stringify(seed)}`);
  const first = start.y * WIDTH + start.x;
  if (blocked[first]) throw new Error(`seed lands on a coastline: ${JSON.stringify(seed)}`);
  if (water[first]) return 0;
  const stack = [first];
  water[first] = 1;
  let filled = 0;
  while (stack.length) {
    const index = stack.pop();
    filled += 1;
    const x = index % WIDTH;
    const y = (index - x) / WIDTH;
    if (x > 0) { const n = index - 1; if (!blocked[n] && !water[n]) { water[n] = 1; stack.push(n); } }
    if (x < WIDTH - 1) { const n = index + 1; if (!blocked[n] && !water[n]) { water[n] = 1; stack.push(n); } }
    if (y > 0) { const n = index - WIDTH; if (!blocked[n] && !water[n]) { water[n] = 1; stack.push(n); } }
    if (y < HEIGHT - 1) { const n = index + WIDTH; if (!blocked[n] && !water[n]) { water[n] = 1; stack.push(n); } }
  }
  return filled;
}

async function fetchCoastline() {
  const cachePath = process.env.WATER_MASK_CACHE;
  if (cachePath && fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
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
        'User-Agent': 'first-sf-ride-water-mask-builder/1.0'
      },
      body: `data=${encodeURIComponent(query)}`
    });
    if (response.ok) break;
  }
  if (!response?.ok) throw new Error(`Overpass request failed (${response?.status || 'no response'})`);
  const data = await response.json();
  if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(data));
  return data;
}

async function run() {
  const data = await fetchCoastline();
  const ways = data.elements.filter(element => element.type === 'way' && element.geometry?.length > 1);
  if (!ways.length) throw new Error('Overpass returned no coastline ways');

  const coast = new Uint8Array(WIDTH * HEIGHT);
  const blocked = new Uint8Array(WIDTH * HEIGHT);
  // Seal the raster border. Without it a fill escapes around the outside of a
  // shoreline that the bounding box cuts open, and swallows the whole peninsula.
  for (let x = 0; x < WIDTH; x += 1) { blocked[x] = 1; blocked[(HEIGHT - 1) * WIDTH + x] = 1; }
  for (let y = 0; y < HEIGHT; y += 1) { blocked[y * WIDTH] = 1; blocked[y * WIDTH + WIDTH - 1] = 1; }
  ways.forEach(way => {
    for (let index = 1; index < way.geometry.length; index += 1) {
      drawLine(coast, toCell(way.geometry[index - 1].lat, way.geometry[index - 1].lon), toCell(way.geometry[index].lat, way.geometry[index].lon));
    }
  });

  for (let index = 0; index < coast.length; index += 1) if (coast[index]) blocked[index] = 1;

  const water = new Uint8Array(WIDTH * HEIGHT);
  const filled = SEEDS.map(seed => flood(blocked, water, seed));
  // The coastline cells themselves read as water, so the shore has no dry seam.
  // The sealed border is scaffolding and must not become a frame of water.
  for (let index = 0; index < coast.length; index += 1) if (coast[index]) water[index] = 1;

  CHECKS.forEach(check => {
    const point = toCell(check.lat, check.lon);
    const wet = Boolean(water[point.y * WIDTH + point.x]);
    if (wet !== check.water) throw new Error(`mask check failed: ${check.name} came out ${wet ? 'water' : 'land'}`);
  });

  const bytes = new Uint8Array(Math.ceil(water.length / 8));
  for (let index = 0; index < water.length; index += 1) if (water[index]) bytes[index >> 3] |= 1 << (index & 7);
  const bits = Buffer.from(bytes).toString('base64');

  if (process.env.WATER_MASK_PNG) {
    const rows = [];
    for (let y = 0; y < HEIGHT; y += 1) {
      let row = '';
      for (let x = 0; x < WIDTH; x += 1) row += water[y * WIDTH + x] ? '#' : '.';
      rows.push(row);
    }
    fs.writeFileSync(process.env.WATER_MASK_PNG, `P1\n${WIDTH} ${HEIGHT}\n${rows.map(row => row.split('').map(c => (c === '#' ? 1 : 0)).join(' ')).join('\n')}\n`);
  }

  const wet = water.reduce((sum, value) => sum + value, 0);
  const source = `// Generated from OpenStreetMap coastlines via Overpass. Run scripts/generate-water-mask.js to refresh.\n`
    + `// Web Mercator space, 1 bit per cell, row-major, LSB first. 1 = water.\n`
    + `export const WATER_MASK = ${JSON.stringify({ width: WIDTH, height: HEIGHT, minX, maxX, minY, maxY, bits })};\n`;
  fs.writeFileSync(path.join(root, 'src', 'water-mask.js'), source);
  console.log(`${ways.length} coastline ways -> ${WIDTH}x${HEIGHT} mask, ${(wet / water.length * 100).toFixed(1)}% water (seeds filled ${filled.join(', ')}), ${(bits.length / 1024).toFixed(0)}KB base64`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
