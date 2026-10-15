// The frame's safe areas, and where each scene sits in this frame (G, or the HUD's Safe):
//   the guides   action safe (93% of the frame: what matters stays inside it) and title safe (90%:
//                every word stays inside it), drawn over the stage (SMPTE ST 2046-1; a phone's
//                crop and a feed's overlays take the edges)
//   what crosses every line of copy on the stage, measured as it stands: outlined in red where it
//                runs outside title safe, or where something it sits in cuts it off (a card too
//                short for its rows); counted in the bar under the guides. A line still sliding in
//                or out of its mask is not judged until it settles.
//   the place    paused, drag anywhere on the stage to move the scene at the playhead: all of its
//                own content (the bar, the glass and the fish keep the grid), in this frame only.
//                It is one line of the script, "place square 0 -40" (frame pixels), written when you
//                let go (ReelScript.setPlace), on the timeline's one Undo; Shift keeps a drag to one
//                axis, Reset puts the scene back.
//   the frame    Wide, Square and Vertical open this preview in that frame, at the same moment.
// John, 2026-10-12: "we need screensafe markers and abilities for me to layout in the timeline
// view, the first text is clipped".
(function () {
  'use strict';
  const L = window.REEL_LIVE, RS = window.ReelScript;
  if (!L || !RS || !L.stage || document.getElementById('reel-safe')) return;
  const UI = window.REEL_UI;
  const [W, H] = L.frame, FMT = L.format || 'wide';
  const SAFE = L.safe || { action: 0.93, title: 0.9 };
  const get = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } };
  const K_ON = 'reel-safe-on', K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file, DEPTH = 30;   // the timeline's stacks
  const box = share => { const m = (1 - share) / 2; return { x0: W * m, y0: H * m, x1: W * (1 - m), y1: H * (1 - m) }; };
  const TS = box(SAFE.title), AS = box(SAFE.action);

  const css = document.createElement('style');
  css.textContent = `
#reel-safe { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; pointer-events: none; z-index: 40; }
#reel-safe[hidden] { display: none; }
#reel-safe .sa { position: absolute; box-sizing: border-box; border: 2px dashed rgba(var(--cyan-dim-rgb), 0.55); }
#reel-safe .sa.t { border-color: rgba(var(--gold-rgb), 0.75); }
#reel-safe .sa b { position: absolute; left: 10px; top: 8px; font: 600 18px/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase;
  color: rgba(var(--cyan-dim-rgb), 0.9); background: rgba(2, 10, 18, 0.7); padding: 4px 7px; border-radius: 4px; }
#reel-safe .sa.t b { color: var(--gold); top: auto; bottom: 8px; }
#reel-safe .x { position: absolute; left: ${W / 2 - 20}px; top: ${H / 2 - 20}px; width: 40px; height: 40px; }
#reel-safe .x::before, #reel-safe .x::after { content: ''; position: absolute; background: rgba(var(--cyan-dim-rgb), 0.5); }
#reel-safe .x::before { left: 19px; top: 0; width: 2px; height: 40px; }
#reel-safe .x::after { left: 0; top: 19px; width: 40px; height: 2px; }
#reel-safe .bad { position: absolute; box-sizing: border-box; border: 3px solid #ff6b6b; border-radius: 4px; background: rgba(255, 107, 107, 0.1); }
#reel-safe .bad i { position: absolute; left: -3px; bottom: 100%; margin-bottom: 4px; white-space: nowrap; font: 600 18px/1 var(--font-mono); font-style: normal;
  color: #020a12; background: #ff6b6b; padding: 4px 7px; border-radius: 4px; }
#reel-safe-bar { position: fixed; left: 12px; z-index: 56; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; max-width: calc(100vw - 24px);
  padding: 6px 8px; border-radius: 9px; background: rgba(var(--surface-rgb), 0.94); border: 1px solid rgba(var(--cyan-dim-rgb), 0.35);
  font: 500 12px/1.3 var(--font-mono); color: var(--ink-quiet); box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45); }
#reel-safe-bar[hidden] { display: none; }
#reel-safe-bar .say { padding: 0 6px; }
#reel-safe-bar .say.bad { color: #ff9b9b; }
#reel-safe-bar .say.ok { color: var(--cyan); }
#reel-safe-bar button { font: 500 12px/1 var(--font-mono); padding: 6px 9px; border-radius: 6px; cursor: pointer; color: var(--text-bright);
  background: rgba(var(--cyan-dim-rgb), 0.1); border: 1px solid rgba(var(--cyan-dim-rgb), 0.35); }
#reel-safe-bar button[aria-pressed="true"] { color: var(--sea-deep, #020a12); background: var(--gold); border-color: var(--gold); }
#reel-safe-bar .sep { width: 1px; height: 18px; background: rgba(var(--cyan-dim-rgb), 0.3); margin: 0 2px; }
body.reel-placing, body.reel-placing * { cursor: move !important; }
`;
  document.head.appendChild(css);

  // ── the guides, in stage pixels (the stage's own transform scales them with it) ──
  const ov = document.createElement('div'); ov.id = 'reel-safe'; ov.hidden = true; ov.setAttribute('aria-hidden', 'true');
  const rect = (r, cls, label) => { const d = document.createElement('div'); d.className = 'sa ' + cls;
    Object.assign(d.style, { left: r.x0 + 'px', top: r.y0 + 'px', width: (r.x1 - r.x0) + 'px', height: (r.y1 - r.y0) + 'px' });
    const b = document.createElement('b'); b.textContent = label; d.appendChild(b); ov.appendChild(d); };
  rect(AS, 'a', `action safe ${Math.round(SAFE.action * 100)}%`);
  rect(TS, 't', `title safe ${Math.round(SAFE.title * 100)}%`);
  const cross = document.createElement('div'); cross.className = 'x'; ov.appendChild(cross);
  const bads = document.createElement('div'); ov.appendChild(bads);
  L.stage.appendChild(ov);

  // ── the bar: what crosses, the scene's place, the frames ───────────────
  const bar = document.createElement('div'); bar.id = 'reel-safe-bar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Safe areas and layout');
  const sayEl = document.createElement('span'); sayEl.className = 'say';
  const placeEl = document.createElement('span'); placeEl.className = 'say';
  const btn = (label, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.addEventListener('click', e => { fn(e); if (e.detail) b.blur(); }); return b; };
  const sep = () => { const s = document.createElement('i'); s.className = 'sep'; return s; };
  const reset = btn('Reset', 'put the scene at the playhead back where the reel lays it out, in this frame', () => commitPlace(sceneNow(), 0, 0));
  bar.append(sayEl, sep(), placeEl, reset, sep());
  ['wide', 'square', 'vertical'].forEach(f => {
    const b = btn(f[0].toUpperCase() + f.slice(1), `open this preview in the ${f} frame, at the same moment`, () => {
      if (f === FMT) return;
      const u = new URL(location.href);
      if (f === 'wide') u.searchParams.delete('format'); else u.searchParams.set('format', f);
      put(K_ON, true);
      u.hash = `t=${L.now().toFixed(2)}${L.isPlaying() ? '' : '&pause=1'}`;
      location.href = u.toString();
    });
    b.setAttribute('aria-pressed', String(f === FMT));
    bar.appendChild(b);
  });
  document.body.appendChild(bar);
  const placeBar = () => { const hud = document.getElementById('hud'); const r = hud && !hud.hidden ? hud.getBoundingClientRect() : null; bar.style.bottom = ((r ? innerHeight - r.top : 0) + 8) + 'px'; };

  // ── the scene at the playhead, its line, its place in this frame ──────
  const sceneNow = () => { const t = L.now(); let s = L.scenes[0]; for (const x of L.scenes) if (t >= x.start - 1e-6) s = x; return s; };
  const sceneLn = sc => (L.parsed.marks.filter(m => m.kind === 'scene')[sc.i] || {}).ln;
  const placeOf = sc => { const p = L.parsed.edit.scenes[sc.i].place; return (p && p[FMT]) || { x: 0, y: 0 }; };
  const segOf = sc => L.stage.querySelector(`#scenes .seg[data-scene="${sc.i}"]`);

  // ── what crosses: every line of copy on the stage, as it stands ───────
  const visible = el => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!el.offsetParent);
  function scan() {
    const v = L.view(), out = [];
    const toStage = r => ({ x0: (r.left - v.x) / v.s, y0: (r.top - v.y) / v.s, x1: (r.right - v.x) / v.s, y1: (r.bottom - v.y) / v.s });
    for (const seg of L.stage.querySelectorAll('#scenes .seg.on')) {
      for (const el of seg.querySelectorAll('.lm, .stat .num')) {
        if (el.parentElement.closest('.lm')) continue;          // a mask inside a mask: its outer one is judged
        const ink = el.querySelector(':scope > .li') || el.querySelector(':scope > .wd') || el;
        const r = ink.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || !visible(ink)) continue;
        const m = el.getBoundingClientRect();
        // still sliding in or out of its own mask: not judged until it settles
        if (ink !== el && (r.top < m.top - 1 || r.bottom > m.bottom + 1)) continue;
        if (+getComputedStyle(el).opacity < 0.5) continue;
        const s = toStage(r);
        const words = (ink.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        if (s.x0 < TS.x0 - 1 || s.y0 < TS.y0 - 1 || s.x1 > TS.x1 + 1 || s.y1 > TS.y1 + 1) { out.push({ s, why: 'outside title safe', words }); continue; }
        // cut off by something it sits in (a card too short for its rows)
        for (let a = el.parentElement; a && a !== seg; a = a.parentElement) {
          const st = getComputedStyle(a);
          if (st.overflow === 'visible' && st.overflowY === 'visible' && st.overflowX === 'visible') continue;
          const c = a.getBoundingClientRect();
          if (r.top < c.top - 1 || r.bottom > c.bottom + 1 || r.left < c.left - 1 || r.right > c.right + 1) { out.push({ s, why: 'cut off', words }); break; }
        }
      }
    }
    return out;
  }
  function draw(list) {
    bads.textContent = '';
    list.forEach(b => {
      const d = document.createElement('div'); d.className = 'bad';
      Object.assign(d.style, { left: b.s.x0 - 4 + 'px', top: b.s.y0 - 4 + 'px', width: (b.s.x1 - b.s.x0 + 8) + 'px', height: (b.s.y1 - b.s.y0 + 8) + 'px' });
      const i = document.createElement('i'); i.textContent = b.why; d.appendChild(i);
      bads.appendChild(d);
    });
    sayEl.className = 'say ' + (list.length ? 'bad' : 'ok');
    sayEl.textContent = list.length ? `${list.length} line${list.length > 1 ? 's' : ''} ${list.every(b => b.why === 'cut off') ? 'cut off' : 'outside title safe or cut off'}: "${list[0].words}"${list.length > 1 ? '…' : ''}`
      : 'every line inside title safe';
    sayEl.title = list.map(b => `${b.why}: ${b.words}`).join('\n');
    const sc = sceneNow(), p = placeOf(sc);
    placeEl.textContent = `${sc.type}: place ${FMT} ${Math.round(p.x)} ${Math.round(p.y)}${L.isPlaying() ? '' : ' · drag the stage to move it'}`;
    reset.disabled = !p.x && !p.y;
  }
  let on = false, last = 0;
  L.onFrame && L.onFrame(() => {
    if (!on || drag) return;
    const n = performance.now();
    if (n - last < 180) return;
    last = n; placeBar(); draw(scan());
  });

  // ── the place: drag the stage, paused ─────────────────────────────────
  let drag = null;
  // a press that is another tool's: its panels, the Fish panel's spots on the stage (and its pick)
  const busy = e => (e.target.closest && e.target.closest('#hud, #reel-safe-bar, #reel-tl, #reel-rack, #reel-notes, #reel-fish, #reel-shots, #reel-ex, #reel-pk, .fm, input, textarea, select, button, [contenteditable]'))
    || !!document.querySelector('#reel-fish-marks:not([hidden]) .fm-pick:not([hidden])');
  addEventListener('pointerdown', e => {
    if (!on || e.button !== 0 || L.isPlaying() || busy(e) || !L.stage.contains(e.target) && e.target !== L.stage) return;
    if (window.REEL_TEXT && REEL_TEXT.editing) return;
    const sc = sceneNow(), seg = segOf(sc);
    if (!seg) return;
    const p = placeOf(sc);
    drag = { sc, seg, x0: e.clientX, y0: e.clientY, px: p.x, py: p.y, x: p.x, y: p.y, moved: false, id: e.pointerId };
  }, true);
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const s = L.view().s;
    let dx = (e.clientX - drag.x0) / s, dy = (e.clientY - drag.y0) / s;
    if (!drag.moved && Math.hypot(dx * s, dy * s) < 4) return;
    if (!drag.moved) { drag.moved = true; document.body.classList.add('reel-placing'); }
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    drag.x = Math.round(drag.px + dx); drag.y = Math.round(drag.py + dy);
    drag.seg.style.translate = `${drag.x}px ${drag.y}px`;
    placeEl.textContent = `${drag.sc.type}: place ${FMT} ${drag.x} ${drag.y}`;
    e.preventDefault();
  }, true);
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    document.body.classList.remove('reel-placing');
    if (d.moved) { if (e) { e.preventDefault(); e.stopPropagation(); } commitPlace(d.sc, d.x, d.y); }
  };
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
  // a drag's click is not a click on the stage
  addEventListener('click', e => { if (document.body.classList.contains('reel-placing')) { e.stopPropagation(); e.preventDefault(); } }, true);

  async function commitPlace(sc, x, y) {
    const ln = sceneLn(sc);
    if (ln == null) return;
    let next;
    try { next = RS.setPlace(L.src, ln, FMT, x, y); } catch (err) { sayEl.textContent = err.message; return; }
    if (next === L.src) { const sg = segOf(sc), p = placeOf(sc); if (sg) sg.style.translate = p.x || p.y ? `${p.x}px ${p.y}px` : ''; return; }
    const u = get(K_UNDO, []);
    put(K_UNDO, (Array.isArray(u) ? u : []).concat([L.src]).slice(-DEPTH)); put(K_REDO, []);
    let res;
    try { res = await L.save(next); } catch (err) { res = { ok: false, errors: [err.message] }; }
    if (!res || !res.applied) { put(K_UNDO, u); sayEl.textContent = ((res && res.errors) || ['not changed'])[0]; return; }
    if (L.journal) L.journal.note('script');            // one history with every other edit (the timeline's Undo)
  }

  // ── on and off ────────────────────────────────────────────────────────
  let tool = null;
  function show(v) {
    on = !!v; ov.hidden = bar.hidden = !on; put(K_ON, on);
    if (tool) tool.setAttribute('aria-pressed', String(on));
    if (on) { placeBar(); draw(scan()); } else bads.textContent = '';
  }
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'g' || e.key === 'G') { e.preventDefault(); show(!on); }
  });
  if (L.addTool) tool = L.addTool({ id: 'safe', label: 'Safe', key: 'G', order: 30, icon: 'safe',
    title: 'safe areas: title and action safe drawn over the frame, every line that crosses them outlined; paused, drag the stage to move the scene in this frame', onClick: () => show(!on) });
  if (UI && tool && !tool.getAttribute('aria-pressed')) tool.setAttribute('aria-pressed', 'false');
  addEventListener('resize', () => { if (on) placeBar(); });
  if (get(K_ON, false)) show(true);
  window.REEL_SAFE = { show, get on() { return on; }, scan, title: Object.assign({}, TS), action: Object.assign({}, AS), commitPlace, sceneNow };
})();
