# Portfolio v1.6 → v2.0 Release Plan

> Status: ACTIVE · Baseline: v1.6 · v1.7 shipped; site at v1.11 · Author: synthesized from
> Agent Reference plans, a content/sitemap audit, and a codebase-architecture audit (June 2026).
> Amended July 2026 with the decisions in "Decisions (July 2026)" below.

## Context & Goals
johnhanacek.com is a hand-authored, standalone-HTML portfolio (deep-sea terminal aesthetic,
canvas-heavy: fish hero, blueprint drawing, cosmos, infinite playground, AI search). It works
well but has accumulated **drift**: duplicated boilerplate, divergent navs, orphan pages, stale
data, and a backlog of design docs. v2 is a **consolidation release**, not a feature sprint.

Four explicit goals drive this plan:
1. **Robust unified codebase** — kill copy-paste drift; one source of truth for shared pieces.
2. **Unified sitemap & discoverability** — every page is intentional, consistently navigable,
   and discoverable by both humans and AI crawlers (robots.txt, sitemap.xml, canonical, schema).
3. **Clarified content** — accurate, consistent bio/contact/meta everywhere; resolve duplication.
4. **Expansion abilities** — adding a page or a canvas demo should be cheap and low-risk.

### Guiding principles
- **Stay static.** Site is GitHub Pages. Prefer zero-build solutions (web components, shared JS)
  over a generator migration until page count or pain demands otherwise. Avoid over-engineering.
- **Graceful degradation** stays the rule (search, local-LLM, WebGPU, multiplayer all optional).
- **Performance budget** is sacred (canvas idle-pause, no Voronoi, 60fps). Every refactor must
  hold or improve it.
- **One change, one place.** After v2, nav/footer/meta/contact/version live in exactly one file.

### Version scheme (new, adopted in v1.7)
Today version is inconsistent: README says "v1.6", footers say "v1.6", asset cache-bust says
`?v=1.8`. v2 introduces a single source of truth (`scripts/config.js` → `SITE_VERSION`) that
feeds the footer badge AND the asset cache-bust query. Milestones below are numbered against it.

---

## Current state (v1.6 + in-flight)
- **Shipped recently:** hero **QR easter egg** — draw an "X" (two straight crossing strokes) to
  reveal a frosted-glass QR panel (`index.html`; reuses `getLineScore`/`segmentsIntersect`).
  Note: this already shares the design.html line detector — a preview of the v1.8 consolidation.
- **Search overlay** is live site-wide (`scripts/search-overlay.js`), BM25 tier active.
- **Fish minigame** mature (FISH_TUNING_PLAN phases 1–13 done; 14–21 need verification).
- Pages: index, design (frozen), art, about, services, playground, writing, search, nanome2, 404,
  plus **orphans** beach-beers / onagents / tidepool / Assets/INV-2026-001 (unlinked).
- **AEO audit (June 2026): 76/100.** Quotable 25/25 and Trustworthy 25/25 are strong; Understandable
  18/25; but **Findable is "Poor" at 8/25** — no `robots.txt` weighting, no `sitemap.xml` (0/7),
  no canonical tags (0/13 pages), partial schema. This is the clearest near-term win and is folded
  into v1.7 below. Production/canonical host = `https://www.johnhanacek.com` (per CNAME).

---

## Workstreams → goals mapping

| Workstream | Goal it serves | Headline items |
|---|---|---|
| **A. Foundation & Coherence** | Unified codebase + Clarified content + Sitemap | version SoT, nav+footer components, data/meta single-source, content fixes |
| **B. Unified Canvas Engine** | Unified codebase + Expansion | extract `shape-detection.js` + `fish-engine.js`; dedupe index/404/fish-demo; fold in fish fixes |
| **C. Fish Maze (flagship)** | Expansion (showcase) | living fish + shapes-as-walls + squiggle-erase, on the shared engine |
| **D. Search Enrichment** | Content | rich result cards (media, 3D, linked titles) on the live overlay |
| **E. Sitemap & Expansion DX** | Sitemap + Expansion | orphan decisions, page template/partial, playground demo pattern, docs |

---

## Phased milestones

