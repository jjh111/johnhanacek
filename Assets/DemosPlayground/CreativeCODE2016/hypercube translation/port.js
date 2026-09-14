/* ==========================================================================
   port.js — Hypercube (2015), Processing → p5.js, ported 2026-09-14.

   SOURCE OF TRUTH: ../hypercube_processing/hypercube_processing.pde (134 lines).
   Every block below names the .pde line range it ports. Where Processing does
   something p5 has no equivalent for, the comment says so and names the
   substitution chosen.

   The unfinished 2015 hand-port that sits beside this file (sketch.js /
   index.html) is untouched. It is the artefact — it was never valid
   JavaScript, so it is kept as it was found rather than patched.

   THE WHOLE INTERACTION, from .pde 27–32: the mouse IS the control surface.
   The cube is drawn AT the cursor, and the cursor's quadrant picks which of
   the six rotation planes advance, 0.01 rad per frame, every frame:

       pointer LEFT  of centre   → XY   (.pde 27, turn(0,1))
       pointer ABOVE centre      → XZ   (.pde 28, turn(0,2))
       pointer ON the h-midline  → YZ   (.pde 29, turn(1,2))
       pointer RIGHT of centre   → XW   (.pde 30, turn(0,3))
       pointer BELOW centre      → YW   (.pde 31, turn(1,3))
       pointer ON the v-midline  → ZW   (.pde 32, turn(2,3))

   They stack: top-left spins XY+XZ together, bottom-right XW+YW, and dead
   centre is the rare state that spins the two "pure" planes YZ and ZW alone.
   The six planes are exactly the six toggle buttons John commented out of
   setup() (.pde 9–14, labelled XY XZ YZ XW YW ZW, in this same order) — the
   mouse is the control panel that never got built.

   Press (or tap) rebuilds the tesseract from scratch: .pde 35–38. That is a
   reset, and it matters — see the aliasing note on turn() below.
   ========================================================================== */

'use strict';

/* --- .pde 27–32: the per-frame rotation step, 0.01 rad. -------------------- */
var TURN = 0.01;

/* --- Palette (LIBERTY, see README): the .pde draws white-on-black, one
   stroke colour for all 32 edges (.pde 5, 19). Here the ground is the site's
   --sea-deep and the edges take the site's two ink roles: --cyan for the 24
   edges that live inside one of the two cubes, --gold for the 8 that cross w
   and join them. That is not a new idea bolted on — it is the .pde's own data
   read out loud: the 8 gold edges are precisely the hypercube's hyper-edges.
   Tokens are read from ../../../../styles/jh-chrome.css at boot; the literals
   here are only the offline fallback. ------------------------------------- */
var GROUND = '#020a12';   /* --sea-deep */
var INK_CUBE = '#b2e8fa'; /* --cyan  */
var INK_HYPER = '#d4af37'; /* --gold  */

/* --- .pde 1: `Tesseract tesseract;` --------------------------------------- */
var tesseract;

/* --- Pointer state. Two jobs, both explained where they are used:
   (a) `seen` lets the sketch open with the cube on screen instead of jammed
       into the top-left corner at p5's initial mouseX/mouseY of 0,0;
   (b) `lastMove` feeds the prefers-reduced-motion gate. ------------------- */
var pointer = { seen: false, lastMove: -1e9 };
var REDUCE_MOTION = false;

function token(name, fallback) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name);
  v = v ? v.trim() : '';
  // An unresolved var() means the stylesheet did not load (opened from file://,
  // say) — take the literal rather than hand p5 something it cannot parse.
  if (!v || v.indexOf('var(') === 0) return fallback;
  return v;
}

/* ==========================================================================
   .pde 3–16 — setup()
   The original is `size(1000,1000)`. Processing windows cannot be resized, so
   the .pde has no resize path at all; p5 gets createCanvas(windowWidth,
   windowHeight) plus windowResized() below (LIBERTY: responsive canvas).
   ========================================================================== */
