// Does the résumé survive a trip through a Google Doc?
//
// scripts/resume-doc.mjs exports Assets/resume.json as an editable Markdown document (one
// list of bullets per role) and imports the edited document back. The document carries only
// words; evidence and urls stay in the JSON and are re-attached by matching. This suite proves:
//   1. no edits → resume.json byte for byte, from the plain export AND from the same text
//      as Google Docs' Markdown download can mangle it (escapes, bold-wrapped headings,
//      * and • bullets, headings flattened to bold or plain lines, stray whitespace)
//   2. real edits land where they should, keep their evidence, and are all reported
//   3. a heading nobody knows is warned and set aside, never poured into the section
//      above it (John's first "## Leadership" section nearly became part of the Earlier line)
//   4. the CLI writes exactly the Markdown that was round-tripped
//
//   node "Agent Reference/maze-tests/resumedoctest.mjs"     → exits non-zero on any failure
// Every scenario is derived from whatever resume.json says today, so the suite keeps working
// while the content itself is being rewritten. Nothing in Assets/ is written.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { toBlocks, toMarkdown, applyDoc } from '../../scripts/resume-doc.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = readFileSync(resolve(ROOT, 'Assets/resume.json'), 'utf8');
const R = JSON.parse(RAW);
const MD = toMarkdown(toBlocks(R));
const str = r => JSON.stringify(r, null, 2) + '\n';
let failed = 0, n = 0;
const ok = (cond, label, extra = '') => { n++; if (!cond) failed++; console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && extra ? `\n      ${extra}` : ''}`); };

// ---------------------------------------------------------------- 1. no-op round trips
// What Google Docs' download actually produced on 2026-10-07: headings wrapped in bold,
// brackets and & and . escaped, trailing two-space breaks.
const google = md => md.split('\n').map((line, i) => {
  const esc = t => t.replace(/([[\]&#])/g, '\\$1').replace(/(\d)\.(\s|$)/g, '$1\\.$2');
  let m;
  if ((m = line.match(/^(#{1,3}) (.*)$/))) return `${m[1]} **${esc(m[2])}**`;
  if ((m = line.match(/^- (.*)$/))) return `${i % 2 ? '* ' : '- '}${esc(m[1])}  `;
  if ((m = line.match(/^_(✎.*)_$/))) return `*${esc(m[1])}*`;
  return line ? esc(line) + (i % 3 ? '' : '  ') : line;
}).join('\n');
const flattened = md => md.replace(/^#{2,3} (.*)$/gm, '**$1**').replace(/^- /gm, '• ');
const plain = md => md.replace(/^#{1,6} /gm, '').replace(/\*\*/g, '').replace(/^- /gm, '');

console.log('round trips with no edits');
for (const [label, md] of [
  ['plain Markdown export', MD],
  ['as Google Docs downloads it (bold headings, escapes, two-space breaks)', google(MD)],
  ['headings flattened to bold lines, • bullets', flattened(MD)],
  ['every heading and list style lost (plain lines)', plain(MD)],
]) {
  const { R: back, report } = applyDoc(R, md);
  ok(str(back) === RAW && report.length === 0, `${label} → resume.json byte for byte`, report.slice(0, 3).map(r => `${r.where}: ${r.kind} ${r.detail}`).join(' | '));
}

// ---------------------------------------------------------------- 2. edits
console.log('\nedits land where they should');
const roles = R.work.filter(w => !w.compressed);
const big = roles.find(w => w.highlights.length >= 3);                 // edit, reorder
const two = roles.find(w => w !== big && w.highlights.length >= 2);   // delete one
const any = roles.find(w => w !== big && w !== two);                   // add one
const located = roles.find(w => w.location);
const [b0, b1] = big.highlights;
const gone = two.highlights.at(-1);
const edited0 = b0.text.replace(/^(\S+)/, '$1 all');
const thesisLine = MD.match(/^One-page thesis line: ?(.*)$/m)[0];
const firstTalk = R.onePage.talks[0];
const metaOf = w => `${w.start}–${w.end ?? 'Present'}${w.location ? ` · ${w.location}` : ''}`;
let md = MD
  .replace(`- ${b0.text}\n- ${b1.text}`, `- ${b1.text}\n- ${edited0}`)                     // an edit and a swap
  .replace(`- ${gone.text}`, '')                                                           // a deletion
  .replace(`- ${any.highlights.at(-1).text}`, `- ${any.highlights.at(-1).text}\n- Ran weekly design reviews with the engineering leads.`) // an addition
  .replace(`\n${metaOf(located)}\n`, `\n${located.start}–${located.end ?? 'Present'}\n`)    // a location removed
  .replace(/^## Leadership\n/m, `## Leadership\n\n### Mentor · XR Design Challenge [xrdc-mentor]\n\n- Mentored teams through the spatial design challenge.\n`)
  .replace(thesisLine, 'One-page thesis line: An AI-interpreted drawing interface.')
  .replace(`- ${firstTalk}\n`, `- ${firstTalk}\n- XRDesignChallenge mentor talk\n`);
