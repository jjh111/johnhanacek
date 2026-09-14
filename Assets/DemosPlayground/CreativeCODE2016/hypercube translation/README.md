# hypercube translation/

Three files, two of them a pair and one of them a relic.

| File | What it is |
|------|------------|
| `port.html` + `port.js` | **The running port**, 2026-09-14. A faithful p5.js translation of `../hypercube_processing/hypercube_processing.pde`. Open `port.html`. |
| `index.html` + `sketch.js` | **John's 2015 hand-port, unfinished — do not edit.** It is the artefact: a snapshot of the translation stalling. It has never been valid JavaScript and nothing can make it run. |

The 2015 file stalls in a way worth keeping: it still carries a Java
constructor inside a JS function (`Tesseract(){ … }`), a Processing type
declaration (`float (mouseX, mouseY, z, w, perspZ, perspW, size)`), typed
parameters (`function turn(var a, var b, float deg)`), `void display()`, and
the 32 edge pairs half-replaced by 16 Processing-style keyed literals
(`[ x: 1, y: 1, z: 1, w: 1 ]`) that were never wired up. The port beside it is
a fresh translation of the .pde, not a patch of this.

## What the port carries over

`port.js` names the .pde line range it ports in every block. The three things
that actually decide whether a port of this sketch is right:

1. **`persp()` has always read zero, not the cursor** (.pde 46, 112–113). The
   `Tesseract` class declares its own `float mouseX, mouseY` fields, and in
   Processing a sketch class is an inner class of the PApplet, so those fields
   *shadow* the global `mouseX`/`mouseY` inside every method. They are never
   assigned, so they are 0.0 forever. JavaScript has no such shadowing, so the
   zeros are written down explicitly. Feeding the real cursor in instead throws
   the figure tens of thousands of pixels off screen — which is exactly the
   line the 2015 hand-port could not resolve.

2. **`turn()` aliases, so it is not quite a rotation** (.pde 99–107).
   `temp = lines[i][j]` binds a reference, in Java and equally in JS, so the
   second assignment reads the value the first just wrote. The determinant is
   `cos²(deg)`, not 1, and the figure quietly contracts as it spins — which is
   why `mousePressed()` rebuilds it (.pde 35–38). Transcribed as-is; "fixing"
   it would be a different sketch.

3. **The mouse is the control panel that never got built.** The six commented-
   out toggles in `setup()` (.pde 9–14) are labelled XY XZ YZ XW YW ZW, and the
   six mouse branches in `draw()` (.pde 27–32) drive those same six planes in
   that same order. Pointer left of centre → XY, above → XZ, right → XW, below
   → YW, and the two midlines → YZ and ZW. They stack.

## Liberties taken

- **Palette.** The .pde is white on black with one stroke colour. The port
  links `styles/jh-chrome.css` and reads `--sea-deep` for the ground, `--cyan`
  for the 24 edges inside a cube and `--gold` for the 8 that cross w. The split
  is the .pde's own data read out loud, computed once at construction (after a
  `turn()`, w is no longer ±1 and the question is unanswerable).
- **Responsive canvas.** `size(1000,1000)` → `createCanvas(windowWidth,
  windowHeight)` + `windowResized()`, which re-derives `size` because the .pde
  set it from `width` in a constructor that could only run once. The formula
  stays `width/24`, so the figure keeps the original's proportion against the
  window's width at every size.
- **`500` → `width/2` / `height/2`**, which is what 500 meant on a fixed
  1000×1000 window. And `mouseY == 500` / `mouseX == 500` compare *rounded*
  values: Processing's `mouseX` is an int, p5's is a float, so without that the
  YZ and ZW branches would be unreachable and two of the six planes dead.
- **Opens at the canvas centre.** p5 (like Processing) reports `mouseX/mouseY`
  as 0,0 until the pointer first moves, which would open the sketch with the
  cube pinned into the top-left corner — fine in 2015 when your hand was
  already on the mouse, not fine in a playground card that may never be
  pointed at. The centre is not an invented state: it is .pde 29 + 32, the spot
  where YZ and ZW spin alone.
- **`prefers-reduced-motion`.** No .pde counterpart. Under it, the six `turn()`
  calls run only while the pointer is moving, so the sketch never spins on its
  own; everything else is unchanged.
- **Touch.** No code. p5 0.5.14 routes `touchstart` → `mousePressed` and
  `touchmove` → `mouseDragged` whenever no touch handler is defined, and writes
  touch coordinates into `mouseX`/`mouseY`. Defining `touchStarted()` would
  *replace* that routing, not add to it — which is also why the .pde's empty
  `mouseReleased()` (.pde 40–42) is deliberately not ported.
- **p5.dom and p5.sound are not loaded.** The sketch uses neither, and
  p5.sound logs an AudioContext failure on a machine with no audio device.
  p5 itself is `../p5.min.js` — v0.5.14, the copy that actually lives in
  `CreativeCODE2016/`, same relative path the four sibling sketches were
  repaired onto on 2026-09-10. No CDN, so this folder keeps working offline.

## Verified

Headless Chromium, `port.html` at 1440×900 and 390×844: zero console errors,
zero page errors, zero failed requests after 3 s; canvas is the window size;
32 edges over 16 vertices with 8 crossing w; pixels painted; a pointer drag
changes the frame. Separately: reduced motion freezes the idle and still spins
on pointer movement, the default does auto-rotate, and a touch tap rebuilds the
tesseract with no page errors.
