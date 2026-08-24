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
