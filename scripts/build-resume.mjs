// Compiles Assets/resume.json (THE career source of truth) into every output.
//
//   node scripts/build-resume.mjs            → .local/out/ only (designed + ATS + long PDFs,
//                                              markdown, LinkedIn blocks, proposed chunks/JSON-LD)
//   node scripts/build-resume.mjs --apply    → also writes into the repo: Assets/john-hanacek-resume.md,
//                                              Assets/JH_Resume_2026_onepage.pdf (no phone), the five
//                                              career chunks in Assets/search-chunks.json (run
//                                              `node scripts/build-chunk-vectors.mjs` after), and
//                                              john-hanacek.json. Commit is still yours.
//   --lane=designEngineer|productDesigner|foundingDesigner|xr   (summary + bullet emphasis; default designEngineer)
//
// The application PDF (with the phone from .local/private.json) is ALWAYS written to .local/out/ and
// never into Assets/. Same template, one column, real headings and lists — the ATS twin is the same
// DOM with the art removed, so the wording can never drift between the two.
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.local/out');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LANE = (args.find(a => a.startsWith('--lane=')) || '--lane=designEngineer').slice(7);
const R = JSON.parse(readFileSync(resolve(ROOT, 'Assets/resume.json'), 'utf8'));
const PRIV = existsSync(resolve(ROOT, '.local/private.json')) ? JSON.parse(readFileSync(resolve(ROOT, '.local/private.json'), 'utf8')) : {};
const YEAR = new Date().getFullYear();
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = w => `${w.start}–${w.end ?? 'now'}`;
const host = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

// ---------------------------------------------------------------- selections
const lane = R.lanes[LANE] || R.lanes.designEngineer;
const roles = R.work.filter(w => !w.compressed);
const earlier = R.work.filter(w => w.compressed);
const bulletsFor = (w, mode) => {
  if (mode === 'long') return w.highlights.map(h => h.text);
  if (w.onePage) return w.onePage;
  const picked = w.highlights.filter(h => !h.lanes.length || h.lanes.includes(LANE));
  return (picked.length ? picked : w.highlights).slice(0, 3).map(h => h.text);
};
const skillLines = [
  ['Design & research', ['Figma', 'FigJam', 'Blender', 'Unity / C#', 'ShapesXR', 'Adobe Creative Suite'], 'User research, usability testing, qualitative coding, 3D interaction design, design systems, brand, workshops, PRD and MVP scoping'],
  ['Code', ['JavaScript', 'TypeScript', 'React', 'HTML / CSS', 'Three.js', 'WebGL / GLSL', 'WebGPU', 'Node.js', 'Playwright', 'Git'], null],
  ['AI & agentic', ['Claude Code', 'Opencode', 'Hermes Agent', 'LM Studio', 'Ollama', 'MCP (Blender, Figma)'], 'Context engineering, agent orchestration, tool-use design, retrieval-augmented generation, conversational UX'],
  ['XR & robotics', ['Meta Quest', 'HoloLens 2', 'Magic Leap One', 'visionOS'], 'Digital twins and teleoperation (Unity), 3D scanning and photogrammetry'],
];