function setup() {
  createCanvas(windowWidth, windowHeight);

  GROUND = token('--sea-deep', GROUND);
  INK_CUBE = token('--cyan', INK_CUBE);
  INK_HYPER = token('--gold', INK_HYPER);

  // .pde 5–6: stroke(255); strokeWeight(2). The weight survives verbatim;
  // the colour moved into display(), which now picks one of two inks per edge.
  strokeWeight(2);

  // Processing has no media queries. This is the one behaviour with no .pde
  // counterpart at all: under prefers-reduced-motion the six turn() calls
  // only run while the pointer is actually moving, so the sketch never spins
  // on its own. Everything else — the shape, the maths, the controls — is
  // unchanged, so a visitor who reduces motion still gets the whole thing,
  // they just have to drive it.
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  REDUCE_MOTION = !!(mq && mq.matches);
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function (e) { REDUCE_MOTION = e.matches; });
  }

  // .pde 15: tesseract = new Tesseract();
  tesseract = new Tesseract();
}

/* Where the cube is drawn, and what the rotation branches read.
   .pde 22 and 27–32 both use the raw mouseX/mouseY. p5 reports 0,0 until the
   pointer first enters the canvas — as does Processing — which would open the
   sketch with the cube pinned to the top-left corner, mostly off screen. It
   never mattered in 2015 (you were already holding the mouse); it matters in a
   playground card that may never be pointed at. LIBERTY: until the pointer
   first moves, the sketch reads the canvas centre. That is not an invented
   state — the centre is .pde 29 + 32, the exact spot where YZ and ZW spin
   alone, so the idle sketch shows the original's rarest, quietest motion. */
function px() { return pointer.seen ? mouseX : width / 2; }
function py() { return pointer.seen ? mouseY : height / 2; }

/* ==========================================================================
   .pde 18–33 — draw()
   ========================================================================== */
function draw() {
  // .pde 19: background(0) → the site's ground (LIBERTY, palette).
  background(GROUND);

  // .pde 20–25: pushMatrix / translate to the cursor / display / popMatrix.
  // p5's push() and pop() are pushMatrix()/popMatrix() plus style state; the
  // extra style save is harmless here.
  push();
  translate(px(), py());
  tesseract.display();
  pop();

  // .pde 27–32. Two substitutions, both forced:
  //
  // 1. The .pde hard-codes 500 — half of its fixed 1000×1000 window. Against a
  //    responsive canvas that constant has to become width/2 and height/2,
  //    which is what 500 always meant.
  //
  // 2. `mouseY == 500` and `mouseX == 500` (the YZ and ZW branches). In
  //    Processing mouseX/mouseY are ints, so "exactly on the midline" is a
  //    state you can actually land in. p5 reports them as floats — with a
  //    fractional device pixel ratio or an odd viewport, == would essentially
  //    never fire and two of the six planes would be dead. Rounding both sides
  //    restores Processing's integer semantics: one pixel column, one pixel
  //    row, the midline you can hunt for.
  //
  // Order is load-bearing and is the .pde's: 4D rotations do not commute, so
  // XY-then-XZ is not XZ-then-XY.
  var mx = px(), my = py();
  var cx = width / 2, cy = height / 2;
  var spin = !REDUCE_MOTION || (millis() - pointer.lastMove < 500);
  if (spin) {
    if (mx < cx) tesseract.turn(0, 1, TURN);                       // .pde 27 XY
    if (my < cy) tesseract.turn(0, 2, TURN);                       // .pde 28 XZ
    if (Math.round(my) === Math.round(cy)) tesseract.turn(1, 2, TURN); // .pde 29 YZ
    if (mx > cx) tesseract.turn(0, 3, TURN);                       // .pde 30 XW
    if (my > cy) tesseract.turn(1, 3, TURN);                       // .pde 31 YW
    if (Math.round(mx) === Math.round(cx)) tesseract.turn(2, 3, TURN); // .pde 32 ZW
  }
}

/* ==========================================================================
   .pde 35–38 — mousePressed(): rebuild the tesseract.
   Reads as a throwaway, but it is the sketch's reset, and turn()'s aliasing
   (below) is what makes it necessary: the figure slowly shrinks as it spins,
   and a press restores it. .pde 40–42's empty mouseReleased() is not ported —
   an empty handler in p5 is not a no-op, it suppresses p5's own fallback
   routing for touch, so leaving it out is the faithful thing.

   Touch needs no code of its own: p5 0.5.14 routes touchstart → mousePressed
   and touchmove → mouseDragged whenever no touch handler is defined, and it
   writes touch coordinates straight into mouseX/mouseY, so a finger is a
   mouse all the way through. Defining touchStarted()/touchMoved() here would
   REPLACE that routing, not add to it.
   ========================================================================== */
