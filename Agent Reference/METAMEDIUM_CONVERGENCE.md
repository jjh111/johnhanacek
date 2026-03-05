# MetaMedium Convergence — How the Portfolio Inherits the Engine

*March 2026 — Cross-repo synthesis document*

## What MetaMedium Actually Is

MetaMedium is a **recursively intelligent parsing system** — a grounded symbol emergence engine. The thesis, which John has been building toward for 10 years: *structured parsing of unstructured inputs that is conserved recursive while expanding in meaning.*

The concrete implementation is a drawing canvas where:

1. **Marks become features** — raw `[{x,y,t,p}]` strokes get fingerprinted into `{straightness, closure, corners, aspect, curvature, velocity}`. This is lossy compression that preserves *structure*.

2. **Features become shapes** — Shape Experts (circle, line, rect, arc, polygon, user-defined) vote MoE-style on each fingerprint. Top candidates offered to user with confidence scores.

3. **Shapes become compositions** — Spatial graph (`buildSpatialGraph`) computes touching/intersecting/containment relationships between shapes. Composition fingerprints are topology hashes: `circle+line-1touching` → "arrow". Saved compositions become new primitives.

4. **Compositions become meaning** — Scene interpreter reads the spatial graph holistically. LLM (currently LM Studio Qwen3 0.8B) gets structured geometric data (NOT screenshots) and returns semantic labels: "this is a house", "this is a flowchart".

5. **Meaning recurses** — A "house" saved to the library becomes a new Expert that future drawings can match against. The vocabulary grows with use. "Type is not assigned. Type EMERGES from connections."

### The Three State Planes

- **Parse State** (ephemeral) — current stroke, candidates, routing decisions. Dies when interaction ends.
- **Library State** (persistent, shareable) — builtins + user primitives + compositions + embedding space. Export/import as JSON.
- **User Fingerprint State** (persistent, personal) — calibration data, correction history, drawing style. Shapes how the engine interprets *this specific user's* marks.

### The Key Architecture Docs

- `ARCHITECTURE-v5-UNIFIED-ENGINE.md` — MoE routing, expert interface, continuous library (embedding space), tiered escalation
- `metamedium-core-schema.md` — Graph-based data model. Everything is a node. Types are nodes. Relations are nodes. What something IS = what it connects to. Grounded in: Scene Graphs (Visual Genome), Image Schemas (Lakoff/Johnson), Construction Grammar (Goldberg), Compositional Models (Lake BPL), Frame Semantics (FrameNet), Knowledge Representation (RDF/OWL).
- `skills/metamedium-code/skill.md` — Reusable code patterns: fingerprinting, boolean detection, size-relative thresholds, spatial graphs, tiered escalation, atomic state
- `skills/metamedium-design/skill.md` — Design principles: no-mode, gesture-based, collaborative grounding, composable libraries, semantic relationships

### Active Implementations

- **doodle2-canvas.html** (11K lines) — Full recognition engine with composition matching, spatial intelligence panel, library system, undo/redo, selection gestures
- **metadoodle1.html** (13K lines) — Fork of doodle2 WITH local LLM integration via LM Studio. Three-layer: Heuristics → LLM Stroke Assist → Scene Interpret. Sends structured geometric data to `localhost:1234/v1` (OpenAI-compatible). Tool-use ready (`label_shape`, `create_composition`, `describe_relationship`). Graceful degradation without LM Studio.
- **test-vision.html** (822 lines) — VLM PoC using Transformers.js Qwen3.5-0.8B in-browser. Being adapted from portfolio PoC.
- **test-llm.html** (712 lines) — Text LLM PoC. Being adapted from portfolio PoC.

### The Fish Game Origin

The fish ecosystem in `johnhanacek/index.html` was **forked from the older MetaMedium hero canvas** — the whitepaper demo version. The shape recognition, `getBounds()`, `distance()`, scoring functions, and draw-to-create interaction all descend from MetaMedium's original recognition pipeline. Then fish behavior, coral, food, bubbles grew organically on top. The portfolio's `design.html` preserves the original frozen whitepaper canvas.

---

## The Isomorphism

MetaMedium and the portfolio AI search are the **same fundamental operation** at different scales:

