/*
 * pretext-wrap.js — flow running prose around obstacles, on BOTH sides.
 *
 * CSS gets you one side and no more. `shape-outside` on a float excludes on a
 * single edge, and `shape-inside` (text flowing inside a non-rectangular
 * container) was cut from CSS Shapes and never shipped. So a mark sitting in
 * the middle of a column, with language running down the left AND right of it,
 * is not expressible in CSS at any level of cleverness.
 *
 * It IS expressible with a line-breaker you can ask one line at a time.
 * pretext's `layoutNextLine(prepared, cursor, maxWidth)` is incremental, so a
 * different width can be handed to every line — and, with the row carved into
 * several slots, several times per line. That is the whole trick.
 *
 * Extracted from direction-lambda-inkwell-concept.html, where this pattern was
 * proven, and generalised in four ways:
 *
 *   1. Any obstacle shape, not one hardcoded bounding circle: circle, ellipse
 *      and rect, each answering "what do you block on this horizontal band".
 *   2. The DOM is the source of truth. The original ran on a `data-text`
 *      attribute, which makes the copy invisible to every tool that edits
 *      pages — this reads the element's own text.
 *   3. Accessible by construction. The positioned line layer is aria-hidden
 *      and the untouched prose is retained, visually clipped but present, so
 *      screen readers get continuous sentences and find-in-page still hits.
 *      The demo's per-line divs read as fragments.
 *   4. It waits for fonts. Metrics move when a webfont lands; the original
 *      papered over this with a 140ms timeout.
 *
 * Degrades honestly: if anything throws, the original prose is left exactly as
 * it was and the page is merely un-wrapped. Nothing is destroyed up front.
 *
 * Usage:
 *   const wrap = await wrapAround(proseEl, {
 *     obstacles: [{ el: markEl, shape: 'circle', hPad: 14, vPad: 4 }],
 *   });
 *   wrap.refresh();   // after a layout change this cannot observe
 *   wrap.destroy();   // restore the original prose
 */

const PRETEXT = './pretext/layout.js';

// ---- obstacle geometry ----------------------------------------------------
// Each shape answers one question: across this horizontal band, which
// x-interval is unavailable? Returning null means "nothing blocked here".

function circleInterval(box, top, bottom, hPad, vPad) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const r = Math.min(box.w, box.h) * 0.5;
    return ellipseSolve(cx, cy, r, r, top, bottom, hPad, vPad);
}

function ellipseInterval(box, top, bottom, hPad, vPad) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    return ellipseSolve(cx, cy, box.w / 2, box.h / 2, top, bottom, hPad, vPad);
}

// Shared solver. `minDy` is the closest the band gets to the centre line: a
// band straddling the centre is at 0 and so blocks the full width.
function ellipseSolve(cx, cy, rx, ry, bandTop, bandBottom, hPad, vPad) {
    const top = bandTop - vPad, bottom = bandBottom + vPad;
    if (top >= cy + ry || bottom <= cy - ry) return null;
    const minDy = (cy >= top && cy <= bottom) ? 0 : (cy < top ? top - cy : cy - bottom);
    if (minDy >= ry) return null;
    const k = 1 - (minDy * minDy) / (ry * ry);
    if (k <= 0) return null;
    const dx = rx * Math.sqrt(k);
    return { left: cx - dx - hPad, right: cx + dx + hPad };
}

function rectInterval(box, top, bottom, hPad, vPad) {
    if (bottom + vPad <= box.y || top - vPad >= box.y + box.h) return null;
    return { left: box.x - hPad, right: box.x + box.w + hPad };
}

const SHAPES = { circle: circleInterval, ellipse: ellipseInterval, rect: rectInterval };

// ---- slot carving ---------------------------------------------------------
// One row minus every obstacle on it = the runs of open space, left to right.
// This is what produces flow on BOTH sides: a blocker in the middle of the
// measure leaves two slots, and the line-breaker is asked for each in turn.
export function carveSlots(base, blocked, minSlot) {
    let slots = [{ left: base.left, right: base.right }];
    for (const b of blocked) {
        const next = [];
        for (const s of slots) {
            if (b.right <= s.left || b.left >= s.right) { next.push(s); continue; }
            if (b.left > s.left) next.push({ left: s.left, right: b.left });
            if (b.right < s.right) next.push({ left: b.right, right: s.right });
        }
        slots = next;
    }
    // Slivers are worse than nothing: two or three characters stranded beside
    // a mark reads as a mistake rather than as typography.
    return slots.filter(s => (s.right - s.left) >= minSlot);
}