function mousePressed() {
  pointer.seen = true;
  pointer.lastMove = millis();
  tesseract = new Tesseract();
}

// No .pde counterpart — these only record that a pointer exists, for px()/py()
// and the reduced-motion gate. p5 sends mouseMoved for a free pointer and
// mouseDragged for a held one (and for every touchmove).
function mouseMoved() { pointer.seen = true; pointer.lastMove = millis(); }
function mouseDragged() { pointer.seen = true; pointer.lastMove = millis(); }

// No .pde counterpart: Processing windows do not resize. `size` is re-derived
// because the .pde sets it from width (.pde 49) in a constructor that could
// only ever run once.
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (tesseract) tesseract.size = width / 24;
}

/* ==========================================================================
   .pde 44–135 — class Tesseract
   ========================================================================== */
class Tesseract {

  /* --- .pde 48–97: the constructor. ------------------------------------- */
  constructor() {
    this.size = width / 24;  // .pde 49
    this.z = 5;              // .pde 50
    this.w = 1;              // .pde 51
    this.perspZ = 4;         // .pde 52
    this.perspW = 1;         // .pde 53

    /* .pde 46: `float mouseX, mouseY, z, w, perspZ, perspW, size;`
       THE SINGLE MOST IMPORTANT LINE IN THE FILE, and the one the 2015 hand-
       port choked on. In Processing a sketch class is an inner class of the
       PApplet, so these two fields SHADOW the sketch's global mouseX/mouseY
       inside every method of Tesseract. The constructor never assigns them, so
       in Java they are 0.0 forever — which means persp() (.pde 112–113), which
       reads `mouseX`/`mouseY`, has always been reading zero, not the cursor.

       JavaScript has no such shadowing, so the zeros have to be written down
       to be preserved. They are preserved deliberately: feeding the real
       cursor in instead multiplies a 500-ish pixel value by the projection
       factor and then by `size`, throwing the figure tens of thousands of
       pixels off screen. The zeros are what ran in 2015. */
    this.mouseX = 0;
    this.mouseY = 0;

    /* .pde 55–96: the 32 edges, verbatim, as pairs of 4D points [x,y,z,w].
       Checked, not assumed: 32 unique edges over 16 vertices, every edge
       differing in exactly one coordinate — a true tesseract. */
    var temp = [
      [[1, 1, 1, 1], [-1, 1, 1, 1]],
      [[1, 1, 1, 1], [1, -1, 1, 1]],
      [[1, 1, 1, 1], [1, 1, -1, 1]],
      [[1, 1, 1, 1], [1, 1, 1, -1]],

      [[-1, -1, 1, 1], [1, -1, 1, 1]],
      [[-1, -1, 1, 1], [-1, 1, 1, 1]],
      [[-1, -1, 1, 1], [-1, -1, -1, 1]],
      [[-1, -1, 1, 1], [-1, -1, 1, -1]],

      [[-1, 1, -1, 1], [1, 1, -1, 1]],
      [[-1, 1, -1, 1], [-1, -1, -1, 1]],
      [[-1, 1, -1, 1], [-1, 1, 1, 1]],
      [[-1, 1, -1, 1], [-1, 1, -1, -1]],

      [[-1, 1, 1, -1], [1, 1, 1, -1]],
      [[-1, 1, 1, -1], [-1, -1, 1, -1]],
      [[-1, 1, 1, -1], [-1, 1, -1, -1]],
      [[-1, 1, 1, -1], [-1, 1, 1, 1]],

      [[1, -1, -1, 1], [-1, -1, -1, 1]],
      [[1, -1, -1, 1], [1, 1, -1, 1]],
      [[1, -1, -1, 1], [1, -1, 1, 1]],
      [[1, -1, -1, 1], [1, -1, -1, -1]],

      [[1, -1, 1, -1], [-1, -1, 1, -1]],
      [[1, -1, 1, -1], [1, 1, 1, -1]],
      [[1, -1, 1, -1], [1, -1, -1, -1]],
      [[1, -1, 1, -1], [1, -1, 1, 1]],

      [[1, 1, -1, -1], [-1, 1, -1, -1]],
      [[1, 1, -1, -1], [1, -1, -1, -1]],
      [[1, 1, -1, -1], [1, 1, 1, -1]],
      [[1, 1, -1, -1], [1, 1, -1, 1]],

      [[-1, -1, -1, -1], [1, -1, -1, -1]],
      [[-1, -1, -1, -1], [-1, 1, -1, -1]],
      [[-1, -1, -1, -1], [-1, -1, 1, -1]],
      [[-1, -1, -1, -1], [-1, -1, -1, 1]]
    ];

    this.lines = temp; // .pde 96

    /* No .pde counterpart — the palette split (see GROUND/INK_* above). An
       edge is a hyper-edge if its two ends differ in w, and that has to be
       decided HERE, from the unrotated data: once turn() has run, w is no
       longer ±1 and the question is unanswerable. 8 of the 32 qualify. */
    this.hyper = temp.map(function (e) { return e[0][3] !== e[1][3]; });
  }