```
MetaMedium                          Portfolio AI Search
─────────────────────────────────── ───────────────────────────────────
Stroke points [{x,y,t}]            Canvas pixels / page content
         ↓                                   ↓
Fingerprint extraction              Visual capture / text chunking
(conserve structure, compress)       (conserve meaning, compress)
         ↓                                   ↓
Expert routing (MoE voting)          Tier routing (BM25 → Qwen → Local)
(multiple hypotheses, ranked)        (multiple sources, ranked)
         ↓                                   ↓
Composition matching                 Context assembly
(spatial graph → topology hash)      (top chunks → system prompt)
         ↓                                   ↓
Semantic interpretation              Synthesized answer
(LLM gets structured data)           (LLM gets grounded context)
         ↓                                   ↓
Library learning                     [Future: conversation memory]
(corrections improve future)         (feedback improves future)
```

**The shared principles:**

1. **Conservation** — Both compress unstructured input into structured features while preserving what matters. MetaMedium: points → fingerprint. Portfolio: pages → chunks. Vision: pixels → RawImage → description.

2. **Recursion** — In MetaMedium, compositions become new primitives that compose further. In the portfolio, text chunks ground vision descriptions, which ground synthesized answers, which could ground future queries.

3. **Expanding meaning** — MetaMedium's spatial graph creates emergent semantics from individual shapes. The portfolio's multi-tier search creates emergent understanding from individual facts.

4. **Graceful degradation** — MetaMedium works without LLM (heuristics alone). Portfolio works without WebGPU (BM25 alone). Both escalate when uncertain.

5. **Grounded interpretation** — MetaMedium sends *structured geometric data* to the LLM, not screenshots. The portfolio's "emaradar" approach sends *text context* alongside visual captures. Both refuse to let the LLM hallucinate from ungrounded pixels.

---

## What This Means for the Portfolio Plan

The existing `LLM_SEARCH_INTEGRATION_PLAN.md` is valid but it's a **subset**. It treats the portfolio AI search as a standalone feature. In reality, it's one instance of the MetaMedium pattern applied to web content.

The tiered stages below reframe the portfolio plan as **non-blocking increments that build toward the universal engine** without requiring MetaMedium-core to exist first.

---

## Revised Tiered Stages — Portfolio (johnhanacek repo)

### Stage 0: What's Done (keep shipping) ✅

- BM25 search with 29 cleaned chunks — proven, zero hallucinations
- Intent mapping (13 patterns) — proven
- WebGPU Qwen3.5-0.8B text generation — proven (test-llm.html)
- Vision capture + VLM description — proven (test-vision.html, 4 scenes tested)
- Vision encoding 0.1-0.2s, generation 11-15s — baseline established
- Hallucination pattern identified: VLM invents fine details → emaradar grounding required

### Stage 1: Bring Search Into the Site (no VLM, no local model)

**Goal**: Visitors can search the portfolio from any page. No new capabilities — just production packaging of what's proven.

**What ships:**
- `scripts/portfolio-search.js` — BM25 engine + intent mapping, extracted from test-llm.html
- `scripts/search-modal.js` — Cmd+K modal UI (or trigger from nav)
- Search works on every page via shared script tags
- BM25 results render as cards with page pills and relevance bars
- "Ask AI" button visible but gated on WebGPU detection

**Not blocked by**: VLM, local models, SharedWorker, MetaMedium-core
**Builds toward**: The search modal becomes the universal query interface

### Stage 2: WebGPU Text LLM In-Modal

**Goal**: The "Ask AI" button loads Qwen3.5-0.8B and synthesizes answers from chunk context. Same as test-llm.html but inside the real site's modal.

**What ships:**
- `scripts/llm-engine.js` — Model loading, generation, streaming. Abstraction over Transformers.js.
- One-time model download (~700MB), cached thereafter
- Streaming answer renders in the search modal below BM25 cards
- Loading/progress UI during model download and generation
- System prompt shared with all tiers

**Not blocked by**: VLM, local models, SharedWorker
**Builds toward**: llm-engine.js becomes the universal model interface for all tiers

### Stage 3: Vision Awareness (Fish Game + Page Captures)

**Goal**: The AI can describe what it sees on the current page. Visitors can ask "what's happening in the fish game" or "describe this page."

**What ships:**
- `scripts/vision-capture.js` — Canvas/element capture pipeline using `RawImage.fromCanvas()`
- `Assets/vision-chunks.json` — Registry of visual regions with text context grounding (emaradar format)
- Model upgrades to fp16 vision encoder (~873MB, ~25% larger)
- Capture happens on-demand when user asks a visual question
- Text context from vision-chunks.json injected alongside the image to prevent hallucination

