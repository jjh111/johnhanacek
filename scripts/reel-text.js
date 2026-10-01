// Words on the stage, changed where they stand: the reel preview's in-place text editor.
//
// Every line on screen the script wrote carries its script line and which part of it it shows
// (the rig tags it live: data-ln, data-part). Paused, a line under the pointer shows a dashed
// outline; double-click it and type. Enter keeps it, and so does clicking away: one line of the
// script changes (ReelScript.setField, the part written back in the script's own words with
// writeValue) and plays at once, in place, like any edit. Esc puts it back. Double-clicking while
// it plays pauses it first. Its saves go on the timeline's undo stack, so Undo (⌘Z) takes a word
// back like any other edit.
//
// What can be changed here: the answer's lines and stats, every eyebrow, headline, caption,
// line, lead and quote, a cite (its name and its role), a work's awards, the result list's titles
// and one-liners, the plan's rows, the title's name and tagline, the offer's three and its call,
// the end card's line, and the question in the bar. What the media kit writes (the logos, the
// offer's heading) and what the rig draws on its own (Plan, Receipt, the ✓) stays in the inspector
// or the media kit.
//
// A classic script the rig injects in live mode only.
(function () {
  'use strict';
  const L = window.REEL_LIVE, RS = window.ReelScript;
  if (!L || !RS || !RS.writeValue || window.REEL_TEXT) return;
  const get = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file, DEPTH = 30;   // the timeline's stacks

  const css = document.createElement('style');
  css.textContent = `
#reel-tx-box { position: fixed; z-index: 45; pointer-events: none; border-radius: 4px; border: 1px dashed rgba(var(--gold-rgb), 0.85); }
#reel-tx-box.tx-on { border: 1px solid var(--gold); box-shadow: 0 0 0 3px rgba(var(--gold-rgb), 0.22); }
#reel-tx-tip { position: fixed; z-index: 46; pointer-events: none; font: 500 11px/1 var(--font-mono); color: var(--text-bright); white-space: nowrap;
  background: rgba(var(--surface-rgb), 0.94); border: 1px solid rgba(var(--gold-rgb), 0.6); border-radius: 5px; padding: 5px 7px; }
#reel-tx-tip.tx-bad { border-color: #ff8a7a; }
#reel-tx-box[hidden], #reel-tx-tip[hidden] { display: none; }
[data-reel-editing] { outline: none; caret-color: var(--gold); cursor: text; -webkit-user-select: text; user-select: text; }
`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'reel-tx-box'; box.hidden = true;
  const tip = document.createElement('div'); tip.id = 'reel-tx-tip'; tip.hidden = true; tip.setAttribute('role', 'status');
  document.body.append(box, tip);

  // ── what is under the pointer ─────────────────────────────────────────
  // The topmost thing at the point must be the stage (not a panel lying over it); the line is the
  // first tagged one among everything under the point (the bar sits under a scene's own layer).
  const seen = el => {                       // drawn, and not faded out
    let o = 1;
    for (let n = el; n && n !== L.stage; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      o *= +cs.opacity;
    }
    return o > 0.5;
  };
  function lineAt(x, y) {
    const all = document.elementsFromPoint(x, y);
    if (!all.length || !L.stage.contains(all[0])) return null;
    for (const el of all) {
      const t = el.closest && el.closest('[data-ln]');
      if (t && L.stage.contains(t) && t.dataset.ln && seen(t.querySelector(':scope > .li') || t)) return t;
    }
    return null;
  }
  const busy = () => !!(window.REEL_FISH && window.REEL_FISH.picking);   // the Fish panel is picking a point on the stage
  // the words' own box: a mask line's sliding part (the line itself spans its column)
  const wordsBox = t => (t.querySelector(':scope > .li') || t);
  // The hints say how it works the first few times, then let the words be: the outline and the
  // text cursor say enough once you know (kept in this browser).
  const K_HINT = 'reel-text-hints';
  const hints = (() => { try { return JSON.parse(localStorage.getItem(K_HINT)) || { hover: 0, edit: 0 }; } catch (e) { return { hover: 0, edit: 0 }; } })();
  const hint = (kind, max) => { if (hints[kind] >= max) return false; hints[kind]++; try { localStorage.setItem(K_HINT, JSON.stringify(hints)); } catch (e) { /* none kept */ } return true; };
  function frame(el, on) {
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: (r.left - 4) + 'px', top: (r.top - 3) + 'px', width: (r.width + 8) + 'px', height: (r.height + 6) + 'px' });
    box.classList.toggle('tx-on', !!on); box.hidden = false;
    return r;
  }
  function say(text, bad, r) {
    if (!text) { tip.hidden = true; return; }
    tip.textContent = text; tip.classList.toggle('tx-bad', !!bad); tip.hidden = false;
    const b = r || box.getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, b.left)) + 'px';
    tip.style.top = Math.max(8, b.top - tip.offsetHeight - 8) + 'px';
  }
  let hover = null, ed = null, sayTimer = 0;
  addEventListener('pointermove', e => {
    if (ed) return;
    const t = !L.isPlaying() && !busy() && e.buttons === 0 ? lineAt(e.clientX, e.clientY) : null;
    if (t === hover) return;
    hover = t;
    L.stage.style.cursor = t ? 'text' : '';
    if (!t) { box.hidden = true; say(''); return; }
    const r = frame(wordsBox(t));
    say(hint('hover', 6) ? 'double-click to change these words' : '', false, r);
  }, { passive: true });
  addEventListener('pointerleave', () => { if (!ed) { hover = null; box.hidden = true; say(''); } });

  // ── one line, edited where it stands ──────────────────────────────────
  const fieldAt = ln => L.parsed.fields.find(f => f.ln === ln);
  // a field's value as the parser read it (one element of a list kind written line by line)
  const valueOf = f => { let v = f.owner[f.jsonKey]; if (f.index != null && Array.isArray(v) && !['list', 'pair'].includes(f.kind)) v = v[f.index]; return v; };
  // the words in a line, as the script writes them: text as it is, emphasis kept
  function words(el) {
    let out = '';
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1 && /^(EM|STRONG|B|I)$/.test(n.tagName)) { const t = n.tagName.toLowerCase(); out += `<${t}>${words(n)}</${t}>`; }
      else if (n.nodeType === 1 && n.tagName !== 'svg' && !n.classList.contains('dot')) out += words(n);
    });
    return out;
  }
  const flat = s => s.replace(/[\s ]+/g, ' ').trim();
  function begin(t, x, y) {
    const ln = +t.dataset.ln, part = t.dataset.part || 'all', f = fieldAt(ln);
    if (!f) return;
    const bar = t.classList.contains('qt');
    const el = part === 'letters' || bar ? t : (t.querySelector(':scope > .li') || t);
    // What Esc puts back. The title's name is drawn letter by letter, and the bar types its
    // question: both are edited as their whole words, so their own nodes wait aside untouched.
    // Any other line is typed into where it stands, which changes its nodes: a copy waits instead.
    const whole = part === 'letters' || bar;
    const kids = whole ? [...el.childNodes] : [...el.childNodes].map(n => n.cloneNode(true));
    if (whole) el.textContent = valueOf(f);
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    el.dataset.reelEditing = ''; el.spellcheck = false;
    ed = { t, el, ln, part, f, kids, before: flat(words(el)) };
    hover = null; L.stage.style.cursor = '';
    el.focus({ preventScroll: true });
    // the word under the pointer, as a double-click in any text does; else every word
    const sel = getSelection(), r = x != null && document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (r && el.contains(r.startContainer) && sel.modify) {
      sel.removeAllRanges(); sel.addRange(r);
      sel.modify('move', 'backward', 'word'); sel.modify('extend', 'forward', 'word');
    } else { const all = document.createRange(); all.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(all); }
    el.addEventListener('keydown', onKey);
    el.addEventListener('blur', onBlur);
    el.addEventListener('paste', onPaste);
    frame(ed.el, true);
    say(hint('edit', 4) ? 'Enter keeps it · Esc puts it back' : '');
  }
  function onKey(e) {
    e.stopPropagation();                      // the preview's keys (space, L, R…) are not for this
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  }
  function onBlur() { if (ed) commit(); }
  function onPaste(e) {                       // words only, on one line
    e.preventDefault();
    const text = (e.clipboardData && e.clipboardData.getData('text/plain') || '').replace(/[\r\n]+/g, ' ');
    document.execCommand('insertText', false, text);
  }
  function end() {
    const e = ed; ed = null;
    if (!e) return null;
    e.el.removeEventListener('keydown', onKey); e.el.removeEventListener('blur', onBlur); e.el.removeEventListener('paste', onPaste);
    e.el.removeAttribute('contenteditable'); delete e.el.dataset.reelEditing;
    box.hidden = true;
    return e;
  }
  function restore(e) { e.el.replaceChildren(...e.kids); }
  function cancel() { const e = end(); if (e) restore(e); say(''); }
  // the field's whole value with this part changed
  function valueFor(e, text) {
    const f = e.f, v = valueOf(f), part = e.part;
    const one = s => { if (/\|/.test(s) && ['list', 'row', 'three', 'pair', 'cta'].includes(f.kind)) throw new Error('a | separates the parts of this line: leave it out'); return s; };
    if (part === 'all' || part === 'letters') return f.kind === 'str' || f.kind === 'lines' ? text : RS.writeValue(f.kind, text);
    if (part === 'label') return RS.writeValue('stat', Object.assign({}, v, { label: text }));
    if (part === 'yr' || part === 'text') return RS.writeValue('award', Object.assign({}, v, { [part]: text }));
    if (part === 'what') return RS.writeValue('plan', Object.assign({}, v, { what: text }));
    if (part === 'title' || part === 'micro') return RS.writeValue('row', Object.assign({}, v, { [part]: one(text) }));
    if (part.startsWith('part:')) { const a = v.slice(); a[+part.slice(5)] = one(text); return RS.writeValue('list', a); }
    if (part === 'k') return RS.writeValue('three', Object.assign({}, v, { k: one(text) }));
    if (part.startsWith('line:')) { const ls = v.lines.slice(); ls[+part.slice(5)] = one(text); return RS.writeValue('three', Object.assign({}, v, { lines: ls })); }
    if (part === 'pair') {                    // "Name · Role": the name is the strong part
      const s = e.el.querySelector('strong'), rest = s ? flat(words(e.el).replace(/<strong>[\s\S]*?<\/strong>/, '')) : null;
      const pair = s ? [flat(s.textContent), rest.replace(/^·\s*/, '')] : text.split(/\s*·\s*/);
      if (pair.length !== 2 || !pair[0] || !pair[1]) throw new Error('a cite is a name and a role, with a · between them');
      return RS.writeValue('pair', pair.map(one));
    }
    if (part === 'cta') {                     // the lead, then the gold (strong) part
      const s = e.el.querySelector('strong');
      if (!s) throw new Error('the call to action keeps its gold words: undo, and change the words around them');
      return RS.writeValue('cta', { lead: one(flat(words(e.el).replace(/<strong>[\s\S]*?<\/strong>/, ''))), strong: one(flat(s.textContent)) });
    }
    throw new Error('these words are not the script\'s to change here');
  }
  async function commit() {
    const e = end();
    if (!e) return;
    const text = flat(words(e.el));
    if (text === e.before) { restore(e); say(''); return; }
    if (!text) { restore(e); flash('a line needs words: Esc, or undo, to keep the old ones', true); return; }
    let next;
    try { next = RS.setField(L.src, e.ln, valueFor(e, text)); RS.parse(next); }
    catch (err) { restore(e); flash((err.errors || [err.message])[0], true); return; }
    const u = get(K_UNDO, []);
    put(K_UNDO, (Array.isArray(u) ? u : []).concat([L.src]).slice(-DEPTH)); put(K_REDO, []);
    say('');
    let res;
    try { res = await L.save(next); } catch (err) { res = { ok: false, errors: [err.message] }; }
    if (!res || !res.applied) { put(K_UNDO, u); restore(e); flash(((res && res.errors) || ['not changed'])[0], true); return; }
    if (!res.ok) flash((res.errors || ['kept as a draft in this tab'])[0], true);
  }
  function flash(text, bad) {
    say(text, bad, L.stage.getBoundingClientRect());
    clearTimeout(sayTimer); sayTimer = setTimeout(() => { if (!ed) say(''); }, 3200);
  }
  addEventListener('dblclick', e => {
    if (ed || busy()) return;
    const t = lineAt(e.clientX, e.clientY);
    if (!t) return;
    e.preventDefault();
    if (L.isPlaying()) L.setPlaying(false);
    begin(t, e.clientX, e.clientY);
  });
  // an edit elsewhere (the timeline, another editor) draws the scene again: a line being edited
  // there is gone with it
  if (L.onChange) L.onChange(() => { if (ed && !ed.el.isConnected) { end(); say(''); } hover = null; box.hidden = true; });
  L.onFrame(() => { if (ed && ed.el.isConnected) frame(ed.el, true); else if (hover && (L.isPlaying() || !hover.isConnected)) { hover = null; box.hidden = true; say(''); L.stage.style.cursor = ''; } });

  // for tests and the console
  window.REEL_TEXT = {
    get editing() { return ed ? { ln: ed.ln, part: ed.part } : null; },
    lines: () => [...L.stage.querySelectorAll('[data-ln]')].filter(t => seen(t.querySelector(':scope > .li') || t)).map(t => ({ ln: +t.dataset.ln, part: t.dataset.part, text: flat(words(t.querySelector(':scope > .li') || t)) })),
    edit: (ln, part) => { const t = [...L.stage.querySelectorAll(`[data-ln="${ln}"]`)].find(x => (x.dataset.part || 'all') === (part || x.dataset.part || 'all')); if (t) begin(t); return !!t; },
    commit, cancel,
  };
})();