  /* --- .pde 99–107: turn(a, b, deg) — rotate every point in the a-b plane.
     Transcribed literally, INCLUDING its aliasing. `temp = lines[i][j]` binds
     a reference, not a copy, in Java and equally in JavaScript; so line .pde
     105's `temp[a]` reads the value line .pde 104 just wrote. The result is
     not quite a rotation:

         a' = a·cos + b·sin
         b' = b·cos − a'·sin      (a pure rotation would use the old a)

     whose determinant is cos²(deg) rather than 1, so the figure loses about
     one part in 10,000 of its scale per call and slowly contracts as it
     spins. That decay is why .pde 35–38 rebuilds the tesseract on every press.
     Copying temp would "fix" it and would not be this sketch. ------------- */
  turn(a, b, deg) {
    var temp;
    for (var j = 0; j < 2; j++)
      for (var i = 0; i < 32; i++) {
        temp = this.lines[i][j];
        this.lines[i][j][a] = temp[a] * cos(deg) + temp[b] * sin(deg);
        this.lines[i][j][b] = temp[b] * cos(deg) - temp[a] * sin(deg);
      }
  }

  /* --- .pde 109–115: persp(arr) — the projection, 4D → 2D in one pass.
     Both x and y are scaled by the same per-point factor

         1 + (z + 5)/4 + (w + 1)/1

     so depth in z AND depth in w each push a point outward from the origin:
     two nested perspectives at once, which is what makes the figure read as a
     cube inside a cube. With the coordinates at ±1 the factor takes exactly
     four values — 2, 2.5, 4, 4.5 — the four nested squares you see at rest.

     `this.mouseX`/`this.mouseY` are the shadowed zeros from the constructor;
     they are kept in the expression rather than folded away so this line still
     reads against .pde 112–113. ------------------------------------------- */
  persp(arr) {
    for (var j = 0; j < 2; j++)
      for (var i = 0; i < 32; i++) {
        arr[i][j][0] = arr[i][j][0] + (arr[i][j][0] + this.mouseX) *
          ((arr[i][j][2] + this.z) / this.perspZ + (arr[i][j][3] + this.w) / this.perspW);
        arr[i][j][1] = arr[i][j][1] + (arr[i][j][1] + this.mouseY) *
          ((arr[i][j][2] + this.z) / this.perspZ + (arr[i][j][3] + this.w) / this.perspW);
      }
  }

  /* --- .pde 117–122: resize(arr) — scale to pixels. ---------------------- */
  resize(arr) {
    for (var i = 0; i < 32; i++)
      for (var j = 0; j < 2; j++)
        for (var k = 0; k < 4; k++)
          arr[i][j][k] *= this.size;
  }

  /* --- .pde 124–134: display() — deep-copy, project, scale, stroke.
     The copy (.pde 125–129) is the point: persp() and resize() both mutate in
     place, so they must never touch this.lines, which carries the orientation
     from frame to frame. Java's `new float[32][2][4]` becomes an explicit
     nested map here.

     The one addition is the stroke colour per edge, from this.hyper. ------ */
  display() {
    var temp = this.lines.map(function (edge) {
      return edge.map(function (pt) { return pt.slice(); });
    });
    this.persp(temp);   // .pde 130
    this.resize(temp);  // .pde 131
    for (var i = 0; i < 32; i++) {
      stroke(this.hyper[i] ? INK_HYPER : INK_CUBE);
      line(temp[i][0][0], temp[i][0][1], temp[i][1][0], temp[i][1][1]); // .pde 133
    }
  }
}
