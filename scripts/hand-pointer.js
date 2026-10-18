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
 * Presence: a fixed overlay draws a ghost of the hand (its 21 joints as line
 * art, at a constant size around the nib) and the nib itself: an open ring
 * that closes as the fingers approach, like a pen nearing paper, and a gold
 * point while it is down. The pinch is visible before it happens.
 *
 * Opt-in only. Nothing loads until the visitor turns it on: then the camera
 * (getUserMedia) and MediaPipe's hand landmarker (WASM + a 7.8 MB model, from
 * jsDelivr and Google's model bucket). Every frame stays on the device. A small
 * mirrored preview shows the camera is on; off stops the tracks.
 *
 * Declarative: an <input type="checkbox" data-hand-pointer="#heroCanvas"> is
 * wired on load. Or by hand: JHHandPointer.attach(canvas).start()
 * `feed(landmarks, tMs)` is the seam the suite drives
 * (Agent Reference/maze-tests/handpointertest.mjs): synthetic hands in, real
 * strokes out, with no camera.
 */
(function () {
    'use strict';

    const MP_VERSION = '0.10.14';
    const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
    const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

    const T = {
        // The part of the camera frame that maps onto the canvas. A hand
        // rarely reaches the frame's edges (or its foot, under the desk), so
        // the inner box is the whole canvas.
        BOX: { x0: 0.12, x1: 0.88, y0: 0.08, y1: 0.72 },
        // Pinch = thumb-index gap over wrist→middle-knuckle length. Hysteresis:
        // closing past DOWN puts the pen down, opening past UP lifts it.
        DOWN: 0.24,
        UP: 0.36,
        OPEN: 0.9,       // the ring is widest at this gap
        SETTLE: 2,       // frames the pinch must agree before the pen changes
        LOST_MS: 180,    // a hand missing this long lifts the pen and leaves
        STEP: 10,        // px: longer moves between frames are filled in
        GHOST: 74,       // px: wrist→middle-knuckle length of the drawn hand
        // One Euro filter (Casiez et al. 2012): steady when slow, quick when fast.
        MIN_CUTOFF: 1.4,
        BETA: 0.012,
    };

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
    // Pure, so the suite can check the read without a page.
    function readHand(lm, aspect) {
        const P = i => ({ x: (1 - lm[i].x) * aspect, y: lm[i].y });   // mirrored, square units
        const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const thumb = P(4), index = P(8);
        const scale = Math.max(1e-4, d(P(0), P(9)));
        return {
            nib: { u: 1 - (lm[4].x + lm[8].x) / 2, v: (lm[4].y + lm[8].y) / 2 },
            pinch: d(thumb, index) / scale,
            scale,
        };
    }

    function attach(canvas, options = {}) {
        if (!canvas) return null;
        const o = Object.assign({}, T, options);
        let on = false, landmarker = null, video = null, stream = null, raf = 0;
        let lastVideoTime = -1, lastSeen = 0, present = false, down = false, vote = 0;
        let nib = null, sent = null, pinch = 1, lm = null, aspect = 4 / 3, fade = 0;
        const fx = oneEuro(o.MIN_CUTOFF, o.BETA), fy = oneEuro(o.MIN_CUTOFF, o.BETA), fp = oneEuro(8, 0);
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

        // ---- the HUD: mirrored preview + one line of status
        const hud = document.createElement('div');
        hud.className = 'hand-hud';
        hud.innerHTML = '<video muted playsinline></video><span class="hand-hud-note" role="status"></span>';
        const note = hud.querySelector('.hand-hud-note');
        function say(s, text) {
            status = s;
            note.textContent = text;
            hud.dataset.state = s;
            listeners.forEach(f => { try { f(s, text); } catch (e) { /* a listener's problem */ } });
        }

        // The canvas's visible part: where the box maps. Null when it has
        // scrolled away, and the hand then only shows, it does not draw.
        function area() {
            const r = canvas.getBoundingClientRect();
            const x0 = Math.max(r.left, 0), y0 = Math.max(r.top, 0);
            const x1 = Math.min(r.right, innerWidth), y1 = Math.min(r.bottom, innerHeight);
            if (x1 - x0 < 80 || (y1 - y0) < Math.min(200, r.height * 0.3)) return null;
            return { x0, y0, x1, y1 };
        }
        function toScreen(u, v) {
            const a = area() || { x0: 0, y0: 0, x1: innerWidth, y1: innerHeight };
            const b = o.BOX;
            const s = Math.min(1, Math.max(0, (u - b.x0) / (b.x1 - b.x0)));
            const t = Math.min(1, Math.max(0, (v - b.y0) / (b.y1 - b.y0)));
            return { x: a.x0 + s * (a.x1 - a.x0), y: a.y0 + t * (a.y1 - a.y0) };
        }

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
        function penUp() {
            if (!down) return;
            down = false;
            mouse('mouseup', sent || nib);
        }
        function leave() {
            penUp();
            if (present && sent) mouse('mouseleave', sent);
            present = false; sent = null; lm = null; vote = 0;
            fx.reset(); fy.reset(); fp.reset();
        }

        // One frame of tracking: landmarks or null (no hand). The suite's seam.
        function feed(marks, t) {
            if (!marks) {
                if (present && t - lastSeen > o.LOST_MS) { leave(); if (on) say('seek', 'show your hand to the camera'); }
                return;
            }
            lastSeen = t;
            lm = marks;
            const h = readHand(marks, aspect);
            const raw = toScreen(h.nib.u, h.nib.v);
            nib = { x: fx.filter(raw.x, t), y: fy.filter(raw.y, t) };
            pinch = fp.filter(h.pinch, t);
            const live = !!area();
            if (!present) {
                present = true;
                if (live) mouse('mouseenter', nib);
                say('track', 'pinch to draw · open to lift');
            }
            if (!live) { penUp(); return; }
            // The pen changes only when SETTLE frames in a row agree
            const want = down ? pinch < o.UP : pinch < o.DOWN;
            vote = want === down ? 0 : vote + 1;
            if (vote >= o.SETTLE) {
                vote = 0;
                if (want) { moveTo(nib); down = true; mouse('mousedown', nib); sent = nib; return; }
                penUp();
            }
            moveTo(nib);
        }

        function paint() {
            const w = innerWidth, h = innerHeight;
            lctx.clearRect(0, 0, w, h);
            // Over the water only: scrolled into the content, the hand stays out of the way
            fade += ((present && area() ? 1 : 0) - fade) * 0.2;
            if (fade < 0.02 || !lm || !nib) return;
            const g = readHand(lm, aspect);
            const k = o.GHOST / g.scale;
            const nibSq = { x: g.nib.u * aspect, y: g.nib.v };
            const at = i => ({
                x: nib.x + ((1 - lm[i].x) * aspect - nibSq.x) * k,
                y: nib.y + (lm[i].y - nibSq.y) * k,
            });
            const pts = lm.map((_, i) => at(i));
            lctx.save();
            lctx.globalAlpha = 0.38 * fade;
            lctx.strokeStyle = ink.line;
            lctx.lineWidth = 1.25;
            lctx.lineCap = 'round';
            lctx.beginPath();
            for (const [a, b] of BONES) { lctx.moveTo(pts[a].x, pts[a].y); lctx.lineTo(pts[b].x, pts[b].y); }
            lctx.stroke();
            lctx.fillStyle = ink.line;
            for (const p of pts) { lctx.beginPath(); lctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); lctx.fill(); }
            // The pincer: thumb tip to index tip, brighter as it closes
            const close = Math.min(1, Math.max(0, (o.OPEN - pinch) / (o.OPEN - o.DOWN)));
            lctx.globalAlpha = (0.25 + 0.5 * close) * fade;
            lctx.strokeStyle = down ? ink.down : ink.nib;
            lctx.beginPath(); lctx.moveTo(pts[4].x, pts[4].y); lctx.lineTo(pts[8].x, pts[8].y); lctx.stroke();
            lctx.restore();

            lctx.save();
            lctx.globalAlpha = fade;
            if (down) {
                lctx.shadowColor = ink.down; lctx.shadowBlur = 14;
                lctx.fillStyle = ink.down;
                lctx.beginPath(); lctx.arc(nib.x, nib.y, 4.5, 0, Math.PI * 2); lctx.fill();
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

        function loop() {
            raf = requestAnimationFrame(loop);
            if (landmarker && video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                const t = performance.now();
                let res = null;
                try { res = landmarker.detectForVideo(video, t); } catch (e) { /* a dropped frame */ }
                feed(res && res.landmarks && res.landmarks[0] || null, t);
            } else if (present && !landmarker) {
                feed(null, performance.now());     // driven by feed(): lost hands still leave
            }
            paint();
        }

        async function load() {
            const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
            const files = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
            const make = delegate => vision.HandLandmarker.createFromOptions(files, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate },
                runningMode: 'VIDEO', numHands: 1,
                minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5,
            });
            try { return await make('GPU'); } catch (e) { return make('CPU'); }
        }

        function mount() {
            readInk(); sizeLayer();
            document.body.append(layer, hud);
            addEventListener('resize', sizeLayer);
            addEventListener('jh-theme-change', readInk);
            document.addEventListener('visibilitychange', onVisible);
            if (!raf) loop();
        }
        function onVisible() { if (document.hidden && present) leave(); }

        // Start with camera + model; `{ camera: false }` mounts the overlay
        // alone, for feed()-driven tests.
        async function start(opts = {}) {
            if (on) return api;
            on = true;
            mount();
            if (opts.camera === false) { say('track', 'feeding'); return api; }
            say('load', 'starting camera…');
            video = hud.querySelector('video');
            try {
                const [s, lmk] = await Promise.all([
                    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false }),
                    (say('load', 'loading hand model…'), load()),
                ]);
                if (!on) { s.getTracks().forEach(t => t.stop()); return api; }
                stream = s; landmarker = lmk;
                video.srcObject = s;
                await video.play();
                aspect = (video.videoWidth || 4) / (video.videoHeight || 3);
                say('seek', 'show your hand to the camera');
            } catch (e) {
                const blocked = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
                say('error', blocked ? 'camera blocked: allow it in the address bar' : 'hand tracking could not start');
                console.warn('hand-pointer:', e);
                stop(true);
            }
            return api;
        }

        function stop(keepNote) {
            on = false;
            leave();
            if (stream) stream.getTracks().forEach(t => t.stop());
            stream = null;
            if (video) video.srcObject = null;
            if (landmarker) { try { landmarker.close(); } catch (e) { /* gone */ } }
            landmarker = null; lastVideoTime = -1;
            cancelAnimationFrame(raf); raf = 0;
            lctx.clearRect(0, 0, layer.width, layer.height);
            layer.remove();
            removeEventListener('resize', sizeLayer);
            removeEventListener('jh-theme-change', readInk);
            document.removeEventListener('visibilitychange', onVisible);
            if (keepNote) setTimeout(() => { if (!on) hud.remove(); }, 4000);
            else { hud.remove(); say('off', ''); }
            return api;
        }

        const api = {
            start, stop, feed,
            get on() { return on; },
            get down() { return down; },
            get status() { return status; },
            get nib() { return nib && { x: nib.x, y: nib.y }; },
            setAspect(a) { aspect = a; },
            onStatus(f) { listeners.add(f); return () => listeners.delete(f); },
        };
        return api;
    }

    function wire() {
        document.querySelectorAll('input[data-hand-pointer]').forEach(input => {
            const label = input.closest('label') || input;
            if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { label.hidden = true; return; }
            const canvas = document.querySelector(input.dataset.handPointer);
            const hp = attach(canvas);
            if (!hp) return;
            input._handPointer = hp;
            hp.onStatus(s => { if (s === 'error') input.checked = false; });
            input.addEventListener('change', () => { input.checked ? hp.start() : hp.stop(); });
            (window.JH_COMMANDS = window.JH_COMMANDS || []).push({
                id: 'hand.draw', title: 'Draw with your hand',
                detail: 'Your webcam as a pen: pinch to draw, open to lift',
                tags: 'webcam camera hand gesture draw pinch tracking air pen presence',
                hints: ['draw with my hand', 'use the webcam to draw', 'hand tracking'],
                run: () => { input.checked = !input.checked; input.dispatchEvent(new Event('change')); },
            });
        });
    }

    window.JHHandPointer = { attach, readHand, T };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
})();