### v1.7 — "Foundation & Coherence"  (do FIRST; everything rides on it)
Low-risk, high-leverage. No new features; pure unification + correctness.
> **✅ v1.7 COMPLETE (shipped to `main`):**
> - Discoverability: robots.txt, sitemap.xml, self-canonical on all public pages, JSON-LD infill,
>   noindex on the secret pages.
> - Content coherence: llms.txt email fix, about OG → .webp, writing.html links + back-link,
>   search-chunks refresh (nanome2/playground/writing). Contact email now identical site-wide.
> - Cache-version single-source: `scripts/sync-version.mjs` (one SITE_VERSION → every `?v=`,
>   all assets at `?v=1.10`).
> - **`<jh-footer>` + `<jh-nav>` components** (`scripts/jh-chrome.js`, light DOM + display:contents)
>   replace the duplicated footer/nav across the 8 standard pages and standardize the divergent
>   services/nanome2 footers + search's missing version line. Footer version reads from one SITE
>   config. Verified: every page renders nav/footer from the component, correct per-page active
>   state, no component console errors.
> - Archive prune: 8 dead iterations/experiments removed (all `*_PLAN`/audit `.md` + whitepaper kept).
> **Deferred (not blocking):** binding each page's JSON-LD block to `john-hanacek.json` (those blocks
> are page-specific @types, not harmful duplication; footer/contact ARE single-sourced); converting
> playground's bespoke nav and writing.html's standalone chrome to the components.
- **Version source of truth:** `scripts/config.js` exports `SITE_VERSION`; footer badge + asset
  cache-bust both read it. Retire the `?v=1.8`/README/footer mismatch.
- **Nav + footer web components:** `scripts/components/jh-nav.js`, `jh-footer.js` (custom
  elements, no build step). Replace ~9 copies of nav markup (~400–500 dup lines) and 6 footer
  copies (~245 lines) with `<jh-nav current="design">` / `<jh-footer>`. This **also fixes the
  about/services nav inconsistency and the services footer divergence for free.**
- **Single-source identity data:** extend `john-hanacek.json` with canonical contact/social/bio;
  generate JSON-LD + footer/contact from it (via shared JS) instead of per-page copies.
- **Content fixes (Clarified content):**
  - `llms.txt` → fix `hello@jhanacek.net` → `hi@johnhanacek.com` (confirmed wrong, line 41).
  - `about.html` OG image `.png` → `.webp` to match the rest.
  - Standardize footer everywhere (services currently uses a different format, no GitHub link).
  - Refresh `Assets/search-chunks.json` to include search / playground / writing / nanome2.
