// The reel editor's shared UI: its icons and its collapse rule. The rig loads it before its own
// script, so the HUD, the timeline, the synth rack, Export and the media picker can all count on it.
//
//   REEL_UI.icon(name)            an inline 16 px SVG (currentColor) for a button
//   REEL_UI.button(opts)          <button> with an icon, a label and a key: the anatomy every bar
//                                 collapses (see below). opts: { icon, label, key, title, cls, onClick }
//   REEL_UI.fit(bar, steps, done) the collapse rule
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
  window.REEL_UI = { icon, button, relabel, fit, ICONS };
})();
