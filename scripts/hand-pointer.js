/* Hand pointer — the webcam as a pen, and a hand's presence over the water.
 *
 * index.html's tank and design.html's blueprint take strokes from the mouse.
 * This turns a hand in front of the webcam into that mouse: the point between
 * thumb and index fingertip is the nib, a pinch puts the pen down, opening the
 * fingers lifts it. It dispatches ordinary MouseEvents at the canvas, so a
 * hand-drawn loop goes through the SAME startDraw/draw/endDraw path a mouse
 * does: same recognizer, same fish, same walls, same whispers. Neither page's
 * stroke routing changes. Hovering moves the cursor too, so the tank's glow,
 * the page spotlight and anything else that follows the mouse follow the hand.
 *
 * One scale. The camera's frame maps onto the canvas at one scale on both
 * axes (a circle drawn is a circle received), and the drawn hand is the
 * camera's hand at that same scale: nearer the camera it grows, further away
 * it shrinks, and the strokes it makes grow and shrink with it. A small hand
 * on screen is a fine pen; a big one sweeps.
 *
 * Steady ink. Every landmark runs through a One Euro filter (still when the
 * hand is slow, quick when it moves; the pinch reads the raw fingertips, so it
 * stays quick), and the ink follows the nib on a short string, so the tremor
 * inside the string never reaches the stroke. A stroke
 * starts where the pinch began closing and the pen holds still while the
 * fingers part to lift, so neither end draws a hook.
 *
 * Two hands. One hand draws. A second hand in view scrolls the page: pinch
 * and the page follows it, the way a finger drags a touchscreen, and let go
 * mid-move to fling it. The hand drawing stays the pen and the other scrolls,
 * each followed by its wrist; two arriving at once, the one on your right
 * draws; the pen hand gone, the scroll hand picks up the pen. A hand that
 * takes up the pen opens once before it can draw, so a hand that was holding
 * the page never starts a stroke. The scroll hand's height is read from the
 * camera alone, so the page moving under it cannot feed back into it.
 *
 * Presence: a fixed overlay draws a ghost of the hand (its 21 joints as line
 * art) and the nib itself: an open ring that closes as the fingers approach,
 * like a pen nearing paper, and a gold point while it is down. The pinch is
 * visible before it happens.
 *
 * Opt-in only. Nothing loads until the visitor turns it on: then the camera
 * (getUserMedia) and MediaPipe's hand landmarker (WASM + a 7.8 MB model, from
 * jsDelivr and Google's model bucket). Every frame stays on the device. A small
 * mirrored preview shows the camera is on from the moment it opens, with a
 * camera picker and an off switch that are still there after the hero has
 * scrolled away; off stops the tracks.
 *
 * Which camera: the one the visitor picked last time (localStorage
 * `jh-hand-camera`), else the system's default. The request names a device
 * and nothing else: a size or frame-rate wish makes the browser rank every
 * camera against it, and a virtual camera offering 60 fps beat the real one
 * (2026-10-22). The size is raised afterwards on the camera already chosen.
 *
 * Declarative: an <input type="checkbox" data-hand-pointer="#heroCanvas"> is
 * wired on load (its label shown on a mouse device with a camera API, and only
 * there does the command bar learn "Draw with your hand"). Or by hand:
 * JHHandPointer.attach(canvas).start(). `feed(landmarks, tMs)` is the seam the
 * suite drives (Agent Reference/maze-tests/handpointertest.mjs): synthetic
 * hands in, real strokes out, with no camera.
 */
