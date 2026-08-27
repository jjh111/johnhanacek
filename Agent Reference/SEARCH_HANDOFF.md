# Search / Command Bar — Agent Handoff Primer

*Written 2026-08-26 at the end of a long build arc. You are inheriting a working,
tested system mid-polish. Read this first, then `SEARCH_COMMAND_BAR.md` (the
umbrella plan — its inline `> build record` blocks are the institutional memory,
including every bug and why it happened). John's priorities while he's driving
you: UI/UX fixes and improvements, then chunk updates via the audit.*

## What this is

The site's search is a **command bar product** — the hiring demo proving John
builds structured, bi-directional systems, not chat. One pipeline
(`scripts/search-core.js`, no DOM assumptions) behind two thin shells (the ⌘K
overlay `scripts/search-overlay.js`, and `search.html`). Tiers: BM25+intent
grammar (always on) → MiniLM semantic fusion (lazy, WASM) → in-browser Qwen
WebGPU → local LMStudio/Ollama/custom. On top of retrieval: the **postcard**
(microdense LOD ladder: mention → one-liner → tldr → dossier with pretext-
wrapped media), **actions/commands** (page-declared `JH_COMMANDS` + nav
synthesis), **scene language** ("add 3 small fish" → plan card → real
recognizer), the **tier strip**, the **⤢ workspace** (list + meta-paragraph
pane), **session continuity** (answers survive navigation as a collapsed
strip), and **pieces** (site widgets wake as live iframes inside the prose).

## Repo state right now

