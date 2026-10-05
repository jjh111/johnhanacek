#!/usr/bin/env python3
"""reel-sing.py — a sung melody, read into the reel's score as a TAKE.

    python3 scripts/reel-sing.py <recording> [--score=Assets/sizzle-reel-2.score.txt]
                                 [--name=john] [--at=<s>] [--apply]

The recording is anything ffmpeg reads (a phone's .m4a is fine). It is analysed, never kept:
the raw audio stays wherever it was, and only what was read from it goes into the score.
Needs librosa (pip install librosa) and ffmpeg.

What it reads, and how it is mapped onto the score's own grid, key and chords:
  pitch     pYIN, every 10 ms. Notes are runs of the voice that snap to one note of the
            score's KEY (100 ms of a new note before it changes); glide fragments under 110 ms
            join their nearer neighbour.
  syllables a new syllable on the same note is a new note: where the level dips 7 dB or more
            and comes back, or at an onset (spectral flux) where it rises 4 dB again. Each note
            ends where the voice does (its last frame within 15 dB of its loudest).
  when      the reel's 0 inside the recording: the phase of the score's eighths that most
            onsets fall on, then the bar offset whose chords the sung notes sit on most
            (--at=<s> gives it instead). Onsets and ends go to the nearest sixteenth.
  key       a singer's key drifts. The drift is tracked note by note (Viterbi: each note pays
            for its distance from the scale, each change of offset costs), so within a phrase
            the intervals stay as sung; each note's centre then goes to the nearest note of
            the scale (a chord tone of that bar, or the note before, wins a near tie).
  nuance    each note keeps how its pitch moved, as sung (cents from its centre, every 1/32 s,
            the drift taken out; the centre is where it settled on its note): the scoop into it,
            the vibrato, the fall off it. The score's TAKE lines `straighten` and `nuance` decide
            how much of that plays (reel-music.js). The drift is written too (`drift`, a value a
            bar), for the editor to draw.
  level     each note's loudness (0.3-1) and its tone: how bright it was against the voice's
            average, dB over harmonics 2-8.
  harmonics the voice's harmonic levels, H1-H16 in dB from the fundamental, the median over
            its steady notes: the `harmonics` line of the sound that sings the take.

Prints the TAKE block and the harmonics line; --apply writes both into the score (replacing a
TAKE of the same name, and the harmonics line of the SYNTH that plays it). What it writes is
the take as sung, each note on its sixteenth and in its key. A melody composed from it is an
edit of those n lines (`out` leaves a sung note out; a note with no sung pitch was added; the
rack's take view edits both), so --apply over a composed take replaces the composition too.
"""
import json, os, re, subprocess, sys, tempfile, warnings
import numpy as np

HOP = 0.01          # analysis step, s
CURVE_RATE = 32     # nuance samples a second in the score


def arg(name, default=None):
    for a in sys.argv[1:]:
        if a.startswith(f'--{name}='):
            return a.split('=', 1)[1]
    return default


NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def note_name(m):
    m = int(round(m))
    return f'{NAMES[m % 12]}{m // 12 - 1}'


def sung_name(x):
    """a sung pitch (midi float) as its nearest note and cents, e.g. A#2+23"""
    n = int(round(x)); c = int(round((x - n) * 100))
    return note_name(n) + (f'{c:+d}' if c else '')


