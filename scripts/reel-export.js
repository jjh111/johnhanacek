// The reel's Export: how the script becomes a film, from the editor itself.
//
// A film is made by scripts/render-sizzle-reel.mjs. It plays this same page on a virtual clock,
// frame by frame (the preview and the film match to the pixel), mixes the score, and writes an
// MP4 per format. Where this page runs decides what Export does:
//   the dev server (node scripts/reel-dev.mjs)  Render: the server runs the renderer for the
//        formats ticked here, shows each film's progress, and links each one when it is done
//        (Assets/media-kit/video/, served by the dev server)
//   claude.ai (the editor published there)      Ask Claude to render: a comment on this page, sent
//        to Claude (REEL_HOST.ask). Claude renders the saved edit and puts the films back here,
//        where this panel lists them (REEL_HOST.films)
//   anywhere else                               the renderer's command, and the script to download
//
//   Export (the HUD's tools, the timeline's status bar), or X    open / shut;  Esc shuts it
// A classic script the rig injects in live mode only, after defining window.REEL_LIVE.
(function () {
  'use strict';
  const L = window.REEL_LIVE, HOST = window.REEL_HOST;
  if (!L || document.getElementById('reel-ex')) return;
  const FORMATS = [['wide', '1920 × 1080'], ['square', '1080 × 1080'], ['vertical', '1080 × 1920']];
  const NAME = L.file.replace(/^.*\//, '').replace(/\.script\.txt$/, '');
  const SCORE = L.file.replace(/\.script\.txt$/, '.score.txt');
  const K_PICK = 'reel-ex-pick';
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } };
  // a short name for this version of the script, so a film can say which version it was made from
  const hash = t => { let x = 0x811c9dc5; for (let i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16).padStart(8, '0').slice(0, 6); };
  const VERSION = hash(String(L.src));
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const MODE = L.dev ? 'dev' : L.host ? 'host' : 'none';

  const css = document.createElement('style');
  css.textContent = `
#reel-ex { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55); }
#reel-ex[hidden], #reel-ex [hidden] { display: none !important; }
#reel-ex .ex-panel { outline: none; width: min(600px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto; box-sizing: border-box; padding: 20px 22px 18px;
  border-radius: 14px; background: rgba(var(--surface-rgb), 0.98); border: 1px solid rgba(var(--cyan-dim-rgb), 0.4); box-shadow: 0 16px 48px var(--elevation);
  font: 500 13px/1.55 var(--font-mono); color: var(--text-primary); }
#reel-ex h2 { margin: 0; font: 300 24px/1.1 var(--font-display); color: var(--cyan); letter-spacing: 0.04em; flex: 1; }
#reel-ex .ex-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
#reel-ex p { margin: 0 0 10px; }
#reel-ex .ex-quiet { color: var(--ink-quiet); }
#reel-ex .ex-faint { color: var(--ink-faint); font-size: 12px; }
#reel-ex h3 { margin: 16px 0 8px; font: 600 11px/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); }
#reel-ex .ex-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
#reel-ex button, #reel-ex a.ex-btn { font: 500 12px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.08); text-decoration: none;
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.38); border-radius: 7px; padding: 0 12px; height: 34px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
#reel-ex button:hover:not(:disabled), #reel-ex a.ex-btn:hover, #reel-ex button:focus-visible, #reel-ex a.ex-btn:focus-visible { border-color: var(--gold); color: var(--gold); outline: none; }
#reel-ex button:disabled { color: var(--ink-faint); cursor: default; opacity: 0.65; }
#reel-ex button[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); background: rgba(var(--gold-rgb), 0.1); }
#reel-ex button .ex-dim { color: var(--ink-faint); }
#reel-ex button[aria-pressed="true"] .ex-dim { color: inherit; }
#reel-ex .ex-go { border-color: rgba(var(--gold-rgb), 0.7); color: var(--gold); background: rgba(var(--gold-rgb), 0.08); height: 40px; padding: 0 16px; font-size: 13px; }
#reel-ex .ex-x { height: 32px; width: 32px; padding: 0; justify-content: center; flex: none; }
#reel-ex .ex-films { display: grid; gap: 8px; }
#reel-ex .ex-film { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: center; padding: 10px 12px; border-radius: 9px; border: 1px solid rgba(var(--cyan-dim-rgb), 0.22); }
#reel-ex .ex-film b { font-weight: 600; color: var(--text-bright); }
#reel-ex .ex-bar { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: rgba(var(--cyan-dim-rgb), 0.16); overflow: hidden; }
#reel-ex .ex-bar i { display: block; height: 100%; width: 0; background: var(--gold); transition: width 0.4s; }
#reel-ex code { font: 500 12px/1.5 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.08); border-radius: 5px; padding: 2px 6px; word-break: break-all; }
#reel-ex .ex-say { margin-top: 10px; padding: 10px 12px; border-radius: 8px; border-left: 2px solid var(--gold); background: rgba(var(--gold-rgb), 0.06); }
#reel-ex .ex-say[hidden] { display: none; }
#reel-ex .ex-say.ex-bad { border-left-color: #ff8a7a; background: rgba(255, 138, 122, 0.06); }
`;
  document.head.appendChild(css);

  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls.split(' ').map(c => 'ex-' + c).join(' '); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const btn = (parent, text, title, cls, icon) => { const b = el('button', cls || null, parent); b.type = 'button'; if (title) b.title = title; dress(b, text, icon); return b; };
  // a button's icon (scripts/reel-ui.js) and words, set together
  function dress(b, text, icon) {
    if (icon && window.REEL_UI) { b.innerHTML = REEL_UI.icon(icon); if (text) { const l = el('span', null, b, text); l.className = 'rl'; } }
    else b.textContent = text || '';
  }
  const root = el('div', null, document.body); root.id = 'reel-ex'; root.hidden = true;
  const panel = el('div', 'panel', root);
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'reel-ex-h'); panel.tabIndex = -1;
  root.addEventListener('pointerdown', e => { if (e.target === root) open(false); });
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); open(false); } e.stopPropagation(); });

  const head = el('div', 'head', panel);
  const h2 = el('h2', null, head, 'Export video'); h2.id = 'reel-ex-h';
  const x = btn(head, '', 'close (Esc)', 'x', 'close'); x.setAttribute('aria-label', 'close'); x.onclick = () => open(false);
  el('p', 'quiet', panel, 'A film is rendered from the saved script: this same page, played frame by frame, with the music mixed in. What the preview shows is what it films, to the pixel.');

  // what to make
  el('h3', null, panel, 'Formats');
  const pick = Object.assign({ wide: true, square: false, vertical: false, fps: 60 }, get(K_PICK, {}));
  const fRow = el('div', 'row', panel);
  const fBtns = FORMATS.map(([f, size]) => {
    const b = btn(fRow, '', `render the ${f} film (${size})`);
    el('span', null, b, f[0].toUpperCase() + f.slice(1)); el('span', 'dim', b, size);
    b.setAttribute('aria-pressed', String(!!pick[f]));
    b.onclick = () => { pick[f] = !pick[f]; b.setAttribute('aria-pressed', String(pick[f])); put(K_PICK, pick); sync(); };
    return b;
  });
  const rRow = el('div', 'row', panel); rRow.style.marginTop = '8px';
  const rBtns = [[60, '60 fps', 'the film'], [30, '30 fps', 'a quick proof']].map(([v, a, b_]) => {
    const b = btn(rRow, '', `${a}: ${b_}`); el('span', null, b, a); el('span', 'dim', b, b_);
    b.setAttribute('aria-pressed', String(pick.fps === v));
    b.onclick = () => { pick.fps = v; rBtns.forEach(o => o.b.setAttribute('aria-pressed', String(o.v === v))); put(K_PICK, pick); sync(); };
    return { b, v };
  });
  const chosen = () => FORMATS.map(f => f[0]).filter(f => pick[f]);

  // the one action
  el('h3', null, panel, MODE === 'dev' ? 'Render' : MODE === 'host' ? 'Make the films' : 'Make the films');
  const lead = el('p', 'quiet', panel);
  const act = el('div', 'row', panel);
  const go = btn(act, '', null, 'go');
  const stop = btn(act, 'Stop', 'stop the render', null, 'stop'); stop.hidden = true;
  const copy = btn(act, 'Copy the request', 'copy the words to send Claude', null, 'copy'); copy.hidden = true;
  const say = el('div', 'say', panel); say.hidden = true; say.setAttribute('role', 'status');
  const tell = (text, bad) => { say.hidden = !text; say.textContent = text || ''; say.classList.toggle('ex-bad', !!bad); };

  // the films
  el('h3', null, panel, 'Films');
  const films = el('div', 'films', panel);
  // the edit itself, to keep or to take elsewhere
  el('h3', null, panel, 'The edit');
  const more = el('div', 'row', panel);
  const dScript = btn(more, 'Download the script', `save ${NAME}.script.txt: every word and time of the edit`, null, 'download');
  const dScore = btn(more, 'Download the score', `save ${NAME}.score.txt: the music`, null, 'download');
  const cmd = el('p', 'faint', panel); cmd.style.marginTop = '10px';
  dScript.onclick = () => L.download(L.src);
  dScore.onclick = () => {
    const t = window.REEL_RACK && window.REEL_RACK.src;
    if (t == null) return tell('There is no score loaded to download.', true);
    const f = SCORE.replace(/^.*\//, '');
    if (HOST && HOST.download) return HOST.download(f, t);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.download = f; document.body.appendChild(a); a.click(); a.remove();
  };
  const cmdFor = f => `node scripts/render-sizzle-reel.mjs --script=${L.file}${f === 'wide' ? '' : ' --format=' + f}${pick.fps === 30 ? ' --fps=30' : ''}`;

  function filmRow(label, detail, links, progress) {
    const r = el('div', 'film', films);
    const t = el('div', null, r); el('b', null, t, label); if (detail) { t.appendChild(document.createTextNode('  ')); el('span', 'quiet', t, detail); }
    const l = el('div', 'row', r);
    (links || []).forEach(([text, href, dl]) => { const a = el('a', 'btn', l); dress(a, text, dl ? 'download' : 'film'); a.href = href; if (dl) a.download = dl; else { a.target = '_blank'; a.rel = 'noopener'; } });
    if (progress != null) { const bar = el('div', 'bar', r); const i = el('i', null, bar); i.style.width = Math.round(progress * 100) + '%'; }
    return r;
  }

  // ── the dev server: render here ───────────────────────────────────────
  let poll = null, last = null;
  async function devStatus() {
    const r = await fetch('/__reel/render', { cache: 'no-store' }).then(x => x.json()).catch(() => null);
    last = r && r.job;
    drawDev();
    if (last && last.state === 'running') { clearTimeout(poll); poll = setTimeout(devStatus, 900); }
  }
  function drawDev() {
    const j = last, running = j && j.state === 'running';
    films.textContent = '';
    if (!j) el('p', 'faint', films, 'No films made here yet.');
    else {
      if (j.file !== L.file) el('p', 'faint', films, `The last job rendered ${j.file}.`);
      j.items.forEach(it => {
        const name = `${NAME}${it.format === 'wide' ? '' : '-' + it.format}.mp4`;
        const detail = it.state === 'running' ? (it.frames ? `${Math.round(100 * it.frame / it.frames)}% · ${mmss(it.eta || 0)} left` : 'starting')
          : it.state === 'done' ? `${it.mb} MB · ${it.seconds} s · ${j.fps} fps` : it.state === 'waiting' ? 'waiting' : it.state === 'failed' ? `failed: ${it.error || ''}` : it.state;
        filmRow(`${it.format}`, detail, it.state === 'done' ? [['Open', it.url], ['Download', it.url, name]] : [], it.state === 'running' && it.frames ? it.frame / it.frames : it.state === 'done' ? 1 : null);
      });
    }
    go.disabled = running || !chosen().length; stop.hidden = !running;
    dress(go, running ? 'Rendering…' : `Render ${chosen().length > 1 ? chosen().length + ' films' : 'the film'}`, 'film');
  }
  async function devGo() {
    tell('');
    const r = await fetch('/__reel/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: L.file, formats: chosen(), fps: pick.fps }) })
      .then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) })).catch(e => ({ status: 0, j: { errors: [e.message] } }));
    if (r.status !== 202) return tell((r.j.errors || ['the dev server did not start the render']).join(' · '), true);
    last = r.j.job; drawDev(); devStatus();
  }
  stop.onclick = async () => {
    await fetch('/__reel/render/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    devStatus();
  };

  // ── claude.ai: ask Claude ─────────────────────────────────────────────
  let can = null;                                         // not yet known: canAsk() is on its way
  const request = () => `Render my reel from the editor: ${chosen().join(', ')} at ${pick.fps} fps, from my saved version (${VERSION}).`;
  const why = { writers_only: 'Only the page\'s editors can send Claude a request from here.', no_session: 'No Claude session is watching this page right now.',
    off: 'This view cannot send Claude a comment.' };
  async function drawHost() {
    films.textContent = '';
    const wait = el('p', 'faint', films, 'Looking for films…');
    const f = await Promise.resolve(HOST.films()).catch(() => null);
    wait.remove();
    if (!f || !Array.isArray(f.items) || !f.items.length) { el('p', 'faint', films, 'No films yet. They appear here once Claude has rendered them.'); return; }
    const when = f.renderedAt ? new Date(f.renderedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    el('p', 'faint', films, `Rendered ${when}${f.from ? f.from === VERSION ? ' from this version of the edit.' : ` from an earlier version (${f.from}); this one is ${VERSION}.` : '.'}`);
    f.items.forEach(it => filmRow(it.format, [it.mb && `${it.mb} MB`, it.seconds && `${it.seconds} s`, it.fps && `${it.fps} fps`].filter(Boolean).join(' · '),
      [['Open', it.url], ['Download', it.url, `${NAME}${it.format === 'wide' ? '' : '-' + it.format}.mp4`]]));
  }
  async function hostGo() {
    tell('');
    if (can == null) return;
    if (can !== 'available') { copyIt(); return; }
    go.disabled = true; dress(go, 'Sending…', 'send');
    const r = await Promise.resolve(HOST.ask(request(), go)).catch(e => ({ ok: false, reason: 'error', message: e.message }));
    go.disabled = false; sync();
    if (r.ok) tell(`Sent to Claude. It renders your saved edit (${chosen().join(', ')}, ${pick.fps} fps) and puts the films in this panel; its reply shows in this page's comments. A film takes about ${pick.fps === 60 ? 10 : 5} minutes.`);
    else if (r.reason === 'consent_required' || r.reason === 'forbidden') tell('The comment was not sent: this page may not comment for you. Copy the request and send it to Claude in your chat instead.', true);
    else { tell(`The request did not go through (${r.message || r.reason}). Copy it and send it to Claude in your chat.`, true); copy.hidden = false; }
  }
  function copyIt() {
    const t = request();
    const done = () => tell(`Copied: “${t}”. Paste it to Claude in the chat where you opened this editor.`);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => tell(`Copy this to Claude: “${t}”`));
    else tell(`Copy this to Claude: “${t}”`);
  }
  copy.onclick = copyIt;

  // ── one sync for all three ────────────────────────────────────────────
  function sync() {
    const n = chosen().length;
    if (MODE === 'dev') {
      lead.textContent = 'The dev server runs the renderer for each format in turn. The films land in Assets/media-kit/video/.';
      go.onclick = devGo; drawDev();
    } else if (MODE === 'host') {
      const unsaved = L.draft ? ' Your latest changes are a draft in this tab only: save them to this page first (the page asks to store data), or download the script.' : '';
      lead.textContent = (can == null || can === 'available'
        ? 'Claude renders what is saved on this page and puts the films below.'
        : `${why[can] || why.off} Copy the request and send it to Claude in the chat where you opened this editor.`) + unsaved;
      dress(go, can == null ? 'Checking…' : can === 'available' ? `Ask Claude to render ${n > 1 ? n + ' films' : 'the film'}` : 'Copy the request', can === 'available' || can == null ? 'send' : 'copy');
      go.disabled = !n || can == null; copy.hidden = true;    // unavailable, the main button copies it
      go.onclick = hostGo;
    } else {
      lead.textContent = 'This preview has no renderer. On a computer with the repo, run the dev server (node scripts/reel-dev.mjs) and Export from there, or run the renderer yourself:';
      dress(go, 'Copy the command', 'copy'); go.disabled = !n;
      go.onclick = () => { const t = chosen().map(cmdFor).join('\n'); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => tell('Copied.'), () => tell(t)); };
      films.textContent = ''; el('p', 'faint', films, 'Films made on your computer land in Assets/media-kit/video/.');
    }
    cmd.textContent = '';
    cmd.appendChild(document.createTextNode('Or on a computer with the repo: '));
    el('code', null, cmd, chosen().length ? chosen().map(cmdFor).join('  &&  ') : cmdFor('wide'));
  }

  let lastFocus = null, tool = null;
  function open(on) {
    if (on === undefined) on = root.hidden;
    root.hidden = !on;
    if (tool) tool.setAttribute('aria-pressed', String(!!on));
    if (on) {
      lastFocus = document.activeElement;
      tell(''); sync();
      if (MODE === 'dev') devStatus();
      else if (MODE === 'host') {
        drawHost();
        can = null; sync();
        Promise.resolve(HOST.canAsk()).catch(() => 'off').then(c => { can = c || 'off'; sync(); });
      }
      panel.focus();
    } else { clearTimeout(poll); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  }
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if ((e.key === 'x' || e.key === 'X') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(); }
    else if (e.key === 'Escape' && !root.hidden) { e.preventDefault(); open(false); }
  });
  if (L.addTool) tool = L.addTool({ id: 'export', label: 'Export', key: 'X', order: 40, cls: 'go', icon: 'export', title: 'make the video from this edit', onClick: () => open() });
  window.REEL_EXPORT = { open: on => open(on === undefined ? true : on), get mode() { return MODE; }, get version() { return VERSION; } };
})();