- **Committed** through `1c7e5b8` ("Command bar grows up") = Phases 1–9
  complete. AFTER that, John's parallel sessions landed: media re-encode
  (`f775ced`, touched chunk image fields), chrome/theme work (`f167b65`,
  `0218dc3`), an a11y batch (`a9c77c3`, touched BOTH search shells — aria-modal,
  tab trap, live-region results), and writing.html chrome (`793f77c`). One of
  these also gated the core's console logs behind `localStorage
  jh-search-debug=1`.
- **UNCOMMITTED working tree = Phase 10 (mine) MIXED WITH possible parallel
  edits.** `git diff` each file before assuming authorship. The Phase 10 work:
  `search-core.js` (session memory, pieces, post-wrap refit, cost floors),
  `search-overlay.css` (continuity strip, pieces, right-edge media),
  `search-chunks.json` (facts + pieces fields), suite updates (phase2/7/8/9
  edits, NEW phase10.mjs), `CHUNK_AUDIT.md` (new), README, build records.
  `index.html`/`design.html`/`services.html`/`JH-brand-styleguide.html` diffs
  are likely from the OTHER sessions — check before committing.
- **Do not push without John's word.** He says "push"; version bump +
  `node scripts/sync-version.mjs` + tag are his ship steps.

## The doctrines (non-negotiable, all hard-won)

1. **No-scroll**: the overlay panel NEVER scrolls; depth comes from semantic
   zoom (pin, density, workspace). The line budget fits the real viewport
   (measure → shrink proportional to line-units spent — never subtract raw
   pixels from a line budget), `postWrapRefit` corrects post-wrap growth, the
   tail caps at "+N more". Fit key uses `window.innerWidth×innerHeight`, NOT
   the anchor's clientHeight (the panel auto-grows; that churned the key and
   nulled the budget — see 10d round 2 record).
2. **Morph, don't rebuild**: same-query interactions swap only changed module
   nodes; live media/iframes are GRAFTED across every re-render
   (`harvestMedia`/`graftMedia`). A model-viewer or a running demo must never
   blink because a sibling changed.
3. **Honesty everywhere**: intent hints only when one fired (no filler
   eyebrows); restored answers wear "from your last search" and are NEVER
   regenerated; census is bylined "read from the canvas"; scene plans and tool
   calls are confirm-first, never auto-run; caps produce honest receipts.
4. **Pieces discipline**: ONE live iframe ever (waking a second sleeps the
   first via real `iframe.remove()`); overlay close sleeps; off-origin URLs are
   NEVER framed (doorway cards); playground.html/openprose.html are never
   pieces (they embed canvases themselves).
5. **Chunks are claims**: every chunk string is audited via `CHUNK_AUDIT.md`.
   New/edited chunks land WITH their audit section or not at all. After any
   content edit: `node scripts/build-chunk-vectors.mjs` (needs
   `npm install --no-save @huggingface/transformers`), then re-run the offline
   labs to prove retrieval didn't drift.
6. **Never hand-tune fusion**: the `hybridMerge` constants were tuned by
   `search-tests/fusionlab.mjs` + `intentlab.mjs`. Re-run the labs; don't nudge
   numbers.
7. **Media sits at the clean right edge, large** (images 148, models 170,
   demo pieces 264×176), base state `float: right` so pre-wrap layout is
   already correct. Cost floors follow what RENDERS (big media ≈ 9 lines, link
   pills 3).

## Running + testing

```bash
python3 -m http.server 4571          # from repo root (suites hardcode :4571)
cd "Agent Reference/search-tests"
node mock-llm.mjs &                  # :9911 — needed by phase4, 6c, 10
node phase10.mjs                     # etc. — see README.md in that dir
```

Harness traps (all bitten, all recorded):
- Suites need a `node_modules` with `playwright-core` NEXT TO the suite files
  (ESM ignores NODE_PATH). Copy suites to a scratch dir with node_modules, or
  npm-install in the repo root.
- `CHROMIUM_PATH` env or the default `chromium-1217` cache path.
- Headless Chromium reports `prefers-color-scheme: light` → un-forced pages
  render the LIGHT theme. Dark assertions need `colorScheme: 'dark'` on the
  context.
- Real Ollama runs on this Mac: suites route-abort `localhost:1234/11434`.
- Console-log assertions need `localStorage jh-search-debug=1` (logs are gated).
- Short viewports legitimately shed depth (the doctrine) — suites asserting
  depth shapes use 920–1100px-tall viewports. A "regression" at 720p may be
  the doctrine working; check before "fixing".
- Full-suite runs contend on cold embedder downloads — phase7's poll is 90s;
  prefer standalone re-runs before diagnosing a suite that failed in the sweep.
- Playwright `fill` + fixed waits can race renders under load — prefer
  `waitForSelector` for the thing you're about to interact with.

**ALL TWELVE suites (phase1–phase10) were green at handoff.** Keep them green;
update a suite in the same change that alters the behavior it asserts, never
after.

## In flight / awaiting John

- **`CHUNK_AUDIT.md` awaits John's marks** (confirm/EDIT:/CUT per line). When
  he marks it: apply verbatim → rebuild vectors → re-run labs → commit chunks
  + audit together. Watch the §C consistency items (Primary-vs-Lead at Nanome,
  MetaMedium prototype-vs-product) — they need one word chosen and applied in
  ALL the chunks named.
- **10d design rounds**: contact sheets (6 states × 2 themes) were delivered;
  John marks, you apply, re-shoot. His known style: dense-but-legible, media
  leading, no wasted chrome, "filler is not signal".
- **Known open items**: hypercube demo 404s its `main.css` (task chip exists);
  deferred list in the umbrella doc — LFM2.5 model swap (device-QA gated),
  Ollama tool-use, Phase 7 behaviors (standing directives for fish).
- John reviews micro/tldr/facts copy as part of the audit — all 84+ strings
  are dev-authored pending his eye.

## How to work here (conventions that earn trust)

- Plan → build → **suite in the same change** → full regression → build record
  appended to `SEARCH_COMMAND_BAR.md` (traps included — the records are why
  bugs don't repeat). Screenshots to John for anything visual.
- Python string-replace edits on big files: **assert the old string is present**
  (a silent no-op replace cost an hour once; it's in the records).
- Keep everything LOCAL until John says push. Never commit his in-progress
  files (check `git diff` — e.g. an SNA demo edit was deliberately left
  uncommitted once).
- CLAUDE.md's search section is the public summary — keep it in step when
  behavior changes. Memory files exist under the Claude memory dir; this repo's
  docs are the source of truth for the next agent regardless of harness.
- The repo is PUBLIC and served. Never commit personal/business documents.

## File map (search system only)

| File | Role |
|---|---|
| `scripts/search-core.js` | THE pipeline: tiers, fusion, intents, registry, postcard, scene, pieces, session, fit/morph renderers |
| `scripts/search-overlay.js` | ⌘K shell: lazy-loads core, command frame DOM, workspace toggle, continuity strip |
| `search.html` | page shell (own popover DOM, sticky `.search-wrap`, links search-overlay.css) |
| `scripts/search-overlay.css` | ALL search styles incl. light theme, pieces, strip; rgb-triplet tokens flip via jh-chrome.css |
| `Assets/search-chunks.json` | the index: content/tags/micro/tldr/facts/pieces/vec per chunk |
| `scripts/build-chunk-vectors.mjs` | dev-time embedder (run after chunk text edits) |
| `Agent Reference/SEARCH_COMMAND_BAR.md` | umbrella plan + ALL build records (read the records!) |
| `Agent Reference/CHUNK_AUDIT.md` | the claims audit — John's markup surface + standing rule |
| `Agent Reference/CONTROL_SURFACES.md` | per-page control inventory for commands/scene |
| `Agent Reference/search-tests/` | phase1–10 suites + labs + mock + README |
| `scripts/pretext-wrap.js` + `scripts/pretext/` | both-sides prose wrap; measurement-only use for line arithmetic |
| `scripts/playground-items.js` | widget manifest the piece registry derives from |

*Ask John before changing consent semantics (local-model Detect = the opt-in),
engine colors, or anything the tier strip signals — those went through explicit
design rounds with him.*

---

## Phase 10e — the planned next steps (John-directed, 2026-08-26)

Three workstreams, in build order. Each follows the house pattern: build →
suite in the same change → full regression → build record.

### 1. Visual dedupe in the display

The inventory (2026-08-26): two data-level dupes — the flower headshot on
chunks **1 + 28**, `nanome2casestudy.webp` on **5 + 37** — and no render-level
guard, so a results list can show the same face twice.

- **Render-level**: extend the pane's `seenMedia` discipline to the postcard
  LIST — one src-keyed set per render pass (reset each `buildPc`), walked in
  module order; a later module whose visual (image/video/model/piece src) was
  already shown renders text-only. First occurrence (= higher rank) keeps it.
  Thread the set through `pcMediaHtml`/`pcPieceHtml` as a parameter — do NOT
  make it ambient module state (morph re-renders single modules and would see
  a stale set; on the morph path, harvest the OTHER modules' visible srcs
  first).
- **Cross-pane**: in workspace mode the pane may show a stratum whose src the
  list also shows. Rule: the pane wins (it has depth); the list suppresses
  when `detailPane.dataset.showing` covers that chunk.
- **Data-level (better than suppressing)**: give the duped chunks DIFFERENT
  assets — 28 gets a non-headshot visual, 5 gets `nanome-mara.mp4` +
  `nanome-mara-poster.webp` (both sitting unused). And chunks 1/28 still point
  at the heavy `.jpeg` while the re-encoded
  `jjh-20250323-95 flower headshot Large.webp` sits unused — switch the fields
  (finishing what commit f775ced started).

### 2. More visuals in

25 of 42 chunks are text-only while 45 finished visual assets sit unused in
`Assets/` — mostly a MAPPING job, not a production job. Verified-available
candidates (each lands via the CHUNK_AUDIT rule — media are claims too; add a
§G to the audit doc and let John confirm the batch):

| Chunk | Asset (unused today) |
|---|---|
| 24 Research | `EDULEARNscreenshot Large.jpeg` (re-encode → webp first) |
| 14 Fractal Futures | `Fractal Future Logo.webp` |
| 4 JH Design LLC | `MusexJH.jpeg` (client work — re-encode) |
| 6 BadVR | upgrade to `BadVR-AROC-hud.mp4` + `badvr-hud-poster.webp` |
| 5 Nanome | `nanome-mara.mp4` + `nanome-mara-poster.webp` (kills the 5/37 dupe) |
| 42 Review Canvas | `openprose-casestudy.webp` |
| 2 Contact | `jhqr.png` (the QR — delightful, on-thesis) |
| 12/13 Installations | rotate `jhana-2/4/5.webp` so each chunk is distinct |
| 21 Awards & Recognition | `BlackBox-Model.glb` — ANSWERED 2026-08-27, read off the model itself: it is the Georgetown CCT **"Most Meta" 2016** peer award — a black cube in a printed paper wrap reading "Most Meta CCT'16". Chunk 21 already names that award; chunk **9 Robot Digital Twin is the WRONG target** — that award is AsMA 2022, and its trophy is the other file, `Aerospace Award.glb`. Mapping BlackBox to 9 would break this table's own never-map-what-it-doesn't-depict rule. |
| 33 Beliefs | `I am a strange looping black hole.jpg` — **John's call on tone** |
| 39 Writing | a `pieces` demo entry for `writing.html` (same-origin, wakeable) |

Rules: re-encode any jpeg/png/gif to the f775ced standard (webp / H.264 web
bitrate) BEFORE it enters chunks; never map an asset to a chunk it doesn't
actually depict (that's a §G audit line); chunks that stay text-only could get
a deterministic monogram tile so dossiers never feel bare — John's call,
sketch it in a 10d round first.

### 3. Semantic zoom on WORDING — the three-tier text ladder

Today's text tiers: `micro` (~40ch fragment) → `tldr` (one sentence) →
`content` (full paragraph). John wants the missing middle: **minimized
sentence vs MICROPARAGRAPH vs full paragraph**.

- **Data**: an authored `brief` field (2–3 sentences, ~200–280ch) per chunk —
  audit rule applies. Interim so the tier ships before 42 strings are
  authored: deterministic sentence-split of `content` — take whole sentences
  until ~260ch (SELECTION, not generation — the house rule holds). `brief`
  overrides the derivation when present.
- **Mapping** (LOD stays structural; density picks the WORDING inside it):
  compact L2 = tldr · comfortable L2 = microparagraph · compact L3 dossier =
  microparagraph + facts/media · comfortable L3 = full content · workspace
  pane: lead full, related strata microparagraph (up from tldr). Hover tooltip
  keeps showing the next tier up.
- **One selector, everywhere**: implement `textFor(r, lod, density)` and use it
  in BOTH `renderModule` and the allocator's `costOf` — if cost and render
  choose text independently they WILL drift (that class of bug is all over the
  build records).
- **Morph trap (will bite, plan for it)**: `morphPostcard` swaps on
  `data-lod` change only. A density flip that changes wording at the SAME lod
  must still swap the node — stamp the text tier on the module
  (`data-txt="tldr|brief|full"`) and compare it in the morph diff alongside
  lod.
- **QA**: extend phase8 — for one chunk, assert the three tiers yield three
  DIFFERENT strings (not just different font sizes); assert a density flip
  changes rendered wording at constant lod; phase9's no-scroll checks re-run
  unchanged (the fit loop already measures whatever text renders).

Suggested order: 1 (small, pure render logic) → 3 (core, most user-visible)
→ 2 (data batch, rides the next audit round with John).

---

## Phase 10f — external links: containerize everything, exit on purpose only
*(John, 2026-08-26: "we link out to jhana.zone entirely but we should be
containerizing everything uniformly and only linking within our own site." The
site is the demo — "ask my site" in cover letters — so every accidental exit
is a leak.)*

### The invariant: `url` is where WE talk about it; `pieces` is where IT lives
- Every chunk `url` must be SAME-ORIGIN. Today chunk 13 (Influence) has
  `url: https://jhana.zone` — the only chunk whose title/badge yank the
  visitor off-site. Re-point it to `art.html#installations`; the external URL
  moves into `pieces` (it's already there). Sweep all 42 chunks; chunk 3's
  MetaMedium link piece is fine, its url is design.html already.
- Enforce it: a lint check in the suite (`phase11` or a new lab) — every
  chunk url parses same-origin/relative; every raw `<a>` in rendered results
  with an external href must be inside a departure-card component. Also fix
  `commitTop`: Enter on a top result must NEVER leave the origin (today it
  `window.open`s external urls — after the sweep no chunk url is external, but
  guard it anyway; keyboard-cursor-on-a-departure-card + Enter is the one
  deliberate exception).

### Three-tier external policy (replaces the binary never-frame rule)
1. **Own + frameable → wake it LIVE.** jhana.zone and
   jjh111.github.io/MetaMedium are John's properties. The never-frame rule
   exists because third parties send X-Frame-Options; John controls these
   headers. Steps: `curl -sI` each candidate for `X-Frame-Options` /
   `Content-Security-Policy: frame-ancestors` (record results in CHUNK_AUDIT
   §G); where needed John sets `frame-ancestors 'self'
   https://www.johnhanacek.com` on his property; then a curated
   `FRAMEABLE_HOSTS` allowlist in search-core lets those pieces use
   `kind: 'demo'` semantics — wake budget, graft, sleep-on-close, all
   inherited. jhana.zone running INSIDE the wrapped paragraph is the payoff.
2. **Own + unframeable (Substacks, SmugMug, earthstar.space if it objects) →
   the DEPARTURE CARD.** One uniform component, generalized from
   `pc-piece--link`: local poster, title, hostname, explicit ↗, `rel="me
   noopener"`. Leaving is always a deliberate, labeled act.
3. **Third-party (anything not John's) → departure card only.** No allowlist
   entries, ever, without John's word.

### Poster-first: the visual lives in-site even when the content can't
- Dev script `scripts/capture-posters.mjs` (playwright, same harness pattern
  as the QA suites): screenshot each external destination →
  `Assets/posters/<host>.webp`, re-encoded to the f775ced standard. Departure
  cards render the poster — every external thing gets an in-site visual,
  uniform with native media. Posters are claims: dated, listed in CHUNK_AUDIT
  §G, refreshed when John says the destination changed.
- Everywhere externals currently render raw — `pcTitleHtml` ext branch,
  `pcPageBadge` ext branch, `relatedChipHtml`, `appendArtifactRail`,
  `INTENT_CARDS.alt` (LinkedIn) — route through the one departure-card
  builder (small inline variant for chip-scale contexts: glyph + hostname,
  same grammar, no bespoke `<a target=_blank>` scattered anywhere).
- The 10b continuity strip already softens real departures (the session
  survives the round trip); mention it in the departure card's title attr
  ("your search is kept").

### Order + QA
Sweep chunk urls (data, rides the audit) → departure-card component +
raw-external lint → header checks + FRAMEABLE_HOSTS (needs John to touch his
properties' headers) → posters last. Suite: no-raw-external-anchors assertion,
same-origin-url lint, Enter-never-exits, allowlisted piece wakes like a demo,
non-allowlisted external piece renders a departure card with poster.

---

## Phase 10g — the RESIDUE SENTENCE (John, 2026-08-26, final direction)

The 10b continuity strip is a one-shot toast; John wants **standing chrome**:
after navigating anywhere, the question/answer state stays VISIBLE as one
sentence — "it still shows what the question/answer was… without covering
content."

### What the sentence is
The session at its most minimized semantic-zoom tier — question AND answer in
one line:
`◂ "who is john" → John is a design engineer in San Diego… · reopen`
- With a generated answer: query + the answer's FIRST CLAUSE (sentence-split,
  ~90ch, ellipsis — selection, never generation).
- Without one: query + the top result's `micro`.
- **Core computes it**: `saveSession`/`markContinuity` add a `residue` string
  to the `jh-search-session` payload. The shell renders it knowing nothing
  about chunks or answers.

### Where it lives — RECOMMENDED: the terminal status line (bottom edge)
A slim full-width line docked at the BOTTOM: covers essentially nothing, never
contends with nav or hero, and is on-brand to the bone — the Deep Sea Terminal
gets a vim/tmux-style status line, exactly the right register for a command
bar. Check the two bottom-dwellers before shipping: index's `.scroll-indicator`
(bottom 2rem — clears a 26px line) and design.html's canvas-guide chips
(verify). Fallback option if John prefers top chrome: a ribbon attached to the
nav's bottom edge that yields (collapses to a left-docked tab) on scroll-down,
expands on scroll-up — but true in-flow under the nav is INVASIVE (pushes
every standalone 100vh hero) and a second fixed band still covers content;
that's why bottom is the recommendation.

### Behavior (this REPLACES the one-shot strip semantics)
- Shows on EVERY page while fresh session state exists (30-min TTL) and the
  overlay is closed — standing, not navigation-triggered. The one-shot
  `jh-search-continue` flag retires (or survives only to trigger a brief
  arrive-animation).
- Click anywhere on it → overlay reopens restored (`core.restoreSession()`,
  already built). ✕ dismisses for the SESSION (`jh-residue-dismissed` in
  sessionStorage) — a new search un-dismisses.
- `body.search-overlay-open` hides it (the overlay IS the expanded view);
  closing the overlay with state brings it back — open/collapse reads as one
  continuous object breathing.
- A new generation UPDATES the sentence in place (shell re-reads on overlay
  close). Light theme via the same rgb-triplet tokens as everything else.
- a11y: it's chrome, not an alert — a link and a button, no live region.

### Build notes
- Shell-side: `maybeShowContinuity()` becomes `renderResidue()` — runs at
  init on every page, and on every `closeSearch()`. Keep it feather-weight
  (two storage reads, no core load).
- CSS: fixed bottom, ~26px, glass ground, JetBrains 0.68rem, z 900 (under
  overlay 2000), query in text-bright, answer clause in text-primary,
  `reopen` chip in cyan-dim — the departure-card/continuity grammar.
- Suite (phase10 continuity section REWRITES, same change): residue visible
  at bottom after navigation AND after plain reload (standing, not one-shot);
  shows query + answer clause; click reopens restored; ✕ persists across
  pages within the session; new search resurrects it; overlay-open hides it;
  nothing at bottom is occluded (scroll-indicator rect vs residue rect).
