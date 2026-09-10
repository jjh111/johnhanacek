# Portfolio v2 → v3 Release Plan

> Status: DRAFT awaiting John's ratify · Baseline: v2.0 (tagged 2026-08-30) · Author:
> consolidated 2026-08-31 from the v2 close-out, the SEARCH_COMMAND_BAR next-cycle
> discussions, and John's direction: "v3 where the site becomes more modular and
> data-driven and agent compatible."

## Context & Goals

v2.0 shipped the command bar as a product and the de-boxed visual language. What it
proved: retrieval, the postcard, pieces, and session memory all work — but the ANSWERS
are only as good as the data, most chunks still describe *what* John made rather than
*how he thinks*, the playground reads as a grab bag rather than a showcase, and page
content and search content are still two copies of the truth.

**The v3 thesis, in John's words:** "let people ask the site questions to get not just
links and actions but also how I think." Four goals drive the plan:

1. **Voice in the data** — the site answers with John's thinking, not just his portfolio.
2. **Curation over accumulation** — the strong work leads everywhere; experiments are
   findable, not front-and-center.
3. **One source of truth** — chunks become the page content (build-time), so result and
   page are the same object and drift is impossible.
4. **Agent compatibility** — the site is as legible to a visiting AI as to a human:
   complete structured data, stable anchors, a documented chunk schema.

Standing doctrines carry forward unchanged: instant-then-smarter, one surface / no
second level, chunks are audited claims, nouns travel / verbs stay per-page, no-scroll,
never hand-tune fusion, suites green in the same change.

---

## v2.1 — "Voice & Data" (content-first; the John-heaviest milestone)

The philosophy gets into the data SOONER than the figure build (decided 2026-08-31).

- **The "how I think" chunk set.** Distill onagents.html (the ~37k-word orchestration
  essay) into a set of audited chunks — stigmergy/indirect coordination, harnesses and
  ratchets, delegation fractals, verification over trust, the ecosystem view. Each with
  `micro/tldr/brief`, a `url` anchored to its essay section, and a CHUNK_AUDIT entry.
  Also candidates from writing/ (EduOS, MetaMedium essays) and the design philosophy
  John states in conversation (instant-then-smarter itself is a belief worth a chunk).
- **Apply the CHUNK_AUDIT backlog**: John marks §A–F + the §G/H batches → apply
  verbatim → `build-chunk-vectors.mjs` → re-run fusionlab/intentlab.
