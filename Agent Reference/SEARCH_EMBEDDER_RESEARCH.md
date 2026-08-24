# In-browser embedding model — findings and choice

Research done 2026-08-24 for the SEARCH_COMMAND_BAR Phase 2 semantic tier.
Everything measured, not quoted: sizes from the Hugging Face API
(`?blobs=true`), Transformers.js behavior from the actual 4.2.0 dist on
jsdelivr. MB = bytes/10⁶. "Quantized total" = the exact files a
Transformers.js 4.2.0 WASM load fetches on its default path.

**Decision: `Xenova/all-MiniLM-L6-v2` — 23.7 MB total, 384 dims, zero
dtype configuration.** WASM backend, so it runs everywhere including iOS
Safari (where the WebGPU generation tier is deliberately disabled).

| repo | quantized total | fp32 | dims | notes |
|---|---|---|---|---|
| **Xenova/all-MiniLM-L6-v2** | **23.69 MB** | 90.4 | 384 | 6 layers; clean single-file `onnx/model_quantized.onnx` (22.97) + tokenizer.json (0.71) |
| Snowflake/snowflake-arctic-embed-xs | 23.69 MB | 90.4 | 384 | official repo is already onnx-ready; ties MiniLM exactly (same 6-layer BERT geometry) |
| Xenova/bge-small-en-v1.5 | 34.73 MB | 133.1 | 384 | 12 layers — 2× the depth, slower on WASM |
| onnx-community/embeddinggemma-300m-ONNX | 331.0 MB | 1,235 | 768 | too big, as expected; its tokenizer.json alone is 20.3 MB |
| minishlab/potion-base-8M (Model2Vec) | — | 30.2 | 256 | see below |

## Transformers.js 4.2.0 facts (verified in the dist)

- `feature-extraction` pipeline supported.
- Default dtype is fp32 with a device override map `{wasm: q8}` — so a WASM
  load fetches `onnx/model_quantized.onnx` with **no dtype argument at all**.
- Suffix map confirmed: `q8 → "_quantized"`, `int8 → "_int8"`, etc.

## Traps found (the reason this doc exists)

1. **`onnx-community/all-MiniLM-L6-v2-ONNX` has NO quantized file.** Only
   fp32/fp16/q4/q4f16, all in external-data format — the WASM q8 default
   404s outright. The `Xenova/` repo is the correct one. (Same trap class
   as the vision-encoder finding in SEARCH_MODEL_RESEARCH.md: the obvious
   repo name is the wrong repo.)
2. **Model2Vec/potion has no browser runtime.** Transformers.js 4.2.0 has
   zero support for `model_type: "model2vec"` (grepped the dist), npm has
   no official package, and the community `@yarflam/potion-*` packages are
   Node-only (`fs/promises` imports). The algorithm is ~15 KB of trivial JS
   (WordPiece lookup → mean-pool → normalize) so a browser port is possible
   later — but 30 MB fp32 assets vs MiniLM's 23.7 MB quantized means it
   isn't even smaller today. Parked.

## How it ships (Phase 2 implementation)

- **Chunk vectors are precomputed** by `scripts/build-chunk-vectors.mjs`
  (dev-time, like sync-version.mjs; deps via `npm install --no-save
  @huggingface/transformers`, node_modules is gitignored) and stored in
  `Assets/search-chunks.json` as int8-quantized base64 (`vec` + `vecScale`
  per chunk, ~0.5 KB each). Chunk↔chunk similarity therefore costs the
  visitor **zero** download.
- **The query-side embedder** (the 23.7 MB) lazy-loads in the background on
  the first real search interaction; until it's ready, BM25 + intents serve
  alone, and results upgrade in place when it arrives. Load failure = silent
  BM25-only, per the graceful-degradation rule.
- Build and browser both pin `dtype: "q8"` so chunk and query vectors come
  from identical weights.

## Still open (John's QA gates)

- Real-device latency: headless numbers are not representative (same caveat
  as SEARCH_MODEL_RESEARCH). Measure first-embed and per-query embed time
  on the actual laptop + an iPhone before calling the tier shippable.
