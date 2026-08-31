/* ============================================================
   jh-shapes.js — THE shape marks + nav-link metadata, single source.
   Consumed by TWO renderers:
   1. The hero shape-nav strips (index/design/art): a placeholder
      <nav class="shape-nav" data-jh-hero-nav="home,design,art"
       data-current="design"> is filled synchronously by renderHeroNavs()
      — this file is loaded (non-deferred) immediately AFTER the
      placeholder, so the fill happens during parse: no flash, no
      late nav, regardless of connection speed.
   2. <jh-nav> in scripts/jh-chrome.js (deferred): reads
      window.JHShapes.links for the fixed bar's .nav-left.
   Change a shape HERE or add a page HERE — never in page markup.
   Stamped by scripts/sync-version.mjs (ASSETS list).
============================================================ */
(function () {
  'use strict';

  var SVG = {
    search: '<svg class="shape" viewBox="0 0 40 40" fill="none" stroke="currentColor"><circle class="state-ring" cx="20" cy="20" r="15" stroke-width="1.5"/><circle cx="16" cy="16" r="5.5" stroke-width="2.5"/><line x1="20" y1="20" x2="26" y2="26" stroke-width="2.5" stroke-linecap="round"/></svg>',
    triangle: '<svg class="shape triangle" viewBox="0 0 40 40"><polygon points="20,8 34,32 6,32"/></svg>',
    roundedSquare: '<svg class="shape rounded-square" viewBox="0 0 40 40"><rect x="6" y="6" width="28" height="28" rx="6"/></svg>',
    circle: '<svg class="shape circle" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14"/></svg>',
    diamond: '<svg class="shape diamond" viewBox="0 0 40 40"><polygon points="20,6 34,20 20,34 6,20"/></svg>',
    star: '<svg class="shape star" viewBox="0 0 40 40"><polygon points="20,6 23,16 34,16 25,22 28,34 20,26 12,34 15,22 6,16 17,16"/></svg>',
    // Hexagon / PLAY — carried over from the old hand-written playground nav,
    // which was the one page that never joined the shared chrome.
    hexagon: '<svg class="shape hexagon" viewBox="0 0 40 40"><polygon points="20,5 33,12.5 33,27.5 20,35 7,27.5 7,12.5"/></svg>'
  };

  // The uniform link set. `hero` lists a page's hero-strip membership order;
  // the fixed-bar <jh-nav> renders the full array (incl. the title entry).
  var LINKS = [
    { key: 'search', href: 'search.html', cls: 'shape-link search-icon', aria: 'Search',
      // The bar's search wears the same label as every other shape: hidden
      // behind hover on desktop, at rest in the folded strip — where a bare
      // magnifier was the one unlabelled item in a row of seven captions.
      svg: SVG.search, label: '<span class="shape-label">SEARCH</span>',
      heroLabel: '<span class="shape-label">SEARCH</span>', hero: true },
    { key: 'home', href: 'index.html', cls: 'shape-link', aria: 'Home',
      svg: SVG.triangle, label: '<img class="shape-label shape-label-img" src="./Assets/JHsig.svg" alt="JH">', hero: true },
    { key: 'design', href: 'design.html', cls: 'shape-link', aria: 'Design',
      svg: SVG.roundedSquare, label: '<span class="shape-label">DESIGN</span>', hero: true },
    { key: 'art', href: 'art.html', cls: 'shape-link', aria: 'Art',
      svg: SVG.circle, label: '<span class="shape-label">ART</span>', hero: true },
    { title: true },
    { key: 'about', href: 'about.html', cls: 'shape-link secondary', aria: 'About',
      svg: SVG.diamond, label: '<span class="shape-label">ABOUT</span>', hero: false },
    { key: 'services', href: 'services.html', cls: 'shape-link secondary', aria: 'Services',
      svg: SVG.star, label: '<span class="shape-label">SERVICES</span>', hero: false },
    { key: 'play', href: 'playground.html', cls: 'shape-link secondary', aria: 'Playground',
      svg: SVG.hexagon, label: '<span class="shape-label">PLAY</span>', hero: false }
  ];

  // Fill every hero placeholder ABOVE this script tag. Sync + during parse:
  // by the time anything paints, the strip is real markup.
  function renderHeroNavs() {
    var navs = document.querySelectorAll('nav[data-jh-hero-nav]');
    for (var i = 0; i < navs.length; i++) {
      var nav = navs[i];
      var keys = (nav.getAttribute('data-jh-hero-nav') || '').split(',');
      var current = nav.getAttribute('data-current') || '';
      var html = '';
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j].replace(/^\s+|\s+$/g, '');
        for (var k = 0; k < LINKS.length; k++) {
          var n = LINKS[k];
          if (n.key !== key) continue;
          var on = n.key === current;
          var label = (n.heroLabel !== undefined) ? n.heroLabel : n.label;
          html += '<a href="' + n.href + '" class="' + n.cls + (on ? ' active' : '') +
                  '" aria-label="' + n.aria + '"' + (on ? ' aria-current="page"' : '') +
                  '>' + n.svg + label + '</a>';
        }
      }
      nav.innerHTML = html;
    }
  }

  window.JHShapes = { svg: SVG, links: LINKS, renderHeroNavs: renderHeroNavs };
  renderHeroNavs();
})();
