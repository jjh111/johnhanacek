# Agent Reference — Implementation Index
*Last updated: July 2026*

**→ [V2_RELEASE_PLAN.md](./V2_RELEASE_PLAN.md) is the single source of truth** for milestones,
decisions, and doc dispositions. This index is just a map of what lives in this folder.

Completed plan docs get moved to `Archive/` (SEARCH_OVERLAY and ART_EARTHSTAR live there now).

---

## Active plan docs (dispositions from the V2 plan)

| File | Milestone | Summary |
|------|-----------|---------|
| [V2_RELEASE_PLAN.md](./V2_RELEASE_PLAN.md) | — | The roadmap: v1.7 ✅ → v1.8 engine → v1.9 fish maze → v2.0 release |
| [FISH_DESIGN_MERGE.md](./FISH_DESIGN_MERGE.md) | **v1.9** | Fish maze in design.html: shapes-as-walls, squiggle erase (flagship) |
| [FISH_V15_FIXES.md](./FISH_V15_FIXES.md) | **v1.8** | Loop recognition, standoff fix, coral avoidance — fold into engine extraction |
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
  canonicals, version single-source (now `SITE.version` in `scripts/jh-chrome.js` → site at v1.11)
- ✅ House cleanup: invoice scrubbed from history, ~75MB junk/private files pruned, videos compressed
- 🔄 **Next: v1.8 Unified Canvas Engine** — extract `scripts/shape-detection.js` +
  `scripts/fish-engine.js`, seeded from `fish-demo/fish.js`; snapshot frozen design.html first
- Then: v1.9 Fish Maze (the flagship release), v2.0 QA/polish/tag
