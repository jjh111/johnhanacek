// Offline fusion lab — real MiniSearch + real MiniLM vectors, tune the merge
import MiniSearch from 'minisearch';
import fs from 'node:fs';

const ROOT = process.env.SITE_ROOT || '/Users/johnhanacek/Documents/GitHub/johnhanacek';
const data = JSON.parse(fs.readFileSync(ROOT + '/Assets/search-chunks.json', 'utf8'));

// identical config to search-core.js
const ms = new MiniSearch({
  fields: ['title', 'content', 'tags'],
  storeFields: ['title', 'page'],
  searchOptions: { boost: { title: 3, tags: 2 }, fuzzy: 0.2, prefix: true }
});
ms.addAll(data.chunks);

const chunkVecs = new Map(data.chunks.map(c => {
  const buf = Buffer.from(c.vec, 'base64');
  const int8 = new Int8Array(buf.buffer, buf.byteOffset, buf.length);
  const v = new Float32Array(int8.length);
  let n = 0;
  for (let i = 0; i < int8.length; i++) { v[i] = int8[i] * c.vecScale; n += v[i] * v[i]; }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return [c.id, v];
}));
const titles = new Map(data.chunks.map(c => [c.id, c.title]));

// query embeddings computed once via transformers (node)
const { pipeline } = await import(ROOT + '/node_modules/@huggingface/transformers/src/transformers.js');
const ex = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// replicate expandQuery's pronoun fallback (intents skipped — offline approximation
// for the noise cases; intent-expanded queries were already validated)
function pronoun(q) { return q.replace(/\b(him|he|his)\b/gi, 'John Hanacek'); }
function strip(q) { return q.replace(/\b(him|he|his|she|her)\b/gi, ' ').replace(/\s+/g, ' ').trim(); }

const EVALS = [
  // [query, expected top-3 ids, mustBeTop1?]
  ['nanome', [5, 37], true],
  ['coaching', [16, 17], true],
  ['earth star', [11], true],
  ['metamedium', [3], true],
  ['fish minigame', [35], true],
  ['prizes he has been given', [21], false],
  ['molecules in virtual reality', [5, 37], false],
  ['someone to help my startup with product design', [4, 18, 41], false],
  ['drawing that becomes software', [3, 35], false],
  ['medical training in headsets', [7, 8], false],
  ['music and visuals performance', [13, 12], false],
  ['science fiction novel', [14], false],
  ['controlling robots remotely', [9], false],
  ['how was this site built', [34, 36], false],
  ['the little fish game on the homepage', [35], false],
  ['his worldview and values', [33], false],
  ['big data in VR goggles', [6], false],
  ['grows plants native to california', [31], false],
  ['word processor design project', [40], false],
  ['telemedicine avatars', [7], false],
  ['what it costs to work with him', [17, 18], false],
  ['papers he has published', [24], false],
];

const cases = [];
for (const [q, expected, top1] of EVALS) {
  const bm25 = ms.search(pronoun(q)).map(r => ({ id: r.id, score: r.score }));
  const bm25s = ms.search(strip(q)).map(r => ({ id: r.id, score: r.score }));
  const qv = (await ex(q, { pooling: 'mean', normalize: true })).data;
  const cosList = [...chunkVecs.entries()].map(([id, v]) => ({ id, c: cos(qv, v) })).sort((a, b) => b.c - a.c);
  cases.push({ q, expected, top1, bm25, bm25s, cosList });
}

function evaluate(fuse, verbose = false) {
  let top3 = 0, top1ok = 0, top1need = 0;
  for (const cse of cases) {
    const merged = fuse(fuse.stripped ? cse.bm25s : cse.bm25, cse.cosList);
    const t3 = merged.slice(0, 3).map(m => m.id);
    const hit3 = t3.some(id => cse.expected.includes(id));
    if (hit3) top3++;
    if (cse.top1) { top1need++; if (cse.expected.includes(t3[0])) top1ok++; }
    if (verbose && !hit3) console.log(`  MISS "${cse.q}" → ${t3.map(id => titles.get(id)).join(' | ')}`);
  }
  return { top3, total: cases.length, top1ok, top1need };
}

