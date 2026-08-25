# Design Refresh Plan — "Daylight" (proposed v2.1)

> Status: IN PROGRESS on branch `worktree-daylight` (isolated worktree — parallel sessions
> own search.* and the new playground page; every search-related edit in this plan is
> DEFERRED until that work lands and this branch merges).
> Author: audit synthesized Aug 2026 from shared.css/jh-chrome.css read,
> a per-page inline-CSS audit, and a design-language audit of openprose.html.
> Goal: modernize the Deep Sea Terminal system — clearer layout, larger content type,
> real layout control, and a site-wide light/dark mode — importing the *mechanics* that
> made the OpenProse case study work, not its look. OpenProse keeps its own identity.

## Why now

The site's design system predates the OpenProse build, and the gap shows. OpenProse got:
semantic tokens with an alpha ink ramp, attribute-driven theming with a no-FOUC bootstrap,
ch-based measures, one container token, and a documented layer/pointer-events discipline.
The main site has: a thin token layer full of raw `rgba()` literals, body copy that dips to
12.5px, four ad-hoc container widths, six breakpoints, and no theming capability at all.

---

## Audit findings

### A. Content type is too small
- `--text-base` is 1.05rem but **drops to 0.9rem (14.4px) under 768px** (`shared.css:1497`)
  — every token-based body size on mobile lands below 15px.
- index.html featured prose is raw-rem and tiny: `.featured-text p` 0.82rem,
  `.featured-quote` 0.78rem `!important`, cards 0.8rem, CTA 0.72rem (index.html:189–228).
- services.html + writing.html use `--text-sm` (14.4px) as *body copy*, not labels.
- search.html runs its own un-tokenized scale, mostly 9–13px; result snippets at 13.1px,
  AI answer prose at 14.1px, floors at 0.55rem.
- Compare OpenProse: `--fs-body: 1.1rem`, line-height 1.7, **no mobile shrink** (no
  font-size on html/body at all, so browser prefs are honored).

### B. Layout has no spine
- No content-width token. `main` is a bare 800px → 900 → 1100 → 1300px by breakpoint;
  pages invent 600 / 660 / 780 / 960px on top. OpenProse: one `--content-max` on three inners.
- **`.columns-2` means two different layout engines**: CSS multi-column in shared.css:886,
  re-implemented as Grid in design.html:409 (explicitly unsetting the shared one).
  services.html uses the shared version. Same class, different algorithm per page.
- Six breakpoints in use (480/500/600/640/768/900) with no shared definition.
- Card vocabulary is a grab-bag: `.content-card`, `.card-featured`, `.card-standard`,
  `.card-logo-left`, `.card-featured-split(.compact)`, `.grid-1..4`, `.card-grid` —
  with no hierarchy rule for when to use which.

### C. Theming is currently impossible
- **~120 inline `rgba()` palette literals** across pages freeze translucent surfaces to the
  dark palette (`rgba(77,201,246,…)`, `rgba(2,10,18,…)`, plus off-palette strays
  `rgba(10,22,40,…)` ×6, `#1a1a2e`, `#666`, `#10b981`). shared.css/jh-chrome.css have dozens more.
- **search.html re-declares `:root`** (search.html:52–71) with *drifted* values
  (`--sea-mid: #0a1628` vs real `#051018`; `--text-primary: #a8d0e4` vs `#8cb8cc`).
  A theme applied at `:root` is clobbered on this page.
- Canvases paint the dark background into pixels: blueprint `bg:'#020a12'`
  (design.html:1212), cosmos `#020a12` + white stars (art.html:582–659). The fish engine's
  palette lives in `scripts/fish-engine.js`.
- index.html's QR reveal card is a hard-coded *light* component (`rgba(255,255,255,…)`)
  that will invert wrongly under a real light theme.
