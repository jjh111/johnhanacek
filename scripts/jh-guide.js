/* ============================================================
   jh-guide.js — the stepped onboarding controller for .canvas-guide.

   index.html and design.html both open a guide card over a drawing
   canvas, and both used to show EVERYTHING at once: five rows on index,
   four on design, plus a paragraph of prose. At 390×780 that card stood
   253px tall — a third of the viewport — and it asked a first-time
   visitor to read a menu before touching anything. Stepped, the same
   card is 147px on that viewport and 105px on desktop.

   This shows ONE step at a time, at most three per page, and advances
   when the visitor actually performs the gesture. The full list is still
   there: the ℹ button switches the card to `all` mode and shows every
   row, including the ones that were never steps (design's erase is a
   repair action, not something you need in the first thirty seconds, so
   it lives in the list and is not a step).

   STEPS ARE COMPLETED, NOT ORDERED. `notify('food')` marks the food step
   done whether or not it was the step on screen; the card then displays
   the lowest step still outstanding. Insisting on sequence would punish
   someone who drew a square first, which is a perfectly reasonable thing
   to do on a canvas that invites drawing.

   The page owns the predicates, because only the page knows what its
   strokes mean: index reads the engine's classified stroke type
   (onStroke), design taps its own endDraw routing funnel. This module
   owns everything that would otherwise be duplicated — visibility, the
   ℹ/× contract, progress dots, the retire rules.

   Stamped by scripts/sync-version.mjs (ASSETS list).
============================================================ */
(function () {
  'use strict';

  // A visitor who draws this many strokes without ever completing the set
  // has plainly got the idea; the card retires rather than nagging. Without
  // this a card whose last step is never triggered would sit there forever.
  var STROKE_BACKSTOP = 15;
  var DONE_DWELL_MS = 1700;   // how long the "that's it" beat holds before fading

  function init(opts) {
    var el = opts.el;
    if (!el) return null;

    var steps = opts.steps || [];
    var toggleBtn = opts.toggle || null;
    var closeBtn = opts.close || null;
    var progress = el.querySelector('[data-jh-guide-progress]');

    var done = [];            // parallel to steps
    for (var i = 0; i < steps.length; i++) done.push(false);
    var mode = 'steps';       // 'steps' | 'all' | 'done'
    var visible = true;
    var retired = false;
    var strokes = 0;
    var doneTimer = null;

    // dots are rendered from the step list, so adding a step cannot leave
    // the indicator out of step with reality
    if (progress) {
      var html = '';
      for (var d = 0; d < steps.length; d++) html += '<span class="guide-dot"></span>';
      html += '<span class="guide-progress-label"></span>';
      progress.innerHTML = html;
    }

    function firstOutstanding() {
      for (var j = 0; j < steps.length; j++) if (!done[j]) return j;
      return -1;
    }

    function paint() {
      el.classList.toggle('hidden', !visible);
      el.setAttribute('data-guide-mode', mode);
      if (toggleBtn) toggleBtn.classList.toggle('active', visible);

      var cur = firstOutstanding();
      if (cur >= 0) el.setAttribute('data-guide-step', String(cur + 1));
      else el.removeAttribute('data-guide-step');

      if (!progress) return;
      var dots = progress.querySelectorAll('.guide-dot');
      for (var k = 0; k < dots.length; k++) {
        dots[k].classList.toggle('done', done[k]);
        dots[k].classList.toggle('current', k === cur && mode === 'steps');
      }
      var label = progress.querySelector('.guide-progress-label');
      if (label) {
        label.textContent = cur >= 0
          ? (cur + 1) + ' of ' + steps.length
          : steps.length + ' of ' + steps.length;
      }
    }

    function retire() {
      if (retired) return;
      retired = true;
      visible = false;
      if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
      paint();
    }

    // Every step cleared: hold a short beat on the "that's it" line so the
    // card acknowledges the visitor before it leaves, rather than blinking
    // out mid-gesture as though it crashed.
    function finish() {
      mode = 'done';
      paint();
      doneTimer = setTimeout(retire, DONE_DWELL_MS);
    }

    var api = {
      // The page calls this with whatever its canvas just produced. Unknown
      // keys are ignored, so a page can notify freely without knowing which
      // of its outcomes happen to be steps.
      notify: function (key) {
        if (retired || !key) return;
        var changed = false;
        for (var j = 0; j < steps.length; j++) {
          if (done[j]) continue;
          var m = steps[j].match;
          if (m.indexOf(key) !== -1) { done[j] = true; changed = true; }
        }
        if (!changed) return;
        if (firstOutstanding() === -1) finish();
        else if (mode === 'steps') paint();
        else paint();
      },

      // Counted separately from notify: a stroke that matched no step still
      // proves the visitor is drawing.
      countStroke: function () {
        if (retired) return;
        strokes++;
        if (strokes >= STROKE_BACKSTOP) retire();
      },

      isRetired: function () { return retired; }
    };

    // ℹ — reveals the FULL reference list rather than merely re-showing the
    // current step. Someone who reaches for it wants more than the card is
    // giving them, not the same thing again.
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        if (!visible) { visible = true; mode = 'all'; retired = false; }
        else if (mode !== 'all') { mode = 'all'; }
        else { visible = false; }
        if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
        paint();
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', retire);

    paint();
    return api;
  }

  window.JHGuide = { init: init };
})();
