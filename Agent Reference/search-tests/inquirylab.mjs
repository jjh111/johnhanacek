// Inquiry composer lab — the parse, the detection gate, and the meaning
// match, measured offline with the same MiniLM weights the site uses.
//
//   node "Agent Reference/search-tests/inquirylab.mjs"          (from the repo root)
//   node inquirylab.mjs --scores                                 (print the full score table)
//
// Three gates, all must hold:
//   1. FIXTURES — realistic inquiry paragraphs parse to the expected fields.
//   2. NEGATIVES — questions about John must not raise the brief card.
//   3. FALSE POSITIVES — no query anywhere in search-tests may raise it.
// Re-run before touching any threshold in scripts/inquiry-core.js (T).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SHOW_SCORES = process.argv.includes('--scores');

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'scripts/inquiry-core.js'), 'utf8'));
const I = globalThis.JHInquiry;

// [paragraph, expectations]. Fields: detect, track, offer (top after the
// meaning pass; array = any of), and L0 fields as substrings (case-insensitive).
const FIXTURES = [
    ['coaching founder',
     "Hi John, I'm Priya Shah, founder of Loop Health. I keep hearing about Claude Code and agents but I have no idea where to start. I'd love coaching sessions so I can use AI in my own work. Could we talk next month? priya@loophealth.io",
     { detect: 'brief', track: 'coaching', offer: ['guided', 'audit'], name: 'Priya Shah', org: 'Loop Health', role: 'founder', timeline: 'next month', email: 'priya@loophealth.io', noStage: true }],
    ['robotics MVP (the plan example)',
     "We're a six-person team building a teleoperation interface for warehouse robots. We have a working prototype but operators hate it. We need someone to redesign the operator experience and hand off specs to our engineers by Q1. I'm the CTO at Example Robotics. Budget is around $40k. — Dana Reyes",
     { detect: 'brief', track: 'design', offer: ['mvp', 'e2e'], name: 'Dana Reyes', org: 'Example Robotics', role: 'CTO', timeline: 'Q1', budget: '$40k', stage: 'prototype', domain: 'robotics' }],
    ['recruiter',
     "Hi John, I'm a technical recruiter at Northwind. We're hiring a senior product designer for our AI platform team, full-time, remote in the US, salary $180-210k. Would you be open to a conversation? Thanks, Alex",
     { detect: 'brief', track: 'hiring', offer: ['fulltime'], position: 'senior product designer', location: 'remote', org: 'Northwind', role: 'recruiter', budget: '$180-210k', name: 'Alex' }],
    ['website before launch',
     "Our studio needs a new website before our spring launch. The current site is five years old and doesn't explain what we do. Can you help us design a landing page and a few case study pages? We'd like to start in March.",
     { detect: 'brief', track: 'design', offer: ['website'], timeline: 'March' }],
    ['leadership workshop',
     "I lead product at a mid-size fintech. Our leadership team is misaligned on the roadmap and I'd like to run a two-day design thinking workshop with journey mapping and personas to get everyone on the same page.",
     { detect: 'brief', track: 'design', offer: ['workshop'] }],
    ['agent UX',
     "We're building an AI assistant for insurance adjusters. The LLM part works but users don't trust the agent's suggestions and the interface is confusing. Looking for a designer who has shipped agent UX to help us rethink the experience.",
     { detect: 'brief', track: 'design', offer: ['agentic'], domain: 'AI' }],
    ['founding designer, spatial',
     "We just raised our seed round and are looking for a founding designer to own product design end to end, from research to our design system. We're a spatial computing startup building for Vision Pro.",
     { detect: 'brief', track: 'design', offer: ['e2e'], domain: 'XR' }],
    ['retainer',
     "My company is rolling out AI tools across the sales team and I want ongoing weekly support for the next six months, someone embedded with us who can build custom skills and keep us current. I'm the COO.",
     { detect: 'brief', track: 'coaching', offer: ['retainer'], role: 'COO' }],
    ['build sprint',
     "I have a specific internal tool I want to build with AI and I'd like to do an intensive week or two of pairing with you to actually ship it. I can code a little. Hoping to start in two weeks.",
     { detect: 'brief', track: 'coaching', offer: ['sprint'], timeline: 'in two weeks' }],
    ['audit',
     "We're a 20-person agency and everyone uses ChatGPT differently. I'd like someone to assess our workflows and give us a prioritized action plan for AI. Just a one-time thing to start.",
     { detect: 'brief', track: 'coaching', offer: ['audit'] }],
    ['vague',
     "Hey, I saw your site and I'm interested in working together on something. Not sure exactly what yet, maybe some design, maybe AI stuff. Let's chat?",
     { detect: 'brief' }],
    ['molecular VR (related work)',
     "We're a biotech startup building a VR tool for chemists to explore protein structures together. We need help designing the collaboration features and the hand interactions for headsets.",
     { detect: 'brief', track: 'design', related: 'Nanome', domain: 'XR' }],
    ['short with email',
     'Could you help us with a landing page? We launch soon. sam@acme.co',
     { detect: 'brief', email: 'sam@acme.co', offer: ['website'] }],
    ['consulting on agentic AI (John, 2026-09-28)',
     'i want to hire him for consulting on how to use agentic AI in my business',
     { detect: 'brief', track: 'coaching' }],
    ['command prefix is stripped',
     "message john: we're a small studio building an AI note-taking app and need help with the onboarding design by March",
     { detect: 'brief', track: 'design', timeline: 'March', wordsStartWith: "we're a small studio", offer: ['e2e', 'mvp'] }],
    ['inquire, mid-sentence',
     'I would like to inquire about coaching for my leadership team',
     { detect: 'brief', track: 'coaching' }],
];

