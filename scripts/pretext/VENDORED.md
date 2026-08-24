# pretext — vendored

Copied verbatim from `openprose/canvas-display/brand/pretext/` (2026-08-24).

Why a copy rather than an import across the boundary: that folder is the
OpenProse client deliverable, snapshotted inside the review-canvas embeds and
governed by the `?v=` bump invariant. Site code reaching into it would couple
the portfolio to a frozen artifact, and would break if the brand set is ever
regenerated. Dependency-free ESM, so a copy costs only disk.

Consumed by `scripts/pretext-wrap.js`, which is dynamically imported and so
costs nothing on pages that do not wrap.
