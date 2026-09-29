// The reel's media picker: choose the picture or clip for a slot by looking at it, not by
// remembering its file name. The timeline's inspector opens it from an img or video line.
//
// The catalogue is scripts/reel-media.mjs's: the dev server answers GET /__reel/media, and the
// editor built for claude.ai carries reel-media.json beside it (with the thumbnails and the files
// themselves, so any pick plays in its preview). With neither, it offers what the script already
// uses. A tile shows the thumbnail, the name, the size and a clip's length; a clip plays, muted,
// while the pointer rests on it (or the tile has focus). Search matches names and folders; the
// chips pick a folder, or what the reel already uses. A click or Enter picks; Esc shuts.
//
//   REEL_PICKER.open({ kind: 'picture' | 'clip', current: './name.webp', onPick(entry) })
//   REEL_PICKER.thumbFor(path, kind) → a thumbnail url for a path, or null
// A classic script the rig injects in live mode only, after defining window.REEL_LIVE.
(function () {
  'use strict';
  const L = window.REEL_LIVE;
  if (!L || window.REEL_PICKER) return;
  const url = p => (L.mediaURL ? L.mediaURL(p) : p);
  const base = p => p.replace(/^\.\//, '');
  const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  // every path the script names in an img or video line: the reel's media, marked in the grid
  const used = new Map();
  L.parsed.fields.forEach(f => { if (f.key === 'img' || f.key === 'video') { const v = f.owner[f.jsonKey]; if (typeof v === 'string') used.set(v, f.key); } });

  // ── the catalogue ─────────────────────────────────────────────────────
  let cat = null;
  function load() {
    if (cat) return cat;
    const from = L.dev ? fetch('/__reel/media', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      : fetch('./reel-media.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
    cat = from.then(j => j && Array.isArray(j.items) ? { items: j.items, full: true } : null, () => null).then(c => c || {
      full: false,                                   // only what the script names: pictures show themselves
      items: [...used].map(([path, key]) => ({ path, name: base(path).replace(/^.*\//, ''), folder: base(path).includes('/') ? base(path).replace(/\/[^/]*$/, '') : '',
        kind: key === 'img' ? 'picture' : 'clip', thumb: key === 'img' ? url(path) : null })),
    });
    return cat;
  }
  const same = (a, b) => base(a).toLowerCase() === base(b).toLowerCase();
  async function thumbFor(path, kind) {
    const c = await load(), it = c.items.find(i => same(i.path, path));
    return it && it.thumb ? it.thumb : kind === 'picture' ? url(path) : null;
  }

  // ── style: the site's tokens, never text dimmed with alpha ────────────
  const css = document.createElement('style');
  css.textContent = `
#reel-pk { position: fixed; inset: 0; z-index: 95; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); }
#reel-pk[hidden], #reel-pk [hidden] { display: none !important; }
#reel-pk .pk-panel { width: min(1120px, calc(100vw - 32px)); height: min(780px, calc(100vh - 40px)); display: flex; flex-direction: column; box-sizing: border-box;
  border-radius: 14px; background: rgba(var(--surface-rgb), 0.98); border: 1px solid rgba(var(--cyan-dim-rgb), 0.4); box-shadow: 0 16px 48px var(--elevation);
  font: 500 12px/1.4 var(--font-mono); color: var(--text-primary); outline: none; }
#reel-pk .pk-head { display: flex; align-items: center; gap: 14px; padding: 16px 18px 10px; }
#reel-pk h2 { margin: 0; font: 300 22px/1.1 var(--font-display); color: var(--cyan); letter-spacing: 0.04em; }
#reel-pk .pk-now { color: var(--ink-quiet); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#reel-pk .pk-now b { color: var(--text-bright); font-weight: 600; }
#reel-pk .pk-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 18px 12px; border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.18); }
#reel-pk input[type=search] { font: 500 13px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.06); border: 1px solid rgba(var(--cyan-dim-rgb), 0.35);
  border-radius: 7px; padding: 0 12px; height: 36px; width: min(320px, 100%); outline: none; }
#reel-pk input[type=search]:focus { border-color: var(--gold); }
#reel-pk input::placeholder { color: var(--ink-faint); }
#reel-pk button { font: 500 12px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.08); border: 1px solid rgba(var(--cyan-dim-rgb), 0.35);
  border-radius: 7px; padding: 0 11px; height: 32px; cursor: pointer; }
#reel-pk button:hover, #reel-pk button:focus-visible { border-color: var(--gold); color: var(--gold); outline: none; }
#reel-pk .pk-chip[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); background: rgba(var(--gold-rgb), 0.1); }
#reel-pk .pk-x { width: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; flex: none; }
#reel-pk .pk-grid { flex: 1; overflow-y: auto; padding: 14px 18px 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(176px, calc(50% - 6px)), 1fr)); gap: 12px; align-content: start; }
#reel-pk .pk-tile { position: relative; display: flex; flex-direction: column; gap: 6px; height: auto; padding: 6px; border-radius: 10px; text-align: left; background: rgba(var(--cyan-dim-rgb), 0.05); }
#reel-pk .pk-tile.pk-cur { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.08); }
#reel-pk .pk-img { position: relative; width: 100%; aspect-ratio: 16 / 10; border-radius: 6px; overflow: hidden; background: #000 center / cover no-repeat; }
#reel-pk .pk-img video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#reel-pk .pk-glyph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--ink-faint); font-size: 22px; }
#reel-pk .pk-name { color: var(--text-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#reel-pk .pk-meta { color: var(--ink-faint); font-size: 11px; display: flex; gap: 8px; }
#reel-pk .pk-badge { position: absolute; top: 12px; left: 12px; padding: 3px 6px; border-radius: 4px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  background: rgba(var(--surface-rgb), 0.92); color: var(--text-bright); border: 1px solid rgba(var(--cyan-dim-rgb), 0.5); }
#reel-pk .pk-cur .pk-badge { color: var(--gold); border-color: var(--gold); }
#reel-pk .pk-dur { position: absolute; right: 12px; top: 12px; padding: 3px 6px; border-radius: 4px; font-size: 10px; background: rgba(0, 0, 0, 0.72); color: var(--text-bright); }
#reel-pk .pk-foot { padding: 10px 18px 14px; color: var(--ink-quiet); border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.18); display: flex; gap: 12px; }
#reel-pk .pk-foot > :first-child { flex: none; white-space: nowrap; }
#reel-pk .pk-empty { grid-column: 1 / -1; color: var(--ink-quiet); padding: 30px 0; text-align: center; }
`;
  document.head.appendChild(css);

  // ── the DOM ───────────────────────────────────────────────────────────
  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls.split(' ').map(c => 'pk-' + c).join(' '); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const root = el('div', null, document.body); root.id = 'reel-pk'; root.hidden = true;
  const panel = el('div', 'panel', root); panel.tabIndex = -1;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'reel-pk-h');
  root.addEventListener('pointerdown', e => { if (e.target === root) shut(); });
  const head = el('div', 'head', panel);
  const h2 = el('h2', null, head); h2.id = 'reel-pk-h';
  const now = el('div', 'now', head);
  const x = el('button', 'x', head); x.type = 'button'; x.title = 'close (Esc)'; x.setAttribute('aria-label', 'close'); x.onclick = () => shut();
  if (window.REEL_UI) x.innerHTML = REEL_UI.icon('close'); else x.textContent = '×';
  const bar = el('div', 'bar', panel);
  const q = el('input', null, bar); q.type = 'search'; q.placeholder = 'search by name or folder'; q.setAttribute('aria-label', 'search the media');
  const chips = el('div', null, bar); chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
  const grid = el('div', 'grid', panel); grid.setAttribute('role', 'listbox');
  const foot = el('div', 'foot', panel);
  const count = el('span', null, foot), hint = el('span', null, foot);

  // one muted clip that plays in whichever tile the pointer rests on
  const preview = document.createElement('video');
  preview.muted = true; preview.loop = true; preview.playsInline = true; preview.preload = 'none';
  let previewing = null, hoverT = null;
  function playIn(tile, it) {
    clearTimeout(hoverT);
    if (!it || it.kind !== 'clip') return stopPreview();
    hoverT = setTimeout(() => {
      if (previewing === tile) return;
      stopPreview();
      previewing = tile;
      preview.src = url(it.path);
      tile.querySelector('.pk-img').appendChild(preview);
      preview.currentTime = 0;
      preview.play().catch(() => {});
    }, 180);
  }
  function stopPreview() { clearTimeout(hoverT); preview.pause(); preview.removeAttribute('src'); preview.load(); preview.remove(); previewing = null; }

  let opts = null, folder = 'all', items = [], shown = [], lastFocus = null;
  function draw() {
    stopPreview();
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    shown = items.filter(it => it.kind === opts.kind
      && (folder === 'all' || (folder === 'reel' ? used.has(it.path) || [...used.keys()].some(u => same(u, it.path)) : it.folder === folder))
      && words.every(w => (it.name + ' ' + it.folder).toLowerCase().includes(w)));
    grid.textContent = '';
    if (!shown.length) el('div', 'empty', grid, items.length ? 'Nothing matches. Clear the search or pick another folder.' : 'Looking for your media…');
    shown.forEach((it, i) => {
      const t = el('button', 'tile', grid); t.type = 'button'; t.setAttribute('role', 'option'); t.dataset.path = it.path; t.dataset.i = i;
      const cur = same(it.path, opts.current || ''), inReel = [...used.keys()].some(u => same(u, it.path));
      if (cur) { t.classList.add('pk-cur'); t.setAttribute('aria-selected', 'true'); }
      t.title = `${it.path}${it.w ? `\n${it.w} × ${it.h}` : ''}${it.dur ? ` · ${clock(it.dur)}` : ''}${cur ? '\nin this slot now' : inReel ? '\nalready in the reel' : ''}`;
      const im = el('div', 'img', t);
      if (it.thumb) im.style.backgroundImage = `url("${it.thumb}")`; else el('span', 'glyph', im, it.kind === 'clip' ? '▶' : '▢');
      if (cur || inReel) el('span', 'badge', t, cur ? 'now' : 'in the reel');
      if (it.dur) el('span', 'dur', t, clock(it.dur));
      el('span', 'name', t, it.name);
      const meta = el('span', 'meta', t);
      if (it.w) el('span', null, meta, `${it.w} × ${it.h}`);
      if (it.folder) el('span', null, meta, it.folder + '/');
      t.addEventListener('pointerenter', () => playIn(t, it));
      t.addEventListener('pointerleave', () => { if (previewing === t || hoverT) stopPreview(); });
      t.addEventListener('focus', () => playIn(t, it));
      t.addEventListener('click', () => pick(it));
    });
    count.textContent = `${shown.length} ${opts.kind === 'clip' ? 'clip' : 'picture'}${shown.length === 1 ? '' : 's'}`;
  }
  function drawChips(c) {
    chips.textContent = '';
    const folders = ['all', ...new Set(items.filter(i => i.kind === opts.kind).map(i => i.folder))].filter(f => f !== undefined);
    const names = { all: 'all', '': 'Assets', reel: 'in the reel' };
    [...folders, 'reel'].forEach(f => {
      const b = el('button', 'chip', chips, names[f] != null ? names[f] : f + '/'); b.type = 'button';
      b.setAttribute('aria-pressed', String(folder === f));
      b.onclick = () => { folder = f; drawChips(c); draw(); };
    });
    hint.textContent = c.full ? 'Pick one to put it in this slot; the preview reloads with it. A clip plays while you rest on it.'
      : 'Only the media this reel already uses: run node scripts/reel-dev.mjs to choose from every file in Assets/.';
  }
  function pick(it) {
    const done = opts.onPick; shut();
    if (!same(it.path, opts.current || '') && done) done(it);
  }
  // arrows move through the grid, row by row as it is laid out
  grid.addEventListener('keydown', e => {
    const tiles = [...grid.querySelectorAll('.pk-tile')], i = tiles.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const cols = Math.max(1, tiles.filter(t => t.offsetTop === tiles[0].offsetTop).length);
    const j = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' ? i - cols : e.key === 'ArrowDown' ? i + cols : e.key === 'Home' ? 0 : tiles.length - 1;
    const t = tiles[Math.max(0, Math.min(tiles.length - 1, j))]; t.focus(); t.scrollIntoView({ block: 'nearest' });
  });
  q.addEventListener('input', draw);
  q.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || (e.key === 'Enter' && shown.length)) { e.preventDefault(); const t = grid.querySelector('.pk-tile'); if (t) { if (e.key === 'Enter' && shown.length === 1) pick(shown[0]); else t.focus(); } } });
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); shut(); } e.stopPropagation(); });

  async function open(o) {
    opts = o; folder = 'all'; q.value = '';
    h2.textContent = o.kind === 'clip' ? 'Choose a clip' : 'Choose a picture';
    now.textContent = ''; if (o.current) { now.append('in this slot now: '); el('b', null, now, base(o.current)); }
    items = []; lastFocus = document.activeElement;
    root.hidden = false; draw(); q.focus();
    const c = await load();
    if (root.hidden || opts !== o) return;
    items = c.items; drawChips(c); draw();
    const cur = grid.querySelector('.pk-cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function shut() { stopPreview(); root.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  window.REEL_PICKER = { open, thumbFor, catalogue: load, get isOpen() { return !root.hidden; } };
})();
