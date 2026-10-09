// Where is each fact about John stated, and do the statements agree?
//
//   node scripts/claims-audit.mjs            → .local/out/claims-audit.md (+ a summary on stdout)
//   node scripts/claims-audit.mjs --strict   → exits non-zero if any fact still has more than one variant
//                                              (Archive/ is frozen and not counted; named benign variants
//                                              below are not counted either, each with its reason)
//   node scripts/claims-audit.mjs --fresh    → audit what `build-resume.mjs --apply` WOULD publish: the
//                                              fresh build in .local/out/ stands in for the compiled files
//                                              (résumé md, JSON-LD, PDF, compiled chunks). about.html and
//                                              nanome2.html blocks are not simulated; they refresh on --apply
//
// Facts about John live in many places: the résumé source and everything compiled from it,
// hand-written page copy, search chunks, JSON-LD, the media kit, llms.txt, served-but-unlinked
// markdown, the frozen Archive, and the PDF that is actually being served. They drift. This
// sweeps every one of them for a fixed list of facts, records each variant with its file and
// line (chunk id for search-chunks.json), and groups them so a divergence is one glance.
//
// The `story` value on each fact is what the 2026-10-07 story pass found across LinkedIn, the
// old jhanacek.net site and the 2025 PDF (.local/out/JohnHanacek-career-story.md). It is a
// reference, not a verdict: several facts are still John's call.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.local/out');
const STRICT = process.argv.includes('--strict');
const FRESH = process.argv.includes('--fresh');

// ---------------------------------------------------------------- surfaces, by how they are made
const ls = (dir, re) => existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter(f => re.test(f)).map(f => `${dir}/${f}`) : [];
const SURFACES = [
  { tier: 'source', why: 'edited by hand; compiles into the next tier', files: ['Assets/resume.json'] },
  { tier: 'compiled', why: 'written by build-resume.mjs --apply', files: ['Assets/john-hanacek-resume.md', 'john-hanacek.json', 'Assets/JH_Resume_2026_onepage.pdf'] },
  { tier: 'site', why: 'hand-written pages and data the site renders', files: [
    'index.html', 'about.html', 'services.html', 'art.html', 'design.html', 'nanome2.html', 'openprose.html', 'writing.html',
    'search.html', 'playground.html', '404.html', 'llms.txt', 'README.md',
    'Assets/search-chunks.json', 'Assets/media-kit.json', 'Assets/gallery.json',
    'scripts/search-core.js', 'scripts/inquiry-core.js', 'scripts/jh-chrome.js', 'scripts/playground-items.js'] },
  { tier: 'served-unlinked', why: 'public URL, nothing links it', files: [
    'onagents.html', 'Assets/Nanome2 Redesign Case Study.md', 'Assets/nanome-ai-landing-content.md',
    'Assets/JH-brand-styleguide.html', 'Assets/DemosPlayground/test-llm.html', 'Assets/DemosPlayground/test-vision.html',
    ...ls('writing', /\.md$/), ...ls('openprose', /\.md$/)] },
  { tier: 'archive', why: 'frozen snapshots, still served', files: ls('Archive', /\.(md|html)$/) },
];