# ── the score: its grid, key and chords ───────────────────────────────────
def read_score(path):
    text = open(path, encoding='utf8').read()
    tempo = float(re.search(r'^TEMPO\s+(\d+(?:\.\d+)?)', text, re.M).group(1))
    tm = re.search(r'^TIME\s+(\d+)/4', text, re.M); bpb = int(tm.group(1)) if tm else 4
    km = re.search(r'^KEY\s+([A-G][#b]?)\s+(major|minor)', text, re.M)
    tonic, mode = (km.group(1), km.group(2)) if km else ('C', 'major')
    root = NAMES.index(tonic.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#'))
    steps = [0, 2, 4, 5, 7, 9, 11] if mode == 'major' else [0, 2, 3, 5, 7, 8, 10]
    scale = sorted((root + s) % 12 for s in steps)

    def chord(sym):
        m = re.match(r'([A-G][#b]?)(m?)', sym)
        r = NAMES.index(m.group(1).replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#'))
        return [r, (r + (3 if m.group(2) else 4)) % 12, (r + 7) % 12]

    loop, ranges = [], []
    for line in re.findall(r'^CHORDS\s+(.+?)\s*(?:#.*)?$', text, re.M):
        toks = line.split()
        rng = re.match(r'^(\d+)-(\d+)$', toks[0])
        seq = []
        for tk in (toks[1:] if rng else toks):
            sym, _, n = tk.partition(':')
            seq += [chord(sym)] * int(n or 1)
        if rng: ranges.append((int(rng.group(1)) - 1, int(rng.group(2)), seq))
        else: loop = seq
    beat = 60 / tempo
    bar = beat * bpb

    def chord_at(t):
        b = int(max(0, t) // bar)
        for a, z, seq in ranges:
            if a <= b < z: return seq[(b - a) % len(seq)]
        return loop[b % len(loop)] if loop else []

    return dict(text=text, tempo=tempo, bpb=bpb, beat=beat, bar=bar, step=beat / 4, scale=scale,
                key=f'{tonic} {mode}', chord_at=chord_at)


# ── the recording ─────────────────────────────────────────────────────────
def analyse(path):
    import librosa
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'take.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', '48000', wav], check=True)
        y, sr = librosa.load(wav, sr=48000, mono=True)
    hop = int(sr * HOP)
    f0, vflag, vprob = librosa.pyin(y, fmin=60, fmax=1100, sr=sr, frame_length=2048, hop_length=hop)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0][:len(f0)]
    S = np.abs(librosa.stft(y, n_fft=4096, hop_length=hop, window='hann'))
    # syllables: onsets (spectral flux), moved back to the quiet before each
    onsets = librosa.onset.onset_detect(y=y, sr=sr, hop_length=hop, units='frames', backtrack=True)
    return dict(y=y, sr=sr, f0=f0, vprob=vprob, midi=librosa.hz_to_midi(f0), db=20 * np.log10(rms + 1e-6),
                t=np.arange(len(f0)) * HOP, S=S, dur=len(y) / sr, onsets=onsets)


def harmonic_levels(A, K=24):
    """each voiced frame's harmonics in dB from its fundamental (nan where out of range)"""
    f0, vprob, S, sr = A['f0'], A['vprob'], A['S'], A['sr']
    bw = sr / 4096
    H = np.full((len(f0), K), np.nan)
    for i in range(min(len(f0), S.shape[1])):
        if np.isnan(f0[i]) or vprob[i] < 0.5: continue
        spec = S[:, i]
        amps = np.array([spec[max(0, int(round(k * f0[i] / bw)) - 2):int(round(k * f0[i] / bw)) + 3].max() if k * f0[i] < 9000 else np.nan
                         for k in range(1, K + 1)])
        if amps[0] > 0: H[i] = 20 * np.log10(amps / amps[0] + 1e-9)
    return H


