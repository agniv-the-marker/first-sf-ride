import { CITY_LABELS, HIDE_UNDATED_MEDIA } from './config.js';
import { formatDistance, formatElevation, formatTime, pointAtDistance, pointAtProgress, rideHour, stateAtTime, projectBounds, sampleByDistance, toPath } from './gpx.js';
import { createRoute } from './route.js';
import { createMediaController } from './media.js';
import { createMediaLoop } from './media-loop.js';
import { createWater } from './water.js';
import { accentsAt } from './palette.js';
import { ROUTE_DATA } from './route-data.js';
import { MEDIA_DATA } from './media-data.js';

const sections = [...document.querySelectorAll('.story-section')];
const ridePercent = document.querySelector('#ridePercent');
const rideTime = document.querySelector('#rideTime');
const rideDistance = document.querySelector('#rideDistance');
const rideGain = document.querySelector('#rideGain');
const root = document.documentElement;

function addEssayFooter() {
  const footer = document.createElement('footer');
  footer.className = 'essay-footer';
  footer.innerHTML = `<svg class="bike-lane" viewBox="0 0 900 60" role="img" aria-label="A bike lane, end of the ride"><defs><filter id="laneGrain" filterUnits="userSpaceOnUse" x="-14" y="-18" width="928" height="96"><feTurbulence type="fractalNoise" baseFrequency="0.13 0.09" numOctaves="3" seed="5" result="noise"></feTurbulence><feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap></filter></defs><g class="lane-edges"><path d="M0 3H900"/><path d="M0 57H900"/></g><g class="lane-dashes"><path d="M0 30H900"/></g></svg><div><span class="lane-note">end of the ride</span><a href="https://agniv.me/" target="_blank" rel="noreferrer">agniv.me</a><a href="https://shubhampatil.dev/" target="_blank" rel="noreferrer">shubhampatil.dev</a></div>`;
  document.querySelector('.essay-inner').append(footer);
}