const lastSkill = R.skills.lines.length;
const lastBlock = md.match(new RegExp(`### [^\\n]*\\[skill-${lastSkill}\\]\\n[\\s\\S]*?(?=\\n## |\\n### )`))[0];
md = md.replace(lastBlock + '\n', '').replace(/(### [^\n]*\[skill-1\])/, `${lastBlock}\n\n$1`);
const wantSkills = [R.skills.lines.at(-1), ...R.skills.lines.slice(0, -1)].map(l => l.label).join(',');

const { R: E, report, warn } = applyDoc(R, md, { date: '2026-10-07' });
const bigE = E.work.find(w => w.id === big.id);
ok(bigE.highlights[0].text === b1.text && bigE.highlights[1].text === edited0, 'bullets take the document order');
ok(JSON.stringify(bigE.highlights[1].evidence) === JSON.stringify(b0.evidence) && JSON.stringify(bigE.highlights[0].evidence) === JSON.stringify(b1.evidence), 'an edited and a moved bullet both keep their evidence');
ok(report.some(r => r.kind === 'edited' && r.detail.includes(edited0.slice(0, 30))), 'the edit is reported as edited');
ok(!E.work.find(w => w.id === two.id).highlights.some(h => h.text === gone.text) && report.some(r => r.kind === 'removed' && r.detail.includes(gone.text.slice(0, 30))), 'a deleted bullet is removed and reported');
const added = E.work.find(w => w.id === any.id).highlights.at(-1);
ok(added.text.startsWith('Ran weekly design reviews') && added.evidence[0] === 'doc:2026-10-07', 'a new bullet arrives flagged for evidence');
ok(E.work.find(w => w.id === located.id).location === undefined, 'a removed location is removed');
const svc = E.service?.find(s => s.id === 'xrdc-mentor');
ok(svc && svc.title === 'Mentor' && svc.org === 'XR Design Challenge' && !('start' in svc) && !('end' in svc), 'a Leadership entry with no date line gets no dates (never "–Present")');
const once = applyDoc(R, md.replace(/^## Leadership\n/m, `## Leadership\n\n### Merchandise Manager · A Band [tour]\n\n2016\n\n- Sold merch on the tour.\n`), { date: '2026-10-08' }).R.service.find(s => s.id === 'tour');
ok(once.start === '2016' && once.end === '2016' && toMarkdown(toBlocks({ ...R, service: [once] })).includes('\n2016\n'), 'a lone year is that one year, and exports as one year (never "2016–Present")');
ok(E.education[0].thesis.line ==='An AI-interpreted drawing interface.', 'the one-page thesis line takes the edit');
ok(E.skills.lines.map(l => l.label).join(',') === wantSkills, 'skills lines take the document order');
ok(E.onePage.talks.includes('XRDesignChallenge mentor talk') && E.onePage.talks.length === R.onePage.talks.length + 1, 'talks gain the new item');
ok(JSON.stringify(E.work.filter(w => w.compressed)) === JSON.stringify(R.work.filter(w => w.compressed)), 'the early roles, which the document does not carry, come through untouched');
ok(E.awards.every((a, i) => JSON.stringify(a) === JSON.stringify(R.awards[i])), 'untouched awards come through untouched');
ok(warn.length === 0, 'a well-formed edit raises no warnings', warn.join(' | '));

// ---------------------------------------------------------------- 3. what must never happen silently
console.log('\nwhat must never happen silently');
const stray = MD.replace(/^## Education\n/m, '## Volunteering\n\n- Coached a youth robotics team.\n\n## Education\n');
const s1 = applyDoc(R, stray);
ok(s1.warn.some(w => w.includes('unknown section "Volunteering"')), 'an unknown section heading is warned');
ok(str(s1.R) === RAW, 'and its content goes nowhere: not into the Earlier line, not into Leadership');
const cut = MD + '\n## Cut list\n\n- Something parked for later.\n';
ok(str(applyDoc(R, cut).R) === RAW, 'a Cut list section is never imported');
const parked = MD + '\n## Cut list\n\n**Awards**\n\n- 2030: Fake award\n\n**Skills**\n\n- Juggling\n\n**Education**\n\n- A degree\n';
const p1 = applyDoc(R, parked);
ok(str(p1.R) === RAW && p1.warn.length === 0, 'bold labels inside a parked section ("Awards", "Skills") never switch sections');
const old = MD.replace(/^(### [^\n]*\[[^\]]+\]\n\n(?:\d{4}[^\n]*\n\n)?(?:Role summary: [^\n]*\n\n)?)/gm, '$1**On the one-page**\n\n');
ok(str(applyDoc(R, old).R) === RAW, 'an older document with "On the one-page" labels still imports cleanly');
let threw = false;
try { applyDoc(R, MD.replace(`[${two.id}]`, `[${big.id}]`)); } catch (e) { threw = /appears twice/.test(e.message); }
ok(threw, 'a duplicated [id] is an error, never a silent merge');
const variant = Object.keys(R.lanes).find(k => !k.startsWith('$') && k !== 'designEngineer');
ok(applyDoc(R, MD.replace(`[${variant}]`, '[not-a-lane]')).warn.some(w => w.includes('not-a-lane')), 'an unknown summary variant is warned and skipped');

// ---------------------------------------------------------------- 4. the file the export writes
console.log('\nthe exported file');
execFileSync('node', ['scripts/resume-doc.mjs', 'export'], { cwd: ROOT });
const file = readFileSync(resolve(ROOT, '.local/out/JohnHanacek-resume-edit.md'), 'utf8');
ok(file === MD, 'the CLI writes exactly the Markdown this suite round-tripped');
ok(!/On the one-page|Long CV only/.test(file) && /^## Leadership$/m.test(file), 'one list per role, and a Leadership section');

console.log(failed ? `\n${failed} of ${n} FAILED` : `\nall ${n} pass`);
process.exit(failed ? 1 : 0);
