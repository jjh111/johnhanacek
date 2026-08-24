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
    version: '1.52', // ← THE site version. Footer badge, ?v= cache-bust, and README all read this (run scripts/sync-version.mjs after bumping).
    versionNote: 'Made with Claude Code &amp; Open Code',
    github: 'https://github.com/jjh111/johnhanacek',
    githubLabel: 'github.com/jjh111/johnhanacek',
    sig: './Assets/JHsig.svg'
  };
  window.JH_SITE = SITE;

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
      label: '<span class="shape-label">SERVICES</span>' }
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
      this.innerHTML = '<div class="nav-left">' + links + '</div>';
    }
  }
  if (!customElements.get('jh-nav')) customElements.define('jh-nav', JHNav);

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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoplayGate);
  } else {
    initAutoplayGate();
  }
})();