- **Discoverability / AEO (from the June audit — site 76/100, "Findable" Poor at 8/25):**
  The audit's "add this in Framer" guidance does not apply — this is a static site, so we add
  real files/tags (canonical host `https://www.johnhanacek.com`):
  - **`/robots.txt`** (new): explicitly allow AI crawlers (GPTBot, ClaudeBot + anthropic-ai,
    PerplexityBot, Google-Extended, CCBot) and add `Sitemap: https://www.johnhanacek.com/sitemap.xml`.
    *(audit robots.txt 1/4)*
  - **`/sitemap.xml`** (new): every public canonical page on the www host; its contents follow the
    unified-sitemap decision (orphans in/out → decision #2). Submit in Google Search Console.
    *(audit 0/7 — single biggest win)*
  - **Self-referencing canonical** `<link rel="canonical" href="https://www.johnhanacek.com/…">`
    on all 13 pages (currently **0/13**). Emit from the shared head/meta single-source so each
    page's canonical lives in one place. *(audit canonical 0/7)*
  - **JSON-LD gaps:** add schema to `playground.html`, `writing.html`, `404.html` (currently none)
    and verify the homepage `Organization` block; coverage elsewhere (Person/ProfilePage/Service)
    is already decent, so this is targeted infill, not a rewrite. *(audit JSON-LD 2/9)*
  - Quotable + Trustworthy already score 25/25 — do not touch them.
- **Archive prune:** remove dead iterations (`Archive/index 2.html`, `design 2.html`,
  experimental `*-style.html`, `untitled.pen`); keep whitepaper + `*_PLAN.md` history.
- **Exit criteria:** every page renders identical nav/footer from the component; one grep shows
  zero hardcoded version strings; contact/email identical across site + data files; no console
  errors; visual diff vs v1.6 is null except intended fixes. **Discoverability:** `robots.txt` and
  `sitemap.xml` live and valid; all 13 pages carry a self-canonical to the www host; JSON-LD
  present on every indexable page; re-running the AEO audit shows **Findable ≥ 20/25** (overall
  85+). Note: canonical/robots/sitemap depend on the unified-sitemap decision (#2) for which pages
  are public — sequence that decision early in v1.7.

### v1.8 — "Unified Canvas Engine"  (enabling refactor)
The drawing/fish code is triplicated (index.html ~6k lines, `fish-demo/`, partial in `404.html`)
and the shape-detector is copied between index.html and design.html. Consolidate before building
new canvas features on top.
- Extract `scripts/shape-detection.js` (getBounds, distance, getCircle/Rect/Triangle/LineScore,
  detectArrowHead, segmentsIntersect, findSelfIntersectionLoop). index.html, design.html, and the
  QR easter egg all consume it. Single source for recognition math.
- Extract `scripts/fish-engine.js` (entities, behavior stack, steering, render loop) with a
  `new FishCanvas('#heroCanvas', config)` API. index.html, 404.html, and `fish-demo/` consume it;
  target index.html shrinking ~6.8k → ~3.5k lines.
- **Fold in stability fixes during extraction** (test once, in one place): FISH_V15_FIXES (loop
  recognition on fast draws, large-fish standoff, coral avoidance scaling) + the
  "eliminate teleporting" Phase 1 from FISH_BEHAVIOR_IMPROVEMENT_PLAN; verify TUNING phases 14–21.
- **Exit criteria:** index/404/fish-demo run from the shared engine; behavior parity verified
  (debug 'D' overlay); fps budget held; deleting a fish bug now means editing one file.

### v1.9 — "Fish Maze"  (flagship feature) + Search Enrichment (parallel)
- **Fish Maze (FISH_DESIGN_MERGE):** living fish + recognized shapes as physical walls fish
  pathfind around; tap = food; squiggle (≥3 reversals) erases nearby shapes; raise maxShapes
  20→50. Built on the v1.8 shared engine + detector. **⚠ Requires resolving the "frozen
  design.html" decision below.**
- **Search Enrichment (parallel, independent):** rich result cards — video previews,
  `<model-viewer>` 3D, headshot, linked titles. Builds on the shipped overlay; mostly JSON + CSS.
- **Exit criteria:** maze is stable & performant on desktop+touch; old frozen demo preserved per
  the chosen option; enriched cards degrade gracefully when media absent.

### v2.0 — "Release"
- ~~Playground cleanup~~ — dropped per decision #5 (jh-deng-template rebuild supersedes).
- **QA & polish:** accessibility sweep (focus, reduced-motion, contrast), perf pass, cross-browser
  (incl. Safari backdrop-filter), mobile.
- **Docs:** update `CLAUDE.md` sitemap (add search/playground; document orphan disposition),
  `README.md`, regenerate AI data. Tag **v2.0**.
- **Exit criteria:** all four goals demonstrably met; clean console; docs match reality.

---

## Decisions (resolved — June 2026)
1. **design.html / fish maze → option (a).** design.html will be **unfrozen** for the maze in v1.9;
   snapshot the current frozen demo to `Archive/design-blueprint-frozen.html` first so the MetaMedium
   whitepaper demo is preserved, and update CLAUDE.md's "frozen" note when that happens. (v1.9 work —
   not done in the v1.7 pass.)
2. **Orphan pages → kept OFF the sitemap and treated as unlisted "secrets."**
   - *Discoverability stance (shipped this pass):* each carries `<meta name="robots"
     content="noindex, nofollow">`, stays out of `sitemap.xml`, and has no inbound links. We do
     **NOT** add `Disallow:` lines to robots.txt — that would publish the secret paths. Obscurity =
     unlisted + noindex, never robots-disallow.
   - *House cleanup (planned):* relocate `Assets/INV-2026-001.html` out of the served site (business
     doc, not content); pick a permanent home for the experiments — `onagents` → a future
     writing/essays index; `beach-beers` + `tidepool` → promote to playground demo cards OR keep as
     documented secrets. **Maintain a registry of intentional secret pages in CLAUDE.md** so they
     aren't forgotten (and so future "add canonical to every page" sweeps skip them).
3. **writing.html → unify into the site.** *Shipped this pass:* inbound links from art.html (the
   "Writing & Worldbuilding" section + the Explore grid) and a back-to-site link on writing.html;
   it's now in the sitemap with canonical + JSON-LD. *v2 follow-up:* give it the real shared nav and
   decide its canonical home (Art vs Services vs its own nav slot) during the nav-component work — it
   reads as a coaching/learning dashboard, so a Services link likely belongs too.

## Decisions (July 2026)
4. **Focus = finish the core plan and ship the Fish Maze** (v1.8 engine → v1.9 maze). The maze
   is the release moment / social-bait update.
5. **Playground → future rebuild on jh-deng-template** (a system on John's local machine, not in
   this repo). Consequences: PLAYGROUND_CLEANUP is **dropped** from v2.0 scope, and playground's
   bespoke nav is NOT converted to `<jh-nav>` — don't invest in the current implementation.
6. **onagents.html is held** for that playground rebuild (stays unlisted + noindex until then).
7. **tidepool.html, beach-beers.html, fish-demo/ = internal experiments.** Registered in
   CLAUDE.md's unlisted-pages registry; not promoted, not deleted.
8. **fish-demo/ seeds v1.8**: `fish-demo/fish.js` is already a working standalone extraction of
   the fish system — the v1.8 engine work starts by reconciling it against index.html and
   promoting the result to `scripts/fish-engine.js`, not by extracting from scratch.
9. **Version SoT resolved differently than planned**: instead of a new `scripts/config.js`, the
   version lives as `SITE.version` in `scripts/jh-chrome.js` (renders the footer badge);
   `sync-version.mjs` parses it and stamps every `?v=` + the README badge. Zero extra requests.
10. **House cleanup shipped (July 2026)**: invoice removed AND scrubbed from git history;
    private/junk files pruned (~75MB incl. unreferenced media); Nanome videos compressed
    (35MB→6.3MB); 404 JSON-LD added; last stray old-domain email fixed; CLAUDE.md/README
    rewritten to match reality.

## Deferred to v2.1+ (explicitly out of scope for v2)
- **ART_HERO_ENHANCEMENT** (star layers, Web Audio, shooting stars) — delightful, large, isolated.
- **MULTIPLAYER_CURSORS** (PartyKit) — adds an external runtime dependency.
- **SEARCH_COMMANDS** (intent router) and **SEARCH_HYBRID** (multi-engine refine) — advanced AI UX.
- **Full SSG migration (11ty)** — only if the site grows past ~15–20 pages or component approach
  proves insufficient.

## Plan disposition reference
| Doc | Disposition |
|---|---|
| FISH_DESIGN_MERGE | **v1.9** (flagship, pending decision #1) |
| FISH_V15_FIXES, FISH_BEHAVIOR_IMPROVEMENT (Phase 1) | **v1.8** (fold into engine extraction) |
| FISH_TUNING_PLAN (14–21) | **v1.8** (verify) |
| FISH_MINIGAME_DESIGN, FISH_SYSTEM_TECHNICAL, METAMEDIUM_CONVERGENCE, LLM_SEARCH_INTEGRATION | Reference (no work) |
| SEARCH_OVERLAY | Done |
| SEARCH_ENRICHMENT | **v1.9** |
| SEARCH_COMMANDS, SEARCH_HYBRID | v2.1 |
| PLAYGROUND_CLEANUP | **Dropped** (decision #5 — jh-deng-template rebuild supersedes) |
| ART_HERO_ENHANCEMENT | v2.1 |
| MULTIPLAYER_CURSORS | v2.1 |
| ART_EARTHSTAR | Done |

## Verification strategy (per milestone)
- Serve locally (`python3 -m http.server 1337`, or the `portfolio` preview config) and exercise
  each changed page; check the debug 'D' overlay for the fish/maze.
- After component extraction: scripted DOM check that every page's nav/footer come from the custom
  element and contain identical content; grep for any remaining hardcoded version/contact strings.
- Console must be error-free; reduced-motion and keyboard paths verified on interactive bits.
- Keep all work **local until explicitly approved to push.**

## Rough effort (one developer)
v1.7 ≈ 1–1.5 days · v1.8 ≈ 2–3 days · v1.9 ≈ 3–4 days · v2.0 ≈ 1–2 days. ~1.5–2 weeks total,
shorter if Search Enrichment runs parallel to the maze.
