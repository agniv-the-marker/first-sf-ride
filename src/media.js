function naturalSpan(card) {
  const media = card.querySelector('img, video');
  if (!media) return 1;
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!width || !height) return 1;
  const ratio = width / height;
  return ratio >= 2.35 ? 3 : ratio >= 1.5 ? 2 : 1;
}

export function createMediaController({ cards, manifest, controls }) {
  let plan = manifest.map(item => ({ ...item }));
  const itemFor = id => plan.find(item => item.id === id);
  const ordered = () => [...plan].sort((a, b) => a.order - b.order);

  function sizeCard(card) {
    const item = itemFor(card.dataset.mediaId);
    if (!item) return;
    card.style.order = item.order;
    card.style.setProperty('--span', naturalSpan(card));
  }

  function render() { cards.forEach(sizeCard); }

  function watchCard(card) {
    const media = card.querySelector('img, video');
    if (!media) return;
    const refresh = () => requestAnimationFrame(() => sizeCard(card));
    media.addEventListener('load', refresh, { once: true });
    media.addEventListener('loadedmetadata', refresh, { once: true });
    if (media.complete || media.readyState >= 1) refresh();
  }

  const visibility = new IntersectionObserver(entries => entries.forEach(entry => {
    const video = entry.target.querySelector('video');
    if (!video) return;
    if (entry.isIntersecting) video.play().catch(() => {});
    else video.pause();
  }), { threshold: 0.25, rootMargin: '10% 0px 10% 0px' });

  function renderControls() {
    controls.innerHTML = `<div class="controls-title">media manifest</div>${ordered().map(item => `<div class="control-row" data-id="${item.id}"><b>${item.id}</b><label>route <input data-key="at" type="range" min="0" max="100" value="${Math.round(item.at * 100)}"></label><label>order <input data-key="order" type="number" min="0" max="99" value="${item.order}"></label></div>`).join('')}`;
    controls.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
      const item = itemFor(input.closest('.control-row').dataset.id);
      const key = input.dataset.key;
      item[key] = key === 'at' ? Number(input.value) / 100 : Number(input.value);
      render();
    }));
  }

  function setEditing(value) {
    document.body.classList.toggle('editing', value);
    controls.hidden = !value;
    if (value) renderControls();
  }

  render();
  cards.forEach(card => { watchCard(card); visibility.observe(card); });
  return {
    setProgress: () => {},
    setEditing,
    renderControls,
    loadManifest: next => {
      if (!Array.isArray(next)) return;
      plan = next.map(item => ({ ...item }));
      render();
    },
    getManifest: () => plan.map(item => ({ ...item }))
  };
}
