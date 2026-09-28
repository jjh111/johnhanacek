// The sizzle reel's music: reads a score (Assets/<name>.score.txt), checks it, and arranges it
// against the reel's script into a list of timed notes. Pure: no audio, no DOM. The synths that
// play the list are scripts/reel-synth.js; the rack that edits the score is scripts/reel-rack.js.
//
//   node scripts/reel-music.js check [score] [script]   the arrangement, section by section
//   node scripts/reel-music.js json  [score] [script]   the parsed score and every event, as JSON
//
// A script's music is the .score.txt with its name: Assets/sizzle-reel-2.script.txt plays
// Assets/sizzle-reel-2.score.txt. The format is explained at the top of that file.
//
// In a page: a classic script defining window.ReelMusic. In Node: require('./reel-music.js').
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    if (typeof require === 'function' && require.main === module) api.main(process.argv.slice(2));
  } else root.ReelMusic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── the vocabulary ────────────────────────────────────────────────────
  const WAVES = { sine: 'sine', triangle: 'triangle', square: 'square', saw: 'sawtooth', sawtooth: 'sawtooth', noise: 'noise' };
  const FILTERS = ['lowpass', 'highpass', 'bandpass', 'notch', 'lowshelf', 'highshelf', 'peaking', 'allpass'];
  const DRUMS = ['kick', 'snare', 'clap', 'hat', 'openhat', 'shaker', 'tick', 'boom'];
  const MOMENTS = ['key', 'space', 'enter', 'clear', 'cut', 'item', 'beat'];
  const PLAYS = { chord: ['oct'], root: ['oct'], arp: ['oct', 'dir'], notes: [], hit: ['oct'], rise: ['beats'], chime: ['oct'], note: ['name'] };
  const DIRS = ['up', 'down', 'updown'];
  // one row per field a block may carry: [name, argument kinds, can repeat]. A number is 'n'.
  const MIX = { level: [['n']], pan: [['n']], send: [['n', 'n']], on: [['moment']] };
  const BLOCKS = {
    SYNTH: Object.assign({ voice: [['wave', 'n', 'n'], true], filter: [['filter', 'n', 'n']], env: [['n', 'n', 'n', 'n']],
      lfo: [['lfo', 'n', 'n']], play: [['play']], steps: [['steps']], notes: [['notes']], len: [['n']] }, MIX),
    DRUM: Object.assign({ kind: [['drum']], tune: [['n']], decay: [['n']], tone: [['n']], steps: [['steps']] }, MIX),
    SECTION: { play: [['tracks']], chords: [['chords']], sweep: [['n', 'n']] },
  };
  // the effects, each field's default and what it means (the rack's knobs read these too)
  const FX = {
    reverb: { size: [2.8, 0.2, 8, 's'], decay: [3, 0.5, 8, ''], tone: [5200, 400, 16000, 'Hz'], return: [0.5, 0, 1.5, ''] },
    delay:  { time: [0.75, 0.125, 4, 'beats'], feedback: [0.38, 0, 0.92, ''], tone: [2800, 300, 12000, 'Hz'], return: [0.32, 0, 1.5, ''] },
    tape:   { wow: [0.25, 0, 1, ''], flutter: [0.15, 0, 1, ''], age: [9000, 1200, 20000, 'Hz'], hiss: [0.04, 0, 0.5, ''] },
    drive:  { amount: [0.18, 0, 1, ''] },
    comp:   { threshold: [-16, -60, 0, 'dB'], ratio: [3, 1, 20, ':1'], attack: [0.01, 0.001, 0.5, 's'], release: [0.2, 0.02, 1.5, 's'] },
    master: { level: [0.85, 0, 1.5, ''], fade: [[0, 1.8], 0, 10, 's'] },
  };
  // a track's defaults, so a missing line still plays
  const SYNTH_DEF = { filter: null, env: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 }, lfo: null, len: 1 };
  const DRUM_DEF = { kick: { tune: 52, decay: 0.32, tone: 0 }, snare: { tune: 190, decay: 0.16, tone: 1800 }, clap: { tune: 0, decay: 0.18, tone: 1300 },
    hat: { tune: 0, decay: 0.045, tone: 8200 }, openhat: { tune: 0, decay: 0.3, tone: 7600 }, shaker: { tune: 0, decay: 0.05, tone: 6200 },
    tick: { tune: 2600, decay: 0.025, tone: 0 }, boom: { tune: 42, decay: 1.4, tone: 600 } };
  const STEP_VEL = { X: 1, x: 0.78, o: 0.45 };

  // ── notes and chords ──────────────────────────────────────────────────
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14],
    maj9: [0, 4, 7, 11, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '5': [0, 7] };
  const pcOf = (l, acc) => (PC[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  function noteMidi(s) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    return m ? pcOf(m[1], m[2]) + 12 * (+m[3] + 1) : null;
  }
  function chord(s) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(s);
    if (!m || !QUAL.hasOwnProperty(m[3])) return null;
    return { name: s, root: pcOf(m[1], m[2]), tones: QUAL[m[3]] };
  }
  // a chord's notes from the root at octave `oct` (midi numbers)
  const voicing = (c, oct) => c.tones.map(i => c.root + 12 * (oct + 1) + i);

  // ── reading ───────────────────────────────────────────────────────────
  const num = v => { const n = +v; return v !== '' && isFinite(n) ? n : null; };
  const fmtNum = n => String(Math.round(n * 10000) / 10000);
  const KEY_W = 9;                                  // field names are padded to this column
  const fieldLine = (key, text) => '  ' + key + ' '.repeat(Math.max(1, KEY_W - key.length)) + text;

  // Returns { score, warnings, blocks, fields }. `blocks`: one { ln, end, kind, name, obj } per
  // SYNTH/DRUM/FX/SECTION line (`end`: its last line). `fields`: one { ln, block, key, index, args }
  // per field line (`index`: its place among the block's lines of that key). A mistake throws
  // one Error whose `.errors` lists "line N: …" rows.
  function parse(src) {
    const errors = [], warnings = [], blocks = [], fields = [];
    const score = { tempo: 120, key: { root: 9, mode: 'minor', name: 'A minor' }, chords: [], tracks: [], fx: {}, sections: [] };
    for (const [k, d] of Object.entries(FX)) { score.fx[k] = {}; for (const [f, v] of Object.entries(d)) score.fx[k][f] = Array.isArray(v[0]) ? v[0].slice() : v[0]; }
    const lines = src.split('\n');
    let cur = null;
    const err = (ln, msg) => errors.push(`line ${ln}: ${msg}`);
    lines.forEach((raw, i) => {
      const ln = i + 1, line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trimEnd();
      if (!line.trim()) return;
      const indented = /^\s/.test(line);
      const words = line.trim().split(/\s+/), head = words[0], rest = words.slice(1);
      if (!indented) {
        cur = null;
        if (head === 'TEMPO') { const n = num(rest[0]); if (n == null || n < 40 || n > 240) err(ln, 'TEMPO wants beats a minute, 40-240'); else score.tempo = n; return; }
        if (head === 'KEY') {
          const m = /^([A-G])([#b]?)$/.exec(rest[0] || ''), mode = rest[1] || 'major';
          if (!m || !['major', 'minor'].includes(mode)) err(ln, 'KEY wants a note and major or minor, as in "KEY A minor"');
          else score.key = { root: pcOf(m[1], m[2]), mode, name: rest[0] + ' ' + mode };
          return;
        }
        if (head === 'CHORDS') { score.chords = readChords(rest, ln, err); return; }
        if (head === 'SYNTH' || head === 'DRUM' || head === 'FX' || head === 'SECTION') {
          const name = rest[0];
          if (!name || rest.length > 1) { err(ln, `${head} wants one name, as in "${head} ${head === 'FX' ? 'reverb' : head === 'SECTION' ? 'answer' : 'pad'}"`); return; }
          let obj;
          if (head === 'FX') {
            if (!FX[name]) { err(ln, `there is no "${name}" effect (there are ${Object.keys(FX).join(', ')})`); return; }
            if (blocks.some(b => b.kind === 'FX' && b.name === name)) { err(ln, `FX ${name} is already given`); return; }
            obj = score.fx[name];
          } else if (head === 'SECTION') {
            if (score.sections.some(s => s.ref === name)) { err(ln, `SECTION ${name} is already given`); return; }
            obj = { ref: name, ln, play: [], chords: null, sweep: null };
            score.sections.push(obj);
          } else {
            if (!/^[a-z][\w-]*$/i.test(name)) { err(ln, `a track name is one word: "${name}"`); return; }
            if (score.tracks.some(t => t.name === name)) { err(ln, `there is already a track called ${name}`); return; }
            obj = head === 'SYNTH'
              ? { name, type: 'synth', ln, voices: [], filter: null, env: Object.assign({}, SYNTH_DEF.env), lfo: null, play: null, steps: null, notes: null, len: 1, level: 0.5, pan: 0, send: [0, 0], on: null }
              : { name, type: 'drum', ln, kind: null, tune: null, decay: null, tone: null, steps: null, level: 0.5, pan: 0, send: [0, 0], on: null };
            score.tracks.push(obj);
          }
          cur = { ln, end: ln, kind: head, name, obj, counts: {} };
          blocks.push(cur);
          return;
        }
        err(ln, `"${head}" is not a line this score knows (TEMPO, KEY, CHORDS, SYNTH, DRUM, FX, SECTION)`);
        return;
      }
      // an indented line: a field of the block above
      if (!cur) { err(ln, 'an indented line belongs under a SYNTH, DRUM, FX or SECTION line'); return; }
      cur.end = ln;
      const index = cur.counts[head] = (cur.counts[head] == null ? 0 : cur.counts[head] + 1);
      fields.push({ ln, block: cur, key: head, index, args: rest });
      readField(cur, head, rest, index, ln, err, score);
    });
    // what each track needs to make a sound
    for (const t of score.tracks) {
      const at = `line ${t.ln}`;
      if (t.type === 'synth') {
        if (!t.voices.length) errors.push(`${at}: SYNTH ${t.name} has no voice line`);
        if (!t.play) errors.push(`${at}: SYNTH ${t.name} has no play line`);
        else if (['root', 'arp'].includes(t.play.mode) && !t.steps) errors.push(`${at}: SYNTH ${t.name} plays ${t.play.mode}, which needs a steps line`);
        else if (t.play.mode === 'notes' && !t.notes) errors.push(`${at}: SYNTH ${t.name} plays notes, which needs a notes line`);
      } else {
        if (!t.kind) errors.push(`${at}: DRUM ${t.name} has no kind line`);
        else for (const k of ['tune', 'decay', 'tone']) if (t[k] == null) t[k] = DRUM_DEF[t.kind][k];
      }
      if (t.on && t.type === 'synth' && t.play && !['chime', 'note', 'hit'].includes(t.play.mode)) errors.push(`${at}: a sound effect (${t.name}, on ${t.on}) plays chime, note or hit`);
    }
    for (const s of score.sections) for (const p of s.play) {
      const t = score.tracks.find(x => x.name === p.name);
      if (!t) errors.push(`line ${s.ln}: SECTION ${s.ref} plays ${p.name}, and there is no track called that`);
      else if (t.on) errors.push(`line ${s.ln}: ${p.name} plays on ${t.on} by itself; a section can't play it`);
    }
    if (!score.chords.length) score.chords = [chord(score.key.mode === 'minor' ? noteName(score.key.root) + 'm' : noteName(score.key.root))];
    if (errors.length) { const e = new Error(errors.join('\n')); e.errors = errors; throw e; }
    blocks.forEach(b => delete b.counts);
    return { score, warnings, blocks, fields };
  }
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = pc => NAMES[pc];

  function readChords(words, ln, err) {
    const out = [];
    for (const w of words) { const c = chord(w); if (!c) err(ln, `"${w}" is not a chord this score knows (as in Am, F, C7, Fmaj7, Am9, Dsus4)`); else out.push(c); }
    if (!words.length) err(ln, 'CHORDS wants at least one chord');
    return out;
  }

  function readField(b, key, args, index, ln, err, score) {
    const spec = b.kind === 'FX' ? null : BLOCKS[b.kind][key];
    if (b.kind === 'FX') {
      const d = FX[b.name][key];
      if (!d) { err(ln, `FX ${b.name} has no "${key}" (it has ${Object.keys(FX[b.name]).join(', ')})`); return; }
      const want = Array.isArray(d[0]) ? d[0].length : 1, ns = args.map(num);
      if (ns.length !== want || ns.some(n => n == null)) { err(ln, `${key} wants ${want === 1 ? 'a number' : want + ' numbers'}`); return; }
      if (index > 0) { err(ln, `${key} is already given`); return; }
      b.obj[key] = want === 1 ? ns[0] : ns;
      return;
    }
    if (!spec) { err(ln, `${b.kind} has no "${key}" line (it has ${Object.keys(BLOCKS[b.kind]).join(', ')})`); return; }
    if (index > 0 && !spec[1]) { err(ln, `${key} is already given`); return; }
    const kinds = spec[0], o = b.obj;
    // free-form fields first
    if (kinds[0] === 'steps') {
      const s = args.join('');
      if (!/^[Xxo.]+$/.test(s)) { err(ln, 'steps are X, x, o and . (sixteen to a bar)'); return; }
      o.steps = s; return;
    }
    if (kinds[0] === 'notes') {
      const toks = args.filter(w => w !== '|');
      const bad = toks.filter(w => w !== '.' && noteMidi(w) == null);
      if (bad.length || !toks.length) { err(ln, `notes are note names like E5 or C#4, or . to rest${bad.length ? ` ("${bad[0]}" is not)` : ''}`); return; }
      o.notes = toks; return;
    }
    if (kinds[0] === 'tracks') {
      o.play = [];
      for (const w of args) {
        const m = /^([a-z][\w-]*)(?::([\d.]+))?$/i.exec(w);
        if (!m || (m[2] != null && num(m[2]) == null)) { err(ln, `"${w}" should be a track name, or name:level`); continue; }
        o.play.push({ name: m[1], level: m[2] != null ? +m[2] : 1 });
      }
      return;
    }
    if (kinds[0] === 'chords') { o.chords = readChords(args, ln, err); return; }
    if (kinds[0] === 'play') {
      const mode = args[0], want = PLAYS[mode];
      if (!want) { err(ln, `play wants one of ${Object.keys(PLAYS).join(', ')}`); return; }
      const p = { mode };
      for (let i = 0; i < want.length; i++) {
        const a = args[i + 1], k = want[i];
        if (k === 'oct') { const n = num(a); if (n == null || n < 0 || n > 8 || n !== Math.round(n)) { err(ln, `play ${mode} wants an octave, 0-8`); return; } p.oct = n; }
        if (k === 'beats') { const n = num(a); if (n == null || n <= 0) { err(ln, 'play rise wants how many beats it rises for'); return; } p.beats = n; }
        if (k === 'dir') { if (!DIRS.includes(a)) { err(ln, 'play arp wants up, down or updown after its octave'); return; } p.dir = a; }
        if (k === 'name') { const m = noteMidi(a || ''); if (m == null) { err(ln, 'play note wants a note name, like E6'); return; } p.midi = m; p.name = a; }
      }
      if (args.length !== want.length + 1) { err(ln, `play ${mode} wants ${want.length ? want.join(' and ') : 'nothing else'}`); return; }
      o.play = p; return;
    }
    if (args.length !== kinds.length) { err(ln, `${key} wants ${kinds.length} value${kinds.length > 1 ? 's' : ''}`); return; }
    const vals = [];
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i], a = args[i];
      if (k === 'n') { const n = num(a); if (n == null) { err(ln, `${key}: "${a}" is not a number`); return; } vals.push(n); }
      else if (k === 'wave') { if (!WAVES[a]) { err(ln, `a voice's wave is ${Object.keys(WAVES).filter(w => w !== 'sawtooth').join(', ')}`); return; } vals.push(WAVES[a]); }
      else if (k === 'filter') { if (!FILTERS.includes(a)) { err(ln, `a filter is ${FILTERS.join(', ')}`); return; } vals.push(a); }
      else if (k === 'lfo') { if (!['gain', 'filter', 'pitch'].includes(a)) { err(ln, 'an lfo moves gain, filter or pitch'); return; } vals.push(a); }
      else if (k === 'drum') { if (!DRUMS.includes(a)) { err(ln, `a drum is ${DRUMS.join(', ')}`); return; } vals.push(a); }
      else if (k === 'moment') { if (!MOMENTS.includes(a)) { err(ln, `on wants ${MOMENTS.join(', ')}`); return; } vals.push(a); }
    }
    switch (key) {
      case 'voice': o.voices.push({ wave: vals[0], cents: vals[1], level: vals[2] }); break;
      case 'filter': o.filter = { type: vals[0], freq: vals[1], q: vals[2] }; break;
      case 'env': o.env = { attack: Math.max(0.001, vals[0]), decay: Math.max(0, vals[1]), sustain: Math.min(1, Math.max(0, vals[2])), release: Math.max(0.005, vals[3]) }; break;
      case 'lfo': o.lfo = { target: vals[0], rate: vals[1], depth: vals[2] }; break;
      case 'send': o.send = [vals[0], vals[1]]; break;
      case 'sweep': o.sweep = [vals[0], vals[1]]; break;
      case 'pan': o.pan = Math.max(-1, Math.min(1, vals[0])); break;
      default: o[key] = vals[0];
    }
  }

  // ── the reel's moments ────────────────────────────────────────────────
  // Every moment the edit makes a sound at: each key of a typed question (space apart), its
  // Enter, the select-all before the next question, each cut, each ITEM and each @ beat.
  // `RS` is scripts/reel-script.js, so the keys land exactly where the rig types them.
  function moments(edit, RS) {
    const out = [], when = RS.spans(edit);
    for (const q of RS.queries(edit)) {
      q.times.forEach((t, i) => out.push({ t, kind: q.text[i] === ' ' ? 'space' : 'key', i }));
      out.push({ t: q.enter, kind: 'enter' });
      if (isFinite(q.clear)) out.push({ t: q.clear, kind: 'clear' });
    }
    edit.scenes.forEach((sc, i) => {
      const c = when[i], def = RS.SCENES[sc.type];
      out.push({ t: c.start, kind: 'cut', scene: i });
      if (def.beats) (sc[def.beats[0]] || []).forEach(b => { if (b.at > 0) out.push({ t: c.start + b.at, kind: 'beat' }); });
      (sc.items || []).forEach((it, k) => {
        out.push({ t: c.items[k].start, kind: 'item' });
        (it.beats || []).forEach(b => { if (b.at > 0) out.push({ t: c.items[k].start + b.at, kind: 'beat' }); });
      });
    });
    return out.sort((a, b) => a.t - b.t);
  }

  // ── arranging ─────────────────────────────────────────────────────────
  // The score against the reel: `scenes` [{ type, start, end }], `moments` from moments().
  // Returns { events, sections, sweeps, duration }. An event is a note or a hit:
  //   { t, dur, track, vel, midi? (synths), detune? (cents), rise? }
  // Patterns start at each section's cut; chords change every bar from the cut.
  const hash01 = i => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  function arrange(score, scenes, mom) {
    const beat = 60 / score.tempo, step = beat / 4, bar = beat * 4;
    const duration = scenes.length ? scenes[scenes.length - 1].end : 0;
    const events = [], sections = [], sweeps = [];
    const byName = n => score.tracks.find(t => t.name === n);
    for (const s of score.sections) {
      let i = /^\d+$/.test(s.ref) ? +s.ref - 1 : scenes.findIndex(x => x.type === s.ref);
      if (!/^\d+$/.test(s.ref) && scenes.filter(x => x.type === s.ref).length > 1) throw withErrors([`line ${s.ln}: there are ${scenes.filter(x => x.type === s.ref).length} ${s.ref} scenes; name this one by its number`]);
      const sc = scenes[i];
      if (!sc) throw withErrors([`line ${s.ln}: the script has no ${/^\d+$/.test(s.ref) ? 'scene ' + s.ref : s.ref + ' scene'}`]);
      sections.push({ ref: s.ref, ln: s.ln, scene: i, type: sc.type, start: sc.start, end: sc.end, chords: s.chords || score.chords, play: s.play, sweep: s.sweep });
    }
    sections.sort((a, b) => a.start - b.start);
    const chordAt = t => {
      const s = sections.find(x => t >= x.start - 1e-9 && t < x.end - 1e-9) || sections[sections.length - 1];
      if (!s) return score.chords[0];
      return s.chords[Math.floor((t - s.start) / bar + 1e-9) % s.chords.length];
    };
    for (const s of sections) {
      const len = s.end - s.start, chords = s.chords;
      const chordIn = t => chords[Math.floor((t - s.start) / bar + 1e-9) % chords.length];
      if (s.sweep) sweeps.push({ t0: s.start, t1: s.end, from: s.sweep[0], to: s.sweep[1] });
      for (const p of s.play) {
        const tr = byName(p.name), lvl = p.level, push = e => events.push(Object.assign({ track: tr.name }, e));
        const stepsDo = fn => {
          if (!tr.steps) return;
          for (let k = 0; s.start + k * step < s.end - 1e-9; k++) {
            const c = tr.steps[k % tr.steps.length];
            if (c === '.') continue;
            fn(s.start + k * step, STEP_VEL[c] * lvl, k);
          }
        };
        const noteLen = t => Math.max(step * 0.5, Math.min((tr.len || 1) * step, s.end - t));
        if (tr.type === 'drum') {
          if (tr.steps) stepsDo((t, vel) => push({ t, dur: tr.decay, vel }));
          else push({ t: s.start, dur: tr.decay, vel: lvl });          // a drum with no steps lands on the cut
          continue;
        }
        const m = tr.play;
        if (m.mode === 'chord') {
          // held for the bar; a chord that stays for the next bar is held on, not struck again
          for (let b = 0; s.start + b * bar < s.end - 1e-9;) {
            const t = s.start + b * bar, c = chordIn(t);
            let n = 1; while (s.start + (b + n) * bar < s.end - 1e-9 && chordIn(s.start + (b + n) * bar) === c) n++;
            const dur = Math.min(n * bar, s.end - t);
            voicing(c, m.oct).forEach(midi => push({ t, dur, vel: lvl, midi }));
            b += n;
          }
        } else if (m.mode === 'root') {
          stepsDo((t, vel) => push({ t, dur: noteLen(t), vel, midi: voicing(chordIn(t), m.oct)[0] }));
        } else if (m.mode === 'arp') {
          let n = 0;
          stepsDo((t, vel) => {
            const v = voicing(chordIn(t), m.oct), run = v.concat(v.map(x => x + 12));
            const seq = m.dir === 'up' ? run : m.dir === 'down' ? run.slice().reverse() : run.concat(run.slice(1, -1).reverse());
            push({ t, dur: noteLen(t), vel, midi: seq[n++ % seq.length] });
          });
        } else if (m.mode === 'notes') {
          for (let k = 0; s.start + k * step < s.end - 1e-9; k++) {
            const w = tr.notes[k % tr.notes.length];
            if (w === '.') continue;
            const t = s.start + k * step;
            push({ t, dur: noteLen(t), vel: lvl, midi: noteMidi(w) });
          }
        } else if (m.mode === 'hit') {
          voicing(chordIn(s.start), m.oct).forEach(midi => push({ t: s.start, dur: Math.min(bar, len), vel: lvl, midi }));
        } else if (m.mode === 'rise') {
          const t0 = Math.max(s.start, s.end - m.beats * beat);
          push({ t: t0, dur: s.end - t0, vel: lvl, rise: true });
        }
      }
    }
    // the sound effects: every moment of their kind
    for (const tr of score.tracks.filter(t => t.on)) {
      mom.filter(m => m.kind === tr.on).forEach((m, k) => {
        const vary = hash01(k + 97 * tr.name.length);
        if (tr.type === 'drum') { events.push({ track: tr.name, t: m.t, dur: tr.decay, vel: 0.8 + 0.2 * vary, detune: (vary - 0.5) * 120 }); return; }
        const p = tr.play;
        if (p.mode === 'note') events.push({ track: tr.name, t: m.t, dur: tr.env.attack + tr.env.decay, vel: 1, midi: p.midi });
        else voicing(chordAt(m.t), p.oct).forEach((midi, j) => events.push({ track: tr.name, t: m.t + (p.mode === 'chime' ? j * 0.045 : 0), dur: tr.env.attack + tr.env.decay, vel: p.mode === 'chime' ? 1 - j * 0.12 : 1, midi }));
      });
    }
    events.sort((a, b) => a.t - b.t || (a.track < b.track ? -1 : 1));
    return { events, sections, sweeps, duration, beat, step, bar };
  }
  const withErrors = errs => { const e = new Error(errs.join('\n')); e.errors = errs; return e; };

  // ── writing: one line at a time ───────────────────────────────────────
  // The rack edits the file through these, so a knob moves one number on one line and the rest
  // of the file (notes, spacing, order) stays as written. Each returns the new score text and
  // throws parse's error if the change would break it.
  const blockAt = (P, kind, name) => P.blocks.find(b => b.kind === kind && b.name === name);
  // set the `index`-th `key` line of a block to `text` (null removes it; a missing one is added
  // after the block's last line)
  function setLine(src, kind, name, key, text, index = 0) {
    const P = parse(src), b = blockAt(P, kind, name);
    if (!b) throw withErrors([`there is no ${kind} ${name}`]);
    const f = P.fields.find(x => x.block === b && x.key === key && x.index === index);
    const lines = src.split('\n');
    if (f) {
      if (text == null) lines.splice(f.ln - 1, 1);
      else { const note = /\s+#.*$/.exec(lines[f.ln - 1]); lines[f.ln - 1] = fieldLine(key, text) + (note ? note[0] : ''); }
    } else if (text != null) lines.splice(b.end, 0, fieldLine(key, text));
    else return src;
    const out = lines.join('\n');
    parse(out);
    return out;
  }
  // one value of a field: `arg` counts from 0 after the field name (a missing line starts from
  // the field's defaults)
  function setArg(src, kind, name, key, arg, value, index = 0) {
    const P = parse(src), b = blockAt(P, kind, name);
    if (!b) throw withErrors([`there is no ${kind} ${name}`]);
    const f = P.fields.find(x => x.block === b && x.key === key && x.index === index);
    const args = f ? f.args.slice() : defaultArgs(b, key);
    args[arg] = typeof value === 'number' ? fmtNum(value) : String(value);
    return setLine(src, kind, name, key, args.join(' '), index);
  }
  function defaultArgs(b, key) {
    if (b.kind === 'FX') { const d = FX[b.name][key]; return (Array.isArray(d[0]) ? d[0] : [d[0]]).map(fmtNum); }
    const o = b.obj;
    const D = { level: [0.5], pan: [0], send: [0, 0], len: [1], tune: [o.tune], decay: [o.decay], tone: [o.tone],
      filter: ['lowpass', 2000, 1], env: [o.env ? o.env.attack : 0.01, o.env ? o.env.decay : 0.2, o.env ? o.env.sustain : 0.7, o.env ? o.env.release : 0.3],
      lfo: ['filter', 0.5, 0], sweep: [800, 4000] }[key];
    if (!D) throw withErrors([`${key} has no default to start from; write the line first`]);
    return D.map(v => typeof v === 'number' ? fmtNum(v) : String(v));
  }
  // a section plays a track or stops playing it (level 1 when it starts)
  function toggleTrack(src, ref, track) {
    const P = parse(src), s = P.score.sections.find(x => x.ref === ref);
    if (!s) throw withErrors([`there is no SECTION ${ref}`]);
    const has = s.play.some(p => p.name === track);
    const play = has ? s.play.filter(p => p.name !== track) : s.play.concat([{ name: track, level: 1 }]);   // the rest keep their order
    const text = play.map(p => p.level === 1 ? p.name : `${p.name}:${fmtNum(p.level)}`).join(' ');
    return setLine(src, 'SECTION', ref, 'play', text || null);
  }
  // a section's level for a track (the track must be playing there)
  function setTrackLevel(src, ref, track, level) {
    const P = parse(src), s = P.score.sections.find(x => x.ref === ref);
    if (!s || !s.play.some(p => p.name === track)) throw withErrors([`SECTION ${ref} does not play ${track}`]);
    const text = s.play.map(p => { const l = p.name === track ? level : p.level; return l === 1 ? p.name : `${p.name}:${fmtNum(l)}`; }).join(' ');
    return setLine(src, 'SECTION', ref, 'play', text);
  }
  const block = (kind, name) => ({ kind, name });

  // ── the check ─────────────────────────────────────────────────────────
  const tc = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  function sheet(score, A) {
    const out = [`${score.tempo} BPM · ${score.key.name} · ${score.tracks.length} tracks · ${A.events.length} notes and hits`];
    for (const s of A.sections) {
      const n = A.events.filter(e => e.t >= s.start - 1e-9 && e.t < s.end - 1e-9 && !score.tracks.find(t => t.name === e.track).on).length;
      out.push(`${tc(s.start)}  ${s.type.toUpperCase().padEnd(8)} ${(s.end - s.start).toFixed(1).padStart(4)} s  ${s.chords.map(c => c.name).join(' ').padEnd(12)} ${s.play.map(p => p.level === 1 ? p.name : `${p.name}:${p.level}`).join(' ')}${s.sweep ? `  (sweep ${s.sweep[0]}→${s.sweep[1]} Hz)` : ''}  · ${n}`);
    }
    const fx = score.tracks.filter(t => t.on);
    if (fx.length) out.push('sound effects: ' + fx.map(t => `${t.name} on ${t.on} ×${A.events.filter(e => e.track === t.name && (t.type === 'drum' || !A.events.some(o => o !== e && o.track === t.name && Math.abs(o.t - e.t) < 0.2 && o.t < e.t))).length}`).join(' · '));
    return out.join('\n');
  }

  function main(argv) {
    const fs = require('fs'), path = require('path');
    const RS = require('./reel-script.js');
    const cmd = argv[0] || 'check';
    if (!['check', 'json'].includes(cmd)) { console.error('usage: node scripts/reel-music.js check|json [score] [script]'); process.exit(2); }
    const scoreFile = path.resolve(argv[1] || path.join(__dirname, '..', 'Assets', 'sizzle-reel-2.score.txt'));
    const scriptFile = path.resolve(argv[2] || scoreFile.replace(/\.score\.txt$/, '.script.txt'));
    const name = path.relative(process.cwd(), scoreFile) || scoreFile;
    let P, A;
    try {
      P = parse(fs.readFileSync(scoreFile, 'utf8'));
      const edit = RS.parse(fs.readFileSync(scriptFile, 'utf8')).edit;
      const scenes = RS.spans(edit).map((c, i) => ({ type: edit.scenes[i].type, start: c.start, end: c.end }));
      A = arrange(P.score, scenes, moments(edit, RS));
    } catch (e) {
      console.error(`${name} has ${e.errors ? e.errors.length : 1} mistake${e.errors && e.errors.length > 1 ? 's' : ''}:\n  ${e.message.split('\n').join('\n  ')}`);
      process.exit(1);
    }
    if (cmd === 'json') { process.stdout.write(JSON.stringify({ score: P.score, events: A.events, sweeps: A.sweeps }, null, 1) + '\n'); return; }
    console.log(sheet(P.score, A));
    const silent = A.sections.length ? [] : ['no SECTION lines: only the sound effects play'];
    if (P.warnings.concat(silent).length) console.log('\n' + P.warnings.concat(silent).map(w => 'warning: ' + w).join('\n'));
  }

  return { parse, arrange, moments, sheet, setLine, setArg, toggleTrack, setTrackLevel, block, chord, noteMidi, hz, voicing,
    FX, DRUMS, DRUM_DEF, WAVES, FILTERS, MOMENTS, PLAYS, STEP_VEL, fieldLine, fmtNum, main };
});