- Bugs found in passing: fallbacks to a token that doesn't exist — `var(--text-muted, …)`
  (services.html:158, 212) — so the literal always wins and will never theme.
  (The audit also flagged an "invalid hex `#10024`" at art.html:266 — false positive,
  it's the HTML entity `&#10024;` ✨ in the hero hint.)

### D. Duplication & drift
- `.canvas-toggle` / `.toggle-switch` / `.info-btn` — **~75 lines byte-identical** in
  index.html:78–153 and design.html:276–360; neither in shared.css. index.html also
  re-declares `.canvas-controls` verbatim from shared.css.
- `.demo-container` defined independently (design.html vs nanome2.html, different values).
- writing.html loads **no stylesheet at all** — re-declares the whole palette/scale inline
  (values match today; nothing enforces it).
- `font-family: 'JetBrains Mono'` restated ~20× despite being the body default.

### E. What to import from OpenProse (mechanics, not look)
1. **Attribute-driven theming**: `html[data-mode]`, render-blocking head bootstrap (no FOUC),
   `prefers-color-scheme` default, **persist only on explicit toggle** (device preference is
   never frozen into storage), `<meta name="theme-color">` per scheme, `color-scheme` meta,
   MutationObserver so canvases re-derive palettes on flip.
2. **Alpha ink ramp**: `--ink`, `--ink-2..5` as alpha-on-paper, `--rule` for borders — this is
   what makes translucent surfaces theme correctly. Replaces the raw-rgba habit wholesale.
3. **Semantic accent binding**: every accent reads one pair (`--accent-ink`/`--accent-ink-deep`)
   so a theme repoints one token, not fifty rules.
4. **Measure-based layout**: one `--content-max`, prose at 62–78ch, headings `max-width: 22ch`
   + `text-wrap: balance`, ledes `text-wrap: pretty`.
5. **Section kickers** (numbered eyebrow labels) as the page-structure device.
6. **Card recipe**: `color-mix(in srgb, var(--surface-elev) 80%, transparent)` + `--rule`
   border + hover lift — one recipe, reused.
7. **Focus contract**: 2px accent outline at 3px offset; box-shadow ring for round chrome;
   44px touch targets via negative-margin padding.

---

## Design direction

**The identity stays Deep Sea Terminal.** Cinzel/Raleway/JetBrains Mono, cyan + gold, the
fish, the glass. The refresh modernizes the *execution*: bigger type, one layout spine,
tokens that can theme.

**The light theme is "Shallows"** — the same sea in daylight, not OpenProse's warm paper
(that stays OpenProse's own). Seed palette already exists in writing.html's light mode:
paper `#f8f5f0`-family ground, accents *darkened* not inverted (`--cyan → #2a6b8a`,
`--gold → #9a7b2a`). Recommend shifting the ground cool (`#f2f6f8`-ish "sea glass" paper)
to keep it the same world as the dark theme; exact values to be tuned in Phase 4 against
WCAG AA.

---

## Phases

### Phase 1 — Token foundation (theme-ready) · ~1 day
Everything else rides on this. No visual change.
- In jh-chrome.css `:root`, add the semantic layer: `--surface` / `--surface-elev` /
  `--surface-glass` (the glass-section fill), `--ink` + `--ink-2..4` alpha ramp, `--rule`,
  `--accent-ink` / `--accent-ink-deep` (→ cyan/gold today), plus RGB triplets
  (`--cyan-rgb: 77, 201, 246` etc.) for the legacy rgba sweeps that can't move to the ramp yet.
  Keep the old names as aliases so nothing breaks mid-migration.
- **Delete search.html's `:root` block** and reconcile its three drifted values.
- Fix the bad fallbacks (`--text-muted` → `--muted`) and the `#1a1a2e`/`#666` strays.
  (`#10b981` stays: the diagram-caption green deliberately matches the color the MetaMedium
  canvas draws its CANVAS label in — the pair migrates together in Phase 4.)
- Add `--content-max` and a blessed breakpoint set (recommend 480 / 768 / 980 / 1400;
  retire 500/600/640/900 as pages get touched).

### Phase 2 — Type scale up · ~1 day
- Raise `--text-base` to **1.1rem**; **delete the 768px `--text-base: 0.9rem` downgrade**
  (keep the spacing shrink; type stays full-size on mobile).
- Retire sub-16px *prose*: index featured section → tokens (kill the `!important`);
  services `.os-strip-desc`/`.step-node` → `--text-base`; search result snippets + AI answer
  → tokens. The label tier (0.68–0.8rem uppercase/tracked) survives — for kickers, captions,
  badges only. Rule of thumb: **if it's a sentence, it's ≥ `--text-base`.**
- Headings go fluid: h2 `clamp(1.8rem, 3.4vw, 2.6rem)` in Raleway (promote h2 out of the
  small mono-uppercase treatment; the mono `›` rule-line becomes the kicker style, not the
  heading), `text-wrap: balance`, `max-width: 22ch`. h3/h4 rescale to match.
- Prose measure: `p { max-width: 66ch }` (replacing `max-content`), ledes `text-wrap: pretty`.

### Phase 3 — Layout clarification · ~1–1.5 days
- `main` and section inners read `--content-max`; ad-hoc widths (600/660/780/960) collapse
  onto it or onto `--measure`.
- **Resolve the `.columns-2` collision** — bless the Grid version, rename or retire the
  multi-column one.
- Simplify the card vocabulary to three tiers (featured / standard / row) + one grid pattern
  (`repeat(auto-fit, minmax(…, 1fr))` where count doesn't matter); document when each is used.
- Section rhythm tokens: `--section-pad-block` with the 3-tier responsive step
  (5rem → 4.5rem → 3.5rem, à la OpenProse).
- **Extract the duplicated canvas chrome** (`.canvas-toggle`/`.toggle-switch`/`.info-btn`)
  into shared.css; delete index.html's `.canvas-controls` re-declaration; unify `.demo-container`.
- Numbered section kickers on the long pages (about, services, design) as the structure device.

### Phase 4 — Light/dark mode · ~2–3 days (the lift)
> **Status: mechanism + controls + first-pass "Shallows" palette SHIPPED** (pulled forward
> at John's request): head bootstrap on the 7 standard pages, `jh-theme` key, OS-following,
> three controls (nav sig top-left, nav glyph far right, hero glass pill upper-right — all
> from jh-chrome.js; suppressed on openprose via its `data-mode` marker). shared.css +
> jh-chrome.css rgba literals swept onto the -rgb triplets. **Remaining:** canvas light
> palettes (fish engine / blueprint / cosmos listen for `jh-theme-change`), page-inline
> literal sweeps, search.html + writing.html alignment post-merge, palette tuning to AA.
> Canvas-anchored chrome (hero shape-nav pill, canvas-guide, hero toggle) deliberately
> keeps deep-sea colors until the canvases theme.
- **Mechanism** (adopt OpenProse's, align writing.html):
  - `data-theme` on `<html>`; storage key **`jh-theme`** (writing.html's existing key);
  - render-blocking bootstrap in `<head>` of every page: stored value, else
    `prefers-color-scheme`; **persist only on explicit toggle**;
  - `<meta name="theme-color">` ×2 + `<meta name="color-scheme" content="light dark">`;
  - toggle UI in `<jh-nav>` + hero shape-nav pill (one component, edit in jh-chrome.js);
  - writing.html: keep its toggle, move its restore IIFE to head (fixes its dark-flash),
    add the `prefers-color-scheme` default, share the key.
- **Palette**: light values for every semantic token from Phase 1; glow shadows
  (`text-shadow`, `drop-shadow`) zero out or soften in light; `backdrop-filter` glass gets
  light-glass values (writing.html's patch list of ~30 rules previews the shape of this work).
- **Canvases theme via palettes, not CSS**: `FishCanvas` opts + blueprint/cosmos palette
  objects get a light variant; a `MutationObserver` on `data-theme` re-derives colors on
  flip (OpenProse's pattern, already proven with its WebGL canvas). White stars → ink stars, etc.
- index.html QR card: rebuild on tokens (it's currently a hard-coded light component).
- openprose.html is **untouched** — it already themes itself; only confirm the nav toggle
  doesn't fight its own `openprose-canonical-mode` key (separate keys, separate scopes — fine).

### Phase 5 — QA & ship · ~0.5–1 day
- Contrast pass (WCAG AA both themes), reduced-motion pass, iOS/Android device pass,
  print styles sanity (they already assume light — they get simpler).
- Screenshot soak of every public page ×2 themes; check the fixed-canvas glass sections.
- Bump `SITE.version`, `node scripts/sync-version.mjs`, refresh OG/social only if the light
  theme changes the default look (it shouldn't — see decision 2).
- Amend V2_RELEASE_PLAN.md: add v2.1 "Daylight" after v2.0.

**Total: ~6–8 days.** Phases 1–3 are safe incremental commits; Phase 4 should ride a branch.

---

## Decisions for John

1. **Do the canvases theme?** Recommend **yes** (engine palette variants + observer) — a black
   hero rectangle on a daylight page reads as broken, and OpenProse proves a live canvas under
   a light page works. Fallback option: hero stays "night dive" dark in both themes and only
   content/chrome theme — cheaper, but visually split.
2. **Default theme**: recommend **follow OS preference, dark when unknown** — dark remains the
   brand-canonical look (OG images, screenshots unchanged), but light-OS visitors get Shallows.
3. **Body face**: JetBrains Mono at 1.1rem stays (it *is* the terminal identity), or long-form
   prose (about bio, case-study text) moves to Raleway 400 with mono kept for cards/labels/UI.
   Recommend **keep mono, raise the size** — revisit after Phase 2 ships if long passages
   still feel heavy.
4. **Sequencing vs v2.0**: Search Enrichment and this are independent. Recommend Phase 1–2
   (tokens + type) land **before** v2.0 tags — they fix real readability today — and
   Phases 3–4 become v2.1.

## Non-goals
- No change to OpenProse's design language (it's the donor, not a patient).
- No static-site-generator migration; stays zero-build (guiding principle in V2_RELEASE_PLAN).
- playground.html untouched (pending its jh-deng-template rebuild).
- The frozen Archive/ snapshots are never edited.
