const fs = require('fs');
const { execFileSync } = require('node:child_process');
const path = require('path');

const mediaDir = path.join(__dirname, '..', 'peak-bikeride', 'peak-bikeride');

// Whether a clip carries a sound track, and how big its picture is. The originals
// are AVIs with a PCM track; an earlier conversion to mp4 dropped it, and the
// manifest asserted `audio: false` for everything, which silently hid the unmute
// button. The size lets the page cap a tall clip by its aspect so it can sit fully
// in frame — which is what the autoplay rule requires.
function probeVideo(file) {
  try {
    const audio = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a',
      '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    const size = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { encoding: 'utf8' });
    const [w, h] = size.trim().split('x').map(Number);
    return { audio: audio.trim().length > 0, ...(w && h ? { w, h } : {}) };
  } catch {
    return { audio: null }; // no ffprobe here: let the player decide
  }
}

// Minimal JPEG EXIF reader: walk the markers to APP1, then the TIFF IFDs to
// DateTimeOriginal. Enough to know when each frame was taken, without a dependency.
function readCaptureTime(file) {
  let buffer;
  try { buffer = fs.readFileSync(file); } catch { return null; }
  if (buffer.readUInt16BE(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer.readUInt16BE(offset);
    const size = buffer.readUInt16BE(offset + 2);
    if (marker === 0xffe1 && buffer.toString('ascii', offset + 4, offset + 10) === 'Exif\0\0') {
      const tiff = offset + 10;
      const little = buffer.toString('ascii', tiff, tiff + 2) === 'II';
      const u16 = at => (little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
      const u32 = at => (little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at));
      const readIFD = (start, wanted) => {
        if (start + 2 > buffer.length) return null;
        const count = u16(start);
        for (let index = 0; index < count; index += 1) {
          const entry = start + 2 + index * 12;
          if (entry + 12 > buffer.length) break;
          const tag = u16(entry);
          if (!wanted.includes(tag)) continue;
          const value = u32(entry + 8);
          if (tag === 0x8769) return { exifIFD: tiff + value };
          const text = buffer.toString('ascii', tiff + value, tiff + value + 19);
          if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return { time: text };
        }
        return null;
      };
      const zeroth = tiff + u32(tiff + 4);
      const pointer = readIFD(zeroth, [0x8769]);
      const fromExif = pointer?.exifIFD ? readIFD(pointer.exifIFD, [0x9003, 0x9004]) : null;
      const fromZeroth = fromExif?.time ? null : readIFD(zeroth, [0x0132]);
      const raw = fromExif?.time || fromZeroth?.time;
      if (!raw) return null;
      return `${raw.slice(0, 10).replace(/:/g, '-')}T${raw.slice(11)}`;
    }
    if (marker === 0xffda) return null;
    offset += 2 + size;
  }
  return null;
}
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
// Intrinsic size straight from the JPEG frame header, so the page can reserve the
// right box before a byte of image data arrives and never reflow on load.
function readDimensions(file) {
  let buffer;
  try { buffer = fs.readFileSync(file); } catch { return null; }
  if (buffer.readUInt16BE(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const size = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buffer.readUInt16BE(offset + 5), w: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + size;
  }
  return null;
}

const items = sequence.map((name, order) => ({
  id: `media-${String(order + 1).padStart(3, '0')}`,
  filename: name,
  src: `peak-bikeride/peak-bikeride/${name}`,
  type: name.endsWith('.mp4') ? 'video' : 'image',
  time: name.endsWith('.mp4') ? null : readCaptureTime(path.join(mediaDir, name)),
  ...(name.endsWith('.mp4')
    ? probeVideo(path.join(mediaDir, name))
    : { audio: undefined, ...(readDimensions(path.join(mediaDir, name)) || {}) }),
  at: files.length === 1 ? 0 : order / (files.length - 1),
  order,
  span: order % 9 === 0 ? 2 : 1
}));
fs.writeFileSync(path.join(__dirname, '..', 'media-manifest.json'), `${JSON.stringify(items, null, 2)}\n`);
console.log(`generated ${items.length} media entries, ${items.filter(item => item.time).length} with a capture time, ${items.filter(item => item.w && item.h).length} with intrinsic size, ${items.filter(item => item.audio).length} with sound`);
