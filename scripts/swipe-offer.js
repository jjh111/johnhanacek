/* Swipe offer — the way off a drawing canvas, offered under the finger.
 *
 * index.html's tank and design.html's blueprint own every touch BY RULING
 * (see the startDraw note in fish-engine.js): a finger draws, the page does
 * not scroll. A visitor who wanted to scroll draws two quick straight lines
 * instead — so two roughly parallel lines, drawn one right after the other,
 * read as a swipe, and a "scroll down" button appears where the finger
 * lifted. Nothing is arbitrated: the strokes still do whatever the page does
 * with lines, and the offer is only ever an offer.
 *
 * Ported from MetaMedium (../MetaMedium/index.html, swipeRead/updateOffer).
 * Same relational gate — the two most recent strokes, both straight, within
 * ~20° of parallel, the shorter at least 60% of the longer — with four
 * changes for a fish tank:
 *   1. "Side by side" is along-axis OVERLAP, not "centre offset lies across".
 *      Two swipes in the same spot (what someone trying to scroll actually
 *      does) overlap almost completely; MetaMedium's test rejected them.
 *      End-to-end dashes still have no overlap and still never offer.
 *   2. A time window: the second stroke starts within GAP_MS of the first
 *      ending. Two fingers at once count too (the gap is negative).
 *   3. UPWARD only. To scroll a phone page down, the finger moves up; letters
 *      and walls are drawn top-down. This one cue removes the uprights of an
 *      H, a fast top-down corridor, and a thin triangle's acute vertex (two
 *      antiparallel strokes MetaMedium's either-direction read accepted).
 *   4. TOUCH ONLY by default. The containment is a touch problem — a mouse
 *      wheel scrolls these pages — and desktop maze-builders drawing a
 *      corridor should never see it.
 *
 * Self-contained: it listens to the canvas itself (passive), so neither
 * page's stroke routing changes. `read()` is pure for the lab
 * (Agent Reference/maze-tests/swipelab.mjs), which measures the false
 * positives before any threshold here moves.
 *
 * Declarative: a canvas carrying data-swipe-offer="#target" is attached on
 * load (the value is where "scroll down" goes). Or by hand:
 *   JHSwipeOffer.attach(canvas, { target: '#about' })
 */
