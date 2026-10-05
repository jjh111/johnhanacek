// The reel editor's shared UI: its icons and its collapse rule. The rig loads it before its own
// script, so the HUD, the timeline, the synth rack, Export and the media picker can all count on it.
//
//   REEL_UI.icon(name)            an inline 16 px SVG (currentColor) for a button
//   REEL_UI.button(opts)          <button> with an icon, a label and a key: the anatomy every bar
//                                 collapses (see below). opts: { icon, label, key, title, cls, onClick }
//   REEL_UI.fit(bar, steps, done) the collapse rule
//   REEL_UI.rollPaths(evs, o)     a part's notes as SVG paths (the timeline's clips, the pads), and
//                                 a sung take's bends as one line (`bends`)
//
// The collapse rule. A bar is laid out at full size; while anything in it overflows (the bar, or
// a button's own label), it takes the next class in `steps`, each on top of the last, cheapest
// first: key hints go, then labels (a button keeps its icon, and its name in the tooltip), then
// what is left to hide. When it grows, it gives them back as far as it fits. Measured, not set
// by breakpoints: fonts differ, and tools add their buttons after the bar is drawn. Every bar
// that uses it re-runs on its own resize (a ResizeObserver), and anyone can call the function it
// returns after changing the bar's content.
(function () {
  'use strict';
  if (window.REEL_UI) return;
  const S = (d, o = '') => `<svg class="ri" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${o}>${d}</svg>`;
  const F = d => S(d, ' style="fill:currentColor;stroke:none"');
  const ICONS = {
    play: F('<path d="M5 3v10l8.5-5z"/>'),
    pause: F('<rect x="4" y="3" width="3" height="10" rx="0.5"/><rect x="9" y="3" width="3" height="10" rx="0.5"/>'),
    restart: S('<path d="M3.6 8.6a4.6 4.6 0 1 0 1.4-3.9"/><path d="M4.6 1.9v3.2h3.2"/>'),
    prev: F('<rect x="3" y="3" width="2" height="10" rx="0.5"/><path d="M13 3v10L6 8z"/>'),
    next: F('<path d="M3 3v10l7-5z"/><rect x="11" y="3" width="2" height="10" rx="0.5"/>'),
    back: S('<path d="M9 3.5L4.5 8 9 12.5"/><path d="M13 3.5L8.5 8 13 12.5"/>'),
    fwd: S('<path d="M7 3.5L11.5 8 7 12.5"/><path d="M3 3.5L7.5 8 3 12.5"/>'),
    loop: S('<path d="M2.8 7.2A4.4 4.4 0 0 1 10.6 4.3l1.6 1.4"/><path d="M12.4 2.6v3.2H9.2"/><path d="M13.2 8.8a4.4 4.4 0 0 1-7.8 2.9l-1.6-1.4"/><path d="M3.6 13.4v-3.2h3.2"/>'),
    sound: S('<path d="M2.5 6h2.7L9 3v10l-3.8-3H2.5z" style="fill:currentColor;stroke:none"/><path d="M11.2 5.6a3.4 3.4 0 0 1 0 4.8"/><path d="M13 3.8a6 6 0 0 1 0 8.4"/>'),
    mute: S('<path d="M2.5 6h2.7L9 3v10l-3.8-3H2.5z" style="fill:currentColor;stroke:none"/><path d="M11 6l4 4M15 6l-4 4"/>'),
    timeline: S('<path d="M2 4h7M4 8h9M2 12h6"/><path d="M11.5 2v12" stroke-width="1.2"/>'),
    synths: S('<path d="M4 2.5v11M8 2.5v11M12 2.5v11" stroke-width="1.2"/><circle cx="4" cy="10" r="1.9" style="fill:currentColor;stroke:none"/><circle cx="8" cy="5" r="1.9" style="fill:currentColor;stroke:none"/><circle cx="12" cy="8.5" r="1.9" style="fill:currentColor;stroke:none"/>'),
    export: S('<path d="M8 10.5V2"/><path d="M4.8 5.2L8 2l3.2 3.2"/><path d="M3 8.5V13.5h10V8.5"/>'),
    download: S('<path d="M8 2v8.5"/><path d="M4.8 7.3L8 10.5l3.2-3.2"/><path d="M3 12.5V14h10v-1.5"/>'),
    undo: S('<path d="M5 6.5h5.2a3.3 3.3 0 0 1 0 6.6H7"/><path d="M7.5 4L5 6.5 7.5 9"/>'),
    redo: S('<path d="M11 6.5H5.8a3.3 3.3 0 0 0 0 6.6H9"/><path d="M8.5 4L11 6.5 8.5 9"/>'),
    zoomIn: S('<path d="M8 3v10M3 8h10"/>'),
    zoomOut: S('<path d="M3 8h10"/>'),
    fit: S('<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>'),
    close: S('<path d="M4 4l8 8M12 4l-8 8"/>'),
    revert: S('<path d="M3.6 8.6a4.6 4.6 0 1 0 1.4-3.9"/><path d="M4.6 1.9v3.2h3.2"/>'),
    discard: S('<path d="M3 4.5h10M6.3 4.5V3h3.4v1.5M4.5 4.5l.7 9h5.6l.7-9"/>'),
    more: F('<circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/>'),
    film: S('<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M6.8 5.8v4.4L10.4 8z" style="fill:currentColor;stroke:none"/>'),
    send: S('<path d="M2.2 7.6L14 2.5 9 14.2 7.4 9 2.2 7.6z"/><path d="M7.4 9L14 2.5"/>'),
    copy: S('<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M3 10.5V3.8C3 3.3 3.3 3 3.8 3h6.7"/>'),
    stop: F('<rect x="4" y="4" width="8" height="8" rx="1"/>'),
    swap: S('<path d="M3 5h9.5M10 2.5L12.5 5 10 7.5M13 11H3.5M6 8.5L3.5 11 6 13.5"/>'),
    image: S('<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M2.5 11.5l3.5-3.5 2.6 2.6 1.8-1.8 3.1 3.1"/><circle cx="10.5" cy="6.2" r="1.1"/>'),
    clip: S('<rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="M6.8 6.2v3.6L10 8z" style="fill:currentColor;stroke:none"/>'),
    save: S('<path d="M3 2.5h8l2.5 2.5v8.5H3z"/><path d="M5.5 2.5v3.5h5v-3.5M5.5 13.5v-4h5v4"/>'),
    // the fish panel's
    fish: S('<path d="M1.8 8c2.3-3.3 6.6-4 9.4-1.6L14.2 4v8l-3-2.4C8.4 12 4.1 11.3 1.8 8z"/><circle cx="5.3" cy="7.3" r="0.9" style="fill:currentColor;stroke:none"/>'),
    place: S('<circle cx="8" cy="8" r="4.2"/><circle cx="8" cy="8" r="1" style="fill:currentColor;stroke:none"/><path d="M8 1.2v2.6M8 12.2v2.6M1.2 8h2.6M12.2 8h2.6"/>'),
    eye: S('<path d="M1.4 8s2.5-4.6 6.6-4.6 6.6 4.6 6.6 4.6-2.5 4.6-6.6 4.6S1.4 8 1.4 8z"/><circle cx="8" cy="8" r="2.1"/>'),
    eyeOff: S('<path d="M1.4 8s2.5-4.6 6.6-4.6 6.6 4.6 6.6 4.6-2.5 4.6-6.6 4.6S1.4 8 1.4 8z"/><path d="M2.5 13.5l11-11"/>'),
    auto: S('<path d="M1.4 8s2.5-4.6 6.6-4.6 6.6 4.6 6.6 4.6-2.5 4.6-6.6 4.6S1.4 8 1.4 8z"/><path d="M6 9.6l2-4.2 2 4.2M6.7 8.3h2.6"/>'),
    hover: S('<path d="M2.5 11.5h11"/><path d="M4.5 8c1.6-2.2 4.4-2.6 6.2-1L12.8 5.4v5l-2.1-1.5c-1.8 1.5-4.6 1.1-6.2-.9z"/>'),
    sweep: S('<path d="M1.8 8h12.4M4.3 5.5L1.8 8l2.5 2.5M11.7 5.5L14.2 8l-2.5 2.5"/>'),
    circle: S('<ellipse cx="8" cy="8" rx="6" ry="3.6"/><path d="M11.4 3.3l2.3 1.4-1.2 2.3"/>'),
    wander: S('<path d="M1.8 11c1.8-4 3.6-4 4.6-1.4s2.6 2.8 3.9-.6 2.6-4.4 3.9-3.3"/>'),
    dart: S('<path d="M1.8 8h8.5M7.5 4.5L11 8l-3.5 3.5"/><path d="M13.7 3.5v9"/>'),
    turn: S('<path d="M11.5 13.5V6.3a3.5 3.5 0 0 0-7 0v2.9"/><path d="M2.3 7.2l2.2 2.3 2.2-2.3"/>'),
    scatter: S('<circle cx="8" cy="8" r="1.1" style="fill:currentColor;stroke:none"/><path d="M5.6 5.6L2.8 2.8M10.4 5.6l2.8-2.8M5.6 10.4l-2.8 2.8M10.4 10.4l2.8 2.8"/>'),
    regroup: S('<circle cx="8" cy="8" r="1.1" style="fill:currentColor;stroke:none"/><path d="M2.6 2.6l2.8 2.8M13.4 2.6l-2.8 2.8M2.6 13.4l2.8-2.8M13.4 13.4l-2.8-2.8"/><path d="M5.4 3.6v1.8H3.6M10.6 3.6v1.8h1.8M5.4 12.4v-1.8H3.6M10.6 12.4v-1.8h1.8"/>'),
    food: F('<circle cx="5" cy="5.5" r="1.5"/><circle cx="10.6" cy="6.8" r="1.5"/><circle cx="7" cy="11.2" r="1.5"/>'),
    slow: S('<path d="M2 11.5c2.5-6 9.5-6 12 0"/><path d="M8 11.5L5.5 7.8"/>'),
    fast: S('<path d="M2 11.5c2.5-6 9.5-6 12 0"/><path d="M8 11.5l2.8-3.6"/>'),
    record: F('<circle cx="8" cy="8" r="4.6"/>'),
    // the timeline's tracks
    clock: S('<circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.3 1.5"/>'),
    scenes: S('<rect x="1.5" y="4" width="4" height="8" rx="0.8"/><rect x="6" y="4" width="4" height="8" rx="0.8"/><rect x="10.5" y="4" width="4" height="8" rx="0.8"/>'),
    works: S('<rect x="2" y="5.5" width="9" height="8" rx="1.2"/><path d="M4.6 3.2h8.2c.4 0 .7.3.7.7v7.6"/>'),
    moment: S('<path d="M8 1.8l3 3-3 3-3-3z" style="fill:currentColor;stroke:none"/><path d="M8 8.6v4.9M5 13.5h6"/>'),
    out: S('<path d="M8.5 2.8H3v10.4h5.5"/><path d="M6.5 8h7.5M11.3 5.3L14 8l-2.7 2.7"/>'),
    school: S('<path d="M1.6 5.2c1.1-1.4 3-1.6 4.3-.6l1.4-1v3.2l-1.4-1c-1.3 1-3.2.8-4.3-.6z"/><path d="M8.4 5.2c1.1-1.4 3-1.6 4.3-.6l1.4-1v3.2l-1.4-1c-1.3 1-3.2.8-4.3-.6z"/><path d="M4.8 11.4c1.1-1.4 3-1.6 4.3-.6l1.4-1V13l-1.4-1c-1.3 1-3.2.8-4.3-.6z"/>'),
    text: S('<path d="M3 3.5h10M8 3.5V13M6 13h4"/>'),
    music: S('<path d="M6 12.2V3.4l7-1.4v8.6"/><circle cx="4.4" cy="12.2" r="1.7" style="fill:currentColor;stroke:none"/><circle cx="11.4" cy="10.6" r="1.7" style="fill:currentColor;stroke:none"/>'),
    chevDown: S('<path d="M4 6l4 4 4-4"/>'),
    chevRight: S('<path d="M6 4l4 4-4 4"/>'),
    // how the music crosses a seam (the timeline's chips): fade, swell, build, drop, cut
    xfade: S('<path d="M2 4.5l12 7M2 11.5l12-7"/>'),
    swell: S('<path d="M2 12.5h12V3.5z" style="fill:currentColor;stroke:none;opacity:0.85"/>'),
    build: S('<path d="M2 12.5L11 4.5"/><path d="M7.4 4.2H11.4v4"/><path d="M13.8 2.4v11.2" stroke-width="1.2"/>'),
    drop: S('<path d="M2 5h6.5"/><path d="M8.5 5v6.5"/><path d="M6 9l2.5 2.5L11 9"/><path d="M13.8 2.4v11.2" stroke-width="1.2"/>'),
    seamCut: S('<path d="M8 2v12" stroke-width="2"/>'),
    // the sound effects' cues: a question typed, its Enter, the select-all that clears it
    keys: S('<rect x="1.8" y="4.2" width="12.4" height="7.6" rx="1.4"/><path d="M4.4 6.8h.01M7 6.8h.01M9.6 6.8h.01M12 6.8h.01M5.4 9.4h5.2"/>'),
    enter: S('<path d="M12.8 3.6v4.2a1.6 1.6 0 0 1-1.6 1.6H3.6"/><path d="M6 6.8L3.4 9.4 6 12"/>'),
    select: S('<path d="M5 3H3.2v10H5M11 3h1.8v10H11"/><path d="M5.6 8h4.8" stroke-width="2.4" style="opacity:0.55"/>'),
  };
  const icon = name => ICONS[name] || '';

  function button({ icon: ic, label, key, title, cls, onClick, act } = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    if (cls) b.className = cls;
    if (act) b.dataset.act = act;
    b.innerHTML = icon(ic);
    if (label) { const l = document.createElement('span'); l.className = 'rl'; l.textContent = label; b.appendChild(l); }
    if (key) { const k = document.createElement('kbd'); k.textContent = key; b.appendChild(k); }
    b.title = (title || label || '') + (key ? ` (${key})` : '');
    b.setAttribute('aria-label', label || title || '');
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  // a button's words, kept in its label, its accessible name and its tooltip together
  function relabel(b, label, title) {
    const l = b.querySelector('.rl'); if (l) l.textContent = label;
    b.setAttribute('aria-label', label);
    const k = b.querySelector('kbd');
    b.title = (title || label) + (k ? ` (${k.textContent})` : '');
  }

  // Does anything in the bar overflow? The bar itself, or any button's own content.
  const over = bar => bar.scrollWidth > bar.clientWidth + 1
    || [...bar.querySelectorAll('button')].some(b => b.offsetParent !== null && b.scrollWidth > b.clientWidth + 1);
  function fit(bar, steps, done) {
    let last = -1, queued = false;
    // the bar and each part of it: a part that grows (a label that changes, a tool that arrives)
    // re-runs the rule as surely as the window does
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; run(); }); } }) : null;
    const run = () => {
      if (!bar.isConnected) return;
      if (ro) { ro.observe(bar); [...bar.children].forEach(c => ro.observe(c)); }
      steps.forEach(c => bar.classList.remove(c));
      let n = 0;
      while (n < steps.length && over(bar)) bar.classList.add(steps[n++]);
      bar.dataset.fit = n;
      if (n !== last) { last = n; if (done) done(n); }
    };
    if (!ro) addEventListener('resize', run);
    run();
    return run;
  }

  // The icon and label styles every bar shares; each bar's own collapse classes live with it.
  const css = document.createElement('style');
  css.textContent = `
.ri { width: 16px; height: 16px; flex: none; display: block; }
button > .rl { white-space: nowrap; }
button:has(> .ri) { display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
`;
  (document.head || document.documentElement).appendChild(css);
  // A part's notes as SVG path data, drawn the same way in the timeline's clips, the synth rack's
  // pads and the pad tiles: a hit is a tick, taller when louder; a note sits at its pitch, as long
  // as it sounds; a sweep up is a wedge. A part of several sounds (the drums: kick, clap, hat) draws
  // each sound in a row of its own, as a drum grid does. In four strengths (k 0-3: velocity ×
  // level where each starts), and apart, what is drawn in gold (`own`: a note marked `bypass`).
  //   evs   the events (ReelMusic.arrange or padPreview)
  //   o     { H: height, y0: the top of the drawing (under a clip's name), px: t → x, pxs: px a
  //           second, level: t → 0..1 (optional), lo, hi: the pitches (optional: read from evs),
  //           rows: { sound: row } with nRows (optional; row 0 the top) }
  function rollPaths(evs, o) {
    const H = o.H, y0 = o.y0 || 0, f = n => n.toFixed(1), d = ['', '', '', ''], own = [];
    let bends = '';
    let lo = o.lo, hi = o.hi;
    if (lo == null) { lo = Infinity; hi = -Infinity; evs.forEach(e => { if (e.midi != null) { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi); } }); }
    const rows = o.rows && o.nRows > 1 ? o.rows : null, rh = rows ? (H - 1 - y0) / o.nRows : 0;
    const pitched = !rows && lo !== Infinity, span = pitched ? Math.max(1, hi - lo) : 1;
    const nh = pitched ? Math.max(1.5, Math.min(4, (H - 2 - y0) / (span + 1))) : 0, tw = Math.max(1.2, Math.min(3, o.pxs * 0.05));
    for (const e of evs) {
      const x0 = o.px(e.t);
      // the band it draws in: its row, or the whole height under y0
      const top = rows ? y0 + (rows[e.track] || 0) * rh : y0, bot = rows ? top + rh : H - 1, bh = bot - top;
      let p;
      if (e.rise) p = `M${f(x0)} ${f(bot)}L${f(o.px(e.t + e.dur))} ${f(top + 1)}V${f(bot)}Z`;
      else if (!pitched || e.midi == null) {
        const hh = Math.max(2, (bh - 1) * (0.4 + 0.6 * Math.min(1, e.vel)));
        p = `M${f(x0)} ${f(bot)}h${f(tw)}v${f(-hh)}h${f(-tw)}Z`;
      } else {
        const y = hi === lo ? top + (bh - nh) / 2 : top + 1 + (hi - e.midi) / span * (bh - 2 - nh), w = e.dur * o.pxs;
        const len = Math.max(1.2, w > 3 ? w - 1 : w);                                   // a hair between repeated notes
        p = `M${f(x0)} ${f(y)}h${f(len)}v${f(nh)}h${f(-len)}Z`;
      }
      if (e.bypass) { own.push(p); continue; }
      const lv = o.level ? Math.min(1, o.level(e.t + 1e-6)) : 1, s = (pitched ? Math.min(1, e.vel) : 1) * lv;
      d[Math.max(0, Math.min(3, Math.ceil(s * 4) - 1))] += p;
      // a sung note's bend (cents, BEND_RATE points a second), where the note is wide enough to show it
      if (pitched && e.bend && e.midi != null && e.dur * o.pxs >= 8) {
        const yc = (hi === lo ? top + (bh - nh) / 2 : top + 1 + (hi - e.midi) / span * (bh - 2 - nh)) + nh / 2, per = hi === lo ? nh : (bh - 2 - nh) / span;
        const R = (window.ReelMusic && window.ReelMusic.BEND_RATE) || 32;
        for (let i = 0; i < e.bend.length && i / R <= e.dur + 1e-6; i++) bends += (i ? 'L' : 'M') + f(o.px(e.t + i / R)) + ' ' + f(yc - e.bend[i] / 100 * per);
      }
    }
    return { d, own: own.join(''), pitched, lo, hi, bends };
  }

  window.REEL_UI = { icon, button, relabel, fit, rollPaths, ICONS };
})();
