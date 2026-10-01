// The sizzle reel's synths: plays an arrangement from scripts/reel-music.js through Web Audio.
// The same graph runs live (the preview, under the synth rack) and offline (the renderer mixes
// the film's soundtrack with an OfflineAudioContext), so what you hear while editing is what
// the MP4 carries.
//
// The voices are like-every-cloud's SynthVoice patch vocabulary as data: osc/noise voices →
// optional filter → ADSR envelope, one LFO (gain, filter or pitch). Drums are small equations
// (a kick is a sine falling in pitch, a hat is high-passed noise). Nothing is sampled, and the
// noise is seeded, so an offline render is the same render every time.
//
//   voices → track (level · mute) → pan ─→ music bus → sweep filter ─┐
//                                        ├→ reverb send               ├→ drive → tape (wow, flutter,
//                                        └→ delay send                │   age) → comp → master → out
//   sound effects ─────────────────────────→ sfx bus ────────────────┘   hiss ──┘
//
// In a page: window.ReelSynth. Needs window.ReelMusic.
(function (root) {
  'use strict';
  const RM = () => root.ReelMusic;

  // ── seeded noise ──────────────────────────────────────────────────────
  function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const noiseCache = new WeakMap();
  function noiseBuffer(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0), r = mulberry(17);
      for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
      noiseCache.set(ctx, b);
    }
    return b;
  }
  function impulse(ctx, size, decay, tone) {
    const len = Math.max(1, Math.round(ctx.sampleRate * size)), b = ctx.createBuffer(2, len, ctx.sampleRate);
    const k = Math.exp(-2 * Math.PI * tone / ctx.sampleRate);        // one-pole damping: the tail darkens
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c), r = mulberry(101 + c);
      let lp = 0;
      for (let i = 0; i < len; i++) { const x = i / len; lp = (r() * 2 - 1) * (1 - k) + lp * k; d[i] = lp * Math.pow(1 - x, decay) * (i < 64 ? i / 64 : 1); }
    }
    return b;
  }
  // saturation that leaves quiet signals alone (unity gain near 0) and rounds the peaks off
  // toward a ceiling of 1/g: amount 0 is a straight wire
  const driveCurve = amount => {
    const n = 4096, c = new Float32Array(n), g = 1 + amount * 3;
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(g * x) / g; }
    return c;
  };
  const sweepOpen = 20000;

  // ── the engine ────────────────────────────────────────────────────────
  // create(ctx, score, { meters }) builds the whole graph once; notes are made per event.
  function create(ctx, score, opts = {}) {
    const out = opts.destination || ctx.destination;
    const E = { ctx, score, tracks: {}, mutes: new Set(), solos: new Set() };
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // master chain
    const pre = G(), music = G(), sfx = G();
    const sweep = ctx.createBiquadFilter(); sweep.type = 'lowpass'; sweep.frequency.value = sweepOpen; sweep.Q.value = 0.9;
    music.connect(sweep); sweep.connect(pre); sfx.connect(pre);
    const drive = ctx.createWaveShaper(); drive.oversample = '2x';
    const driveOut = G();
    const tape = ctx.createDelay(0.1); tape.delayTime.value = 0.012;
    const age = ctx.createBiquadFilter(); age.type = 'lowpass'; age.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor(); comp.knee.value = 8;
    const master = G(0), fader = G(1);                   // master: the fades; fader: the level
    pre.connect(drive); drive.connect(driveOut); driveOut.connect(tape); tape.connect(age); age.connect(comp); comp.connect(fader); fader.connect(master); master.connect(out);
    const wow = ctx.createOscillator(); wow.frequency.value = 0.55; const wowG = G(0); wow.connect(wowG); wowG.connect(tape.delayTime); wow.start();
    const flut = ctx.createOscillator(); flut.frequency.value = 7.3; const flutG = G(0); flut.connect(flutG); flutG.connect(tape.delayTime); flut.start();
    const hiss = ctx.createBufferSource(); hiss.buffer = noiseBuffer(ctx); hiss.loop = true;
    const hissHp = ctx.createBiquadFilter(); hissHp.type = 'highpass'; hissHp.frequency.value = 2500;
    const hissG = G(0); hiss.connect(hissHp); hissHp.connect(hissG); hissG.connect(comp); hiss.start();
    // returns
    const revIn = G(), rev = ctx.createConvolver(), revRet = G();
    revIn.connect(rev); rev.connect(revRet); revRet.connect(pre);
    const dlyIn = G(), dly = ctx.createDelay(4), dlyTone = ctx.createBiquadFilter(), dlyFb = G(), dlyRet = G();
    dlyTone.type = 'lowpass';
    dlyIn.connect(dly); dly.connect(dlyTone); dlyTone.connect(dlyFb); dlyFb.connect(dly); dlyTone.connect(dlyRet); dlyRet.connect(pre);
    let meter = null;
    if (opts.meters) { meter = ctx.createAnalyser(); meter.fftSize = 1024; master.connect(meter); }
    Object.assign(E, { music, sfx, sweep, master, fader, meter, revIn, dlyIn });

    let irKey = '';
    E.apply = function (sc) {
      E.score = sc || E.score;
      const fx = E.score.fx, beat = 60 / E.score.tempo;
      const key = [fx.reverb.size, fx.reverb.decay, fx.reverb.tone].join();
      if (key !== irKey) { irKey = key; rev.buffer = impulse(ctx, fx.reverb.size, fx.reverb.decay, fx.reverb.tone); }
      revRet.gain.value = fx.reverb.return;
      dly.delayTime.value = Math.min(4, fx.delay.time * beat); dlyFb.gain.value = fx.delay.feedback; dlyTone.frequency.value = fx.delay.tone; dlyRet.gain.value = fx.delay.return;
      wowG.gain.value = fx.tape.wow * 0.0035; flutG.gain.value = fx.tape.flutter * 0.00045; age.frequency.value = fx.tape.age; hissG.gain.value = fx.tape.hiss * 0.08;
      drive.curve = driveCurve(fx.drive.amount);
      comp.threshold.value = fx.comp.threshold; comp.ratio.value = fx.comp.ratio; comp.attack.value = fx.comp.attack; comp.release.value = fx.comp.release;
      fader.gain.value = fx.master.level;
      // tracks: made on first sight, kept after (a renamed track is a new one)
      for (const t of E.score.tracks) {
        let T = E.tracks[t.name];
        if (!T) {
          T = E.tracks[t.name] = { chan: G(), pan: ctx.createStereoPanner(), sendR: G(0), sendD: G(0), lfo: null, lfoG: null, meter: null, gen: null };
          T.chan.connect(T.pan); T.pan.connect(t.on ? sfx : music); T.pan.connect(T.sendR); T.pan.connect(T.sendD); T.sendR.connect(revIn); T.sendD.connect(dlyIn);
          if (opts.meters) { T.meter = ctx.createAnalyser(); T.meter.fftSize = 512; T.pan.connect(T.meter); }
          T.gen = G(); T.gen.connect(T.chan);
        }
        T.def = t;
        const audible = !E.mutes.has(t.name) && (!E.solos.size || E.solos.has(t.name));
        T.chan.gain.value = audible ? t.level : 0;
        T.pan.pan.value = t.pan; T.sendR.gain.value = t.send[0]; T.sendD.gain.value = t.send[1];
        // one free-running LFO per track, so a pad's filter breathes across the notes
        if (t.lfo) {
          if (!T.lfo) { T.lfo = ctx.createOscillator(); T.lfoG = G(0); T.lfo.connect(T.lfoG); T.lfo.start(); }
          T.lfo.frequency.value = t.lfo.rate; T.lfoG.gain.value = t.lfo.depth;
        } else if (T.lfoG) T.lfoG.gain.value = 0;
      }
      return E;
    };
    E.setMute = (name, on) => { on ? E.mutes.add(name) : E.mutes.delete(name); E.apply(); };
    E.setSolo = (name, on) => { on ? E.solos.add(name) : E.solos.delete(name); E.apply(); };

    // a generation: every voice connects through its track's generation gain, so a seek or a
    // pause can silence everything that is scheduled without touching the tracks
    E.newGeneration = () => {
      for (const T of Object.values(E.tracks)) {
        const old = T.gen;
        if (old) { const n = ctx.currentTime; old.gain.cancelScheduledValues(n); old.gain.setValueAtTime(old.gain.value, n); old.gain.linearRampToValueAtTime(0, n + 0.04); setTimeout(() => { try { old.disconnect(); } catch (e) { /* gone */ } }, 200); }
        T.gen = G(); T.gen.connect(T.chan);
      }
    };

    // automation from reel time `from` on, with reel t → ctx time `at(t)`: the fades and sweeps
    E.automate = function (A, from, at) {
      const n = at(from), fx = E.score.fx, lvl = 1, fin = fx.master.fade[0], fout = fx.master.fade[1], D = A.duration;
      const m = master.gain;
      m.cancelScheduledValues(0);
      const fadeAt = t => Math.max(0, Math.min(1, fin > 0 ? t / fin : 1, fout > 0 ? (D - t) / fout : 1)) * lvl;
      m.setValueAtTime(fadeAt(from), n);
      if (fin > 0 && from < fin) m.linearRampToValueAtTime(1, at(fin));
      if (fout > 0) { const s = Math.max(from, D - fout); m.setValueAtTime(fadeAt(s), at(s)); m.linearRampToValueAtTime(0, at(D)); }
      const f = sweep.frequency;
      f.cancelScheduledValues(0);
      const now = A.sweeps.find(s => from >= s.t0 && from < s.t1);
      f.setValueAtTime(now ? now.from * Math.pow(now.to / now.from, (from - now.t0) / (now.t1 - now.t0)) : sweepOpen, n);
      for (const s of A.sweeps) {
        if (s.t1 <= from) continue;
        if (s.t0 > from) f.setValueAtTime(s.from, at(s.t0));
        f.exponentialRampToValueAtTime(s.to, at(s.t1) - 0.001);
        f.setValueAtTime(sweepOpen, at(s.t1));
      }
    };

    // one event at ctx time `when` (`cut`: seconds of it already past, for a note resumed mid-way)
    E.play = function (ev, when, cut = 0) {
      const T = E.tracks[ev.track];
      if (!T || !T.gen) return;
      const t = T.def;
      if (t.type === 'drum') return drum(t, ev, when, T.gen);
      if (ev.rise) return rise(t, ev, when, T);
      return note(t, ev, when, cut, T);
    };

    function note(t, ev, when, cut, T) {
      const env = t.env, dur = Math.max(0.01, ev.dur - cut), rel = env.release;
      const vg = G(0), peak = ev.vel;
      // the envelope, truncated where the note lets go
      const pts = [[0, 0], [env.attack, 1], [env.attack + env.decay, env.sustain]];
      const g = vg.gain;
      g.setValueAtTime(0, when);
      let last = [0, 0];
      for (const p of pts.slice(1)) {
        if (p[0] <= dur) { g.linearRampToValueAtTime(p[1] * peak, when + p[0]); last = p; }
        else { const k = (dur - last[0]) / Math.max(1e-6, p[0] - last[0]); const v = last[1] + (p[1] - last[1]) * k; g.linearRampToValueAtTime(v * peak, when + dur); last = [dur, v]; break; }
      }
      if (last[0] < dur) g.setValueAtTime(last[1] * peak, when + dur);
      g.linearRampToValueAtTime(0, when + dur + rel);
      const stop = when + dur + rel + 0.02;
      let head = vg;
      let filt = null;
      if (t.filter) { filt = ctx.createBiquadFilter(); filt.type = t.filter.type; filt.frequency.value = t.filter.freq; filt.Q.value = t.filter.q; filt.connect(vg); head = filt; }
      vg.connect(T.gen);
      const oscs = [], srcs = [];
      for (const v of t.voices) {
        const lg = G(v.level); lg.connect(head);
        let src;
        if (v.wave === 'noise') { src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true; src.connect(lg); src.start(when, (ev.t * 7.31) % 1.9); }
        else { src = ctx.createOscillator(); src.type = v.wave; src.frequency.value = RM().hz(ev.midi); src.detune.value = v.cents + (ev.detune || 0); src.connect(lg); src.start(when); oscs.push(src); }
        src.stop(stop); srcs.push(src);
      }
      if (t.lfo && T.lfoG) {
        // the track's LFO fans out to this note's filter, pitch or level, and lets go when it ends
        const taps = t.lfo.target === 'filter' ? (filt ? [filt.frequency] : [])
          : t.lfo.target === 'pitch' ? oscs.map(o => o.detune)
          : (() => { const lg = G(peak * 0.5); lg.connect(vg.gain); return [lg]; })();
        taps.forEach(p => T.lfoG.connect(p));
        if (srcs[0]) srcs[0].onended = () => taps.forEach(p => { try { T.lfoG.disconnect(p); } catch (e) { /* already */ } });
      }
    }

    function rise(t, ev, when, T) {
      const vg = G(0.0001), dur = ev.dur, end = when + dur;
      vg.gain.setValueAtTime(0.0001, when);
      vg.gain.exponentialRampToValueAtTime(ev.vel, end - 0.02);
      vg.gain.linearRampToValueAtTime(0, end + 0.06);
      let head = vg;
      if (t.filter) {
        const f = ctx.createBiquadFilter(); f.type = t.filter.type; f.Q.value = t.filter.q;
        f.frequency.setValueAtTime(t.filter.freq * 0.06, when); f.frequency.exponentialRampToValueAtTime(t.filter.freq, end);
        f.connect(vg); head = f;
      }
      vg.connect(T.gen);
      for (const v of t.voices) {
        const lg = G(v.level); lg.connect(head);
        let src;
        if (v.wave === 'noise') { src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true; src.start(when, 0.3); }
        else { src = ctx.createOscillator(); src.type = v.wave; src.detune.value = v.cents; src.frequency.setValueAtTime(80, when); src.frequency.exponentialRampToValueAtTime(640, end); src.start(when); }
        src.connect(lg); src.stop(end + 0.1);
      }
    }

    function drum(t, ev, when, dest) {
      const v = ev.vel, D = t.decay, k = t.kind, det = Math.pow(2, (ev.detune || 0) / 1200);
      const env = (g, peak, a, d) => { g.setValueAtTime(0.0001, when); g.exponentialRampToValueAtTime(peak, when + a); g.exponentialRampToValueAtTime(0.0001, when + a + d); g.linearRampToValueAtTime(0, when + a + d + 0.01); };
      const noise = (type, freq, q, peak, a, d, off = 0) => {
        const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx); s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq * det; f.Q.value = q;
        const g = G(0); s.connect(f); f.connect(g); g.connect(dest);
        env(g.gain, peak, a, d);
        s.start(when, (ev.t * 3.7 + off) % 1.9); s.stop(when + a + d + 0.05);
      };
      const tone = (type, f0, f1, fall, peak, a, d) => {
        const o = ctx.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0 * det, when); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * det), when + fall);
        const g = G(0); o.connect(g); g.connect(dest);
        env(g.gain, peak, a, d);
        o.start(when); o.stop(when + a + d + 0.05);
      };
      if (k === 'kick') { tone('sine', t.tune * 4, t.tune, 0.07, v, 0.002, D); noise('highpass', 3000, 0.7, v * 0.25, 0.001, 0.008); }
      else if (k === 'boom') { tone('sine', t.tune * 3, t.tune, 0.35, v, 0.003, D); noise('lowpass', t.tone, 0.7, v * 0.35, 0.003, 0.25); }
      else if (k === 'snare') { noise('bandpass', t.tone, 0.8, v * 0.8, 0.001, D); tone('triangle', t.tune, t.tune * 0.7, 0.08, v * 0.5, 0.001, Math.min(D, 0.1)); }
      else if (k === 'clap') { [0, 0.011, 0.023].forEach((o, i) => noise('bandpass', t.tone, 1.2, v * (i === 2 ? 0.9 : 0.6), 0.001 + o, i === 2 ? D : 0.01, i)); }
      else if (k === 'hat' || k === 'openhat') noise('highpass', t.tone, 0.7, v * 0.7, 0.001, D);
      else if (k === 'shaker') noise('bandpass', t.tone, 1.5, v * 0.6, 0.012, D);
      else if (k === 'tick') { noise('highpass', t.tune, 0.9, v * 0.6, 0.001, D); tone('sine', t.tune, t.tune * 0.97, D, v * 0.2, 0.001, D); }
    }

    // a note now, for the rack's audition button
    E.audition = function (name, A) {
      const t = E.score.tracks.find(x => x.name === name); if (!t) return;
      const when = ctx.currentTime + 0.02;
      if (t.type === 'drum') return E.play({ track: name, t: 0, dur: t.decay, vel: 0.9 }, when);
      if (t.play.mode === 'rise') return E.play({ track: name, t: 0, dur: 1.5, vel: 0.8, rise: true }, when);
      const c = (A && A.sections[0] && A.sections[0].chords[0]) || E.score.chords[0];
      const oct = t.play.oct != null ? t.play.oct : 4;
      const midis = t.play.mode === 'note' ? [t.play.midi] : t.play.mode === 'notes' ? [RM().noteMidi(t.notes.find(n => n !== '.'))] : ['chord', 'hit', 'chime'].includes(t.play.mode) ? RM().voicing(c, oct) : [RM().voicing(c, oct)[0]];
      midis.forEach((midi, j) => E.play({ track: name, t: 0, dur: t.play.mode === 'chord' ? 1.2 : Math.max(0.2, t.env.attack + t.env.decay), vel: 0.9, midi }, when + (t.play.mode === 'chime' ? j * 0.045 : 0)));
    };

    E.apply(score);
    return E;
  }

  // ── live: the preview's player ────────────────────────────────────────
  // tick(t, playing, wallMs) every frame: schedules what falls in the next 0.3 s of reel time.
  // Each tick also compares how far the reel moved with how far the wall clock did (the preview
  // plays by performance.now; wallMs is when its frame read t, so a slow frame is no jump):
  //   the same     playing on. Should the audio's clock have drifted from the reel's (two clocks,
  //                two crystals), what comes next is scheduled against the reel again: nothing
  //                starts over, nothing plays twice
  //   not the same a jump (a click, a key, the loop): the sound starts again from there at once,
  //                unless it started again a moment ago. Then it is a scrub, and the sound waits,
  //                silent, until the reel has played on smoothly for SETTLE. (It used to start
  //                again at every step of a scrub: the pads clicked, and a beat's pop nearby
  //                played over and over.)
  // A pause silences it; play starts it from the playhead.
  function Player(ctx, parsed, A) {
    const E = create(ctx, parsed.score, { meters: true, live: true });
    const P = { E, A, running: false, offset: 0, horizon: 0, idx: 0, starts: 0 };
    // JUMP: how far the reel may stray from the wall clock in a frame and still be playing. With
    // the frame's own time (wallMs) the two agree to the microsecond, so a hair is a jump;
    // without it, the tick reads the clock later in the frame, after a frame's work
    const AHEAD = 0.3, LAT = 0.06, SETTLE = 0.2, DRIFT = 0.09;
    const at = t => t + P.offset;
    const wall = () => performance.now() / 1000;
    let lastT = null, lastW = 0, lastStart = -1, quietUntil = 0;
    function first(t) { let lo = 0, hi = P.A.events.length; while (lo < hi) { const m = (lo + hi) >> 1; if (P.A.events[m].t < t) lo = m + 1; else hi = m; } return lo; }
    function start(t, w) {
      E.newGeneration();
      P.offset = ctx.currentTime + LAT - t;
      E.automate(P.A, t, at);
      // notes already sounding at t (a pad mid-bar) come in now, for what is left of them
      for (const ev of P.A.events) if (ev.t < t && ev.t + ev.dur > t + 0.1 && ev.dur >= 0.3 && !ev.rise) E.play(ev, at(t), t - ev.t);
      P.horizon = t; P.idx = first(t); P.running = true;
      lastStart = w; P.starts++;
    }
    P.stop = () => { if (P.running) { E.newGeneration(); P.running = false; E.master.gain.cancelScheduledValues(0); } };
    P.tick = (t, playing, wallMs) => {
      const w = wallMs != null ? wallMs / 1000 : wall(), JUMP = wallMs != null ? 0.008 : 0.05;
      const jumped = lastT != null && Math.abs((t - lastT) - (w - lastW)) > JUMP;
      lastT = t; lastW = w;
      if (!playing || ctx.state !== 'running') { P.stop(); quietUntil = 0; return; }
      if (jumped && (P.running || w < quietUntil)) {
        if (w < quietUntil || w - lastStart < SETTLE) { P.stop(); quietUntil = w + SETTLE; return; }   // a scrub: wait
        start(t, w);
      } else if (!P.running) {
        if (w < quietUntil) return;
        start(t, w);
      } else {
        const drift = (ctx.currentTime + LAT - P.offset) - t;
        if (Math.abs(drift) > DRIFT) P.offset += drift;                // the clocks agree again
      }
      const until = t + AHEAD, ev = P.A.events;
      while (P.idx < ev.length && ev[P.idx].t < until) { const e = ev[P.idx++]; if (e.t >= P.horizon - 1e-9) E.play(e, Math.max(ctx.currentTime, at(e.t))); }
      P.horizon = until;
    };
    // a new score (a knob, a step, a section): the parameters now, the notes from the horizon on
    P.set = (parsed2, A2) => {
      E.apply(parsed2.score);
      P.A = A2;
      if (P.running) { P.idx = first(P.horizon); E.automate(P.A, Math.max(0, P.horizon - AHEAD), at); }
    };
    return P;
  }

  // ── offline: the film's soundtrack ────────────────────────────────────
  // Resolves to an AudioBuffer of the reel from `from` to `to` (default the whole arrangement).
  async function renderOffline(parsed, A, o = {}) {
    const rate = o.sampleRate || 48000, from = o.from || 0, to = o.to != null ? o.to : A.duration;
    const ctx = new OfflineAudioContext(2, Math.ceil((to - from) * rate), rate);
    const E = create(ctx, parsed.score, {});
    const at = t => t - from;
    E.automate(A, from, at);
    for (const ev of A.events) if (ev.t < from && ev.t + ev.dur > from && !ev.rise) E.play(ev, 0, from - ev.t);
    // Notes are made a second ahead, not all at once: a graph holding every note of the film
    // renders in quadratic time (60 s took 100 s; this way it takes a few)
    const WIN = o.window || 1, list = A.events.filter(ev => ev.t >= from && ev.t < to);
    let k = 0;
    const feed = until => { while (k < list.length && list[k].t < until) { const ev = list[k++]; E.play(ev, at(ev.t)); } };
    feed(from + WIN);
    for (let w = from + WIN; w < to; w += WIN) {
      const until = Math.min(to, w + WIN);
      ctx.suspend(Math.max(0, at(w) - 0.25)).then(() => { feed(until); ctx.resume(); });
    }
    return ctx.startRendering();
  }
  // 16-bit PCM WAV of an AudioBuffer
  function toWav(buf) {
    const ch = buf.numberOfChannels, n = buf.length, rate = buf.sampleRate, bytes = 44 + n * ch * 2;
    const ab = new ArrayBuffer(bytes), v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, bytes - 8, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, ch, true); v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return ab;
  }
  // peak and loudness-ish numbers for a buffer (the tests and the renderer's log)
  function stats(buf) {
    let peak = 0, sum = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; } }
    return { peak, rms: Math.sqrt(sum / Math.max(1, n)), peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 10 * Math.log10(sum / Math.max(1, n) || 1e-18) };
  }

  root.ReelSynth = { create, Player, renderOffline, toWav, stats };
})(typeof self !== 'undefined' ? self : this);
