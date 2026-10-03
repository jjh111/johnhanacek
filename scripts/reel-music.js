// The sizzle reel's music: reads a score (Assets/<name>.score.txt), checks it, and arranges it into
// timed notes and each sound's level across the cut. Pure: no audio, no DOM. The synths that play
// it are scripts/reel-synth.js; the synth rack (scripts/reel-rack.js) edits the sounds and the pads,
// the timeline (scripts/reel-timeline.js) the clips.
//
//   node scripts/reel-music.js check [score] [script]   the arrangement, part by part, on the bars
//   node scripts/reel-music.js json  [score] [script]   the parsed score and every event, as JSON
//
// A script's music is the .score.txt with its name: Assets/sizzle-reel-2.script.txt plays
// Assets/sizzle-reel-2.score.txt. The format is explained at the top of that file. It is set up
// the way a music program is (since 2026-10-02; before, one SECTION per scene said what played):
//   sounds   SYNTH and DRUM blocks: how each sound is made
//   parts    PART blocks: drums, bass, chords, lead…, each with its pads, the patterns it can play
//            (a bar of steps for one or several of its sounds, or a tune)
//   clips    CLIP lines: a part plays one of its pads over a stretch of bars, at a level, fading in
//            or out; the arrangement is its clips, on the music's own bars, whatever the picture
//            does (the timeline shows the scenes' cuts against them, and snaps to them)
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
  const DRUMS = ['kick', 'snare', 'clap', 'hat', 'openhat', 'shaker', 'tick', 'boom', 'crash'];
  const MOMENTS = ['key', 'space', 'enter', 'clear', 'cut', 'item', 'beat'];
  // what a SYNTH plays: in a part (chord, root, arp on a pad's steps; notes, a pad's tune; rise, a
  // sweep up across its clip) or as a sound effect (chime, note)
  const PLAYS = { chord: ['oct'], root: ['oct'], arp: ['oct', 'dir'], notes: [], rise: [], chime: ['oct'], note: ['name'] };
  const DIRS = ['up', 'down', 'updown'];
  // one row per field a block may carry: [name, argument kinds, can repeat]. A number is 'n'.
  const MIX = { level: [['n']], pan: [['n']], send: [['n', 'n']], on: [['moment']] };
  const BLOCKS = {
    SYNTH: Object.assign({ voice: [['wave', 'n', 'n'], true], filter: [['filter', 'n', 'n']], env: [['n', 'n', 'n', 'n']],
      lfo: [['lfo', 'n', 'n']], play: [['play']], len: [['n']] }, MIX),
    DRUM: Object.assign({ kind: [['drum']], tune: [['n']], decay: [['n']], tone: [['n']] }, MIX),
    PART: { pad: [['pad'], true] },
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
  // a sound's defaults, so a missing line still plays
  const SYNTH_DEF = { env: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 } };
  const DRUM_DEF = { kick: { tune: 52, decay: 0.32, tone: 0 }, snare: { tune: 190, decay: 0.16, tone: 1800 }, clap: { tune: 0, decay: 0.18, tone: 1300 },
    hat: { tune: 0, decay: 0.045, tone: 8200 }, openhat: { tune: 0, decay: 0.3, tone: 7600 }, shaker: { tune: 0, decay: 0.05, tone: 6200 },
    tick: { tune: 2600, decay: 0.025, tone: 0 }, boom: { tune: 42, decay: 1.4, tone: 600 }, crash: { tune: 0, decay: 1.6, tone: 6500 } };
  const STEP_VEL = { X: 1, x: 0.78, o: 0.45 };
  const GONE = { SECTION: 'SECTION is gone (2026-10-02): the arrangement is CLIP lines now, as in "CLIP drums 5-8 beat"',
    steps: 'a sound no longer carries its steps: they are its part\'s pads now, as in "pad beat kick X...x...X...x..."',
    notes: 'a sound no longer carries its notes: they are its part\'s pads now, as in "pad hook C5 . . . E5 . . ."' };

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
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // ── positions on the bars ─────────────────────────────────────────────
  // A position is bar[.beat[.sixteenth]], counted from 1, and a stretch is "a-b" or one position:
  // each end at the precision it is written in, both included, so 5-8 is bars 5 to 8, 11 is bar
  // 11, 4.4-6 is from bar 4's last beat to the end of bar 6, and 9.3 is one beat. Inside, they
  // are steps (sixteenths) from the reel's 0, the end excluded. `spb`: steps a bar.
  function readPos(s, spb) {
    const m = /^(\d+)(?:\.(\d+)(?:\.(\d+))?)?$/.exec(s);
    if (!m) return null;
    const bar = +m[1], beat = m[2] != null ? +m[2] : null, six = m[3] != null ? +m[3] : null;
    if (bar < 1 || (beat != null && (beat < 1 || beat > spb / 4)) || (six != null && (six < 1 || six > 4))) return null;
    const start = (bar - 1) * spb + (beat != null ? (beat - 1) * 4 : 0) + (six != null ? six - 1 : 0);
    return { start, end: start + (six != null ? 1 : beat != null ? 4 : spb) };
  }
  function readRange(s, spb) {
    const parts = String(s).split('-');
    if (parts.length > 2) return null;
    const a = readPos(parts[0], spb), b = parts.length === 2 ? readPos(parts[1], spb) : a;
    if (!a || !b || b.end <= a.start) return null;
    return { from: a.start, to: b.end };
  }
  const posText = (step, spb) => {
    const bar = Math.floor(step / spb) + 1, r = step - (bar - 1) * spb, beat = Math.floor(r / 4) + 1, six = r % 4 + 1;
    return r === 0 ? String(bar) : six === 1 ? `${bar}.${beat}` : `${bar}.${beat}.${six}`;
  };
  // the end, written as the last unit it includes, at the coarsest precision that says it exactly
  function endText(step, spb) {
    if (step % spb === 0) return String(step / spb);                  // through bar n
    const s = step % 4 === 0 ? step - 4 : step - 1;                    // the last beat, or sixteenth, it includes
    const bar = Math.floor(s / spb) + 1, r = s - (bar - 1) * spb, beat = Math.floor(r / 4) + 1;
    return step % 4 === 0 ? `${bar}.${beat}` : `${bar}.${beat}.${r % 4 + 1}`;
  }
  function rangeText(from, to, spb) {
    const a = posText(from, spb), b = endText(to, spb);
    // one unit written once: a bar (11) or a beat (9.3)
    if ((to - from === spb && from % spb === 0) || (to - from === 4 && from % 4 === 0 && from % spb !== 0) || (to - from === 1 && from % 4 !== 0)) return a;
    return `${a}-${b}`;
  }

  // ── reading ───────────────────────────────────────────────────────────
  const num = v => { const n = +v; return v !== '' && v != null && isFinite(n) ? n : null; };
  const fmtNum = n => String(Math.round(n * 10000) / 10000);
  const KEY_W = 9;                                  // field names are padded to this column
  const fieldLine = (key, text) => '  ' + key + ' '.repeat(Math.max(1, KEY_W - key.length)) + text;
  const withErrors = errs => { const e = new Error(errs.join('\n')); e.errors = errs; return e; };

  // Returns { score, warnings, blocks, fields }. `blocks`: one { ln, end, kind, name, obj } per
  // SYNTH/DRUM/FX/PART line (`end`: its last line). `fields`: one { ln, block, key, index, args }
  // per field line (`index`: its place among the block's lines of that key). score.clips: one
  // { ln, part, from, to, pad, level, fadeIn, fadeOut } per CLIP line (from/to in steps, the end
  // excluded; fades in beats). A mistake throws one Error whose `.errors` lists "line N: …" rows.
  function parse(src) {
    const errors = [], warnings = [], blocks = [], fields = [], rawClips = [], rawRanges = [];
    const score = { tempo: 120, beatsPerBar: 4, key: { root: 9, mode: 'minor', name: 'A minor' }, chords: [], chordRanges: [], tracks: [], fx: {}, parts: [], clips: [] };
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
        if (head === 'TIME') {
          const m = /^(\d+)\/4$/.exec(rest[0] || '');
          if (!m || +m[1] < 2 || +m[1] > 7 || rest.length > 1) err(ln, 'TIME wants beats a bar over 4, 2/4 to 7/4, as in "TIME 4/4"');
          else score.beatsPerBar = +m[1];
          return;
        }
        if (head === 'KEY') {
          const m = /^([A-G])([#b]?)$/.exec(rest[0] || ''), mode = rest[1] || 'major';
          if (!m || !['major', 'minor'].includes(mode)) err(ln, 'KEY wants a note and major or minor, as in "KEY A minor"');
          else score.key = { root: pcOf(m[1], m[2]), mode, name: rest[0] + ' ' + mode };
          return;
        }
        if (head === 'CHORDS') {
          // the loop, or a stretch of bars that plays its own (read once TIME is known)
          if (rest.length && /^\d[\d.-]*$/.test(rest[0])) rawRanges.push({ ln, range: rest[0], chords: rest.slice(1) });
          else score.chords = readChords(rest, ln, err);
          return;
        }
        if (head === 'CLIP') { rawClips.push({ ln, args: rest }); return; }
        if (GONE[head]) { err(ln, GONE[head]); return; }
        if (head === 'SYNTH' || head === 'DRUM' || head === 'FX' || head === 'PART') {
          const name = rest[0];
          if (!name || rest.length > 1) { err(ln, `${head} wants one name, as in "${head} ${head === 'FX' ? 'reverb' : head === 'PART' ? 'drums' : 'bass'}"`); return; }
          let obj;
          if (head === 'FX') {
            if (!FX[name]) { err(ln, `there is no "${name}" effect (there are ${Object.keys(FX).join(', ')})`); return; }
            if (blocks.some(b => b.kind === 'FX' && b.name === name)) { err(ln, `FX ${name} is already given`); return; }
            obj = score.fx[name];
          } else if (head === 'PART') {
            if (!/^[a-z][\w-]*$/i.test(name)) { err(ln, `a part's name is one word: "${name}"`); return; }
            if (score.parts.some(p => p.name === name)) { err(ln, `PART ${name} is already given`); return; }
            obj = { name, ln, pads: [], raw: [] };
            score.parts.push(obj);
          } else {
            if (!/^[a-z][\w-]*$/i.test(name)) { err(ln, `a sound's name is one word: "${name}"`); return; }
            if (score.tracks.some(t => t.name === name)) { err(ln, `there is already a sound called ${name}`); return; }
            obj = head === 'SYNTH'
              ? { name, type: 'synth', ln, voices: [], filter: null, env: Object.assign({}, SYNTH_DEF.env), lfo: null, play: null, len: 1, level: 0.5, pan: 0, send: [0, 0], on: null }
              : { name, type: 'drum', ln, kind: null, tune: null, decay: null, tone: null, level: 0.5, pan: 0, send: [0, 0], on: null };
            score.tracks.push(obj);
          }
          cur = { ln, end: ln, kind: head, name, obj, counts: {} };
          blocks.push(cur);
          return;
        }
        err(ln, `"${head}" is not a line this score knows (TEMPO, TIME, KEY, CHORDS, SYNTH, DRUM, FX, PART, CLIP)`);
        return;
      }
      // an indented line: a field of the block above
      if (!cur) { err(ln, 'an indented line belongs under a SYNTH, DRUM, FX or PART line'); return; }
      cur.end = ln;
      const index = cur.counts[head] = (cur.counts[head] == null ? 0 : cur.counts[head] + 1);
      fields.push({ ln, block: cur, key: head, index, args: rest });
      if (GONE[head] && cur.kind !== 'FX') { err(ln, GONE[head]); return; }
      readField(cur, head, rest, index, ln, err);
    });
    const spb = score.beatsPerBar * 4;
    // what each sound needs to make a sound
    for (const t of score.tracks) {
      const at = `line ${t.ln}`;
      if (t.type === 'synth') {
        if (!t.voices.length) errors.push(`${at}: SYNTH ${t.name} has no voice line`);
        if (!t.play) errors.push(`${at}: SYNTH ${t.name} has no play line`);
        if (t.on && t.play && !['chime', 'note'].includes(t.play.mode)) errors.push(`${at}: a sound effect (${t.name}, on ${t.on}) plays chime or note`);
        if (!t.on && t.play && ['chime', 'note'].includes(t.play.mode)) errors.push(`${at}: ${t.name} plays ${t.play.mode}, which is for a sound effect: give it an "on" line`);
      } else {
        if (!t.kind) errors.push(`${at}: DRUM ${t.name} has no kind line`);
        else for (const k of ['tune', 'decay', 'tone']) if (t[k] == null) t[k] = DRUM_DEF[t.kind][k];
      }
    }
    // the pads, now every sound is known
    const owner = {};
    for (const part of score.parts) {
      for (const r of part.raw) {
        const pad = readPad(r, part, score, err);
        if (!pad) continue;
        if (part.pads.some(p => p.name === pad.name)) { err(r.ln, `${part.name} already has a pad called ${pad.name}`); continue; }
        part.pads.push(pad);
        pad.voices.forEach(v => {
          if (owner[v.track] && owner[v.track] !== part.name) err(r.ln, `${v.track} plays in the ${owner[v.track]} part already: a sound belongs to one part`);
          else owner[v.track] = part.name;
        });
      }
      delete part.raw;
      part.tracks = [...new Set(part.pads.flatMap(p => p.voices.map(v => v.track)))];
      if (!part.pads.length) warnings.push(`PART ${part.name} (line ${part.ln}) has no pads, so it plays nothing`);
    }
    // the chords' stretches of their own
    for (const r of rawRanges) {
      const rg = readRange(r.range, spb);
      if (!rg || rg.from % spb || rg.to % spb) { err(r.ln, `CHORDS with a stretch wants whole bars, as in "CHORDS 30-32 Am"`); continue; }
      const cs = readChords(r.chords, r.ln, err);
      if (cs.length) score.chordRanges.push({ ln: r.ln, from: rg.from / spb, to: rg.to / spb, chords: cs });
    }
    if (!score.chords.length) score.chords = [chord(score.key.mode === 'minor' ? NAMES[score.key.root] + 'm' : NAMES[score.key.root])];
    // the clips
    for (const r of rawClips) {
      const c = readClip(r, score, spb, err);
      if (c) score.clips.push(c);
    }
    for (const part of score.parts) {
      const cs = score.clips.filter(c => c.part === part.name).sort((a, b) => a.from - b.from);
      for (let i = 1; i < cs.length; i++) if (cs[i].from < cs[i - 1].to) err(cs[i].ln, `this ${part.name} clip starts before the one on line ${cs[i - 1].ln} ends (${rangeText(cs[i - 1].from, cs[i - 1].to, spb)}): a part plays one clip at a time`);
    }
    if (errors.length) { const e = new Error(errors.join('\n')); e.errors = errors; throw e; }
    blocks.forEach(b => delete b.counts);
    return { score, warnings, blocks, fields };
  }

  // a chord, or a chord held for several bars: Am:2
  function readChords(words, ln, err) {
    const out = [];
    for (const w of words) {
      const m = /^(.+?)(?::(\d+))?$/.exec(w), c = m && chord(m[1]);
      if (!c) err(ln, `"${w}" is not a chord this score knows (as in Am, F, C7, Fmaj7, Am9, Dsus4; Am:2 holds it two bars)`);
      else { if (m[2] != null) c.bars = Math.max(1, +m[2]); out.push(c); }
    }
    if (!words.length) err(ln, 'CHORDS wants at least one chord');
    return out;
  }

  function readField(b, key, args, index, ln, err) {
    if (b.kind === 'FX') {
      const d = FX[b.name][key];
      if (!d) { err(ln, `FX ${b.name} has no "${key}" (it has ${Object.keys(FX[b.name]).join(', ')})`); return; }
      const want = Array.isArray(d[0]) ? d[0].length : 1, ns = args.map(num);
      if (ns.length !== want || ns.some(n => n == null)) { err(ln, `${key} wants ${want === 1 ? 'a number' : want + ' numbers'}`); return; }
      if (index > 0) { err(ln, `${key} is already given`); return; }
      b.obj[key] = want === 1 ? ns[0] : ns;
      return;
    }
    const spec = BLOCKS[b.kind][key];
    if (!spec) { err(ln, `${b.kind} has no "${key}" line (it has ${Object.keys(BLOCKS[b.kind]).join(', ')})`); return; }
    if (index > 0 && !spec[1]) { err(ln, `${key} is already given`); return; }
    const kinds = spec[0], o = b.obj;
    if (kinds[0] === 'pad') {
      if (!args.length) { err(ln, 'pad wants a name and what it plays, as in "pad beat kick X...x...X...x..."'); return; }
      o.raw.push({ ln, index, args });
      return;
    }
    if (kinds[0] === 'play') {
      const mode = args[0], want = PLAYS[mode];
      if (!want) { err(ln, `play wants one of ${Object.keys(PLAYS).join(', ')}`); return; }
      const p = { mode };
      for (let i = 0; i < want.length; i++) {
        const a = args[i + 1], k = want[i];
        if (k === 'oct') { const n = num(a); if (n == null || n < 0 || n > 8 || n !== Math.round(n)) { err(ln, `play ${mode} wants an octave, 0-8`); return; } p.oct = n; }
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
      case 'pan': o.pan = Math.max(-1, Math.min(1, vals[0])); break;
      default: o[key] = vals[0];
    }
  }

  // "pad <name> [<sound>] <pattern> [<sound> <pattern>]… [len <steps>] [once]": a bar (or more) of
  // steps for each sound that plays it (X loud, x, o soft, . rest), or a tune (E5 . | C5 …) for a
  // sound that plays notes, or nothing for one that rises. The sound's name may be left out when
  // the part has one sound called like it ("PART bass" and "pad eighths x.x.x.x.x.x.x.x.").
  // `once`: it plays once from its clip's start; else it goes round on the music's own bars.
  function readPad(r, part, score, err) {
    const [name, ...words] = r.args;
    if (!/^[a-z][\w-]*$/i.test(name)) { err(r.ln, `a pad's name is one word: "${name}"`); return null; }
    const pad = { name, ln: r.ln, index: r.index, voices: [], len: null, once: false };
    const sound = n => score.tracks.find(t => t.name === n);
    let v = null;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === 'len') { const n = num(words[++i]); if (n == null || n <= 0 || n > 64) { err(r.ln, 'len wants how many steps a note lasts at most, 1-64'); return null; } pad.len = n; continue; }
      if (w === 'once') { pad.once = true; continue; }
      if (sound(w)) {
        const t = sound(w);
        if (t.on) { err(r.ln, `${w} plays on ${t.on} by itself; a pad can't play it`); return null; }
        v = { track: w, tokens: [] }; pad.voices.push(v); continue;
      }
      if (!v) {
        if (!sound(part.name)) { err(r.ln, `pad ${name}: say which sound plays it (one of ${score.tracks.filter(t => !t.on).map(t => t.name).join(', ')}) before its pattern`); return null; }
        v = { track: part.name, tokens: [] }; pad.voices.push(v);
      }
      v.tokens.push(w);
    }
    if (!pad.voices.length && sound(part.name)) pad.voices.push({ track: part.name, tokens: [] });
    if (!pad.voices.length) { err(r.ln, `pad ${name} plays nothing: name a sound and its pattern`); return null; }
    for (const vc of pad.voices) {
      const t = sound(vc.track), mode = t.type === 'drum' ? 'drum' : t.play ? t.play.mode : null;
      if (mode === 'rise') {
        if (vc.tokens.length) { err(r.ln, `${vc.track} rises across its clip: its pad wants no pattern`); return null; }
        vc.rise = true;
      } else if (mode === 'notes') {
        const toks = vc.tokens.filter(w => w !== '|'), bad = toks.filter(w => w !== '.' && noteMidi(w) == null);
        if (bad.length || !toks.length) { err(r.ln, `${vc.track} plays a tune: note names like E5 or C#4, . to rest${bad.length ? ` ("${bad[0]}" is not one)` : ''}`); return null; }
        vc.notes = toks;
      } else {
        const s = vc.tokens.filter(w => w !== '|').join('');
        if (!s || !/^[Xxo.]+$/.test(s)) { err(r.ln, `${vc.track} plays steps: X loud, x, o soft, . rest, sixteen to a bar${s ? ` ("${s}" is not)` : ''}`); return null; }
        vc.steps = s;
      }
      vc.text = vc.tokens.join(' ');
      delete vc.tokens;
    }
    return pad;
  }

  // "CLIP <part> <stretch> <pad> [<level>] [in <beats>] [out <beats>]"
  function readClip(r, score, spb, err) {
    const [partName, range, padName, ...rest] = r.args;
    const part = score.parts.find(p => p.name === partName);
    if (!part) { err(r.ln, `CLIP wants a part (${score.parts.map(p => p.name).join(', ') || 'none yet: write a PART'}), its bars and a pad, as in "CLIP drums 5-8 beat"`); return null; }
    const rg = readRange(range || '', spb);
    if (!rg) { err(r.ln, `"${range || ''}" is not a stretch of bars: 5 (bar 5), 5-8 (bars 5 to 8), 4.4-6 (from bar 4's beat 4 to the end of bar 6)`); return null; }
    const pad = part.pads.find(p => p.name === padName);
    if (!pad) { err(r.ln, `the ${partName} part has no pad "${padName || ''}" (it has ${part.pads.map(p => p.name).join(', ') || 'none'})`); return null; }
    const c = { ln: r.ln, part: partName, from: rg.from, to: rg.to, pad: padName, level: 1, fadeIn: 0, fadeOut: 0 };
    for (let i = 0; i < rest.length; i++) {
      const w = rest[i];
      if (w === 'in' || w === 'out') {
        const n = num(rest[++i]);
        if (n == null || n < 0) { err(r.ln, `${w} wants how many beats it fades ${w}, as in "${w} 2"`); return null; }
        c[w === 'in' ? 'fadeIn' : 'fadeOut'] = n;
      } else {
        const n = num(w);
        if (n == null || n < 0 || n > 1.5 || i > 0) { err(r.ln, `after the pad, a clip takes its level (0-1.5), "in <beats>" and "out <beats>" ("${w}" is none of them)`); return null; }
        c.level = n;
      }
    }
    if ((c.fadeIn + c.fadeOut) * 4 > c.to - c.from + 1e-9) { err(r.ln, `its fades (${c.fadeIn} + ${c.fadeOut} beats) are longer than the clip (${(c.to - c.from) / 4} beats)`); return null; }
    return c;
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
  // The clips against the reel's clock. Bars and steps count from the reel's 0, and a pad goes
  // round on that clock (a `once` pad from its clip's start): a clip is a window onto it, so a
  // clip moved or stretched plays what the music plays there, always in time with the chords and
  // the other parts. The chords go round from bar 1, one a bar (Am:2 holds two), where no CHORDS
  // stretch says otherwise. Each sound of a part has a level across the cut, made from its clips
  // (their levels and fades): A.levels[track] = [{ t, v }], linear between points, two at one time
  // a step. A note lasts until the pad's next one, `len` steps at most (the pad's, else the
  // sound's), and never past its clip; a chord's notes that carry on into the next chord, or the
  // next bar of the same one, are held, not struck again.
  // Returns { events, clips, levels, harmony, parts, duration, beat, step, bar, spb, bars, sweeps }.
  // An event is { t, dur, track, vel, midi?, detune?, rise? }; a clip { …the score's, t0, t1 }.
  const hash01 = i => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const mod = (k, n) => ((k % n) + n) % n;
  function arrange(score, scenes, mom) {
    const beat = 60 / score.tempo, step = beat / 4, spb = score.beatsPerBar * 4, bar = step * spb, E = 1e-9;
    const duration = scenes.length ? scenes[scenes.length - 1].end : 0;
    const bars = Math.max(1, Math.ceil(duration / bar - E));
    const events = [], levels = {};
    const byName = n => score.tracks.find(t => t.name === n);

    // the harmony, a chord a bar
    const round = []; score.chords.forEach(c => { for (let k = 0; k < (c.bars || 1); k++) round.push(c); });
    const harmony = [];
    for (let b = 0; b < bars; b++) {
      const own = score.chordRanges.find(r => b >= r.from && b < r.to);
      let c;
      if (own) { const seq = []; own.chords.forEach(x => { for (let k = 0; k < (x.bars || 1); k++) seq.push(x); }); c = seq[(b - own.from) % seq.length]; }
      else c = round[b % round.length];
      harmony.push({ t: b * bar, end: (b + 1) * bar, chord: c, bar: b + 1 });
    }
    const chordAt = t => harmony[Math.max(0, Math.min(harmony.length - 1, Math.floor(t / bar + E)))].chord;

    // the clips, in seconds
    const clips = score.clips.map(c => Object.assign({}, c, { t0: c.from * step, t1: c.to * step }));
    for (const part of score.parts) {
      const cs = clips.filter(c => c.part === part.name).sort((a, b) => a.t0 - b.t0);
      // the part's level across the cut, from its clips, for each of its sounds
      const pts = [{ t: 0, v: 0 }];
      const put = (t, v) => { pts.push({ t: Math.max(t, pts[pts.length - 1].t), v }); };
      for (const c of cs) {
        const fi = c.fadeIn * beat, fo = c.fadeOut * beat;
        put(c.t0, 0);
        if (fi > 0) put(c.t0 + fi, c.level); else put(c.t0, c.level);
        if (fo > 0) { put(c.t1 - fo, c.level); put(c.t1, 0); } else { put(c.t1, c.level); put(c.t1, 0); }
      }
      put(Math.max(duration, pts[pts.length - 1].t), 0);
      if (cs.length) part.tracks.forEach(n => { levels[n] = pts.map(p => Object.assign({}, p)); });
      // the notes, clip by clip
      for (const c of cs) {
        const pad = part.pads.find(p => p.name === c.pad);
        for (const v of pad.voices) padNotes(byName(v.track), v, pad, c.t0, Math.min(c.t1, duration), { step, spb, chordAt, anchor: pad.once ? c.t0 : 0, push: e => events.push(e) });
      }
    }
    // a chord that carries on is held: the same note, ending where the next begins, is one note
    for (const t of score.tracks.filter(x => x.type === 'synth' && x.play && x.play.mode === 'chord')) {
      const own = events.filter(e => e.track === t.name).sort((a, b) => a.midi - b.midi || a.t - b.t);
      for (let i = 1; i < own.length; i++) {
        const a = own[i - 1], b = own[i];
        if (a.midi === b.midi && Math.abs(a.t + a.dur - b.t) < 1e-6) { a.dur += b.dur; b.gone = true; own[i] = a; }
      }
    }
    for (let i = events.length - 1; i >= 0; i--) if (events[i].gone) events.splice(i, 1);

    // the sound effects: every moment of their kind
    for (const tr of score.tracks.filter(t => t.on)) {
      mom.filter(m => m.kind === tr.on).forEach((m, k) => {
        const vary = hash01(k + 97 * tr.name.length);
        if (tr.type === 'drum') { events.push({ track: tr.name, t: m.t, dur: tr.decay, vel: 0.8 + 0.2 * vary, detune: (vary - 0.5) * 120 }); return; }
        const p = tr.play;
        if (p.mode === 'note') events.push({ track: tr.name, t: m.t, dur: tr.env.attack + tr.env.decay, vel: 1, midi: p.midi });
        else voicing(chordAt(m.t + E), p.oct).forEach((midi, j) => events.push({ track: tr.name, t: m.t + j * 0.045, dur: tr.env.attack + tr.env.decay, vel: 1 - j * 0.12, midi }));
      });
    }
    const out = events.filter(e => e.t < duration - E && e.t >= -E);
    out.sort((a, b) => a.t - b.t || (a.track < b.track ? -1 : 1));
    const parts = score.parts.map(p => ({ name: p.name, ln: p.ln, tracks: p.tracks, pads: p.pads.map(d => d.name) }));
    return { events: out, clips, levels, harmony, parts, duration, beat, step, bar, spb, bars, sweeps: [] };
  }
  // One voice of a pad over [t0, t1): its notes on the clock (from `anchor` for a once pad).
  function padNotes(t, v, pad, t0, t1, o) {
    const { step, chordAt, push } = o, E = 1e-9;
    if (!t || t1 <= t0 + E) return;
    if (v.rise) { push({ track: t.name, t: t0, dur: t1 - t0, vel: 0.9, rise: true }); return; }
    const pat = v.steps || v.notes, n = pat.length, rest = '.';
    const len = pad.len != null ? pad.len : t.type === 'synth' ? (t.len || 1) : 1;
    const a = Math.round(o.anchor / step);
    const k0 = Math.ceil(t0 / step - E), k1 = Math.ceil(t1 / step - E);
    for (let k = k0; k < k1; k++) {
      const i = k - a;
      if (pad.once && (i < 0 || i >= n)) continue;
      const c = pat[mod(i, n)];
      if (c === rest) continue;
      const tt = k * step;
      if (t.type === 'drum') { push({ track: t.name, t: tt, dur: t.decay, vel: STEP_VEL[c] }); continue; }
      // a note lasts until the pad's next one, `len` steps at most, and never past its clip (a
      // once pad's last note, to the pattern's end)
      let gap = 1;
      if (pad.once) while (i + gap < n && pat[i + gap] === rest) gap++;
      else while (gap < n && pat[mod(i + gap, n)] === rest) gap++;
      const dur = Math.max(step * 0.5, Math.min(Math.min(len, gap) * step, t1 - tt));
      const vel = v.steps ? STEP_VEL[c] : 1, m = t.play;
      if (m.mode === 'notes') { push({ track: t.name, t: tt, dur, vel, midi: noteMidi(c) }); continue; }
      const vs = voicing(chordAt(tt + E), m.oct);
      if (m.mode === 'root') push({ track: t.name, t: tt, dur, vel, midi: vs[0] });
      else if (m.mode === 'chord') vs.forEach(midi => push({ track: t.name, t: tt, dur, vel, midi }));
      else if (m.mode === 'arp') {
        // the arp's place in its run counts every hit it has had since the reel's 0
        const per = [...pat].filter(x => x !== '.').length, played = Math.floor(i / n) * per + [...pat.slice(0, mod(i, n))].filter(x => x !== '.').length;
        const run = vs.concat(vs.map(x => x + 12)), seq = m.dir === 'up' ? run : m.dir === 'down' ? run.slice().reverse() : run.concat(run.slice(1, -1).reverse());
        push({ track: t.name, t: tt, dur, vel, midi: seq[mod(played, seq.length)] });
      }
    }
  }
  // A pad on its own, for hearing it (the rack's and the timeline's pads): its notes over one turn
  // (a bar, or as long as its longest pattern), from the bar the reel is in. Returns events from 0.
  function padPreview(score, A, partName, padName, at = 0) {
    const part = score.parts.find(p => p.name === partName), pad = part && part.pads.find(p => p.name === padName);
    if (!pad) return [];
    const step = A ? A.step : 15 / score.tempo, spb = score.beatsPerBar * 4, bar = step * spb;
    const steps = Math.max(spb, ...pad.voices.map(v => (v.steps || v.notes || []).length));
    const b0 = Math.floor(at / bar + 1e-9) * bar, t1 = b0 + steps * step;
    const harmony = A && A.harmony && A.harmony.length ? A.harmony : null;
    const chordAt = t => harmony ? harmony[Math.max(0, Math.min(harmony.length - 1, Math.floor(t / bar + 1e-9)))].chord : score.chords[0];
    const out = [];
    for (const v of pad.voices) padNotes(score.tracks.find(t => t.name === v.track), v, pad, b0, t1, { step, spb, chordAt, anchor: b0, push: e => out.push(e) });
    return out.map(e => Object.assign(e, { t: e.t - b0 })).sort((a, b) => a.t - b.t);
  }

  // an instrument's level at reel time t, from its points in arrange's `levels` (linear between
  // them; two at one time, a step), as the synth automates it
  function levelAt(pts, t) {
    let v = pts[0].v;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (t < a.t) break;
      if (t <= b.t) return b.t - a.t < 1e-9 ? b.v : a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);
      v = b.v;
    }
    return v;
  }

  // ── writing: one line at a time ───────────────────────────────────────
  // The rack and the timeline edit the file through these, so a knob moves one number on one line,
  // a clip dragged rewrites its one line, and the rest of the file (notes, spacing, order) stays
  // as written. Each returns the new score text and throws parse's error if the change would break it.
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
      lfo: ['filter', 0.5, 0] }[key];
    if (!D) throw withErrors([`${key} has no default to start from; write the line first`]);
    return D.map(v => typeof v === 'number' ? fmtNum(v) : String(v));
  }
  // a CLIP line, written the one way: the part, the stretch, the pad, then what is not the default
  // (the stretch's column fits two sixteenths, "14.4.3-17.2.2": a clip on a cut between beats)
  const pad_ = (s, w) => s + ' '.repeat(Math.max(1, w - s.length));
  function clipLine(c, spb) {
    let s = 'CLIP ' + pad_(c.part, 8) + pad_(rangeText(c.from, c.to, spb), 15) + c.pad;
    const tail = [];
    if (Math.abs(c.level - 1) > 1e-9) tail.push(fmtNum(c.level));
    if (c.fadeIn > 0) tail.push('in ' + fmtNum(c.fadeIn));
    if (c.fadeOut > 0) tail.push('out ' + fmtNum(c.fadeOut));
    return tail.length ? pad_(s, 38) + tail.join('  ') : s;
  }
  const clipOn = (P, ln) => { const c = P.score.clips.find(x => x.ln === ln); if (!c) throw withErrors([`there is no CLIP on line ${ln}`]); return c; };
  // change a clip: any of { from, to, pad, level, fadeIn, fadeOut } (from/to in steps)
  function setClip(src, ln, change) {
    const P = parse(src), c = Object.assign({}, clipOn(P, ln), change), spb = P.score.beatsPerBar * 4;
    if (!(c.to > c.from)) throw withErrors(['a clip ends after it starts']);
    const lines = src.split('\n'), note = /\s+#.*$/.exec(lines[ln - 1]);
    lines[ln - 1] = clipLine(c, spb) + (note ? note[0] : '');
    const out = lines.join('\n');
    parse(out);
    return out;
  }
  // a new clip, written among its part's clips in the order they play (else after the last clip)
  function addClip(src, c) {
    const P = parse(src), spb = P.score.beatsPerBar * 4, lines = src.split('\n');
    const cl = Object.assign({ level: 1, fadeIn: 0, fadeOut: 0 }, c);
    const all = P.score.clips.slice().sort((a, b) => a.ln - b.ln), mine = all.filter(x => x.part === cl.part);
    const order = P.score.parts.map(p => p.name), before = mine.filter(x => x.from < cl.from);
    let at;                                                             // the line it goes after
    if (before.length) at = before[before.length - 1].ln;
    else if (mine.length) at = mine[0].ln - 1;
    else {
      const earlier = all.filter(x => order.indexOf(x.part) < order.indexOf(cl.part));
      at = earlier.length ? earlier[earlier.length - 1].ln : all.length ? all[0].ln - 1 : lines.length;
    }
    while (at > 0 && at === lines.length && !lines[at - 1].trim()) at--;   // not after the file's last blank lines
    lines.splice(at, 0, clipLine(cl, spb));
    const out = lines.join('\n');
    parse(out);
    return out;
  }
  function removeClip(src, ln) {
    const P = parse(src); clipOn(P, ln);
    const lines = src.split('\n'); lines.splice(ln - 1, 1);
    const out = lines.join('\n');
    parse(out);
    return out;
  }
  // one sound's pattern in a pad (steps or a tune), the rest of the pad's line as it was
  function setPad(src, part, padName, track, pattern) {
    const P = parse(src), b = blockAt(P, 'PART', part), p = b && b.obj.pads.find(x => x.name === padName);
    if (!p) throw withErrors([`the ${part} part has no pad ${padName}`]);
    const words = [];
    const one = p.voices.length === 1 && p.voices[0].track === part && track === part;
    p.voices.forEach(v => {
      const pat = v.track === track ? pattern : v.text;
      words.push(one ? pat : `${v.track} ${pat}`.trim());
    });
    if (!p.voices.some(v => v.track === track)) words.push(`${track} ${pattern}`);
    if (p.len != null) words.push('len ' + fmtNum(p.len));
    if (p.once) words.push('once');
    return setLine(src, 'PART', part, 'pad', pad_(padName, 9) + words.join('  '), p.index);
  }
  const block = (kind, name) => ({ kind, name });

  // ── the check ─────────────────────────────────────────────────────────
  const tc = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  // the arrangement as a chart, two columns a bar (a capital where a clip starts), then the clips in words
  function sheet(score, A, scenes) {
    const spb = A.spb, cols = A.bars * 2, half = spb / 2;
    const out = [`${score.tempo} BPM · ${score.beatsPerBar}/4 · ${score.key.name} · ${A.bars} bars (${A.duration.toFixed(1)} s) · ${score.parts.length} parts · ${A.events.length} notes and hits`];
    const own = score.chordRanges.map(r => ` · bars ${r.from + 1}-${r.to}: ${r.chords.map(c => c.name).join(' ')}`).join('');
    out.push(`chords   ${score.chords.map(c => c.name + (c.bars > 1 ? ':' + c.bars : '')).join(' ')}, one a bar, round and round${own}`);
    let ruler = '';
    for (let b = 0; b < A.bars; b += 4) ruler += String(b + 1).padEnd(8);
    out.push(' '.repeat(9) + ruler.slice(0, cols));
    if (scenes && scenes.length) {
      const row = Array(cols).fill(' ');
      scenes.forEach((sc, i) => { const k = Math.min(cols - 1, Math.floor(sc.start / (A.bar / 2) + 1e-9)); row[k] = row[k] === ' ' ? '|' : row[k]; });
      out.push('cuts     ' + row.join(''));
    }
    for (const p of score.parts) {
      const row = Array(cols).fill('.');
      A.clips.filter(c => c.part === p.name).forEach(c => {
        for (let k = Math.floor(c.from / half); k < Math.ceil(c.to / half) && k < cols; k++) row[k] = k === Math.floor(c.from / half) ? c.pad[0].toUpperCase() : c.pad[0];
      });
      out.push(p.name.padEnd(9) + row.join(''));
    }
    out.push('');
    for (const p of score.parts) {
      const cs = A.clips.filter(c => c.part === p.name).sort((a, b) => a.from - b.from);
      out.push(`${p.name.padEnd(8)} pads ${p.pads.map(d => d.name).join(' ')}  ·  ` + (cs.length ? cs.map(c => `${rangeText(c.from, c.to, spb)} ${c.pad}${c.level !== 1 ? ' ' + c.level : ''}${c.fadeIn ? ' in ' + c.fadeIn : ''}${c.fadeOut ? ' out ' + c.fadeOut : ''}`).join(' · ') : 'no clips'));
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
    let P, A, scenes;
    try {
      P = parse(fs.readFileSync(scoreFile, 'utf8'));
      const edit = RS.parse(fs.readFileSync(scriptFile, 'utf8')).edit;
      scenes = RS.spans(edit).map((c, i) => ({ type: edit.scenes[i].type, start: c.start, end: c.end }));
      A = arrange(P.score, scenes, moments(edit, RS));
    } catch (e) {
      console.error(`${name} has ${e.errors ? e.errors.length : 1} mistake${e.errors && e.errors.length > 1 ? 's' : ''}:\n  ${e.message.split('\n').join('\n  ')}`);
      process.exit(1);
    }
    if (cmd === 'json') { process.stdout.write(JSON.stringify({ score: P.score, events: A.events, clips: A.clips }, null, 1) + '\n'); return; }
    console.log(sheet(P.score, A, scenes));
    const silent = P.score.clips.length ? [] : ['no CLIP lines: only the sound effects play'];
    if (P.warnings.concat(silent).length) console.log('\n' + P.warnings.concat(silent).map(w => 'warning: ' + w).join('\n'));
  }

  return { parse, arrange, moments, sheet, setLine, setArg, setClip, addClip, removeClip, setPad, padPreview, block, chord, noteMidi, hz, voicing, levelAt,
    readRange, rangeText, posText, clipLine, FX, DRUMS, DRUM_DEF, WAVES, FILTERS, MOMENTS, PLAYS, STEP_VEL, fieldLine, fmtNum, main };
});