**Vision chunk format** (the "emaradar" structure):
```json
{
  "id": "fish-canvas",
  "page": "index",
  "captureMethod": "canvas",
  "selector": "#heroCanvas",
  "textContext": "Interactive fish ecosystem with 3 size classes. Small fish live in coral. Medium fish school in V-formation. Large fish are solitary and territorial. Food appears as green dots. Draw to create fish, coral, bubbles.",
  "promptHint": "Describe the current state of the aquarium — fish count, behavior, food."
}
```

**Not blocked by**: Local models, SharedWorker, cross-page persistence
**Builds toward**: The vision-chunk registry IS the MetaMedium library pattern applied to web content

### Stage 4: Local Model Detection (Tier 3)

**Goal**: Expert visitors running LMStudio or Ollama get a richer experience automatically.

**What ships:**
- Silent probe of `localhost:1234/v1/models` (LMStudio) and `localhost:11434/api/tags` (Ollama)
- If detected, queries route to local model instead of in-browser Qwen
- Larger context windows, faster generation, multi-turn conversation
- Same vision-chunk grounding — local VLMs get the same text context
- "Powered by [model name]" badge in search modal

**Not blocked by**: Vision, SharedWorker, MetaMedium-core
**Builds toward**: This is the same `localhost:1234/v1` pattern metadoodle1.html uses — code can be shared

### Stage 5: Model Persistence Across Pages

**Goal**: Model doesn't re-download when navigating between pages.

**What ships:**
- SharedWorker or ServiceWorker holding the loaded model
- BroadcastChannel for cross-tab communication
- Navigation between pages keeps warm model
- Or: convert to SPA-style navigation (History API + fetch) to avoid reload entirely

**Not blocked by**: Any previous stage (can be done in parallel)
**Builds toward**: The persistent model becomes a service that MetaMedium-core can also use

### Stage 6: Convergence Points

**When MetaMedium-core ships as a package**, these portfolio features align:

- **Vision-chunks.json** → becomes a MetaMedium Library (same match/compose/recurse pattern)
- **llm-engine.js** → becomes the Tier 1/2 escalation layer from ARCHITECTURE-v5
- **Fingerprint functions** → already shared DNA from the original fork. `scripts/shape-detection.js` (from the design.html plan) IS a MetaMedium geometry module
- **Search modal** → becomes a MetaMedium query interface ("what is this?", "what relates A to B?")

These don't need to happen sequentially. They're **convergence points** — when either repo reaches them, the other benefits.

---

## The Deeper Pattern

What John is building is not a portfolio with AI search bolted on. It's not a drawing app with LLM bolted on. It's a **universal parse-and-compose engine** that happens to have two running instances:

1. **MetaMedium** — parses drawn marks into structured meaning
2. **Portfolio** — parses web content + visual canvases into structured answers

Both share:
- Fingerprinting (compress while conserving structure)
- Expert routing (multiple hypotheses, confidence-ranked)
- Spatial/contextual graphs (relationships carry more meaning than individuals)
- Tiered escalation (fast heuristic → small LLM → large LLM)
- Library/chunk registries (named, matchable, composable)
- Grounded interpretation (structured data to LLM, not raw pixels)
- Graceful degradation (works at every tier independently)

The 10-year quest — "structured parsing of unstructured inputs that is conserved recursive while expanding in meaning" — is the thesis that unifies both projects. Each implementation proves the thesis in a different domain, and the shared code will eventually make this explicit.

---

## Files Referenced

**johnhanacek repo:**
- `Agent Reference/LLM_SEARCH_INTEGRATION_PLAN.md` — existing plan (valid, now a subset)
- `Assets/search-chunks.json` — 29 text chunks
- `test-llm.html` — text search PoC
- `test-vision.html` — vision PoC (4 scenes tested)

**MetaMedium repo:**
- `ARCHITECTURE-v5-UNIFIED-ENGINE.md` — MoE routing, continuous library, tiered escalation
- `metamedium-core-schema.md` — graph-based data model, relation taxonomy
- `doodle2-canvas.html` — full recognition engine (11K lines)
- `metadoodle1.html` — LLM-integrated version (13K lines, LM Studio Qwen3)
- `skills/metamedium-code/skill.md` — code patterns
- `skills/metamedium-design/skill.md` — design principles
- `CLAUDE.md` — project guide with roadmap
