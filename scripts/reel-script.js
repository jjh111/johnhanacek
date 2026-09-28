// Sizzle reel scripts: a reel's edit as plain text, changed the way you change a screenplay.
//
// Cut 2's edit used to be a JSON block (media-kit.json → reel2), with the words and the timing
// buried in nesting and quotes. It is now Assets/sizzle-reel-2.script.txt, and this reads it.
// One line on screen is one line of the script:
//
//   SCENE answer 4.5                  a scene: its kind, then its length in seconds
//     query    who is john?           a field: its name, then the rest of the line
//     tiers    BM25 | MiniLM          " | " separates the parts of one field
//     line     Freehand expression    a repeated field: one designed line each
//     stat     @1 14 years designing  @ counts seconds from the start of the scene
//   SCENE results 13
//     ITEM 4.5                        one result inside a results scene
//       @2.35                         a beat: what changes 2.35 s into its item
//         video  ./nanome-mara.mp4
//
// Retiming ripples: a scene's length moves every scene after it, and a beat moves with its
// scene. Indentation and [bracketed] timecodes are for the reader and are ignored (`fmt`
// refreshes the brackets). A line starting with # is a note.
//
// Inside a scene, `cue <name> <seconds>` moves one of its joints (CUES below: when the answer
// arrives after the question's Enter, when the content leaves, how fast the question types);
// a scene that writes none keeps the rig's own timing.
//
// Tools edit a script the way a person would, one line at a time: parse() says which line
// holds what (`marks` for SCENE/ITEM/@ lines, `fields` for every other line), and setDur,
// setAt, setField and setCue change that line and nothing else.
//
// One file, three hosts. The rig loads it as a classic script (window.ReelScript), the
// renderer requires it, and run directly it is the command line:
//   node scripts/reel-script.js check [file]   parse, print the cue sheet and the total
//   node scripts/reel-script.js fmt [file]     rewrite the [bracketed] timecodes in place
//   node scripts/reel-script.js json [file]    print the edit exactly as the rig receives it
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    if (require.main === module) api.main(process.argv.slice(2));
  } else root.ReelScript = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── what a field holds ────────────────────────────────────────────────
  // Each kind reads the rest of a line into a value and writes it back out. A `many` kind
  // collects one value per line into a list.
  const split = v => v.split(/\s*\|\s*/);
  const number = (v, what) => {
    const n = Number(String(v == null ? '' : v).replace(/s$/i, ''));
    if (v == null || v === '' || !Number.isFinite(n)) throw new Error(`${what} should be a number, not "${v == null ? '' : v}"`);
    return n;
  };
  const words = v => { if (!v) throw new Error('needs some words after its name'); return v; };
  const parts = (v, lo, hi, shape) => {
    const p = split(words(v));
    if (p.length < lo || p.length > hi || p.some(x => !x)) throw new Error(`should read ${shape}`);
    return p;
  };
  const KINDS = {
    str:   { read: words, write: v => v },
    num:   { read: v => number(v, 'it'), write: String },
    flag:  { read: v => { if (!v || /^(yes|true|on)$/i.test(v)) return true; if (/^(no|false|off)$/i.test(v)) return false; throw new Error('takes no value (or yes / no)'); },
             write: () => '' },
    nums:  { read: v => words(v).split(/\s+/).map(x => number(x, 'each value')), write: a => a.join(' ') },
    list:  { read: v => parts(v, 1, 99, '"one | two | three"'), write: a => a.join(' | ') },
    lines: { many: true, read: words, write: v => v },
    stat:  { many: true,
             read: v => {
               const m = /^(?:@(\S+)\s+)?(\S+)\s+(.+)$/.exec(words(v));
               if (!m) throw new Error('should read "@1.5 14 years designing" (the @ time is optional)');
               const s = {};
               if (m[1] != null) s.at = number(m[1], 'its @ time');
               s.n = number(m[2], 'the stat'); s.label = m[3];
               return s;
             },
             write: s => `${s.at != null ? '@' + s.at + ' ' : ''}${s.n} ${s.label}` },
    award: { many: true,
             read: v => {
               const m = /^@(\S+)\s+(\S+)\s+(.+)$/.exec(words(v));
               if (!m) throw new Error('should read "@0.9 2020 what was won"');
               return { at: number(m[1], 'its @ time'), yr: m[2], text: m[3] };
             },
             write: a => `@${a.at} ${a.yr} ${a.text}` },
    plan:  { many: true,
             read: v => {
               const m = /^(\d+)\s+(.+?)\s*\((\w+)\)$/.exec(words(v));
               if (!m) throw new Error('should read "4 medium fish (loop)": the count, the words, the glyph');
               return { n: +m[1], what: m[2], glyph: m[3] };
             },
             write: p => `${p.n} ${p.what} (${p.glyph})` },
    row:   { many: true,
             read: v => {
               const p = parts(v, 4, 5, '"page | shape | title | one-liner", then optionally "| thumbnail"');
               const r = { page: p[0], shape: p[1], title: p[2], micro: p[3] };
               if (p[4]) r.thumb = p[4];
               return r;
             },
             write: r => [r.page, r.shape, r.title, r.micro].concat(r.thumb ? [r.thumb] : []).join(' | ') },
    three: { many: true,
             read: v => { const p = parts(v, 2, 9, '"Name | first line | second line"'); return { k: p[0], lines: p.slice(1) }; },
             write: t => [t.k].concat(t.lines).join(' | ') },
    pair:  { read: v => parts(v, 2, 2, '"name | role"'), write: a => a.join(' | ') },
    cta:   { read: v => { const p = parts(v, 2, 2, '"the lead | the gold part"'); return { lead: p[0], strong: p[1] }; },
             write: c => `${c.lead} | ${c.strong}` },
    // one named timing point: collected into an object, { out: 0.5 }, not a list
    cue:   { many: true, map: true,
             read: v => {
               const m = /^(\w+)\s+(\S+)$/.exec(words(v));
               if (!m) throw new Error('should read "out 0.5": the name of a timing point, then its value');
               return [m[1], number(m[2], `the ${m[1]} cue`)];
             },
             write: ([k, x]) => `${k} ${x}` },
  };

  // ── what each part of a reel holds, in the order it is written ────────
  // [name in the script, name the rig reads, kind]
  const ASK = [['query', 'query', 'str'], ['tiers', 'tiers', 'list']];
  const HEAD = [['page', 'page', 'str'], ['shape', 'shape', 'str'], ['eyebrow', 'eyebrow', 'str'], ['headline', 'headline', 'lines']];
  const BEAT = [['img', 'img', 'str'], ['video', 'video', 'str'], ['from', 'from', 'num'], ['loop', 'loop', 'flag'],
    ['pan', 'pan', 'flag'], ['focus', 'focus', 'nums'], ['zoom', 'zoom', 'nums'], ['caption', 'caption', 'str'],
    ['line', 'line', 'lines'], ['lead', 'lead', 'str'], ['stat', 'stats', 'stat'], ['quote', 'quote', 'lines'], ['cite', 'cite', 'pair']];
  const VOICE = [['line', 'lines', 'lines'], ['cite', 'cite', 'pair']];
  // `beats`: [the rig's name for the beat list, a beat's fields]; `need` and `beatNeed` are what
  // the rig cannot draw without ('media' is an img or a video)
  const SCENES = {
    open:    { fields: [['caption', 'caption', 'str'], ['reveal', 'reveal', 'str']], need: ['caption', 'reveal'] },
    title:   { fields: [['name', 'name', 'str'], ['tagline', 'tagline', 'list']], need: ['name', 'tagline'] },
    answer:  { fields: ASK.concat([['line', 'lines', 'lines'], ['support', 'support', 'str'], ['stat', 'stats', 'stat']]),
               need: ['query', 'lines', 'stats'] },
    art:     { fields: ASK.concat(HEAD), beats: ['beats', BEAT], need: ['query', 'eyebrow', 'headline', 'beats'], beatNeed: ['media'] },
    command: { fields: ASK.concat([['plan', 'plan', 'plan'], ['receipt', 'receipt', 'str']]), need: ['query', 'plan', 'receipt'] },
    results: { fields: ASK.concat([['row', 'rows', 'row']]), items: true, need: ['query', 'rows', 'items'] },
    feature: { fields: ASK.concat(HEAD, [['award', 'awards', 'award']]), beats: ['beats', BEAT],
               need: ['query', 'eyebrow', 'headline', 'beats'], beatNeed: ['media', 'caption'] },
    logos:   { fields: ASK.concat([['board', 'board', 'str']]), need: ['query', 'board'] },
    quotes:  { fields: ASK, beats: ['quotes', VOICE], need: ['query', 'quotes'], beatNeed: ['lines', 'cite'] },
    offer:   { fields: ASK.concat([['board', 'board', 'str'], ['three', 'three', 'three'], ['cta', 'cta', 'cta']]), need: ['query', 'board'] },
    end:     { fields: [['board', 'board', 'str'], ['line', 'line', 'str']], need: ['board', 'line'] },
  };
  const ITEM = { fields: HEAD, beats: ['beats', BEAT], need: ['eyebrow', 'headline', 'beats'] };
  Object.values(SCENES).forEach(d => d.fields.push(['cue', 'cues', 'cue']));

  // ── named timing points inside a scene ────────────────────────────────
  // A scene's choreography keeps its shape; a cue moves one of its joints. A scene that does
  // not write a cue takes the default, which is the rig's own timing, so writing none changes
  // nothing. `asks`: only for scenes that type a question.
  const OUT = { open: 0.45, title: 0.65, results: 0.34, quotes: 0.34, offer: 0.34 };
  const CUES = {
    typing: { about: 'characters a second the question is typed at', def: () => 40, asks: true, min: 1 },
    in:     { about: 'seconds from the question\'s Enter to the answer starting to arrive', def: () => 0.04, asks: true },
    out:    { about: 'seconds before the scene ends that its content starts to leave', def: t => (OUT[t] != null ? OUT[t] : 0.32), skip: ['end'] },
  };
  const asks = type => !!SCENES[type] && SCENES[type].fields.some(f => f[0] === 'query');
  const cueNames = type => Object.keys(CUES).filter(k => (!CUES[k].asks || asks(type)) && !(CUES[k].skip || []).includes(type));
  // a scene's cue: what it writes, or the default
  function cue(sc, name) {
    const c = CUES[name];
    if (!c) throw new Error(`there is no "${name}" cue`);
    return sc.cues && sc.cues[name] != null ? sc.cues[name] : c.def(sc.type);
  }

  // ── the questions, typed ──────────────────────────────────────────────
  // When each key of each question lands, its Enter, and the select-all before the next one:
  // the rig draws the bar from this and the score plays its keys from it, so both agree.
  // Each question starts just before its section's downbeat, so its answer lands a few hundred
  // ms after the cut; keys are jittered per key, the same jitter on every run.
  const hash01 = i => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  function queries(edit) {
    const when = spans(edit), asked = [];
    edit.scenes.forEach((sc, i) => { if (sc.query) asked.push([sc, i]); });
    return asked.map(([sc, i], k) => {
      const t0 = when[i].start + (k === 0 ? 0.1 : -0.08);
      const times = []; let tt = t0;
      const CPS = cue(sc, 'typing');
      for (let j = 0; j < sc.query.length; j++) { tt += (1 / CPS) * (0.6 + 0.8 * hash01(j + 31 * i)); times.push(tt); }
      const last = k === asked.length - 1;
      return { scene: i, text: sc.query, times, t0, typed: tt, enter: tt + 0.06, clear: last ? Infinity : when[i].end - 0.3, last };
    });
  }

  const a = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
  // a rig name as the script says it, for messages
  const said = (k, def) => {
    if (k === 'media') return 'an "img" or a "video"';
    if (k === 'items') return 'an ITEM';
    if (def.beats && k === def.beats[0]) return 'an @ beat';
    const f = def.fields.find(x => x[1] === k);
    return `a "${f ? f[0] : k}" line`;
  };

  // ── reading ───────────────────────────────────────────────────────────
  // Returns { edit, warnings, marks, fields }. `edit` is what the rig draws. `marks` has one
  // { ln, obj, kind: 'scene'|'item'|'beat', scene, owner } per line that opens a part (`scene`
  // is the scene it is in, `owner` what holds a beat). `fields` has one
  // { ln, owner, key, jsonKey, index, kind } per field line: `index` is its place among its
  // owner's lines of that key (a cue's is its name), null for a field given once. Every mistake
  // is collected, then thrown as one Error whose message has a "line N: …" row for each.
  function parse(src) {
    const errors = [], warnings = [], marks = [], fields = [];
    const fail = (ln, msg) => errors.push({ ln, msg });
    const edit = { scenes: [] };
    let scene = null, item = null, beat = null;          // what the next field belongs to
    // after a SCENE line naming no kind, its lines go nowhere: one mistake, not one per line
    const LOST = { fields: [] };
    const part = (obj, def, label) => ({ obj, def, label, seen: new Set(), fields: new Map(def.fields.map(([k, j, kind]) => [k, { j, kind: KINDS[kind], name: kind }])) });

    String(src).split('\n').forEach((raw, i) => {
      const ln = i + 1;
      let s = raw.trim();
      if (!s || s[0] === '#') return;
      if (/^(SCENE|ITEM|@)/.test(s)) s = s.replace(/\s*\[[^\]]*\]\s*$/, '');   // computed timecodes
      const head = s.split(/\s+/, 1)[0], value = s.slice(head.length).trim(), rest = value.split(/\s+/);
      try {
        if (head === 'SCENE') {
          // a scene opens even when its line is wrong, so its own lines still land on it
          const def = SCENES[rest[0]];
          item = beat = null;
          if (!def) { scene = part({}, LOST, 'lost'); throw new Error(`there is no "${rest[0] || ''}" scene; the kinds are ${Object.keys(SCENES).join(', ')}`); }
          const obj = { type: rest[0], dur: 0 };
          edit.scenes.push(obj);
          scene = part(obj, def, `${obj.type} scene`);
          marks.push({ ln, obj, kind: 'scene', scene: obj, owner: null });
          obj.dur = number(rest[1], 'a scene\'s length');
          if (!(obj.dur > 0)) throw new Error('a scene\'s length should be more than 0');
        } else if (scene && scene.def === LOST) {
          // inside a scene of no known kind: already reported
        } else if (head === 'ITEM') {
          if (!scene || !scene.def.items) throw new Error('an ITEM belongs inside a results scene');
          const obj = { dur: 0 };
          (scene.obj.items = scene.obj.items || []).push(obj);
          item = part(obj, ITEM, 'item'); beat = null;
          marks.push({ ln, obj, kind: 'item', scene: scene.obj, owner: scene.obj });
          obj.dur = number(rest[0], 'an item\'s length');
          if (!(obj.dur > 0)) throw new Error('an item\'s length should be more than 0');
        } else if (head[0] === '@') {
          const owner = item || scene;
          if (!owner) throw new Error('a beat belongs inside a scene');
          if (!owner.def.beats) throw new Error(scene.def.items ? 'the beats of a results scene belong to an ITEM' : `${a(scene.obj.type)} scene has no @ beats`);
          const obj = { at: number(head.length > 1 ? head.slice(1) : rest[0], 'a beat\'s @ time') };
          const [key, fields] = owner.def.beats;
          (owner.obj[key] = owner.obj[key] || []).push(obj);
          beat = part(obj, { fields }, 'beat');
          marks.push({ ln, obj, kind: 'beat', scene: scene.obj, owner: owner.obj });
        } else if (head === 'seed' && !scene) {
          edit.seed = number(value, 'the seed');
        } else if (!scene) {
          throw new Error(`"${head}" comes before the first SCENE line; only "seed" can`);
        } else {
          // a field: the innermost open part that has it takes it (so an award written after
          // a feature's beats still lands on the scene)
          const open = [beat, item, scene].filter(Boolean);
          const p = open.find(x => x.fields.has(head));
          if (!p) throw new Error(`"${head}" is not a field here. ${open.map(x => `${a(x.label).replace(/^a/, 'A')} takes ${[...x.fields.keys()].join(', ')}`).join('. ')}.`);
          if (p === scene) item = beat = null; else if (p === item) beat = null;
          const f = p.fields.get(head), v = f.kind.read(value);
          let index = null;
          if (f.kind.map) {                             // a cue: named, once each, and only where it applies
            const [k, x] = v, type = p.obj.type, o = p.obj[f.j] = p.obj[f.j] || {};
            if (!CUES[k]) throw new Error(`there is no "${k}" cue; ${a(type)} scene has ${cueNames(type).join(', ') || 'none'}`);
            if (!cueNames(type).includes(k)) throw new Error(`${a(type)} scene has no ${k} cue${CUES[k].asks && !asks(type) ? ': it types no question' : ''}`);
            if (k in o) throw new Error(`the ${k} cue is already given for this scene`);
            if (CUES[k].min != null && x < CUES[k].min) throw new Error(`the ${k} cue should be at least ${CUES[k].min}`);
            o[k] = x; index = k;
          } else if (f.kind.many) {
            const list = p.obj[f.j] = p.obj[f.j] || [];
            list.push(v); index = list.length - 1;
          } else {
            if (p.seen.has(head)) throw new Error(`"${head}" is already given for this ${p.label}`);
            if (v !== false) p.obj[f.j] = v;
          }
          p.seen.add(head);
          fields.push({ ln, owner: p.obj, key: head, jsonKey: f.j, index, kind: f.name });
        }
      } catch (e) {
        fail(ln, e.message);
      }
    });

    // what the rig would otherwise trip over
    const lnOf = new Map(marks.map(m => [m.obj, m.ln]));
    const need = (obj, keys, def, label) => (keys || []).forEach(k => {
      if (k === 'media' ? !(obj.img || obj.video) : obj[k] == null) fail(lnOf.get(obj), `this ${label} needs ${said(k, def)}`);
    });
    if (!edit.scenes.length && !errors.length) fail(0, 'there are no SCENE lines: a reel needs at least one scene');
    edit.scenes.forEach(sc => {
      const def = SCENES[sc.type], ln = lnOf.get(sc), lists = [];
      need(sc, def.need, def, `${sc.type} scene`);
      if (sc.type === 'answer') (sc.stats || []).forEach(s => { if (s.at == null) fail(ln, 'every stat in an answer scene needs an @ time, as in "stat @1 14 years designing"'); });
      if (def.beats) lists.push({ owner: sc, key: def.beats[0], dur: sc.dur, label: 'scene', beatDef: { fields: def.beats[1] }, beatNeed: def.beatNeed });
      if (def.items && sc.items) {
        const run = sc.items.reduce((a, it) => a + it.dur, 0);
        if (run >= sc.dur) fail(ln, `its items run ${+run.toFixed(3)} s but the scene is ${sc.dur} s; the result list needs time to show before the first item`);
        sc.items.forEach(it => {
          need(it, ITEM.need, ITEM, 'item');
          lists.push({ owner: it, key: 'beats', dur: it.dur, label: 'item', beatDef: { fields: BEAT } });
          if (it.beats && !it.beats.some(b => b.img || b.video)) warnings.push(`line ${lnOf.get(it)}: this item has no picture, so its window shows nothing`);
        });
      }
      lists.forEach(({ owner, key, dur, label, beatDef, beatNeed }) => {
        const bs = owner[key] || [], sorted = bs.slice().sort((a, b) => a.at - b.at);
        if (sorted.some((b, k) => b !== bs[k])) { owner[key] = sorted; warnings.push(`line ${lnOf.get(owner)}: its @ beats are out of order; they play in time order`); }
        sorted.forEach(b => {
          if (b.at < 0 || b.at >= dur) warnings.push(`line ${lnOf.get(b)}: @${b.at} is outside its ${label}, which runs 0 to ${dur} s`);
          need(b, beatNeed, beatDef, 'beat');
        });
      });
    });
    if (errors.length) {
      const rows = errors.sort((x, y) => x.ln - y.ln).map(x => x.ln ? `line ${x.ln}: ${x.msg}` : x.msg);
      const e = new Error(rows.join('\n')); e.errors = rows; throw e;
    }
    return { edit, warnings, marks, fields };
  }

  // ── when things happen, in seconds from the top of the reel ───────────
  function spans(edit) {
    let t = 0;
    return edit.scenes.map(sc => {
      const c = { start: t, end: t + sc.dur };
      if (sc.items) {                               // the items follow the result list, to the scene's end
        let at = c.end - sc.items.reduce((a, it) => a + it.dur, 0);
        c.items = sc.items.map(it => { const r = { start: at, end: at + it.dur }; at += it.dur; return r; });
      }
      t = c.end;
      return c;
    });
  }
  const tc = s => {
    const m = Math.floor(s / 60 + 1e-9), r = s - m * 60;
    const f = r.toFixed(2).replace(/0$/, '');
    return `${m}:${r < 10 ? '0' : ''}${f}`;
  };
  // every scene, item and beat with the words its [bracket] shows
  function stamps(edit) {
    const when = spans(edit), out = new Map();
    edit.scenes.forEach((sc, i) => {
      const c = when[i], def = SCENES[sc.type];
      out.set(sc, `${tc(c.start)} → ${tc(c.end)}`);
      const beats = (owner, key, t0) => (owner[key] || []).forEach(b => out.set(b, tc(t0 + b.at)));
      if (def.beats) beats(sc, def.beats[0], c.start);
      (sc.items || []).forEach((it, k) => { out.set(it, `${tc(c.items[k].start)} → ${tc(c.items[k].end)}`); beats(it, 'beats', c.items[k].start); });
    });
    return out;
  }

  // ── writing ───────────────────────────────────────────────────────────
  const COL = 52;                                   // where the [bracketed] timecodes line up
  const stamp = (line, note) => (line.length < COL - 1 ? line.padEnd(COL) : line + '  ') + `[${note}]`;
  function writeFields(out, obj, fields, pad) {
    fields.forEach(([k, j, kind]) => {
      const v = obj[j], K = KINDS[kind];
      if (v == null || v === false) return;
      if (kind === 'flag') { out.push(pad + k); return; }
      const key = (pad + k).padEnd(pad.length + 9);
      (K.map ? Object.entries(v) : K.many ? v : [v]).forEach(x => out.push(key + K.write(x)));
    });
  }
  // the whole script, written fresh from an edit (how cut 2 moved out of media-kit.json)
  function format(edit, preamble) {
    const out = [], when = stamps(edit);
    if (preamble) out.push(...preamble.replace(/\s+$/, '').split('\n'), '');
    if (edit.seed != null) out.push(`seed ${edit.seed}`, '');
    edit.scenes.forEach(sc => {
      const def = SCENES[sc.type];
      out.push(stamp(`SCENE ${sc.type} ${sc.dur}`, when.get(sc)));
      writeFields(out, sc, def.fields, '  ');
      const beats = (owner, key, fields, pad) => (owner[key] || []).forEach(b => {
        out.push(stamp(`${pad}@${b.at}`, when.get(b)));
        writeFields(out, b, fields, pad + '  ');
      });
      if (def.beats) beats(sc, def.beats[0], def.beats[1], '  ');
      (sc.items || []).forEach(it => {
        out.push(stamp(`  ITEM ${it.dur}`, when.get(it)));
        writeFields(out, it, ITEM.fields, '    ');
        beats(it, 'beats', BEAT, '    ');
      });
      out.push('');
    });
    return out.join('\n');
  }
  // refresh only the [bracketed] timecodes; every other character stays as it was written
  function retime(src) {
    const { edit, marks } = parse(src), when = stamps(edit), lines = String(src).split('\n');
    marks.forEach(({ ln, obj }) => {
      const raw = lines[ln - 1], cr = raw.endsWith('\r') ? '\r' : '';
      lines[ln - 1] = stamp(raw.replace(/\r$/, '').replace(/\s*\[[^\]]*\]\s*$/, ''), when.get(obj)) + cr;
    });
    return lines.join('\n');
  }

  // ── the cue sheet: everything that happens, in the order it happens ───
  function cueSheet(edit) {
    const when = spans(edit), out = [];
    const clip = p => p.replace(/^\.\//, '');
    const gist = b => [
      b.video ? `video ${clip(b.video)}${b.from != null ? ' from ' + b.from : ''}${b.loop ? ' (loop)' : ''}` : b.img ? `img ${clip(b.img)}` : '',
      b.caption || b.lead || (b.quote || b.line || b.lines || []).join(' / '),
    ].filter(Boolean).join('  ·  ');
    edit.scenes.forEach((sc, i) => {
      const c = when[i], def = SCENES[sc.type], cs = [];
      (sc.stats || []).forEach(s => { if (s.at != null) cs.push([c.start + s.at, 1, `stat ${s.n} ${s.label}`]); });
      (sc.awards || []).forEach(a => cs.push([c.start + a.at, 1, `award ${a.yr} ${a.text}`]));
      if (def.beats) (sc[def.beats[0]] || []).forEach(b => cs.push([c.start + b.at, 1, `@${b.at}  ${gist(b)}`]));
      (sc.items || []).forEach((it, k) => {
        cs.push([c.items[k].start, 1, `ITEM ${it.dur} s  ${it.eyebrow || ''}`]);
        (it.beats || []).forEach(b => cs.push([c.items[k].start + b.at, 2, `@${b.at}  ${gist(b)}`]));
      });
      cs.sort((a, b) => a[0] - b[0]);
      const label = sc.query || sc.name || sc.caption || sc.line || '';
      const moved = sc.cues ? '  (cue ' + Object.entries(sc.cues).map(([k, x]) => `${k} ${x}`).join(', ') + ')' : '';
      out.push(`${tc(c.start).padEnd(9)}${sc.type.toUpperCase()} ${sc.dur} s${label ? '  ' + label : ''}${moved}`);
      cs.forEach(([t, depth, what]) => out.push(`${tc(t).padEnd(9)}${'  '.repeat(depth)}${what}`));
    });
    const total = when.length ? when[when.length - 1].end : 0;
    out.push('', `total ${tc(total)} (${+total.toFixed(3)} s, ${Math.round(total * 60)} frames at 60 fps)`);
    return out.join('\n');
  }

  // ── changing a script the way a person would, one line at a time ──────
  // Each takes the script and a line number from parse(src).marks or .fields, changes that line
  // (setCue may add or remove one), refreshes the [bracketed] timecodes and returns the new
  // script. A change that would break the script throws parse's error, lines and all.
  const num = n => { const x = Number(n); if (!Number.isFinite(x)) throw new Error(`"${n}" is not a number`); return String(+x.toFixed(3)); };
  function setLine(src, ln, change) {
    const lines = String(src).split('\n'), i = ln - 1;
    if (!(i >= 0 && i < lines.length)) throw new Error(`there is no line ${ln}`);
    const cr = lines[i].endsWith('\r') ? '\r' : '';
    lines[i] = change(lines[i].replace(/\r$/, '')) + cr;
    return retime(lines.join('\n'));
  }
  // a scene's or an item's length, on its SCENE or ITEM line
  const setDur = (src, ln, dur) => setLine(src, ln, s => {
    const m = /^(\s*)(SCENE\s+\S+|ITEM)\s+\S+(.*)$/.exec(s);
    if (!m) throw new Error(`line ${ln} is not a SCENE or ITEM line`);
    return `${m[1]}${m[2]} ${num(dur)}${m[3]}`;
  });
  // a beat's time, on its @ line
  const setAt = (src, ln, at) => setLine(src, ln, s => {
    const m = /^(\s*)@\s*[^\s[]+(.*)$/.exec(s);
    if (!m) throw new Error(`line ${ln} is not an @ beat line`);
    return `${m[1]}@${num(at)}${m[2]}`;
  });
  // the words after a field's name (the name and its spacing stay)
  const setField = (src, ln, value) => setLine(src, ln, s => {
    const m = /^(\s*[^\s#@]\S*\s+)\S.*$/.exec(s);
    if (!m || /^\s*(SCENE|ITEM)\b/.test(s)) throw new Error(`line ${ln} is not a field with words to change`);
    const v = String(value).replace(/\s+/g, ' ').trim();
    if (!v) throw new Error('a field needs some words');
    return m[1] + v;
  });
  // a scene's cue: rewritten where it is, added after the scene's own lines, or (value null) removed
  function setCue(src, sceneLn, name, value) {
    const { marks, fields } = parse(src);
    const scene = marks.find(m => m.ln === sceneLn && m.kind === 'scene');
    if (!scene) throw new Error(`line ${sceneLn} is not a SCENE line`);
    if (!cueNames(scene.obj.type).includes(name)) throw new Error(`${a(scene.obj.type)} scene has no ${name} cue`);
    const own = fields.filter(f => f.owner === scene.obj);
    const there = own.find(f => f.key === 'cue' && f.index === name);
    if (there && value != null) return setField(src, there.ln, `${name} ${num(value)}`);
    const lines = String(src).split('\n');
    if (there) lines.splice(there.ln - 1, 1);
    else if (value != null) {
      const firstChild = Math.min(...marks.filter(m => m.scene === scene.obj && m.kind !== 'scene').map(m => m.ln), Infinity);
      const before = own.filter(f => f.ln < firstChild).map(f => f.ln);
      const after = before.length ? Math.max(...before) : sceneLn;
      const indent = own.length ? /^\s*/.exec(lines[own[0].ln - 1])[0] : '  ';
      lines.splice(after, 0, `${indent}${'cue'.padEnd(9)}${name} ${num(value)}`);
    } else return src;
    return retime(lines.join('\n'));
  }

  // ── the command line ──────────────────────────────────────────────────
  function main(argv) {
    const fs = require('fs'), path = require('path');
    const cmd = argv[0] || 'check';
    const file = path.resolve(argv[1] || path.join(__dirname, '..', 'Assets', 'sizzle-reel-2.script.txt'));
    const name = path.relative(process.cwd(), file) || file;
    if (!['check', 'fmt', 'json'].includes(cmd)) { console.error('usage: node scripts/reel-script.js check|fmt|json [file]'); process.exit(2); }
    const src = fs.readFileSync(file, 'utf8');
    let res;
    try { res = parse(src); } catch (e) {
      console.error(`${name} has ${e.errors ? e.errors.length : 1} mistake${e.errors && e.errors.length > 1 ? 's' : ''}:\n  ${e.message.split('\n').join('\n  ')}`);
      process.exit(1);
    }
    if (cmd === 'json') { process.stdout.write(JSON.stringify(res.edit, null, 2) + '\n'); return; }
    if (cmd === 'fmt') {
      const next = retime(src);
      if (next !== src) fs.writeFileSync(file, next);
      console.log(next === src ? `${name}: the timecodes were already current\n` : `${name}: timecodes refreshed\n`);
    }
    console.log(cueSheet(res.edit));
    // a missing picture films as an empty window, so say so before anything is rendered
    const dir = path.dirname(file), files = new Set();
    res.edit.scenes.forEach(sc => [sc].concat(sc.items || []).forEach(o => {
      (o.beats || []).forEach(b => [b.img, b.video].forEach(p => p && files.add(p)));
      (o.rows || []).forEach(r => r.thumb && files.add(r.thumb));
    }));
    const missing = [...files].filter(p => !fs.existsSync(path.resolve(dir, p))).map(p => `${p} is not in ${path.relative(process.cwd(), dir) || '.'}`);
    const notes = res.warnings.concat(missing);
    if (notes.length) console.log('\n' + notes.map(w => 'warning: ' + w).join('\n'));
  }

  return { parse, format, retime, spans, queries, cueSheet, SCENES, CUES, cue, cueNames, setDur, setAt, setField, setCue, main };
});