// ---------------------------------------------------------------- HTML
function html(mode, withPhone) {
  const one = mode !== 'long';
  const ats = mode === 'ats';
  const contact = [R.basics.email, withPhone && PRIV.phone, host(R.basics.website), 'linkedin.com/in/johnhanacek', 'github.com/jjh111', R.basics.workMode, R.basics.citizenship].filter(Boolean);
  const role = w => `
    <section class="role">
      <div class="role-head"><h3>${esc(w.title)}<span class="org"> · ${esc(w.org)}</span></h3><span class="dates">${span(w)}${w.location ? ` · ${esc(w.location)}` : ''}</span></div>
      <ul>${bulletsFor(w, mode).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    </section>`;
  const earlierLine = one ? 'Photographer, Qualcomm Institute (Calit2) and UCSD Guardian; Ocean Lifeguard, California State Parks (2007–2012)' : earlier.map(w => `${esc(w.title)}, ${esc(w.org)} (${span(w)})`).join(' · ');
  const awards = R.awards.map(a => `<li><span class="y">${a.year}</span> ${one ? esc(a.short || a.title) : `${esc(a.title)}, ${esc(a.org)}${a.for ? ` — ${esc(a.for)}` : ''}`}</li>`).join('');
  const talksLine = [`AWE USA 2024 Lightning Round`, `XRDC 2024 mentor (Meta, ShapesXR, IDEO)`, `contributor, <em>Spatial Design: Breaking the 2D Paradigm</em> (2024)`, `EDULEARN15 paper on the spread of technology-enhanced teaching`, `Atlantic Council foresight essays on answer engines (2014)`].join(' · ');
  const talks = [
    ...R.talks.map(t => `<li><span class="y">${t.year}</span> ${esc(t.title)}, ${esc(t.event)}</li>`),
    ...R.features.map(f => `<li><span class="y">${f.year}</span> Contributor, <em>${esc(f.title)}</em> (${esc(f.authors)})</li>`),
  ].join('');
  const pubs = R.publications.filter(p => p.year && p.id !== 'writing-archive').map(p => `<li><span class="y">${String(p.year).slice(0, 4)}</span> ${esc(p.title)}${p.authors ? ` — ${esc(p.authors)}` : ''}. <em>${esc(p.venue)}</em></li>`).join('');
  const edu = R.education.map(e => `
    <section class="role">
      <div class="role-head"><h3>${esc(e.degree)}<span class="org"> · ${esc(e.school)}</span></h3><span class="dates">${e.start}–${e.end}</span></div>
      ${one ? (e.thesis?.title ? `<p class="note">Thesis: “${esc(e.thesis.title)}”${e.honors ? ` · ${esc(e.honors[0])}` : ''}</p>` : '') :
        `<p class="note">${e.thesis?.title ? `Thesis: “${esc(e.thesis.title)}”. ` : 'Thesis: '}${esc(e.thesis?.note || '')}${e.secondThesis ? ` Second thesis: ${esc(e.secondThesis)}.` : ''}${e.honors ? ` ${esc(e.honors.join('; '))}.` : ''}</p>`}
    </section>`).join('');
  const projects = R.projects.map(p => `<li><strong>${esc(p.name)}</strong>${p.period ? ` (${esc(p.period)})` : ''}: ${esc(p.summary)}</li>`).join('');
  const art = ats ? '' : `<div class="tank" aria-hidden="true"><canvas id="tank"></canvas></div>`;
  return `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>John Hanacek — Resume</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@200;300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../styles/jh-chrome.css">
<style>
@page { size: Letter; margin: 0; }
:root { --s: 1; }
html { font-size: calc(10.2pt * var(--s)); }
body { margin: 0; background: #fff; color: var(--text-subhead); font-family: 'Raleway', system-ui, sans-serif; font-weight: 400; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 8.5in; ${one ? 'height: 11in; overflow: hidden;' : 'min-height: 11in;'} box-sizing: border-box; padding: 0.42in 0.55in ${ats ? '0.45in' : '1.02in'}; position: relative; background: #fff; }
${one ? '' : '.page { page-break-after: auto; }'}
header { margin-bottom: 0.6rem; }
.name { font-weight: 200; font-size: 2.35rem; line-height: 1; letter-spacing: 0.02em; margin: 0; color: var(--text-subhead); }
.headline { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--cyan-dim); margin: 0.35rem 0 0.25rem; }
.contact { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--muted); margin: 0; }
.contact span + span::before { content: ' · '; }
h2 { font-family: 'JetBrains Mono', monospace; font-size: 0.66rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--cyan-dim); margin: 0.7rem 0 0.25rem; padding-bottom: 0.15rem; border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.25); }
.summary { margin: 0; font-size: 0.98rem; line-height: 1.42; }
.role { margin: 0 0 0.38rem; break-inside: avoid; }
.role-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
h3 { font-size: 1.02rem; font-weight: 600; margin: 0; }
.org { font-weight: 400; color: var(--text-subhead); }
.dates { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: var(--muted); white-space: nowrap; }
ul { margin: 0.15rem 0 0; padding-left: 1.05em; }
li { margin: 0.08rem 0; line-height: 1.3; font-size: 0.93rem; }
.note { margin: 0.1rem 0 0; font-size: 0.9rem; color: var(--muted); }
.earlier { font-size: 0.86rem; color: var(--muted); margin: 0.1rem 0 0; }
.skills li { list-style: none; margin: 0.12rem 0; }
.skills ul { padding-left: 0; }
.skills b { font-weight: 600; }
.skills .tools { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: var(--text-subhead); }
.y { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--muted); margin-right: 0.35em; }
.two { columns: 2; column-gap: 1.4rem; }
.three { columns: 3; column-gap: 1.2rem; }
.three li { break-inside: avoid; font-size: 0.86rem; }
.two li { break-inside: avoid; }
.tank { position: absolute; left: 0; right: 0; bottom: 0; height: 1.15in; -webkit-mask-image: linear-gradient(to bottom, transparent, #000 45%); mask-image: linear-gradient(to bottom, transparent, #000 45%); }
.tank canvas { width: 100%; height: 100%; display: block; }
</style></head><body><div class="page">
<header>
  <h1 class="name">${esc(R.basics.name)}</h1>
  <p class="headline">${esc(R.basics.headline)}</p>
  <p class="contact">${contact.map(c => `<span>${esc(c)}</span>`).join('')}</p>
</header>
<h2>Summary</h2>
<p class="summary">${esc(lane.summary)}</p>
<h2>Experience</h2>
${roles.map(role).join('')}
${one ? `<p class="earlier"><b>Earlier:</b> ${earlierLine}</p>` : earlier.map(role).join('')}
<h2>Education</h2>
${edu}
<h2>Skills</h2>
<div class="skills"><ul>${skillLines.map(([k, tools, practice]) => `<li><b>${k}:</b> ${practice ? esc(practice) + '. ' : ''}<span class="tools">${tools.join(' · ')}</span></li>`).join('')}</ul></div>
<h2>Awards</h2>
<ul class="${one ? 'three' : ''}">${awards}</ul>
${one ? `<h2>Talks & writing</h2><p class="earlier">${talksLine}</p>` : `<h2>Talks & features</h2><ul>${talks}</ul><h2>Publications</h2><ul>${pubs}</ul><h2>Projects</h2><ul>${projects}</ul>`}
${art}
</div>
${ats ? '' : `<script src="../../scripts/shape-detection.js"></script><script src="../../scripts/fish-engine.js"></script>
<script>
  // The margin tank: the site's own engine on paper. Coral on the seabed, a few fish, one pellet.
  const c = document.getElementById('tank');
  const f = FishCanvas(c, { transparent: true, seedFish: false });
  const W = c.clientWidth, H = c.clientHeight, rnd = (a, b) => a + Math.random() * (b - a);
  const sq = (cx, cy, s) => { const h = s / 2, cs = [[-h,-h],[h,-h],[h,h],[-h,h]], pts = []; for (let e = 0; e < 4; e++) { const [x1,y1] = cs[e], [x2,y2] = cs[(e+1)%4]; for (let i = 0; i < 7; i++) pts.push({ x: cx + x1 + (x2-x1)*i/7, y: cy + y1 + (y2-y1)*i/7 }); } pts.push({ x: cx + cs[0][0], y: cy + cs[0][1] }); return pts; };
  const fish = (cx, cy, S) => { const rx = 45*S, ry = 32*S, ov = 0.55, tx = 75*S, ty = 28*S, pts = [], a0 = ov, a1 = Math.PI*2 - ov; const sx = cx + rx*Math.cos(a0), sy = cy + ry*Math.sin(a0); for (let i = 0; i <= 3; i++) pts.push({ x: (cx+tx) + (sx-cx-tx)*i/4, y: (cy-ty) + (sy-cy+ty)*i/4 }); for (let i = 0; i <= 26; i++) { const a = a0 + (a1-a0)*i/26; pts.push({ x: cx + rx*Math.cos(a), y: cy + ry*Math.sin(a) }); } const ex = cx + rx*Math.cos(a1), ey = cy + ry*Math.sin(a1); for (let i = 1; i <= 4; i++) pts.push({ x: ex + (cx+tx-ex)*i/4, y: ey + (cy+ty-ey)*i/4 }); return pts; };
  [0.17, 0.5, 0.83].forEach(x => f.processStroke(sq(W * x + rnd(-10, 10), H - 4, rnd(96, 112)), ['coral']));
  [[0.08, 0.5], [0.3, 0.62], [0.4, 0.42], [0.62, 0.56], [0.7, 0.36], [0.93, 0.6]].forEach(([x, y], i) => f.processStroke(fish(W * x, H * y, i % 3 === 1 ? 0.52 : 0.42), ['fish']));
  window.JH_FEED = () => f.addFood(W * 0.45, H * 0.5);
</script>`}
</body></html>`;
}

