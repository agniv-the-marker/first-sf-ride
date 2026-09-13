import { CITY_LABELS } from './config.js';
import { formatDistance, formatTime, pointAtProgress, projectBounds, sampleByDistance, toPath } from './gpx.js';
import { createRoute } from './route.js';
import { createMediaController } from './media.js';
import { createEditor } from './editor.js';
import { ROUTE_DATA } from './route-data.js';
import { MEDIA_DATA } from './media-data.js';

const sections = [...document.querySelectorAll('.story-section')];
const ridePercent = document.querySelector('#ridePercent');
const rideTime = document.querySelector('#rideTime');
const rideDistance = document.querySelector('#rideDistance');

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
  const measured = ROUTE_DATA;
  const track = measured.points;
  const samples = sampleByDistance(measured);
  document.querySelector('h1').innerHTML = 'escapism <span>versus</span> <em>explorism</em>';
  document.querySelector('.byline').textContent = 'alt title: agniv and shubham almost get killed by google maps';
  document.querySelector('.closing')?.remove();
  addEssayFooter();
  const routeStage = document.querySelector('.route-stage');
  const stageBounds = routeStage.getBoundingClientRect();
  const mapHeight = Math.max(105, Math.min(220, 100 * stageBounds.height / Math.max(1, stageBounds.width)));
  const projection = projectBounds(samples, { width: 100, height: mapHeight, padding: 7 });
  let media = { setProgress: () => {} };
  const route = createRoute({
    svg: document.querySelector('.route-map'),
    dot: document.querySelector('[data-route-dot]'),
    halo: document.querySelector('[data-route-halo]'),
    pathData: toPath(samples, projection),
    cities: CITY_LABELS,
    samples,
    projection,
    getPoint: progress => pointAtProgress(measured, progress),
    onProgress: (progress, shouldScroll, point) => {
      ridePercent.textContent = `${Math.round(progress * 100).toString().padStart(2, '0')}%`;
      rideDistance.textContent = formatDistance(measured.totalKm * progress);
      rideTime.textContent = formatTime(point?.time);
      media.setProgress(progress);
      if (shouldScroll) {
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        scrollTo({ top: maxScroll * progress, behavior: 'auto' });
      }
    }
  });
  let scrollFrame = 0;
  const syncRouteToScroll = () => {
    scrollFrame = 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    route.setProgress(scrollY / maxScroll);
  };
  const scheduleScrollSync = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(syncRouteToScroll);
  };
  addEventListener('scroll', scheduleScrollSync, { passive: true });
  addEventListener('resize', scheduleScrollSync, { passive: true });
  addEventListener('pageshow', scheduleScrollSync, { passive: true });
  syncRouteToScroll();
  requestAnimationFrame(() => requestAnimationFrame(syncRouteToScroll));
  setTimeout(syncRouteToScroll, 300);

  const mediaManifest = MEDIA_DATA;
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
  media = createMediaController({ cards: [...photoCards, ...videoCards], manifest: mediaManifest, controls: document.querySelector('#mediaControls') });
  createEditor({ media, manifestKey: 'sf-ride-page-v3' });
  syncRouteToScroll();
}

start().catch(error => {
  console.error('Unable to load ride data', error);
  const loading = document.querySelector('#routeLoading');
  if (loading) loading.textContent = 'could not load the route — try refreshing';
});