// Candidate fusions
const fusions = {
  // A: RRF as shipped
  rrf: (bm25, cosList) => {
    const K = 60, WB = 1.0, WS = 1.15;
    const bR = new Map(bm25.map((r, i) => [r.id, i + 1]));
    const sR = new Map(cosList.map((r, i) => [r.id, i + 1]));
    const cosById = new Map(cosList.map(r => [r.id, r.c]));
    return [...chunkVecs.keys()].map(id => {
      const rb = bR.get(id), c = cosById.get(id) ?? 0, rs = sR.get(id);
      if (!rb && c < 0.30) return null;
      return { id, score: (rb ? WB / (K + rb) : 0) + (rs && c >= 0.25 ? WS / (K + rs) : 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  },
  // B: absolute-BM25 confidence + cosine magnitude (corpus is fixed → abs scores informative)
  mag: (bm25, cosList) => {
    const cosById = new Map(cosList.map(r => [r.id, r.c]));
    const bById = new Map(bm25.map(r => [r.id, r.score]));
    return [...chunkVecs.keys()].map(id => {
      const b = bById.get(id) ?? 0, c = cosById.get(id) ?? 0;
      if (!b && c < 0.30) return null;
      const bConf = Math.min(1, b / 12);        // saturate: exact hits ~1, fuzzy noise small
      const score = bConf + 1.4 * Math.max(0, c);
      return { id, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  },
  // C: like B, different knee/weight
  mag2: (bm25, cosList) => {
    const cosById = new Map(cosList.map(r => [r.id, r.c]));
    const bById = new Map(bm25.map(r => [r.id, r.score]));
    return [...chunkVecs.keys()].map(id => {
      const b = bById.get(id) ?? 0, c = cosById.get(id) ?? 0;
      if (!b && c < 0.30) return null;
      const bConf = Math.min(1, b / 18);
      const score = bConf + 1.2 * Math.max(0, c);
      return { id, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  },
};

fusions.rrfStrip = (bm25, cosList) => fusions.rrf(bm25, cosList);
fusions.rrfStrip.stripped = true;
fusions.rrfStripLow = (bm25, cosList) => {
    const K = 60, WB = 1.0, WS = 1.15;
    const bR = new Map(bm25.map((r, i) => [r.id, i + 1]));
    const sR = new Map(cosList.map((r, i) => [r.id, i + 1]));
    const cosById = new Map(cosList.map(r => [r.id, r.c]));
    return [...chunkVecs.keys()].map(id => {
      const rb = bR.get(id), c = cosById.get(id) ?? 0, rs = sR.get(id);
      if (!rb && c < 0.28) return null;
      return { id, score: (rb ? WB / (K + rb) : 0) + (rs && c >= 0.18 ? WS / (K + rs) : 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
};
fusions.rrfStripLow.stripped = true;

// First: print BM25 score distributions to sanity-check the saturation knee
for (const q of ['nanome', 'prizes he has been given', 'music and visuals performance']) {
  const cse = cases.find(c => c.q === q);
  console.log(`"${q}" BM25 top: ${cse.bm25.slice(0, 4).map(r => `${titles.get(r.id).slice(0, 22)}=${r.score.toFixed(1)}`).join(' | ')}`);
  console.log(`  cos top: ${cse.cosList.slice(0, 4).map(r => `${titles.get(r.id).slice(0, 22)}=${r.c.toFixed(2)}`).join(' | ')}`);
}
console.log();
for (const [name, fuse] of Object.entries(fusions)) {
  const r = evaluate(fuse);
  console.log(`${name}: top3 ${r.top3}/${r.total}, keyword-top1 ${r.top1ok}/${r.top1need}`);
  evaluate(fuse, true);
  console.log();
}
