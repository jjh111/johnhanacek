# HANDOFF · OpenProse case study → jhsite

Context for the agent working in the johnhanacek repo. This folder is a
portable, self-contained cut of the OpenProse founding-design case study,
generated from the design-iteration repo (`JHWorking/scripts/build-site-cut.mjs`).
Everything it needs is inside this folder; nothing reaches outside it except
font CDNs (Google Fonts + Kecal via jsDelivr) and outbound links.

## What this is

> Companion: `MIRROR.md` (beside this file) — JH's copy + layout editing
> surface for openprose.html. Read its header before touching page copy.

- `openprose.html` — the case study ("Design Exploration · OpenProse ×
  JHDesign"). THE deliverable. One page: WebGL reflection hero, seven
  sections (I The Brief … VII Conclusion), live exhibit embeds throughout.
  It sits at the SITE ROOT per the jhsite case-study convention (like
  nanome2.html); everything it references lives namespaced inside
  `openprose/` so nothing collides with the site's own Assets/, styles/,
  scripts/.
- `openprose/canvas-display/` — the JHDesign Canvas, a self-contained display cut of
  the review tool with 37 live brand experiments. The case study embeds it
  filtered per section (`canvas-display/?v=N&items=…`) and whole in the
  colophon. `items.js` is GENERATED (sorted by git first-commit date, oldest
  first — the ordering is the story); do not hand-edit it.
- `openprose/Assets/`, `openprose/page-assets/`, `openprose/_*.css` — only
  the files the page references (traced closure).
- Source of truth stays in the design-iteration repo. Structural regeneration
  happens there and re-ships by overwriting this folder; this HANDOFF rides
  along. Verbiage/chrome iteration HERE is fine and expected — tell JH so
  changes can be folded back upstream.

## Hard invariants (do not break)

1. **Confidentiality**: the OpenProse engagement has a second, confidential
   track (trace visualization, RLM, customer data). NOTHING from it may appear
   here. This cut was built under a whitelist; if you ever regenerate or add
   exhibits, nothing outside brand explorations may be served. This repo is
   public and served — treat any mention of trace/customers as a leak.
2. **No em dashes in visible copy** (JH rule). Use commas, periods, or ·.
3. Header style is `[roman numeral] [Title Case]`, no dot separator
   (e.g. "II The Tooling"). No colored left-border callouts anywhere.
4. `openprose.html` currently carries `noindex, nofollow` per the jhsite
   unlisted-page convention. Remove it only at release (when the page enters
   nav/sitemap), and set the canonical URL + OG tags to
   https://www.johnhanacek.com/openprose.html at the same time.
5. Bump the `?v=N` query on all `openprose/canvas-display/` references whenever
   anything inside `canvas-display/` changes (it is a cache-buster; keep the
   number consistent across the page).

## Fragile machinery (why it is the way it is)

- **WebGL hero**: the canvas draws sky + water; the page's layer ladder is
  canvas z:1 < main z:2 (plain stacking context) < nav z:50. Do NOT add
  `will-change` to main (checkerboards black on fast scroll) or any
  viewport-scale `backdrop-filter` (re-snapshots the animating canvas every
  frame = flicker). On WebGL context loss the hero falls back to the still
  photograph by design.
- **Embed lifecycle**: embeds sleep by element REMOVAL under a live cap and
  wake near the viewport. This keeps total WebGL contexts under the browser's
  per-tab limit. Don't force embeds eager; don't raise the cap casually.
- **Pointer events**: `main` is pointer-events:none so lake clicks pass
  through to the hero; interactive subtrees re-enable themselves. If you add
  an interactive element inside the frosted sections, it must opt in
  (see the `.sections-frosted … { pointer-events: auto }` block).
- Serve from the SITE root (openprose.html's own directory). Relative paths
  assume it; `openprose/canvas-display/?v=N` relies on directory index.html.

## Adding jhcom chrome (guidance, not prescription)

- The page has its own top chrome: a fixed canonical-mark disc (top-left,
  second dark-mode toggle) and a ◐ mode toggle (top-right), plus a scroll
  progress bar. A fixed `<jh-nav>` would collide with these — prefer framing
  over injecting: either give the case study a minimal entry/exit (a small
  "← johnhanacek.com" link zone and the `<jh-footer>` after the colophon), or
  mount jh-nav only after redesigning the disc placement with JH.
- The natural jhsite home is a Design subpage (the nanome2.html precedent).
- The page manages its own dark/light mode (`data-mode` on `<html>`,
  localStorage key `openprose-canonical-mode`) — independent from any jhsite
  theme system; don't cross-wire them without JH.
- Fonts are page-local (IBM Plex via Google, Kecal via jsDelivr, OFL). Do not
  swap in jhsite fonts (Cinzel/Raleway) — the typography IS the case study.

## Open items JH knows about

- `openprose/page-assets/case-study/review-canvas-loop.mp4` does not exist
  yet — the §II film band is PARKED (cs-figure[hidden]) until JH films it.
  Its 404 is expected; un-hide the band when the capture lands.
- JH is doing a final verbiage pass; expect copy edits here.
- Kecal loads from jsDelivr; self-hosting is allowed (OFL) if jhsite prefers.

## Quick QA after any change

1. Serve the folder, open index.html: zero horizontal scroll at 375/768/1440.
2. Cross-frame resource scan: no 4xx except the known mp4.
3. Scroll the full page: hero ripples answer the cursor, embeds wake near the
   viewport and sleep when far, colophon canvas opens with 37 items oldest→newest.
