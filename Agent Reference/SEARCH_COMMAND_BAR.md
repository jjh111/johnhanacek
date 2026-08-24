# Search Command Bar — Structure First, Models as Garnish
*Status: Planned (August 2026) | Supersedes: SEARCH_COMMANDS | Absorbs: SEARCH_ENRICHMENT's url/anchor work | Defers: SEARCH_HYBRID to Phase 4 garnish*

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
