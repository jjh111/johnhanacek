#!/usr/bin/env node
// generate.mjs: builds every synthetic trace in the case study from world.mjs.
//
//   world.mjs ──► one month of Saltlight runs (+ the hero run, the evals)
//             ──► data/<page>.js   one data slot per view, window.TRACE_DATA
//             ──► data/synthetic/runs/<id>/   the hero run's raw record,
//                 laid out the way OpenProse v0.14 writes a run directory
//
// Deterministic: every random draw is seeded from what it describes (the
// program, the day, the step), so the same world gives the same bytes and
// editing one program never shifts another's numbers.
//
// Usage: node data/synthetic/generate.mjs [--check]   (--check: fail if stale)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as W from './world.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '..');
const RUNS_DIR = path.join(HERE, 'runs');
const CHECK = process.argv.includes('--check');

// ---------------------------------------------------------------- randomness
function hash(str) {                                        // cyrb53, 53-bit
  let h1 = 0xdeadbeef ^ W.SEED, h2 = 0x41c6ce57 ^ W.SEED;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const stream = (key) => {
  const rng = mulberry32(hash(key) % 4294967296);
  return {
    rand: (a, b) => a + rng() * (b - a),
    int: (a, b) => Math.floor(a + rng() * (b - a + 1)),
    noise: (sd) => (rng() + rng() + rng() - 1.5) * 2 * sd,
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
  };
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------- time
const DAY = 86400000;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const M0 = Date.UTC(W.MONTH.year, W.MONTH.month - 1, 1);
const at = (day, [h, m, s = 0]) => M0 + (day - 1) * DAY + ((h * 60 + m) * 60 + s) * 1000;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][W.MONTH.month - 1];
const dow = (day) => new Date(at(day, [12, 0])).getUTCDay();
const pt = (ms) => { const d = new Date(ms - 7 * 3600000); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const dayName = (day) => `${DOW[dow(day)]} ${MON} ${day}`;
const clock = (secs) => (secs < 60 ? `${Math.round(secs)}s` : `${Math.floor(secs / 60)}m ${pad(Math.round(secs % 60))}s`);
const runIdFor = (key, ms) => {
  const d = new Date(ms);
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `${stamp}-${(hash(`${key}|${ms}`) % 0xffffff).toString(16).padStart(6, '0')}`;
};
const runsOn = (sched, day) => sched.days === 'daily' || DOW[dow(day)].toLowerCase() === sched.days;

// ------------------------------------------------------------- step trees
const P = W.PROGRAMS;
const SUBS = 'abcdef';
const mkStep = (phase, name, kind, extra = {}) =>
  ({ phase, sub: '', name, kind, status: 'ok', parallel: false, siblings: [], ...extra });

function producingSteps(pid, { failed = [], hero = false } = {}) {
  const p = P[pid];
  const steps = [];
  let phase = 0;
  for (const inp of p.inputs) steps.push(mkStep(++phase, inp, 'input'));
  if (p.lead) steps.push(mkStep(++phase, p.lead, 'agent'));
  phase++;
  p.scouts.forEach((s, i) => steps.push(mkStep(phase, s, 'agent', {
    sub: SUBS[i], parallel: true, siblings: p.scouts.slice(),
    status: failed.includes(s) || (hero && s === 'photo-scout') ? 'fail' : 'ok',
  })));
  if (hero) {
    steps.push(mkStep(++phase, 'image-reader', 'agent'));
    steps.push(mkStep(++phase, 'photo-scout', 'agent'));
  }
  steps.push(mkStep(++phase, p.compiler, 'agent'));
  return steps;
}
function evalSteps(pid, failed) {
  let phase = 1;
  return [mkStep(1, 'subject', 'input'),
    ...P[pid].checks.map((c) => mkStep(++phase, c, 'eval', { status: failed.includes(c) ? 'fail' : 'ok' }))];
}

// ---------------------------------------------------------------- bindings
const INPUT_BYTES = {
  probe_export: [9000, 14000], tank_roster: [2000, 3100], feeding_log: [3000, 6200], diet_plan: [1900, 2800],
  week_of: [40, 60], keeper_notes: [6100, 9400], photo_survey: [900, 1400], wishlist: [700, 1100],
  supplier_list: [1400, 2000], subject: [120, 200],
};
const ARTIFACT = {
  'salinity-reader': 'salinity.md', 'alkalinity-reader': 'alkalinity.md', 'nutrient-reader': 'nutrients.md',
  'log-reader': 'feeds.md', 'diet-reader': 'due.md', 'roster-profiler': 'watchlist.md',
  'behavior-scout': 'behavior.md', 'feeding-scout': 'refusals.md', 'photo-scout': 'photos.md', 'water-scout': 'water.md',
  'image-reader': 'photo-notes.md', 'coral-scout': 'corals.md', 'fish-scout': 'fish.md', 'drygoods-scout': 'drygoods.md',
};
function bindingsFor(key, pid, steps) {
  const s = stream(`${key}|bytes`);
  const out = { caller: [] };
  for (const st of steps) {
    if (st.kind === 'input') {
      const [a, b] = INPUT_BYTES[st.name] || [200, 900];
      out.caller.push({ name: `${st.name}.md`, bytes: s.int(a, b) });
    } else if (st.kind === 'agent') {
      if (out[st.name] || st.status === 'fail') continue;             // a failed attempt publishes nothing
      const compiler = st.name === P[pid].compiler;
      out[st.name] = [{ name: compiler ? P[pid].output : (ARTIFACT[st.name] || `${st.name}.md`),
        bytes: compiler ? s.int(4200, 12600) : s.int(1500, 6200) }];
    }
  }
  return out;
}

// ------------------------------------------------------------------ scores
const DIM_KEYS = W.DIMS.map((d) => d.k);
function scoresFor(key, base, ev = {}) {
  const s = stream(`${key}|scores`);
  const evals = {};
  for (const k of DIM_KEYS) evals[k] = clamp(Math.round(base[k] + s.noise(2.4) + (ev.hit?.[k] || 0)), 30, 99);
  const overall = round1(DIM_KEYS.reduce((a, k) => a + evals[k], 0) / 4);
  const min = DIM_KEYS.reduce((a, k) => (evals[k] < evals[a] ? k : a), 'rf');
  const verdict = ev.verdict || 'pass';
  const weak = ev.weak || (evals[min] < overall - 6 ? min : undefined);
  return { evals, overall, verdict, ...(weak ? { weak } : {}) };
}

// --------------------------------------------------------- the month's runs
const runs = [];
const byId = {};
function addRun(r) { runs.push(r); byId[r.id] = r; return r; }

function summaryFor(pid, day, s) {
  const ev = W.EVENTS[pid]?.[day];
  if (ev?.summary) return ev.summary;
  switch (pid) {
    case 'chemistry-watch':
      return s.pick([
        'All 11 tanks read; every value in range.',
        'All 11 tanks in range; the reef wall\'s alkalinity held at 8.1 dKH.',
        'All 11 tanks read and in range; nothing for the morning crew.',
      ]);
    case 'feeding-tracker': {
      const feeds = s.int(44, 49), refusals = s.int(0, 2);
      return `${feeds} feeds logged across 11 exhibits; ${refusals ? `${refusals} refusal${refusals > 1 ? 's' : ''}, none repeated` : 'no refusals'}.`;
    }
    case 'livestock-memo':
      return s.pick([
        'No flags; eleven steady exhibits and the quarantine bay on schedule.',
        'One flag, already closing: a sea star in the touch pool regrowing an arm.',
        'One flag: the octopus den\'s resident skipped two feeds, then ate normally.',
      ]);
    case 'supplier-scan':
      return s.pick([
        'Four approved suppliers scanned; captive-grown frags of two wishlist corals in stock.',
        'Wishlist mostly covered; the salt mix order moved to next week for a better price.',
        'Four suppliers scanned; nothing new for the wishlist, dry goods restocked.',
      ]);
  }
  return '';
}
const subjectFor = (pid, day) => ({
  'chemistry-watch': `Overnight readings · ${dayName(day)}`,
  'feeding-tracker': `Feeding log · ${dayName(day)}`,
  'livestock-memo': `Livestock health · week of ${MON} ${day - 4}`,
  'supplier-scan': `Weekly supplier scan · ${MON} ${day}`,
}[pid]);
const contextFor = (pid, s) => ({
  'chemistry-watch': 'probe_export: 11 tanks · tank_roster',
  'feeding-tracker': `feeding_log: ${s.int(44, 49)} feeds · diet_plan`,
  'livestock-memo': 'week_of · keeper_notes · tank_roster · photo_survey',
  'supplier-scan': `wishlist: ${s.int(6, 9)} items · 4 approved suppliers`,
}[pid]);

for (let day = 1; day <= W.MONTH.days; day++) {
  for (const pid of W.PRODUCING) {
    const p = P[pid];
    if (!runsOn(p.schedule, day)) continue;
    const ev = W.EVENTS[pid]?.[day] || {};
    const key = `${pid}|${day}`;
    const s = stream(key);
    let start, durSec, steps, hero = false;
    if (ev.hero) {
      hero = true;
      start = at(day, W.HERO.start);
      durSec = W.HERO.closes.end;
      steps = producingSteps(pid, { hero: true });
    } else {
      start = at(day, p.schedule.utc) + s.int(2, 41) * 1000;
      durSec = Math.round(s.rand(...p.durMin) * 60);
      if (ev.verdict === 'fail') durSec = Math.round(durSec * 0.6);
      steps = producingSteps(pid);
    }
    const id = runIdFor(pid, start);
    addRun({
      id, pid, day, key, hero, mode: 'scheduled', gate: 'delivered',
      start, end: start + durSec * 1000, durSec, steps,
      bindings: bindingsFor(key, pid, steps),
      ...scoresFor(key, p.baseline, ev),
      subject: hero ? W.HERO.subject : subjectFor(pid, day),
      context: hero ? W.HERO.context : contextFor(pid, s),
      summary: hero ? W.HERO.summary : summaryFor(pid, day, s),
    });
  }
}
{ // the on-demand request
  const o = W.ON_DEMAND, p = P[o.program];
  const start = at(o.day, o.utc) + 27000, key = `${o.program}|${o.day}|on-demand`;
  const steps = producingSteps(o.program);
  addRun({
    id: runIdFor(o.program, start), pid: o.program, day: o.day, key, hero: false, mode: 'on-demand', gate: o.gate,
    start, end: start + Math.round(o.durMin * 60) * 1000, durSec: Math.round(o.durMin * 60), steps,
    bindings: bindingsFor(key, o.program, steps), ...scoresFor(key, p.baseline, {}),
    subject: o.subject, context: o.context, summary: o.summary,
  });
}
runs.sort((a, b) => a.start - b.start);
const HERO_RUN = runs.find((r) => r.hero);

// the inspector runs of the reported week
const evalRuns = [];
for (const insp of W.INSPECTIONS) {
  const target = runs.filter((r) => r.pid === insp.program && r.day === insp.day).pop();
  const key = `inspector|${target.id}`;
  const s = stream(key);
  const start = target.end + s.int(80, 150) * 1000;
  const durSec = s.int(70, 150);
  const steps = evalSteps(insp.program, insp.failed);
  const total = P[insp.program].checks.length;
  const r = {
    id: runIdFor('inspector', start), pid: 'inspector', day: insp.day, key, mode: 'eval', gate: 'delivered',
    start, end: start + durSec * 1000, durSec, steps, isEval: true, upstream: target.id,
    evalPass: total - insp.failed.length, evalTotal: total, evalFail: insp.failed.slice(),
    bindings: { caller: [{ name: 'subject.md', bytes: s.int(120, 200) }], evaluator: [{ name: 'inspection.md', bytes: s.int(2400, 4800) }] },
    subject: `eval · ${P[insp.program].label.toLowerCase()}, ${MON} ${insp.day}`,
    context: `subject: ${target.id}`,
    summary: insp.failed.length
      ? `Passed ${total - insp.failed.length} of ${total} checks; <code>${insp.failed.join(', ')}</code> failed.`
      : `Passed all ${total} checks.`,
  };
  target.evalRunId = r.id;
  evalRuns.push(r);
}

const inWeek = (r) => r.day >= W.WEEK.firstDay && r.day <= W.WEEK.lastDay;
const weekRuns = [...runs.filter(inWeek), ...evalRuns].sort((a, b) => a.start - b.start);
const latest = (pid) => runs.filter((r) => r.pid === pid && inWeek(r)).sort((a, b) => b.start - a.start)[0];
const BASELINE_RUNS = new Set(W.PRODUCING.map((pid) => runs.find((r) => r.pid === pid && inWeek(r) && r.verdict === 'pass' && !r.hero)?.id));

// ------------------------------------------------------------- glossaries
const synopses = {}, ensures = {};
for (const [svc, [syn, ens]] of Object.entries(W.SERVICES)) { synopses[svc] = syn; ensures[svc] = ens; }
const programsOut = (extra = () => ({})) => Object.fromEntries(W.PROGRAM_ORDER.map((pid) => {
  const p = P[pid], b = p.baseline;
  return [pid, {
    label: p.label, cadence: p.cadence, color: p.color, cssColor: p.cssColor,
    baseline: { overall: round1((b.rf + b.te + b.cs + b.ds) / 4), rf: b.rf, te: b.te, cs: b.cs, ds: b.ds },
    about: p.about, ...extra(pid),
  }];
}));
function atriumRun(r, extra = {}) {
  return {
    id: r.id, program: r.pid, subject: r.subject, context: r.context,
    startedAt: iso(r.start), endedAt: iso(r.end), durationMin: round1(r.durSec / 60), steps: r.steps.length,
    mode: r.mode, gate: r.gate, summary: r.summary,
    ...(r.evalRunId ? { evalRunId: r.evalRunId } : {}),
    ...(r.isEval ? { isEval: true, upstream: r.upstream, evalPass: r.evalPass, evalTotal: r.evalTotal, evalFail: r.evalFail } : {}),
    ...(BASELINE_RUNS.has(r.id) ? { baselineRun: true } : {}),
    ...extra,
  };
}
const WEEK_START = at(W.WEEK.firstDay, [7, 0]);
const WEEK_END = at(W.WEEK.lastDay + 1, [7, 0]);
const SYNTH_LABEL = `${W.WEEK.label} · synthetic`;

// ============================================================ the emitters
const slots = {};

// ---------------------------------------------------- run-atrium (one org)
slots['run-atrium'] = {
  ORG: { name: W.ORG.label, windowLabel: `${MON} ${W.WEEK.firstDay} &rarr; ${W.WEEK.lastDay} · synthetic`, slug: W.ORG.id },
  PROGRAMS: programsOut(),
  PROGRAM_ORDER: W.PROGRAM_ORDER,
  RUNS: weekRuns.map((r) => atriumRun(r, r.hero ? { hasCodex: true } : {})),
  RUN_STATES: Object.fromEntries(weekRuns.map((r) => [r.id, r.steps])),
  BINDINGS_INDEX: Object.fromEntries(weekRuns.map((r) => [r.id, r.bindings])),
  EPOCH_WINDOW: { start: iso(WEEK_START), end: iso(WEEK_END) },
  TRACE_WINDOW: { start: `${W.MONTH.year}-${pad(W.MONTH.month)}-${W.WEEK.firstDay}`, end: `${W.MONTH.year}-${pad(W.MONTH.month)}-${W.WEEK.lastDay}` },
  SERVICE_SYNOPSES: synopses, ENSURES_GIST: ensures, EVAL_PREDICATES: W.CHECKS, INPUT_GLOSS: W.INPUT_GLOSS,
  RUN_PROGRAM_FLOW: W.RUN_PROGRAM_FLOW, TREND_NOTES: W.TREND_NOTES,
  DELIVERABLE_PROGRAMS: ['livestock-memo', 'supplier-scan'],
  DEFAULT_RUN_ID: HERO_RUN.id,
};

// ------------------------------------------------- fleet-atrium (all orgs)
const SHAPE_TEMPLATES = {};
for (const [shape, rows] of Object.entries(W.SHAPES)) {
  const steps = [];
  let phase = 0;
  for (const [kind, ...names] of rows) {
    phase++;
    if (kind === 'par') names.forEach((n, i) => steps.push(mkStep(phase, n, 'agent', { sub: SUBS[i], parallel: true, siblings: names.slice() })));
    else steps.push(mkStep(phase, names[0], kind));
  }
  SHAPE_TEMPLATES[shape] = steps;
}
// The fleet atrium names its synthesized runs <org>-<program>-<slot>, one
// slot per run in catalogue order; scanner-fan and tracker shapes run twice.
// Reproduced here so the radar and heatmap name the same runs.
const fleetRunIds = {};
{
  let slot = 0;
  for (const [org, o] of Object.entries(W.FLEET)) {
    for (const [prog, p] of Object.entries(o.programs)) {
      const n = p.shape === 'scanner-fan' || p.shape === 'tracker' ? 2 : 1;
      for (let i = 0; i < n; i++) { slot++; fleetRunIds[`${org}/${prog}`] = `${org}-${prog}-${slot.toString(16).padStart(3, '0')}`; }
    }
  }
}
slots['fleet-atrium'] = {
  PRIMARY_CUSTOMER: { ...W.ORG },
  PROGRAMS: programsOut(),
  PROGRAM_ORDER: W.PROGRAM_ORDER,
  RUNS: weekRuns.map((r) => atriumRun(r, { isSynth: true, ...(r.hero ? { codexHref: 'run-codex.html' } : {}) })),
  RUN_STATES: Object.fromEntries(weekRuns.map((r) => [r.id, r.steps])),
  BINDINGS_INDEX: Object.fromEntries(weekRuns.map((r) => [r.id, r.bindings])),
  TIME_WINDOW: { start: iso(WEEK_START), end: iso(WEEK_END), label: SYNTH_LABEL },
  SERVICE_SYNOPSES: { ...synopses, ...W.SHAPE_GLOSS }, ENSURES_GIST: ensures, EVAL_PREDICATES: W.CHECKS,
  INPUT_GLOSS: { ...W.INPUT_GLOSS, brief: 'what the run is for', sources: 'the material to read', watchlist: 'what to look for',
    feed: 'the latest readings', log: 'what happened', plan: 'what was meant to happen', fleet_runs: 'recent runs across the fleet' },
  RUN_PROGRAM_FLOW: W.RUN_PROGRAM_FLOW, TREND_NOTES: W.TREND_NOTES,
  DELIVERABLE_PROGRAMS: ['livestock-memo', 'supplier-scan'],
  DEFAULT_RUN_ID: HERO_RUN.id,
  FLEET_CUSTOMERS: W.FLEET,
  SHAPE_TEMPLATES,
  FAIL_BY_CUSTOMER: W.FAIL_BY_ORG,
  SYNTH_START: W.SYNTH_START,
};

// ------------------------------------------------- radar + heatmap (fleet)
const fleetRows = [];       // { org, program, rf, te, cs, ds, overall, runId, verdict, notes }
for (const pid of W.PRODUCING) {
  const r = latest(pid);
  const note = r.hero ? 'Shipped with three flags; one jelly photo missing, so <em>photo_for_every_flag</em> failed.'
    : r.verdict !== 'pass' ? r.summary : `${r.summary.replace(/\.$/, '')}; ${r.evalRunId ? 'inspected, clean' : 'within baseline'}.`;
  fleetRows.push({ org: W.ORG.label, program: pid, ...r.evals, overall: r.overall, runId: r.id, verdict: r.verdict === 'fail' ? 'partial' : r.verdict, notes: note });
}
for (const [org, o] of Object.entries(W.FLEET)) {
  const progs = Object.entries(o.programs);
  progs.forEach(([prog, p], i) => {
    const flagged = i === progs.length - 1;               // the page flags each org's last program
    const s = stream(`fleet|${org}|${prog}`);
    const tilt = { rf: s.noise(3), te: s.noise(3), cs: s.noise(3), ds: s.noise(3) };
    const dims = {};
    const hit = flagged ? { cs: -18, te: -7 } : {};
    for (const k of DIM_KEYS) dims[k] = clamp(Math.round(p.baseline + tilt[k] + (hit[k] || 0)), 40, 99);
    const overall = round1(DIM_KEYS.reduce((a, k) => a + dims[k], 0) / 4);
    fleetRows.push({
      org: o.label, program: prog, ...dims, overall, runId: fleetRunIds[`${org}/${prog}`],
      verdict: flagged ? 'partial' : 'pass',
      notes: flagged ? `Last run flagged: <em>${W.FAIL_BY_ORG[org]}</em> failed; the deliverable still shipped.` : `${p.about.split('.')[0]}; steady.`,
    });
  });
}
const orgs = [W.ORG.label, ...Object.values(W.FLEET).map((o) => o.label)];
const lowest = [...fleetRows].sort((a, b) => a.overall - b.overall).slice(0, 2);
const radarLede = {
  'All organizations': `<p><strong>${orgs.length} organizations, ${fleetRows.length} programs.</strong> Most hold above <span class="fig">85</span>; read <span class="hl-hot">${lowest[0].program}</span> (${lowest[0].org}) and <span class="hl">${lowest[1].program}</span> (${lowest[1].org}) first. Each organization's flagged run is marked <em>partial</em>.</p>`,
};
for (const o of orgs) {
  const rows = fleetRows.filter((r) => r.org === o);
  const best = [...rows].sort((a, b) => b.overall - a.overall)[0];
  const partial = rows.filter((r) => r.verdict === 'partial');
  radarLede[o] = `<p><strong>${o}</strong> runs <span class="fig">${rows.length}</span> program${rows.length > 1 ? 's' : ''}. Strongest: <span class="hl">${best.program}</span> at <span class="fig">${best.overall}</span>.${partial.length ? ` <em>${partial.map((r) => r.program).join(', ')}</em> needs a look.` : ' Nothing flagged.'}</p>`;
}
slots['confidence-radar'] = {
  FLEET_DATA: Object.fromEntries(orgs.map((o) => [o, Object.fromEntries(fleetRows.filter((r) => r.org === o).map((r) =>
    [r.program, { rf: r.rf, te: r.te, cs: r.cs, ds: r.ds, overall: r.overall, runId: r.runId, verdict: r.verdict, notes: r.notes }]))])),
  PRETEXT: radarLede,
  UPDATED: `${MON} ${W.WEEK.lastDay}, ${W.MONTH.year} · synthetic data`,
};
slots['fleet-heatmap'] = {
  FLEET: fleetRows.map((r) => ({ customer: r.org, program: r.program, rf: r.rf, te: r.te, cs: r.cs, ds: r.ds,
    runId: r.runId, notes: r.notes, ...(r.verdict === 'partial' ? { verdict: 'partial' } : {}) })),
  UPDATED: `${MON} ${W.WEEK.lastDay}, ${W.MONTH.year} · synthetic data`,
};

// ------------------------------------------------- periscope (the month)
const TOPOLOGY_SPECS = {
  'reader-fan': { layout: 'fan', branches: [
    { id: 'sal', label: 'salinity-reader', note: 'reads conductivity and temperature per tank' },
    { id: 'alk', label: 'alkalinity-reader', note: 'reads alkalinity, calcium and pH', weakOnDim: 'rf' },
    { id: 'nut', label: 'nutrient-reader', note: 'reads nitrate and phosphate against the last seven nights', weakOnDim: 'cs' },
  ] },
  reconcile: { layout: 'fan', branches: [
    { id: 'log', label: 'log-reader', note: 'reads what was fed', weakOnDim: 'cs' },
    { id: 'diet', label: 'diet-reader', note: 'reads what was due', weakOnDim: 'ds' },
  ] },
  'scout-fan': { layout: 'fan', branches: [
    { id: 'beh', label: 'behavior-scout', note: 'reads the keeper notes' },
    { id: 'feed', label: 'feeding-scout', note: 'reads the feeding ledgers' },
    { id: 'photo', label: 'photo-scout', note: 'reads the photo survey', weakOnDim: 'cs' },
    { id: 'water', label: 'water-scout', note: 'reads the chemistry logs', weakOnDim: 'rf' },
  ] },
  'supplier-gate': { layout: 'gate', branches: [
    { id: 'coral', label: 'coral-scout', note: 'scans for wishlist corals', weakOnDim: 'rf' },
    { id: 'fish', label: 'fish-scout', note: 'scans for captive-bred fish' },
    { id: 'dry', label: 'drygoods-scout', note: 'scans food, salt and filter media' },
  ] },
};
const PERISCOPE_NOTES = {
  'chemistry-watch': 'Every night at two. One truncated export on the 9th; <em>nitrate</em> flagged on the 24th and cleared by the 26th.',
  'feeding-tracker': 'Every afternoon at four. A stale jelly diet plan on the 17th is the month\'s only miss.',
  'livestock-memo': 'Fridays. The 26th shipped with three flags and one photo missing.',
  'supplier-scan': 'Mondays and on request. Thursday the 25th waits on the curator.',
};
slots.periscope = {
  PROGRAMS: W.PRODUCING.map((pid) => {
    const p = P[pid];
    return {
      id: pid, name: pid, register: p.register, cadence: p.cadence, note: PERISCOPE_NOTES[pid], topology: p.topology,
      deliverable: p.deliverable, deliverableLong: p.deliverableLong,
      runs: runs.filter((r) => r.pid === pid).map((r) => ({
        day: r.day, runId: r.id, dur: `${round1(r.durSec / 60).toFixed(1)} min`, steps: r.steps.length,
        evals: r.evals, overall: r.overall, verdict: r.verdict, ...(r.weak ? { weak: r.weak } : {}), ...(r.hero ? { marquee: true } : {}),
      })),
    };
  }),
  DIM_LABELS: W.DIMS.map((d) => ({ k: d.k, short: d.short, long: d.long })),
  TOPOLOGY_SPECS,
  WINDOW: { days: W.MONTH.days, month: MON, period: `${W.MONTH.label}, synthetic` },
};

// ------------------------------------------------- run-story (the ledger)
{
  const wk = runs.filter(inWeek);
  const count = (pid) => wk.filter((r) => r.pid === pid).length;
  const trend = (pid, kind) => ({ values: runs.filter((r) => r.pid === pid).slice(-7).map((r) => r.overall), ...(kind ? { kind } : {}) });
  const lastPT = (pid) => { const r = latest(pid); return `${DOW[dow(r.day)]}, ${pt(r.end)}`; };
  const hero = HERO_RUN;
  const heroEval = evalRuns.find((e) => e.upstream === hero.id);
  const nitrate = [6, 6, 7, 12, 9, 7, 6];
  slots['run-story'] = {
    ORG: W.ORG.label,
    PERIOD: `week ${W.WEEK.number}`,
    LIVE: 'synthetic week · five responsibilities',
    LEDE: [
      `This week Saltlight's agents kept <em>five responsibilities</em> current across <span class="fig">${weekRuns.length} runs</span>`,
      { spark: { values: [22, 23, 24, 25, 26, 27, 28].map((d) => weekRuns.filter((r) => r.day === d).length) } },
      '. The <em>chemistry watch</em> caught a nitrate drift in the mangrove lagoon on Tuesday night',
      { spark: { values: nitrate } },
      '; a water change had it back to <span class="fig">6 ppm</span> by Friday. Friday\'s <em>health memo</em> passed ',
      `<span class="fig">${heroEval.evalPass} of ${heroEval.evalTotal}</span> checks`,
      { spark: { values: runs.filter((r) => r.pid === 'livestock-memo').map((r) => r.overall), kind: 'dots' } },
      ': the photo scout failed once on a late camera export, recovered, and still left one jelly photo missing. One request waits on you: a captive-bred pair of mandarin dragonets, shortlisted on Thursday.',
    ],
    CODA: [
      { value: String(weekRuns.length), label: 'runs' },
      { value: '1', label: 'failure, recovered' },
      { value: '3', label: 'flags raised' },
      { value: '1', label: 'awaiting approval' },
    ],
    RUNS_LABEL: 'Runs this week',
    LEDGER: [
      { name: 'Chemistry watch', route: 'morning crew channel', cadence: 'daily 02:00', last: lastPT('chemistry-watch'),
        runs: count('chemistry-watch'), pct: '7 of 7', trend: trend('chemistry-watch'), status: 'ok', statusLabel: 'flag cleared' },
      { name: 'Feeding tracker', route: 'keepers channel', cadence: 'daily 16:00', last: lastPT('feeding-tracker'),
        runs: count('feeding-tracker'), pct: '7 of 7', trend: trend('feeding-tracker'), status: 'ok' },
      { name: 'Livestock health memo', route: 'husbandry team', cadence: 'Fridays 07:30', last: lastPT('livestock-memo'),
        runs: count('livestock-memo'), pct: `${heroEval.evalPass} of ${heroEval.evalTotal} checks`,
        trend: trend('livestock-memo', 'dots'), status: 'warn', statusLabel: 'one photo missing' },
      { name: 'Supplier scan', route: 'curator, for approval', cadence: 'Mondays 09:00, and on request', last: lastPT('supplier-scan'),
        runs: count('supplier-scan'), pct: '2 of 2', trend: trend('supplier-scan', 'dots'), status: 'warn', statusLabel: 'awaiting approval' },
      { name: 'Inspector', route: 'run records', cadence: 'after each memo and scan', last: `${DOW[dow(heroEval.day)]}, ${pt(heroEval.end)}`,
        runs: evalRuns.length, pct: `${evalRuns.filter((e) => !e.evalFail.length).length} of ${evalRuns.length} clean`,
        trend: { values: evalRuns.map((e) => Math.round((e.evalPass / e.evalTotal) * 100)), kind: 'dots' }, status: 'ok' },
    ],
    GLANCE_KICKER: `Week ${W.WEEK.number} · at a glance`,
    GLANCE: [
      { name: 'Chemistry', status: 'ok', statusLabel: 'in range', spark: { values: nitrate }, meta: 'nitrate, mangrove lagoon', figure: '7 nights' },
      { name: 'Feeding', status: 'ok', statusLabel: 'on plan', spark: { values: [0, 1, 1, 1, 0, 0, 0] }, meta: 'kelp forest refusals', figure: '7 days' },
      { name: 'Health memo', status: 'warn', statusLabel: 'one gap', spark: { values: runs.filter((r) => r.pid === 'livestock-memo').map((r) => r.overall), kind: 'dots' }, meta: '3 flags · 3 actions', figure: clock(hero.durSec) },
      { name: 'Suppliers', status: 'warn', statusLabel: 'awaiting', spark: { values: runs.filter((r) => r.pid === 'supplier-scan').map((r) => r.overall), kind: 'dots' }, meta: '1 shortlist to approve', figure: '2 scans' },
    ],
    LATEST: {
      when: `${dayName(hero.day)}, ${pt(hero.end)} PT`,
      headline: 'Livestock health, <em>week of June 22</em>',
      tag: 'Weekly memo',
      title: 'Three flags; two need a look this weekend',
      body: [
        'The mangrove lagoon\'s nitrate is back to <span class="hl">6 ppm</span> after Wednesday\'s water change. A garibaldi in the kelp forest has hidden at feeds three days running. Two moon jellies show ragged bell margins.',
        `Four scouts read the week in parallel; the photo scout failed on a late camera export and recovered through a delegate. The memo took <span class="hl">${clock(hero.durSec)}</span> and passed <span class="hl">${heroEval.evalPass} of ${heroEval.evalTotal}</span> checks: one jelly photo is still missing.`,
      ],
      link: 'run-strata.html',
      linkLabel: 'Open the run in strata',
      preview: {
        stamp: 'Email · husbandry team',
        subject: 'Saltlight agents → husbandry team',
        heading: 'Livestock health · week of June 22',
        body: W.HERO.flags.map((f) => `<strong>${f.exhibit[0].toUpperCase() + f.exhibit.slice(1)}</strong> (${f.state}): ${f.text}`),
        footnote: `Synthetic run ${hero.id} · ${heroEval.evalPass} of ${heroEval.evalTotal} checks · ${clock(hero.durSec)}`,
      },
    },
    FOOTER: `Operating ledger for ${W.ORG.label} · synthetic data`,
  };
}

// ---------------------------------------------- syntax-charted (four runs)
{
  const R = { chem: latest('chemistry-watch'), feed: latest('feeding-tracker'), memo: HERO_RUN, supply: latest('supplier-scan') };
  const ev = (k, r) => ({ id: k, type: 'eval', label: W.DIMS.find((d) => d.k === k).short, score: r.evals[k],
    ...(r.evals[k] < r.overall - 4 ? { weak: true } : r.evals[k] > r.overall + 3 ? { strong: true } : {}) });
  const tail = (r) => ({
    nodes: [...DIM_KEYS.map((k) => ev(k, r)), { id: 'verdict', type: 'verdict', label: r.verdict },
      { id: 'terminal', type: 'terminal', label: P[r.pid].deliverable }],
    links: [...DIM_KEYS.map((k) => ({ source: 'synth', target: k, value: 'normal', kind: 'process' })),
      ...DIM_KEYS.map((k) => ({ source: k, target: 'verdict', value: 'normal', kind: r.evals[k] < r.overall - 4 ? 'partial' : 'pass' })),
      { source: 'verdict', target: 'terminal', value: 'critical', kind: 'process' }],
  });
  const graph = (head, r) => { const t = tail(r); return { nodes: [...head.nodes, ...t.nodes], links: [...head.links, ...t.links], ...(head.extra || {}) }; };
  const RUN_DATA = {
    chem: graph({ nodes: [
      { id: 'orch', type: 'orch', label: 'chemistry-watch' },
      { id: 'src-probe', type: 'source', label: 'probes' },
      { id: 'sal', type: 'scout', label: 'salinity' }, { id: 'alk', type: 'scout', label: 'alkalinity' },
      { id: 'nut', type: 'scout', label: 'nutrients' },
      { id: 'synth', type: 'synth', label: 'compiler' }],
    links: [
      { source: 'orch', target: 'sal', value: 'normal', kind: 'dispatch' }, { source: 'orch', target: 'alk', value: 'normal', kind: 'dispatch' },
      { source: 'orch', target: 'nut', value: 'normal', kind: 'dispatch' },
      { source: 'src-probe', target: 'sal', value: 'thin', kind: 'pass' }, { source: 'src-probe', target: 'alk', value: 'thin', kind: 'pass' },
      { source: 'src-probe', target: 'nut', value: 'thin', kind: 'pass' },
      { source: 'sal', target: 'synth', value: 'normal', kind: 'process' }, { source: 'alk', target: 'synth', value: 'normal', kind: 'process' },
      { source: 'nut', target: 'synth', value: 'strong', kind: 'process' }] }, R.chem),
    feed: graph({ nodes: [
      { id: 'orch', type: 'orch', label: 'feeding-tracker' },
      { id: 'src-log', type: 'source', label: 'log' }, { id: 'src-plan', type: 'source', label: 'plan' },
      { id: 'log', type: 'scout', label: 'fed' }, { id: 'diet', type: 'scout', label: 'due' },
      { id: 'synth', type: 'synth', label: 'compiler' }],
    links: [
      { source: 'orch', target: 'log', value: 'normal', kind: 'dispatch' }, { source: 'orch', target: 'diet', value: 'normal', kind: 'dispatch' },
      { source: 'src-log', target: 'log', value: 'normal', kind: 'pass' }, { source: 'src-plan', target: 'diet', value: 'thin', kind: 'pass' },
      { source: 'log', target: 'synth', value: 'strong', kind: 'process' }, { source: 'diet', target: 'synth', value: 'normal', kind: 'process' }],
    extra: { exchange: { hub: 'synth', a: 'log', b: 'diet', label: 'fed ↔ due, reconciled' } } }, R.feed),
    memo: graph({ nodes: [
      { id: 'orch', type: 'orch', label: 'livestock-memo' },
      { id: 'prof', type: 'scout', label: 'profiler' },
      { id: 'src-notes', type: 'source', label: 'notes' }, { id: 'src-photos', type: 'source', label: 'photos', weak: true },
      { id: 'beh', type: 'scout', label: 'behavior' }, { id: 'feed', type: 'scout', label: 'feeding' },
      { id: 'photo', type: 'scout', label: 'photo', weak: true, loop: true },
      { id: 'water', type: 'scout', label: 'water' },
      { id: 'err', type: 'dot', label: 'late set', kind: 'fail' },
      { id: 'img', type: 'scout', label: 'delegate' },
      { id: 'synth', type: 'synth', label: 'compiler', amber: true }],
    links: [
      { source: 'orch', target: 'prof', value: 'strong', kind: 'dispatch' },
      { source: 'prof', target: 'beh', value: 'normal', kind: 'dispatch' }, { source: 'prof', target: 'feed', value: 'normal', kind: 'dispatch' },
      { source: 'prof', target: 'photo', value: 'normal', kind: 'dispatch' }, { source: 'prof', target: 'water', value: 'normal', kind: 'dispatch' },
      { source: 'src-notes', target: 'beh', value: 'normal', kind: 'pass' }, { source: 'src-photos', target: 'photo', value: 'thin', kind: 'weak' },
      { source: 'beh', target: 'synth', value: 'strong', kind: 'process' }, { source: 'feed', target: 'synth', value: 'normal', kind: 'process' },
      { source: 'photo', target: 'err', value: 'thin', kind: 'fail' }, { source: 'err', target: 'img', value: 'thin', kind: 'partial' },
      { source: 'img', target: 'synth', value: 'normal', kind: 'partial' },
      { source: 'water', target: 'synth', value: 'normal', kind: 'process' }] }, R.memo),
    supply: graph({ nodes: [
      { id: 'orch', type: 'orch', label: 'supplier-scan' },
      { id: 'coral', type: 'scout', label: 'coral' }, { id: 'fish', type: 'scout', label: 'fish' },
      { id: 'dry', type: 'scout', label: 'dry goods' },
      { id: 'g-coral', type: 'gate', label: 'none' }, { id: 'g-fish', type: 'gate', label: 'found' },
      { id: 'g-dry', type: 'gate', label: 'none' },
      { id: 'synth', type: 'synth', label: 'compiler' }],
    links: [
      { source: 'orch', target: 'coral', value: 'thin', kind: 'dispatch' }, { source: 'orch', target: 'fish', value: 'strong', kind: 'dispatch' },
      { source: 'orch', target: 'dry', value: 'thin', kind: 'dispatch' },
      { source: 'coral', target: 'g-coral', value: 'thin', kind: 'weak' }, { source: 'fish', target: 'g-fish', value: 'strong', kind: 'pass' },
      { source: 'dry', target: 'g-dry', value: 'thin', kind: 'weak' },
      { source: 'g-coral', target: 'synth', value: 'thin', kind: 'weak' }, { source: 'g-fish', target: 'synth', value: 'strong', kind: 'process' },
      { source: 'g-dry', target: 'synth', value: 'thin', kind: 'weak' }] }, R.supply),
  };
  const heroEval = evalRuns.find((e) => e.upstream === HERO_RUN.id);
  const weeksBack = (pid, now) => {
    const s = stream(`syntax|${pid}|weeks`);
    const base = round1(DIM_KEYS.reduce((a, k) => a + P[pid].baseline[k], 0) / 4);
    const pts = [];
    for (let i = 0; i < 13; i++) pts.push(clamp(Math.round(base - 4 + i * 0.35 + s.noise(1.8)), 60, 99));
    return [...pts, Math.round(now)];
  };
  slots['syntax-charted'] = {
    PAGE: { kicker: `${W.ORG.label} · four runs · synthetic`, trendRange: 'weeks 13 to 26', runsLabel: `latest runs, ${MON} ${W.WEEK.firstDay} to ${W.WEEK.lastDay}` },
    programData: W.PRODUCING.map((pid) => ({ name: pid, short: pid.split('-')[0], data: weeksBack(pid, latest(pid).overall), score: latest(pid).overall })),
    RUNS: [
      { key: 'chem', name: 'chemistry-watch', short: 'chem', score: R.chem.overall, runId: R.chem.id, verdict: R.chem.verdict,
        facts: ['3 readers', `${P['chemistry-watch'].checks.length} checks`], topologyLabel: 'three readers at once', pattern: 'parallel',
        note: 'Three readers take the night\'s export at the same time; the compiler writes nothing until all three are back. <em>Fast because nothing waits on anything else.</em>' },
      { key: 'feed', name: 'feeding-tracker', short: 'feed', score: R.feed.overall, runId: R.feed.id, verdict: R.feed.verdict,
        facts: ['2 readers', `${P['feeding-tracker'].checks.length} checks`], topologyLabel: 'what was fed against what was due', pattern: 'bidirectional',
        note: 'Two readers trade through the compiler: every logged feed is matched to a planned one, and every planned feed to a logged one. <em>A refusal is a feed that matches nothing.</em>' },
      { key: 'memo', name: 'livestock-memo', short: 'memo', score: R.memo.overall, runId: R.memo.id, verdict: R.memo.verdict,
        facts: ['4 scouts', '1 retry', `${heroEval.evalPass} of ${heroEval.evalTotal} checks`], topologyLabel: 'four scouts, one retry', pattern: 'self-refine',
        note: 'The photo scout failed on a late camera export, then re-ran through an <em>image-reader</em> delegate. The memo shipped on time with one photo missing, and the inspector caught the gap.',
        detailTitle: 'per-scout findings', detailTag: 'delta to score' },
      { key: 'supply', name: 'supplier-scan', short: 'supply', score: R.supply.overall, runId: R.supply.id, verdict: R.supply.verdict,
        facts: ['3 gated scouts', 'awaiting approval'], topologyLabel: 'each scout behind its own gate', pattern: 'branch-gate',
        note: 'An on-demand scan for one pair of fish. Each scout passes a gate before the compiler sees it; two had nothing to find. <em>The shortlist waits for the curator.</em>' },
    ],
    RUN_DATA,
    runDims: Object.fromEntries(Object.entries(R).map(([k, r]) => [k, { ...r.evals }])),
    RADAR_DIMS: W.DIMS.map((d) => ({ key: d.k, label: d.short, desc: d.desc })),
    SCOUT_DELTAS: {
      chem: [
        { id: 'sal', name: 'salinity', headline: 'All eleven tanks in range', num: '11 tanks · 32 to 35 ppt', delta: 3 },
        { id: 'alk', name: 'alkalinity', headline: 'Reef wall steady at 8.1 dKH', num: '4 reef tanks', delta: 2 },
        { id: 'nut', name: 'nutrients', headline: 'Mangrove lagoon back under 8 ppm', num: '7-night trend', delta: 4, strong: true },
      ],
      feed: [
        { id: 'log', name: 'log', headline: 'Every feed matched', num: `${R.feed.context.match(/\d+/)[0]} feeds`, delta: 3, strong: true },
        { id: 'diet', name: 'diet', headline: 'Plans current for all exhibits', num: '11 plans', delta: 2 },
      ],
      memo: [
        { id: 'beh', name: 'behaviour', headline: 'Garibaldi hiding three days running', num: '4 notes · 2 exhibits', delta: 6, strong: true },
        { id: 'feed', name: 'feeding', headline: 'Two refusals, both kelp forest', num: '7 ledgers', delta: 4 },
        { id: 'photo', name: 'photos', headline: 'Bell margins ragged; second set missing', num: '10 of 11 sets', delta: -5, weak: true },
        { id: 'water', name: 'water', headline: 'Nitrate drift, corrected Friday', num: '7 logs', delta: 5 },
      ],
      supply: [
        { id: 'fish', name: 'fish', headline: 'One captive-bred pair in stock', num: '1 of 4 suppliers', delta: 5, strong: true },
        { id: 'coral', name: 'coral', headline: 'Nothing requested', num: '0 items', delta: 0 },
        { id: 'dry', name: 'dry goods', headline: 'Nothing requested', num: '0 items', delta: 0 },
      ],
    },
    TIP_DATA: {
      memo: {
        orch: 'livestock-memo · weekly · Fri 07:30 PT · 4 inputs',
        prof: 'roster-profiler · step 5 · watchlist - 3 exhibits',
        photo: 'photo-scout · step 6c - failed: export-incomplete · step 8 - re-run, ok',
        err: 'export-incomplete · jelly gallery set late · 10 of 11 sets on time',
        img: 'image-reader · delegate req-001 · read the late set',
        synth: `husbandry-compiler · step 9 · memo - 3 flags, 3 actions · ${clock(HERO_RUN.durSec)}`,
        cs: `contract · photo_for_every_flag - failed · score - ${HERO_RUN.evals.cs}`,
        terminal: `memo · delivered to the husbandry team · ${heroEval.evalPass} of ${heroEval.evalTotal} checks`,
      },
      supply: { 'g-fish': 'gate · captive-bred - yes · quarantine - 30 days included', synth: 'order-compiler · shortlist - 1 line · awaiting approval' },
    },
  };
}

// ------------------------------------------------ the hero, three ways
const H = HERO_RUN, HC = W.HERO.closes;
const heroEval = evalRuns.find((e) => e.upstream === H.id);
const checkRows = P['livestock-memo'].checks.map((c) => ({ id: c, label: c,
  state: heroEval.evalFail.includes(c) ? 'fail' : 'pass', detail: W.HERO.checks[c] }));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const memoPath = `../data/synthetic/runs/${H.id}/bindings/husbandry-compiler/memo.md`;
// The page styles its memo classes under .nv-detail (its modal), and the
// flat deliverable slide renders this same body outside that container; the
// wrapper gives both places the page's memo typography.
const MEMO_BODY_HTML = [
  '<div class="nv-detail">',
  `<div class="memo-kicker">${W.ORG.label} · weekly memo · for the husbandry team</div>`,
  '<div class="memo-h1">Livestock health, <span class="memo-sub">week of June 22</span></div>',
  `<div class="memo-meta-row"><span>${dayName(H.day)}, ${pt(H.end)} PT</span><span>11 exhibits</span><span>3 flags</span><span>3 actions</span></div>`,
  '<span class="memo-conviction">Mostly steady · two need a look</span>',
  '<p>Two exhibits need a look before the weekend; the third is already improving.</p>',
  '<div class="memo-h2">Flags</div>',
  ...W.HERO.flags.map((f) => `<p><strong>${cap(f.exhibit)} · ${f.state}.</strong> ${f.text}</p>`),
  '<div class="memo-h2">Actions</div>',
  ...W.HERO.actions.map((a, i) => `<p>${i + 1}. <strong>${cap(a.owner)}:</strong> ${a.text}</p>`),
  `<div class="memo-footnote-row">Synthetic run ${H.id} · checked by std/evals/inspector</div>`,
  '</div>',
].join('\n');
const MEMO_MORE_HTML = [
  '<div class="nv-detail">',
  '<div class="memo-h2">Steady</div>',
  `<p>${W.HERO.steady.map(cap).join(', ')}: no change this week.</p>`,
  `<p><strong>Quarantine bay:</strong> ${W.HERO.quarantine}</p>`,
  '<div class="memo-h2">Readings, Friday morning</div>',
  '<table class="memo-table"><thead><tr><th>Exhibit</th><th>°C</th><th>ppt</th><th>nitrate ppm</th><th>Note</th></tr></thead><tbody>',
  ...W.HERO.readings.map(([e, t, sal, n, note]) =>
    `<tr><td>${cap(e)}</td><td class="fig">${t.toFixed(1)}</td><td class="fig">${sal.toFixed(1)}</td><td class="fig">${n}</td><td>${note}</td></tr>`),
  '</tbody></table>',
  '<div class="memo-h2">Gaps</div>',
  '<p>Thursday\'s photo set for the jelly gallery arrived late and incomplete. The photo scout failed on it once, re-ran through a delegate, and had one of the two photos it needed; the inspector\'s check <code>photo_for_every_flag</code> failed for this exhibit.</p>',
  '</div>',
].join('\n');

slots['run-strata'] = {
  RUN_META: { brand: `${W.ORG.label} · synthetic`, subjectHtml: 'Livestock health memo <em>· week of June 22</em>',
    kicker: 'Weekly memo', customer: W.ORG.label, runtimeMinutes: round1(H.durSec / 60), runtimeLabel: clock(H.durSec),
    verdict: 'Shipped, one photo short', runId: H.id, evalNote: `${heroEval.evalPass} of ${heroEval.evalTotal} checks · std/evals/inspector` },
  strata: [
    { id: 0, label: 'T1 · Inputs', short: 'T1', y: 0, time: clock(HC.photo_survey),
      summary: 'Four caller inputs. The photo survey is optional, and this week it arrived <em>incomplete</em>.',
      nodes: [
        { id: 'in-week', type: 'rectangle', label: 'week_of', state: 'consumed', meta: 'caller · required', stat: 'Jun 22', x: -4.5, z: -1.4, detail: W.INPUT_GLOSS.week_of },
        { id: 'in-notes', type: 'rectangle', label: 'keeper_notes', state: 'consumed', meta: 'caller · required', stat: '38 notes', x: -1.5, z: -1.4, detail: W.INPUT_GLOSS.keeper_notes },
        { id: 'in-roster', type: 'rectangle', label: 'tank_roster', state: 'consumed', meta: 'caller · required', stat: '11 exhibits', x: 1.5, z: -1.4, detail: W.INPUT_GLOSS.tank_roster },
        { id: 'in-photos', type: 'rectangle', label: 'photo_survey', state: 'partial', meta: 'caller · optional', stat: '10 of 11 sets', x: 4.5, z: -1.4, detail: `${cap(W.INPUT_GLOSS.photo_survey)}. The jelly gallery's set was still uploading when the run began.` },
      ],
      edges: [] },
    { id: 1, label: 'T2 · Profile', short: 'T2', y: 3, time: clock(HC['roster-profiler']),
      summary: 'The <code>roster-profiler</code> reads the roster and last week\'s memo and decides where to look first.',
      nodes: [
        { id: 'svc-profiler', type: 'circle', label: 'roster-profiler', state: 'completed', meta: `agent · ${clock(HC['roster-profiler'] - HC.photo_survey)}`, stat: 'lead step', x: -1.6, z: 0,
          detail: W.SERVICES['roster-profiler'][0], sources: [{ name: 'tank_roster', kind: 'binding' }, { name: 'last week\'s memo', kind: 'run' }] },
        { id: 'out-watch', type: 'rectangle', label: 'watchlist', state: 'produced', meta: 'binding · 3 exhibits', stat: '3 exhibits', x: 2.8, z: 0.8,
          detail: 'Mangrove lagoon (nitrate), kelp forest (a keeper note), jelly gallery (last week\'s photos).', fields: ['exhibit', 'reason'] },
      ],
      edges: [{ source: 'svc-profiler', target: 'out-watch', type: 'solid' }] },
    { id: 2, label: 'T3 · Scouts', short: 'T3', y: 6, time: clock(HC['photo-scout#2']),
      summary: 'Four scouts in parallel. Three were back within <span class="fig">3m 34s</span>; the photo scout failed at <span class="fig">4m 07s</span> and recovered at <span class="fig">7m 32s</span>.',
      nodes: [
        { id: 'svc-behavior', type: 'circle', label: 'behavior-scout', state: 'completed', meta: `agent · ${clock(HC['behavior-scout'] - HC['roster-profiler'])}`, stat: '4 notes flagged', x: -4.5, z: 0,
          detail: W.SERVICES['behavior-scout'][0], sources: [{ name: 'keeper_notes', kind: 'binding' }, { name: 'watchlist', kind: 'binding' }] },
        { id: 'svc-feeding', type: 'circle', label: 'feeding-scout', state: 'completed', meta: `agent · ${clock(HC['feeding-scout'] - HC['roster-profiler'])}`, stat: '2 refusals', x: -1.5, z: 0,
          detail: W.SERVICES['feeding-scout'][0], sources: [{ name: 'feeding ledgers', kind: 'run' }] },
        { id: 'svc-photo', type: 'circle', label: 'photo-scout', state: 'recovered', meta: 'agent · failed once · resumed', stat: 'export-incomplete', x: 1.5, z: 0,
          detail: 'Failed at 4m 07s: the jelly gallery\'s photo set was incomplete (<code>export-incomplete</code>). Re-ran once the set landed, handing it to an <code>image-reader</code> delegate, and finished at 7m 32s with one of the two jelly photos it needed.',
          sources: [{ name: 'photo_survey', kind: 'binding', state: 'partial' }, { name: 'jelly gallery set', kind: 'camera export', state: 'fail' }, { name: 'image-reader', kind: 'delegate' }] },
        { id: 'svc-water', type: 'circle', label: 'water-scout', state: 'completed', meta: `agent · ${clock(HC['water-scout'] - HC['roster-profiler'])}`, stat: '1 drift', x: 4.5, z: 0,
          detail: W.SERVICES['water-scout'][0], sources: [{ name: 'chemistry logs', kind: 'run' }] },
      ],
      edges: [] },
    { id: 3, label: 'T4 · Compile', short: 'T4', y: 9, time: clock(HC['husbandry-compiler']),
      summary: 'The <code>husbandry-compiler</code> sorts what the scouts found into flags, steady exhibits and actions with owners.',
      nodes: [
        { id: 'svc-compiler', type: 'circle', label: 'husbandry-compiler', state: 'completed', meta: `agent · ${clock(HC['husbandry-compiler'] - HC['photo-scout#2'])}`, stat: '3 flags · 3 actions', x: -1.8, z: 0,
          detail: W.SERVICES['husbandry-compiler'][0], sources: [{ name: 'behavior', kind: 'binding' }, { name: 'refusals', kind: 'binding' }, { name: 'photos', kind: 'binding', state: 'partial' }, { name: 'water', kind: 'binding' }] },
        { id: 'out-flags', type: 'rectangle', label: 'flags', state: 'produced', meta: 'binding · 3 exhibits', stat: '1 improving · 1 watch · 1 needs a look', x: 2.8, z: 0.6,
          detail: W.HERO.flags.map((f) => `${cap(f.exhibit)}: ${f.state}.`).join(' '), fields: ['exhibit', 'state', 'evidence'] },
      ],
      edges: [{ source: 'svc-compiler', target: 'out-flags', type: 'solid' }] },
    { id: 4, label: 'T5 · Deliver', short: 'T5', y: 12, time: clock(HC.end),
      summary: `The memo goes to the husbandry team at <span class="fig">${pt(H.end)} PT</span>. The inspector re-reads the run and passes <span class="fig">${heroEval.evalPass} of ${heroEval.evalTotal}</span> checks.`,
      nodes: [
        { id: 'out-memo', type: 'parallelogram', label: 'memo.md', state: 'produced', meta: `deliverable · delivered ${pt(H.end)} PT`, stat: '3 flags · 3 actions', x: -2.4, z: 0,
          richBody: 'memo', fields: ['flags', 'steady', 'actions', 'gaps'], cta: { label: 'Open memo.md', href: memoPath },
          detail: 'The weekly memo for the husbandry team, sent by email with the readings attached.' },
        { id: 'eval-agg', type: 'octagon-compound', label: 'inspector', state: 'flagged', meta: `eval · ${heroEval.evalPass} of ${heroEval.evalTotal} pass`, stat: 'photo_for_every_flag', x: 2.6, z: 0,
          richBody: 'eval', detail: 'std/evals/inspector re-read the finished run against its contract.' },
      ],
      edges: [{ source: 'out-memo', target: 'eval-agg', type: 'solid' }] },
  ],
  EVAL_CHECKS: checkRows,
  verticalEdges: [
    { sourceId: 'in-week', s0: 0, targetId: 'svc-profiler', s1: 1, type: 'solid' },
    { sourceId: 'in-roster', s0: 0, targetId: 'svc-profiler', s1: 1, type: 'solid' },
    { sourceId: 'in-notes', s0: 0, targetId: 'svc-behavior', s1: 2, type: 'solid' },
    { sourceId: 'in-photos', s0: 0, targetId: 'svc-photo', s1: 2, type: 'dashed' },
    ...['svc-behavior', 'svc-feeding', 'svc-photo', 'svc-water'].map((t) => ({ sourceId: 'out-watch', s0: 1, targetId: t, s1: 2, type: 'solid' })),
    ...['svc-behavior', 'svc-feeding', 'svc-photo', 'svc-water'].map((s) => ({ sourceId: s, s0: 2, targetId: 'svc-compiler', s1: 3, type: 'solid' })),
    { sourceId: 'svc-compiler', s0: 3, targetId: 'out-memo', s1: 4, type: 'solid' },
    { sourceId: 'out-flags', s0: 3, targetId: 'out-memo', s1: 4, type: 'solid' },
  ],
  PRETEXT_HTML: `Friday's <span class="fig">livestock health memo</span> took <span class="fig">${clock(H.durSec)}</span>{{pie:12}}. Four scouts read the week at once; the <span class="code">photo-scout</span> failed on a late camera export, re-ran through a delegate and recovered{{ratio:3/4}}. The memo shipped with three flags and passed <span class="fig">${heroEval.evalPass} of ${heroEval.evalTotal}</span> checks{{eval}}: <span class="verdict">one photo is still missing</span>.`,
  DELTA_LEDGER: [
    { time: clock(HC['roster-profiler'] - HC.photo_survey), html: 'The <span class="code">roster-profiler</span> read the roster and last week\'s memo and put three exhibits on the watchlist{{pie:1}}.' },
    { time: clock(HC['photo-scout#2'] - HC['roster-profiler']), html: 'Four scouts in parallel. Three were back in under four minutes; the photo scout failed on <span class="code">export-incomplete</span> and recovered through <span class="code">image-reader</span>{{ratio:3/4}}.' },
    { time: clock(HC['husbandry-compiler'] - HC['photo-scout#2']), html: 'The <span class="code">husbandry-compiler</span> sorted the findings: three flags, seven steady exhibits, three actions with owners{{pie:3}}.' },
    { time: clock(HC.end - HC['husbandry-compiler']), html: `The memo went out; the inspector passed <span class="fig">${heroEval.evalPass} of ${heroEval.evalTotal}</span> checks and named the missing photo{{eval}}.` },
  ],
  MEMO_BODY_HTML,
  MEMO_MORE_HTML,
};

// codex: one run, four synced views
{
  const node = (o) => ({ status: 'A', kind: 'agent', state: 'completed', tokens: null, latency: null, upstream: [], downstream: [], ...o });
  const tok = (k, a, b) => stream(`codex|${k}`).int(a, b);
  slots['run-codex'] = {
    TRACE: {
      id: H.id, program: 'livestock-memo', customer: W.ORG.label, subject: 'livestock health, week of Jun 22 (synthetic)',
      totalTime: clock(H.durSec),
      elapsedEvents: [HC.photo_survey, HC['roster-profiler'], HC['photo-scout#2'], HC['husbandry-compiler'], HC.end],
      slices: [
        { id: 'T1', label: 'T1 Inputs', short: 'T1', phase: 'inputs', time: clock(HC.photo_survey), y: 0,
          summary: 'Four caller bindings. The photo survey arrived <em>incomplete</em>.',
          nodes: [
            node({ id: 'in-week', name: 'week_of', type: 'data', status: 'U', kind: 'binding · required', state: 'consumed', latency: 'instant', downstream: ['n-profiler'], pos3d: { x: -4.5, z: -1 }, summary: W.INPUT_GLOSS.week_of }),
            node({ id: 'in-notes', name: 'keeper_notes', type: 'data', status: 'U', kind: 'binding · required', state: 'consumed', latency: 'instant', downstream: ['n-behavior'], pos3d: { x: -1.5, z: -1 }, summary: W.INPUT_GLOSS.keeper_notes }),
            node({ id: 'in-roster', name: 'tank_roster', type: 'data', status: 'U', kind: 'binding · required', state: 'consumed', latency: 'instant', downstream: ['n-profiler'], pos3d: { x: 1.5, z: -1 }, summary: W.INPUT_GLOSS.tank_roster }),
            node({ id: 'in-photos', name: 'photo_survey', type: 'data', status: 'P', kind: 'binding · optional', state: 'partial', latency: 'instant', downstream: ['n-photo'], pos3d: { x: 4.5, z: -1 }, summary: 'Ten of eleven photo sets; the jelly gallery\'s was still uploading.' }),
          ] },
        { id: 'T2', label: 'T2 Profile', short: 'T2', phase: 'profile', time: clock(HC['roster-profiler']), y: 3,
          summary: 'The roster-profiler decides where to look first.',
          nodes: [
            node({ id: 'n-profiler', name: 'roster-profiler', type: 'agent', kind: 'agent · lead', tokens: tok('prof', 5200, 7400), latency: clock(HC['roster-profiler'] - HC.photo_survey),
              upstream: ['in-week', 'in-roster'], downstream: ['o-watch'], pos3d: { x: -1.6, z: 0 }, summary: W.SERVICES['roster-profiler'][0],
              sources: [{ name: 'tank_roster', kind: 'binding' }, { name: 'last week\'s memo', kind: 'run' }] }),
            node({ id: 'o-watch', name: 'watchlist', type: 'output', kind: 'binding', state: 'produced', upstream: ['n-profiler'],
              downstream: ['n-behavior', 'n-feeding', 'n-photo', 'n-water'], pos3d: { x: 2.8, z: 0.8 }, fields: ['exhibit', 'reason'],
              summary: 'Mangrove lagoon, kelp forest, jelly gallery.' }),
          ] },
        { id: 'T3', label: 'T3 Scouts', short: 'T3', phase: 'scouts', time: clock(HC['photo-scout#2']), y: 6,
          summary: 'Four scouts in parallel; the photo scout fails once and recovers through a delegate.',
          nodes: [
            node({ id: 'n-behavior', name: 'behavior-scout', type: 'agent', kind: 'agent · scout', tokens: tok('beh', 14000, 19000), latency: clock(HC['behavior-scout'] - HC['roster-profiler']),
              upstream: ['o-watch', 'in-notes'], downstream: ['o-behavior'], pos3d: { x: -4.5, z: -1.2 }, summary: W.SERVICES['behavior-scout'][0] }),
            node({ id: 'n-feeding', name: 'feeding-scout', type: 'agent', kind: 'agent · scout', tokens: tok('feed', 8000, 11000), latency: clock(HC['feeding-scout'] - HC['roster-profiler']),
              upstream: ['o-watch'], downstream: ['o-refusals'], pos3d: { x: -1.5, z: -1.2 }, summary: W.SERVICES['feeding-scout'][0] }),
            node({ id: 'n-photo', name: 'photo-scout', type: 'agent', status: 'P', kind: 'agent · scout', state: 'recovered', tokens: tok('photo', 16000, 22000),
              latency: `${clock(HC['photo-scout#1'] - HC['roster-profiler'])} + ${clock(HC['photo-scout#2'] - HC['image-reader'])}`,
              upstream: ['o-watch', 'in-photos'], downstream: ['d-image', 'o-photos'], pos3d: { x: 1.5, z: -1.2 },
              summary: 'Failed on <code>export-incomplete</code> at 4m 07s; re-ran through a delegate and finished at 7m 32s.',
              sources: [{ name: 'photo_survey', kind: 'binding', state: 'partial' }, { name: 'jelly gallery set', kind: 'camera export', state: 'partial' }] }),
            node({ id: 'd-image', name: 'image-reader', type: 'delegation', kind: 'delegate · req-001', tokens: tok('img', 9000, 13000), latency: clock(HC['image-reader'] - HC['photo-scout#1']),
              upstream: ['n-photo'], downstream: ['o-photo-notes'], pos3d: { x: 2.6, z: 1.6 }, summary: W.SERVICES['image-reader'][0] }),
            node({ id: 'n-water', name: 'water-scout', type: 'agent', kind: 'agent · scout', tokens: tok('water', 6000, 9000), latency: clock(HC['water-scout'] - HC['roster-profiler']),
              upstream: ['o-watch'], downstream: ['o-water'], pos3d: { x: 4.5, z: -1.2 }, summary: W.SERVICES['water-scout'][0] }),
            node({ id: 'o-behavior', name: 'behavior', type: 'output', kind: 'binding', state: 'produced', upstream: ['n-behavior'], downstream: ['n-compiler'], pos3d: { x: -4.5, z: 1.6 }, fields: ['exhibit', 'change', 'note'] }),
            node({ id: 'o-refusals', name: 'refusals', type: 'output', kind: 'binding', state: 'produced', upstream: ['n-feeding'], downstream: ['n-compiler'], pos3d: { x: -1.5, z: 1.6 }, fields: ['exhibit', 'feed', 'day'] }),
            node({ id: 'o-photos', name: 'photos', type: 'output', status: 'P', kind: 'binding', state: 'partial', upstream: ['n-photo'], downstream: ['n-compiler'], pos3d: { x: 0.6, z: 2.6 }, fields: ['exhibit', 'change', 'photo'] }),
            node({ id: 'o-photo-notes', name: 'photo-notes', type: 'output', kind: 'binding', state: 'produced', upstream: ['d-image'], downstream: ['n-photo'], pos3d: { x: 3.6, z: 3.2 }, fields: ['photo', 'description'] }),
            node({ id: 'o-water', name: 'water', type: 'output', kind: 'binding', state: 'produced', upstream: ['n-water'], downstream: ['n-compiler'], pos3d: { x: 5.2, z: 1.6 }, fields: ['tank', 'drift', 'nights'] }),
          ] },
        { id: 'T4', label: 'T4 Compile', short: 'T4', phase: 'compile', time: clock(HC['husbandry-compiler']), y: 9,
          summary: 'The husbandry-compiler sorts the findings into flags, steady exhibits and actions.',
          nodes: [
            node({ id: 'n-compiler', name: 'husbandry-compiler', type: 'agent', kind: 'agent · compiler', tokens: tok('comp', 21000, 26000), latency: clock(HC['husbandry-compiler'] - HC['photo-scout#2']),
              upstream: ['o-behavior', 'o-refusals', 'o-photos', 'o-water'], downstream: ['o-flags', 'o-memo'], pos3d: { x: -1.8, z: 0 }, summary: W.SERVICES['husbandry-compiler'][0] }),
            node({ id: 'o-flags', name: 'flags', type: 'output', kind: 'binding', state: 'produced', upstream: ['n-compiler'], downstream: ['o-memo'],
              pos3d: { x: 2.8, z: 0.6 }, fields: ['exhibit', 'state', 'evidence'], summary: W.HERO.flags.map((f) => `${cap(f.exhibit)}: ${f.state}.`).join(' ') }),
          ] },
        { id: 'T5', label: 'T5 Deliver', short: 'T5', phase: 'deliver', time: clock(HC.end), y: 12,
          summary: `The memo goes out at ${pt(H.end)} PT; the inspector passes ${heroEval.evalPass} of ${heroEval.evalTotal} checks.`,
          nodes: [
            node({ id: 'o-memo', name: 'memo', type: 'output', kind: 'deliverable', state: 'delivered', upstream: ['n-compiler', 'o-flags'], downstream: ['n-inspector'],
              pos3d: { x: -3.2, z: 0.4 }, fields: ['flags', 'steady', 'actions', 'gaps'], summary: `Three flags, seven steady exhibits, three actions with owners. Emailed to the husbandry team at ${pt(H.end)} PT.` }),
            node({ id: 'n-inspector', name: 'inspector', type: 'agent', kind: 'eval · std/evals/inspector', state: 'flagged', tokens: tok('insp', 9000, 12000), latency: clock(heroEval.durSec),
              upstream: ['o-memo'], pos3d: { x: 2.4, z: 0 }, summary: 'Re-read the finished run against its contract.', evalChecks: checkRows }),
          ] },
      ],
    },
    PRETEXT_HTML: `<strong class="pre-tap" data-nav="T3"><span class="fig">Four scouts</span></strong> read Saltlight's week in parallel{{sparkC}}. The run took <span class="fig">${clock(H.durSec)}</span>{{sparkA}}, most of it waiting on a late camera export: the <strong class="pre-tap" data-nav="n-photo">photo scout</strong> failed once and recovered through a <strong class="pre-tap" data-nav="d-image">delegate</strong>. The <strong class="pre-tap" data-nav="n-inspector">inspector</strong> passed <span class="fig">${heroEval.evalPass} of ${heroEval.evalTotal}</span> checks{{sparkB}}.`,
  };
}

// trees: the same run as a file tree with a control-flow graph
{
  const t = (k, a, b) => stream(`trees|${k}`).int(a, b);
  const c = {
    k: (s) => `<span class="ck">${s}</span>`, n: (s) => `<span class="cn">${s}</span>`,
    s: (s) => `<span class="cs">${s}</span>`, cc: (s) => `<span class="cc">${s}</span>`,
  };
  const contract = (svc, req, ens) => [c.cc(`# sources/${svc}.prose.md`), `${c.k('### Requires')}`, ...req.map((r) => `- ${c.n(r)}`),
    `${c.k('### Ensures')}`, `- ${c.n(ens[0])}: ${ens[1]}`].join('\n');
  const binding = (name, value) => [c.cc(`# bindings/caller/${name}.md`), `${c.k('binding')}: input`, `${c.k('source')}: caller`, '---', c.s(value)].join('\n');
  const N = (o) => ({ status: '', model: null, tokens: 0, latency: 'n/a', upstream: [], downstream: [], ...o });
  const SONNET = 'claude-sonnet-5', HAIKU = 'claude-haiku-4-5';
  slots['trace-trees-graph'] = {
    TRACE: {
      id: H.id,
      slices: [
        { id: 'T1', label: 'T1 Inputs (synthetic run)', phase: 'inputs', nodes: [
          N({ id: 'week_of', name: 'week_of', type: 'data', status: 'U', tokens: 12, latency: 'n/a', state: 'consumed', downstream: ['roster-profiler'], code: binding('week_of', '2026-06-22') }),
          N({ id: 'keeper_notes', name: 'keeper_notes', type: 'data', status: 'U', tokens: t('notes', 2100, 2600), latency: 'n/a', state: 'consumed', downstream: ['behavior-scout'], code: binding('keeper_notes', '38 notes, Mon to Thu') }),
          N({ id: 'tank_roster', name: 'tank_roster', type: 'data', status: 'U', tokens: t('roster', 600, 800), latency: 'n/a', state: 'consumed', downstream: ['roster-profiler'], code: binding('tank_roster', '11 exhibits with ranges') }),
          N({ id: 'photo_survey', name: 'photo_survey', type: 'data', status: 'U', tokens: t('photos', 300, 420), latency: 'n/a', state: 'partial', downstream: ['photo-scout'], code: binding('photo_survey', '10 of 11 sets; jelly gallery uploading') }),
        ] },
        { id: 'T2', label: 'T2 Profile', phase: 'profile', nodes: [
          N({ id: 'roster-profiler', name: 'roster-profiler', type: 'agent', status: 'M', model: SONNET, tokens: t('prof', 5200, 7400), latency: `${HC['roster-profiler'] - HC.photo_survey}s`, state: 'completed',
            upstream: ['week_of', 'tank_roster'], downstream: ['watchlist'], code: contract('roster-profiler', ['tank_roster', 'week_of'], ['watchlist', 'exhibits to look at first, each with its reason']) }),
          N({ id: 'watchlist', name: 'watchlist', type: 'output', status: 'A', tokens: t('watch', 300, 450), latency: 'n/a', state: 'produced', upstream: ['roster-profiler'],
            downstream: ['behavior-scout', 'feeding-scout', 'photo-scout', 'water-scout'], code: [c.cc('# bindings/roster-profiler/watchlist.md'), `- ${c.n('mangrove lagoon')}: nitrate rising`, `- ${c.n('kelp forest')}: keeper note, Tuesday`, `- ${c.n('jelly gallery')}: last week's photos`].join('\n') }),
        ] },
        { id: 'T3', label: 'T3 Scouts', phase: 'scouts', nodes: [
          N({ id: 'behavior-scout', name: 'behavior-scout', type: 'agent', status: 'A', model: SONNET, tokens: t('beh', 14000, 19000), latency: `${HC['behavior-scout'] - HC['roster-profiler']}s`, state: 'completed',
            upstream: ['watchlist', 'keeper_notes'], downstream: ['husbandry-compiler'], code: contract('behavior-scout', ['keeper_notes', 'watchlist'], ['behavior', 'behaviour changes per exhibit, each with its note']) }),
          N({ id: 'feeding-scout', name: 'feeding-scout', type: 'agent', status: 'A', model: HAIKU, tokens: t('feed', 8000, 11000), latency: `${HC['feeding-scout'] - HC['roster-profiler']}s`, state: 'completed',
            upstream: ['watchlist'], downstream: ['husbandry-compiler'], code: contract('feeding-scout', ['watchlist', 'feeding ledgers'], ['refusals', 'refusals and missed feeds per exhibit']) }),
          N({ id: 'photo-scout', name: 'photo-scout', type: 'delegation', status: 'D', model: SONNET, tokens: t('photo', 16000, 22000), latency: `${HC['photo-scout#2'] - HC['roster-profiler']}s`, state: 'recovered',
            upstream: ['watchlist', 'photo_survey'], downstream: ['image-reader', 'husbandry-compiler'],
            code: [c.cc('# vm.log.md'), `${c.n('6c')}→ photo-scout ✗ ${c.s('export-incomplete')}`, `${c.n('7')}→ photo-scout ⇒ image-reader (delegate: ${c.s('req-001')})`, `${c.n('7')}→   image-reader ✓`, `${c.n('7')}→ photo-scout ⟳ (resumed)`, `${c.n('8')}→ photo-scout ✓`].join('\n') }),
          N({ id: 'image-reader', name: 'image-reader', type: 'output', status: 'A', model: null, tokens: t('img', 9000, 13000), latency: `${HC['image-reader'] - HC['photo-scout#1']}s`, state: 'produced',
            upstream: ['photo-scout'], downstream: ['husbandry-compiler'], code: [c.cc('# workspace/photo-scout/__delegate/image-reader/req-001-response.md'), 'jelly gallery, kreisel 2:', '  bell margin ragged on two medusae', '  second angle: not in the set'].join('\n') }),
          N({ id: 'water-scout', name: 'water-scout', type: 'agent', status: 'A', model: HAIKU, tokens: t('water', 6000, 9000), latency: `${HC['water-scout'] - HC['roster-profiler']}s`, state: 'completed',
            upstream: ['watchlist'], downstream: ['husbandry-compiler'], code: contract('water-scout', ['chemistry logs', 'watchlist'], ['water', 'drift per tank with the nights it lasted']) }),
        ] },
        { id: 'T4', label: 'T4 Compile', phase: 'compile', nodes: [
          N({ id: 'husbandry-compiler', name: 'husbandry-compiler', type: 'agent', status: 'M', model: SONNET, tokens: t('comp', 21000, 26000), latency: `${HC['husbandry-compiler'] - HC['photo-scout#2']}s`, state: 'completed',
            upstream: ['behavior-scout', 'feeding-scout', 'image-reader', 'water-scout'], downstream: ['memo'],
            code: contract('husbandry-compiler', ['watchlist', 'behavior', 'refusals', 'photos', 'water'], ['memo', 'one section per exhibit; every flag cites its evidence; actions have owners']) }),
          N({ id: 'memo', name: 'memo', type: 'output', status: 'A', tokens: t('memo', 2600, 3200), latency: 'n/a', state: 'produced', upstream: ['husbandry-compiler'], downstream: ['inspector'],
            code: [c.cc('# bindings/husbandry-compiler/memo.md'), '# Livestock health · week of June 22', ...W.HERO.flags.map((f) => `- ${c.n(f.exhibit)}: ${f.state}`)].join('\n') }),
        ] },
        { id: 'T5', label: 'T5 Verify', phase: 'verify', nodes: [
          N({ id: 'inspector', name: 'inspector', type: 'agent', status: 'A', model: SONNET, tokens: t('insp', 9000, 12000), latency: `${heroEval.durSec}s`, state: 'flagged',
            upstream: ['memo'], code: [c.cc(`# vm.log.md · run ${heroEval.id}`), ...heroEval.steps.filter((s) => s.kind === 'eval').map((s) => `${c.n(String(s.phase))}→ [eval] ${s.name} ${s.status === 'ok' ? '✓' : '✗'}`), `---test FAIL (${heroEval.evalPass}/${heroEval.evalTotal} assertions)`].join('\n') }),
        ] },
      ],
    },
  };
}

// strata-audio: the same run as five sounding planes. Shape is role and
// role is pitch (agent, delegation, data, output: a major-seventh chord);
// each plane is an octave, so playing the run walks it upward.
{
  const n = (id, type, label, state, x, z, extra = {}) => ({ id, type, label, state, x, z, potential: false, ...extra });
  slots['strata-audio'] = {
    timeSlices: [
      { id: 0, label: 'T1 · Inputs', y: 0,
        nodes: [n('in-week', 'rectangle', 'week_of', 'consumed', -3.6, -1.2), n('in-notes', 'rectangle', 'keeper_notes', 'consumed', -1.2, -1.2),
          n('in-roster', 'rectangle', 'tank_roster', 'consumed', 1.2, -1.2), n('in-photos', 'rectangle', 'photo_survey', 'waiting', 3.6, -1.2)],
        edges: [] },
      { id: 1, label: 'T2 · Profile', y: 3,
        nodes: [n('profiler', 'circle', 'roster-profiler', 'active', -2.4, 0), n('watchlist', 'rectangle', 'watchlist', 'produced', 0.6, 1.6),
          n('dispatch', 'triangle', 'Dispatch → 4 scouts', 'deciding', 2.6, -1.2)],
        edges: [{ source: 'profiler', target: 'watchlist', type: 'solid' }, { source: 'profiler', target: 'dispatch', type: 'solid' }] },
      { id: 2, label: 'T3 · Scouts', y: 6,
        nodes: [n('behavior', 'circle', 'behavior-scout', 'active', -4, 0.8), n('feeding', 'circle', 'feeding-scout', 'active', -1.4, 0.8),
          n('photo', 'circle', 'photo-scout ✗', 'waiting', 1.4, 0.8), n('water', 'circle', 'water-scout', 'active', 4, 0.8),
          n('delegate', 'triangle', '→ image-reader', 'spawning', 3, -2.4)],
        edges: [{ source: 'photo', target: 'delegate', type: 'solid' }] },
      { id: 3, label: 'T4 · Compile', y: 9,
        nodes: [n('image', 'circle', 'image-reader', 'completed', 4.2, -2), n('photo-2', 'circle', 'photo-scout ⟳', 'completed', 1.6, 1.4),
          n('compiler', 'circle', 'husbandry-compiler', 'active', -2.2, -1.2), n('flags', 'rectangle', 'flags', 'produced', -3.8, 2)],
        edges: [{ source: 'image', target: 'photo-2', type: 'solid' }, { source: 'photo-2', target: 'compiler', type: 'solid' }, { source: 'compiler', target: 'flags', type: 'solid' }] },
      { id: 4, label: 'T5 · Deliver', y: 12,
        nodes: [n('memo', 'parallelogram', 'memo.md', 'produced', -3.6, 1.2), n('inspector', 'circle', `inspector ${heroEval.evalPass}/${heroEval.evalTotal}`, 'completed', 0.4, -2.2),
          n('email', 'parallelogram', 'email', 'collected', 4.2, 1.8)],
        edges: [{ source: 'memo', target: 'inspector', type: 'solid' }, { source: 'memo', target: 'email', type: 'solid' }] },
    ],
    verticalEdges: [
      { sourceId: 'in-week', sourceSlice: 0, targetId: 'profiler', targetSlice: 1, type: 'solid' },
      { sourceId: 'in-roster', sourceSlice: 0, targetId: 'profiler', targetSlice: 1, type: 'solid' },
      { sourceId: 'in-notes', sourceSlice: 0, targetId: 'behavior', targetSlice: 2, type: 'solid' },
      { sourceId: 'in-photos', sourceSlice: 0, targetId: 'photo', targetSlice: 2, type: 'dashed' },
      ...['behavior', 'feeding', 'photo', 'water'].map((t) => ({ sourceId: 'dispatch', sourceSlice: 1, targetId: t, targetSlice: 2, type: 'solid' })),
      { sourceId: 'delegate', sourceSlice: 2, targetId: 'image', targetSlice: 3, type: 'solid' },
      { sourceId: 'photo', sourceSlice: 2, targetId: 'photo-2', targetSlice: 3, type: 'dashed' },
      ...['behavior', 'feeding', 'water'].map((s) => ({ sourceId: s, sourceSlice: 2, targetId: 'compiler', targetSlice: 3, type: 'solid' })),
      { sourceId: 'compiler', sourceSlice: 3, targetId: 'memo', targetSlice: 4, type: 'solid' },
      { sourceId: 'flags', sourceSlice: 3, targetId: 'memo', targetSlice: 4, type: 'solid' },
    ],
  };
}

// ======================================================= the hero's record
// The run directory OpenProse's filesystem backend writes, for the hero and
// for the inspector run that re-read it.
const files = {};
{
  const base = `runs/${H.id}`;
  const p = P['livestock-memo'];
  const put = (rel, text) => { files[`${base}/${rel}`] = text.endsWith('\n') ? text : `${text}\n`; };
  const svcDoc = (name, req, ens) => [`---`, `name: ${name}`, 'kind: service', '---', '',
    `# ${name.split('-').map(cap).join(' ')}`, '', '### Description', '', W.SERVICES[name][0], '',
    '### Requires', '', ...req.map((r) => `- \`${r}\``), '', '### Ensures', '', `- \`${ens}\`: ${W.SERVICES[name][1]}`].join('\n');
  put('root.prose.md', ['---', 'name: livestock-health-memo', 'kind: system', '---', '', '# Livestock Health Memo', '',
    '### Description', '', p.about, '', '### Services', '', ...[p.lead, ...p.scouts, p.compiler].map((s) => `- \`${s}\``), '',
    '### Requires', '', ...p.inputs.map((i) => `- \`${i}\`: ${W.INPUT_GLOSS[i]}${i === 'photo_survey' ? ' (optional)' : ''}`), '',
    '### Ensures', '', `- \`memo\`: ${W.SERVICES['husbandry-compiler'][1]}`, '',
    '### Strategies', '', '- when the photo survey is late or incomplete: let the other scouts finish, retry the photo scout once',
    '  when the set lands, and say in the memo which photos are missing', '- when an exhibit has no change: one line, not a section'].join('\n'));
  put('sources/roster-profiler.prose.md', svcDoc('roster-profiler', ['tank_roster', 'week_of'], 'watchlist'));
  put('sources/behavior-scout.prose.md', svcDoc('behavior-scout', ['keeper_notes', 'watchlist'], 'behavior'));
  put('sources/feeding-scout.prose.md', svcDoc('feeding-scout', ['watchlist'], 'refusals'));
  put('sources/photo-scout.prose.md', svcDoc('photo-scout', ['photo_survey', 'watchlist'], 'photos'));
  put('sources/water-scout.prose.md', svcDoc('water-scout', ['watchlist'], 'water'));
  put('sources/husbandry-compiler.prose.md', svcDoc('husbandry-compiler', ['watchlist', 'behavior', 'refusals', 'photos', 'water'], 'memo'));
  const ws = (svc) => `workspace/${svc}/`;
  const graph = [
    { id: 'roster-profiler', inputs: [['tank_roster', 'caller'], ['week_of', 'caller']], outputs: ['watchlist'] },
    { id: 'behavior-scout', inputs: [['keeper_notes', 'caller'], ['watchlist', 'roster-profiler']], outputs: ['behavior'] },
    { id: 'feeding-scout', inputs: [['watchlist', 'roster-profiler']], outputs: ['refusals'] },
    { id: 'photo-scout', inputs: [['photo_survey', 'caller'], ['watchlist', 'roster-profiler']], outputs: ['photos'], delegates: ['image-reader'] },
    { id: 'water-scout', inputs: [['watchlist', 'roster-profiler']], outputs: ['water'] },
    { id: 'husbandry-compiler', inputs: [['watchlist', 'roster-profiler'], ['behavior', 'behavior-scout'], ['refusals', 'feeding-scout'], ['photos', 'photo-scout'], ['water', 'water-scout']], outputs: ['memo'] },
  ];
  put('forme.manifest.json', JSON.stringify({
    id: H.id, systemName: 'livestock-health-memo', sourcePath: 'src/livestock-health-memo.prose.md',
    caller: { requires: p.inputs.map((i) => ({ name: i, description: W.INPUT_GLOSS[i] })), returns: [{ name: 'memo', source: 'husbandry-compiler' }] },
    graph: graph.map((g) => ({
      id: g.id, sourcePath: `sources/${g.id}.prose.md`, workspacePath: ws(g.id),
      inputs: g.inputs.map(([name, from]) => ({ name, from, sourceNodeId: from === 'caller' ? null : from, sourceOutput: from === 'caller' ? null : name,
        path: from === 'caller' ? `bindings/caller/${name}.md` : `bindings/${from}/${name}.md` })),
      outputs: g.outputs.map((o) => ({ name: o, workspacePath: `${ws(g.id)}${o}.md`, bindingPath: `bindings/${g.id}/${o}.md`, public: true })),
      errors: g.id === 'photo-scout' ? [{ name: 'export-incomplete', description: 'the photo survey is missing a set' }] : [],
      delegates: g.delegates || [],
    })),
    executionOrder: [
      { nodeId: 'roster-profiler', dependsOn: [] },
      ...p.scouts.map((s) => ({ nodeId: s, dependsOn: ['roster-profiler'] })),
      { nodeId: 'husbandry-compiler', dependsOn: p.scouts.slice() },
    ],
    environment: [], tools: [], warnings: [],
  }, null, 2));
  put('vm.log.md', [`# run:${H.id} livestock-health-memo`, 'root: src/livestock-health-memo.prose.md', '',
    '1→ [input] week_of ✓', '2→ [input] keeper_notes ✓', '3→ [input] tank_roster ✓', '4→ [input] photo_survey ✓',
    '5→ roster-profiler ✓', `6→ ∥start ${p.scouts.join(',')}`, '6a→ behavior-scout ✓', '6b→ feeding-scout ✓',
    `6c→ photo-scout ✗ ${W.HERO.error}`, '6d→ water-scout ✓', '6→ ∥done',
    '7→ photo-scout ⇒ image-reader (delegate: req-001)', '7→   image-reader ✓', '7→ photo-scout ⟳ (resumed)',
    '8→ photo-scout ✓', '9→ husbandry-compiler ✓', `---end ${iso(H.end)}`].join('\n'));
  const callerVal = { week_of: '2026-06-22', keeper_notes: '38 notes, Monday to Thursday (see the keepers\' log export).',
    tank_roster: W.EXHIBITS.map((e) => `- ${e}`).join('\n'), photo_survey: '10 of 11 photo sets. The jelly gallery set is still uploading.' };
  for (const i of p.inputs) put(`bindings/caller/${i}.md`, [`# ${i}`, '', 'binding: input', 'source: caller', '', '---', '', callerVal[i]].join('\n'));
  const out = {
    'roster-profiler/watchlist.md': ['# Watchlist', '', '- mangrove lagoon: nitrate rising since Tuesday', '- kelp forest: a keeper note on Tuesday about a garibaldi', '- jelly gallery: last week\'s photos showed ragged bell margins'],
    'behavior-scout/behavior.md': ['# Behaviour changes', '', '- kelp forest: one garibaldi hiding at feeds, Tuesday, Wednesday and Thursday (three notes)', '- octopus den: none; the resident explored the new puzzle feeder', '- everything else: no change noted'],
    'feeding-scout/refusals.md': ['# Refusals and missed feeds', '', '- kelp forest: krill refused twice, Wednesday and Thursday, by the same garibaldi', '- no missed feeds'],
    'photo-scout/photos.md': ['# Visible changes', '', '- jelly gallery: ragged bell margins on two moon jellies (Monday\'s set; Thursday\'s set incomplete)', '- kelp forest: garibaldi photographed Thursday; no fin damage, colour normal', '- missing: the second jelly gallery photo'],
    'water-scout/water.md': ['# Water', '', '- mangrove lagoon: nitrate 12 ppm on Tuesday night, 6 ppm by Friday after a water change', '- every other tank in range all week'],
    'husbandry-compiler/memo.md': ['# Livestock health · week of June 22', '', `${W.ORG.label} · for the husbandry team · ${dayName(H.day)}, ${pt(H.end)} PT`, '',
      '> Mostly steady. Two exhibits need a look before the weekend; the third is already improving.', '', '## Flags', '',
      ...W.HERO.flags.map((f) => `**${cap(f.exhibit)} · ${f.state}.** ${f.text}\n`), '## Actions', '',
      ...W.HERO.actions.map((a, i) => `${i + 1}. **${cap(a.owner)}:** ${a.text}`), '', '## Steady', '',
      `${W.HERO.steady.map(cap).join(', ')}: no change this week.`, '', `Quarantine bay: ${W.HERO.quarantine}`, '', '## Readings, Friday morning', '',
      '| Exhibit | °C | ppt | nitrate ppm | Note |', '|---|---|---|---|---|',
      ...W.HERO.readings.map(([e, tt, sal, n, note]) => `| ${cap(e)} | ${tt.toFixed(1)} | ${sal.toFixed(1)} | ${n} | ${note} |`), '', '## Gaps', '',
      'Thursday\'s photo set for the jelly gallery arrived late and incomplete. The photo scout failed on it once, re-ran through a delegate, and had one of the two photos it needed.', '',
      '_Synthetic run: an invented aquarium, written to show how OpenProse traces read._'],
  };
  for (const [rel, lines] of Object.entries(out)) {
    put(`bindings/${rel}`, lines.join('\n'));
    put(`workspace/${rel}`, lines.join('\n'));
  }
  put('workspace/photo-scout/__error.md', ['# Error: export-incomplete', '', 'The photo survey binding lists 11 sets; 10 were readable. The jelly gallery set (kreisel 2) was still uploading at 07:34 PT.'].join('\n'));
  put('workspace/photo-scout/__delegate/image-reader/req-001.md', ['# Delegate request req-001', '', 'Read the jelly gallery set (kreisel 2) once it lands and describe what changed since last week. Two photos expected.'].join('\n'));
  put('workspace/photo-scout/__delegate/image-reader/req-001-response.md', ['# req-001', '', '- kreisel 2, photo 1: bell margins ragged on two moon jellies', '- kreisel 2, photo 2: not in the set'].join('\n'));
  // timing: OpenProse's file log has no per-step times; this sidecar follows
  // the columns of its SQLite backend (see data/schema.md).
  const tline = (idx, text, s0, s1, extra = {}) => ({ statement_index: idx, statement_text: text, status: extra.status || 'completed',
    started_at: iso(H.start + s0 * 1000), completed_at: iso(H.start + s1 * 1000), parent_id: extra.parent ?? null, metadata: extra.meta || null });
  put('timing.json', JSON.stringify({
    run: { status: 'completed', started_at: iso(H.start), completed_at: iso(H.end) },
    execution: [
      tline(1, '[input] week_of', 0, HC.week_of), tline(2, '[input] keeper_notes', 0, HC.keeper_notes),
      tline(3, '[input] tank_roster', 0, HC.tank_roster), tline(4, '[input] photo_survey', 0, HC.photo_survey),
      tline(5, 'roster-profiler', HC.photo_survey, HC['roster-profiler']),
      tline(6, 'behavior-scout', HC['roster-profiler'], HC['behavior-scout'], { meta: { parallel: 'a' } }),
      tline(6, 'feeding-scout', HC['roster-profiler'], HC['feeding-scout'], { meta: { parallel: 'b' } }),
      tline(6, 'photo-scout', HC['roster-profiler'], HC['photo-scout#1'], { status: 'failed', meta: { parallel: 'c', error: W.HERO.error } }),
      tline(6, 'water-scout', HC['roster-profiler'], HC['water-scout'], { meta: { parallel: 'd' } }),
      tline(7, 'image-reader (delegate req-001)', HC['photo-scout#1'], HC['image-reader'], { parent: 'photo-scout' }),
      tline(8, 'photo-scout', HC['image-reader'], HC['photo-scout#2'], { meta: { resumed: true } }),
      tline(9, 'husbandry-compiler', HC['photo-scout#2'], HC['husbandry-compiler']),
    ],
  }, null, 2));

  const ebase = `runs/${heroEval.id}`;
  const eput = (rel, text) => { files[`${ebase}/${rel}`] = text.endsWith('\n') ? text : `${text}\n`; };
  eput('vm.log.md', [`# run:${heroEval.id} inspector`, `upstream: [${H.id}]`, 'root: std/evals/inspector', '',
    '1→ [input] subject ✓', ...heroEval.steps.filter((s) => s.kind === 'eval').map((s) => `${s.phase}→ [eval] ${s.name} ${s.status === 'ok' ? '✓' : '✗'}`),
    `---test FAIL (${heroEval.evalPass}/${heroEval.evalTotal} assertions)`, `---end ${iso(heroEval.end)}`].join('\n'));
  eput('bindings/caller/subject.md', ['# subject', '', 'binding: input', 'source: caller', 'type: run', '', '---', '', `run: ${H.id}`, `path: runs/${H.id}`, 'status: completed'].join('\n'));
  eput('bindings/inspector/inspection.md', ['# Inspection', '', `Subject: run ${H.id} (livestock-health-memo)`, '', `Result: ${heroEval.evalPass} of ${heroEval.evalTotal} checks`, '',
    ...checkRows.map((r) => `- ${r.state === 'pass' ? '✓' : '✗'} \`${r.id}\`: ${r.detail}`)].join('\n'));
}

// ================================================================== write
const header = (page) => `// Synthetic data for viz/${page}.html, generated by data/synthetic/generate.mjs
// from world.mjs (seed ${W.SEED}). An invented aquarium and an invented fleet:
// no real organization, person or run. Regenerate rather than edit.
`;
const outputs = {};
for (const [page, data] of Object.entries(slots)) outputs[path.join(DATA, `${page}.js`)] = `${header(page)}window.TRACE_DATA = ${JSON.stringify(data, null, 1)};\n`;
// The kit's index links into the hero's record; ids and paths come from here.
const KIT = {
  hero: H.id, heroEval: heroEval.id,
  files: {
    log: `runs/${H.id}/vm.log.md`,
    memo: `runs/${H.id}/bindings/${P['livestock-memo'].compiler}/${P['livestock-memo'].output}`,
    manifest: `runs/${H.id}/forme.manifest.json`,
    inspection: `runs/${heroEval.id}/bindings/inspector/inspection.md`,
  },
};
outputs[path.join(DATA, 'kit.js')] = `// Ids and paths for index.html, generated by data/synthetic/generate.mjs.\nwindow.KIT = ${JSON.stringify(KIT, null, 1)};\n`;
for (const [rel, text] of Object.entries(files)) outputs[path.join(HERE, rel)] = text;

let stale = 0;
for (const [file, text] of Object.entries(outputs)) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (cur === text) continue;
  stale++;
  if (!CHECK) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
}
// Anything under runs/ this world no longer produces: an earlier run, or a
// file renamed since.
if (fs.existsSync(RUNS_DIR)) {
  const want = new Set(Object.keys(outputs));
  const sweep = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { sweep(f); if (!CHECK && !fs.readdirSync(f).length) fs.rmdirSync(f); }
      else if (!want.has(f)) { stale++; if (!CHECK) fs.rmSync(f); }
    }
  };
  sweep(RUNS_DIR);
}
console.log(`synthetic traces: ${Object.keys(slots).length} slots, ${Object.keys(files).length} run files · ${runs.length + evalRuns.length} runs (${weekRuns.length} in week ${W.WEEK.number}) · hero ${H.id}`);
if (CHECK) { console.log(stale ? `✗ ${stale} file(s) stale; run without --check` : '✓ up to date'); process.exitCode = stale ? 1 : 0; }
else console.log(stale ? `wrote ${stale} file(s)` : 'nothing changed');