function makeCard(item) {
  const card = document.createElement('figure');
  card.className = `media-card${item.type === 'video' ? ' video-card' : ''}`;
  card.dataset.mediaId = item.id;
  if (item.time) card.dataset.time = item.time;
  if (item.rotate) card.style.setProperty('--media-rotation', `${item.rotate}deg`);
  if (item.type === 'video') {
    card.innerHTML = `<video muted loop playsinline preload="metadata"><source src="${item.src}" type="video/mp4"></video><div class="video-controls"><button class="video-pause-toggle" type="button" aria-label="Pause video" aria-pressed="false">pause</button>${item.audio === false ? '' : '<button class="video-audio-toggle" type="button" aria-label="Unmute video" aria-pressed="false">unmute</button>'}</div>`;
  } else {
    if (item.w && item.h) card.dataset.ratio = item.w / item.h;
    if (item.time) card.dataset.time = item.time;
    card.dataset.photo = item.id;
    const size = item.w && item.h ? ` width="${item.w}" height="${item.h}"` : '';
    card.innerHTML = `<img src="${item.src}"${size} alt="${item.filename || 'Ride photograph'}" loading="lazy">`;
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
  // The opening letter gets its own element so it can be printed more than once:
  // ::first-letter cannot carry pseudo-elements of its own.
  const opener = document.querySelector('.story-section p');
  if (opener?.textContent.trim()) {
    const raw = opener.textContent;
    const index = raw.search(/\S/);
    const cap = document.createElement('span');
    cap.className = 'drop-cap';
    cap.dataset.letter = raw[index];
    cap.textContent = raw[index];
    opener.textContent = '';
    opener.append(cap, raw.slice(index + 1));
  }
  addEssayFooter();
  const routeStage = document.querySelector('.route-stage');
  const stageBounds = routeStage.getBoundingClientRect();
  const mapHeight = Math.max(105, Math.min(220, 100 * stageBounds.height / Math.max(1, stageBounds.width)));
  const projection = projectBounds(samples, { width: 100, height: mapHeight, padding: 7 });
  const water = createWater({ host: routeStage, svg: document.querySelector('.route-map'), projection });
  const MARK_STEP_MI = 5;
  const COPY_GAP = 12;
  let railMarks = [];
  let media = { setProgress: () => {} };
  const route = createRoute({
    svg: document.querySelector('.route-map'),
    dot: document.querySelector('[data-route-dot]'),
    marker: document.querySelector('[data-route-marker]'),
    pathData: toPath(samples, projection),
    cities: CITY_LABELS,
    samples,
    projection,
    getPoint: progress => pointAtProgress(measured, progress),
    onProgress: (progress, shouldScroll, point) => {
      ridePercent.textContent = `${Math.round(progress * 100).toString().padStart(2, '0')}%`;
      rideDistance.textContent = formatDistance(measured.totalKm * progress);
      rideGain.textContent = formatElevation(point?.gainM);
      const miles = measured.totalKm * progress * 0.621371;
      railMarks.forEach(mark => mark.classList.toggle('is-current', Math.abs(Number(mark.dataset.mile) - miles) <= MARK_STEP_MI / 2));
      const hour = rideHour(point?.time);
      water.setHour(hour);
      if (hour !== null) {
        const accents = accentsAt(hour);
        root.style.setProperty('--rust', accents.warm);
        root.style.setProperty('--teal', accents.cool);
      }
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

  let mediaLoop = null;
  const mediaManifest = MEDIA_DATA;
  const mediaRegion = document.querySelector('#mediaRegion');
  const mediaBottom = document.querySelector('#mediaBottom');
  mediaRegion.innerHTML = '';
  mediaBottom.innerHTML = '';
  const makeColumnSet = (region, items, count = 4, onLayout) => {
    const columns = Array.from({ length: count }, () => {
      const column = document.createElement('div');
      column.className = 'media-column';
      const copy = document.createElement('div');
      copy.className = 'media-loop-copy';
      column.append(copy);
      region.append(column);
      return column;
    });
    const cards = items.map(makeCard);
    // Heights come from the manifest's intrinsic sizes, so this runs once with the
    // right answer. Rebalancing on every image load is what made the column flicker
    // while you scrolled, and with the box reserved up front there is nothing to
    // re-measure when a frame finally arrives.
    const rebalance = () => {
      const heights = columns.map(() => 0);
      columns.forEach(column => { column.firstElementChild.replaceChildren(); });
      const columnWidth = Math.max(1, columns[0].clientWidth);
      cards.forEach(card => {
        const ratio = Number(card.dataset.ratio) || 1.25;
        const index = heights.indexOf(Math.min(...heights));
        columns[index].firstElementChild.append(card);
        heights[index] += columnWidth / ratio + columnWidth * 0.05;
      });
      onLayout?.();
    };
    rebalance();
    return { cards, columns, rebalance };
  };
  // Undated frames are the only ones that could not carry a
  // caption, so by default they sit out and the rest run in order.
  const photos = mediaManifest
    .filter(item => item.type !== 'video' && (!HIDE_UNDATED_MEDIA || item.time))
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  // The manifest's own order is filename order. Left alone it becomes the flex
  // `order` on every card and undoes the chronological order the captions rely on.
  photos.forEach((item, index) => { item.order = index; });
  const videos = mediaManifest.filter(item => item.type === 'video');
  mediaBottom.innerHTML = '';
  mediaBottom.hidden = true;
  const { cards: photoCards, columns: photoColumns, rebalance: rebalancePhotos } = makeColumnSet(mediaRegion, photos, 3, () => mediaLoop?.refresh());
  const videoCards = [];
  videos.forEach((item, index) => { const card = makeCard(item); videoCards.push(card); sections[Math.min(sections.length - 1, Math.floor(index * sections.length / videos.length))].append(card); });
  media = createMediaController({ cards: [...photoCards, ...videoCards], manifest: mediaManifest });
  const mediaPanel = document.querySelector('.media-panel');
  // A fixed scale down the left of the column: one mark every five miles, all of
  // them on screen at once. Where the ride passes within about a kilometre of a
  // named place at that mileage, the place takes the billing instead of the number.
  const NAME_RADIUS_DEG = 0.012;
  const totalMi = measured.totalKm * 0.621371;

  // Where the track actually passes each named place, and when. A place always
  // carries its own mileage and time, never the mileage of the grid mark that
  // happens to sit closest to it.
  const cityStops = new Map();
  CITY_LABELS.forEach(city => {
    const nearest = samples.reduce((best, sample) => {
      const distance = Math.hypot(sample.lat - city.lat, sample.lon - city.lon);
      return !best || distance < best.distance ? { distance, sample } : best;
    }, null);
    const clock = nearest ? formatTime(nearest.sample.time) : '--:--';
    if (clock === '--:--') return;
    cityStops.set(city.name, { mile: nearest.sample.distanceKm * 0.621371, clock });
  });

  const usedNames = new Set();
  const dayMarks = [];
  for (let mile = 0; mile <= totalMi + 0.01; mile += MARK_STEP_MI) {
    const atMile = Math.min(mile, totalMi);
    const point = pointAtDistance(measured, atMile / 0.621371);
    const clock = formatTime(point?.time);
    if (clock === '--:--') continue;
    const near = CITY_LABELS
      .map(city => ({ city, distance: Math.hypot(city.lat - point.lat, city.lon - point.lon) }))
      .sort((a, b) => a.distance - b.distance)[0];
    const stop = near && near.distance < NAME_RADIUS_DEG && !usedNames.has(near.city.name)
      ? cityStops.get(near.city.name)
      : null;
    if (stop) {
      usedNames.add(near.city.name);
      dayMarks.push({ mile: stop.mile, clock: stop.clock, label: near.city.name });
    } else {
      dayMarks.push({ mile: atMile, clock, label: `${Math.round(atMile)} mi` });
    }
  }
  // Every remaining named place gets its own mark: Devil's Slide falls at 46.0 mi,
  // which no multiple of five reaches.
  CITY_LABELS.forEach(city => {
    const stop = cityStops.get(city.name);
    if (!stop || usedNames.has(city.name)) return;
    usedNames.add(city.name);
    dayMarks.push({ mile: stop.mile, clock: stop.clock, label: city.name });
  });
  dayMarks.sort((a, b) => a.mile - b.mile);

  const rail = document.createElement('div');
  rail.className = 'media-rail';
  // The track is what travels; .media-rail stays put and does the clipping. Putting
  // the transform and the overflow on one element moved the clip window along with
  // the marks, so they never cycled — the whole strip just slid away.
  rail.innerHTML = `<div class="media-rail-track"><div class="media-loop-copy">${dayMarks.map(mark =>
    `<span class="rail-mark" data-mile="${mark.mile.toFixed(2)}" data-clock="${mark.clock}"><i>${mark.clock}</i><em>${mark.label}</em></span>`).join('')}</div></div>`;
  mediaPanel.append(rail);
  const railTrack = rail.firstElementChild;
  railMarks = [...rail.querySelectorAll('.rail-mark')];

  // Spread evenly by mileage over the loop's period. Pinning each mark to the
  // photograph nearest it in time sounds better but the frames bunch up — there
  // are long stretches of the afternoon with almost no pictures — which left gaps
  // of 300px and more with no annotation on screen at all. The column runs
  // chronologically top to bottom anyway, so an even scale still lands close to
  // the right frames, and never leaves you looking at nothing.
  const placeMarks = height => {
    const copies = [...rail.querySelectorAll('.media-loop-copy')];
    if (!copies.length) return;
    const primary = [...copies[0].querySelectorAll('.rail-mark')];
    const heights = primary.map(mark => mark.offsetHeight || 12);
    // The copies are laid end to end, and a mark is absolutely positioned inside
    // one of them without clipping — so the last mark has to finish clear of the
    // copy's own bottom edge, or it lands on the first mark of the next pass and
    // "san francisco" sits on top of "stanford" at the seam.
    // Leave exactly one mark-spacing of room at the bottom, so the step across the
    // wrap equals the step between any two marks and the seam stops reading as one.
    // Top-to-top across the seam is (height + COPY_GAP - travel); setting that equal
    // to the internal step travel/(n-1) gives travel = (height + COPY_GAP)(n-1)/n.
    const count = Math.max(2, primary.length);
    const travel = Math.max(1, (height + COPY_GAP) * (count - 1) / count);
    let bottom = -Infinity;
    const tops = primary.map((mark, index) => {
      const fraction = totalMi ? Number(mark.dataset.mile) / totalMi : 0;
      const top = Math.min(Math.max(fraction * travel, bottom + 6), travel);
      bottom = top + heights[index];
      return top;
    });
    // Clones are snapshots. The loop only rebuilds them when the period changes, so
    // writing the new positions to the original alone leaves the copy holding stale
    // ones — and at the wrap the two disagree, which is the seam artifact.
    copies.forEach(copy => {
      [...copy.querySelectorAll('.rail-mark')].forEach((mark, index) => {
        mark.style.top = `${tops[index]}px`;
      });
    });
    railMarks = [...rail.querySelectorAll('.rail-mark')];
  };

  // Click a frame to open it large, with what the track says about that moment.
  const photoById = new Map(photos.map(item => [item.id, item]));
  const viewer = document.createElement('aside');
  viewer.className = 'media-viewer';
  viewer.innerHTML = '<button class="viewer-close" type="button" aria-label="Close">close</button>'
    + '<figure class="viewer-frame"><img alt=""></figure><dl class="viewer-meta"></dl>';
  document.body.append(viewer);
  const viewerImage = viewer.querySelector('img');
  const viewerMeta = viewer.querySelector('.viewer-meta');

  let swapTimer = 0;
  const closeViewer = () => {
    if (!viewer.classList.contains('is-open')) return;
    viewer.classList.remove('is-open');
    document.body.classList.remove('is-viewing');
    mediaLoop?.setPaused(false);
  };

  const openViewer = id => {
    const item = photoById.get(id);
    if (!item) return;
    const wasOpen = viewer.classList.contains('is-open');
    // Re-tapping the frame already on screen is a no-op; re-tapping it after a
    // close has to reopen it, so this is gated on being open, not on the src.
    if (wasOpen && viewerImage.getAttribute('src') === item.src) return;
    const paint = () => {
      viewerImage.src = item.src;
      viewerImage.alt = item.filename || 'Ride photograph';
      viewerMeta.innerHTML = rowsHTML(item);
      viewer.classList.remove('is-swapping');
    };
    if (wasOpen) {
      viewer.classList.add('is-swapping');
      clearTimeout(swapTimer);
      swapTimer = setTimeout(paint, 300);
    } else {
      paint();
    }
    viewer.classList.add('is-open');
    document.body.classList.add('is-viewing');
    mediaLoop?.setPaused(true);
  };

  const rowsHTML = item => {
    const rows = [['time', formatTime(item.time)]];
    const state = stateAtTime(measured, item.time);
    if (state?.before) rows.push(['where', 'before the ride started']);
    else if (state?.after) rows.push(['where', 'after the ride finished']);
    else if (state) {
      const near = CITY_LABELS
        .map(city => ({ city, distance: Math.hypot(city.lat - state.lat, city.lon - state.lon) }))
        .sort((a, b) => a.distance - b.distance)[0];
      const place = near && near.distance < 0.03 ? `near ${near.city.name}` : 'on the road';
      const maps = `https://www.google.com/maps/search/?api=1&query=${state.lat.toFixed(6)},${state.lon.toFixed(6)}`;
      rows.push(['where', `<a href="${maps}" target="_blank" rel="noreferrer">${place} &#8599;</a>`]);
      rows.push(['distance', formatDistance(state.distanceKm)]);
      rows.push(['climbed', formatElevation(state.gainM)]);
    }
    return rows.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('');
  };

  viewer.querySelector('.viewer-close').addEventListener('click', closeViewer);
  addEventListener('keydown', event => { if (event.key === 'Escape') closeViewer(); });
  addEventListener('pointerdown', event => {
    if (!viewer.classList.contains('is-open') || viewer.contains(event.target) || mediaPanel.contains(event.target)) return;
    closeViewer();
  }, true);

  mediaLoop = createMediaLoop({
    panel: mediaPanel,
    columns: photoColumns,
    rail: railTrack,
    onMeasure: placeMarks,
    startStopped: true,
    onTap: (x, y) => {
      const card = document.elementFromPoint(x, y)?.closest('[data-photo]');
      if (card) openViewer(card.dataset.photo);
    }
  });
  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.className = 'media-pause';
  const labelPause = stopped => {
    pauseButton.textContent = stopped ? 'play' : 'pause';
    pauseButton.setAttribute('aria-pressed', String(stopped));
    pauseButton.setAttribute('aria-label', stopped ? 'Start the photo column drifting' : 'Pause the drifting photo column');
  };
  pauseButton.addEventListener('click', () => labelPause(mediaLoop.toggleStopped()));
  mediaPanel.append(pauseButton);
  labelPause(mediaLoop.isStopped());
  syncRouteToScroll();
}

start().catch(error => {
  console.error('Unable to load ride data', error);
  const loading = document.querySelector('#routeLoading');
  if (loading) loading.textContent = 'could not load the route — try refreshing';
});