// Asked for by name with nothing after it: the card opens as a prompt.
const COMMANDS = ['inquire', 'send a message', 'send john a message', 'message john', 'Message John: ', 'get in touch', 'contact john', 'email john'];

const NEGATIVES = [
    'what did john do at nanome and how did he design the wrist based menu',
    'has john ever worked with robotics companies, and what kind of teleoperation interfaces did he design for them over the years',
    'someone to help my startup with product design',
    'tell me about his experience with XR and AI and what projects he shipped at each company he worked for',
    'why should I hire him for a founding designer role at an AI startup',
    'what does he charge for coaching and how many sessions are in a package',
    'is john available for full-time work and would he relocate to san francisco',
    'should i hire him for a founding designer role',
    'how do i contact him',
    'what does inquire mean',
    'contact',
    'services',
];

// Every quoted query in the existing search test suites.
function harvestQueries() {
    const out = new Set();
    for (const f of fs.readdirSync(HERE)) {
        // The composer's own suites quote its TRIGGERS on purpose; the gate is
        // for every other query the bar has ever been tested with.
        if (!f.endsWith('.mjs') || ['inquirylab.mjs', 'mock-llm.mjs', 'servicetest.mjs', 'phase11-inquiry.mjs', 'relaytest.mjs'].includes(f)) continue;
        const src = fs.readFileSync(path.join(HERE, f), 'utf8');
        for (const m of src.matchAll(/\[\s*'([^'\n]{3,160})'/g)) out.add(m[1]);
        for (const m of src.matchAll(/\.fill\([^,]+,\s*'([^'\n]{3,160})'\)/g)) out.add(m[1]);
        for (const m of src.matchAll(/\bq(?:uery)?\s*[:=]\s*'([^'\n]{3,160})'/g)) out.add(m[1]);
    }
    return [...out];
}

const failures = [];
function check(name, cond, detail) {
    if (!cond) failures.push(name + (detail ? ' — ' + detail : ''));
    return cond;
}
const has = (hay, needle) => String(hay || '').toLowerCase().includes(String(needle).toLowerCase());

// ── embedder (same weights as the site) ──
const { pipeline } = await import(path.join(ROOT, 'node_modules/@huggingface/transformers/src/transformers.js'));
const ex = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
I.setEmbedder(async (t) => (await ex(t, { pooling: 'mean', normalize: true })).data);
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'Assets/search-chunks.json'), 'utf8'));
const vecs = new Map(data.chunks.filter(c => c.vec).map(c => {
    const buf = Buffer.from(c.vec, 'base64');
    const i8 = new Int8Array(buf.buffer, buf.byteOffset, buf.length);
    const v = new Float32Array(i8.length); let n = 0;
    for (let i = 0; i < i8.length; i++) { v[i] = i8[i] * c.vecScale; n += v[i] * v[i]; }
    n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n;
    return [c.id, v];
}));
I.setCorpus(data.chunks, vecs);