// ---------------------------------------------------------------- facts
// Each fact yields variants from a file's text. `near(anchor, target)` reads the target closest
// to each anchor match inside a window, so "AsMA … 2022" and "2022 … Aerospace Medical" both count.
// The window stops at the edges of the anchor's own list item, sentence or record: in
// "NIST 2021 · AsMA 2022" the year nearest one award is otherwise its neighbour's. Prose ends
// a segment at a line break; pretty-printed JSON does not (a record's "year" and "title" sit on
// different lines), so there a segment is the enclosing object or array element.
// ("·" is not an edge: it separates an org from its dates, "Nanome Inc. · 2022–2024".)
const EDGE_TEXT = /\n|;|•|<\/?(?:li|p|td)\b|\.\s+(?=[A-Z"“])/g;
const EDGE_JSON = /[{}[\]]|·|"\s*,\s*"(?![^"\n]*"\s*:)/g;
let EDGE = EDGE_TEXT;
const segment = (text, i, j, win) => {
  const base = Math.max(0, i - win);
  let lo = base, hi = Math.min(text.length, j + win);
  for (const e of text.slice(base, i).matchAll(EDGE)) lo = base + e.index + e[0].length;
  const after = text.slice(j, hi).match(EDGE); if (after) hi = j + after.index;
  return [lo, hi];
};
const near = (anchor, target, win = 160, norm = m => m[0]) => text => {
  const out = [];
  for (const a of text.matchAll(anchor)) {
    const [lo, hi] = segment(text, a.index, a.index + a[0].length, win);
    // How people write it: the value sits right before the thing ("2019 Microsoft Reactor")
    // or comes after it ("Microsoft Reactor Hackathon (2019)"). Only then the nearest behind.
    const ts = [...text.slice(lo, hi).matchAll(target)].map(t => ({ m: t, at: lo + t.index, end: lo + t.index + t[0].length }));
    const tight = ts.filter(t => t.end <= a.index && a.index - t.end <= 14).pop();
    const ahead = ts.find(t => t.at >= a.index + a[0].length);
    const behind = ts.filter(t => t.end <= a.index).pop();
    const best = tight || ahead || behind;
    if (best) out.push({ at: a.index, variant: norm(best.m) });
  }
  return out;
};
const every = (re, norm = m => m[0]) => text => [...text.matchAll(re)].map(m => ({ at: m.index, variant: norm(m) }));
const presence = (re) => text => [...text.matchAll(re)].slice(0, 1).map(m => ({ at: m.index, variant: 'mentioned' }));
const YEAR = /\b(20[0-2]\d)\b/g;
// a span in prose ("2022–2024"), or the same span as a JSON record's start/end fields
const SPAN = /\b(20[0-2]\d)\s*(?:[–—-]|&ndash;|to)\s*(20[0-2]\d|[Pp]resent|now)\b|"start":\s*"(20[0-2]\d)",\s*"end":\s*(?:"(20[0-2]\d)"|null)/g;
const span = m => m[1] ? `${m[1]}–${/present|now/i.test(m[2]) ? 'present' : m[2]}` : `${m[3]}–${m[4] || 'present'}`;
const tidy = s => s.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const FACTS = [
  { key: 'years', label: 'Years of experience', story: '14 (since 2012)',
    benign: [{ variant: /^10\+$/, why: 'a different claim: years of coding, or "answer engines 10+ years before ChatGPT"' }],
    find: every(/\b(8|9|10|11|12|13|14|15|16|ten|eleven|twelve|thirteen|fourteen|fifteen)\+?[\s-]+years?\b(?![^.]{0,12}\b(?:from now|ahead|old|later|ago)\b)/gi,
      m => ({ ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15' }[m[1].toLowerCase()] || m[1]) + (/\+/.test(m[0]) ? '+' : '')) },
  { key: 'email', label: 'Email address', story: 'hi@johnhanacek.com (jhanacek.net is retired)',
    find: every(/\b[\w.+-]+@(?:jhanacek\.net|johnhanacek\.com)\b/gi, m => m[0].toLowerCase()) },
  { key: 'remote', label: '"remote" / "hourly" in work-location statements', story: 'removed from the résumé 2026-10-05',
    find: every(/\b(?:or remote|\/ remote|Remote \(hourly\)|\(hourly\)|Remote · Hybrid)\b/gi, m => tidy(m[0]).toLowerCase()) },
  { key: 'nanomeTitle', label: 'Nanome job title',
    benign: [{ snip: /HR paperwork|the HR title|"summary": "XR product designer/, why: 'the HR-title note and the xr lane summary, not a title claim' }], story: 'ruled LinkedIn\'s "Lead XR Product & Interaction Designer" (John 2026-10-08) · HR: XR Product & Interaction Designer',
    find: every(/\b(?:Lead\s+)?XR\s+(?:Product\s*(?:&amp;|&|and)\s*Interaction|Product|Interaction|Spatial)\s+Designer\b/gi, m => tidy(m[0])) },
  { key: 'nanomeDates', label: 'Nanome dates', story: 'Feb 2022 – Nov 2024',
    find: near(/\bNanome(?!\s*2)\b/g, SPAN, 140, span) },
  { key: 'avTitle', label: 'AvatarMEDIC title',
    benign: [{ snip: /as CEO of AvatarMEDIC|previous CEO/, why: 'the Founder Institute record ("graduate as CEO of AvatarMEDIC") and a quoted endorsement' },
             { snip: /"tags": "avatarmedic[^"]*\bCEO\b/, why: 'search keywords in a chunk\'s tags, not a claim' }], story: 'ruled CEO (John 2026-10-08): resume.json Co-Founder & CEO, LinkedIn "Co-Founder, CEO"',
    find: near(/AvatarMEDIC/gi, /\b(?:founding |first )?CEO(?:\s*\/\s*CTO)?\b|\bCTO\b/gi, 160, m => tidy(m[0]).replace(/^(?:founding|first) /i, '').toUpperCase()) },
  { key: 'avDates', label: 'AvatarMEDIC dates',
    benign: [{ variant: /^2024–present$/, why: "JHDesign LLC's dates next to AvatarMEDIC in the career timeline" }], story: 'Apr 2019 (LinkedIn) or Jun 2019 – May 2021',
    find: near(/AvatarMEDIC/gi, SPAN, 140, span) },
  { key: 'jhStart', label: 'JHDesign / independent practice start',
    benign: [{ variant: /^(LLC )?2024$/, why: 'the LLC (registered 2024) is a separate fact from the practice (since 2012), by John\'s ruling 2026-10-07' }], story: 'Dec 2013 (LinkedIn) · Jun 2014 (old site, 2025 PDF) · 2012 (resume.json) · LLC 2024',
    find: near(/JHDesign|JH Design|independent (?:practice|designer)|Independent since|practice since/gi, /\b(?:since|from|founded(?: in)?)\s+(20[01]\d|202[0-4])\b|\b(20[01]\d|202[0-4])\s*[–—-]\s*(?:[Pp]resent|now)\b|\bLLC\s+(?:\w+\s+){0,2}(20\d\d)\b/g, 120,
      m => m[1] || m[2] || `LLC ${m[3]}`) },
  { key: 'asma', label: 'AsMA R&D Innovation Award year', story: '2022 (old site twice; 2025 PDF says 2023)',
    find: near(/AsMA|Aerospace Medical/g, YEAR, 160, m => m[1]) },
  { key: 'blokdok', label: 'Blók Dók year', story: 'Sep 2012 – Mar 2015 (old site); LinkedIn project Dec 2012',
    find: near(/Bl[oó]k\s*D[oó]k/gi, YEAR, 90, m => m[1]) },
  { key: 'collabTitle', label: 'Collaborate.org title', story: 'ruled "Lead UI/UX Designer" (John 2026-10-08) · LinkedIn: Designer, UX & Conceptual',
    find: near(/Collaborate\.org/gi, /Lead UI\/UX Designer|UI\/UX Design Lead|Designer, UX (?:&amp;|&) Conceptual|(?:lead )?conceptual and UX designer|UX lead/gi, 140, m => tidy(m[0])) },
  { key: 'founderInst', label: 'Founder Institute year', story: '2020', find: near(/Founder Institute/g, YEAR, 90, m => m[1]) },
  { key: 'nist', label: 'NIST CHARIoT year', story: '2021 (Phase 2)', find: near(/CHARIoT/g, YEAR, 90, m => m[1]) },
  { key: 'reactor', label: 'Microsoft Reactor / HoloTRIAGE year', story: '2020', find: near(/Microsoft Reactor/g, YEAR, 90, m => m[1]) },
  { key: 'att', label: 'AT&T 5G Hackathon / SAR 5G year', story: '2019', find: near(/AT&(?:amp;)?T 5G|SAR 5G/g, YEAR, 90, m => m[1]) },
  { key: 'mostMeta', label: '"Most Meta" year', story: '2016 (with the Black Box trophy)', find: near(/Most Meta/g, YEAR, 90, m => m[1]) },
  { key: 'thesis', label: 'MA thesis title',
    benign: [{ variant: /^As we /, why: 'a section heading in an essay and a phrase in the whitepaper, not a title claim' }], story: 'old site: "Art Math, Math Art: Toward a Boundless Grounded Infinity" · resume.json: "As We May Sketch"',
    find: every(/As We May Sketch|Art Math,? Math Art/gi, m => tidy(m[0]).replace(/,/, ',')) },
  { key: 'sessions', label: 'Nanome test-session count',
    benign: [{ variant: /^4 sessions$/, why: 'the Guided Coaching program, not Nanome testing' }], story: '~24 (John removed the number from his bullet 2026-10-07)',
    find: every(/\b(?:about |around |~)?(\d{1,3}|twenty-four)\s+(?:alpha(?: and beta)?|beta|test|user|usability)?\s*(?:test(?:ing)? )?sessions\b/gi, m => tidy(m[0]).toLowerCase()) },
  { key: 'devTeam', label: 'Nanome team size', story: 'one other designer, a scientific PM, a project manager, 7 developers',
    find: every(/\b(?:seven|7|eight|8|six|6)\s+developers\b/gi, m => tidy(m[0]).toLowerCase().replace('seven', '7')) },
  { key: 'book', label: 'Book title', story: 'Spatial Design: Breaking the 2D Paradigm',
    benign: [{ snip: /contribution to Breaking the 2D Barrier/, why: "Dr. Ok's wording, inside her quoted recommendation" }],
    find: every(/Breaking the 2D (?:Paradigm|Barrier)/gi, m => tidy(m[0])) },
  { key: 'awardCount', label: 'Counted wins and awards', story: 'wins: AsMA, NIST CHARIoT, Microsoft Reactor, AT&T (+ AvatarRESCUE?)',
    find: every(/\b(?:two|three|four|five|seven|2|3|4|5|7)\s+(?:award(?:s| wins)|hackathon(?: and challenge)? wins|wins|winning (?:entries|concepts))\b/gi, m => tidy(m[0]).toLowerCase()) },
  { key: 'opApproaches', label: 'OpenProse approaches count', story: '137 total, 37 core',
    benign: [{ variant: /^37 core$/, why: 'the core subset the canvas shows, defined beside the 137' }],
    find: every(/\b(1?37)\s+(?:total\s+)?(core\s+)?(?:brand\s+)?approaches\b/gi, m => m[1] + (m[2] ? ' core' : '')) },
  { key: 'mara', label: 'Nanome AI assistant name', story: 'MARA (John capitalised it 2026-10-07)', find: every(/\bMARA\b|\bMara\b/g, m => m[0]) },
  { key: 'benReed', label: 'Ben Reed, as framed', story: 'Nanome designer colleague; his own quote says "my brother"',
    find: near(/Ben Reed/g, /[Bb]rother|[Pp]eer|[Cc]olleague|[Ii]llustrator and [Dd]esigner|[Dd]esigner colleague/g, 120, m => m[0].toLowerCase()) },
  { key: 'sheila', label: 'Sheila Zipfel quote, which version', story: 'both kept (John 2026-10-08): the Nanome 2 quote on Home and Design, the LinkedIn text on Services',
    benign: [{ variant: /^LinkedIn 2025$/, why: 'ruled: Services quotes the LinkedIn recommendation, Home keeps the Nanome 2 quote' }],
    find: every(/so readily understand scientists|Invite John into your thinking/g, m => /readily/.test(m[0]) ? 'old site (Nanome 2 quote)' : 'LinkedIn 2025') },
  { key: 'drOk', label: 'Dr. Hurriyet Ok quote, which version', story: 'ruled (John 2026-10-08): the full LinkedIn text is the record, pages display the short closing line',
    benign: [{ variant: /^LinkedIn 2025$/, why: 'the full LinkedIn recommendation, kept as the record in resume.json' }],
    find: every(/stay ahead of rapid industry shifts|consistently impressed by his leadership/g, m => /stay ahead/.test(m[0]) ? 'old site' : 'LinkedIn 2025') },
  { key: 'canCover', label: 'CanCoverIt (President 2011–2020)', story: 'on LinkedIn, the old site, the 2025 PDF; added to resume.json 2026-10-07', find: presence(/CanCoverIt/g) },
  { key: 'coLab', label: 'Global Co Lab (co-founder, board, 2014–2025)', story: 'on LinkedIn, the old site, the 2025 PDF; added to resume.json 2026-10-07', find: presence(/Global Co ?Lab/gi) },
  { key: 'hippie', label: 'Hippie Sabotage tour merch (2016)', story: 'LinkedIn only', find: presence(/Hippie Sabotage/gi) },
  { key: 'gwu', label: 'Guest lecturer, GWU AR/VR classes', story: 'Dr. Ok\'s LinkedIn recommendation and old site', find: presence(/guest[- ]lectur/gi) },
  { key: 'identity', label: 'Identity line (what John is called)', story: 'LinkedIn + résumé: Product Design Engineer · old site: designer, entrepreneur, consultant, artist and researcher · 2025 PDF: Product Designer, Artist, AI & XR SME, Strategy & Business Consultant',
    find: every(/\b(Agentic Design Engineer|Product Design Engineer|Founding Designer\s*(?:&amp;|&|and)\s*Design Engineer|Founding designer and design engineer|Design Engineer who writes code|designer, entrepreneur, consultant, artist and researcher|Product Designer, Artist)\b/gi, m => tidy(m[0]).toLowerCase().replace('&amp;', '&').replace(' and design engineer', ' & design engineer')) },
  { key: 'selfDesc', label: 'How John describes himself (first clause)', story: 'résumé headline: Product Design Engineer · AI, Web, 3D & XR',
    find: every(/\b(?:I am|I'm|John (?:Hanacek )?is)\s+(?:a |an )?((?:product|designer|multimedia|founding|product design|creative|visionary)[^.;:\n<]{3,70})/gi, m => tidy(m[1]).toLowerCase()) },
];

// ---------------------------------------------------------------- read every surface
const FRESH_FOR = {
  'Assets/john-hanacek-resume.md': '.local/out/JohnHanacek-resume.md',
  'john-hanacek.json': '.local/out/JohnHanacek.json',
  'Assets/JH_Resume_2026_onepage.pdf': '.local/out/JohnHanacek-resume-designed.pdf',
};
const textOf = f => {
  if (FRESH && f === 'Assets/search-chunks.json') {               // the compiled chunks, patched as --apply would
    const data = JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
    const patches = JSON.parse(readFileSync(join(OUT, 'chunks-proposed.json'), 'utf8'));
    for (const c of (Array.isArray(data) ? data : data.chunks)) if (patches[c.id]) Object.assign(c, patches[c.id]);
    return JSON.stringify(data, null, 2);
  }
  if (FRESH && FRESH_FOR[f]) f = FRESH_FOR[f];
  const p = join(ROOT, f);
  if (!existsSync(p)) return null;
  if (f.endsWith('.pdf')) { try { return execFileSync('pdftotext', ['-layout', p, '-']).toString(); } catch { return null; } }
  return readFileSync(p, 'utf8');
};
const lineAt = (text, i) => text.slice(0, i).split('\n').length;
const chunkAt = (text, i) => { const m = [...text.slice(0, i).matchAll(/"id":\s*"?([\w-]+)"?/g)].pop(); return m ? `chunk ${m[1]}` : null; };

const hits = {};                                                   // fact → [{variant, file, tier, where}]
let filesRead = 0;
for (const s of SURFACES) for (const f of s.files) {
  const text = textOf(f);
  if (text == null) continue;
  filesRead++;
  EDGE = f.endsWith('.json') ? EDGE_JSON : EDGE_TEXT;
  for (const fact of FACTS) for (const h of fact.find(text)) {
    const where = f.endsWith('search-chunks.json') ? chunkAt(text, h.at) : f.endsWith('.pdf') ? 'pdf' : `L${lineAt(text, h.at)}`;
    const snip = text.slice(Math.max(0, h.at - 70), h.at + 110).replace(/<[^>]+>/g, ' ').replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
    (hits[fact.key] ||= []).push({ variant: h.variant, file: f, tier: s.tier, where, snip });
  }
}

// ---------------------------------------------------------------- report
const tierOrder = SURFACES.map(s => s.tier);
const L = ['# Claims audit: where each fact about John is stated', '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by \`node scripts/claims-audit.mjs\` over ${filesRead} files in ${SURFACES.length} tiers.`,
  'A fact is DIVERGENT when its statements carry more than one variant. "story" is what the 2026-10-07 story pass found outside the repo (LinkedIn, the old site, the 2025 PDF).', '',
  'Not scanned, but stating these facts too: LinkedIn; **jhanacek.net (the old Coda site, still live)**; the 2025 PDF in the Coda export; the media-kit PNGs (rendered from Assets/media-kit.json).', '',
  '| Tier | Files | Made by |', '|---|---|---|', ...SURFACES.map(s => `| ${s.tier} | ${s.files.length} | ${s.why} |`), ''];
const summary = [];
for (const fact of FACTS) {
  const hs = hits[fact.key] || [];
  const byVar = {};
  for (const h of hs) (byVar[h.variant] ||= []).push(h);
  const variants = Object.keys(byVar);
  const presenceFact = fact.find.toString().includes("'mentioned'");
  const benignWhy = h => (fact.benign || []).find(b => (b.variant && b.variant.test(h.variant)) || (b.snip && b.snip.test(h.snip)))?.why;
  const counted = [...new Set(hs.filter(h => h.tier !== 'archive' && !benignWhy(h)).map(h => h.variant))];
  const divergent = !presenceFact && counted.length > 1;
  summary.push({ fact, variants: divergent ? counted : variants, divergent, n: hs.length, presenceFact });
  L.push(`## ${divergent ? '⚠ ' : ''}${fact.label}`, '', `story: ${fact.story}`, '');
  if (!hs.length) { L.push('Not stated anywhere in the repo.', ''); continue; }
  if (presenceFact) {
    const files = [...new Set(hs.map(h => `${h.file} (${h.tier})`))];
    L.push(`Mentioned in ${files.length} file(s): ${files.join(', ')}`, ''); continue;
  }
  L.push('| Variant | Count | Where |', '|---|---|---|');
  for (const v of variants.sort((a, b) => byVar[b].length - byVar[a].length)) {
    const locs = byVar[v].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)).map(h => `${h.file}${h.where ? ` ${h.where}` : ''} *(${h.tier})*`);
    const why = byVar[v].every(h => h.tier === 'archive') ? 'archive only' : byVar[v].every(h => benignWhy(h)) ? `benign: ${benignWhy(byVar[v][0])}` : '';
    L.push(`| ${v}${why ? ` *(${why})*` : ''} | ${byVar[v].length} | ${locs.slice(0, 14).join('<br>')}${locs.length > 14 ? `<br>…+${locs.length - 14}` : ''} |`);
  }
  if (divergent) {                                                 // the words themselves, so a reader can judge
    L.push('', '<details><summary>In context</summary>', '');
    for (const v of variants) for (const h of byVar[v].slice(0, 4)) L.push(`- **${v}** · ${h.file} ${h.where}: “…${h.snip.replace(/\|/g, '/')}…”`);
    L.push('', '</details>');
  }
  L.push('');
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/claims-audit.md`, L.join('\n') + '\n');

console.log(`claims audit${FRESH ? ' (FRESH: the build --apply would publish)' : ''}: ${filesRead} files, ${FACTS.length} facts → .local/out/claims-audit.md\n`);
for (const s of summary) {
  const mark = s.presenceFact ? '·' : s.divergent ? '⚠' : s.n ? '✓' : '·';
  const detail = s.presenceFact ? (s.n ? `${new Set((hits[s.fact.key] || []).map(h => h.file)).size} file(s)` : 'nowhere in the repo') : s.n ? s.variants.join(' | ') : 'not stated';
  console.log(`  ${mark} ${s.fact.label.padEnd(46)} ${detail.slice(0, 110)}`);
}
const nDiv = summary.filter(s => s.divergent).length;
console.log(`\n${nDiv} divergent fact(s).`);
if (STRICT && nDiv) process.exit(1);
