# Agent Reference — Implementation Index
*Last updated: July 2026*

**→ [V2_RELEASE_PLAN.md](./V2_RELEASE_PLAN.md) is the single source of truth** for milestones,
decisions, and doc dispositions. This index is just a map of what lives in this folder.

Completed plan docs get moved to `Archive/` (SEARCH_OVERLAY and ART_EARTHSTAR live there now).

---

## Active plan docs (dispositions from the V2 plan)

| File | Milestone | Summary |
|------|-----------|---------|
| [V2_RELEASE_PLAN.md](./V2_RELEASE_PLAN.md) | — | The roadmap: v1.7 ✅ → v1.8 engine ✅ → v1.9 fish maze ✅ → v2.0 release |
| [SEARCH_ENRICHMENT.md](./SEARCH_ENRICHMENT.md) | **v2.0** | Rich result cards (video, 3D model-viewer, linked titles) on the live overlay |

## Deferred (v2.1+, per V2 plan)

| File | Summary |
|------|---------|
| [SEARCH_COMMANDS.md](./SEARCH_COMMANDS.md) | Intent router — services/contact/schedule action cards |
| [SEARCH_HYBRID.md](./SEARCH_HYBRID.md) | WebGPU draft → local model refinement pipeline |
| [ART_HERO_ENHANCEMENT_PLAN.md](./ART_HERO_ENHANCEMENT_PLAN.md) | Art page cosmic canvas enhancement (star layers, Web Audio) |
| [MULTIPLAYER_CURSORS_PLAN.md](./MULTIPLAYER_CURSORS_PLAN.md) | Live visitor cursors on hero canvas (needs server infra — PartyKit) |
| [PLAYGROUND_CLEANUP.md](./PLAYGROUND_CLEANUP.md) | **Dropped** — superseded by the future jh-deng-template playground rebuild |

## Reference docs (context, not actionable plans)

| File | Purpose |
|------|---------|
| [LLM_SEARCH_INTEGRATION_PLAN.md](./LLM_SEARCH_INTEGRATION_PLAN.md) | 3-tier search architecture overview, vision chunking, model state |
| [METAMEDIUM_CONVERGENCE.md](./METAMEDIUM_CONVERGENCE.md) | Cross-repo synthesis with MetaMedium |

---

## Current state (July 2026)

- ✅ v1.7 "Foundation & Coherence" shipped: `<jh-nav>`/`<jh-footer>` components, robots/sitemap/
  canonicals, version single-source (`SITE.version` in `scripts/jh-chrome.js`)
- ✅ House cleanup: invoice scrubbed from history, ~75MB junk/private files pruned, videos compressed
- ✅ **v1.8 "Unified Canvas Engine" shipped**: `scripts/shape-detection.js` (index + design consume)
  and `scripts/fish-engine.js` (`FishCanvas` full minigame on index; `FishCanvas.ambient` cursor
  fish on 404); frozen design.html snapshotted to `Archive/design-blueprint-frozen.html`.
  FISH_V15 fixes, teleport rescue, and TUNING phases 14–21 verified present in the engine
  (V15/behavior docs → Archive). `fish-demo/` unchanged — compiled bundle, source is local-only.
- ✅ **v1.9 "Fish Maze" shipped (site v1.13)**: living cyan line-art fish on design.html's
  fullscreen blueprint canvas — draw shapes for walls (engine obstacles + fish shelter),
  loops for fish, taps for food, squiggle to erase (amber burst). Engine embedded mode added
  (processStroke/addFood/setObstacles). FISH_DESIGN_MERGE → Archive.
- 🔄 **Next: v2.0 release** — Search Enrichment + QA/accessibility/cross-browser polish + tag
