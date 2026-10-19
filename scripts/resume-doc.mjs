// Round-trips Assets/resume.json through an editable Markdown document, so the résumé can be
// co-edited in Google Docs and the edits come back into the one source of truth.
//
//   node scripts/resume-doc.mjs export
//       → .local/out/JohnHanacek-resume-edit.md  (Google Docs opens .md directly: upload it to
//         Drive and open it with Google Docs)
//
//   node scripts/resume-doc.mjs import <edited.md>
//       → .local/out/resume.imported.json + .local/out/resume-import-report.md
//         Nothing in Assets/ is touched. Add --write to replace Assets/resume.json; it refuses
//         while that file has uncommitted changes, so `git diff` shows the import and only it.
//
// In Google Docs: accept or reject every suggestion, then File → Download → Markdown (.md).
//
// One list per role (2026-10-07). The résumé used to keep a long CV beside the one-page, with
// `lead` flags choosing three bullets out of up to ten. John's ruling: a clean short résumé is
// the whole résumé. So each role is a heading, a date line, an optional one-line summary and
// its bullets, in the order the page shows them.
//
// What makes the round trip safe:
//   - Every entry heading ends in an [id] that ties it to its record. Sections are found by
//     title. A heading that names no known section is warned and its content set aside, never
//     poured into the section above it (a "## Leadership" heading once nearly was).
//   - The document carries only the words. Evidence links and urls stay in the JSON and are
//     re-attached by matching each edited bullet to the one it came from.
//   - Exporting and importing with no edits reproduces resume.json byte for byte, from the
//     plain file and from Google-mangled variants (Agent Reference/maze-tests/resumedoctest.mjs).
//
// The importer never compiles or publishes. After an import, build-resume.mjs lints the
// prose and renders the PDFs; --apply stays a separate, deliberate step.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.local/out');
const SRC = resolve(ROOT, 'Assets/resume.json');
const DEFAULT_LANE = 'designEngineer';

// ---------------------------------------------------------------- the document's grammar
export const SECTIONS = {
  headline: 'Headline',
  summary: 'Summary',
  experience: 'Experience',
  service: 'Leadership',
  earlierLine: 'Earlier',
  education: 'Education',
  skills: 'Skills',
  awards: 'Awards',
  talks: 'Talks & writing',
  variants: 'Summary variants',
  cut: 'Cut list',
};
// Older documents and natural renamings. `cut` content is never imported.
const ALIASES = {
  'advisory & service': 'service', 'leadership & service': 'service', 'earlier (one-page line)': 'earlierLine',
  'talks & writing (one-page)': 'talks', 'earlier roles': 'cut', 'cut list (not imported)': 'cut',
  'recovered (not imported)': 'cut',
};
const ENTITY = new Set(['experience', 'service', 'education', 'skills', 'variants']);
const FIELDS = ['Practice', 'Tools', 'Role summary', 'Thesis', 'Thesis subtitle', 'Thesis note', 'One-page thesis line', 'Headline'];
const OLD_LABELS = new Set(['On the one-page', 'Long CV only']);

const HINTS = [
  'How to edit this document',
  'Edit any text. Keep the [bracketed ids] at the end of headings. They tie each entry back to the source.',
  'Each role is a heading, a date line, an optional role summary and its bullets. The bullets are the résumé, in the order shown.',
  'To add a role or a Leadership entry, copy a heading, its date line and a bullet. Give it a new id like [global-colab], or leave the id off.',
  'House rules: one idea per sentence, 25 words at most. No em dashes. Say what was done. Name the people, products and places. Skip words like deeply, seamlessly and passionate.',
  'Before downloading, accept or reject every suggestion. Then File, Download, Markdown (.md).',
];

// ---------------------------------------------------------------- export: JSON → blocks
// A one-year role (a tour, a challenge) is a single year. An ongoing one says "–Present".
const span = (s, e) => (s === e ? s : `${s}–${e ?? 'Present'}`);
const meta = (o) => (o.start ? `${span(o.start, o.end)}${o.location ? ` · ${o.location}` : ''}` : null);
const head = (w) => (w.org ? `${w.title} · ${w.org}` : w.title);

