import { CITY_LABELS, GPX_URL } from './config.js';
import { formatTime, parseGPX, projectBounds, thin, toPath } from './gpx.js';
import { createRoute } from './route.js';
import { createMediaController } from './media.js';
import { createEditor } from './editor.js';
import { createGroundView } from './google.js';

const sections = [...document.querySelectorAll('.story-section')];
const ridePercent = document.querySelector('#ridePercent');
const rideTime = document.querySelector('#rideTime');

const atmosphereStops = [
  [0, '#58654f', '#f5f0df', '#d6d0bd', '#d97758', '#b4c8bd'],
  [.18, '#806247', '#f6eee0', '#d9cbb7', '#e58a5d', '#b5c8bd'],
  [.34, '#34434a', '#f1eee4', '#c6c9bf', '#dc8060', '#a6c4c3'],
  [.68, '#182427', '#eeeae0', '#a7b1ab', '#dc7758', '#87aaa8'],
  [.86, '#6c6654', '#f8f0dc', '#d9cfb8', '#d87a59', '#a8bdb0'],
  [1, '#4b594c', '#f5f0df', '#d0cfbd', '#d97758', '#b4c8bd']
];

function setAtmosphere(progress, point, start, end) {
  const timestamp = point?.time ? new Date(point.time).getTime() : NaN;
  const startTime = start ? new Date(start).getTime() : NaN;
  const endTime = end ? new Date(end).getTime() : NaN;
  const ratio = Number.isFinite(timestamp) && endTime > startTime ? Math.max(0, Math.min(1, (timestamp - startTime) / (endTime - startTime))) : progress;
  const next = atmosphereStops.findIndex(stop => stop[0] >= ratio);
  const upper = next <= 0 ? atmosphereStops[0] : atmosphereStops[next];
  const lower = next <= 0 ? upper : atmosphereStops[next - 1];
  const amount = upper === lower ? 0 : (ratio - lower[0]) / (upper[0] - lower[0]);
  const mix = (a, b) => [0, 2, 4].map(index => Math.round(parseInt(a.slice(1 + index, 3 + index), 16) + (parseInt(b.slice(1 + index, 3 + index), 16) - parseInt(a.slice(1 + index, 3 + index), 16)) * amount).toString(16).padStart(2, '0')).join('').replace(/^/, '#');
  const root = document.documentElement;
  root.style.setProperty('--bg', mix(lower[1], upper[1]));
  root.style.setProperty('--ink', mix(lower[2], upper[2]));
  root.style.setProperty('--muted', mix(lower[3], upper[3]));
  root.style.setProperty('--rust', mix(lower[4], upper[4]));
  root.style.setProperty('--blue', mix(lower[5], upper[5]));
}

function addEssayFooter() {
  const footer = document.createElement('footer');
  footer.className = 'essay-footer';
  footer.innerHTML = `<svg viewBox="0 0 900 30" preserveAspectRatio="none" aria-hidden="true"><path d="M2 16 C 80 4, 120 26, 200 13 S 320 19, 410 12 S 530 5, 620 16 S 760 23, 898 10"/><path d="M4 20 C 110 14, 150 26, 260 17 S 420 24, 540 15 S 690 26, 895 14"/></svg><div><a href="https://agniv.me/" target="_blank" rel="noreferrer">agniv.me</a><a href="https://shubhampatil.dev/" target="_blank" rel="noreferrer">shubhampatil.dev</a></div>`;
  document.querySelector('.essay-inner').append(footer);
}

