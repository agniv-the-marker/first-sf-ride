// Exactly one clip plays at a time: whichever is most nearly centred in the
// viewport and substantially in view. Letting every visible video run at once —
// which is what a per-video IntersectionObserver does — means several soundtracks
// and several moving frames competing for the same attention.
const EDGE = 2;         // px of slack when asking whether a clip is fully in frame
const TALL = 0.9;       // a clip taller than the viewport can never be fully in
                        // frame, so on a short screen ask for most of it instead
const RELEASE = 0.35;   // once playing it keeps playing until it falls below this,
                        // so a clip sitting near the threshold does not stutter
const ENGAGE_PX = 24;   // nothing plays until the reader has actually scrolled

export function createMediaController({ cards, manifest }) {
  const plan = manifest.map(item => ({ ...item }));
  const itemFor = id => plan.find(item => item.id === id);

  function sizeCard(card) {
    const item = itemFor(card.dataset.mediaId);
    if (!item) return;
    card.style.order = item.order;
  }

  const videoCards = cards.filter(card => card.querySelector('video'));
  const videos = videoCards.map(card => card.querySelector('video'));
  const held = new WeakSet();   // paused by hand; do not start it again
  let active = null;

  let engaged = false;

  const visibleFraction = card => {
    const rect = card.getBoundingClientRect();
    if (rect.height <= 0) return 0;
    const shown = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
    return Math.max(0, shown) / rect.height;
  };

  // Fully in frame, top edge to bottom edge. A clip taller than the window could
  // never satisfy that, so on a short screen it settles for nearly all of it.
  const fullyInFrame = card => {
    const rect = card.getBoundingClientRect();
    if (rect.height <= 0) return false;
    if (rect.height > innerHeight - EDGE * 2) return visibleFraction(card) >= TALL;
    return rect.top >= -EDGE && rect.bottom <= innerHeight + EDGE;
  };

  const activate = video => {
    if (video === active) {
      if (video && video.paused && !held.has(video)) video.play().catch(() => {});
      return;
    }
    if (active) {
      active.pause();
      active.currentTime = 0;
    }
    active = video;
    if (video && !held.has(video)) video.play().catch(() => {});
  };

  const choose = () => {
    if (!engaged) { activate(null); return; }
    const middle = innerHeight / 2;
    let best = null;
    videoCards.forEach((card, index) => {
      const keeping = videos[index] === active;
      if (!(keeping ? visibleFraction(card) >= RELEASE : fullyInFrame(card))) return;
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - middle);
      if (!best || distance < best.distance) best = { video: videos[index], distance };
    });
    activate(best ? best.video : null);
  };

  const startedAt = scrollY;
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; choose(); }); };

  videoCards.forEach((card, index) => {
    const video = videos[index];
    const pauseButton = card.querySelector('.video-pause-toggle');
    const audioButton = card.querySelector('.video-audio-toggle');

    const labelPause = () => {
      const paused = video.paused;
      pauseButton.textContent = paused ? 'play' : 'pause';
      pauseButton.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
      pauseButton.setAttribute('aria-pressed', String(paused));
    };
    video.addEventListener('play', labelPause);
    video.addEventListener('pause', labelPause);
    labelPause();

    pauseButton.addEventListener('click', () => {
      if (video.paused) {
        held.delete(video);
        engaged = true;
        activate(video);
        video.play().catch(() => {});
      } else {
        held.add(video);
        video.pause();
      }
    });

    audioButton?.addEventListener('click', event => {
      event.preventDefault();
      const unmuting = video.muted || video.volume === 0;
      // One soundtrack at a time, the same as one picture at a time.
      if (unmuting) {
        videos.forEach(other => {
          if (other === video || other.muted) return;
          other.muted = true;
          const button = other.closest('.media-card')?.querySelector('.video-audio-toggle');
          if (button) {
            button.textContent = 'unmute';
            button.setAttribute('aria-label', 'Unmute video');
            button.setAttribute('aria-pressed', 'false');
          }
        });
        held.delete(video);
        engaged = true;
        activate(video);
        video.play().catch(() => {});
      }
      video.muted = !unmuting;
      video.volume = unmuting ? 1 : 0;
      audioButton.textContent = unmuting ? 'mute' : 'unmute';
      audioButton.setAttribute('aria-label', unmuting ? 'Mute video' : 'Unmute video');
      audioButton.setAttribute('aria-pressed', String(unmuting));
    });
  });

  cards.forEach(sizeCard);
  addEventListener('scroll', () => {
    // The first real scroll is what starts any of this; landing on the page and
    // having a clip burst into life is exactly what we do not want.
    if (!engaged && Math.abs(scrollY - startedAt) >= ENGAGE_PX) engaged = true;
    schedule();
  }, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  videos.forEach(video => video.addEventListener('loadedmetadata', schedule, { once: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) active?.pause();
    else schedule();
  });
  choose();

  return { setProgress: () => {}, refreshVideos: schedule, activeVideo: () => active };
}