console.log('── 1. fixtures');
let fieldHits = 0, fieldTotal = 0;
for (const [label, text, exp] of FIXTURES) {
    const d = I.detect(text);
    const b0 = I.parse(I.stripCommand(text));
    const b1 = await I.refine(b0);
    const v = I.view(b1, {});
    const got = [];
    const f = (name, ok, shown) => { fieldTotal++; if (ok) fieldHits++; else got.push(name + '=' + JSON.stringify(shown)); check(label + ': ' + name, ok, JSON.stringify(shown)); };
    if (exp.detect) f('detect', d === exp.detect, d);
    if (exp.track) f('track', v.track === exp.track, v.track + ' (' + b1.trackBasis + ')');
    if (exp.offer) f('offer', exp.offer.includes(v.offer), v.offer);
    for (const k of ['name', 'org', 'role', 'timeline', 'email', 'budget', 'stage', 'position', 'location']) {
        if (exp[k]) f(k, has(v[k], exp[k]), v[k]);
    }
    if (exp.wordsStartWith) f('command stripped', v.text.startsWith(exp.wordsStartWith), v.text.slice(0, 30));
    if (exp.noStage) f('stage (none stated)', !v.stage, v.stage);   // "no idea where to start" is not a stage
    if (exp.domain) f('domain', v.domains.some(x => has(x, exp.domain)), v.domains);
    if (exp.related) f('related', v.related.some(r => has(r.title, exp.related)), v.related.map(r => r.title + ' ' + r.score));
    console.log(`${got.length ? '  ✗' : '  ✓'} ${label.padEnd(32)} track=${v.track}/${b1.trackBasis} offer=${v.offer || '-'}(${v.offerStrength})${got.length ? '  MISSED ' + got.join(' ') : ''}`);
    if (SHOW_SCORES) console.log('      scores', JSON.stringify(b1._scores.slice(0, 4)), 'related', JSON.stringify(b1.related.map(r => [r.title.slice(0, 24), r.score])));
}
console.log(`   field accuracy ${fieldHits}/${fieldTotal}`);

console.log('── 1b. commands open the prompt');
for (const q of COMMANDS) {
    const ok = I.detect(q) === 'brief' && !I.stripCommand(q).trim();
    check('command opens the prompt: ' + q, ok);
    console.log(`${ok ? '  ✓' : '  ✗'} ${JSON.stringify(q)}`);
}

console.log('── 2. negatives (questions about John)');
for (const q of NEGATIVES) {
    const d = I.detect(q);
    check('negative raised the card: ' + q, d !== 'brief', d);
    console.log(`${d === 'brief' ? '  ✗' : '  ✓'} ${String(d).padEnd(6)} ${q}`);
}

console.log('── 3. false positives across search-tests');
const qs = harvestQueries();
const fp = qs.filter(q => I.detect(q) === 'brief');
check('search-test queries raised the card', fp.length === 0, fp.join(' | '));
console.log(`   ${qs.length} queries, ${fp.length} raised the card${fp.length ? ': ' + fp.join(' | ') : ''}`);

console.log('── 4. message');
{
    const [, text] = FIXTURES[1];
    const v = I.view(await I.refine(I.parse(text)), {});
    const m = I.compose(v, { page: 'services.html' });
    console.log(m.full.split('\n').map(l => '   ' + l).join('\n'));
    check('verbatim words in the body', m.body.includes('operators hate it'));
    check('mailto addressed to John', m.mailto.startsWith('mailto:hi@johnhanacek.com?subject='));
    const long = I.compose(I.view(I.parse(text.repeat(12)), {}), { page: 'x' });
    check('long paragraph clips to the clipboard', long.clipped && long.mailto.length < 1900, long.mailto.length);
}

if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):\n  ` + failures.join('\n  '));
    process.exit(1);
}
console.log('\nALL PASS');
