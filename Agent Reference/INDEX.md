# Agent Reference — Implementation Index
*Last updated: March 2026*

Feature plans for the John Hanacek portfolio site, organized by priority and dependency.

---

## Implementation Order

### Search Features (sequential — each builds on the previous)

| # | File | Status | Summary |
|---|------|--------|---------|
| 1 | [SEARCH_OVERLAY.md](./SEARCH_OVERLAY.md) | **ACTIVE** | ⌘K command palette overlay on every page + hero search input |
| 2 | [SEARCH_ENRICHMENT.md](./SEARCH_ENRICHMENT.md) | Next | Rich result cards (video, 3D model-viewer, links) + chunk data |
| 3 | [SEARCH_COMMANDS.md](./SEARCH_COMMANDS.md) | Planned | Intent router — services/contact/schedule action cards |
| 4 | [SEARCH_HYBRID.md](./SEARCH_HYBRID.md) | Planned | WebGPU draft → local model refinement pipeline |

### Independent Features (any order after search is stable)

| # | File | Status | Summary |
|---|------|--------|---------|
| 5 | [FISH_DESIGN_MERGE.md](./FISH_DESIGN_MERGE.md) | Planned | Fish ecosystem in design.html + maze walls + erase gesture |
| 6 | [FISH_V15_FIXES.md](./FISH_V15_FIXES.md) | Planned | Loop recognition, standoff fix, coral avoidance scaling |
| 7 | [PLAYGROUND_CLEANUP.md](./PLAYGROUND_CLEANUP.md) | Planned | Cull stub cards, caustic fix, zoom/trackpad, iframe unload |
| 8 | [ART_EARTHSTAR.md](./ART_EARTHSTAR.md) | Planned | Add EarthStar painting to art.html |

### Existing Reference Docs (context, not actionable plans)

| File | Purpose |
|------|---------|
| [LLM_SEARCH_INTEGRATION_PLAN.md](./LLM_SEARCH_INTEGRATION_PLAN.md) | 3-tier architecture overview, vision chunking, model state |
| [METAMEDIUM_CONVERGENCE.md](./METAMEDIUM_CONVERGENCE.md) | Cross-repo synthesis with MetaMedium |
| [ART_HERO_ENHANCEMENT_PLAN.md](./ART_HERO_ENHANCEMENT_PLAN.md) | Art page cosmic canvas enhancement |

---

## Dependency Graph

```
SEARCH_OVERLAY ──→ SEARCH_ENRICHMENT ──→ SEARCH_COMMANDS
       │                                        │
       └──→ SEARCH_HYBRID                       │
                                                 │
                                    (all search features complete)

FISH_DESIGN_MERGE ──→ FISH_V15_FIXES  (sequential)

PLAYGROUND_CLEANUP                     (independent)
ART_EARTHSTAR                          (independent)
```

## Current State (March 2026)

**Completed:**
- ✅ `search.html` — standalone search page with full 3-tier AI search
- ✅ Search magnifying glass icon in nav on all 7 pages
- ✅ Test pages archived at `Assets/demos/`
- ✅ CLAUDE.md rewritten with correct sitemap

**Active:**
- 🔄 Search Overlay — extract + embed as site-wide overlay
