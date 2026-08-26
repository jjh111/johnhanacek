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
    version: '1.56', // ← THE site version. Footer badge, ?v= cache-bust, and README all read this (run scripts/sync-version.mjs after bumping).
    versionNote: 'Made with Claude Code &amp; Open Code',
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
          '<p class="footer-copyright">© ' + SITE.year + ' John Hanacek · ' + SITE.org + '</p>' +
          '<p class="footer-github"><a href="' + SITE.github + '" target="_blank" rel="noopener">' + SITE.githubLabel + '</a></p>' +
          '<p class="version">Portfolio v' + SITE.version + '<br>' + SITE.versionNote + '</p>' +
        '</div>';
    }
  }
  if (!customElements.get('jh-footer')) customElements.define('jh-footer', JHFooter);

  // ---- <jh-nav current="home|design|art|about|services|search"> ----------------
  // Renders the uniform .nav-left (search + shape links + center title) for the
  // fixed top nav. The page keeps its own .nav-toggle + .nav-right (page section TOC).
  // current="" (or absent) marks nothing active (e.g. 404).
  const NAV = [
    { key: 'search', href: 'search.html', cls: 'shape-link search-icon', aria: 'Search',
      svg: '<svg class="shape" viewBox="0 0 40 40" fill="none" stroke="currentColor"><circle class="state-ring" cx="20" cy="20" r="15" stroke-width="1.5"/><circle cx="16" cy="16" r="5.5" stroke-width="2.5"/><line x1="20" y1="20" x2="26" y2="26" stroke-width="2.5" stroke-linecap="round"/></svg>',
      label: '' },
    { key: 'home', href: 'index.html', cls: 'shape-link', aria: 'Home',
      svg: '<svg class="shape triangle" viewBox="0 0 40 40"><polygon points="20,8 34,32 6,32"/></svg>',
      label: '<img class="shape-label shape-label-img" src="./Assets/JHsig.svg" alt="JH">' },
    { key: 'design', href: 'design.html', cls: 'shape-link', aria: 'Design',
      svg: '<svg class="shape rounded-square" viewBox="0 0 40 40"><rect x="6" y="6" width="28" height="28" rx="6"/></svg>',
      label: '<span class="shape-label">DESIGN</span>' },
    { key: 'art', href: 'art.html', cls: 'shape-link', aria: 'Art',
      svg: '<svg class="shape circle" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14"/></svg>',
      label: '<span class="shape-label">ART</span>' },
    { title: true },
    { key: 'about', href: 'about.html', cls: 'shape-link secondary', aria: 'About',
      svg: '<svg class="shape diamond" viewBox="0 0 40 40"><polygon points="20,6 34,20 20,34 6,20"/></svg>',
      label: '<span class="shape-label">ABOUT</span>' },
    { key: 'services', href: 'services.html', cls: 'shape-link secondary', aria: 'Services',
      svg: '<svg class="shape star" viewBox="0 0 40 40"><polygon points="20,6 23,16 34,16 25,22 28,34 20,26 12,34 15,22 6,16 17,16"/></svg>',
      label: '<span class="shape-label">SERVICES</span>' },
    // Hexagon / PLAY — carried over from the old hand-written playground nav,
    // which was the one page that never joined the shared chrome. Same polygon
    // points, so the mark is unchanged.
    { key: 'play', href: 'playground.html', cls: 'shape-link secondary', aria: 'Playground',
      svg: '<svg class="shape hexagon" viewBox="0 0 40 40"><polygon points="20,5 33,12.5 33,27.5 20,35 7,27.5 7,12.5"/></svg>',
      label: '<span class="shape-label">PLAY</span>' }
  ];

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
  function initChrome() {
    initTheme();
    initAutoplayGate();
    initReturnChip();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChrome);
  } else {
    initChrome();
  }
})();