// ---- the wrap ------------------------------------------------------------

export async function wrapAround(el, opts = {}) {
    if (!el) throw new Error('pretext-wrap: no element');

    const mod = await import(PRETEXT);
    const { prepareWithSegments, layoutNextLine } = mod;

    const cs = getComputedStyle(el);
    const lineHeight = opts.lineHeight || parseFloat(cs.lineHeight) || 24;
    const font = opts.font ||
        `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const minSlot = opts.minSlot != null ? opts.minSlot : 90;
    const maxLines = opts.maxLines || 400;
    // Optional measure cap: a slot wider than this is trimmed from the right,
    // so lines in open water keep a readable length even when the container
    // spans the full page.
    const maxLineWidth = opts.maxLineWidth || Infinity;

    // Inline emphasis survives the wrap. The element's own <strong>/<em>/
    // <b>/<i>/<code> runs are recorded as character ranges over the
    // normalized text, and each rendered line re-wraps its slice of those
    // ranges in the same tags — so the page's existing strong/em styling
    // applies to the visual layer too. Measurement still uses the base font:
    // exact for monospaced faces (bold advances match), approximate
    // otherwise, which is why the ranges decorate rather than re-measure.
    const INLINE = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', CODE: 'code' };
    const styleRuns = [];
    let text;
    if (opts.text) {
        text = opts.text.replace(/\s+/g, ' ').trim();
    } else {
        let acc = '';
        const visit = (node, tag) => {
            if (node.nodeType === 3) {
                const piece = node.textContent.replace(/\s+/g, ' ');
                if (tag && piece.trim()) styleRuns.push({ start: acc.length, end: acc.length + piece.length, tag });
                acc += piece;
                return;
            }
            if (node.nodeType !== 1) return;
            const t = INLINE[node.tagName] || tag;
            node.childNodes.forEach(ch => visit(ch, t));
        };
        el.childNodes.forEach(ch => visit(ch, null));
        // Normalize like the plain path does, tracking how the leading trim
        // shifts every recorded range.
        const lead = acc.length - acc.replace(/^\s+/, '').length;
        text = acc.replace(/^\s+/, '').replace(/\s+$/, '');
        styleRuns.forEach(r => { r.start -= lead; r.end -= lead; });
    }
    if (!text) throw new Error('pretext-wrap: nothing to lay out');

    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
    const esc = s => s.replace(/[&<>]/g, c => ESC[c]);
    function lineMarkup(lineText, lineStart) {
        const lineEnd = lineStart + lineText.length;
        const hits = styleRuns.filter(r => r.start < lineEnd && r.end > lineStart);
        if (!hits.length) return null;
        let html = '', pos = lineStart;
        for (const r of hits) {
            const s = Math.max(r.start, lineStart), e = Math.min(r.end, lineEnd);
            if (s > pos) html += esc(text.slice(pos, s));
            html += '<' + r.tag + '>' + esc(text.slice(s, e)) + '</' + r.tag + '>';
            pos = e;
        }
        if (pos < lineEnd) html += esc(text.slice(pos, lineEnd));
        return html;
    }

    const prepared = prepareWithSegments(text, font);

    // Keep the real prose. Clipped out of sight, still in the accessibility
    // tree and still findable — the visual layer is decoration over it.
    const source = document.createElement('div');
    source.className = 'pretext-source';
    source.textContent = text;
    const layer = document.createElement('div');
    layer.className = 'pretext-layer';
    layer.setAttribute('aria-hidden', 'true');

    // Obstacles commonly live INSIDE the prose container — that is how you
    // position a mark against the text it displaces. Clearing the container
    // would delete them, so lift them out first and put them back after.
    const kept = (opts.obstacles || [])
        .map(o => o.el || o)
        .filter(node => node && el.contains(node));
    kept.forEach(node => node.remove());

    const original = el.innerHTML;
    el.innerHTML = '';
    kept.forEach(node => el.appendChild(node));
    el.appendChild(source);
    el.appendChild(layer);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    const pool = [];
    function lineDiv(i) {
        while (pool.length <= i) {
            const d = document.createElement('div');
            d.className = 'pretext-line';
            layer.appendChild(d);
            pool.push(d);
        }
        return pool[i];
    }

    function obstacleBoxes() {
        const host = el.getBoundingClientRect();
        return (opts.obstacles || []).map(o => {
            const r = (o.el || o).getBoundingClientRect();
            return {
                fn: SHAPES[o.shape] || SHAPES.rect,
                box: { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height },
                hPad: o.hPad != null ? o.hPad : 12,
                vPad: o.vPad != null ? o.vPad : 2,
            };
        });
    }

    let lastCount = 0;
    function relayout() {
        const width = el.clientWidth;
        if (width < 40) return;
        const obs = obstacleBoxes();

        const out = [];
        let cursor = { segmentIndex: 0, graphemeIndex: 0 };
        let top = 0;
        let guard = 0;
        let done = false;

        while (!done && guard++ < maxLines) {
            const blocked = [];
            for (const o of obs) {
                const iv = o.fn(o.box, top, top + lineHeight, o.hPad, o.vPad);
                if (iv) blocked.push(iv);
            }
            blocked.sort((a, b) => a.left - b.left);
            const slots = carveSlots({ left: 0, right: width }, blocked, minSlot);
            slots.forEach(s => { if (s.right - s.left > maxLineWidth) s.right = s.left + maxLineWidth; });

            // A row entirely blocked still advances, or a wide mark would spin
            // the loop until the guard trips.
            if (!slots.length) { top += lineHeight; continue; }

            let produced = false;
            for (const slot of slots) {
                let line = null;
                try { line = layoutNextLine(prepared, cursor, slot.right - slot.left); }
                catch (e) { line = null; }
                if (!line) { done = true; break; }
                out.push({ x: slot.left, y: top, text: line.text });
                cursor = line.end;
                produced = true;
            }
            if (!produced) break;
            top += lineHeight;
        }

        // Each line's slice of the normalized text locates its styled runs.
        // line.text is an exact substring, so a moving indexOf is reliable.
        let searchFrom = 0;
        for (let i = 0; i < Math.max(out.length, lastCount); i++) {
            const d = lineDiv(i);
            if (i < out.length) {
                let html = null;
                if (styleRuns.length) {
                    const at = text.indexOf(out[i].text, searchFrom);
                    if (at !== -1) {
                        html = lineMarkup(out[i].text, at);
                        searchFrom = at + out[i].text.length;
                    }
                }
                if (html !== null) {
                    if (d.dataset.ptHtml !== html) { d.innerHTML = html; d.dataset.ptHtml = html; }
                } else if (d.textContent !== out[i].text || d.dataset.ptHtml) {
                    d.textContent = out[i].text;
                    delete d.dataset.ptHtml;
                }
                d.style.transform = `translate(${out[i].x}px, ${out[i].y}px)`;
                d.style.display = 'block';
            } else {
                d.style.display = 'none';
            }
        }
        lastCount = out.length;
        el.style.minHeight = (top + lineHeight) + 'px';
    }

    let queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; relayout(); });
    }

    relayout();

    // Webfonts change every measurement, so lay out again once they land
    // rather than guessing at a delay.
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { mod.clearCache && mod.clearCache(); schedule(); });
    }

    // The container can change width without the window doing so — a column
    // collapsing, a sibling growing — so observe the element itself.
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(schedule);
        ro.observe(el);
        (opts.obstacles || []).forEach(o => ro.observe(o.el || o));
    } else {
        window.addEventListener('resize', schedule);
    }

    return {
        refresh: schedule,
        destroy() {
            if (ro) ro.disconnect(); else window.removeEventListener('resize', schedule);
            source.remove();
            layer.remove();
            // `original` was captured with the obstacles already lifted out, so
            // restoring it and leaving them in place rebuilds the initial DOM.
            el.insertAdjacentHTML('beforeend', original);
            el.style.minHeight = '';
        },
    };
}

export default wrapAround;
