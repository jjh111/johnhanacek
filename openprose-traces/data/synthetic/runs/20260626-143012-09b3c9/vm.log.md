# run:20260626-143012-09b3c9 livestock-health-memo
root: src/livestock-health-memo.prose.md

1→ [input] week_of ✓
2→ [input] keeper_notes ✓
3→ [input] tank_roster ✓
4→ [input] photo_survey ✓
5→ roster-profiler ✓
6→ ∥start behavior-scout,feeding-scout,photo-scout,water-scout
6a→ behavior-scout ✓
6b→ feeding-scout ✓
6c→ photo-scout ✗ export-incomplete
6d→ water-scout ✓
6→ ∥done
7→ photo-scout ⇒ image-reader (delegate: req-001)
7→   image-reader ✓
7→ photo-scout ⟳ (resumed)
8→ photo-scout ✓
9→ husbandry-compiler ✓
---end 2026-06-26T14:41:48Z