function roleBlocks(w) {
  const b = [{ t: 'h3', x: `${head(w)} [${w.id}]` }];
  const m = meta(w); if (m) b.push({ t: 'p', x: m });
  if (w.summary) b.push({ t: 'p', x: `Role summary: ${w.summary}` });
  for (const h of w.highlights) b.push({ t: 'li', x: h.text });
  return b;
}

export function toBlocks(R) {
  const B = [{ t: 'h1', x: `${R.basics.name} · résumé edit copy` }, ...HINTS.map(x => ({ t: 'hint', x }))];
  B.push({ t: 'h2', x: SECTIONS.headline }, { t: 'p', x: R.basics.headline });
  B.push({ t: 'h2', x: SECTIONS.summary }, { t: 'p', x: R.lanes[DEFAULT_LANE].summary });
  B.push({ t: 'h2', x: SECTIONS.experience });
  for (const w of R.work.filter(w => !w.compressed)) B.push(...roleBlocks(w));
  B.push({ t: 'h2', x: SECTIONS.service });
  if (!(R.service || []).length) B.push({ t: 'hint', x: 'Board seats, advising, mentoring and volunteer work, in the same shape as Experience.' });
  for (const s of R.service || []) B.push(...roleBlocks(s));
  B.push({ t: 'h2', x: SECTIONS.earlierLine }, { t: 'p', x: R.onePage.earlier });
  B.push({ t: 'h2', x: SECTIONS.education });
  R.education.forEach((e, i) => {
    B.push({ t: 'h3', x: `${e.degree} · ${e.school} [edu-${i + 1}]` }, { t: 'p', x: meta(e) });
    const th = e.thesis || {};
    if (th.title) B.push({ t: 'p', x: `Thesis: ${th.title}` });
    if (th.subtitle) B.push({ t: 'p', x: `Thesis subtitle: ${th.subtitle}` });
    if (th.note) B.push({ t: 'p', x: `Thesis note: ${th.note}` });
    B.push({ t: 'p', x: `One-page thesis line: ${th.line || ''}` });
  });
  B.push({ t: 'h2', x: SECTIONS.skills });
  R.skills.lines.forEach((l, i) => {
    B.push({ t: 'h3', x: `${l.label} [skill-${i + 1}]` });
    if (l.practice) B.push({ t: 'p', x: `Practice: ${l.practice}` });
    B.push({ t: 'p', x: `Tools: ${l.tools.join(' · ')}` });
  });
  B.push({ t: 'h2', x: SECTIONS.awards });
  for (const a of R.awards) B.push({ t: 'li', x: `${a.year}: ${a.short || a.title}` });
  B.push({ t: 'h2', x: SECTIONS.talks });
  for (const t of R.onePage.talks) B.push({ t: 'li', x: t });
  B.push({ t: 'h2', x: SECTIONS.variants });
  for (const k of Object.keys(R.lanes).filter(k => !k.startsWith('$') && k !== DEFAULT_LANE)) {
    const l = R.lanes[k];
    B.push({ t: 'h3', x: `${l.label} [${k}]` });
    if (l.headline) B.push({ t: 'p', x: `Headline: ${l.headline}` });
    B.push({ t: 'p', x: l.summary });
  }
  return B;
}

