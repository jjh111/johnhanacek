// The reel editor's host on claude.ai. Only the editor page that scripts/build-reel-editor.mjs
// builds loads it, before the rig. It gives the rig, the timeline and the synth rack somewhere to
// keep their saves when there is no dev server: the page's own store (the `db` capability), one
// document per file, files/<name> = { text, file, savedAt }, which Claude reads back into the
// repo with its ArtifactData tool. Downloads go through the viewer's save dialog (`downloads`).
// A published file name cannot hold a space, so media paths trade spaces for underscores.
//
// claude.ai asks the viewer before a page first uses its store, and the call waits until they
// answer. So nothing here asks while the page starts: load() only reads the store when the viewer
// has already allowed it (permissions.state, which never asks), and gives up after a few seconds
// either way; the first save is what asks. Each save also leaves a copy in this tab (with its
// time), so a reload plays it at once; the store is still read behind it, and a newer save there
// (from another tab, or Claude's) is offered, and played in place when taken.
//
// Export (scripts/reel-export.js) asks for films here. Claude renders them: the page sends a
// comment to Claude (the `comments` capability's sendToClaude, which a Claude session watching
// this page receives), Claude renders the saved edit, uploads the films to the page's assets and
// writes films/latest = { renderedAt, from, items: [{ format, url, mb, seconds, fps }] } in the
// store, and films() reads it back.
//
// window.REEL_HOST is the contract the rig documents where it reads it (Assets/sizzle-reel-2.html):
// { name, ready, load(path), save(path, text), discard(path), download(filename, data), media(path) },
// and for Export: films(), saveFilm(filename, url), canAsk(), ask(text, element). A download is
// { ok: true } or { ok: false, code, message }: the viewer is asked first and may say no, and a
// page inside claude.ai cannot save a file any other way (a link's `download` does nothing there),
// so every download button says what came of it (said(result, what) has the words).
(function () {
  'use strict';
  const within = (p, ms, dflt = null) => Promise.race([p, new Promise(r => setTimeout(() => r(dflt), ms))]);
  const cap = name => (window.claude && typeof window.claude.use === 'function'
    ? within(window.claude.use(name), 5000).catch(() => null) : Promise.resolve(null));
  const dbP = cap('db'), permsP = cap('permissions'), commentsP = cap('comments');
  const nameOf = path => path.replace(/^.*\//, '');
  const ref = async path => { const db = await dbP; return db ? db.doc('files/' + nameOf(path)) : null; };
  const COPY = 'reel-host-copy:';
  // this tab's copy of a save: { text, savedAt } (an older page kept the text alone: no time)
  const copy = {
    get: path => {
      let v = null;
      try { v = sessionStorage.getItem(COPY + nameOf(path)); } catch (e) { return null; }
      if (v == null) return null;
      try { const o = JSON.parse(v); if (o && typeof o.text === 'string') return { text: o.text, savedAt: o.savedAt || '' }; } catch (e) { /* the text alone */ }
      return { text: v, savedAt: '' };
    },
    set: (path, text, savedAt) => { try { sessionStorage.setItem(COPY + nameOf(path), JSON.stringify({ text, savedAt: savedAt || '' })); } catch (e) { /* no storage */ } },
    drop: path => { try { sessionStorage.removeItem(COPY + nameOf(path)); } catch (e) { /* no storage */ } },
  };
  // has the viewer already allowed the store? (never asks)
  async function allowed() {
    const p = await permsP;
    if (!p) return false;
    try { return (await within(p.state('db'), 1500)) === 'granted'; } catch (e) { return false; }
  }
  // the store's save: { text, savedAt }, or null
  async function loadNow(path) {
    if (!(await allowed())) return null;
    const r = await ref(path);
    if (!r) return null;
    const s = await r.get();
    const v = s.exists ? s.data() : null;
    return v && typeof v.text === 'string' ? { text: v.text, savedAt: v.savedAt || '' } : null;
  }
  const refused = e => e && ['not_granted', 'capability_disabled', 'capability_removed', 'revoked'].includes(e.code);
  // a download's outcomes, said (see said() below)
  const SAYS = {
    declined: 'Not saved: the save dialog was answered no.',
    rate_limited: 'A save dialog is already open: answer it first.',
    too_large: 'The file is too large to save on this device.',
    rejected_extension: 'This view does not allow saving that kind of file.',
    extension_not_enabled: 'This view does not allow saving that kind of file.',
    fetch: 'The film could not be fetched from this page',
  };
  const GONE = ['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'];
  const why = e => e && e.code === 'invalid_argument' ? 'this view can play the reel but not change it'
    : e && e.code === 'quota_exceeded' ? "this page's store is full"
    : 'the save did not go through (' + (e && (e.code || e.message) || e) + ')';

  const loading = new Map();
  function firstLoad(path) {
    const mine = copy.get(path);
    if (mine) {
      loadNow(path).catch(() => null).then(d => { if (d && d.text !== mine.text && d.savedAt > mine.savedAt) offer(path, d, true); });
      return Promise.resolve(mine.text);
    }
    return new Promise(resolve => {
      let done = false;
      loadNow(path).catch(() => null).then(d => {
        if (!done) { done = true; if (d) copy.set(path, d.text, d.savedAt); resolve(d ? d.text : null); } else if (d) offer(path, d, false);
      });
      setTimeout(() => { if (!done) { done = true; resolve(null); } }, 2500);
    });
  }
  window.REEL_HOST = {
    name: 'claude.ai',
    ready: dbP.then(db => !!db),
    // The saved version, or null: this tab's copy at once, else the store if the viewer has
    // allowed it and it answers within 2.5 s. The store is read either way: a later answer, or a
    // save there newer than this tab's copy, is offered (offer, below).
    // One read per file per page: the first load starts it and every later load of that file gets
    // the same answer (the rig starts the score's beside the script's, so the synth rack, which
    // loads later, never waits on the store a second time).
    load(path) {
      if (!loading.has(path)) loading.set(path, firstLoad(path));
      return loading.get(path);
    },
    async save(path, text) {
      const r = await ref(path);
      if (!r) return { ok: false, fallback: true, errors: ['this view cannot keep saves'] };
      for (let k = 0; k < 2; k++) {
        const savedAt = new Date().toISOString();
        try { await r.set({ text, file: path, savedAt }); copy.set(path, text, savedAt); return { ok: true }; }
        catch (e) {
          if (k === 0 && e && e.code === 'unavailable') { await new Promise(res => setTimeout(res, 400 + Math.random() * 600)); continue; }
          return { ok: false, fallback: refused(e), errors: [why(e)] };
        }
      }
      return { ok: false, errors: ['the save did not go through'] };
    },
    async discard(path) { copy.drop(path); const r = await ref(path); if (r) await r.delete(); },
    async download(filename, data) {
      const dl = await cap('downloads');
      if (!dl) return { ok: false, code: 'unavailable' };
      try { await dl.save({ filename, data }); return { ok: true }; }
      catch (e) { return { ok: false, code: (e && e.code) || 'unavailable', message: (e && e.message) || String(e) }; }
    },
    // a film Claude uploaded to this page (its url is the page's own /_blob/…): fetched whole, then
    // offered the same way (a Blob goes to the save dialog as it is)
    async saveFilm(filename, url) {
      let blob;
      try {
        const r = await fetch(url);
        if (!r.ok) return { ok: false, code: 'fetch', message: 'the page answered ' + r.status };
        blob = await r.blob();
      } catch (e) { return { ok: false, code: 'fetch', message: (e && e.message) || String(e) }; }
      return this.download(filename, blob);
    },
    // what a download came to, in words for the panel whose button it was: { text, bad }, or null
    // for a browser's own download (a dev page), which says nothing back
    said(r, what) {
      if (!r || r.ok === undefined) return null;
      if (r.ok) return { text: `${what} saved.`, bad: false };
      const text = SAYS[r.code] || (GONE.includes(r.code) ? 'This view cannot save files: open the editor itself on claude.ai and try again.'
        : `The save did not go through (${r.code || 'unknown'}).`);
      return { text: r.code === 'fetch' ? `${text}${r.message ? ` (${r.message})` : ''}.` : text, bad: r.code !== 'declined' };
    },
    media: p => p.replace(/ /g, '_'),
    // the films Claude rendered from this page's saves (films/latest), or null; asked on a click
    // (Export's), so a viewer who has not yet allowed the store is asked then, never at load
    async films() {
      const db = await dbP;
      if (!db) return null;
      try { const s = await within(db.doc('films/latest').get(), 8000); return s && s.exists ? s.data() : null; } catch (e) { return null; }
    },
    // can a comment reach Claude from here? 'available' | 'writers_only' | 'no_session' | 'off'
    async canAsk() {
      const c = await commentsP;
      if (!c) return 'off';
      try { return await within(c.canSendToClaude(), 4000, 'off'); } catch (e) { return 'off'; }
    },
    // post `text` as a comment at `el` and send it to Claude: { ok, thread } or { ok: false, reason }
    async ask(text, el) {
      const c = await commentsP;
      if (!c) return { ok: false, reason: 'off' };
      try {
        const r = await c.sendToClaude({ anchor: await c.anchorFor(el), text });
        return { ok: true, thread: r && r.threadId };
      } catch (e) { return { ok: false, reason: (e && e.code) || 'error', message: (e && e.message) || String(e) }; }
    },
  };

  // A save in the store the preview is not playing: one that answered after the reel had started,
  // or one newer than this tab's copy (saved from another tab, or by Claude). It is offered rather
  // than switched in under you; taken, it plays in place (the script through REEL_LIVE.apply, the
  // score through the synth rack) and becomes this tab's copy.
  function offer(path, d, newer) {
    const id = 'reel-late-' + nameOf(path).replace(/[^\w-]/g, '_');
    if (document.getElementById(id)) return;
    const n = document.querySelectorAll('.reel-late').length;
    const b = document.createElement('div');
    b.id = id; b.className = 'reel-late'; b.setAttribute('role', 'status');
    b.style.cssText = `position:fixed;left:50%;top:calc(${16 + n * 56}px + env(safe-area-inset-top, 0px));transform:translateX(-50%);z-index:80;display:flex;gap:12px;align-items:center;`
      + 'padding:10px 14px;border-radius:10px;background:rgba(var(--surface-rgb),0.97);border:1px solid rgba(var(--gold-rgb),0.55);font:500 13px/1.3 var(--font-mono);color:var(--text-primary)';
    const when = d.savedAt ? new Date(d.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const what = /\.score\.txt$/.test(path) ? 'score' : 'script';
    const btn = 'font:inherit;background:none;border:1px solid rgba(var(--gold-rgb),0.55);border-radius:7px;padding:6px 10px;cursor:pointer';
    b.innerHTML = `<span></span><button type="button" style="${btn};color:var(--gold)">Play it</button>${newer ? `<button type="button" style="${btn};color:var(--text-primary)">Keep mine</button>` : ''}`;
    b.querySelector('span').textContent = newer ? `A newer save of the ${what} is here${when ? ' (' + when + ')' : ''}.` : `Your saved version of the ${what} is ready.`;
    const [play, keep] = b.querySelectorAll('button');
    play.onclick = () => {
      copy.set(path, d.text, d.savedAt);
      const L = window.REEL_LIVE, R = window.REEL_RACK;
      let r = null;
      if (L && L.apply && L.file === path) r = L.apply(d.text, 'host');
      else if (R && R.change && what === 'score') r = { ok: R.change(d.text, { save: false }) };
      if (r && r.ok) b.remove(); else location.reload();
    };
    if (keep) keep.onclick = () => b.remove();
    document.body.appendChild(b);
  }

  // Where the preview was, for a reload by hand (or a republish): a framed page can lose its
  // #hash on the way, so this tab keeps it too.
  try {
    const K = 'reel-editor-at';
    if (!location.hash) { const v = sessionStorage.getItem(K); if (v) history.replaceState(null, '', '#' + v); }
    addEventListener('pagehide', () => { try { sessionStorage.setItem(K, location.hash.slice(1)); } catch (e) { /* no storage */ } });
  } catch (e) { /* no storage: after a save the preview starts from 0 */ }

  // A first-visit card: the keys are the whole interface, and a framed page hears them only
  // after a click.
  const K_SEEN = 'reel-editor-seen';
  let seen = false;
  try { seen = localStorage.getItem(K_SEEN) === '1'; } catch (e) { /* no storage: show it */ }
  if (seen) return;
  const css = document.createElement('style');
  css.textContent = `
#reel-hello { position: fixed; left: 24px; top: calc(24px + env(safe-area-inset-top, 0px)); z-index: 70; max-width: 430px; box-sizing: border-box;
  padding: 18px 20px 16px; border-radius: 14px; background: rgba(var(--surface-rgb), 0.97); border: 1px solid rgba(var(--gold-rgb), 0.55);
  font: 500 13px/1.55 var(--font-mono); color: var(--text-primary); box-shadow: 0 12px 40px var(--elevation); }
#reel-hello h2 { margin: 0 0 8px; font: 300 22px/1.1 var(--font-display); color: var(--cyan); letter-spacing: 0.06em; }
#reel-hello p { margin: 0 0 8px; }
#reel-hello kbd { font: 600 12px/1 var(--font-mono); color: var(--gold); border: 1px solid rgba(var(--gold-rgb), 0.5); border-radius: 4px; padding: 1px 5px; }
#reel-hello .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
#reel-hello button { font: 500 12px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.08);
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.35); border-radius: 7px; padding: 8px 11px; cursor: pointer; }
#reel-hello button:hover, #reel-hello button:focus-visible { border-color: var(--gold); color: var(--gold); outline: none; }
`;
  document.head.appendChild(css);
  const card = document.createElement('div');
  card.id = 'reel-hello'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'How the editor works');
  card.innerHTML = `<h2>Sizzle reel editor</h2>
<p>The buttons along the bottom play, jump a scene and loop one. Each names its key, and the keys work too (<kbd>space</kbd> plays).</p>
<p><b>Timeline</b> <kbd>E</kbd>: every scene is a card. Drag its edge, its moments or its out; click it to change its words. <b>Synths</b> <kbd>M</kbd>: the music. <b>Export</b> <kbd>X</kbd>: the video.</p>
<p>Your changes save to this page. The first save asks you to let it store data. Export asks Claude to render what you saved, and the films come back here.</p>
<div class="row"><button type="button" data-go="e">Open the timeline</button><button type="button" data-go="m">Open the synths</button><button type="button" data-go="x">Got it</button></div>`;
  const close = () => { card.remove(); try { localStorage.setItem(K_SEEN, '1'); } catch (e) { /* no storage */ } };
  card.addEventListener('click', e => {
    const go = e.target.closest && e.target.closest('button') && e.target.closest('button').dataset.go;
    if (!go) return;
    close();
    if (go === 'e' && window.REEL_TIMELINE) window.REEL_TIMELINE.show(true);
    if (go === 'm' && window.REEL_RACK) window.REEL_RACK.open(true);
  });
  const add = () => document.body.appendChild(card);
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();
