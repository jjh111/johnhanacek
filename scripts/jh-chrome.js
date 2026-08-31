/*
 * jh-chrome.js — single source of truth for shared site chrome + identity.
 *
 * Defines the <jh-footer> custom element. It renders in LIGHT DOM (no shadow root)
 * and sets display:contents on itself, so the existing styles/shared.css rules for
 * `footer` and `.footer-oval` apply unchanged — the element is invisible to layout.
 *
 * Replaces ~6 copy-pasted footer blocks (and standardizes the divergent
 * services/nanome2 footers + the search page's missing version line) with one source.
 * <jh-nav> will follow here. Loaded with `defer` on each page; bump its ?v= via
 * scripts/sync-version.mjs on change.
 */
(function () {
  const SITE = {
    year: 2026,
    org: 'JHDesign LLC',
    version: '2.01', // ← THE site version. Footer badge, ?v= cache-bust, and README all read this (run scripts/sync-version.mjs after bumping).
    versionNote: 'Made with Claude Code &amp; OpenCode',
    github: 'https://github.com/jjh111/johnhanacek',
    githubLabel: 'github.com/jjh111/johnhanacek',
    sig: './Assets/JHsig.svg'
  };
  window.JH_SITE = SITE;

  // ---- Theme (light/dark) --------------------------------------------------
  // Dark is the base; data-theme="light" on <html> switches to the "Shallows"
  // palette (styles/jh-chrome.css). The head of each page carries a tiny
  // inline bootstrap that stamps the attribute before first paint; this
  // module owns the toggles and persistence. The stored preference
  // ('jh-theme', shared with writing.html) is written ONLY on an explicit
  // toggle — an auto-detected OS preference is never frozen into storage,
  // so the site keeps following the OS until the visitor picks a side.
  // openprose.html runs its own data-mode theming and is left alone.
  // Declared before the custom elements: define() upgrades synchronously,
  // so JHNav's connectedCallback reads THEME during the define call.
  const THEME = {
    KEY: 'jh-theme',
    foreign: document.documentElement.hasAttribute('data-mode'),
    current: function () {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    },
    apply: function (mode, persist) {
      if (mode === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      document.querySelectorAll('.jh-theme-btn').forEach(function (b) {
        const g = b.querySelector('.theme-glyph');
        if (g) g.textContent = mode === 'light' ? '◐' : '◑';
        b.setAttribute('aria-label', mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
      });
      let m = document.querySelector('meta[name="theme-color"]');
      if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
      m.content = mode === 'light' ? '#eef4f6' : '#020a12';
      if (persist) { try { localStorage.setItem(THEME.KEY, mode); } catch (e) {} }
      window.dispatchEvent(new CustomEvent('jh-theme-change', { detail: { theme: mode } }));
    },
    toggle: function () {
      THEME.apply(THEME.current() === 'light' ? 'dark' : 'light', true);
    }
  };
  window.JH_THEME = THEME;

  class JHFooter extends HTMLElement {
    connectedCallback() {
      this.style.display = 'contents'; // host vanishes from layout; .footer-oval is the visual child
      this.innerHTML =
        '<div class="footer-oval">' +
          '<p class="footer-signature"><img src="' + SITE.sig + '" alt="John Hanacek signature" loading="lazy"></p>' +
          // Version sits on its own line directly above the copyright; the
          // made-with note moves to the end so it does not split the pair.
          '<p class="version">Portfolio v' + SITE.version + '</p>' +
          '<p class="footer-copyright">© ' + SITE.year + ' John Hanacek · ' + SITE.org + '</p>' +
          '<p class="footer-github"><a href="' + SITE.github + '" target="_blank" rel="noopener">' + SITE.githubLabel + '</a></p>' +
          '<p class="version version-note">' + SITE.versionNote + '</p>' +
        '</div>';
    }
  }
  if (!customElements.get('jh-footer')) customElements.define('jh-footer', JHFooter);

  // ---- <jh-nav current="home|design|art|about|services|search"> ----------------
  // Renders the uniform .nav-left (search + shape links + center title) for the
  // fixed top nav. The page keeps its own .nav-toggle + .nav-right (page section TOC).
  // current="" (or absent) marks nothing active (e.g. 404).
  // Shape SVGs + link metadata live in scripts/jh-shapes.js (single source —
  // the same data renders the hero shape-nav strips). Requires that file
  // loaded synchronously before this deferred script executes.
  // Read defensively. This used to be a bare window.JHShapes.links, and when
  // two pages were missed in the move to jh-shapes.js it threw at module scope
  // — taking <jh-footer>, the theme toggle and the autoplay gate down with the
  // nav, on pages whose only visible symptom was "the header is gone". A
  // missing dependency should cost the thing that needs it, not everything
  // defined after it.
  if (!window.JHShapes) {
    console.error('jh-chrome: scripts/jh-shapes.js must load (non-deferred) before this file. <jh-nav> will render empty.');
  }
  const NAV = (window.JHShapes && window.JHShapes.links) || [];

  class JHNav extends HTMLElement {
    connectedCallback() {
      const current = this.getAttribute('current') || '';
      this.style.display = 'contents';
      const links = NAV.map(function (n) {
        if (n.title) return '<a href="index.html" class="nav-title">John Hanacek</a>';
        const on = n.key === current;
        return '<a href="' + n.href + '" class="' + n.cls + (on ? ' active' : '') + '" aria-label="' + n.aria + '"' + (on ? ' aria-current="page"' : '') + '>' + n.svg + n.label + '</a>';
      }).join('');
      // Signature = theme toggle, leftmost in the bar (not on openprose,
      // which themes itself via data-mode).
      const sigBtn = THEME.foreign ? '' :
        '<button type="button" class="nav-sig-toggle jh-theme-btn" aria-label="Switch theme">' +
          '<img src="' + SITE.sig + '" alt=""></button>';
      this.innerHTML = '<div class="nav-left">' + sigBtn + links + '</div>';
      const btn = this.querySelector('.nav-sig-toggle');
      if (btn) btn.addEventListener('click', THEME.toggle);
    }
  }
  if (!customElements.get('jh-nav')) customElements.define('jh-nav', JHNav);

  function initTheme() {
    if (THEME.foreign) return;
    // Right-edge toggle balances the bar; appended after the page's .nav-right.
    const inner = document.querySelector('#nav .nav-inner');
    if (inner && !inner.querySelector('.nav-theme-toggle')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-theme-toggle jh-theme-btn';
      b.innerHTML = '<span class="theme-glyph" aria-hidden="true">◑</span>';
      b.addEventListener('click', THEME.toggle);
      inner.appendChild(b);
    }
    // Hero pages: standalone glass toggle, upper right, sibling of the
    // shape-nav pill it visually pairs with.
    const hero = document.querySelector('.hero');
    if (hero && hero.querySelector('nav.shape-nav') && !hero.querySelector('.hero-theme-toggle')) {
      const hb = document.createElement('button');
      hb.type = 'button';
      hb.className = 'hero-theme-toggle jh-theme-btn';
      hb.innerHTML = '<span class="theme-glyph" aria-hidden="true">◑</span>';
      hb.addEventListener('click', THEME.toggle);
      hero.appendChild(hb);
    }
    // Resolve initial state (the head bootstrap already stamped the
    // attribute; this syncs glyphs/labels and covers pages without it).
    let stored = null;
    try { stored = localStorage.getItem(THEME.KEY); } catch (e) {}
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    THEME.apply(stored ? stored : (mql.matches ? 'light' : 'dark'), false);
    // Follow the OS while no explicit choice is stored.
    const onOs = function (e) {
      let s = null;
      try { s = localStorage.getItem(THEME.KEY); } catch (err) {}
      if (!s) THEME.apply(e.matches ? 'light' : 'dark', false);
    };
    if (mql.addEventListener) mql.addEventListener('change', onOs);
  }

  // ---- Return to playground -------------------------------------------------
  // The canvas can send you to a page in its own tab, and a fresh tab has no
  // history to go back through — the page's own nav takes you to the site, not
  // back to the board you came from. Anything the playground launches carries
  // ?from=playground; this renders the way home.
  //
  // Lives in the chrome so it works on every page from one place, including
  // the unlisted experiments that have no nav of their own.
  function initReturnChip() {
    var p = new URLSearchParams(location.search);
    if (p.get('from') !== 'playground') return;
    if (document.querySelector('.jh-return-chip')) return;
    var a = document.createElement('a');
    a.className = 'jh-return-chip';
    a.href = 'playground.html';
    a.textContent = '\u2190 back to playground';
    document.body.appendChild(a);
  }

  // ---- Autoplay gate -------------------------------------------------------
  // Decorative loops autoplay on a desktop pointer and nowhere else.
  //
  // Two reasons, one mechanism. On a phone an autoplaying loop spends someone
  // else's data before they have decided the page is worth it — index alone
  // carries 4.5MB of video. And a visitor who asks the OS for less motion is
  // asking for precisely this: nothing moving until they say so.
  //
  // It lives HERE rather than in shared.js because index.html and design.html
  // do not load shared.js (they keep their own inline nav), while every page
  // that has a <video> loads this file. One home, one behaviour.
  //
  // Gated videos keep their frame (poster, or the first frame) and get a small
  // corner control rather than a full-bleed cover — on both cards the media is
  // also the link into the case study, and covering it would take that away on
  // exactly the devices where it is the easiest target.
  function initAutoplayGate() {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    var coarse = window.matchMedia('(hover: none) and (pointer: coarse)');
    if (!reduce.matches && !coarse.matches) return; // desktop, motion welcome

    document.querySelectorAll('video[autoplay]').forEach(function (video) {
      if (video.closest('.video-gate')) return; // already gated
      video.removeAttribute('autoplay');
      video.autoplay = false;
      try { video.pause(); } catch (e) {}
      // preload:none was chosen against autoplay's own eagerness; without
      // autoplay it would leave an empty box, so ask for enough to paint.
      if (video.getAttribute('preload') === 'none') video.preload = 'metadata';

      var wrap = document.createElement('span');
      wrap.className = 'video-gate';
      video.parentNode.insertBefore(wrap, video);
      wrap.appendChild(video);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'video-gate-btn';
      wrap.appendChild(btn);

      function sync() {
        var playing = !video.paused && !video.ended;
        btn.classList.toggle('playing', playing);
        btn.setAttribute('aria-label', playing ? 'Pause this loop' : 'Play this loop');
        btn.setAttribute('aria-pressed', String(playing));
      }
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation(); // the media usually sits inside a link
        if (video.paused) { var r = video.play(); if (r && r.catch) r.catch(function () {}); }
        else video.pause();
      });
      video.addEventListener('play', sync);
      video.addEventListener('pause', sync);
      sync();
    });
  }
  // ---- Nav fit -------------------------------------------------------------
  // The bar's two halves are .nav-left (fixed: shapes + title) and .nav-right
  // (the page's own section TOC, so its width differs per page). When the pair
  // needs more room than the bar has, the TOC swaps to its data-short labels.
  //
  // This is measured, not guessed. A viewport breakpoint cannot be right for
  // every page — index's full labels need 1086px, a page with more sections
  // needs more — and the old 900px guess left the bar cut off from 901 to
  // 1199px, which is exactly where it was clamped narrow with viewport to spare.
  function initNavFit() {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const inner = nav.querySelector('.nav-inner');
    const left = inner && inner.querySelector('.nav-left');
    const right = inner && inner.querySelector('.nav-right');
    if (!inner || !left || !right) return;

    let queued = false;
    // The widest the bar has been measured to need in its UNCOMPACTED state.
    // Cached, because the compact state cannot be asked this question: the
    // TOC is abbreviated there, so measuring while compact always answers
    // "it fits" and releases the class immediately.
    let needFull = 0;
    let compact = false;
    // Releasing needs MORE room than compacting did. Without this margin a bar
    // parked exactly on the boundary compacts (contents shrink, so it fits),
    // releases (contents grow, so it does not), and repeats every frame — the
    // title and TOC visibly flickering forever. Observed between the tablet and
    // desktop breakpoints. The band must exceed the width the swap itself
    // moves, so no state change can ever be its own trigger.
    const HYSTERESIS = 24;

    function fit() {
      queued = false;
      const cs = getComputedStyle(inner);
      // clientWidth INCLUDES padding, and the padding here is the spine offset —
      // up to 200px a side. Comparing against it was the difference between
      // "fits" and "cut off" through the whole 1024-1150 band.
      const avail = inner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // Below the hamburger breakpoint the TOC is a dropdown, so only the left
      // half competes for the bar — but the title still has to fit, which is
      // why this measures rather than returning early.
      const menuMode = getComputedStyle(right).flexDirection === 'column';
      // scrollWidth under-reports on these: .nav-left is overflow:visible, so a
      // half that is too wide simply spills instead of growing its scroll box.
      // At 390px that read as "fits" while the bar was 53px over the viewport.
      const span = (el) => Math.max(el.scrollWidth, el.getBoundingClientRect().width);
      const need = span(left) + (menuMode ? 0 : span(right));

      if (!compact) {
        // Uncompacted, so this reading IS the full requirement. Keep the widest
        // one seen: the webfont and the shape SVGs settle at different moments,
        // and an early narrow reading must not become the standing answer.
        needFull = Math.max(needFull, need);
      }

      const want = compact ? (avail < needFull + HYSTERESIS) : (need > avail);
      if (want === compact) return;
      compact = want;
      nav.classList.toggle('nav-compact', want);
    }
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(fit);
    }
    // A single call at DOMContentLoaded measured too early and reported that
    // everything fit — verified: the class was absent at load and correct after
    // any resize. The bar's real width only exists once the shape SVGs and the
    // webfont have sized, so watch the box instead of guessing a moment.
    schedule();
    if (typeof ResizeObserver !== 'undefined') {
      // Watch BOTH HALVES, not just the bar. The bar is width:100% of a fixed
      // element, so its own box never changes after first layout and its
      // observer fires exactly once — too early, while the TOC is still
      // narrower than it will end up. design.html was the proof: the numbers
      // said compact and the class was absent, because nothing re-measured
      // after the text settled.
      const ro = new ResizeObserver(schedule);
      ro.observe(inner);
      ro.observe(left);
      ro.observe(right);
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  }

  function initChrome() {
    initTheme();
    initAutoplayGate();
    initReturnChip();
    initNavFit();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChrome);
  } else {
    initChrome();
  }
})();