export function toMarkdown(B) {
  const L = [];
  for (const b of B) {
    if (b.t === 'h1') L.push(`# ${b.x}`, '');
    else if (b.t === 'h2') L.push('', `## ${b.x}`, '');
    else if (b.t === 'h3') L.push('', `### ${b.x}`, '');
    else if (b.t === 'hint') L.push(`_✎ ${b.x}_`, '');
    else if (b.t === 'li') L.push(`- ${b.x}`);
    else L.push(b.x, '');
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------------------------------------------------------------- import: text → lines
// Normalises what Google Docs' Markdown download does to a document: backslash escapes,
// `*` bullets, bold headings and labels, `_italic_`, non-breaking spaces, trailing
// two-space line breaks. A heading keeps its level when it has one (0 when a conversion
// flattened it to a bold or plain line).
export function parseMarkdown(md) {
  const out = [];
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    let s = raw.replace(/ /g, ' ').trim();
    if (!s) continue;
    s = s.replace(/\\([!-/:-@[-`{-~])/g, '$1');                  // \# \* \[ \. …
    let level = 0, heading = false, item = false;
    const h = s.match(/^(#{1,6})\s+(.*)$/); if (h) { heading = true; level = h[1].length; s = h[2]; }
    const li = s.match(/^(?:[•◦▪]\s*|[-*+]\s+|\d+[.)]\s+)(.*)$/); if (!heading && li) { item = true; s = li[1]; }
    s = s.replace(/^(\*\*|__)(.*)\1$/, '$2');                     // a wholly bold line
    s = s.replace(/^[*_](✎.*)[*_]$/, '$1');                       // an italic hint
    s = s.replace(/\*\*|__/g, '');                                 // stray bold
    s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1*$2*'); // _italic_ → *italic*
    s = s.replace(/\s+/g, ' ').trim();
    if (!s || s.startsWith('✎')) continue;
    out.push({ s, heading, level, item });
  }
  return out;
}

// ---------------------------------------------------------------- matching bullets to their records
const STOP = new Set('a an and the of to for with in on as at by its it is was were from into their our my that this'.split(' '));
const toks = s => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(w => w.replace(/(?:ing|ed|s)$/, '')));
const dice = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return (2 * n) / (A.size + B.size); };

// Pairs new lines with old ones: exact text, then the closest wording (≥0.4), then a rewrite
// in the same position (≥0.15). What is left is added or removed.
function match(old, doc) {
  const pairs = new Map(), used = new Set(), how = new Map();
  doc.forEach((d, i) => { const j = old.findIndex((o, k) => !used.has(k) && o === d); if (j >= 0) { pairs.set(i, j); used.add(j); how.set(i, 'same'); } });
  const cand = [];
  doc.forEach((d, i) => { if (pairs.has(i)) return; old.forEach((o, j) => { if (!used.has(j)) { const sc = dice(d, o); if (sc >= 0.4) cand.push([sc, i, j]); } }); });
  cand.sort((a, b) => b[0] - a[0]);
  for (const [, i, j] of cand) if (!pairs.has(i) && !used.has(j)) { pairs.set(i, j); used.add(j); how.set(i, 'edited'); }
  const D = doc.map((_, i) => i).filter(i => !pairs.has(i)), O = old.map((_, j) => j).filter(j => !used.has(j));
  for (let k = 0; k < Math.min(D.length, O.length); k++) {
    if (dice(doc[D[k]], old[O[k]]) >= 0.15) { pairs.set(D[k], O[k]); used.add(O[k]); how.set(D[k], 'rewritten'); }
  }
  return { pairs, used, how };
}

// ---------------------------------------------------------------- import: lines → the document's entries
const ID = /\s*\[([A-Za-z0-9:_-]+)\]\s*$/;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'entry';
const sectionOf = s => { const k = s.toLowerCase().replace(/:$/, '').trim(); return ALIASES[k] || Object.keys(SECTIONS).find(key => SECTIONS[key].toLowerCase() === k); };
const DATES = /^(\d{4})\s*(?:[–—-]\s*(\d{4}|present))?\b/i;

function parseMeta(s) {
  const [dates, ...loc] = s.split(' · ');
  const [start, end] = dates.split(/\s*[–—-]\s*/);
  // a lone year is that year; only "–Present" (or a dash with nothing after it) is ongoing
  if (end === undefined) return { start: start.trim(), end: start.trim(), location: loc.join(' · ').trim() };
  return { start: start.trim(), end: !end.trim() || /^present$/i.test(end.trim()) ? null : end.trim(), location: loc.join(' · ').trim() };
}

export function readDoc(md) {
  const D = { headline: [], summary: [], earlierLine: [], talks: [], awards: [], experience: [], service: [], education: [], skills: [], variants: [] };
  const warn = [];
  let sec = null, ent = null;
  const lines = parseMarkdown(md);
  // When the document still has section-level headings (Google's download keeps "## …"),
  // only a real heading may switch sections: a bold "Awards" label inside the Cut list must
  // not become the Awards section. A fully flattened document falls back to titles alone.
  const strict = lines.some(l => l.level === 2);
  for (const { s, heading, level, item } of lines) {
    const key = sectionOf(s);
    if (key && !ID.test(s) && (!strict || (heading && level <= 2))) { sec = key; ent = null; continue; }
    // … or an unknown one at section level, which must not be poured into the section above
    if (heading && level <= 2 && !ID.test(s)) {
      if (sec !== null) { warn.push(`unknown section "${s}": its content is set aside until the next known section`); sec = 'unknown'; }
      ent = null; continue;
    }
    if (!sec || sec === 'unknown' || sec === 'cut') continue;
    if (ENTITY.has(sec) && (ID.test(s) || heading)) {
      const m = s.match(ID);
      ent = { id: m ? m[1] : null, head: s.replace(ID, '').trim(), meta: null, fields: {}, lines: [] };
      D[sec].push(ent); continue;
    }
    if (ENTITY.has(sec) && !ent) { warn.push(`ignored (no entry heading above it) in ${SECTIONS[sec]}: "${s.slice(0, 60)}"`); continue; }
    if (ent) {
      if (OLD_LABELS.has(s.replace(/:$/, ''))) continue;
      const f = s.match(/^([A-Za-z -]{4,24}):\s*(.*)$/);
      if (f && FIELDS.includes(f[1])) { ent.fields[f[1]] = f[2].trim(); continue; }
      if (ent.meta === null && !ent.lines.length && !item && DATES.test(s)) { ent.meta = s; continue; }
      ent.lines.push(s);
      continue;
    }
    D[sec].push(s);                                                // headline, summary, earlier line, talks, awards
  }
  return { D, warn };
}

// ---------------------------------------------------------------- import: entries → JSON
export function applyDoc(R0, md, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const R = structuredClone(R0);
  const { D, warn } = readDoc(md);
  const report = [];
  const note = (where, kind, detail) => report.push({ where, kind, detail });
  const set = (obj, key, val, where) => { if (obj[key] !== val) { note(where, 'changed', `${JSON.stringify(obj[key] ?? null)} → ${JSON.stringify(val)}`); obj[key] = val; } };
  const drop = (obj, key, where, what) => { if (obj[key] !== undefined) { note(where, 'changed', `${what} removed`); delete obj[key]; } };

  if (D.headline.length) set(R.basics, 'headline', D.headline.join(' '), 'Headline');
  if (D.summary.length) set(R.lanes[DEFAULT_LANE], 'summary', D.summary.join(' '), 'Summary');
  if (D.earlierLine.length) set(R.onePage, 'earlier', D.earlierLine.join(' '), 'Earlier');
  if (JSON.stringify(D.talks) !== JSON.stringify(R.onePage.talks)) { note('Talks & writing', 'changed', `${R.onePage.talks.length} → ${D.talks.length} items`); R.onePage.talks = D.talks; }

  // roles (Experience) and entries (Leadership): same shape
  const taken = new Set();
  const build = (ents, pool, label) => ents.map(e => {
    let id = e.id;
    if (id && taken.has(id)) throw new Error(`[${id}] appears twice in the document`);
    let w = id ? pool.find(x => x.id === id) : null;
    const [title, ...orgParts] = e.head.split(' · ');
    const org = orgParts.join(' · ').trim();
    if (!w) {
      if (!id) { id = slug(org || title); while (taken.has(id) || R0.work.some(x => x.id === id) || (R0.service || []).some(x => x.id === id)) id += '-2'; }
      w = { id, org, title: title.trim(), highlights: [] };
      note(`${label} [${id}]`, 'added', e.head);
    } else w = structuredClone(w);
    taken.add(id);
    const where = `${label} [${id}]`;
    set(w, 'title', title.trim(), where); set(w, 'org', org, where);
    if (e.meta) {
      const m = parseMeta(e.meta);
      set(w, 'start', m.start, where); set(w, 'end', m.end, where);
      if (m.location) set(w, 'location', m.location, where); else drop(w, 'location', where, 'location');
    } else if (w.start) warn.push(`${where}: no date line in the document; kept ${span(w.start, w.end)}`);
    if (e.fields['Role summary']) set(w, 'summary', e.fields['Role summary'], where); else drop(w, 'summary', where, 'role summary');

    const old = w.highlights;
    const { pairs, used, how } = match(old.map(h => h.text), e.lines);
    w.highlights = e.lines.map((text, i) => {
      if (!pairs.has(i)) { note(where, 'added (needs evidence)', `"${text}"`); return { text, evidence: [`doc:${date}`] }; }
      const h = structuredClone(old[pairs.get(i)]);
      if (h.text !== text) note(where, how.get(i) === 'rewritten' ? 'rewritten (check the evidence still covers it)' : 'edited', `"${h.text}" → "${text}"`);
      h.text = text;
      return h;
    });
    old.forEach((h, j) => { if (!used.has(j)) note(where, 'removed', `"${h.text}"`); });
    return w;
  });
  const roles = build(D.experience, R0.work.filter(w => !w.compressed), 'Experience');
  for (const w of R0.work) if (!w.compressed && !roles.some(x => x.id === w.id)) note(`Experience [${w.id}]`, 'REMOVED ROLE', head(w));
  R.work = [...roles, ...R0.work.filter(w => w.compressed)];       // the compressed early roles are not in the document
  const service = build(D.service, R0.service || [], 'Leadership');
  for (const s of R0.service || []) if (!service.some(x => x.id === s.id)) note(`Leadership [${s.id}]`, 'REMOVED', head(s));
  if (service.length || R0.service) {
    if (!('service' in R)) {                                       // place it after work, in page order
      const o = {}; for (const k of Object.keys(R)) { o[k] = R[k]; if (k === 'work') o.service = service; }
      Object.keys(R).forEach(k => delete R[k]); Object.assign(R, o);
    } else R.service = service;
  }

  // education
  for (const e of D.education) {
    const ed = R.education[Number((e.id || '').replace('edu-', '')) - 1];
    if (!ed) { warn.push(`education entry "${e.head}" has no matching [edu-N]; not imported`); continue; }
    const where = `Education [${e.id}]`;
    const [degree, ...school] = e.head.split(' · ');
    set(ed, 'degree', degree.trim(), where); set(ed, 'school', school.join(' · ').trim(), where);
    if (e.meta) { const m = parseMeta(e.meta); set(ed, 'start', m.start, where); set(ed, 'end', m.end ?? 'Present', where); if (m.location) set(ed, 'location', m.location, where); }
    // every thesis field that exists is exported, so a missing or emptied line means removed
    for (const [label, key] of [['Thesis', 'title'], ['Thesis subtitle', 'subtitle'], ['Thesis note', 'note'], ['One-page thesis line', 'line']]) {
      const v = e.fields[label];
      if (v) { ed.thesis ||= {}; set(ed.thesis, key, v, where); }
      else if (ed.thesis) drop(ed.thesis, key, where, `thesis ${key}`);
    }
  }

  // skills lines are words only, so the section replaces them wholesale
  const lines = D.skills.map(e => {
    const l = { label: e.head };
    if (e.fields.Practice) l.practice = e.fields.Practice;
    l.tools = (e.fields.Tools || '').split(' · ').map(t => t.trim()).filter(Boolean);
    return l;
  });
  if (JSON.stringify(lines) !== JSON.stringify(R.skills.lines)) { note('Skills', 'changed', lines.map(l => l.label).join(', ')); R.skills.lines = lines; }

  // awards: the document edits the one-page line; title, org and evidence ride along
  {
    const line = a => `${a.year}: ${a.short || a.title}`;
    const { pairs, used } = match(R0.awards.map(line), D.awards);
    R.awards = D.awards.map((text, i) => {
      const m = text.match(/^(\d{4})\s*[:·–-]\s*(.*)$/);
      const year = m ? m[1] : '', words = m ? m[2] : text;
      if (!pairs.has(i)) { note('Awards', 'added (needs evidence)', `"${text}"`); return { year, title: words, short: words, evidence: [`doc:${date}`] }; }
      const a = structuredClone(R0.awards[pairs.get(i)]);
      if (year && a.year !== year) set(a, 'year', year, `Awards (${a.title})`);
      if ((a.short || a.title) !== words) set(a, 'short', words, `Awards (${a.title})`);
      return a;
    });
    R0.awards.forEach((a, j) => { if (!used.has(j)) note('Awards', 'removed', `"${line(a)}"`); });
  }

  // summary variants
  for (const e of D.variants) {
    const l = R.lanes[e.id];
    if (!l) { warn.push(`summary variant [${e.id}] is not a lane in resume.json; not imported`); continue; }
    const where = `Summary variants [${e.id}]`;
    set(l, 'label', e.head, where);
    if (e.lines.length) set(l, 'summary', e.lines.join(' '), where);
    if (e.fields.Headline) set(l, 'headline', e.fields.Headline, where);
  }
  return { R, report, warn };
}

function reportMd(report, warn, file) {
  const L = ['# Résumé import report', '', `From: ${file}`, '', `${report.length} change(s), ${warn.length} warning(s).`, ''];
  if (warn.length) L.push('## Warnings', '', ...warn.map(w => `- ${w}`), '');
  const by = {};
  for (const r of report) (by[r.where] ||= []).push(r);
  for (const [where, rs] of Object.entries(by)) { L.push(`## ${where}`, ''); for (const r of rs) L.push(`- **${r.kind}**: ${r.detail}`); L.push(''); }
  if (!report.length) L.push('No changes. The document matches resume.json.');
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, file] = process.argv.slice(2);
  const args = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  const R = JSON.parse(readFileSync(SRC, 'utf8'));
  if (cmd === 'export') {
    const md = toMarkdown(toBlocks(R));
    const path = `${OUT}/JohnHanacek-resume-edit.md`;
    writeFileSync(path, md);
    // the export must import as nothing at all, or it is not safe to hand to anyone
    const back = applyDoc(R, md);
    if (back.report.length || JSON.stringify(back.R) !== JSON.stringify(R)) {
      console.error('export does not round-trip:', back.report.slice(0, 5)); process.exit(1);
    }
    console.log(`wrote ${path.replace(ROOT + '/', '')}\nround trip: clean (re-importing it changes nothing)`);
  } else if (cmd === 'import' && file) {
    const { R: next, report, warn } = applyDoc(R, readFileSync(resolve(file), 'utf8'));
    writeFileSync(`${OUT}/resume.imported.json`, JSON.stringify(next, null, 2) + '\n');
    writeFileSync(`${OUT}/resume-import-report.md`, reportMd(report, warn, file));
    console.log(`${report.length} change(s), ${warn.length} warning(s). Report: .local/out/resume-import-report.md`);
    for (const w of warn) console.warn(`  warn  ${w}`);
    if (args.includes('--write')) {
      try { execFileSync('git', ['diff', '--quiet', '--', 'Assets/resume.json'], { cwd: ROOT }); }
      catch { console.error('refusing --write: Assets/resume.json has uncommitted changes. Commit them first so the import is its own diff.'); process.exit(1); }
      writeFileSync(SRC, JSON.stringify(next, null, 2) + '\n');
      console.log('wrote Assets/resume.json. Review with `git diff Assets/resume.json`, then `node scripts/build-resume.mjs`.');
    } else console.log('Assets/resume.json untouched. Proposed: .local/out/resume.imported.json (add --write to replace it).');
  } else {
    console.log('usage: node scripts/resume-doc.mjs export\n       node scripts/resume-doc.mjs import <edited.md> [--write]');
    process.exit(cmd ? 1 : 0);
  }
}