function makeCard(item) {
  const card = document.createElement('figure');
  card.className = `media-card${item.type === 'video' ? ' video-card' : ''}`;
  card.dataset.mediaId = item.id;
  if (item.rotate) card.style.setProperty('--media-rotation', `${item.rotate}deg`);
  if (item.type === 'video') {
    card.innerHTML = `<video muted loop playsinline preload="metadata"><source src="${item.src}" type="video/mp4"></video><div class="video-controls"><button class="video-pause-toggle" type="button" aria-label="Pause video" aria-pressed="false">pause</button>${item.audio === false ? '' : '<button class="video-audio-toggle" type="button" aria-label="Unmute video" aria-pressed="false">unmute</button>'}</div>`;
    const video = card.querySelector('video');
    const button = card.querySelector('.video-audio-toggle');
    const pauseButton = card.querySelector('.video-pause-toggle');
    video.addEventListener('play', () => { pauseButton.textContent = 'pause'; pauseButton.setAttribute('aria-label', 'Pause video'); pauseButton.setAttribute('aria-pressed', 'false'); });
    video.addEventListener('pause', () => { pauseButton.textContent = 'play'; pauseButton.setAttribute('aria-label', 'Play video'); pauseButton.setAttribute('aria-pressed', 'true'); });
    pauseButton.addEventListener('click', () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
    button?.addEventListener('click', async event => {
      event.preventDefault();
      const shouldUnmute = video.muted || video.volume === 0;
      video.muted = !shouldUnmute;
      video.volume = shouldUnmute ? 1 : 0;
      if (shouldUnmute) { try { await video.play(); } catch {} }
      button.textContent = shouldUnmute ? 'mute' : 'unmute';
      button.setAttribute('aria-label', shouldUnmute ? 'Mute video' : 'Unmute video');
      button.setAttribute('aria-pressed', String(shouldUnmute));
    });
  } else {
    card.innerHTML = `<img src="${item.src}" alt="${item.filename || 'Ride photograph'}" loading="lazy">`;
  }
  return card;
}

async function start() {
  const response = await fetch(GPX_URL);
  const track = parseGPX(await response.text());
  if (!track.length) throw new Error('GPX contained no track points');
  const rideStart = track[0]?.time;
  const rideEnd = track.at(-1)?.time;
  document.querySelector('h1').innerHTML = 'escapism <span>versus</span> <em>explorism</em>';
  document.querySelector('.byline').textContent = 'alt title: agniv and shubham almost get killed by google maps';
  document.querySelector('.closing')?.remove();
  addEssayFooter();
  const projection = projectBounds(thin(track));
  const groundView = await createGroundView(document.querySelector('#earthView'), track[Math.round(track.length / 2)]);
  const mediaManifest = await fetch('../media-manifest.json').then(result => result.json());
  const mediaRegion = document.querySelector('#mediaRegion');
  const mediaBottom = document.querySelector('#mediaBottom');
  mediaRegion.innerHTML = '';
  mediaBottom.innerHTML = '';
  const makeColumnSet = (region, items, count = 4) => {
    const columns = Array.from({ length: count }, () => { const column = document.createElement('div'); column.className = 'media-column'; region.append(column); return column; });
    const cards = items.map(makeCard);
    const rebalance = () => {
      const heights = columns.map(() => 0);
      columns.forEach(column => { column.innerHTML = ''; });
      cards.forEach(card => {
        const media = card.querySelector('img');
        const ratio = media?.naturalWidth && media?.naturalHeight ? media.naturalWidth / media.naturalHeight : 1.25;
        const columnWidth = Math.max(1, columns[0].clientWidth);
        const index = heights.indexOf(Math.min(...heights));
        columns[index].append(card);
        heights[index] += columnWidth / ratio + columnWidth * 0.05;
      });
    };
    cards.forEach(card => { const image = card.querySelector('img'); image?.addEventListener('load', rebalance); });
    rebalance();
    return cards;
  };
  const photos = mediaManifest.filter(item => item.type !== 'video');
  const videos = mediaManifest.filter(item => item.type === 'video');
  mediaBottom.innerHTML = '';
  mediaBottom.hidden = true;
  const photoCards = makeColumnSet(mediaRegion, photos, 3);
  const videoCards = [];
  videos.forEach((item, index) => { const card = makeCard(item); videoCards.push(card); sections[Math.min(sections.length - 1, Math.floor(index * sections.length / videos.length))].append(card); });
  const media = createMediaController({ cards: [...photoCards, ...videoCards], manifest: mediaManifest, controls: document.querySelector('#mediaControls') });
  const route = createRoute({ svg: document.querySelector('.route-map'), dot: document.querySelector('[data-route-dot]'), pathData: toPath(thin(track), projection), points: CITY_LABELS, projection, onProgress: (progress, shouldScroll) => { const point = track[Math.round(progress * (track.length - 1))]; ridePercent.textContent = `${Math.round(progress * 100)}%`; rideTime.textContent = formatTime(point?.time); setAtmosphere(progress, point, rideStart, rideEnd); media.setProgress(progress); groundView.setPosition(point); if (shouldScroll) scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * progress, behavior: 'auto' }); } });
  const observer = new IntersectionObserver(entries => { const active = entries.filter(entry => entry.isIntersecting).sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0]; if (active) route.setProgress(Number(active.target.dataset.section) / (sections.length - 1)); }, { threshold: .1, rootMargin: '-35% 0px -48% 0px' });
  sections.forEach(section => observer.observe(section));
  createEditor({ media, manifestKey: 'sf-ride-page-v3' });
  route.setProgress(0);
}

start().catch(error => console.error('Unable to load ride data', error));
