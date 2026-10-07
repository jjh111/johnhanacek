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

  // The JH signature (Assets/JHsig.svg, comment and whitespace stripped) as a
  // data URI. Every chrome signature uses it, so it paints with the markup
  // instead of waiting on its own request: on a slow network the file showed
  // as alt text or a blank for seconds. The HTML heroes carry the same URI.
  // Regenerate from the .svg if the signature ever changes.
  var SIG = "data:image/svg+xml,%3Csvg role='img' aria-label='John Hanacek signature' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 75'%3E%3Cpath fill='%23ffffff' d='m148.6 13.3c-0.3-0.6-2.9 0.3-3.7 0.4l-0.4 0.2-0.8 0.1c-0.2-0.2-1 0.4-1.1 0.2l-0.8 0.3h-0.3l-1.1 0.3-0.7 0.1-0.9 0.3h-0.7l-0.8 0.3h-0.7l-0.7 0.3h-0.9l-0.6 0.3h-0.8l-0.8 0.3-0.9 0.1-0.8 0.2-0.7 0.1-0.3 0.2-0.6-0.1-0.2 0.3h-0.9l-0.8 0.3-0.3-0.1-1 0.4-0.4-0.1-0.3 0.2h-0.5l-1.2 0.4-0.9 0.1-1.1 0.3-0.9 0.1-1.6 0.4h-0.4l-0.4 0.2h-0.4l-1.2 0.3-2.4 0.5-1.4 0.4-1.4 0.2-1.2 0.4h-0.4l-0.9 0.3-0.6 0.1-2.1 0.5-1 0.4-1 0.1-1 0.4h-0.3l-0.4 0.3h-0.4l-2 0.6-0.9 0.1-1.1 0.5-1.2 0.2-0.8 0.3h-0.5l-0.8 0.4-0.6 0.1-2 0.6-0.2-0.2v-0.9h-0.2l0.3-0.4-0.2-0.4 0.2-0.4-0.2-0.1 0.1-2.1-0.2-0.1 0.2-0.5-0.2-0.2 0.2-0.4-0.2-0.3 0.3-0.2-0.2-0.4 0.1-3.5v-1.1l0.3-0.3-0.2-0.4 0.2-1.6 0.1-3.5 0.2-2 0.2-0.4 0.1-2.1 0.2-0.5 0.1-1.9 0.7-0.5c0.2-0.2 0.2-1.1 0-1.1-0.4-0.3-1.9-0.5-2.3 0-0.3 0.5-0.6 1.6-0.6 2.3l-0.1 0.2v1l-0.2 0.3-0.2 1.7-0.1 0.3-0.1 3.1-0.2 0.1v2l-0.2 0.3-0.1 3.1-0.2 0.2v3.1h0.2l-0.4 0.6 0.3 0.3-0.2 0.5 0.2 0.2-0.2 0.4v3l0.2 0.1-0.2 0.4v2.6l0.2 0.3-0.5 0.4-0.3-0.1-0.6 0.4-0.8 0.1-1 0.5-0.5-0.1-0.2 0.3-0.6-0.1-0.1 0.3-0.6-0.1-0.2 0.3-0.4-0.1-0.2 0.3-0.4-0.1-0.2 0.3h-0.4l-1.8 0.5h-0.3l-0.7 0.4-2.3 0.5-0.2-0.8 0.2-0.6-0.2-0.3 0.2-0.2 0.1-3.6 0.2-0.2-0.1-0.9 0.2-0.3-0.2-0.4 0.2-0.1-0.1-1.1 0.2-0.5-0.1-1 0.3-0.4-0.2-0.6 0.2-0.1 0.2-3.4 0.2-0.9v-0.8l0.2-0.3 0.1-2.1 0.2-0.8 0.2-0.6 0.1-1.5 0.2-0.4 0.1-0.7 0.3-0.2c0.3-1.6 1.6-1.1 1.2-2.5-0.5-0.6-1.9-0.9-2.5-0.5-0.6 0.7-1 2.3-1.3 3.3l-0.1 1-0.2 0.2-0.1 1.2-0.2 0.3v0.9l-0.2 0.3v0.8l-0.2 0.1-0.1 2.2-0.2 0.1-0.1 2-0.2 0.1-0.1 2.6-0.1 0.1v1.9l-0.2 0.3v2l-0.3 0.5 0.2 0.2-0.1 3.2h-0.1l0.1 1.5-0.2 0.2 0.2 1.1-0.3 0.3v0.2l-1.3 0.4-0.2 0.2h-0.5l-0.5 0.3-0.8 0.1-1.9 0.7-0.5 0.3h-0.5l-2.4 0.9-1.3 0.5-1.2 0.2-1.7 0.7-0.1-0.2 0.5-1.4 0.6-0.8 0.4-1.4 0.3-0.6v-0.4l0.6-1.7v-0.4l0.4-0.2v-0.5l0.6-1.4 0.1-1 0.4-1.1 0.1-1.5 0.3-0.4 0.1-1.5 0.2-0.3 0.1-2.2 0.2-0.5-0.1-0.7 0.2-0.2-0.1-0.4v-2.2l-0.2-0.5v-1.1l-0.3-0.7v-0.6l-0.3-0.5c-1.1-2.3-3.1-3.3-6.2-3.5h-2.8l-0.2 0.1c-1.3 0.2-3.5 0.6-4.7 1.1l-0.3 0.2-0.5 0.1-2.2 0.9-0.1 0.2-0.7 0.2-1 0.6-2.5 1.2-1.5 0.9-0.3 0.1-1.8 1.1-0.3 0.1-0.3 0.3-2.7 1.6-0.7 0.6-1.7 1-3.2 2.5-0.3 0.2-1.4 1.2-1.6 1.6-0.3 0.1-0.1 0.4-1.5 1.3-0.4 0.5-0.2 0.4-0.5 0.3-0.7 0.9-0.2 0.1v0.3l-1.2 1.5-0.4 0.2-1 1.3-0.3 0.2-0.7 0.9-1.2 1.3-0.2 0.2-0.6 0.9-0.6 0.6-0.1 0.4-0.4 0.3-2.6 3.8c-0.5 1.3 1.1 2.1 1.5 1.8s0.6-1 0.9-1.5l0.3-0.2 0.2-0.6 1.1-1.4 0.3-0.1v-0.4l1.6-1.9 0.3-0.2v-0.2l0.6-0.6 0.8-1.1 0.4-0.1 0.1-0.4 0.9-0.8 0.2-0.5 1.2-1.3 0.2-0.3 0.8-0.7 0.3-0.5 3.1-3.1 1.2-1 0.1-0.2 2.2-1.8 0.2-0.1 1.9-1.5 1.7-1.2 0.4-0.4 2.1-1.3 0.5-0.4 1.1-0.6 0.5-0.4 1.3-0.7 0.4-0.3 1.5-0.8 0.7-0.5 2.4-1.2 0.5-0.2 0.3-0.3 3.4-1.3 2.3-0.7 0.3-0.1 1.2-0.3 1.2-0.2h0.5l0.1-0.1c0.7-0.1 2.4-0.1 2.8 0l0.2 0.2h0.4l1.3 0.4 0.9 1v0.4l0.4 0.7 0.2 2.2v1l-0.2 0.2 0.2 0.2-0.2 0.4 0.2 0.3-0.2 0.2 0.1 0.5-0.3 0.6c0.1 1.3-0.1 2.2-0.6 3.1l-0.1 1.4-0.3 0.3-0.2 2.6-0.8 1.7v0.5l-0.4 0.8-0.1 1.1-0.4 0.9-0.2 0.7-0.2 0.1-0.2 0.9-0.4 0.7v0.4l-0.4 0.6-0.1 0.6-0.3 0.3-0.8 1.9-0.5 0.4-0.1 0.1-1.2 0.5-0.7 0.1-2.7 1.1h-0.3l-0.4 0.3-0.8 0.2-0.9 0.4h-0.4l-0.3 0.3-1.3 0.4-0.3 0.2h-0.4l-0.7 0.4-1.3 0.4-0.3 0.3h-0.5l-0.5 0.3-3.3 1.1-0.3 0.2-0.7 0.2-0.7 0.5-1 0.2-0.5 0.4h-0.5l-1 0.4h-0.3l-0.2 0.4-0.8 0.1-0.5 0.3-0.5 0.1-0.4 0.3-0.6 0.1-0.2 0.2-0.9 0.3-0.3 0.2h-0.3l-0.6 0.4-0.7 0.2-1.5 0.7-1 0.3-0.3 0.2-1.1 0.4-1.8 0.9-0.5 0.1-0.2 0.3-0.6 0.1-0.7 0.5-0.5 0.1-0.8 0.5-0.5 0.1-0.4 0.3-1.1 0.5-0.5 0.3-0.5 0.1-1 0.7-0.5 0.2-1 0.7-0.5 0.2-1.2 0.8-0.5 0.2-2.2 1.4-0.6 0.4-1.5 1.1-0.5 0.5-0.4 0.1-0.2 0.3-2.4 2-2.2 2-0.8 1-0.9 1c-0.6 0.9-1.9 3-1.3 5.2l1.1 1.3 1.4 0.9 0.5 0.2 0.7 0.4 1.5 0.4h0.6l0.4 0.2h3.5 0.3l0.1-0.1 0.5 0.2 0.2-0.2h1.2 0.2l0.3-0.2 1.2-0.1 0.8-0.3h0.7l0.5-0.2 1-0.1 0.6-0.3h0.4l1.1-0.4 0.9-0.2 1-0.5 0.6-0.2 0.7-0.3 0.7-0.2 0.5-0.3 0.5-0.1 1.5-0.7 0.5-0.3 0.5-0.2 0.5-0.3 0.6-0.1 1.2-0.8 0.7-0.2 0.8-0.5 0.5-0.1 1.2-0.8 0.5-0.2 0.5-0.4 0.8-0.5 0.5-0.2 0.9-0.7 0.6-0.3 0.5-0.5 0.6-0.2 1.5-1.1 0.6-0.3 0.3-0.3 0.7-0.4 1.5-1.2 0.5-0.3 1.3-1.1 0.5-0.3 1.5-1.4 0.3-0.3 0.4-0.3 4.8-4.7 1-1.2 0.5-0.5 0.9-1.1 0.3-0.4 0.5-0.7 0.4-0.6 1-1.2 0.6-1.1 0.3-0.3 0.7-1.3 0.4-0.5 0.5-1.1 0.5-0.7 0.6-1.4c0.8-2 2.1-1.8 3.8-2.5l0.7-0.2 0.3-0.2 1-0.3h0.4l0.3-0.2 0.8-0.2 0.3-0.2 1.9-0.5 0.5-0.2 0.6-0.1 0.7-0.4 0.7-0.1 0.5-0.2 0.5-0.1 0.8-0.4 1-0.3 0.2 0.3-0.2 0.6 0.3 0.6-0.1 0.5 0.2 0.3v1.5l0.2 0.1-0.1 0.3 0.1 3.1 0.2 0.9v0.5h0.2l-0.2 0.5 0.2 0.1 0.1 1.6h0.1l0.1 1.4 0.2 0.5v0.7l0.2 0.3v0.6l0.2 0.2 0.1 1.1 0.2 0.2 0.1 1 0.2 0.1v0.7l0.3 0.5 0.1 0.9 0.2 0.1 0.5 1.8 0.2 0.2 0.1 0.6 0.3 0.5 0.1 0.5 0.4 0.4v0.3l0.2 0.3c0.6 1 1.9 3 2.6 3 0.5 0.1 1 0 0.9-0.3 0.1-0.3-0.7-1-1.2-2.3l-0.7-0.9-0.5-1.5-0.3-0.4v-0.4l-0.2-0.2-0.1-0.6-0.3-0.5v-0.5l-0.3-0.5v-0.4l-0.7-2.4v-0.6l-0.2-0.3-0.1-1.3-0.2-0.4v-1l-0.2-0.4-0.1-2.1-0.3-0.1 0.2-0.9-0.3-1.4v-1.2l-0.2-0.3 0.2-0.2-0.1-1.3 0.2-0.2-0.3-0.2v-2l-0.2-0.2 0.2-0.3-0.2-0.4 0.2-0.8-0.2-1.2 1-0.4h0.5l0.2-0.4h0.6l0.4-0.2h0.5l0.8-0.4 0.8-0.1 0.7-0.4h0.5l2.1-0.7 0.6-0.1 0.6-0.3 2.4-0.6 0.4-0.2v1l0.2 0.1v2.3l0.3 0.3-0.3 0.2 0.3 0.6-0.2 0.2 0.2 0.3v1.5h0.1v1.1l0.2 0.3v1.8l0.2 0.3v1.6l0.3 0.4 0.1 1.4 0.2 0.5 0.1 1.2 0.2 0.3v0.5l0.2 0.2v1l0.2 0.4 0.1 1.1 0.2 0.3 0.1 0.8 0.2 0.3 0.1 1 0.2 0.4 0.1 0.8 0.2 0.3 0.1 0.7 0.3 0.4v0.5l0.3 0.4 0.1 0.9 0.3 0.3v0.4l0.3 0.4v0.4l0.3 0.3v0.4l1.6 2.6c0.6 1 1.1 0.9 1 0.7 0.5-0.4-0.4-2.3-0.7-2.9l0.1-0.1-0.8-2.4-0.2-0.1v-0.5l-0.3-0.4-0.1-1-0.3-0.4v-0.6l-0.2-0.3v-0.5l-0.3-0.3-0.1-1.3-0.2-0.2-0.1-0.9-0.2-0.5v-0.6l-0.3-0.4-0.2-1.9-0.3-0.1 0.2-0.4-0.2-1.2h-0.2l0.2-0.5-0.2-0.3-0.2-2.7h-0.2l0.1-1.4-0.3-0.1v-2.3l-0.2-0.2v-3.5l-0.2-0.2 0.2-0.3-0.1-1.5-0.2-0.1 0.2-0.4-0.1-0.8 1.1-0.6 1.1-0.3 2.3-0.7 0.7-0.1 3.8-1 0.7-0.1 1.8-0.5 0.4-0.2 1.3-0.4h0.3l0.5-0.2 0.6-0.1 0.6-0.2h0.5l0.5-0.2 3.5-0.9h0.4l0.2-0.2h0.5l1-0.3h0.4l0.4-0.2 0.4 0.1 0.2-0.2h0.8l2.2-0.6 0.8-0.1 0.2-0.2 0.4 0.1 0.4-0.2h0.6l0.4-0.2h0.5l0.5-0.2 0.6-0.1 0.5-0.2 0.6-0.1 1-0.2 1.2-0.3h0.5l0.4-0.3h0.4l3.5-0.8h0.8l0.5-0.3 1-0.1 2.2-0.6 0.9-0.2h0.5l0.4-0.2 0.8-0.1 1.8-0.5 0.6-0.4v0.4l0.5-0.5h0.4l2.1-0.6 0.8-0.2 1.3-0.6 0.9-0.2 1.3-0.8 0.7-0.2v-0.5zm-91.1 27.3-0.7 1v0.4l-0.4 0.4-0.2 0.6-0.3 0.4-0.3 0.6-0.3 0.2-0.1 0.4-0.5 0.5-0.1 0.5-0.4 0.2-0.1 0.6-1.7 1.7v0.4l-2 2.1-0.3 0.4-4.5 4.1-1.1 0.9-0.4 0.4-0.5 0.3-1.7 1.4-0.3 0.1-0.1 0.3-0.6 0.2-2 1.5-2.3 1.5-0.5 0.3-0.2 0.2-0.3 0.1-2 1.3-0.7 0.3-1.5 0.9-0.5 0.4-0.5 0.2-1.3 0.7-0.5 0.2-1 0.6-0.5 0.1-0.7 0.5-3.3 1.4-0.7 0.2-0.5 0.3-0.5 0.1-1.2 0.4h-0.6l-0.4 0.3-0.6 0.1-1.7 0.7-1.9 0.4h-0.4l-1.2 0.7h-2.5l-0.9 0.8-0.1-0.2-1 0.1-1-0.2h-1l-1.5-0.4-0.5-0.2-0.5-0.5v0.2c-0.8-0.7-0.5-2.6 0.5-3.7l0.2-0.5 0.5-0.4 0.3-0.6 2.2-2.2 0.3-0.2 0.1-0.3 0.4-0.2 1.5-1.4 0.5-0.2 0.2-0.4 1.3-0.9 0.2-0.3 0.5-0.2 1-0.8 0.5-0.5 0.8-0.4 1-0.7 0.5-0.2 0.7-0.6 0.6-0.3 0.4-0.3 0.5-0.2 0.5-0.5 0.5-0.1 1.8-1.1 0.5-0.2 1.2-0.7 0.5-0.2 0.3-0.3 0.7-0.2 0.6-0.4 0.7-0.3 0.6-0.3 1.2-0.7 1.2-0.5 0.2-0.2 0.6-0.1 0.7-0.4 0.5-0.1 0.5-0.3 0.7-0.2 0.5-0.3 1.3-0.4 0.2-0.2 0.8-0.1 0.2-0.4 0.8-0.1 1.7-0.9 0.5-0.1 1-0.5 0.6-0.1 2.2-0.9 0.5-0.1 0.7-0.4 0.8-0.2 0.2-0.2 1-0.3 0.8-0.4 0.5-0.1 0.5-0.3 0.7-0.2 0.5-0.3 0.6-0.1 2.2-0.8 0.5-0.1 0.5-0.3 1.2-0.3 0.3-0.2 0.5-0.1 0.5-0.4 0.7-0.1 1.3-0.5 0.7 0.1v0.1l0.1 0.2-0.2 0.2z'/%3E%3C/svg%3E";

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
      svg: SVG.triangle, label: '<img class="shape-label shape-label-img" src="' + SIG + '" alt="JH">', hero: true },
    { key: 'design', href: 'design.html', cls: 'shape-link', aria: 'Design',
      svg: SVG.roundedSquare, label: '<span class="shape-label">DESIGN</span>', hero: true },
    { key: 'art', href: 'art.html', cls: 'shape-link', aria: 'Art',
      svg: SVG.circle, label: '<span class="shape-label">ART</span>', hero: true },
    { title: true },
    { key: 'about', href: 'about.html', cls: 'shape-link secondary', aria: 'About',
      svg: SVG.diamond, label: '<span class="shape-label">ABOUT</span>', hero: false },
    { key: 'services', href: 'services.html', cls: 'shape-link secondary', aria: 'Services',
      // Folded into the menu-state strip it reads SERV: the tail is a span the
      // nav-menu CSS hides, so the full word stays one string everywhere else.
      svg: SVG.star, label: '<span class="shape-label">SERV<span class="shape-label-tail">ICES</span></span>', hero: false },
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

  window.JHShapes = { sig: SIG, svg: SVG, links: LINKS, renderHeroNavs: renderHeroNavs };
  renderHeroNavs();
})();