(function () {
    'use strict';

    const T = {
        TURN: 0.35,      // radians: about 20° out of parallel (MetaMedium's value)
        PEER: 0.6,       // shorter line as a fraction of the longer (MetaMedium's value)
        MIN_LEN: 40,     // px: shorter strokes are taps, dots and dashes
        STRAIGHT: 0.9,   // chord / path length: a swipe is a straight mark
        GAP_MS: 1200,    // second stroke must start this soon after the first ends
        OVERLAP: 0.5,    // along-axis overlap, as a fraction of the shorter line
        NEAR: 0.8,       // across-axis gap, as a fraction of the longer line
        VERTICAL: 0.6,   // radians from vertical (~35°); null accepts any axis
        UPWARD: true,    // both strokes move UP the screen, as a finger does to scroll down
        HOLD_MS: 5000,   // an untaken offer leaves on its own
    };

    // A stroke reduced to what the read needs. Null when it is not a line.
    function summarize(points, t0, t1) {
        if (!points || points.length < 3) return null;
        let path = 0;
        for (let i = 1; i < points.length; i++) {
            path += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        }
        const a = points[0], b = points[points.length - 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (!path) return null;
        return { a, b, len, straight: len / path, dir: Math.atan2(b.y - a.y, b.x - a.x), t0, t1 };
    }

    function isLine(s, t) {
        return !!s && s.len >= t.MIN_LEN && s.straight >= t.STRAIGHT;
    }

    // Do these two consecutive strokes read as one swipe?
    function read(p, q, t = T) {
        if (!isLine(p, t) || !isLine(q, t)) return false;
        if (q.t0 - p.t1 > t.GAP_MS) return false;

        let turn = Math.abs(p.dir - q.dir) % Math.PI;
        if (turn > Math.PI / 2) turn = Math.PI - turn;
        if (turn > t.TURN) return false;

        const long = p.len >= q.len ? p : q;
        const short = long === p ? q : p;
        if (short.len / long.len < t.PEER) return false;

        // Axis of the longer line; the shorter is measured against it.
        const ux = Math.cos(long.dir), uy = Math.sin(long.dir);
        if (t.VERTICAL != null && Math.abs(ux) > Math.sin(t.VERTICAL)) return false;
        if (t.UPWARD && (Math.sin(p.dir) >= 0 || Math.sin(q.dir) >= 0)) return false;   // screen y grows down

        const along = pt => (pt.x - long.a.x) * ux + (pt.y - long.a.y) * uy;
        const across = pt => (pt.x - long.a.x) * -uy + (pt.y - long.a.y) * ux;
        const l0 = Math.min(along(long.a), along(long.b)), l1 = Math.max(along(long.a), along(long.b));
        const s0 = Math.min(along(short.a), along(short.b)), s1 = Math.max(along(short.a), along(short.b));
        const overlap = Math.min(l1, s1) - Math.max(l0, s0);
        if (overlap < t.OVERLAP * short.len) return false;    // end to end: a dash after a dash

        const mid = { x: (short.a.x + short.b.x) / 2, y: (short.a.y + short.b.y) / 2 };
        if (Math.abs(across(mid)) > t.NEAR * long.len) return false;   // too far apart to be one gesture
        return true;
    }

    function attach(canvas, opts = {}) {
        if (!canvas) return null;
        const t = Object.assign({}, T, opts.thresholds);
        const touchOnly = opts.touchOnly !== false;
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const target = () => {
            if (opts.target) return document.querySelector(opts.target);
            const a = document.querySelector('.oval-scroll-btn[href^="#"]');
            return a ? document.querySelector(a.getAttribute('href')) : null;
        };

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swipe-offer';
        btn.hidden = true;
        btn.innerHTML = '<span>scroll down</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"/></svg>';
        document.body.appendChild(btn);

        const live = new Map();   // touch identifier (or 'mouse') → { points, t0 }
        let prev = null;          // the last finished stroke, line or not
        let hideTimer = 0;
        const stats = { strokes: 0, offers: 0, taken: 0 };

        function hide() {
            clearTimeout(hideTimer);
            if (btn.hidden) return;
            btn.classList.remove('shown');
            btn.hidden = true;
        }

        function show(at) {
            // documentElement, not window.inner*: a page wider than the phone
            // (horizontal overflow) reports the wider layout viewport there.
            const w = document.documentElement.clientWidth, h = document.documentElement.clientHeight;
            btn.style.visibility = 'hidden';
            btn.style.left = '0px';   // measure at full width, not squeezed against the last spot
            btn.hidden = false;
            const half = btn.offsetWidth / 2 + 12;
            btn.style.visibility = '';
            btn.style.left = Math.min(Math.max(at.x, half), w - half) + 'px';
            btn.style.top = Math.min(Math.max(at.y + 28, 60), h - 64) + 'px';
            requestAnimationFrame(() => btn.classList.add('shown'));
            clearTimeout(hideTimer);
            hideTimer = setTimeout(hide, t.HOLD_MS);
            stats.offers++;
        }

        const pos = src => {
            const r = canvas.getBoundingClientRect();
            return { x: src.clientX - r.left, y: src.clientY - r.top, cx: src.clientX, cy: src.clientY };
        };

        function begin(id, p) {
            hide();   // a new stroke means the visitor is drawing, not leaving
            live.set(id, { points: [p], t0: performance.now() });
        }
        function move(id, p) {
            const s = live.get(id);
            if (s) s.points.push(p);
        }
        function end(id, p) {
            const s = live.get(id);
            if (!s) return;
            live.delete(id);
            if (p) s.points.push(p);
            stats.strokes++;
            const cur = summarize(s.points, s.t0, performance.now());
            if (prev && read(prev, cur, t)) {
                const last = s.points[s.points.length - 1];
                show({ x: last.cx, y: last.cy });
                prev = null;   // the pair is spent; draw another pair to be asked again
                return;
            }
            prev = cur || { len: 0, straight: 0, t0: 0, t1: 0 };   // a non-line still breaks the pair
        }

        canvas.addEventListener('touchstart', e => {
            for (const tc of e.changedTouches) begin(tc.identifier, pos(tc));
        }, { passive: true });
        canvas.addEventListener('touchmove', e => {
            for (const tc of e.changedTouches) move(tc.identifier, pos(tc));
        }, { passive: true });
        canvas.addEventListener('touchend', e => {
            for (const tc of e.changedTouches) end(tc.identifier, pos(tc));
        }, { passive: true });
        canvas.addEventListener('touchcancel', e => {
            for (const tc of e.changedTouches) live.delete(tc.identifier);
        }, { passive: true });

        if (!touchOnly) {
            canvas.addEventListener('mousedown', e => begin('mouse', pos(e)));
            canvas.addEventListener('mousemove', e => move('mouse', pos(e)));
            canvas.addEventListener('mouseup', e => end('mouse', pos(e)));
        }

        btn.addEventListener('click', () => {
            hide();
            stats.taken++;
            const el = target();
            if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        });
        window.addEventListener('scroll', hide, { passive: true });

        return { button: btn, stats, hide };
    }

    const offers = [];
    function auto() {
        document.querySelectorAll('canvas[data-swipe-offer]').forEach(c => {
            offers.push(attach(c, { target: c.getAttribute('data-swipe-offer') || undefined }));
        });
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
        else auto();
    }

    window.JHSwipeOffer = { attach, read, summarize, T, offers };
})();