// ---------------------------------------------------------------- Markdown (long form)
function markdown() {
  const L = [];
  L.push(`# ${R.basics.name}`, '', `**${R.basics.headline}**`, '',
    [R.basics.email, `[${host(R.basics.website)}](${R.basics.website})`, ...R.basics.links.map(l => `[${l.label}](${l.url})`)].join(' · '), '', '---', '',
    '## Summary', '', lane.summary, '', '---', '', '## Work Experience', '');
  for (const w of R.work) {
    L.push(`### ${w.title}`, `**${w.org}** · ${span(w)}${w.location ? ` · ${w.location}` : ''}`, '');
    if (w.summary) L.push(w.summary, '');
    L.push(...w.highlights.map(h => `- ${h.text}`), '');
  }
  L.push('---', '', '## Education', '');
  for (const e of R.education) {
    L.push(`### ${e.degree}`, `**${e.school}** · ${e.location} · ${e.start}–${e.end}`, '');
    if (e.thesis) L.push(`${e.thesis.title ? `Thesis: [“${e.thesis.title}”](${e.thesis.url || ''}) — ` : 'Thesis: '}${e.thesis.note}${e.secondThesis ? ` Second thesis: ${e.secondThesis}.` : ''}${e.honors ? ` ${e.honors.join('; ')}.` : ''}`, '');
  }
  L.push('---', '', '## Skills', '', `**Domains:** ${R.skills.domains.join(' · ')}`, '', `**Technologies:** ${R.skills.technologies.join(' · ')}`, '', `**Practice:** ${R.skills.practice.join(' · ')}`, '');
  for (const [k, tools, practice] of skillLines) L.push(`**${k}:** ${tools.join(', ')}${practice ? ` — ${practice}` : ''}`, '');
  L.push('---', '', '## Awards & Recognition', '', '| Year | Award | Organization |', '|------|-------|--------------|');
  for (const a of R.awards) L.push(`| ${a.year} | ${a.title}${a.for ? ` — ${a.for}` : ''} | ${a.url ? `[${a.org}](${a.url})` : a.org} |`);
  L.push('', '## Talks & Features', '');
  for (const t of R.talks) L.push(`- **${t.event} (${t.year})** — ${t.title}${t.url ? ` · [event](${t.url})` : ''}${t.video ? ` · [video](${t.video})` : ''}`);
  for (const f of R.features) L.push(`- **${f.title}** (${f.year}) — ${f.role}; by ${f.authors} · [about the book](${f.url})`);
  L.push('', '## Research & Publications', '');
  for (const p of R.publications) L.push(`- **${p.venue}${p.year ? ` (${String(p.year).slice(0, 4)})` : ''}** — [${p.title}](${p.url})${p.authors ? ` — ${p.authors}` : ''}`);
  L.push('', '## Projects', '');
  for (const p of R.projects) L.push(`- **${p.name}**${p.period ? ` (${p.period})` : ''} — ${p.summary}${p.url ? ` · [${host(p.url)}](${p.url})` : ''}`);
  L.push('', '---', '', `*${R.basics.availability}*`, `*© ${YEAR} John Hanacek · JHDesign LLC · compiled from Assets/resume.json*`, '');
  return L.join('\n');
}

