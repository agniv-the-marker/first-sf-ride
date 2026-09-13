export function createEditor({ media, manifestKey = 'sf-ride-page' }) {
  const editButton = document.querySelector('#editButton'), saveButton = document.querySelector('#saveButton'), copyButton = document.querySelector('#copyButton'), resetButton = document.querySelector('#resetButton'), editable = [...document.querySelectorAll('.editable, h1[contenteditable]')], controls = document.querySelector('#mediaControls');
  let editing = false;
  const load = () => { try { const saved = JSON.parse(localStorage.getItem(manifestKey)); if (!saved) return; editable.forEach((element, index) => { if (saved.texts?.[index] !== undefined) element.innerHTML = saved.texts[index]; }); media.loadManifest(saved.media); } catch { /* ignore invalid local drafts */ } };
  const setEditing = value => { editing = value; document.body.classList.toggle('editing', editing); editable.forEach(element => { element.contentEditable = String(editing); }); media.setEditing(editing); editButton.hidden = editing; saveButton.hidden = !editing; copyButton.hidden = !editing; resetButton.hidden = !editing; controls.hidden = !editing; if (editing) editable[0]?.focus(); };
  editButton.addEventListener('click', () => setEditing(true));
  saveButton.addEventListener('click', () => { localStorage.setItem(manifestKey, JSON.stringify({ texts: editable.map(element => element.innerHTML), media: media.getManifest() })); setEditing(false); });
  resetButton.addEventListener('click', () => { localStorage.removeItem(manifestKey); location.reload(); });
  copyButton.addEventListener('click', async () => { const text = JSON.stringify(media.getManifest(), null, 2); try { await navigator.clipboard.writeText(text); copyButton.textContent = 'copied'; setTimeout(() => { copyButton.textContent = '{ }'; }, 1200); } catch { prompt('copy this media manifest', text); } });
  load(); setEditing(false);
}
