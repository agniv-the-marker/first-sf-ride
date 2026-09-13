const fs = require('fs');
const path = require('path');

const mediaDir = path.join(__dirname, '..', 'peak-bikeride', 'peak-bikeride');
const excluded = new Set(['5760BC20-79C9-4422-9C67-7BC8D62BB921_1_105_c.jpeg']);
const files = fs.readdirSync(mediaDir).filter(name => !excluded.has(name) && /\.(JPG|jpeg|mp4)$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const images = files.filter(name => !name.toLowerCase().endsWith('.mp4'));
const videos = files.filter(name => name.toLowerCase().endsWith('.mp4'));
const sequence = [];
let videoIndex = 0;
images.forEach((name, imageIndex) => {
  sequence.push(name);
  const target = Math.round((imageIndex + 1) * videos.length / (images.length + 1));
  while (videoIndex < target) sequence.push(videos[videoIndex++]);
});
while (videoIndex < videos.length) sequence.push(videos[videoIndex++]);
const items = sequence.map((name, order) => ({
  id: `media-${String(order + 1).padStart(3, '0')}`,
  filename: name,
  src: `peak-bikeride/peak-bikeride/${name}`,
  type: name.endsWith('.mp4') ? 'video' : 'image',
  audio: name.endsWith('.mp4') ? false : undefined,
  at: files.length === 1 ? 0 : order / (files.length - 1),
  order,
  span: order % 9 === 0 ? 2 : 1
}));
fs.writeFileSync(path.join(__dirname, '..', 'media-manifest.json'), `${JSON.stringify(items, null, 2)}\n`);
console.log(`generated ${items.length} media entries`);
