# Search Command Bar — Structure First, Models as Garnish
*Status: **BUILT (Aug 2026) — local, pre-QA-gate.** All four phases implemented and
verified headless (suites in `search-tests/`, all green). Supersedes: SEARCH_COMMANDS |
Absorbs: SEARCH_ENRICHMENT's url/anchor work | Defers: SEARCH_HYBRID*

> **Build record (2026-08-24):**
> - **P1 shipped** — `scripts/search-core.js` (pipeline + knowledge + registry, zero
>   DOM); overlay + search.html are thin shells over an `el(name)` adapter. Deliberate
>   unifications: search.html gained the iOS WebGPU gate, lazy Transformers.js import,
>   custom-endpoint consent, and engine-state broadcast. 26-check parity suite green.
> - **P2 shipped** — embedder measured and chosen (`Xenova/all-MiniLM-L6-v2`, 23.7 MB
>   q8 WASM — see SEARCH_EMBEDDER_RESEARCH.md incl. two repo traps); vectors built by
>   `scripts/build-chunk-vectors.mjs` into search-chunks.json (int8 base64, ~0.5 KB/chunk).
>   Fusion is **two-mode RRF**, tuned offline (fusionlab): intent-fired queries trust the
>   grammar (WB 1.5/WS 1.0/floor .25 — 5/5), fallthrough queries trust meaning
>   (WB 1.0/WS 1.15/floor .18 — 21/22 top-3, 5/5 keyword-top-1). Fusion's BM25 leg
>   STRIPS pronouns instead of resolving to the name (measured: name-resolution handed
>   About a 145.6 BM25 score for "prizes he has been given").
> - **P3 shipped** — registry (`JH_COMMANDS` queue + `JHSearchCore.register`); actions on
>   index (feed/logic/scare) + design (clear walls/fish, labels, feed, spawn-via-ichthys);
>   synthetic nav + section commands from the DOM `.nav-right`; routed rendering (intent
>   card → Actions → On this page → Across the site); all 42 chunks carry verified `url`s,
>   titles are links; services/contact/schedule intent cards live. Command matching:
>   uncapped BM25/8 vs cosine≥.45, floor .6, command-corpus stopwords incl. generic verbs.
> - **P4 partial** — tool-use SHIPPED for LMStudio/Custom: registry → OpenAI tools,
>   streamed tool_calls → confirm chips (never auto-run), E2E-verified against a mock
>   endpoint (`search-tests/mock-llm.mjs`). Bonus fix: local detection skips
>   embedding-only models (a real Ollama+nomic-embed-text produced silent garbage).
>   **Open:** LFM2.5-350M swap (gated on John's real-device latency), Ollama tool-use,
>   keyboard ↑↓ result navigation. Templated no-LLM answers were deliberately DROPPED —
>   intent cards + hints + reordering already deliver the value; prose templates read
>   as redundant next to the result cards.
> - **P5 shipped (same day)** — topline gating fixed (group renders only when search put
>   a local chunk #1 — locality labels relevance, never fabricates it); confident-gated
>   overview slot upgrading in place (composed-from-sources byline → model byline; a
>   showing overview dims during generation and the first token takes the slot); related
>   chips from shipped vectors (cos ≥ .45, top-2 overview / top-1 per card); media cards
>   with re-verified inventory (nanome + AvatarMEDIC + HoloTRIAGE + OpenProse videos as
>   click-to-play posters, Aerospace Award .glb as LIVE auto-rotating model-viewer,
>   CDN injected only when a 3D card first renders, auto-rotate off under
>   prefers-reduced-motion). `search-tests/phase5.mjs` green; phases 1–4 regression green.
> - **John's QA gates before ship:** real-device pass (laptop + iPhone — semantic tier
>   load time/feel), visual polish pass, then version bump + sync-version + tag.

## Thesis

The search becomes the site's command bar: it searches, it acts on the current page, it
answers — and every capability is layered so the deterministic floor does most of the work
and the models are delight on top. Old meets new without compromise, just augmentation:
the pre-LLM craft (intent grammars, hand-authored chunks, composable structure — the
Scratch-era way of making systems feel smart) is the load-bearing wall; embeddings and
LLMs are progressive enhancement. The portfolio is the living demo of the pattern; the
pattern is productizable (a zero-backend, static-site command bar where structure is the
floor and models are the ceiling).

## Findings that drove this shape (measured August 2026)

1. **The divergence law.** `scripts/search-overlay.js` and `search.html` share 14
   functions. Diffed after normalizing the `so-` element-id dialect: both QUERY_INTENTS
   tables (17 entries) and both system prompts (526 chars) are **byte-identical**; half
   the functions are exact twins; all real drift is UI wiring (`updateEngineBar` at 0.56
   similarity — exactly where the historical enable-button bug lived). Lesson: **data
   syncs fine by hand, control flow doesn't.** So: knowledge in JSON, behavior in one
   shared core, presentation per-surface. Same cure as v1.8's `fish-engine.js` /
   `shape-detection.js` extractions.
2. **This was never really RAG.** The corpus is 42 hand-authored, answer-shaped chunks
   (~15KB — fits whole in any model's context). Retrieval is selection-for-attention +
   source-card UI, not a scale problem. Decompose what generation adds: (a) paraphrase
   recall → solvable with embeddings, no generation; (b) multi-chunk prose → solvable
   structurally with intent → chunks → template cards; (c) open-ended conversation →
   the only thing that truly needs a generative model. Organizing concept = the tier
   ladder, not "RAG."
3. **Understanding and speaking split at very different weights.** Generation has a
   quality floor near 350M params (SEARCH_MODEL_RESEARCH: SmolLM2-360M IFEval 41 vs
   LFM2.5-350M's 65; gemma-270m broken on WebGPU). But *understanding* — semantic
   recall, intent routing — needs only a tiny embedder (~10–30MB class) that runs on
   **WASM, no WebGPU, iOS included**. Most of the "it understands me" feeling can ship
   at ~4% of the current 585MB model's weight, on every device.

## The Tier Ladder

| Tier | Weight | Runs on | Gives |
|---|---|---|---|
| 0 — structure | 0 MB | everything | BM25, intent grammar, action registry, templated answer cards |
| 0.5 — semantic *(new)* | ~10–30 MB | everything incl. phones | paraphrase recall (hybrid scoring), embedding intent/action routing, related-chunks |
| 1 — synthesis | ~255 MB (LFM2.5 target) | WebGPU desktop | prose answers, tool-use over the registry |
| 2 — local | user's own | localhost (LMStudio/Ollama/BYOM) | full conversation, big models |

Every tier degrades to the one below it. Nothing above tier 0 is required for the bar
to search, act, and answer.

---

## Phase 1 — `scripts/search-core.js` (the v1.8 move)

End the two-body problem **before** any new feature doubles it.

**Moves into the core (zero DOM references):** QUERY_INTENTS + `expandQuery`, system
prompts, chunk loading + MiniSearch setup + `search`, engine detection/probing
(`checkLocalModels`, `probeCustomEndpoint`, WebGPU check, model cache check), generation
(`generateAnswer*`, `runGeneration`, `stripThink`), the opt-in/localStorage logic, and —
new in Phase 3 — the command registry.

**Stays per-surface (thin shells):** overlay DOM creation/open/close/focus trap/nav
triggers; search.html's static page wiring. Shells hand the core element refs (or
callbacks) for: results container, AI answer el, engine bar els, progress els.

```js
// sketch
const core = JHSearchCore({ chunksUrl, onResults, onAnswerToken, onEngineState });
core.query('can he code');          // → BM25 (+Phase-2 hybrid) results via onResults
core.ask('why hire him');           // → tiered generation via onAnswerToken
core.detectLocal({ userInitiated }); core.loadBrowserModel(onProgress);
```

**Exit criteria:** overlay and search.html both run from the core; a grep shows exactly
one copy of QUERY_INTENTS, the prompts, and each pipeline function; behavior parity on
both surfaces (open, search, load model, detect local, generate, cancel); zero console
errors; the CLAUDE.md "keep the two in step" warning gets deleted because it no longer
describes reality.

## Phase 2 — Semantic Layer (Tier 0.5)

**Measurement gate first** (house rule: measured, not quoted). Before committing to a
model, produce a SEARCH_MODEL_RESEARCH-style table: actual ONNX blob sizes via the HF
API, WASM (not WebGPU) load + embed latency on real hardware incl. an iPhone, retrieval
quality spot-check against ~20 canned queries the regex grammar currently misses.
Candidates to measure: all-MiniLM-L6-v2 (q8), snowflake-arctic-embed-xs,
bge-small-en-v1.5, and a Model2Vec/potion static-embedding option (no transformer at
inference — word-vector-era mechanics distilled from modern models; maximum on-theme).

**What ships:**
- `scripts/build-chunk-vectors.mjs` — dev-time script (sync-version.mjs pattern):
  embeds every chunk + every intent/action exemplar phrase, quantizes to int8, writes
  vectors into `Assets/search-chunks.json`. 42 chunks × 256 dims ≈ 10KB. Vectors are
  build output, chunks stay the hand-authored source of truth.
- Query-side embedder in the core, lazy-loaded on first keystroke pause, WASM backend.
- **Hybrid scoring:** normalized BM25 + cosine, tuned so exact keyword hits still win.
- **Embedding intent router:** each intent/action carries `hints` (exemplar phrases);
  query embeds once, nearest-neighbor against all exemplars. Regex patterns stay as the
  zero-cost fast path; embeddings catch the paraphrases regex misses. Deterministic,
  inspectable — no generation involved.
- **Related chunks:** top-cosine neighbors render as "related →" links on result cards,
  complementing Phase 3's hand-authored `rel`.

**Exit criteria:** the measurement table exists in this doc's folder; semantic tier
loads and works on iPhone Safari (where WebGPU is banned); the 20-query miss list goes
majority-hit; BM25-only path still works with the embedder absent/failed; total added
page weight at rest = 0 (everything lazy).

## Phase 3 — The Command Bar (registry + actions + page topline)

**Command registry** (in the core; pages declare, the bar consumes):

```js
// any page, after jh-chrome loads
JHSearchCore.register({
    id: 'fish.feed',   title: 'Feed the fish',
    tags: 'food feed fish drop',
    hints: ['feed the fish', 'give them food', 'drop some food'],
    detail: 'Drops food into the hero aquarium',
    run: () => heroFish.addFoodAt(/* open water */),
    page: 'index',      // registered only where it can run
});
```

First registrants (all already-shipped APIs): index — feed fish, toggle logic view
(`setDebug`), scare (`scareFishAt`); design — clear walls, labels toggle, spawn fish;
writing — theme toggle; site-wide — go-to-page/section navigation commands generated
from the chunk `url` fields and each page's `.nav-right` TOC (harvested from the DOM at
open time — no JSON to maintain for anchors).

**Actions are chunks.** Registry entries index into the same MiniSearch instance
(`type:'action'`, boosted) and embed via the same `hints`. Typing "feed the fish" ranks
the action card first; Enter runs it. Zero models involved — that's the demo-able magic.

**Result routing order** (topline down): intent cards (the SEARCH_COMMANDS
services/contact/schedule cards, absorbed here) → **actions on this page** → **"On this
page"** boosted current-page chunks + section anchors → site-wide results → AI answer.

**Chunk enrichment** (from SEARCH_ENRICHMENT, which this absorbs): `url` on every chunk
per that doc's table (prerequisite for navigation commands); optional `type`
(`fact|action|section`) and `rel` (chunk-id links — Nanome *is-case-study-of* design)
for templated composition and "related →". Rich media cards (video/3D/image) remain
specified in SEARCH_ENRICHMENT and can ship any time after `url` lands.

**Templated answers (no-LLM composition):** when an intent fires with no model active,
compose an answer card from its matched chunks via a per-intent template instead of a
bare hint line. Deterministic prose from structure — it can only arrange facts, never
invent them.

**Exit criteria:** "feed the fish" typed on index feeds the fish; "clear the maze" on
design clears walls; "go to awards" jumps to about#awards from any page; actions for
other pages don't appear (or appear as navigate-then-hint); all of the above with AI
toggled off and on a phone; SEARCH_COMMANDS' verification list passes as written.

## Phase 4 — Generation as Garnish

- **LFM2.5-350M swap** per SEARCH_MODEL_RESEARCH step 3 (open): 585 → 255MB, generic
  `pipeline()` path, its own measurement gate (first-token latency, chat template,
  `enable_thinking` handling).
- **Tool-use over the registry:** the registry entries *are* the tool schema —
  `{name: id, description: title + detail}` handed to Tier 1/2 as OpenAI-style tools
  (the metadoodle1.html pattern, same localhost endpoint). The model can only invoke
  what structure already defines: augmentation, not dependency. Guard: model-initiated
  actions render as a confirm chip, not auto-run.
- **SEARCH_HYBRID** (draft→refine) stays deferred — revisit only if Tier 1 answer
  quality disappoints after the LFM2.5 swap.

**Exit criteria:** with LMStudio running, "make something happen in the tank" yields a
tool call rendered as a tappable action chip; with no model, the same phrase still
nearest-neighbors to a registered action via Tier 0.5.

---

## Phase 5 — Explorer (decided with John, 2026-08-24)

The bar becomes the site's periscope: rich media inline, chained exploration,
and an overview paragraph that composes structurally and upgrades to the model.
Decisions: overview is **confident-gated**; videos are **click-to-play**
(posters, no autoplay in the overlay); 3D is **live** (`<model-viewer>`
auto-rotating inline, CDN lazy-loaded only when a 3D card first renders).

1. **Topline gating fix (bug).** "On this page" currently promotes ANY
   current-page chunk found anywhere in results — locality overriding
   relevance ("awards" on index hoists weak index chunks over the real Awards
   result). New rule: the group renders **only when search already put a
   local chunk at #1**; locals within the global top 3 may join it. Locality
   labels relevance, never fabricates it.
2. **Overview slot.** One slot (the existing answer area), tiers upgrade it
   in place: instantly a deterministic composition — intent hint as lead +
   top chunk's answer-shaped content + related chips — byline "composed from
   sources"; a model tier replaces it in the same slot with its own byline.
   **Confidence gate:** an intent fired, OR the top result dominates
   (≥1.5× the runner-up score). No overview when an intent CARD is shown
   (the doorway is the answer) or when confidence isn't met — an overview on
   a garbage query reads as bluffing.
3. **Related chips.** Cosine neighbors from the SHIPPED chunk vectors (zero
   download, no embedder needed): top-2 on the overview, top-1 per result
   card, clickable via the chunks' verified `url`s. Search → result →
   related → related is the exploration mechanic.
4. **Media cards** (surviving SEARCH_ENRICHMENT scope, inventory re-verified
   against the actual post-compression Assets/ before any path enters the
   JSON): `video` + poster → click-to-play `<video muted playsinline>`
   (embeds have no audio track by design); `model3d` → live auto-rotating
   `<model-viewer>` (~120px, `camera-controls`, auto-rotate suppressed under
   prefers-reduced-motion); images already render via `result-thumb`.
5. **QA:** `search-tests/phase5.mjs` (gating, overview gate + upgrade,
   chips, media incl. lazy CDN injection) + full phase1–4 regression.

## The MVP Dev Push — Postcard · Scene · Escalation (decided 2026-08-24)

*The demo John hires with: elegant search, LLM escalation, commands + page-state
questions — on a result surface that is itself the design argument. Three ratchets,
in this order (the scene census and plan cards render INTO the postcard, so the
postcard substrate lands first).*

### 6a — The Postcard (microdense, density-adaptive result surface)

Replaces the card list + overview split with ONE composed surface: a dense,
Tufte-grade postcard whose **density adapts to query specificity**. "meta" (one
decisive hit) → the whole postcard is that chunk's dossier; "award" (two hits) →
two compact modules; broad query → a waterfall of one-liners. The TL;DR waterfalls
in; everything below it earns its lines.

- **LOD ladder per chunk**: L0 inline mention (title in a running "also:" line) →
  L1 one-liner (title · fact strip) → L2 dense sentence + micro media chip →
  L3 dossier (paragraph wrapped around an inline media obstacle via pretext-wrap —
  prose on BOTH sides, the signature move CSS cannot do).
- **The allocator is pretext arithmetic**: postcard has a line budget (≈14 desktop);
  for each module, `countPreparedLines(prepared, width)` picks the largest LOD that
  fits — deterministic typography, no clamp guessing, hyphenation via pretext's
  discretionary hyphens. Allocation = relevance-share: dominant result takes L3,
  runners-up L1/L2, tail collapses to one L0 run.
- **Semantic collapse is DEV-TIME, not runtime**: chunks gain `micro` (~40ch) and
  `tldr` (~90ch) fields — generated once by a build script, John-reviewed, then
  frozen data. Runtime stays deterministic. (This also retires the Phase 5
  overview-duplication nit: the deterministic lead becomes the tldr, never the
  full chunk text the card below repeats.)
- **Visual grammar ported from the OpenProse explorations** (audit refs in the
  build record): smallmult card skeleton; `viewBox` + `preserveAspectRatio="none"`
  + `vector-effect: non-scaling-stroke` sparks (72×20 legibility floor — 46×14
  measured as "a blob"); sub-visible hairline references; end-dot = "now";
  two-token axes; `tnum` numerics; middot field separators; colophon-counts fact
  strips (the cheapest high-density row — maps 1:1 to census output); a four-step
  ink ramp translated to Deep Sea (bright → primary → muted → ghost) so density
  reads as hierarchy; typographic flags (†), not color boxes.
- **LOD interactions**: hover = the one-shared-node tooltip pattern (fixed,
  repositioned, zero per-module DOM) showing the next LOD up; click = pin module
  to L3 and re-run the allocator. Mobile (no hover): a compact/comfortable
  density toggle (persisted), tap to expand. Reduced-motion: no draw-ins.
- **Sparklines only where a real series exists** — fact strips + micro-glyphs are
  the default; a *session sparkline* (fish/walls counts over the visit, sampled)
  is the honest first real series. Stretch, not gate.
- QA: `postcard-lab.mjs` (offline: allocation determinism across widths ×
  query-specificity fixtures) + phase6a headless. **Phases 1–5 suites need
  expectation updates** (the .result card DOM changes) — budgeted, not incidental.

### 6b — Scene Language (grammar, plan card, materialization, census)
As specified below (original Phase 6). Census renders as a postcard fact-strip
module bylined "read from the canvas"; the plan card renders in the postcard's
visual grammar.

### 6c — Elegant LLM escalation
The model never replaces the deterministic surface — it **elaborates into a
prepared seam**: the postcard lead stays ("composed from sources"), the model's
answer appends beneath it with its own byline, streaming into reserved lines.
"Collects artifacts": chunks/media the model's answer cites become chips pinned
to a postcard artifact rail. Scene tools (`scene_execute`/`scene_census`) land
here; tool plan-cards batch-confirm. Exit = the three demo beats run end-to-end:
(1) "meta" vs "award" density adaptation, (2) escalation slotting in without
replacing structure, (3) add-fish / census / draw-and-verify.


> **MVP push build record (2026-08-24, same-day ratchet):**
> - **6a shipped** — the Postcard. LOD allocator on pretext arithmetic (line counts at the
>   real font; estimate fallback), density adapting to specificity ("meta" → one wrapped
>   dossier, "award" → graded field, broad → waterfall + tail run); `micro`/`tldr` authored
>   for all 42 chunks (dev-time data, **John review pending**); dossier prose pretext-wraps
>   BOTH sides of its media obstacle (dynamic import in a classic script resolves against the
>   SCRIPT url — resolved via document.baseURI, the bug of the day); hover = one shared
>   tooltip node; click pins to dossier; compact/comfortable toggle persisted; empty-state
>   suggestion chips. storeFields must carry every card field (micro/tldr were invisible on
>   the BM25 path until added).
> - **6b shipped** — scene language. Grammar (3 verbs · counts · sizes · 9 entities ·
>   inside/near/intersecting · never bluffs), plan card before execution, materialization
>   through the REAL recognizer (design: synthetic startDraw/draw/endDraw pointer strokes —
>   providers close over the sealed page state; index: processStroke + tier-scaled ichthys),
>   caps clamp with honest receipts ("tank limit"), census bylined "read from the canvas",
>   cross-utterance reference ("the circle" = the one on canvas), enclosure verified by
>   `insideEnclosure` — receipts read "2/2 enclosed". Receipts persist on the plan object
>   (the semantic-ready re-render was resurrecting run buttons).
> - **6c shipped** — escalation seam (model appends, never replaces; "elaboration" eyebrow),
>   artifact rail collected deterministically from context chunks, census line grounds the
>   model's context, and `scene_execute` tool: the model EMITS SCENE LANGUAGE and the same
>   deterministic parser gates it into the same plan card — confirm-first, verified E2E via
>   the extended mock.
> - All eight suites green (phase1–6c). 'spawn a fish' now parses as scene language —
>   the plan card superseded the bare command card by design.
> - **Tier strip shipped (same day, John's UX rethink):** the engine bar + verbose panel
>   became ONE line below the search input — the intelligence ladder itself:
>   `keyword ● · semantic ◐ · qwen ○ ↓585mb · local ○ · ai on ⌄`. Facts render as facts
>   (keyword/semantic are not buttons that lie), loadable tiers wear their cost as their
>   label, the active engine glows its color, state is legible with the panel collapsed,
>   and clicks proxy to the existing panel controls so consent semantics (Detect = the
>   opt-in) are unchanged. Sequence is now search → options → results on both surfaces;
>   the BM25 pseudo-button section and the engine-bar Load CTA are deleted. Trap for the
>   record: updateEngineBar's AI-off early-return skipped the strip render, and a silent
>   no-op replace() left the tail call missing — assert your replaces. phase7 suite green.
> - **Polish pass (2026-08-25, John's QA feedback):** four fixes, phase8 suite green +
>   full nine-suite regression green.
>   1. *Actions gating* — "who's john" was surfacing "Scare the fish": the possessive
>      tokenized to an orphan `s`, which with `prefix: true` prefix-matched
>      **S**tartle/**S**care (BM25 10.7) and **S**ervices (7.4). matchCommands now strips
>      single-char tokens (same bug class as the old "a"→"art" graze). Imperatives and
>      nav commands still match.
>   2. *Eyebrow* — the postcard header showed a literal "tl;dr" whenever no intent fired,
>      i.e. almost always. Now: intent hint when there is one, nothing (spacer + density
>      toggle) otherwise. Filler is not signal.
>   3. *Density = SEMANTIC zoom* — the compact/comfortable toggle only changed type size
>      (13→14px) and budget. Now comfortable promotes every module one full LOD tier
>      (micro one-liner → tldr sentence → dossier) and widens the L1 window into the
>      tail; the pretext budget pass still downgrades what can't fit. Measured on
>      "nanome": `2,1,1,1 → 3,2,2,1,1,1`. The wording changes, not just the font.
>   4. *Shallows (light) theme* — search-overlay.css + search.html's inline styles had
>      ~100 hardcoded dark literals. All retargeted through the site's rgb-triplet
>      tokens (`--cyan-dim-rgb`/`--surface-rgb`/`--panel-rgb`/`--gold-rgb`/`--ink-rgb`,
>      which jh-chrome.css flips under `[data-theme="light"]`), plus a light block for
>      the overlay's scoped `--so-*` text tokens and the engine accents (same hues at
>      ink weight: blue #0f6a95, purple #7c3aed, orange #b45309, green #15803d — the
>      solid `#4ade80` "ok" literals now route through `--engine-custom`). Shadows
>      soften from black to teal on paper.
>   Also found en route: **search.html never linked search-overlay.css** (every other
>   page does) — postcard/cmd-card/tier-strip markup was rendering unstyled there; now
>   linked. And its `.ai-answer-wrap`/`#sourcesSection` sit OUTSIDE `.search-wrap` in
>   the markup with no width constraint — results bled to the viewport edge; pinned to
>   the same 660px column. Harness trap for the record: headless Chromium reports
>   `prefers-color-scheme: light`, so un-forced "dark baseline" screenshots are
>   silently light — pass `colorScheme: 'dark'` to newContext (README updated).

## Phase 6 — Scene Language (the mini-MetaMedium MVP)

*Decided with John 2026-08-24. This is the hiring-demo centerpiece: "draw it or say it —
same structure." Substrate: CONTROL_SURFACES.md (the exhaustive audit).*

**The architecture is one shared intermediate representation** — a scene program of
entities + quantities + spatial relations. Drawing produces it (recognition), language
produces it (a small deterministic grammar), and it reads back out as words (census).
The LLM tier emits the *same* program via a `scene_execute` tool and reads the world via
`scene_census` — model and grammar converge on one inspectable, executable structure.

### Scope (MVP)
- **Grammar v1** (Scratch-small, never bluffs — unparsed input falls through to search):
  verbs `add/draw/put`, `clear/remove`, `query`; quantities (digits, number words,
  "a couple", "max"); entities fish(small/medium/large)/coral/food/bubble/jellyfish +
  shapes circle/square/triangle/line; relations **intersecting, near, inside** (only);
  conjunction splitting on commas/"and"; anaphora — definite reference resolves to
  utterance entities first, then live canvas state.
- **Plan card UX**: the parse renders as a confirm card ("→ 2 lines, intersecting →
  1 square near circle① → 1 fish inside circle① — [Draw it]") before anything executes.
  The visible parse IS the thesis — structure shown, not inference hidden. Batch run,
  cap-aware receipts ("added 6 of 9 — tank limit").
- **Materialization through the recognizer**: synthesized strokes feed the SAME endDraw /
  processStroke path a hand does (ideal-outline strokes for closed shapes, the ichthys
  generator for fish) — same morphs, whispers, particles. Engine additions: a
  `spawnClassified` passthrough (exact-size placement) + `setLimits()` (both flagged
  🔧 in CONTROL_SURFACES §1).
- **Placement = greedy + verify**: intersecting via `segmentsIntersect`; near via
  combined-radii offset; inside via placement at interior **verified with
  `insideEnclosure(x,y)`** — the engine's own predicate stamps "✓ enclosed" on the
  receipt. The demo writes its own proof.
- **Census provider** (`describeScene()` per page): index = tank census by tier; design =
  shapes + `detectRelationships` relations + enclosure facts. Renders in the overview
  slot with a third byline: **"read from the canvas"** (alongside "composed from
  sources" and model bylines — three epistemic sources, all labeled).
- **Empty-state suggestions**: the open command bar currently shows nothing — cycle
  example utterances ("try: add 3 small fish") so the capability is discoverable in the
  first five seconds of a demo.
- **Tool tier**: `scene_execute(program)` + `scene_census()` handed to local models;
  tool calls render the same plan card (batched confirm, never auto-run).
- **QA**: `parse-lab.mjs` (offline: utterances → expected programs, house-style measured
  eval) + phase6 headless suite asserting real outcomes (fish count by tier; enclosure
  verified via the engine predicate).
- Design page needs one exposure: the sealed `recognizedShapes` (or a thin accessor) —
  its functions are global, its state is not (CONTROL_SURFACES §3).
- **Stretch (in only if cheap)**: remove-by-description ("erase the square") — shape
  lookup + a synthetic crossing stroke through `eraseCrossedShapes`.

### Explicitly deferred from MVP
`above/left/right` relations · scene persistence · meta-commands · writing/404
integration · behaviors (below).

## Phase 9 — Production Coherence (ratified with John, 2026-08-26)

*The command bar grew by accretion — results list, postcard, scene cards, seam — and
each layer brought its own chrome row and its own click meaning. Phase 9 makes it
production-ready: one interaction grammar, one stable surface, chrome that earns its
lines. Four slices, each independently shippable, in this order.*

### 9a — The Stable Surface (keystone; everything else composes onto it)
- **Morph, don't rebuild.** Today pin / unpin / density / semantic-ready /
  pretext-ready ALL call `renderResults()` → full `innerHTML` replace; the dossier
  paints unwrapped then pretext reflows it a beat later — John's "flashes a smaller
  size before returning." Fix: modules are keyed by `data-id`; when an interaction
  changes only LODs, swap ONLY the changed nodes (unchanged modules keep their DOM —
  a live `model-viewer` never re-initializes because a sibling was pinned). Structural
  changes (tail item promoted, group labels shift) fall back to full render WITH
  scroll preservation. Ready-callbacks upgrade in place only if the query is unchanged.
- **Sticky command frame.** The panel scrolls the input away (70vh overflow scrolls
  everything). Restructure both shells: input + tier strip (+ engine settings) become
  a non-scrolling glass frame; answer/results scroll beneath. On search.html the frame
  sticks under the fixed nav. The bar is NEVER off-screen — it is the product.
- **Chrome consolidation.** Up to four label rows can precede the first real line
  ("RESULTS ⓘ" · "ACTIONS" · "Showing…" · "On this page"). Collapse to ONE byline
  inside the postcard head: `[intent hint ·] ⓘ … [density ⊞]`. The "Actions" label
  dies (the gold run-chip already declares them). On-this-page / Across-the-site stay
  only when both groups exist, tighter.

### 9b — Fact granularity (the awards fix)
"awards" renders one monolith dossier: chunk 21 is five awards flattened into one
prose block with one trophy GLB. Extend the authored-data ladder one level down —
same philosophy as `micro`/`tldr`, runtime SELECTS, never generates: list-like chunks
(Awards, Experience, Shipped Products, Education, ~6 total) get dev-authored
`facts: [{t, d, year?, media?}]`. The dossier renders facts as microdense rows
(`AsMA R&D Innovation · robot digital twin · 2022`), each hover-tooltipped, each able
to carry its own media; the trophy sits beside its OWN row as the pretext obstacle.
Retrieval untouched (content string still feeds BM25 + vectors → no fusion re-tune,
no vector rebuild).

### 9c — One click grammar
- Click = semantic zoom in place (cheap and flash-free after 9a). Navigation gets one
  explicit affordance: the page badge becomes the link (`design ↗`) + `open ↗` in the
  dossier header. Titles KEEP navigating (web convention, a11y) but declare it —
  hover underline + ↗. (Full purist mode — click never navigates — is a one-line
  change on top if John wants it later.)
- Enter commits the top thing (action if present, else top result). ↑↓ traverses
  modules (was deferred; production grammar makes it mandatory). Esc is a ladder:
  unpin → clear → close.

### 9d — Workspace mode (desktop fullscreen)
A ⤢ toggle on the overlay — the playground focus-mode pattern, including its
`z-index: 1100`-above-nav lesson. Fullscreen = two-pane workspace: left, the postcard
waterfall staying compact; right, whatever's pinned (dossier + facts + media +
related), with the elaboration seam streaming below it. Pinning stops reflowing the
list; it fills the detail pane. Mobile is already fullscreen — it gets the sticky
frame and the density toggle in it, nothing more.

### QA
Each slice lands with a phase9 suite slice: morph stability (pin twice → unpinned
module DOM node identity preserved), scroll preservation, sticky frame in view after
scroll, facts render, keyboard traversal, workspace panes. Existing suites that
assert the removed chrome (the "Actions" label, "Results" section label) get updated
in the same commit as the removal — never after.

> **9a build record (2026-08-26, same-day):** shipped and green — phase9 suite + all
> eleven suites pass.
> - **Morph renderer.** `renderResults` now keys same-query re-renders off
>   `currentQueryRaw`: identical module/tail id-structure → `morphPostcard` swaps ONLY
>   the LOD-changed nodes (verified by DOM-identity witness: pinning a module leaves
>   its sibling's expando property alive); structural change → full render that
>   preserves the scroll anchor; NEW query → scroll resets to top. The pin flash is
>   gone — and pinning above the fold now reads as viewport-stable because scroll
>   anchoring compensates (phase9 asserts rect-stability, not frozen scrollTop —
>   scrollTop legitimately moves 120→205 while the reader's content holds still).
> - **Bug found by the morph work:** `doSearchOnly` rendered BEFORE assigning
>   `currentQueryRaw`, so the renderer's query tracker ran one query stale until a
>   semantic refine happened to heal it. Assignment moved above the render.
> - **The command frame.** Both shells restructured: `.so-command-frame` (input +
>   tier strip + engine settings, never scrolls) over `.so-panel-scroll` (flex column,
>   panel overflow moved off the panel); search.html's `.search-wrap` is
>   `position: sticky` under the fixed nav with a glass ground. The bar is never
>   off-screen on either surface.
> - **Chrome consolidation.** The shells' "Results ⓘ" label row and the "Actions"
>   group label are deleted; the fusion ⓘ moved into the postcard byline
>   (`.pc-info`, shared-tooltip `data-tip`). Postcard group eyebrows tightened.
> - phase7's structure assertion updated for the frame DOM (same commit as the
>   change, per the rule above); phase5's 500ms wait after "fish" bumped to 900 —
>   it flaked only under full-suite load (embedder download contention), passing
>   in isolation. Next: 9b facts granularity.

> **9b–9d build record (2026-08-26, same session):** the whole Phase 9 ratchet is
> shipped — phase9 covers all four slices and ALL ELEVEN suites pass.
> - **9b facts.** Six list-like chunks (Awards 21, Career Timeline 23, Shipped AI
>   Products 27, Skills 10, Expertise 22, Deliverables 41) carry dev-authored
>   `facts: [{t, d, y?, media?}]` — all verbatim from their content strings
>   (**John review pending**, same as micro/tldr). The dossier for a facts chunk is
>   rows, not a prose monolith; `media: true` puts the chunk's media beside its OWN
>   row (the trophy sits by the AsMA award, not looming over five). Compact density
>   shows `t · y` with detail in the hover tip; comfortable reveals detail inline —
>   the density toggle reaches INSIDE the dossier. Allocator costs a facts dossier
>   at rows+3. `facts` added to storeFields AND the hybridMerge output object (the
>   micro/tldr trap, remembered this time). No vector rebuild — content untouched.
> - **9c grammar.** The page badge is the explicit nav affordance (`design ↗`,
>   a real link); titles keep navigating but declare it (hover underline + ↗);
>   everything else on a module zooms in place. ↑↓ traverses actions → modules →
>   tail (`.pc-cursor`, dies on re-render); Enter COMMITS the top thing: cursor
>   item → plan-card confirm (the visible parse IS the confirm) → first action →
>   top result, flushing a pending debounce first. Esc is a four-rung ladder:
>   cursor → pin → query → close. Ladder implementation note: the core's input
>   keydown registers before the shells' (core.init precedes wireShellEvents), so
>   consuming a rung uses stopImmediatePropagation and the shell's close handler
>   only fires when nothing is left to unwind.
> - **9d workspace.** ⤢ in the tier-strip row (persisted, `jh-search-workspace`)
>   splits the overlay into `minmax(280px,5fr) 7fr` panes at ≥900px: the list is
>   capped at L2 (compact waterfall — the pane owns dossier depth) and pinning
>   fills `#so-detailPane` instead of reflowing the list; the elaboration seam
>   docks under the pane. `workspaceOn()` also checks the 900px media query so the
>   latched class can't strand a phone with no dossiers anywhere. Overlay z-index
>   was already 2000 — the playground's above-nav lesson didn't bite.
> - **Suite updates in the same commit as the behavior change:** phase1's single
>   Esc now walks the ladder (test clears the query first); phase6a's "non-link
>   zone" right-edge click landed on the NEW badge link and navigated away — it
>   targets `.pc-micro`/`.pc-prose` text now. Real bug found by that failure: the
>   overlay's `.pretext-layer` CSS copy was missing `pointer-events: none`
>   (shared.css had it) — added.

> **9e build record (2026-08-26, John's polish feedback):** four fixes, all eleven
> suites green.
> - **Media continuity.** The "ugly jump when switching semantic levels" was the
>   media frame dying with its module node. `harvestMedia`/`graftMedia` now carry
>   the LIVE element (model-viewer WebGL context, playing video, decoded img)
>   from old DOM into fresh markup on every path — morph swaps AND full renders —
>   with a 0.18s width/height transition covering the tier size change. Verified
>   by node identity across a density toggle.
> - **THE NO-SCROLL DOCTRINE** (John's rule: this component never scrolls; depth
>   comes from semantic zoom). The line budget is now FITTED to the real panel
>   viewport: render → measure → shrink → re-render, keyed by
>   query|density|viewport|workspace so morphs reuse the fitted value. The tail
>   caps at 8 items + "+N more" (tooltip lists the rest). Trap for the record: the
>   first fit loop subtracted PIXEL overflow from the LINE budget — fixed chrome
>   (heads, hint, paddings) is in the measurement but not the budget, so
>   comfortable's 459px overflow nuked 24 lines down to 4 in one step. The step is
>   now PROPORTIONAL: `allocate` reports the line-units actually spent and the
>   budget scales by (viewport / content). Consequence embraced: on short
>   viewports the ladder legitimately sheds depth (action cards keep priority) —
>   suites that assert depth shapes got tall (920px) viewports, and phase8's
>   density check asserts MAX tier (depth), not tier-sum (comfortable trades
>   breadth for depth under a fixed viewport, which is the doctrine working).
> - **The workspace pane is a pretext META-PARAGRAPH.** Not one dossier floating
>   in space: strata — the pinned/top/page-seed chunk at full depth, then its
>   nearest related chunks as running tldr prose, each stratum's media a pretext
>   obstacle with prose flowing both sides, insets alternating right/left for
>   rhythm, media deduped by src (the same portrait twice reads as a glitch), and
>   a min-height so a short stratum's obstacle can't bleed into the next. Sized by
>   line arithmetic to the pane's height (no scroll there either); what doesn't
>   fit becomes related chips. Empty state seeds the pane from the current page's
>   own chunk — never an empty half-screen. Clicking a related stratum promotes it
>   to lead. Video obstacles are click-to-play (the pane joined the delegated
>   click/tooltip hosts).
> - **Padding pass.** Frame/scroll/module/label/hint paddings trimmed (~10 rules);
>   the keyboard hint no longer costs a whole module of space.

## Phase 10 — Truth, Memory, Pieces (drafted 2026-08-26, awaiting John's ratify)

*Shipped through Phase 9 the command bar is structurally production-ready. Phase 10
is what makes it TRUSTWORTHY (the chunks say only what John confirms), CONTINUOUS
(a session's answer survives navigation), and ALIVE (the site's media and
interactive widgets become first-class pieces, text woven around them). Four
slices; 10a starts immediately because John's confirms gate everything else.*

### 10a — The Honesty Audit (chunks are claims; claims get confirmed)
Every string in `Assets/search-chunks.json` — content, tags, micro, tldr, facts —
is a CLAIM the site makes on John's behalf. Process:
1. Generate `Agent Reference/CHUNK_AUDIT.md`: one section per chunk, every
   discrete claim extracted and classified — **[site-verifiable]** (a page/anchor
   on this repo backs it; verified mechanically), **[John-confirm]** (external
   world: awards, dates, employers, client names, shipped claims), **[tone]**
   (superlatives, AI-writing patterns, anything that oversells). Each
   John-confirm claim gets a checkbox line: confirm / edit-to / cut.
2. John marks the doc (or answers batched questions); edits are applied verbatim.
3. `node scripts/build-chunk-vectors.mjs` after any content edit (README rule),
   then the offline eval labs re-run to prove retrieval didn't drift.
Exit: zero unconfirmed external claims in the index. This doc then becomes the
standing rule: **new chunks land with their audit section, or they don't land.**

### 10b — Session Memory & the Collapsed Search (continuity across "go")
The requirement: the last LLM-generated answer survives per user session AT LEAST,
and navigating via a command doesn't amputate the search — it collapses it.
- **Store**: `sessionStorage` key `jh-search-session` (per-tab = per session,
  private by construction): `{ query, answer, model, engine, pinnedId, fromPage,
  ts }`. Written when a generation completes and (synchronously) when a nav
  command executes. TTL ~30 min; never localStorage without an explicit later
  decision.
- **The collapsed search**: arriving on a page with fresh session state, the
  overlay shell (before the core even loads — this must be feather-weight)
  renders a one-line **continuity strip** under the nav: `◂ "add 3 small fish" ·
  answer kept — reopen`. Tapping reopens the overlay RESTORED: query refilled,
  postcard re-derived deterministically (search is pure), and the stored answer
  re-attached with an honest byline — "from your last search · <model>". The
  model is never re-run to fake continuity; what you saw is what you kept.
- Esc/ignore dismisses the strip for that page-view; the state persists until
  TTL or a new generation replaces it.
- QA (phase10): mock-engine answer → `go to design` → strip present on
  design.html → tap → same answer text + byline restored; TTL expiry honored.

### 10c — The Piece Registry (visual/interactive first, text woven)
Take stock of EVERY medium and interactive widget on the site and make them
surfaceable pieces — the meta-paragraph's obstacles graduate from thumbnails to
the real thing.
- **Inventory, not invention**: `scripts/playground-items.js` (24 items) is
  already the site's widget registry — the piece registry DERIVES from it plus a
  sweep for page-embedded media (case-study videos, the trophy GLB, 3d-sync
  demo, hero canvases, tidepool/beach-beers/SNA, pretext rigs, writing reader).
  One new field on chunks: `pieces: [{kind: demo|video|3d|image, src, title,
  wake?}]` — authored data, audited under the 10a rule.
- **Surfacing**: (1) piece queries ("show me the demos", "interactive",
  "fish game") get a PIECE RAIL — poster cards that wake on click into live
  iframes; (2) dossiers/strata whose chunk has a live piece use IT as the
  pretext obstacle — a running fish tank inside the paragraph, prose flowing
  both sides; (3) the workspace pane budgets AT MOST one live iframe at a time
  (playground's budgeted-LRU lesson: wake nearest, sleep the rest,
  `iframe.remove()` actually releases). `nested`/`external` guards inherit from
  the playground manifest — the overlay must never frame playground.html or an
  off-origin URL.
- The visual/interactive emphasis inverts the current default: where a piece
  exists, the piece leads and the text wraps it — micro/tldr become captions.
- QA: wake/sleep budget asserted; recursion guard asserted; piece rail renders
  from registry only (no ad-hoc embeds).

### 10d — The Design Pass (the remaining clunk)
Screenshot-driven, John's eye leading. Six canonical states captured before/after
on both themes: empty, compact, comfortable, pinned, workspace, mobile. Known
candidates already on the list: model-viewer letterbox dead space, L1 baseline
alignment under truncation, plan-card vs postcard visual kinship, workspace
column divider rhythm, answer-seam styling, engine panel typography. Each round:
contact sheet → John marks → applied → re-shot. Exit is John saying it's done,
not a checklist.

### Sequencing
10a audit doc generated FIRST (John reviews while 10b builds) → 10b (small,
self-contained) → 10c (the big one: data + embed engine) → 10d rounds throughout,
final polish last. Ship gate stays the same: suites green + John's eyes + his
version bump.

### 10e — visual dedupe · more visuals · wording-tier zoom [PLANNED 2026-08-26]
Spec lives in `SEARCH_HANDOFF.md` §Phase 10e (written as the handoff for the
interim agent): (1) render-level src-dedupe across the postcard list + pane
(plus fixing the two data dupes — headshot on 1/28, nanome2casestudy on 5/37 —
and the still-jpeg headshot fields); (2) map the 45 unused assets onto the 25
text-only chunks via a new CHUNK_AUDIT §G batch; (3) the three-tier text
ladder — micro sentence / microparagraph (`brief` field, sentence-split
derivation interim) / full paragraph — selected by ONE `textFor(r, lod,
density)` used by render AND allocator, with the morph diff extended to a
`data-txt` tier stamp. Build order: dedupe → wording ladder → visual batch.

### 10f — externals: containerize uniformly, exit on purpose only [PLANNED 2026-08-26]
Spec in `SEARCH_HANDOFF.md` §10f. The invariant: chunk `url` must be
SAME-ORIGIN (it's where WE talk about the thing; `pieces` is where IT lives —
chunk 13's jhana.zone url re-points to art.html#installations). Three-tier
policy: John-owned + frameable hosts (header-verified `frame-ancestors`, a
curated `FRAMEABLE_HOSTS` allowlist) wake LIVE like demo pieces; owned-but-
unframeable and all third-party render the one uniform DEPARTURE CARD (local
poster via `capture-posters.mjs`, hostname, explicit ↗, `rel="me noopener"`).
Enter never exits the origin; a raw external `<a>` outside a departure card is
a lint failure.

### 10g — the residue sentence [PLANNED 2026-08-26, John's final direction]
Spec in `SEARCH_HANDOFF.md` §10g. The continuity strip graduates from one-shot
toast to STANDING chrome: a terminal status line at the BOTTOM edge (on-brand:
Deep Sea Terminal gets its vim-style status line; covers nothing, contends
with nothing) showing the session at its most minimized zoom tier —
`◂ "query" → first clause of the answer… · reopen`. Core stores a computed
`residue` string in the session payload; shell renders it dumb. Standing while
TTL-fresh + overlay closed; click restores; ✕ dismisses per session; a new
search resurrects it; the overlay open/close reads as the same object
expanding and collapsing.

> **10a/10b/10c build record (2026-08-26, same session):** phase10 suite green,
> ALL TWELVE suites green.
> - **10a delivered as `Agent Reference/CHUNK_AUDIT.md`** — every claim in all 42
>   chunks extracted and classified via a mechanical grep sweep of `*.html`.
>   Headline finding: nearly everything is page-backed; the CHUNK-ONLY claims
>   (search says what the site never says) are the personal chunks — cooking
>   dishes, the brownie, hiking/camping. ~40 John-confirm checklist lines await
>   his marks; two consistency catches ("Primary" vs "Lead" designer at Nanome;
>   MetaMedium "prototype" vs "shipped product") and the "no npm" precision nit.
> - **10b shipped — the collapsed search.** `sessionStorage` (`jh-search-session`,
>   30-min TTL) written on generation complete and synchronously at every
>   navigation (commands, Enter-commit, result/badge link clicks — all raise the
>   one-shot `jh-search-continue` flag). The next page's shell shows the
>   continuity strip (feather-weight: two storage reads, no core load); tap
>   reopens RESTORED — postcard re-derived, the KEPT answer re-attached under a
>   `data-restored` byline reading "from your last search". Never regenerated.
>   One-shot flag → no strip on plain reloads; TTL honored; dismiss is per
>   page-view.
> - **10c shipped — pieces.** Nine chunks carry `pieces: [{kind, src, title}]`
>   derived from the playground manifest (demo = same-origin wakeable; link =
>   off-origin, never framed — doorway card only; playground/openprose are never
>   pieces). Surfacings: the PIECE RAIL on browsy queries (intent deliberately
>   narrow — 'minigame' was in the pattern and hijacked "fish minigame" away
>   from its own chunk, found and removed); piece-first obstacles at dossier and
>   stratum scale (the interactive thing IS the visual, prose wraps it — a LIVE
>   fish tank runs inside the paragraph, 9 pretext lines flowing around it);
>   media-less chunks show their piece at L2, and a small-piece tap is ONE
>   gesture: zoom to dossier + wake. Budget: ONE live iframe ever (waking a
>   second sleeps the first, `iframe.remove()` actually releases); overlay close
>   sleeps; woken pieces survive re-renders via the same harvest/graft as media.
>   Side find: hypercube demo's `main.css` 404s (pre-existing; task chip spawned).
> - **10d round 1**: 12-state contact sheets (6 canonical states × both themes)
>   delivered to John for markup.

> **10d round 2 (2026-08-26, John: "multimedia awkwardly small, cutting text
> midplace — right side cleanly, larger"):** all twelve suites green after.
> - Obstacles moved from the 17% mid-inset (which carved a text sliver down
>   their right) to the CLEAN RIGHT EDGE, and grew: images 96→148px, models
>   118→170px, demo pieces 240×160→264×176. The pane's alternating left inset
>   dropped (read as imbalance with short strata). NEW base state: a dossier
>   obstacle `float: right`s natively, so the pre-wrap/no-pretext rendering is
>   already correct — the wrap upgrades it, never rescues it.
> - **Two real bugs found by the follow-through.** (1) The empty-state pane
>   never got its pretext wrap: nothing re-invoked it when the module loaded
>   (renderDetailPane now calls ensurePretext, and the ready callback reaches
>   the pane on empty queries). (2) The fit key included the anchor's
>   clientHeight — but the panel auto-grows under content, so the key churned
>   on every wrap and NULLED the fitted budget mid-flight; keyed on
>   window.innerWidth×innerHeight now. Plus `postWrapRefit`: the fit loop
>   measures BEFORE the wrap and wrapped prose is taller — up to three
>   post-wrap corrective steps (plus one 350ms-deferred check for fonts.ready
>   relayouts) close the gap. The 'hire him' query went from a stubborn 11px
>   scroll to exactly 0.
> - Cost floors now follow what actually RENDERS: demo/image/video/model
>   obstacles charge ~9 lines, a link pill charges 3 (charging pills the big
>   floor was shaving innocent modules off the ladder — phase6a caught it).
> - Suites: phase2 sets `jh-search-debug=1` (a parallel commit gated the
>   core's breadcrumb logs); phase7's embedder poll 60→90s; phase8's density
>   section gets 1100px height (comfortable genuinely cannot afford a
>   big-media dossier at 920 — the doctrine, not a bug).

## Phase 7 — Behaviors (standing directives) [PLANNED, post-MVP]

Placement is declarative and instantly verifiable; behavior is a promise over time —
its own phase by design. "The small fish stay near the intersecting lines"; "big fish
avoid squares."

- **Grammar**: `X stays near Y` / `X avoids Y` / `stop that` (clear directives), where
  X = a fish selector (tier/all) and Y = a shape selector (type, or "the intersection").
- **Engine**: one new soft-steering slot in the behavior priority stack that reads a
  per-fish `directive` object (per-fish fields are already live-mutable — the force
  hook is the addition). Directives are WEAK forces below collision/edge avoidance:
  fish keep their personality and physics keeps its veto — the language nudges, it
  does not puppet. Targets resolved per-frame via cheap selectors (shape-type sets,
  precomputed intersection points).
- **Census integration**: directives are reportable state ("2 small fish holding near
  the crossed lines") and cancellable by reference.
- **Verification**: soft assertions (mean distance to target trending down over a soak)
  — the maze-tests harness pattern, not a hard predicate.
- Caps: few directives at once; directives die with their targets (erase the square →
  the avoidance dissolves, and the census says so).

## Files

| File | Role |
|---|---|
| `scripts/search-core.js` | NEW — pipeline + intents + prompts + registry + tiers (no DOM) |
| `scripts/search-overlay.js` | becomes thin shell over the core |
| `search.html` | becomes thin shell over the core |
| `scripts/build-chunk-vectors.mjs` | NEW — dev-time chunk/exemplar embedding |
| `Assets/search-chunks.json` | + `url`, `type`, `rel`, `vec` fields |
| `scripts/search-overlay.css` | intent cards, action cards, "On this page" section |
| per-page inline scripts | `JHSearchCore.register(...)` calls for page actions |

## Sequencing & effort

Phases are strictly ordered 1 → 2 → 3 → 4 (each un-blocks the next; each independently
shippable). Rough: P1 ≈ 1–1.5d · P2 ≈ 1.5–2d incl. measurement · P3 ≈ 2–3d · P4 ≈ 1–2d.
P1+P3 alone already deliver a working command bar (regex routing only); P2 makes it feel
smart everywhere; P4 makes it talk.

## Relationship to V2_RELEASE_PLAN

This doc restructures the v2.0 search scope: SEARCH_ENRICHMENT's `url`/anchor work is
absorbed into Phase 3 (media cards remain in that doc, unblocked after `url`);
SEARCH_COMMANDS is superseded (its intent cards + verification live in Phase 3);
SEARCH_HYBRID stays deferred. See V2_RELEASE_PLAN decision #11.
