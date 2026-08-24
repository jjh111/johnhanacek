#!/usr/bin/env node
// ============================================
// build-chunk-vectors.mjs — dev-time chunk embedding
// ============================================
// Embeds every chunk in Assets/search-chunks.json with the SAME model +
// dtype the browser's semantic tier uses (Xenova/all-MiniLM-L6-v2 at q8 —
// see Agent Reference/SEARCH_EMBEDDER_RESEARCH.md), quantizes each vector
// to int8, and writes it back as base64 (`vec`) + a dequant scale
// (`vecScale`). ~0.5 KB per chunk; chunk↔chunk similarity in the browser
// costs the visitor zero download.
//
// Run after editing chunk text:   node scripts/build-chunk-vectors.mjs
// Dependency (gitignored):        npm install --no-save @huggingface/transformers
//
// Also embeds the `hints` exemplar phrases of any registered commands file
// passed as argv[2] (future use — Phase 3 actions are registered per-page
// in JS, so their hints embed here only if exported to a JSON file).

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHUNKS_PATH = path.join(ROOT, 'Assets', 'search-chunks.json');
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let pipeline;
try {
    ({ pipeline } = await import('@huggingface/transformers'));
} catch {
    console.error('Missing dependency. From the repo root run:\n  npm install --no-save @huggingface/transformers\n(node_modules is gitignored — the site itself stays zero-build.)');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(CHUNKS_PATH, 'utf8'));

console.log(`Loading ${MODEL_ID} (q8, same weights the browser fetches)...`);
const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });

function quantize(vecF32) {
    let maxAbs = 0;
    for (const v of vecF32) maxAbs = Math.max(maxAbs, Math.abs(v));
    const scale = maxAbs / 127 || 1;
    const int8 = new Int8Array(vecF32.length);
    for (let i = 0; i < vecF32.length; i++) int8[i] = Math.round(vecF32[i] / scale);
    return { b64: Buffer.from(int8.buffer).toString('base64'), scale };
}

let dims = 0;
for (const chunk of data.chunks) {
    const text = `${chunk.title}. ${chunk.tags}. ${chunk.content}`;
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    const vec = Array.from(out.data);
    dims = vec.length;
    const { b64, scale } = quantize(vec);
    chunk.vec = b64;
    chunk.vecScale = Number(scale.toPrecision(6));
    process.stdout.write(`  ${String(chunk.id).padStart(2)} ${chunk.title}\n`);
}

data._meta.embedding = {
    model: MODEL_ID,
    dims,
    dtype: 'q8',
    quant: 'int8-base64',
    generated: new Date().toISOString().slice(0, 10),
};

fs.writeFileSync(CHUNKS_PATH, JSON.stringify(data, null, 2) + '\n');
console.log(`\nWrote ${data.chunks.length} vectors (${dims} dims) into ${path.relative(ROOT, CHUNKS_PATH)}`);
