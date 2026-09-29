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
// either way; the first save is what asks. Each save also leaves a copy in this tab, so the
// reload that follows a save plays it at once.
//
// window.REEL_HOST is the contract the rig documents where it reads it (Assets/sizzle-reel-2.html):
// { name, ready, load(path), save(path, text), discard(path), download(filename, text), media(path) }.
(function () {
  'use strict';
  const within = (p, ms, dflt = null) => Promise.race([p, new Promise(r => setTimeout(() => r(dflt), ms))]);
  const cap = name => (window.claude && typeof window.claude.use === 'function'
    ? within(window.claude.use(name), 5000).catch(() => null) : Promise.resolve(null));
  const dbP = cap('db'), permsP = cap('permissions');
  const nameOf = path => path.replace(/^.*\//, '');
  const ref = async path => { const db = await dbP; return db ? db.doc('files/' + nameOf(path)) : null; };
  const COPY = 'reel-host-copy:';
  const copy = {
    get: path => { try { return sessionStorage.getItem(COPY + nameOf(path)); } catch (e) { return null; } },
    set: (path, text) => { try { sessionStorage.setItem(COPY + nameOf(path), text); } catch (e) { /* no storage */ } },
    drop: path => { try { sessionStorage.removeItem(COPY + nameOf(path)); } catch (e) { /* no storage */ } },
  };
  // has the viewer already allowed the store? (never asks)
  async function allowed() {
    const p = await permsP;
    if (!p) return false;
    try { return (await within(p.state('db'), 1500)) === 'granted'; } catch (e) { return false; }
  }
  async function loadNow(path) {
    if (!(await allowed())) return null;
    const r = await ref(path);
    if (!r) return null;
    const s = await r.get();
    const v = s.exists ? s.data() : null;
    return v && typeof v.text === 'string' ? v.text : null;
  }
  const refused = e => e && ['not_granted', 'capability_disabled', 'capability_removed', 'revoked'].includes(e.code);
  const why = e => e && e.code === 'invalid_argument' ? 'this view can play the reel but not change it'
    : e && e.code === 'quota_exceeded' ? "this page's store is full"
    : 'the save did not go through (' + (e && (e.code || e.message) || e) + ')';

  window.REEL_HOST = {
    name: 'claude.ai',
    ready: dbP.then(db => !!db),
    // the saved version, or null: this tab's copy at once, else the store if the viewer has
    // allowed it and it answers within 2.5 s (a later answer offers to reload into it)
    load(path) {
      const mine = copy.get(path);
      if (mine != null) return Promise.resolve(mine);
      return new Promise(resolve => {
        let done = false;
        loadNow(path).catch(() => null).then(text => {
          if (!done) { done = true; resolve(text); } else if (text != null) offerLate();
        });
        setTimeout(() => { if (!done) { done = true; resolve(null); } }, 2500);
      });
    },
    async save(path, text) {
      const r = await ref(path);
      if (!r) return { ok: false, fallback: true, errors: ['this view cannot keep saves'] };
      for (let k = 0; k < 2; k++) {
        try { await r.set({ text, file: path, savedAt: new Date().toISOString() }); copy.set(path, text); return { ok: true }; }
        catch (e) {
          if (k === 0 && e && e.code === 'unavailable') { await new Promise(res => setTimeout(res, 400 + Math.random() * 600)); continue; }
          return { ok: false, fallback: refused(e), errors: [why(e)] };
        }
      }
      return { ok: false, errors: ['the save did not go through'] };
    },
    async discard(path) { copy.drop(path); const r = await ref(path); if (r) await r.delete(); },
    async download(filename, text) {
      const dl = await cap('downloads');
      if (!dl) return false;
      try { await dl.save({ filename, data: text }); return true; } catch (e) { return false; }
    },
    media: p => p.replace(/ /g, '_'),
  };

  // A saved version that arrived after the reel had started: offer it rather than switch under you.
  function offerLate() {
    if (document.getElementById('reel-late')) return;
    const b = document.createElement('div');
    b.id = 'reel-late'; b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:50%;top:calc(16px + env(safe-area-inset-top, 0px));transform:translateX(-50%);z-index:80;display:flex;gap:12px;align-items:center;'
      + 'padding:10px 14px;border-radius:10px;background:rgba(var(--surface-rgb),0.97);border:1px solid rgba(var(--gold-rgb),0.55);font:500 13px/1.3 var(--font-mono);color:var(--text-primary)';
    b.innerHTML = '<span>Your saved version is ready.</span><button type="button" style="font:inherit;color:var(--gold);background:none;border:1px solid rgba(var(--gold-rgb),0.55);border-radius:7px;padding:6px 10px;cursor:pointer">Play it</button>';
    b.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(b);
  }

  // Where the preview was: every save reloads the page, and a framed page can lose its #hash on
  // the way, so this tab keeps it too.
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
<p>Click the reel, then <kbd>space</kbd> plays and pauses. <kbd>[</kbd> <kbd>]</kbd> jump a scene, <kbd>L</kbd> loops one.</p>
<p><kbd>E</kbd> opens the timeline: drag a scene's edge or a beat, or click a scene to change its words. <kbd>M</kbd> opens the synth rack.</p>
<p>Your changes save to this page. The first save asks you to let it store data. Ask Claude to bring your edits into the repo and render them.</p>
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