// ---------------------------------------------------------------- LinkedIn paste blocks
function linkedin() {
  const L = ['# LinkedIn paste blocks', '', '## Headline (≤220 chars)', '', R.basics.headline + ' · Independent, JHDesign LLC · ex-Nanome, BadVR · AvatarMEDIC co-founder', '', '## About', '', lane.summary, '', R.basics.availability, ''];
  for (const w of R.work.filter(w => !w.compressed)) {
    L.push(`## ${w.title} — ${w.org} (${span(w)})`, '', ...(w.onePage || w.highlights.map(h => h.text)).map(t => `• ${t}`), '');
  }
  return L.join('\n');
}

// ---------------------------------------------------------------- chunks
function chunkPatches() {
  const A = R.awards;
  const awardsFacts = A.map(a => ({ t: a.title, d: `${a.org}${a.for ? ` — ${a.for}` : ''}`, y: a.year, ...(a.year === '2022' ? { media: true } : {}) }));
  const timelineFacts = R.work.filter(w => !w.compressed).map(w => ({ t: w.org, d: w.id === 'jhdesign-llc' ? `${w.title} — OpenProse (26), Muse.bio (24, 26), Transfyr (25)` : w.title, y: span(w).replace(/20(\d\d)/g, '$1') }));
  return {
    4: {
      content: 'Independent designer since 2012 (media, web and product design under the JHphotography and JHDesign names), incorporated as JHDesign LLC in 2024. Serves startups and R&D teams. Clients: OpenProse (founding design, 2026), Muse.bio (workshop facilitation, personas and journey mapping in 2024; a FigJam workshop plus a Claude Code and Figma MCP ingestion system in 2026), Transfyr (user-journey workshop, MVP design handoff with PRD and prototype, synthetic demo data and QA, 2025). Works across biotech and pharma, medtech and first response, spatial computing and AI.',
      tldr: 'JHDesign LLC serves startups and R&D teams — founding design for OpenProse, workshops and tooling for Muse.bio, MVP handoff for Transfyr.',
    },
    21: {
      content: `Awards and recognition: ${A.map(a => `${a.title}, ${a.org} (${a.year})${a.for ? `, ${a.for}` : ''}`).join('. ')}. Contributor, interviewed as an expert, to Spatial Design: Breaking the 2D Paradigm (Dominique Wu, 2024). Lightning Round speaker at AWE USA 2024; mentor at XRDC 2024 (Meta, ShapesXR, IDEO).`,
      tldr: 'AsMA R&D Innovation Award (2022) · NIST CHARIoT Phase 2 (2021) · Microsoft Reactor (2020) · AT&T 5G Hackathon (2019) · FI SF grad · Most Meta · Kevin Kelly challenge (2014).',
      micro: 'AsMA, NIST, Microsoft, AT&T 5G, Founder Institute.',
      tags: 'awards innovation aerospace nist microsoft att 5g hackathon founder institute kevin kelly technium awe xrdc book spatial design accomplishment won speaker talk',
      facts: awardsFacts,
    },
    23: {
      content: `${R.work.filter(w => !w.compressed).map(w => `${w.org} (${span(w)}): ${w.title}${w.summary ? ` — ${w.summary.replace(/\.$/, '')}` : ''}`).join('. ')}. Independent media and design practice since 2012 under the JHphotography and JHDesign names; JHDesign LLC registered 2024. Earlier: ${earlier.map(w => `${w.title}, ${w.org} (${span(w)})`).join('; ')}.`,
      tldr: 'JHDesign LLC (24–now; OpenProse 26, Muse.bio 24/26, Transfyr 25), Nanome (22–24), BadVR (21–22), AvatarMEDIC CEO/CTO (19–21), Collaborate.org (15–18); independent since 2012.',
      micro: 'JHDesign ← Nanome ← BadVR ← AvatarMEDIC ← Georgetown.',
      facts: timelineFacts,
    },
    26: {
      content: 'Leadership: co-founded AvatarMEDIC and led it as CEO/CTO (product strategy, pitching, engineering direction, fundraising) with co-founder Susan Ip-Jewell MD. At Nanome, Lead XR Product Designer and de facto product lead inside a PM, project manager and design triad: ran user interviews, wrote the PRD template and tracking system, designed the internal Coda knowledge base, organized team-wide workshops and translated feedback into development cycles; art directed look development and production. UI/UX Design Lead at Collaborate.org. Runs client engagements and workshops through JHDesign LLC, and hands teams systems they operate themselves (Muse.bio). Product management experience: roadmaps and pitching as AvatarMEDIC CEO; MVP scoping and PRD handoffs for JHDesign clients (Transfyr). Startup titles ran lean; the scope was director-level in practice, most of all at Nanome.',
      tldr: 'Led AvatarMEDIC as CEO/CTO; product lead for Nanome 2 inside a PM–PjM–design triad; runs client engagements and workshops through JHDesign LLC.',
      micro: 'Founder-led teams; product lead at Nanome.',
    },
    27: {
      content: 'Shipped products: (1) AROC situational-awareness AR HUD at BadVR, hand tracking on Meta Quest and HoloLens 2. (2) Nanome 2 on Meta Quest, its companion web portal and the Mara AI assistant, to pharma customers. (3) JH Coaching OS, an adaptive AI coaching product with agent, materials, context docs and dashboard. (4) A workshop system for Muse.bio: FigJam workshop plus a Claude Code + Figma MCP ingestion tool, handed off. (5) OpenProse founding design: brand and a live homepage in two months. Experiments: MetaMedium, an AI-interpreted drawing interface; this site\'s command bar (BM25 + MiniLM retrieval, LFM2.5 in the browser on WebGPU, local-model support, scene language for the canvases); READI, a live emergency-resource dashboard; Blok Dok (2013), a wooden iPhone dock designed, made and sold.',
      tldr: 'Shipped: AROC (BadVR), Nanome 2 + web portal + Mara AI, JH Coaching OS, the Muse.bio workshop system, OpenProse. Experiments: MetaMedium, this site\'s search, READI.',
      micro: 'Shipped: XR + AI, agentic tools, web products.',
      tags: 'shipped AI products built delivered LLM agent launched output nanome aroc coaching os openprose muse readi metamedium blok dok',
      facts: [
        { t: 'AROC — BadVR', d: 'situational-awareness AR HUD, hand tracking on Quest and HoloLens 2' },
        { t: 'Nanome 2 + web portal + Mara AI', d: 'XR and AI molecular design, shipped to pharma customers' },
        { t: 'JH Coaching OS', d: 'adaptive AI coaching product with dashboard' },
        { t: 'Muse.bio workshop system', d: 'FigJam workshop + Claude Code / Figma MCP ingestion, handed off' },
        { t: 'OpenProse', d: 'founding design, brand to live homepage in two months' },
        { t: 'MetaMedium', d: 'experiment — AI-interpreted drawing interface' },
        { t: 'This site\'s search', d: 'experiment — retrieval + in-browser LFM2.5 on WebGPU' },
        { t: 'Blok Dok', d: '2013 — wooden iPhone dock, designed, made and sold' },
      ],
    },
    50: {
      content: `John's one-page resume (${YEAR}) is available as a PDF: ${R.basics.headline}. ${lane.summary} Career: ${R.work.filter(w => !w.compressed).map(w => `${w.title}, ${w.org} (${span(w)})`).join('; ')}. MA Georgetown CCT (2016), BA UC San Diego (2012). Open the PDF to read or download it.`,
      tldr: `The one-page ${YEAR} resume as a PDF — open it to read or download.`,
      micro: `One-page PDF resume, ${YEAR}.`,
    },
  };
}