# ── notes ─────────────────────────────────────────────────────────────────
def segment(A, off, sc, shift):
    """notes from the pitch, each snapped to the scale after `shift` (semitones, per frame)"""
    m, db, t = A['midi'], A['db'], A['t']
    v = ~np.isnan(m)
    scale = sc['scale']

    def snap(x, rt, prev):
        base = int(np.floor(x)) - 2
        cands = [p for p in range(base, base + 5) if p % 12 in scale]
        ch = sc['chord_at'](rt)
        return min(cands, key=lambda p: abs(x - p) - (0.12 if p % 12 in ch else 0) - (0.15 if p == prev else 0))

    raw, i, n = [], 0, len(m)
    while i < n:
        if not v[i]: i += 1; continue
        j = i
        while j < n and (v[j] or v[j + 1:j + 4].any()): j += 1
        idx = np.arange(i, j); ok = v[i:j]
        x = np.interp(idx, idx[ok], m[i:j][ok]) + shift[i:j]
        cur = pend = None; pk = 0; lab = []
        for k in range(len(x)):
            p = snap(x[k], t[i + k] - off, cur)
            if cur is None: cur = p
            if p != cur:
                if pend == p:
                    if k - pk >= 10: cur, pend = p, None
                else: pend, pk = p, k
            else: pend = None
            lab.append(cur)
        lab = np.array(lab); cuts = [0]
        for k in range(1, len(lab)):
            if lab[k] != lab[k - 1]:
                b = k
                while b > cuts[-1] + 1 and abs(x[b - 1] - lab[k]) < abs(x[b - 1] - lab[k - 1]): b -= 1
                cuts.append(b)
        # a new syllable on the same note: the level dips 7 dB or more and comes back, or an onset
        # where it rises 4 dB again. These are articulations: the notes either side stay apart
        art = set()
        for k in range(4, len(x) - 4):
            g = i + k
            if k - max([c for c in cuts + sorted(art) if c <= k] or [0]) > 12 and max(db[g - 4:g].max(), db[g + 1:g + 5].max()) - db[g] > 7 and db[g] == db[g - 3:g + 4].min():
                art.add(k)
        for o in A['onsets']:
            k = o - i
            if 8 <= k <= len(x) - 8 and all(abs(k - c) >= 8 for c in cuts + sorted(art)) and db[o + 1:o + 7].max() - db[o] >= 4:
                art.add(k)
        cuts = sorted(set(cuts) | art) + [len(x)]
        for c0, c1 in zip(cuts[:-1], cuts[1:]):
            if c1 <= c0: continue
            raw.append(dict(f0=i + c0, f1=i + c1, run=i, art=c0 in art, pitch=int(np.bincount(lab[c0:c1] - lab.min()).argmax() + lab.min())))
        i = j
    # glide fragments under 110 ms join the nearer neighbour of their run; strays under 80 ms go
    k = 0
    while k < len(raw):
        a = raw[k]
        if (a['f1'] - a['f0']) * HOP < 0.11:
            nb = [q for q in (raw[k - 1] if k else None, raw[k + 1] if k + 1 < len(raw) else None) if q and q['run'] == a['run']]
            if nb:
                med = np.nanmedian(m[a['f0']:a['f1']] + shift[a['f0']:a['f1']])
                q = min(nb, key=lambda q: abs(q['pitch'] - med))
                if a['f0'] < q['f0']: q['art'] = a['art']         # it now starts where the fragment did
                q['f0'], q['f1'] = min(q['f0'], a['f0']), max(q['f1'], a['f1']); raw.pop(k); continue
            if (a['f1'] - a['f0']) * HOP < 0.08: raw.pop(k); continue
        k += 1
    # one note sung on through a wobble is one note; a new syllable on it (an articulation) is not
    out = []
    for a in raw:
        if out and out[-1]['pitch'] == a['pitch'] and out[-1]['run'] == a['run'] and (a['f0'] - out[-1]['f1']) * HOP < 0.03 and not a['art']:
            out[-1]['f1'] = a['f1']
        else: out.append(a)
    # a note ends where the voice does: its last frame within 15 dB of its loudest (80 ms at least)
    for a in out:
        seg = db[a['f0']:a['f1']]
        keep = np.where(seg >= seg.max() - 15)[0]
        a['f1'] = min(a['f1'], max(a['f0'] + 8, a['f0'] + int(keep[-1]) + 3))
    return out


def drift_path(medians, weights, gaps, scale):
    """the singer's key drift, note by note (semitones), smooth where they sang on"""
    S = np.arange(-250, 251, 10) / 100
    sc = np.array(scale)
    dist = lambda p: np.min(np.abs(((p % 12)[:, None] - sc[None, :] + 6) % 12 - 6), axis=1)
    E = np.array([np.minimum(dist(np.full(len(S), x) + S), 0.5) for x in medians]) * (0.6 + np.array(weights)[:, None])
    E += 0.08 * np.abs(S)[None, :]
    cost, back = E[0].copy(), []
    for i in range(1, len(medians)):
        tr = 0.9 * (0.5 if gaps[i] > 0.35 else 1.0)
        tot = cost[:, None] + tr * np.abs(S[:, None] - S[None, :])
        back.append(tot.argmin(axis=0)); cost = tot.min(axis=0) + E[i]
    path = [int(cost.argmin())]
    for b in reversed(back): path.append(int(b[path[-1]]))
    return S[path[::-1]]


def find_zero(A, sc):
    """where the reel's 0 is in the recording: the eighths' phase, then the chords' bar"""
    m, t = A['midi'], A['t']
    v = ~np.isnan(m)
    on = np.array([t[i] for i in range(1, len(m)) if v[i] and (not v[i - 1] or abs(m[i] - m[i - 1]) > 0.8)])
    e8 = sc['beat'] / 2
    phase = max(np.arange(0, e8, 0.005), key=lambda o: (np.abs(((on - o + e8 / 2) % e8) - e8 / 2) < 0.04).mean())
    first = t[np.argmax(v)]
    best = None
    for k in range(int((first + 2 * sc['bar']) / e8) + 1):
        o = phase + k * e8
        hit = tot = 0.0
        for i in np.where(v)[0][::3]:
            rt = t[i] - o
            if rt < 0: continue
            tot += 1; hit += int(round(m[i])) % 12 in sc['chord_at'](rt)
        if tot and (best is None or hit / tot > best[0] + 1e-9): best = (hit / tot, o)
    share = (np.abs(((on - best[1] + e8 / 2) % e8) - e8 / 2) < 0.04).mean()
    return round(best[1], 3), share


