/* ============================================================
   jh-strokes.js — THE gesture marks, single source.

   Sibling to jh-shapes.js, and deliberately NOT the same vocabulary:
   jh-shapes owns the site's NAVIGATION marks (filled polygons that
   stand for pages). This file owns the GESTURE marks — pictures of
   strokes you make with a finger or a mouse, drawn as open outlines
   because that is what a stroke is.

   Consumed by the .canvas-guide cards on index.html and design.html:
   a placeholder <span class="guide-glyph" data-jh-stroke="loop"></span>
   is filled synchronously by render() — this file is loaded
   (non-deferred) immediately AFTER the guide markup, so the fill
   happens during parse: no flash, no late swap, whatever the
   connection speed. Same contract as jh-shapes.js.

   WHY GENERATED, NOT HAND-DRAWN
   The guide used to caption its rows with emoji and text glyphs, and
   they lied twice over. 🎗️ is the *reminder-ribbon* emoji — it painted
   a yellow ribbon next to "draw a loop", and because emoji presentation
   ignores `color` it stayed yellow in a cyan column; ◻️ painted a grey
   filled box next to "draw a square". Meanwhile ◠ stood in for a loop
   as a 6px arc. Every one of them was somebody's guess at the gesture.
   These marks are computed from the SAME proportions the stroke
   classifier accepts, so a mark is a portrait of the real gesture
   rather than an illustration of one.

   `loop` is the clearest case: it is the open, self-crossing ichthys
   the classifier reads as a fish, so the mark shows both the stroke you
   make AND the creature you get. `scribble` draws its zigzag crossing a
   wall four times, because crossing count is literally the erase rule
   (ERASE_CROSSINGS, design.html) — the mark teaches the threshold.

   GEOMETRY DEBT: scripts/search-core.js carries its own copy of this
   geometry as `sceneKit`, which materialises scene language through
   synthetic pointer strokes. That copy is the older one and is being
   left alone while Phase 10 search work is in flight; fold it onto this
   module once that lands, so there is one set of numbers again.

   Stamped by scripts/sync-version.mjs (ASSETS list).
============================================================ */
(function () {
  'use strict';

  var BOX = 24;   // viewBox is 0 0 24 24 for every mark
  var PAD = 2.5;  // breathing room so round caps never clip

  // ── geometry ────────────────────────────────────────────────
  // Parameterised so Phase 3 (the animated ghost hint) can ask for the
  // same stroke at canvas scale instead of glyph scale.

  function ring(cx, cy, r, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
  }

  function polygon(cx, cy, corners, per) {
    var pts = [];
    for (var e = 0; e < corners.length; e++) {
      var a = corners[e], b = corners[(e + 1) % corners.length];
      for (var i = 0; i < per; i++) {
        pts.push({ x: cx + a[0] + (b[0] - a[0]) * i / per,
                   y: cy + a[1] + (b[1] - a[1]) * i / per });
      }
    }
    pts.push({ x: cx + corners[0][0], y: cy + corners[0][1] });
    return pts;
  }

  var GEN = {
    circle: function (cx, cy, r) { return ring(cx, cy, r, 40); },

    square: function (cx, cy, s) {
      var h = s / 2;
      return polygon(cx, cy, [[-h, -h], [h, -h], [h, h], [-h, h]], 7);
    },

    // the classifier's triangle sits slightly low — apex sharper than base
    triangle: function (cx, cy, s) {
      var h = s / 2;
      return polygon(cx, cy, [[0, -h], [h, h * 0.9], [-h, h * 0.9]], 9);
    },

    // The open, self-crossing loop the classifier reads as a fish: an
    // arc that stops short of closing, with both ends run out to a tail
    // point past the body. The crossing is the whole tell — a closed
    // ring is a bubble, this is a fish.
    loop: function (cx, cy, scale) {
      var S = scale == null ? 1 : scale;
      var rx = 45 * S, ry = 32 * S, ov = 0.55, tx = 75 * S, ty = 28 * S;
      var pts = [];
      var a0 = ov, a1 = Math.PI * 2 - ov;
      var sx = cx + rx * Math.cos(a0), sy = cy + ry * Math.sin(a0);
      for (var i = 0; i <= 3; i++) {
        pts.push({ x: (cx + tx) + (sx - cx - tx) * i / 4,
                   y: (cy - ty) + (sy - cy + ty) * i / 4 });
      }
      for (var j = 0; j <= 30; j++) {
        var a = a0 + (a1 - a0) * j / 30;
        pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
      }
      var ex = cx + rx * Math.cos(a1), ey = cy + ry * Math.sin(a1);
      for (var k = 1; k <= 4; k++) {
        pts.push({ x: ex + (cx + tx - ex) * k / 4, y: ey + (cy + ty - ey) * k / 4 });
      }
      return pts;
    },

    // A zigzag crossing the horizontal at y=cy exactly `crossings` times.
    // The count is the point: erasing needs the stroke to cross a wall
    // ERASE_CROSSINGS (3) times, so the mark draws four — one more than the
    // threshold, legibly "enough". Keep it low: nine crossings at glyph size
    // collapse into a solid smudge and hide the wall underneath.
    scribble: function (cx, cy, w, h, crossings) {
      var n = crossings == null ? 4 : crossings, pts = [];
      for (var i = 0; i <= n; i++) {
        pts.push({ x: cx - w / 2 + (w * i / n),
                   y: cy + (i % 2 === 0 ? -h / 2 : h / 2) });
      }
      return pts;
    }
  };

  // ── path building ───────────────────────────────────────────

  function r2(n) { return Math.round(n * 100) / 100; }

  function toPath(pts, close) {
    if (!pts || !pts.length) return '';
    var d = 'M' + r2(pts[0].x) + ' ' + r2(pts[0].y);
    for (var i = 1; i < pts.length; i++) d += 'L' + r2(pts[i].x) + ' ' + r2(pts[i].y);
    return close ? d + 'Z' : d;
  }

  // Normalise any point set into the viewBox, preserving aspect. Marks
  // are optically consistent because they are all fitted the same way,
  // not because anybody hand-tuned coordinates.
  function fit(pts, pad) {
    var p = pad == null ? PAD : pad;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i];
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
    var w = maxX - minX || 1, h = maxY - minY || 1;
    var avail = BOX - p * 2;
    var k = Math.min(avail / w, avail / h);
    var offX = (BOX - w * k) / 2 - minX * k;
    var offY = (BOX - h * k) / 2 - minY * k;
    var out = [];
    for (var j = 0; j < pts.length; j++) {
      out.push({ x: pts[j].x * k + offX, y: pts[j].y * k + offY });
    }
    return out;
  }

  // ── the mark set ────────────────────────────────────────────
  // Each entry returns the INNER markup of a 24×24 svg. Multi-element
  // marks are allowed — `tap` needs a filled dot inside a ring.

  function stroked(d) {
    return '<path d="' + d + '" fill="none" stroke="currentColor" '
         + 'stroke-linecap="round" stroke-linejoin="round" '
         + 'vector-effect="non-scaling-stroke"/>';
  }

  // Per-mark padding is OPTICAL COMPENSATION, not arbitrary tuning. Fitting
  // every mark to the same bounding box makes the triangle and circle read
  // smaller than the square, because a square fills its box and they do not —
  // the eye compares area, not extents. So the emptier the shape, the tighter
  // its pad. `loop` is wide-and-short (120:64), so it fits by width and would
  // sit at half height on the default pad; it gets the tightest of all.
  var MARKS = {
    loop:     function () { return stroked(toPath(fit(GEN.loop(0, 0, 1), 0.75), false)); },
    square:   function () { return stroked(toPath(fit(GEN.square(0, 0, 20), 2.5), true)); },
    triangle: function () { return stroked(toPath(fit(GEN.triangle(0, 0, 20), 1.5), true)); },
    circle:   function () { return stroked(toPath(fit(GEN.circle(0, 0, 10), 2.0), true)); },

    // finger-down: a solid point with the ripple it makes
    tap: function () {
      return '<circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/>'
           + '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" '
           + 'opacity="0.45" vector-effect="non-scaling-stroke"/>';
    },

    // the zigzag AND the wall it crosses — the rule, not just the gesture
    scribble: function () {
      var wall = '<path d="M1.5 12L22.5 12" fill="none" stroke="currentColor" '
               + 'opacity="0.55" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      return wall + stroked(toPath(GEN.scribble(12, 12, 19, 12, 4), false));
    }
  };

  function markup(name) {
    var mark = MARKS[name];
    if (!mark) return '';
    // width/height are INTRINSIC FALLBACKS, not the real size: shared.css
    // sizes these in `em`, and CSS beats a presentation attribute. They matter
    // for the stale-cache window — markup ships with the page, stylesheets are
    // cached, so a visitor holding an older shared.css would otherwise get an
    // SVG at its spec default of 300×150 blowing out the 1.35rem glyph column.
    return '<svg class="jh-stroke" viewBox="0 0 ' + BOX + ' ' + BOX + '" '
         + 'width="' + BOX + '" height="' + BOX + '" '
         + 'aria-hidden="true" focusable="false">' + mark() + '</svg>';
  }

  // Fill every [data-jh-stroke] placeholder. Called once at parse time,
  // and exposed so a page that builds guide rows later can re-run it.
  function render(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-jh-stroke]');
    for (var i = 0; i < nodes.length; i++) {
      var name = nodes[i].getAttribute('data-jh-stroke');
      var html = markup(name);
      if (html) nodes[i].innerHTML = html;
    }
  }

  window.JHStrokes = {
    points: GEN,     // generators, at any scale — Phase 3 ghost hint uses these
    fit: fit,
    toPath: toPath,
    markup: markup,  // ready-made 24×24 glyph markup
    marks: MARKS,
    render: render
  };

  render();
})();