function applyChunks(patches) {
  const path = resolve(ROOT, 'Assets/search-chunks.json');
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  const list = Array.isArray(data) ? data : data.chunks;
  const changed = [];
  for (const c of list) {
    const p = patches[c.id];
    if (!p) continue;
    const before = c.content;
    Object.assign(c, p);
    if (before !== c.content) changed.push(c.id);
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  return changed;
}

function jsonld() {
  const path = resolve(ROOT, 'john-hanacek.json');
  const J = JSON.parse(readFileSync(path, 'utf8'));
  J.jobTitle = ['Product Design Engineer', 'Product Designer', 'Design Engineer', 'Founding Designer'];
  J.description = lane.summary;
  J.knowsAbout = [...R.skills.technologies, ...R.skills.practice, 'MetaMedium', 'Creative coding', 'WebGL and GLSL shader programming', 'three.js'];
  J.award = R.awards.map(a => `${a.title} — ${a.org} (${a.year})`);
  if (J.worksFor) J.worksFor.description = 'Independent product design engineering: founding design, product design, workshops and agentic coaching for startups and R&D teams.';
  J.sameAs = Array.from(new Set([...(J.sameAs || []), 'https://jhanacek.net/writing-4']));
  J.lastUpdated = R.meta.updated;
  return { path, J };
}


// ---------------------------------------------------------------- About page blocks (static HTML, rewritten between markers)
function aboutBlocks() {
  const link = (label, url) => url ? `<a href="${url}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label);
  const item = (year, h4, company, lis) => `
                <div class="timeline-item">
                    <span class="year">${year}</span>
                    <div class="timeline-content">
                        <h4>${h4}</h4>
                        ${company ? `<p class="company">${company}</p>` : ''}
                        ${lis ? `<ul class="muted">${lis.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
                    </div>
                </div>`;
  const experience = `\n            <div class="timeline">` + R.work.map(w => item(span(w).replace('now', 'Present'), esc(w.title), link(w.org, w.orgUrl), w.compressed ? [w.highlights[0].text] : (w.onePage || w.highlights.slice(0, 4).map(h => h.text)))).join('') + `\n            </div>\n            `;
  const education = `\n            <div class="card-grid cols-2">` + R.education.map(e => `
                <div class="content-card">
                    <h4>${esc(e.school)}</h4>
                    <p class="muted">${esc(e.location)} · ${e.start}–${e.end}</p>
                    <p><strong>${esc(e.degree.split(',')[0])}</strong>${esc(e.degree.slice(e.degree.indexOf(',')))}</p>
                    <p>${e.thesis?.title ? `Thesis: ${e.thesis.url ? `<a href="${e.thesis.url}" target="_blank" rel="noopener">“${esc(e.thesis.title)}”</a>` : `“${esc(e.thesis.title)}”`} — ${esc(e.thesis.note)}` : `Thesis: ${esc(e.thesis?.note || '')}`}${e.secondThesis ? ` Second thesis: ${esc(e.secondThesis)}.` : ''}</p>
                    ${e.honors ? `<p class="muted">${esc(e.honors.join(' · '))}</p>` : ''}
                </div>`).join('') + `\n            </div>\n            `;
  const awards = `\n            <div class="timeline">` + R.awards.map(a => item(a.year, esc(a.title), link(a.org, a.url), null).replace('</h4>\n', `</h4>\n`).replace(/(<\/p>)(\s*<\/div>)/, `$1${a.for ? `<p class="muted">${esc(a.for)}</p>` : ''}$2`)).join('') + `\n            </div>\n            `;
  const card = (h4, body, muted) => `
                <div class="content-card">
                    <h4>${h4}</h4>
                    <p>${body}</p>
                    ${muted ? `<p class="muted">${muted}</p>` : ''}
                </div>`;
  const pubs = R.publications;
  const P = id => pubs.find(p => p.id === id);
  const research = `\n            <div class="card-grid cols-2" id="talks">` +
    R.talks.map(t => card(esc(t.event), `${link(t.title, t.url)}${t.video ? ` · <a href="${t.video}" target="_blank" rel="noopener">video</a>` : ''}`, t.videoTitle ? esc(t.videoTitle) : '')).join('') +
    R.features.map(f => card(esc(f.title), `${esc(f.role)} · ${link('about the book', f.url)}`, `${esc(f.authors)} · ${f.year}`)).join('') +
    `\n            </div>\n            <div class="card-grid cols-2" id="publications">` +
    card('Master’s thesis', link(`“${R.education[0].thesis.title}”`, R.education[0].thesis.url), esc(R.education[0].thesis.note)) +
    card('EDULEARN15, Barcelona', link(P('edulearn-2015').title, P('edulearn-2015').url), esc(P('edulearn-2015').authors)) +
    card('Atlantic Council — Strategic Foresight', `${link('Internet as Answer Engine, Part I', P('atlantic-council-i').url)} · ${link('Part II', P('atlantic-council-ii').url)}`, 'March 2014 — answer engines displacing search, written eight years before ChatGPT') +
    card('The Technium — Kevin Kelly', link(P('technium-haiku').title, P('technium-haiku').url), 'Winner of the 2014 desirable-future challenge') +
    card('HuffPost', link(P('huffpost-feudalism').title, P('huffpost-feudalism').url), '2014 — the open internet and platform monopolism') +
    card('The Problems of Agent Orchestration', `<a href="onagents.html">${esc(P('onagents-2026').title)}</a>`, '2026 — a ~37,000-word essay, released through the playground') +
    card('Writing archive', link('jhanacek.net', P('writing-archive').url), 'Foresight and grad-school writing, 2012–2016') +
    `\n            </div>\n            `;
  // How I work: the "how John thinks" chunks are the source (audited claims); the page mirrors them.
  // The page shows the OPENING of each claim — the first two sentences — and hands the rest to the
  // command bar. Five full chunks side by side read as walls of prose that nobody finishes; the
  // chunk keeps every word, and `more →` is a real search for the card's own title.
  const chunks = (() => { const d = JSON.parse(readFileSync(resolve(ROOT, 'Assets/search-chunks.json'), 'utf8')); return Array.isArray(d) ? d : d.chunks; })();
  const HOW = [43, 44, 45, 47, 48];
  const openingOf = s => { const m = String(s).match(/[^.!?]+[.!?]+(?:\s+|$)/g); return m ? m.slice(0, 2).join('').trim() : String(s); };
  const how = `\n            <div class="card-grid cols-2">` + HOW.map(id => {
    const ch = chunks.find(x => x.id === id);
    if (!ch) return '';
    const more = `<a href="search.html?q=${encodeURIComponent(ch.title)}">more →</a>`;
    return card(esc(ch.title), `${esc(openingOf(ch.content))} ${more}`, '');
  }).join('') + `\n            </div>\n            `;
  return { experience, education, awards, research, 'how-i-work': how };
}
function applyAbout() {
  const path = resolve(ROOT, 'about.html');
  let html = readFileSync(path, 'utf8');
  const blocks = aboutBlocks();
  for (const [k, v] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- resume:${k} -->)[\\s\\S]*?(<!-- /resume:${k} -->)`);
    if (!re.test(html)) { console.warn('about.html: no marker for', k); continue; }
    html = html.replace(re, `$1${v}$2`);
  }
  writeFileSync(path, html);
  return Object.keys(blocks);
}

// ---------------------------------------------------------------- PDF
async function pdfs() {
  const { chromium } = await import('playwright-core');
  const CHROMIUM = process.env.CHROMIUM_PATH || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
  const PORT = 4597;
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const made = [];
  try {
    for (const [file, mode, withPhone] of [['resume-designed', 'one', false], ['resume-apply', 'one', true], ['resume-ats', 'ats', true], ['resume-long', 'long', true]]) {
      writeFileSync(`${OUT}/${file}.html`, html(mode, withPhone));
      const ctx = await browser.newContext({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 3 });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/.local/out/${file}.html`, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      if (mode !== 'long') {
        // fit to one page: shrink the root scale until the content clears the page
        const limit = Math.round(11 * 96) - (mode === 'ats' ? 43 : 98);
        let s = 1;
        for (let i = 0; i < 40; i++) {
          const h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.page > *:not(.tank)')].map(e => e.getBoundingClientRect().bottom)));
          if (h <= limit) break;
          s = +(s - 0.01).toFixed(2);
          await page.evaluate(v => document.documentElement.style.setProperty('--s', v), s);
        }
        console.log(`  ${file}: scale ${s}`);
      }
      if (mode !== 'ats') { await page.waitForTimeout(1800); await page.evaluate(() => window.JH_FEED && window.JH_FEED()); await page.waitForTimeout(700); }
      await page.pdf({ path: `${OUT}/${file}.pdf`, format: 'Letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
      await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
      made.push(file);
      await ctx.close();
    }
  } finally { await browser.close(); server.kill(); }
  return made;
}

// ---------------------------------------------------------------- run
writeFileSync(`${OUT}/john-hanacek-resume.md`, markdown());
writeFileSync(`${OUT}/linkedin.md`, linkedin());
const patches = chunkPatches();
writeFileSync(`${OUT}/chunks-proposed.json`, JSON.stringify(patches, null, 2));
const { path: jlPath, J } = jsonld();
writeFileSync(`${OUT}/john-hanacek.json`, JSON.stringify(J, null, 2) + '\n');
const made = await pdfs();
console.log('wrote .local/out/:', ['john-hanacek-resume.md', 'linkedin.md', 'chunks-proposed.json', 'john-hanacek.json', ...made.map(m => m + '.pdf')].join(', '));
if (APPLY) {
  writeFileSync(resolve(ROOT, 'Assets/john-hanacek-resume.md'), markdown());
  execFileSync('cp', [`${OUT}/resume-designed.pdf`, resolve(ROOT, 'Assets/JH_Resume_2026_onepage.pdf')]);
  const changed = applyChunks(patches);
  const aboutDone = applyAbout();
  writeFileSync(jlPath, JSON.stringify(J, null, 2) + '\n');
  const auditPath = resolve(ROOT, 'Agent Reference/CHUNK_AUDIT.md');
  const note = `\n\n## §J Resume compile — ${R.meta.updated}\n\nChunks ${Object.keys(patches).join(', ')} are COMPILED from \`Assets/resume.json\` by \`scripts/build-resume.mjs --apply\` (source: the 2026-09-09 interview; evidence links live in the JSON). Edit the JSON, not the chunk text. Rebuild vectors after each compile (\`node scripts/build-chunk-vectors.mjs\`).\n`;
  const audit = readFileSync(auditPath, 'utf8').replace(/\n*## §J Resume compile — [^\n]*\n\nChunks[^\n]*\n/g, '').replace(/\n+$/, '\n');
  writeFileSync(auditPath, audit + note);
  console.log('applied to repo: resume.md, one-page PDF (no phone), chunks', changed.join(','), '+ john-hanacek.json + CHUNK_AUDIT §J + about.html blocks', aboutDone.join(','), '. Now run: node scripts/build-chunk-vectors.mjs');
}