def take(path, sc, at=None):
    A = analyse(path)
    m, db, t = A['midi'], A['db'], A['t']
    v = ~np.isnan(m)
    off, share = (float(at), None) if at is not None else find_zero(A, sc)
    # 1. sub-semitone tuning, then notes; 2. the drift, note by note; 3. notes again on the drift
    dev = np.where(v, m - np.round(m), np.nan)
    tun = np.array([np.nanmedian(dev[max(0, i - 300):i + 300]) if np.sum(~np.isnan(dev[max(0, i - 300):i + 300])) > 30 else 0.0 for i in range(len(m))])
    notes = segment(A, off, sc, -tun)
    med = np.array([np.nanmedian(m[a['f0']:a['f1']]) for a in notes])
    gaps = [0] + [(notes[i]['f0'] - notes[i - 1]['f1']) * HOP for i in range(1, len(notes))]
    dr = drift_path(med, [(a['f1'] - a['f0']) * HOP for a in notes], gaps, sc['scale'])
    shift = np.interp(t, [(a['f0'] + a['f1']) / 2 * HOP for a in notes], dr)
    notes = segment(A, off, sc, shift)
    # the voice's harmonics, and each note's tone against them
    H = harmonic_levels(A)
    loud = ~np.isnan(H[:, 0]) & (db > np.nanpercentile(db[v], 35))
    prof = np.nanmedian(H[loud], axis=0)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)        # frames with no harmonics: a nan, as wanted
        tilt = np.nanmean(H[:, 1:8] - prof[1:8], axis=1)
    levels = []
    out = []
    step = sc['step']
    for a in notes:
        seg = m[a['f0']:a['f1']]
        idx = np.arange(len(seg)); ok = ~np.isnan(seg)
        seg = np.interp(idx, idx[ok], seg[ok])
        x = seg + shift[a['f0']:a['f1']]                   # its pitch with the key's drift taken out
        # its centre: where it settled on its note (a glide that never settles: the note itself);
        # what was sung there, as sung (the drift left in)
        near = np.abs(x - a['pitch']) < 0.5
        if near.sum() >= 3: centre, sung = float(np.median(x[near])), float(np.median(seg[near]))
        else: centre, sung = float(a['pitch']), float(np.median(seg[len(seg) // 5: max(len(seg) - len(seg) // 5, len(seg) // 5 + 1)]))
        rt0, rt1 = a['f0'] * HOP - off, a['f1'] * HOP - off
        q0 = int(round(rt0 / step)); q1 = max(q0 + 1, int(round(rt1 / step)))
        if out and q0 < out[-1]['q1']:
            if q0 <= out[-1]['q0']: q0 = out[-1]['q0'] + 1
            out[-1]['q1'] = q0; q1 = max(q1, q0 + 1)
        if q0 < 0: continue
        # how it moved: cents from its centre, every 1/CURVE_RATE s from its onset (so it plays
        # centred on its note: the scoop in, the vibrato and the fall off around it)
        ts = np.arange(0, len(seg) * HOP, 1 / CURVE_RATE)
        curve = np.interp(ts, idx * HOP, (x - centre) * 100).round().astype(int).tolist()
        tl = tilt[a['f0']:a['f1']][loud[a['f0']:a['f1']]]
        out.append(dict(q0=q0, q1=q1, pitch=a['pitch'], sung=sung, early=int(round((rt0 - q0 * step) * 1000)), curve=curve,
                        lev=float(np.percentile(db[a['f0']:a['f1']], 75)), tone=float(np.nanmedian(tl)) if len(tl) >= 3 else 0.0))
    lv = np.array([n['lev'] for n in out])
    lo, hi = np.percentile(lv, 5), np.percentile(lv, 95)
    for n in out: n['vel'] = float(np.clip(0.3 + 0.7 * (n['lev'] - lo) / max(1e-6, hi - lo), 0.3, 1.0))
    # how many notes sat within 50 cents of the scale: as sung, and once the drift is taken out
    sc_ = np.array(sc['scale'])
    near = lambda x: np.min(np.abs(((x % 12)[:, None] - sc_[None, :] + 6) % 12 - 6), axis=1) < 0.5
    # the singer's drift a bar (cents, + sharp): what was taken out, written for the editor to show
    bars = int(np.ceil(out[-1]['q1'] * step / sc['bar'])) if out else 0
    rt = t - off
    per = []
    for b in range(bars):
        w = v & (rt >= b * sc['bar']) & (rt < (b + 1) * sc['bar'])
        per.append(-float(np.mean(shift[w])) * 100 if w.any() else np.nan)
    per = np.array(per)
    if bars and np.isnan(per).all(): per[:] = 0
    elif bars: per = np.interp(np.arange(bars), np.where(~np.isnan(per))[0], per[~np.isnan(per)])
    return dict(notes=out, off=off, share=share, dur=A['dur'], drift=(float(-dr.max()), float(-dr.min())), bars=per.round().astype(int).tolist(),
                prof=prof[:16], fit=float(near(med).mean()), fitd=float(near(med + dr).mean()))


# ── writing it ────────────────────────────────────────────────────────────
def pos(q, sc):
    spb = sc['bpb'] * 4
    return f'{q // spb + 1}.{q % spb // 4 + 1}.{q % 4 + 1}'


def block(T, sc, name, source):
    n = T['notes']
    d0, d1 = (min(T['bars']) / 100, max(T['bars']) / 100) if T['bars'] else T['drift']   # as the drift line says it, a bar at a time
    lines = [f'TAKE {name}',
             f"  # Sung over the cut ({source}, {T['dur']:.1f} s; the reel's 0 is {T['off']:.2f} s into it), read by",
             '  # scripts/reel-sing.py. A line a note: where it starts (bar.beat.sixteenth), the note, its',
             '  # length in sixteenths, its level and its tone (dB brighter or darker than the voice); then',
             '  # what was sung there (the note and cents) and how early (-) or late it came, in ms; after |,',
             '  # how its pitch moved as sung: cents from its own centre, 32 points a second.',
             f"  # The key drifted {d0 * 100:+.0f} to {d1 * 100:+.0f} cents across the take (drift: how far, a bar, + sharp):",
             f"  # it is taken out, each note's centre is tuned to {sc['key']}, and its onset goes to the sixteenth.",
             '  # The mapping, each a line to change:',
             '  #   octave      moves every note by octaves',
             '  #   shift       moves the take by sixteenths',
             '  #   straighten  takes out that share of the slow wander inside each note (the scoop in,',
             '  #               the fall off and the vibrato stay)',
             '  #   nuance      plays that share of how the pitch moved (0: every note straight)',
             '  #   feel        plays that share of how early or late each note came (0: on the sixteenth)',
             '  octave     +1',
             '  shift      0',
             '  straighten 60',
             '  nuance     100',
             '  feel       20',
             '  drift      ' + ' '.join(f'{c:+d}' for c in T['bars'])]
    for x in n:
        curve = ' '.join(str(c) for c in x['curve'])
        tone = max(-6, min(6, round(x['tone'])))
        lines.append(f"  n {pos(x['q0'], sc):<9} {note_name(x['pitch']):<4} {x['q1'] - x['q0']:>2}  {x['vel']:.2f}  {tone:+d}  "
                     f"{sung_name(x['sung']):<7} {x['early']:+4d} | {curve}")
    return '\n'.join(lines)


def harmonics_line(T):
    return '  harmonics ' + ' '.join(f'{v:.0f}' for v in T['prof'])


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith('--'):
        print(__doc__); sys.exit(1)
    rec = sys.argv[1]
    score = arg('score', 'Assets/sizzle-reel-2.score.txt'); name = arg('name', 'john'); at = arg('at')
    sc = read_score(score)
    T = take(rec, sc, at)
    src = os.path.splitext(os.path.basename(rec))[0].replace('_', ' ')
    b = block(T, sc, name, src)
    h = harmonics_line(T)
    n = T['notes']
    print(f"# {len(n)} notes from {n[0]['q0'] * sc['step']:.2f} s to {n[-1]['q1'] * sc['step']:.2f} s of the reel; reel 0 at {T['off']:.3f} s"
          + (f"; {T['share'] * 100:.0f}% of onsets within 40 ms of an eighth" if T['share'] is not None else '')
          + f"; the key drifted {T['drift'][0] * 100:+.0f} to {T['drift'][1] * 100:+.0f} cents"
          + f"; in key within 50 cents: {T['fit'] * 100:.0f}% as sung, {T['fitd'] * 100:.0f}% with the drift out", file=sys.stderr)
    if '--apply' not in sys.argv:
        print(b); print(); print(h); return
    text = sc['text']
    blk = re.compile(rf'^TAKE {re.escape(name)}\b.*?(?=^\S|\Z)', re.M | re.S)
    text = blk.sub(lambda _: b + '\n\n', text, count=1) if blk.search(text) else text.rstrip('\n') + '\n\n' + b + '\n'
    text = re.sub(r'^  harmonics .*$', h, text, flags=re.M)
    open(score, 'w', encoding='utf8').write(text)
    print(f'wrote TAKE {name} ({len(n)} notes) into {score}', file=sys.stderr)


if __name__ == '__main__':
    main()