(function () {
    'use strict';

    const MP_VERSION = '0.10.14';
    const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
    const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

    const T = {
        // The part of the camera frame that maps onto the canvas. A hand
        // rarely reaches the frame's edges (or its foot, under the desk). One
        // scale on both axes, as large as the canvas needs: the box covers the
        // canvas, centred, and a nib past an edge stays on it.
        BOX: { x0: 0.12, x1: 0.88, y0: 0.08, y1: 0.72 },
        // Pinch = thumb-index gap over the palm's size. Hysteresis: closing past
        // DOWN puts the pen down, opening past UP lifts it. Between them the pen
        // holds still, so the fingers parting to lift draw nothing.
        DOWN: 0.24,
        UP: 0.36,
        OPEN: 0.9,       // the ring is widest at this gap
        SETTLE: 2,       // frames the pinch must agree before the pen changes
        LOST_MS: 180,    // a hand missing this long lifts the pen and leaves
        STEP: 10,        // px: longer moves between frames are filled in
        // The drawn hand: the camera's hand at the canvas's scale, times GHOST.
        // Its palm (wrist to middle knuckle) stays within GHOST_MIN px and
        // GHOST_MAX of the canvas's height.
        GHOST: 0.7,
        GHOST_MIN: 40,
        GHOST_MAX: 0.24,
        // One Euro filter (Casiez et al. 2012) on every landmark, in frame
        // units: MIN_CUTOFF Hz when still, BETA more per frame-width a second.
        MIN_CUTOFF: 0.9,
        BETA: 12,
        // px: the ink follows the nib on a string this long (a lazy brush)
        STRING: 8,
        // The second hand scrolls. Pinched, the page follows it, SCROLL_GAIN
        // screens for a sweep of the box's height; let go, it coasts on,
        // slowing by FLING_DECAY a second until it is under FLING_MIN px a second.
        SCROLL_GAIN: 1.5,
        FLING_DECAY: 4,
        FLING_MIN: 40,
    };

    // MediaPipe's bundle, loaded once. A failed import() is cached by the
    // browser for that URL, so a retry asks under a new one: one dropped
    // download no longer means no hand until a reload.
    let bundleP = null, bundleTries = 0;
    function bundle() {
        if (!bundleP) {
            const url = `${MP_BASE}/vision_bundle.mjs` + (bundleTries++ ? `?retry=${bundleTries}` : '');
            bundleP = import(url).catch(e => { bundleP = null; throw e; });
        }
        return bundleP;
    }

    // The camera the visitor picked, kept for next time
    const CAM_KEY = 'jh-hand-camera';
    const savedCam = () => { try { return localStorage.getItem(CAM_KEY) || ''; } catch (e) { return ''; } };
    const saveCam = id => { try { localStorage.setItem(CAM_KEY, id); } catch (e) { /* private window */ } };
    // A device and nothing else (see the header): an unplugged one falls back to the default
    async function openCamera(id) {
        if (id) {
            try { return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id } }, audio: false }); }
            catch (e) { if (e.name !== 'OverconstrainedError' && e.name !== 'NotFoundError') throw e; }
        }
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

    function oneEuro(minCutoff, beta, dCutoff = 1) {
        let x = null, dx = 0, last = 0;
        const alpha = (cut, dt) => { const r = 2 * Math.PI * cut * dt; return r / (r + 1); };
        return {
            filter(v, t) {
                if (x === null) { x = v; last = t; return v; }
                const dt = Math.max(0.001, (t - last) / 1000);
                last = t;
                dx += alpha(dCutoff, dt) * ((v - x) / dt - dx);
                x += alpha(minCutoff + beta * Math.abs(dx), dt) * (v - x);
                return x;
            },
            reset() { x = null; dx = 0; },
        };
    }

    // Everything the pinch read needs from 21 landmarks: the nib (between the
    // fingertips, so it holds still as they close), the gap, the hand's size.
    // The size is the palm's length or, when the hand tips toward the camera
    // and its length foreshortens, its width: a tilted hand neither shrinks on
    // screen nor reads as a pinch. Pure, so the suite can check the read.
    function readHand(lm, aspect) {
        const P = i => ({ x: (1 - lm[i].x) * aspect, y: lm[i].y });   // mirrored, square units
        const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const scale = Math.max(1e-4, d(P(0), P(9)), 1.25 * d(P(5), P(17)));
        return {
            nib: { u: 1 - (lm[4].x + lm[8].x) / 2, v: (lm[4].y + lm[8].y) / 2 },
            pinch: d(P(4), P(8)) / scale,
            scale,
        };
    }

    function attach(canvas, options = {}) {
        if (!canvas) return null;
        const o = Object.assign({}, T, options);
        let on = false, landmarker = null, stream = null, raf = 0, runs = 0;
        let lastVideoTime = -1, aspect = 4 / 3, fade = 0, sFade = 0;
        // The pen hand: present, its pen down or up, the vote that changes it,
        // and `armed`, which a hand earns by opening once before it may draw
        let present = false, down = false, vote = 0, armed = false;
        let pen = null, onset = null, sent = null;
        // The scroll hand: present, gripping the page or not, and the coast after
        let sPresent = false, grab = false, sVote = 0, sArmed = false;
        let sY = 0, sT = 0, vel = 0, fling = 0, flingT = 0;
        const listeners = new Set();
        let status = 'off';

        // ---- the overlay: ghost hand + nib, above the water, under the nav
        const layer = document.createElement('canvas');
        layer.className = 'hand-layer';
        layer.setAttribute('aria-hidden', 'true');
        const lctx = layer.getContext('2d');
        let ink = {};
        function readInk() {
            const cs = getComputedStyle(document.documentElement);
            const v = (n, f) => (cs.getPropertyValue(n) || '').trim() || f;
            ink = { line: v('--cyan-dim', '#4dc9f6'), nib: v('--cyan', '#b2e8fa'), down: v('--gold', '#d4af37') };
        }
        function sizeLayer() {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            layer.width = Math.round(innerWidth * dpr);
            layer.height = Math.round(innerHeight * dpr);
            layer.style.width = innerWidth + 'px';
            layer.style.height = innerHeight + 'px';
            lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        // ---- the HUD: mirrored preview, one line of status, the camera, an off switch
        const hud = document.createElement('div');
        hud.className = 'hand-hud';
        hud.innerHTML = '<video muted playsinline></video>' +
            '<span class="hand-hud-note" role="status"></span>' +
            '<div class="hand-hud-row"><select class="hand-hud-cam" aria-label="Camera" hidden></select>' +
            '<button type="button" class="hand-hud-off" aria-label="Turn the webcam off">off</button></div>';
        const video = hud.querySelector('video');
        const note = hud.querySelector('.hand-hud-note');
        const pick = hud.querySelector('.hand-hud-cam');
        hud.querySelector('.hand-hud-off').addEventListener('click', () => stop());
        pick.addEventListener('change', () => useCamera(pick.value));
        function say(s, text) {
            status = s;
            note.textContent = text;
            hud.dataset.state = s;
            listeners.forEach(f => { try { f(s, text); } catch (e) { /* a listener's problem */ } });
        }
        const ONE = 'pinch to draw · open to lift · a second hand scrolls';
        const TWO = 'one hand draws · the other pinches and drags to scroll';

        // The canvas's visible part: where the box maps. Null when it has
        // scrolled away, and the hand then only shows, it does not draw.
        function area() {
            const r = canvas.getBoundingClientRect();
            const x0 = Math.max(r.left, 0), y0 = Math.max(r.top, 0);
            const x1 = Math.min(r.right, innerWidth), y1 = Math.min(r.bottom, innerHeight);
            if (x1 - x0 < 80 || (y1 - y0) < Math.min(200, r.height * 0.3)) return null;
            return { x0, y0, x1, y1 };
        }
        // The map from the camera's square units to screen px: one gain `g`,
        // the box's centre on the area's centre.
        function frame() {
            const a = area() || { x0: 0, y0: 0, x1: innerWidth, y1: innerHeight };
            const b = o.BOX;
            const g = Math.max((a.x1 - a.x0) / ((b.x1 - b.x0) * aspect), (a.y1 - a.y0) / (b.y1 - b.y0));
            return { a, g, cx: (b.x0 + b.x1) / 2 * aspect, cy: (b.y0 + b.y1) / 2, mx: (a.x0 + a.x1) / 2, my: (a.y0 + a.y1) / 2 };
        }
        function toScreen(u, v, f = frame()) {
            const x = f.mx + (u * aspect - f.cx) * f.g, y = f.my + (v - f.cy) * f.g;
            return { x: Math.min(f.a.x1, Math.max(f.a.x0, x)), y: Math.min(f.a.y1, Math.max(f.a.y0, y)) };
        }
        // Where a nib (mirrored u, v) lands at screen point (x, y): the suite's way in
        function fromScreen(x, y, f = frame()) {
            return { u: ((x - f.mx) / f.g + f.cx) / aspect, v: (y - f.my) / f.g + f.cy };
        }

        // One tracked hand: its landmark filters and what was last read from it.
        // Where it is, smoothed hard; whether it pinches, read from the raw
        // fingertips and smoothed lightly: a pinch is a small, quick move the
        // landmark filter would hold back for frames.
        function hand() {
            const lmf = Array.from({ length: 21 }, () => [oneEuro(o.MIN_CUTOFF, o.BETA), oneEuro(o.MIN_CUTOFF, o.BETA)]);
            const fp = oneEuro(8, 0);
            return {
                lm: null, nib: null, v: 0, pinch: 1, palm: 0, wrist: null, seen: 0,
                read(marks, t) {
                    this.seen = t;
                    this.lm = marks.map((p, i) => ({ x: lmf[i][0].filter(p.x, t), y: lmf[i][1].filter(p.y, t) }));
                    const h = readHand(this.lm, aspect), f = frame();
                    this.nib = toScreen(h.nib.u, h.nib.v, f);
                    this.v = h.nib.v;
                    this.pinch = fp.filter(readHand(marks, aspect).pinch, t);
                    this.palm = Math.min(o.GHOST_MAX * (f.a.y1 - f.a.y0), Math.max(o.GHOST_MIN, h.scale * f.g * o.GHOST));
                    this.wrist = { u: 1 - marks[0].x, v: marks[0].y };
                },
                reset() {
                    lmf.forEach(([fx, fy]) => { fx.reset(); fy.reset(); });
                    fp.reset();
                    this.lm = null; this.nib = null; this.wrist = null; this.pinch = 1;
                },
            };
        }
        let P = hand(), S = hand();      // the pen hand and the scroll hand

        function mouse(type, p) {
            canvas.dispatchEvent(new MouseEvent(type, {
                clientX: p.x, clientY: p.y, bubbles: type !== 'mouseenter' && type !== 'mouseleave',
                cancelable: true, view: window, button: 0, buttons: down ? 1 : 0,
            }));
        }
        function moveTo(p) {
            if (sent && down) {
                // Fill long hops so a fast loop keeps its crossing
                const n = Math.floor(Math.hypot(p.x - sent.x, p.y - sent.y) / o.STEP);
                for (let i = 1; i < n; i++) {
                    mouse('mousemove', { x: sent.x + (p.x - sent.x) * i / n, y: sent.y + (p.y - sent.y) * i / n });
                }
            }
            mouse('mousemove', p);
            sent = p;
        }
        // The ink moves only when the nib pulls its string taut
        function follow() {
            const dx = P.nib.x - pen.x, dy = P.nib.y - pen.y, d = Math.hypot(dx, dy);
            if (d <= o.STRING) return;
            const k = (d - o.STRING) / d;
            pen = { x: pen.x + dx * k, y: pen.y + dy * k };
            moveTo(pen);
        }
        function penUp() {
            if (!down) return;
            down = false;
            mouse('mouseup', sent || pen || P.nib);
        }
        function leave() {
            penUp();
            if (present && sent) mouse('mouseleave', sent);
            present = false; sent = null; pen = null; onset = null; vote = 0; armed = false;
            P.reset();
        }
        // A hand takes up the pen: it says so, and opens before it can draw
        function enter(live) {
            present = true; armed = false;
            if (live) mouse('mouseenter', P.nib);
            say('track', sPresent ? TWO : ONE);
        }

        // One frame of tracking: no hand, one hand's 21 landmarks, or a list of
        // up to two hands (MediaPipe's `landmarks`). The suite's seam.
        //
        // Which hand is which: the hand drawing stays the pen and the other
        // scrolls (each by its wrist, nearest to where it was). Two arriving at
        // once: the one on your right draws. The pen hand gone, the scroll hand
        // picks up the pen.
        function feed(input, t) {
            const hands = !input || !input.length ? [] : Array.isArray(input[0]) ? input.slice(0, 2) : [input];
            const near = (m, h) => h.wrist ? Math.hypot(1 - m[0].x - h.wrist.u, m[0].y - h.wrist.v) : Infinity;
            let pm = null, sm = null;
            if (hands.length === 2) {
                const [a, b] = hands;
                const aPens = present ? near(a, P) <= near(b, P)
                    : sPresent ? near(a, S) > near(b, S)
                    : (1 - a[0].x) >= (1 - b[0].x);
                [pm, sm] = aPens ? [a, b] : [b, a];
            } else if (hands.length === 1) {
                const m = hands[0];
                if (present && sPresent) { if (near(m, P) <= near(m, S)) pm = m; else sm = m; }
                else if (sPresent) sm = m;
                else pm = m;
            }
            if (pm) penFrame(pm, t);
            else if (present && t - P.seen > o.LOST_MS) {
                leave();
                if (sPresent && t - S.seen <= o.LOST_MS) promote();
                else if (on) say('seek', 'show your hand to the camera');
            }
            if (sm) scrollFrame(sm, t);
            else if (sPresent && t - S.seen > o.LOST_MS) scrollLeave(true, t);
        }

        function penFrame(marks, t) {
            P.read(marks, t);
            const live = !!area();
            if (!present) enter(live);
            if (!live) { penUp(); return; }
            if (P.pinch > o.UP) armed = true;
            // The pen changes only when SETTLE frames in a row agree. The nib
            // where they began agreeing is where a stroke starts.
            const want = down ? P.pinch < o.UP : armed && P.pinch < o.DOWN;
            if (want === down) vote = 0;
            else if (vote++ === 0) onset = P.nib;
            if (vote >= o.SETTLE) {
                vote = 0;
                if (want) {
                    moveTo(onset);
                    down = true; pen = onset;
                    mouse('mousedown', pen);
                    follow();
                    return;
                }
                penUp();
            }
            if (!down) { pen = P.nib; moveTo(P.nib); return; }
            // Drawing: the pen holds while the fingers part, else follows
            if (P.pinch < o.DOWN) follow();
        }

        // The scroll hand's height in px, read from the camera alone: the page
        // moving under it must not move it
        const handY = () => S.v * innerHeight / (o.BOX.y1 - o.BOX.y0);
        // Pinched, the page follows the hand (up moves it up); let go, it coasts
        function scrollFrame(marks, t) {
            S.read(marks, t);
            if (!sPresent) { sPresent = true; sArmed = false; say('track', TWO); }
            if (S.pinch > o.UP) sArmed = true;
            const want = grab ? S.pinch < o.UP : sArmed && S.pinch < o.DOWN;
            if (want === grab) sVote = 0;
            else sVote++;
            if (sVote >= o.SETTLE) {
                sVote = 0;
                grab = want;
                if (grab) { sY = handY(); sT = t; vel = 0; fling = 0; return; }
                release(t);
            }
            if (!grab) return;
            const y = handY(), dt = Math.max(1, t - sT) / 1000;
            const d = -(y - sY) * o.SCROLL_GAIN;
            if (d) window.scrollBy({ top: d, behavior: 'instant' });
            vel += (d / dt - vel) * 0.5;      // px a second, lightly smoothed, for the coast
            sY = y; sT = t;
        }
        function release(t) {
            grab = false;
            fling = Math.abs(vel) > o.FLING_MIN ? vel : 0;
            flingT = t;
        }
        function scrollLeave(coast, t) {
            if (grab && coast) release(t);
            else if (!coast) fling = 0;
            grab = false; sVote = 0; sArmed = false; sPresent = false;
            S.reset();
            if (present && on) say('track', ONE);
        }
        // The scroll hand picks up the pen: its filters carry on, it opens first
        function promote() {
            [P, S] = [S, P];
            grab = false; sVote = 0; sArmed = false; sPresent = false; fling = 0;
            S.reset();
            enter(!!area());
        }
        // A fling slows to a stop; the wheel or a new grip stops it at once
        function coast(now) {
            if (!fling) return;
            const dt = Math.min(0.05, Math.max(0, now - flingT) / 1000);
            flingT = now;
            window.scrollBy({ top: fling * dt, behavior: 'instant' });
            fling *= Math.exp(-o.FLING_DECAY * dt);
            if (Math.abs(fling) < o.FLING_MIN) fling = 0;
        }
        function onWheel() { fling = 0; }

        // A hand's 21 joints as line art around its nib, at its palm's size
        function ghost(h, alpha) {
            const g = readHand(h.lm, aspect);
            const k = h.palm / g.scale;
            const nibSq = { x: g.nib.u * aspect, y: g.nib.v };
            const pts = h.lm.map(p => ({
                x: h.nib.x + ((1 - p.x) * aspect - nibSq.x) * k,
                y: h.nib.y + (p.y - nibSq.y) * k,
            }));
            lctx.save();
            lctx.globalAlpha = alpha;
            lctx.strokeStyle = ink.line;
            lctx.lineWidth = 1.25;
            lctx.lineCap = 'round';
            lctx.beginPath();
            for (const [a, b] of BONES) { lctx.moveTo(pts[a].x, pts[a].y); lctx.lineTo(pts[b].x, pts[b].y); }
            lctx.stroke();
            lctx.fillStyle = ink.line;
            const r = Math.max(1.5, h.palm / 50);
            for (const p of pts) { lctx.beginPath(); lctx.arc(p.x, p.y, r, 0, Math.PI * 2); lctx.fill(); }
            lctx.restore();
            return pts;
        }

        function paint() {
            lctx.clearRect(0, 0, innerWidth, innerHeight);
            // The pen hand, over the water only: scrolled into the content it stays out of the way
            fade += ((present && area() ? 1 : 0) - fade) * 0.2;
            if (fade >= 0.02 && P.lm && P.nib) paintPen();
            // The scroll hand anywhere, so it can bring the water back
            sFade += ((sPresent ? 1 : 0) - sFade) * 0.2;
            if (sFade >= 0.02 && S.lm && S.nib) paintScroll();
        }
        function paintPen() {
            const pts = ghost(P, 0.38 * fade);
            const nib = P.nib;
            // The pincer: thumb tip to index tip, brighter as it closes
            const close = Math.min(1, Math.max(0, (o.OPEN - P.pinch) / (o.OPEN - o.DOWN)));
            lctx.save();
            lctx.globalAlpha = (0.25 + 0.5 * close) * fade;
            lctx.strokeStyle = down ? ink.down : ink.nib;
            lctx.lineWidth = 1.25;
            lctx.beginPath(); lctx.moveTo(pts[4].x, pts[4].y); lctx.lineTo(pts[8].x, pts[8].y); lctx.stroke();
            lctx.restore();

            lctx.save();
            lctx.globalAlpha = fade;
            if (down && pen) {
                // The string, when the hand has pulled ahead of the ink
                if (Math.hypot(nib.x - pen.x, nib.y - pen.y) > 2) {
                    lctx.globalAlpha = 0.5 * fade;
                    lctx.strokeStyle = ink.down; lctx.lineWidth = 1;
                    lctx.beginPath(); lctx.moveTo(pen.x, pen.y); lctx.lineTo(nib.x, nib.y); lctx.stroke();
                    lctx.globalAlpha = fade;
                }
                lctx.shadowColor = ink.down; lctx.shadowBlur = 14;
                lctx.fillStyle = ink.down;
                lctx.beginPath(); lctx.arc(pen.x, pen.y, 4.5, 0, Math.PI * 2); lctx.fill();
            } else {
                // The ring closes on the nib as the fingers approach
                const r = 5 + 19 * (1 - close);
                lctx.strokeStyle = ink.nib; lctx.lineWidth = 1.5;
                lctx.beginPath(); lctx.arc(nib.x, nib.y, r, 0, Math.PI * 2); lctx.stroke();
                lctx.fillStyle = ink.nib;
                lctx.beginPath(); lctx.arc(nib.x, nib.y, 1.5, 0, Math.PI * 2); lctx.fill();
            }
            lctx.restore();
        }
        // The scroll hand wears a grip: a ring between two chevrons, gold while it holds the page
        function paintScroll() {
            ghost(S, 0.26 * sFade);
            const { x, y } = S.nib;
            const c = grab ? ink.down : ink.nib;
            lctx.save();
            lctx.globalAlpha = sFade;
            lctx.strokeStyle = c; lctx.fillStyle = c; lctx.lineWidth = 1.5;
            lctx.lineCap = 'round'; lctx.lineJoin = 'round';
            lctx.beginPath(); lctx.arc(x, y, grab ? 6 : 9, 0, Math.PI * 2);
            if (grab) { lctx.shadowColor = c; lctx.shadowBlur = 12; lctx.fill(); lctx.shadowBlur = 0; } else lctx.stroke();
            const gap = grab ? 20 : 17;
            for (const s of [-1, 1]) {
                lctx.beginPath();
                lctx.moveTo(x - 6, y + s * gap); lctx.lineTo(x, y + s * (gap + 6)); lctx.lineTo(x + 6, y + s * gap);
                lctx.stroke();
            }
            lctx.restore();
        }

        function loop() {
            raf = requestAnimationFrame(loop);
            const now = performance.now();
            if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                if (video.videoWidth) aspect = video.videoWidth / video.videoHeight;
                let res = null;
                try { res = landmarker.detectForVideo(video, now); } catch (e) { /* a dropped frame */ }
                feed(res && res.landmarks, now);
            } else if ((present || sPresent) && !landmarker) {
                feed(null, now);     // driven by feed(): lost hands still leave
            }
            coast(now);
            paint();
        }

        async function load() {
            const vision = await bundle();
            const files = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
            const make = delegate => vision.HandLandmarker.createFromOptions(files, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate },
                runningMode: 'VIDEO', numHands: 2,
                minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5,
            });
            try { return await make('GPU'); } catch (e) { return make('CPU'); }
        }

        // A granted camera goes on screen at once, so the visitor sees which one
        // it is while the model loads, then asks for a larger frame on that same
        // device: more pixels on a far hand, so its landmarks shake less.
        function showCamera(s) {
            stream = s;
            video.srcObject = s;
            video.play().catch(() => { /* it plays once the page may */ });
            const track = s.getVideoTracks()[0];
            if (track && track.applyConstraints) track.applyConstraints({ width: { ideal: 1280 }, height: { ideal: 720 } }).catch(() => {});
            listCameras();
        }
        // The picker: every camera, the one in use chosen; shown when there is a choice
        async function listCameras() {
            if (!stream) return;
            let cams = [];
            try { cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) { /* none to list */ }
            const track = stream && stream.getVideoTracks()[0];
            const id = track && track.getSettings ? track.getSettings().deviceId : '';
            pick.textContent = '';
            cams.forEach((c, i) => pick.add(new Option(c.label || `camera ${i + 1}`, c.deviceId, false, c.deviceId === id)));
            pick.hidden = cams.length < 2;
        }
        // Another camera, picked while on; kept for next time
        async function useCamera(id) {
            const run = runs;
            let s;
            try { s = await openCamera(id); } catch (e) { note.textContent = 'that camera would not start'; listCameras(); return; }
            if (!on || run !== runs) { s.getTracks().forEach(t => t.stop()); return; }
            if (stream) stream.getTracks().forEach(t => t.stop());
            saveCam(id);
            leave(); scrollLeave(false);      // a new view: the filters start again
            showCamera(s);
        }

        function mount() {
            readInk(); sizeLayer();
            document.body.append(layer, hud);
            addEventListener('resize', sizeLayer);
            addEventListener('jh-theme-change', readInk);
            addEventListener('wheel', onWheel, { passive: true });
            document.addEventListener('visibilitychange', onVisible);
            if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', listCameras);
            if (!raf) loop();
        }
        function onVisible() { if (document.hidden) { if (present) leave(); if (sPresent) scrollLeave(false); } }

        // Start with camera + model; `{ camera: false }` mounts the overlay
        // alone, for feed()-driven tests.
        async function start(opts = {}) {
            if (on) return api;
            on = true;
            mount();
            if (opts.camera === false) { say('track', 'feeding'); return api; }
            say('load', 'starting camera…');
            const run = ++runs;
            const current = () => on && run === runs;
            try {
                // The camera is kept (and shown) the moment it is granted, so stop()
                // ends it even while the model still loads; one granted after this
                // start was abandoned is stopped at once. Nothing is left on when
                // either fails.
                const [cam, model] = await Promise.allSettled([
                    openCamera(savedCam()).then(s => { if (current()) showCamera(s); else s.getTracks().forEach(t => t.stop()); return s; }),
                    (say('load', 'loading hand model…'), load()),
                ]);
                const drop = () => { if (model.status === 'fulfilled') { try { model.value.close(); } catch (e) { /* gone */ } } };
                if (!current()) { drop(); return api; }
                if (cam.status === 'rejected' || model.status === 'rejected') { drop(); throw cam.status === 'rejected' ? cam.reason : model.reason; }
                landmarker = model.value;
                say('seek', 'show your hand to the camera');
            } catch (e) {
                if (!current()) return api;
                const blocked = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
                say('error', blocked ? 'camera blocked: allow it in the address bar' : 'hand tracking could not start');
                console.warn('hand-pointer:', e);
                stop(true);
            }
            return api;
        }

        // Off. `keepNote` leaves an error on screen for a few seconds.
        function stop(keepNote) {
            on = false;
            leave(); scrollLeave(false);
            if (stream) stream.getTracks().forEach(t => t.stop());
            stream = null;
            video.srcObject = null;
            pick.hidden = true;
            if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) navigator.mediaDevices.removeEventListener('devicechange', listCameras);
            if (landmarker) { try { landmarker.close(); } catch (e) { /* gone */ } }
            landmarker = null; lastVideoTime = -1;
            cancelAnimationFrame(raf); raf = 0;
            lctx.clearRect(0, 0, layer.width, layer.height);
            layer.remove();
            removeEventListener('resize', sizeLayer);
            removeEventListener('jh-theme-change', readInk);
            removeEventListener('wheel', onWheel);
            document.removeEventListener('visibilitychange', onVisible);
            if (keepNote) {
                say(status, note.textContent);       // listeners see `on` is false
                setTimeout(() => { if (!on) hud.remove(); }, 4000);
            } else { hud.remove(); say('off', ''); }
            return api;
        }

        const api = {
            start, stop, feed, fromScreen,
            get on() { return on; },
            get down() { return down; },
            get status() { return status; },
            get nib() { return P.nib && { x: P.nib.x, y: P.nib.y }; },
            get pen() { return pen && { x: pen.x, y: pen.y }; },
            get palm() { return P.palm; },
            get hands() { return (present ? 1 : 0) + (sPresent ? 1 : 0); },
            get scrolling() { return grab; },
            get coasting() { return !!fling; },
            setAspect(a) { aspect = a; },
            onStatus(f) { listeners.add(f); return () => listeners.delete(f); },
        };
        return api;
    }

    // An <input type="checkbox" data-hand-pointer="#canvas"> in its label: the
    // label shows where it can work (a mouse device with a camera API; a coarse
    // pointer has a finger on the glass already), checked while the camera is on.
    function wire() {
        const can = !matchMedia('(pointer: coarse)').matches && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        document.querySelectorAll('input[data-hand-pointer]').forEach(input => {
            const label = input.closest('label') || input;
            if (!can) { label.hidden = true; return; }
            const hp = attach(document.querySelector(input.dataset.handPointer));
            if (!hp) return;
            input._handPointer = hp;
            hp.onStatus(() => { input.checked = hp.on; });
            input.addEventListener('change', () => { input.checked ? hp.start() : hp.stop(); });
            (window.JH_COMMANDS = window.JH_COMMANDS || []).push({
                id: 'hand.draw', title: 'Draw with your hand',
                detail: 'Your webcam as a pen: pinch to draw, open to lift; a second hand pinches and drags to scroll',
                tags: 'webcam camera hand gesture draw pinch tracking air pen presence two hands scroll',
                hints: ['draw with my hand', 'use the webcam to draw', 'hand tracking'],
                run: () => { input.checked = !input.checked; input.dispatchEvent(new Event('change')); },
            });
        });
    }

    window.JHHandPointer = { attach, readHand, T };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
})();
