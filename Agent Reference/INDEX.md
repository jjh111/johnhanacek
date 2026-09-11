# Agent Reference — Implementation Index
*Last updated: 2026-09-10*

**→ [V3_RELEASE_PLAN.md](./V3_RELEASE_PLAN.md) is the single source of truth** for
milestones, decisions, and sequencing. [V2_RELEASE_PLAN.md](./V2_RELEASE_PLAN.md)
is the historical record of the v2 arc. This index is just a map of what lives
in this folder.

---

## The roadmap

| File | Role |
|------|------|
| [V3_RELEASE_PLAN.md](./V3_RELEASE_PLAN.md) | **THE plan.** P0 "Employable" → P1 "Proof" → P2 v3.0 "Data-Driven Site"; standing doctrines, John's decision queue, housekeeping ledger, gate baseline (2026-09-10) |
| [V2_RELEASE_PLAN.md](./V2_RELEASE_PLAN.md) | Historical: v1.7 → v2.0 (tagged 2026-08-30) |
| [CHUNK_AUDIT.md](./CHUNK_AUDIT.md) | Evidence table for every chunk claim — new/edited chunks land with their audit section |

## Build records (current work)

| File | Role |
|------|------|
| [SEARCH_COMMAND_BAR.md](./SEARCH_COMMAND_BAR.md) | The command bar's umbrella spec + build records, Phases 1–10 (postcard, scene language, continuity, pieces, truth audit) |
| [PLAYGROUND_CANVAS_PLAN.md](./PLAYGROUND_CANVAS_PLAN.md) | Playground review-canvas plan of record — built on the OpenProse engine; manifest in `scripts/playground-items.js` |

## Handoffs

| File | Role |
|------|------|
| [SEARCH_HANDOFF.md](./SEARCH_HANDOFF.md) | Search-side handoff notes (search-core/hybrid/overlay sessions) |
| [FISH_MAZE_HANDOFF.md](./FISH_MAZE_HANDOFF.md) | Fish-maze / engine handoff notes |

## Reference (context, not action)

| File | Purpose |
|------|---------|
| [CONTROL_SURFACES.md](./CONTROL_SURFACES.md) | Exhaustive inventory of exposed controls/APIs for compound commands (Aug 2026 audit) |
| [LLM_SEARCH_INTEGRATION_PLAN.md](./LLM_SEARCH_INTEGRATION_PLAN.md) | 3-tier search architecture overview, vision chunking, model state |
| [SEARCH_EMBEDDER_RESEARCH.md](./SEARCH_EMBEDDER_RESEARCH.md) | Tier-0.5 embedder choice + HF repo traps |
| [SEARCH_MODEL_RESEARCH.md](./SEARCH_MODEL_RESEARCH.md) | Tier-1 model numbers: LFM2.5 swap, Qwen prefill, Safari's WebGPU hole |
| [METAMEDIUM_CONVERGENCE.md](./METAMEDIUM_CONVERGENCE.md) | Cross-repo synthesis with MetaMedium |

## Superseded / deferred (kept for the record)

| File | Status |
|------|--------|
| [SEARCH_COMMANDS.md](./SEARCH_COMMANDS.md) | SUPERSEDED by SEARCH_COMMAND_BAR Phase 3 |
| [SEARCH_ENRICHMENT.md](./SEARCH_ENRICHMENT.md) | PARTIALLY ABSORBED — `url`/anchors + media pieces shipped; kept for lineage |
| [SEARCH_HYBRID.md](./SEARCH_HYBRID.md) | DEFERRED — revisit only if Tier-1 answer quality disappoints |
| [DESIGN_REFRESH_PLAN.md](./DESIGN_REFRESH_PLAN.md) | MERGED — the "Daylight" branch was fully merged; worktree deleted 2026-09-10 |
| [ART_HERO_ENHANCEMENT_PLAN.md](./ART_HERO_ENHANCEMENT_PLAN.md) | INHERITED, unreconciled — decide revive / cherry-pick / drop (V3 plan) |
| [MULTIPLAYER_CURSORS_PLAN.md](./MULTIPLAYER_CURSORS_PLAN.md) | INHERITED, unreconciled — decide (V3 plan) |

## Test suites

| Dir | Role |
|-----|------|
| [`maze-tests/`](./maze-tests/README.md) | Fish engine + maze + chrome: contrast, navfit, service funnel, site load, behavior soaks |
| [`search-tests/`](./search-tests/README.md) | Command bar: phases 1–10, anchorcheck, quoteqa, labs |

Browser resolution: `CHROMIUM_PATH || chromium.executablePath()` — `npm install && npm run browsers`
once from the repo root. Post-push: `node scripts/check-live.mjs`.

---

## Current state (2026-09-10)

- ✅ v2.0 released and tagged 2026-08-30; the v2.07–v2.10 arc since.
- ✅ v2.5 Funnel phases A–D merged (chooser shipped); v2.09 P0 batch merged (anchors 16→3, token purge, Blok Dok, How I Work).
- ✅ v2.10 "One Pair" closed: 141 family literals → `--font-mono`/`--font-display`, version stamp shipped, full build record in the V3 plan.
- ✅ Toolchain resolved: pinned browsers installed (1.62.1 → chromium-1234), 38 suites/rigs resolve via playwright, `scripts/check-live.mjs` verifies every deploy.
- ✅ Gate baseline 2026-09-10: contrasttest 0 AA · navfittest green both engines · servicetest green · quoteqa clean · anchorcheck 3 (John-blocked). One known red: sitetest art.html Vimeo 401 (re-host decision).
- ⏳ Next: P1 "Proof" (playground curation, compiled case-study outcomes), then P2 v3.0.
- **John-blocked:** coaching outcomes (v2.5 E), teamready headers, "how I think" chunk marks, GoatCounter code, Vimeo re-host, personal chunks 30–32, history rewrite.