- **Authored `brief` fields** for at least the top ~15 chunks (the sentence-split
  derivation is a stopgap; these should be John's wording).
- **JSON-LD pass**: enrich the Person graph (john-hanacek.json + per-page JSON-LD);
  case studies and the essay typed as CreativeWork/Article with author/about/mentions;
  keep it consistent with chunk claims (the audit covers structured data too); refresh
  llms.txt to describe the command bar and the chunk corpus.
- **More data from John**: personal/professional insertion passes, new pieces mappings
  (each rides §G).
- **Exit criteria:** "how does he think about agents / AI / design" returns
  philosophy-backed results in John's voice; labs show no retrieval drift; JSON-LD
  validates and matches the chunks.

## v2.2 — "Playground v1" (curation + showcase)

The playground is not yet at its own v1; the content is haphazard (John, 2026-08-31).

- **Manifest tiers**: `tier: 'featured' | 'site' | 'experiment'` in
  playground-items.js. Default canvas view opens on FEATURED (the strong work);
  experiments live behind their filter chip — findable, not front-and-center.
- **teamready.xyz dashboard joins as featured work** — off-origin, so: if John controls
  its headers → FRAMEABLE_HOSTS and it wakes live; otherwise a captured poster +
  departure card. Either way it gets a chunk (+ audit) so search can surface it.
  Sweep for other showable client/real work in the same pass.
- **Poster captures** for all external items (capture-posters.mjs exists).
- **`weight: 'heavy'` finally acted on** — the staged perf plan the manifest has been
  recording; wake budget tuning per tier.
- **Low-hanging interactive fruit**: surface finished demos on content pages where a
  static image currently stands (the hypercube pattern — one iframe, budget-aware).
- **Exit criteria:** a visitor landing on playground.html sees curated work first;
  the experiments chip still holds everything; teamready is visible and searchable.

## v2.3 — "Figures" (the stashed onagents extraction plan, 2026-08-31)

24 self-contained canvas figures live inside onagents.html behind one small
DemoController runtime — an accidental figure library. Plan of record:

- `scripts/figures/` — extract the runtime (register / mount / IO start-stop / reset,
  slide-mode aware) + figures as registered modules (measured: the ant figure is ~315
  lines, hardcoded colors, no DOM deps beyond its canvas — highly portable).
- **One viewer page** `figure.html?fig=<name>` (noindex) — mounts any figure
  responsive-fullscreen with title, caption, and a link back to its essay section.
- Downstream, free: playground items (`cat: 'figures'`), search PIECES (~24 cheap live
  same-origin demos — the rail's permanent supply), embeds on any page.
- Order: runtime + viewer + marquee five (ant, ecosystem, firefly, attractor, fractal)
  → playground/pieces/suites → John QA → batch the rest → convert onagents.html itself
  to the modules (pixel-identical; single source of truth; do this immediately after
  the batch, never leaving the code duplicated for long).
- **Exit criteria:** figures render identically in-essay and standalone; at least five
  wake as pieces; the essay's inline copies are gone.

## v2.4 — "True Ink" (fish recognition & placement) — DEFERRED past v3.0 (2026-09-09 ruling; see "Priority order")

The two long-standing weaknesses in the draw-a-fish pipeline, traced to mechanism
2026-08-31: a visually obvious fish sometimes isn't recognized, and large fish spawn
far from where they were drawn. Engine-track work (fish-engine.js +
shape-detection.js + both pages' input handlers) — independent of the data arc, so
this milestone is swappable with v2.2/v2.3 or can ride alongside them. Agent-heavy,
in contrast to v2.1.

### Diagnosis (settled — the plan builds on these six findings)

**Recognition misses:**
1. **Closed-check preemption** — `classifyStroke` (fish-engine.js:1291) tests
   "closed" (start–end < 22% of size) BEFORE loop detection. A natural ichthys ends
   near its start, so big drawings get scored as circle/rect/triangle, fail all
   three, and return null — the fish branch never runs. Worse: design.html then
   falls through to its own `detectShape`, where the blob can score triangle
   (0.58 > 0.5) and the failed fish **becomes a wall**.
2. **Dead coalescing** — the `getCoalescedEvents` call (fish-engine.js:6425) only
   exists on PointerEvent; both pages bind mousemove/touchmove, so the branch never
   fires and fast strokes sample at ~60Hz — sparse points exactly at the tail
   crossing. The comment claims a fix that is inert.
3. **Angularity gates reject pointed noses** (shape-detection.js:233) — max-single-
   turn ~1.1 rad kills the common sharp-nose fish; a fish has ≤1 sharp corner, a
   rectangle crossing has 4 — corner COUNT discriminates, a turn ceiling doesn't.
4. **First-intersection wins** — the loop scan returns the first crossing, not the
   best/largest loop among all crossings.
5. **No resampling** — every threshold is secretly speed/device-dependent; long
   careful strokes get subsampled to ~8-point chords that can miss shallow crossings.
6. **Silent gates** — loopSize > 28, aspect > 0.22, single-stroke-only: all fail
   with zero feedback.

**Placement offsets:**
1. **Large-fish teleport** (fish-engine.js:6584) — bodyWidth ≥ 60 (any loop over
   ~120px → most design.html drawings) + lower-half spawn → spawnY rewritten to
   0.35–0.50h. Aquarium-era territory logic, does NOT check `FLOOR_AFFINITY` — the
   same class of bug v1.9 fixed for idle. Wall-blind: happily teleports a fish out
   of its pen or into a wall.
2. **80px SPAWN_MARGIN clamp** (:6580) — shifts near-edge drawings, can pull a
   spawn out of an enclosure.
3. **Anchor = loop centroid**, not the drawing's perceived center (tail uncounted).
4. **SVG render lopsided** — body centered at (f.x,f.y), tail extends ~30% beyond;
   plus **heading randomized for large fish** (:6567) discards the drawn nose
   direction, so the visual mass lands offset in a random direction.
5. **Scale distortion** — scaleFactor = max(loopW,loopH)/753: a tall-narrow loop
   becomes a fish as WIDE as the loop was TALL, rotated arbitrarily.

### Phase A — placement truth (small diffs, the perceived-quality win)

- Gate the large-fish upper push on `FLOOR_AFFINITY` (one line kills the dominant
  offset on design.html). Decision 6 below: whether index.html drops it too —
  spawn-where-drawn and let territory BEHAVIOR migrate the fish is the recommended
  posture.
- Replace the blunt SPAWN_MARGIN clamp with **wall-aware spawn**: the nav grid +
  per-size-class open-cell data already exist — if the spawn cell is blocked for
  that size class, BFS to the nearest open cell **in the same room**, never crossing
  a wall. Preserves pens by construction.
- Keep the drawn heading for large fish; anchor the SVG render at its full visual
  bounding-box center so the silhouette sits ON the drawn loop; scale along the
  fish's axis (or by area) so tall drawings don't become oversized wide fish.
- Optional polish (decision 8): morph the stroke into the fish — design.html
  already morph-animates walls; any residual correction then reads as intentional.

### Phase B — recognition rework

- **Foundational: resample every stroke** to uniform arc-length (64–128 pts,
  $1-recognizer style) + light smoothing before ANY classification. Makes all
  thresholds speed/device-independent; half the edge cases fall out here.
- **Score arbitration replaces the early-return cascade**: run loop detection even
  for "closed" strokes; a valid fish loop beats weak closed-shape scores.
  (Equivalent framing: a stroke is only "closed" if it does not self-intersect
  mid-stroke.)
- **pointermove + real getCoalescedEvents** on both pages (engine :6722, design
  :2587) — the current branch is dead code.
- **Best-loop selection**: collect all self-intersections, keep the largest loop
  that passes the gates.
- **Corner counting replaces the max-single-turn ceiling** (≤1 sharp corner =
  fish-compatible; ≥3 = rectangle crossing).
- **A failed fish never becomes a wall**: if a loop was found but gated out, swallow
  the stroke with a fading "almost" whisper instead of falling through to
  `detectShape`.

### Phase C — harness before tuning (the fusionlab rule applies here too)

- `search-tests/strokelab.mjs` sibling: a **stroke corpus** replayed through
  `classifyStroke` headlessly (the maze-soak Chromium setup already exists).
  Corpus = recorded REAL strokes — a dev capture snippet logs point arrays as John
  (and a coarse-pointer tester) draws fish, walls, bubbles, scratch-outs — plus the
  synthetic set. Every recognition change lands with corpus accuracy reported and
  no regression on the non-fish classes (walls/bubbles/coral/erase still route
  correctly on both pages).
- Placement soak: measured spawn-offset metric (drawn-loop center vs rendered
  visual center) before/after, on both pages.

**Exit criteria:** a fish drawn in the lower half of design.html spawns where
drawn, inside its pen if penned; an ichthys whose ends meet still reads as a fish;
a failed fish never materializes as a wall; corpus accuracy published in the change
that tunes any threshold; index.html aquarium behavior visibly unchanged except
where decision 6 says otherwise.

## v2.5 — "The Funnel" (services.html: two tracks that actually diverge)

`services.html` became a dual-track funnel in b469a24 (2026-09-08), after this plan was
written. The fork works; what follows it does not yet. Measured 2026-09-09 at 1440px and
390px, both tracks, headless Chromium.

### Diagnosis (settled — the plan builds on these)

**1. The fork merges back too early.** The page forks in its first 650px and then hands
both audiences the same tail.

| | desktop `#coaching` | desktop `#design` | phone `#design` |
|---|---|---|---|
| Chosen track | 1664px (29%) | 2285px (36%) | 4943px (40%) |
| **Shared tail after it** | **2276px (40%)** | 2276px (36%) | 4757px (39%) |
| Document | 5663px | 6283px | 12216px |

Roughly 40% of every visit is content written for the other audience, or for no
audience in particular. This is a page with a chooser on top, not two tracks.

**2. Choosing changes nothing on a bare load.** `DEFAULT = 'coaching'`, so a visitor
arriving at `services.html` already has coaching open. Clicking the coaching door is a
no-op. Half of why the fork does not feel load-bearing is that, for one of the two
audiences, it literally is not.

**3. Every coaching product has two names, and the cross-references use the quieter one.**

| Card label (`.tier-label`) | Card heading (`<h4>`) |
|---|---|
| Guided Coaching | The Core Program |
| Embedded Retainer | Ongoing Partnership |
| Build Sprint | Intensive Project Build |
| **Audit** | **One-Session Deep Dive** |

The Fit section says "The Audit is the starting point"; JSON-LD ships `Audit`; the card
a reader must find is headed **One-Session Deep Dive**, and for a design visitor it sits
inside the *collapsed* coaching track. Design cards carry no labels at all, so the two
tracks do not even share a card grammar.

**4. `Founding Design & Product` names both the track and a card inside it** — an `<h2>`
and an `<h4>` with identical text on one page.

**5. Four of seven quotes appear twice.** Eleven quote blocks for seven people. The worst
case is adjacent: the design track closes with Sheila Zipfel and Tommy Kronmark, and
about two screens later "What clients say" opens with Sheila Zipfel and Tommy Kronmark.
Dan Barrett appears in the proof strip and again in the wall; Ben S in coaching and again
in the wall.

**6. The Fit section is un-forked and coaching-weighted.** Eight paragraphs across four
cards: two genuinely paired, two shared, and four coaching-voiced. For a design visitor,
three and a half of four cards lead with coaching vocabulary and one points at a product
inside the collapsed track.

**7. The other door interrupts at the conversion moment.** The collapsed track sits
*between* the chosen track's CTA and the testimonials. The reader is asked to book, and
the next thing on screen is the other product.

**8. The tracks are shaped differently.** Design proves — three named outcomes with
figures and case-study links — then sells. Coaching describes (four components, four
steps) and carries **no outcomes section at all**; its only evidence is one quote. Design
carries "You walk away with" on both menus; coaching's walk-away exists only on the door.

**9. The primary CTA cannot be attributed.** Four identical "Book a free intro call"
buttons on one calendar URL. The `mailto:` links *do* carry per-track subjects, so email
reports the door and the main CTA does not.

### John's rulings (2026-09-09)

- **The choice does not persist.** URL only — no `localStorage`. A remembered choice
  means landing on a page shaped by a decision the visitor does not recall making, and it
  cannot be shared or linked.
- **Chosen only.** Once a track is picked, that track's content is what is shown — and
  what prints. The governing principle in his words: *"minimizing cognitive overload and
  funneling them in."*

### The architecture rule: fork the content, never the anchors

This is what makes the refactor safe, and it is the whole answer to "will editing the
anchors break things".

Anchor reference audit, repo-wide (2026-09-09):

| Anchor | External refs | Where |
|---|---|---|
| `#coaching` | **7** | chunks 16 & 17, `search-core.js` intent-card alt, `resume.json` |
| `#design-services` | 2 | **chunk 18 — still on the legacy name**, docs |
| `#endorsements` | 1 | docs |
| `#fit` `#book` `#testimonials` `#intro` `#proof` | **0** | nothing outside the page |

`sitemap.xml` carries `services.html` with no anchor. So two anchors matter, both already
have working legacy remaps, and the entire tail is unreferenced.

The rule: **section IDs never multiply.** No `#fit-coaching`. What varies is the content
*inside* a stable section, driven by one root attribute:

```html
<html data-track="coaching|design">     <!-- the only switch -->
  <p data-track="coaching">…</p>        <!-- shown for coaching -->
  <p data-track="design">…</p>          <!-- shown for design -->
  <p>…</p>                              <!-- untagged = always shown -->
```

CSS hides; JS only writes the attribute. No DOM moves, no duplicate IDs, no new URLs to
keep alive. The anchor set after the refactor is identical to the one before it, which
also serves v3.0's agent-compatibility goal (stable anchors) rather than fighting it.

**Direction is load-bearing:** default CSS shows everything and JS *adds* the filter. JS
off, or a crawler that does not run it, gets the whole page. Never the reverse — that is
the failure mode where a broken script serves a blank page.

**Hiding must be real.** `display:none` or the `hidden` attribute, not opacity or
visibility, or assistive tech reads both tracks aloud.

### Never stuck — the switch affordances

Every one of these writes the URL, so state stays shareable and back/forward works.

1. The doors stay at the top in every state.
2. A persistent "Viewing: Coaching · switch" control, not only a bottom-of-page offer.
3. The other-track strip moves **below** the tail — it currently interrupts between the
   CTA and the testimonials.
4. The TOC reflects the chosen track and always carries a link to the other.
5. A deep link into the other track **switches to it** rather than hiding it.
6. `?track=both` as an explicit "show everything" escape.

### Phases

- **A — Instrument first.** `Agent Reference/maze-tests/servicetest.mjs`, written *before*
  the refactor so it catches regressions instead of describing them. Asserts: every entry
  URL (`#coaching`, `#design`, legacy `#design-services`, `#endorsements`, `?track=`,
  bare, `both`) lands in the right state; no anchor resolves to nothing; JS-off shows all
  content; no duplicated IDs; no orphan state.
- **B — Naming and quote hygiene.** Pure subtraction, no mechanism change, lands alone
  safely: one name per product, rename the colliding card, one menu grammar across both
  tracks, each voice once. Shrinks the page ~15% before any structural work.
- **C — The mechanism.** Swap the DOM-moving script for `data-track`; keep both legacy
  remaps; settle the pre-choice default (below).
- **D — Tag the tail.** Fit first: it is already written as paired sentences, so the fork
  is mostly tagging plus two or three new design sentences, not a rewrite.
- **E — Coaching's proof.** The sharpest asymmetry. **Blocked on John** — outcomes and
  figures he will vouch for, landing as audited chunk claims like any other.
- **F — Attribution.** Per-track calendar links or a track parameter, so the primary CTA
  reports what email already does. Needs a check of what Google appointment scheduling
  actually supports before a mechanism is promised.

### Exit criteria

A design visitor never reads coaching vocabulary; a coaching visitor never reads design
vocabulary; each name means one thing; each voice appears once; the tail is at most ~25%
of the document; every entry URL lands correctly and `servicetest` is green in the same
change.

### Interaction with v3.0

v3.0 goal 3 makes chunks the page content at build time. If that lands after this,
**`data-track` must be expressible in the chunk schema** — a chunk needs to declare which
audience it serves, or the compiler will flatten the fork back into one undifferentiated
page. Worth deciding the schema field now even though the compiler is later. Goal 4
(stable anchors) is served by the fork-content-not-anchors rule for free.

## v3.0 — "The Data-Driven Site" (modular · data-driven · agent-compatible)

- **Chunks-as-content compiler**: `scripts/sync-chunks.mjs` stamps chunk content into
  marked containers at BUILD time (never runtime — GitHub Pages static HTML and the
  AI-crawler posture are non-negotiable). Start with about.html's factual blocks (bio,
  awards, contact). Containers carry `id="chunk-N"`; chunk urls point at them;
  arriving from a search result highlights the exact words. Result and page become the
  same object; the audit becomes structural for rendered chunks.
- **Resource register**: derived from john-hanacek.json at load — 'linkedin',
  'socials', 'email', 'resume' yield the clean actionable row, not prose. (Grammar
  note ratified with John pending: Enter on a matched resource card is the deliberate
  departure exception.)
- **Site-wide jump index**: dev script bakes every page's `.nav-right` TOC into a
  manifest; every section is typeable from anywhere.
- **Navigational query routing**: destination-shaped queries (page, section, resource)
  lead with the lean jump row; informational queries lead with the postcard.
- **Agent compatibility**: document the chunk schema (chunks JSON as the site's public
  read API); complete the JSON-LD graph; llms.txt points agents at chunks + anchors;
  stable `#chunk-N` anchors site-wide; semantics/ARIA pass.
- **Exit criteria:** editing a chunk updates the page and the index in one move;
  'linkedin' / 'awards' / 'go to design' each resolve in one keystroke path; an AI
  agent given the site can answer "how does John think" from the published data alone.

## Priority order (2026-09-09 — "get me employed and clients")

John's ruling: the site's job right now is to be a portfolio that shows how advanced a
designer/developer he is, through structure, modularity and the story of its data.
People are looking at it from a month of applications. Everything that serves that
comes first; the fish and the canvas come back after v3, when the site may become
*only* the canvas (see "v4 — The Canvas" below). This section supersedes the two
sequencing sections that follow it; they are kept for the record.

### P0 — "Employable" (now; ships as v2.1x, tagged as it lands)

| # | Work | Owner | Notes |
|---|---|---|---|
| 1 | **v2.5 Funnel, phases A–D** | agent | MERGED 2026-09-09 (lede/funnel-v25, reviewed MERGE AS IS, all gates green). Open from the review, John's calls: (a) quotes live in the wall, not the tracks — the brief said so, plan question 11 said the opposite, so the shared tail is still 37–47% of the document, not the ~25% target; (b) the other-track strip sits between testimonials and Fit, not below the tail; (c) the TOC keeps both track links (aria-current only). |
| 2 | v2.5 phase E — coaching-track outcomes | **John** | the design track proves; coaching only describes |
| 3 | v2.5 phase F — calendar attribution | **John** (5 min) | RESOLVED 2026-09-09: the `calendar.app.google` short link 302s and drops any query string, so no parameter survives into a booking; Google documents no prefill for appointment schedules; multiple booking pages are paid-Workspace only. Do this instead: Calendar → Appointment schedules → Edit → Booking form → Add an item → required multiple-choice "Which are you here about?" (AI coaching for founders / Founding design for teams). Answer lands in the event. Keep the per-track mailto subjects. |
| 4 | **Deep Sea Terminal audit, parts 1–2** | parallel session (in progress 2026-09-09) | type scale + weight ladder in shared.css / jh-chrome.css / search-overlay.css. **Report to be checked into `Agent Reference/`** — it is the record of what part 3 must finish |
| 5 | Audit part 3 — token literals — **MERGED 2026-09-09 (v2.09)**: overlay 43 → 0, shared 1 → 0, jh-chrome down to the two token blocks; engine tokens with light values; `--ink-affirm`. Left by design: canvas JS palettes, theme-color bootstraps, the `.lp-select` data-URI chevron, two markup attrs in design.html (510, 549). | agent | measured 2026-09-09: 41 raw palette literals in `scripts/search-overlay.css`, 25 in `design.html` inline CSS, 9 in `styles/jh-chrome.css`, 4 in index, 5 in art. Target: zero outside the token block; every colour is a token so light mode cannot break again |
| 6 | Daylight branch fate | **John** | `worktree-daylight` / DESIGN_REFRESH_PLAN phases 1–4 mostly shipped inside v2 (tokens, light/dark). Decide: salvage what remains into part 3, then delete the worktree and branch |
| 7 | GoatCounter site code | **John** | the whole analytics switch; wired in v2.08 |
| 8 | Anchor ratchet — **16 → 3 MERGED 2026-09-09 (v2.09)**; the three left are the personal chunks 30–32 awaiting John's ruling | agent | case studies + playground + writing get section ids; personal chunks 30–32 → an "off the clock" line on About or search-only (**John**) |
| 9 | Blok Dok card — **MERGED 2026-09-09** at the end of `#pastwork` (chronological; John may move it to `#projects`) | agent | eleven photos already in `Assets/blokdok/`, entry in resume.json |
| 10 | How I Work cards — **MERGED 2026-09-09**: two sentences + "more →" into the bar | agent | chunks keep the full text |
| 11 | Lane resumes on demand + LinkedIn sync | agent / **John** | `build-resume.mjs --lane=…` already exists; John pastes the LinkedIn blocks |
| 12 | Search polish leftovers | agent | trophy camera-orbit, long-answer fold, phone tier strip density |

Exit: services page converts by track; no raw palette literal outside token blocks; anchorcheck at 0;
GoatCounter counting; resume, LinkedIn and site say the same thing.

### P1 — "Proof" (after P0, before v3)

- **Playground v1** (was v2.2) — curation only: READI, the fish demo, the 3D sync demo,
  hypercube, OpenProse review canvas, the AvatarMEDIC web archive if John stands it up;
  everything else sidelined. No new features.
- **Case studies get compiled outcome blocks** — nanome2.html and openprose.html read
  their figures from the site record the way About does, so a number lives in one place.
- Figures (was v2.3) become optional content; they ride only if a cycle has room.

### P2 — v3.0 "The Data-Driven Site" (pulled forward)

v2.07–v2.08 already built the mechanism for one page: one JSON, a dev-time compiler,
static HTML that stays static, chunks and schema regenerated from the same truth. v3.0
is that mechanism applied everywhere:

1. `Assets/resume.json` grows into the **site record** (projects, clients, endorsements,
   pieces, case-study figures, playground manifest).
2. design.html's client and work cards, services.html's proof strip, the media-kit
   boards and the JSON-LD compile from it; About already does.
3. Chunks are generated, never hand-edited; CHUNK_AUDIT becomes their evidence table.
4. Exit criteria: anchorcheck at 0; every fact on the site traceable to one JSON path;
   an agent can answer "how does John think" and "what has he shipped" from the
   published data alone.
5. First visitor-facing experiment: **"Ask a question"** (opt-in query sharing) with
   the "How did you find me" chips; store TBD (Supabase insert-only is the candidate).

### Later — after v3

- **True Ink** (was v2.4) and the Phase 7 fish behaviors. Engine polish; nothing a
  hiring manager sees first. Order-independent, so it can absorb spare capacity, but it
  no longer gates anything.
- **Guestbook / "Leave a fish"** — OPEN. John likes it and the tank would fill. If
  revisited, the question is population, not storage: a rotating shoal (newest N), a
  daily reef, or fish that earn permanence by being fed. Not to be built without a ruling.
- **v4 — "The Canvas" (vision, not scheduled).** John's thought while looking at v3:
  the 1-2-3 guide could become the whole thing — the site as one canvas, no sub-pages,
  the data record answering through the bar and the fish carrying the story. v3's job
  is to make that possible by putting every fact in data first; v4 decides whether the
  pages still need to exist.

## Sequencing & the running ratchet (superseded 2026-09-09 by "Priority order" above — kept for the record)

v2.1 → v2.2 → v2.3 → v2.4 → v2.5 → v3.0. Data first (John's call: philosophy into the
data sooner than the figures), curation second, extraction third, engine polish fourth,
funnel fifth, architecture last — each milestone independently shippable and tagged.

Two milestones are order-independent and exist to absorb agent capacity while
John-input work waits on marks. **v2.4** is a pure engine track with no data
dependency. **v2.5** phases A–D are pure structure and copy on one page, touch no
shared script, and are the cheapest real conversion win in the plan — a case can be
made for pulling them forward, since services.html is the page that has to work
hardest while the rest of the site gets better. Its phase E is John-blocked, and it
should land BEFORE v3.0's chunks-as-content compiler so the compiler is built knowing
the page forks (see the interaction note in v2.5).

**UI/UX ratchet (continuous, any milestone):** de-boxing follow-through as John spots
survivors worth cutting (portrait ring? quote accents?); overlay contact-sheet rounds;
mobile QA passes; a11y sweeps. Small fixes ride whatever cycle is open.

## Housekeeping ledger (carried into v2.1)

| Item | Owner | State |
|---|---|---|
| Delete dead branches (`feature/nav-responsive…`, `claude/check-earth-star…`, `claude/strip-think-tags…`, `claude/personal-site-review…` — all fully merged/orphaned), daylight worktree+branch, the 2026-08-04 stash | **John** (permission layer blocks the agent) | commands handed over 2026-08-30 |
| `Assets/Transfyr_Lockup_Black (1).svg` untracked original | John | delete when convenient (inlined copy shipped) |
| CHUNK_AUDIT.md marks (§A–F, §G, §H) | John | folds into v2.1 |
| Vimeo God Like — re-host as own copy | John | swap in via f775ced standard + audit |
| jhana.zone dead parking A record | John (registrar) | blocks poster capture; hits visitors |
| fish-demo/fish.js rebase onto fish-engine | John (source is local-only) | when convenient |
| phase6a full modernization to the one-surface contract | agent | minimal re-point done; rewrite pending |
| Deferred from v2: LFM2.5 embedder swap (device-QA gated), Ollama tool-use, Phase 7 fish behaviors | agent + John | unchanged; Phase 7 behaviors should land AFTER v2.4 (recognition/placement first — behaviors tune better on a truthful spawn) |
| services.html funnel: naming collisions + duplicated quotes (v2.5 phases B) | agent | measured 2026-09-09; pure subtraction, no ruling needed |
| Chunk 18 `url` still points at legacy `services.html#design-services` | agent + John | update to `#design` under the CHUNK_AUDIT rule; legacy remap stays as the net |
| Coaching-track outcomes + figures (v2.5 phase E) | **John** | the design track proves with three named outcomes; coaching has one quote and no results |
| Google appointment-scheduling: can a booking carry a track parameter? | agent (research) | gates v2.5 phase F; the primary CTA is currently unattributable |

## Decisions John owes this plan

1. Ratify the milestone cut (or reorder — v2.2 and v2.3 are swappable).
2. teamready.xyz: frameable (you set headers) or poster-card?
3. The "how I think" chunk set: agent drafts from the essay for your marks, or you
   write seeds and the agent structures them?
4. Playground default view: featured-only, or featured-first-with-all-visible?
5. Resource register Enter-grammar exception (from the v3 arc) — confirm.
6. v2.4: does index.html ALSO drop the large-fish upper-half spawn teleport
   (recommended: spawn where drawn everywhere, territory behavior migrates the fish),
   or gate it on floorAffinity so the aquarium keeps today's spawn feel?
7. v2.4 stroke corpus: John records real strokes via the capture snippet (best
   signal, ~15 min on desktop + phone), or synthetic-only to start?
8. v2.4 stroke→fish morph animation: worth the polish pass, or spawn-in-place is
   enough?
9. v2.4 slot: run it fourth as written, pull it earlier, or interleave it while
   v2.1 waits on your chunk marks?
10. v2.5 pre-choice default: what does a visitor see at bare `services.html`, before
    they have chosen? Today it silently defaults to coaching, so the coaching door is
    a no-op and the design track is hidden from every un-chosen arrival (crawlers
    included). Options: (a) a short chooser — both tracks folded to equal summary
    strips, tail hidden until a door is picked, which is the most faithful reading of
    "funnel them in"; (b) keep coaching as the default; (c) show everything until a
    choice is made. Recommended (a). Your "chosen only" ruling settles what happens
    AFTER the choice, not before it.
11. v2.5 quote strategy: keep the quotes inside the tracks and cut the wall down to
    the voices that belong to neither (Inga, Hurriyet Ok, Ben Reed), or strip the
    in-track quotes and keep the wall whole? Recommended the former — a quote does
    more work next to the thing it vouches for.
12. v2.5 slot: run it fifth as written, or pull phases A–D forward ahead of v2.2/v2.3
    (they are one page, no shared script, and the funnel is what converts)?

11. **Deep Sea Terminal audit report** — check it into `Agent Reference/` so part 3 has a record to finish against.
12. **Daylight branch** — salvage into audit part 3, then delete `worktree-daylight` and its branch, or keep?
13. **GoatCounter site code** — the analytics switch.
14. **Personal chunks 30–32** — an "off the clock" line on About, or search-only.
15. **Coaching-track outcomes** (v2.5 phase E) — the coaching side has one quote and no results.
