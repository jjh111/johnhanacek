# LLM Search Integration — Master Plan
*Last updated: March 2026*

Source of truth for bringing the portfolio's in-browser AI search from `test-llm.html` proof-of-concept into production across all pages. Covers the 3-tier model architecture, vision chunking system, model state persistence, and integration with the existing site chrome (oval HUD, glass scroll, nav).

---

## Current State

### What's proven (test-llm.html PoC)
- **Tier 1 — BM25 instant search**: MiniSearch with field boosting (title 3x, tags 2x, content 1x), fuzzy 0.2, prefix search. 29 clean chunks in `Assets/search-chunks.json`. Intent mapping (13 patterns) expands conversational queries to keyword search. Sub-millisecond results.
- **Tier 2 — WebGPU Qwen3.5-0.8B**: Transformers.js v4 (`@huggingface/transformers@4.0.0-next.5`). Uses `Qwen3_5ForConditionalGeneration` + `AutoProcessor`. ~700MB download, cached after first load. `enable_thinking: false` eliminates think tags. `do_sample: false` for deterministic output. Queue-based generation with genId staleness checks. 8/8 hiring manager tests passed, 0 hallucinations.
- **Chunk format**: `{ id, title, tags, content, page }`. Flat factual text optimized for small-model synthesis. De-AI'd — no rhetorical patterns that confuse 0.8B models.

### What's proven (test-vision.html P0.1 — March 2026)
- **Vision encoding works**: `vision_encoder: "fp16"` (~873MB total). `RawImage.fromCanvas()` capture pipeline.
- **Performance**: Vision encoding 0.1-0.2s (blazing fast), generation 11-15s, total ~12-16s per query.
- **Scene understanding**: Correctly identified animated fish ecosystem (fish, coral, food, colors, atmosphere), geometric shapes (circle/rect/triangle with colors), freehand drawings (spiral/organic lines).
- **Text reading**: Successfully read canvas-rendered headings ("John Hanacek"), project names (Nanome, AvatarMEDIC, MetaMedium, JH Coaching OS), and labels.
- **Hallucination risk**: When fine text is unreadable at capture resolution, model fills in plausible details (invented Python/Java/AWS for a portfolio mock). **Validates the "emaradar" vision-chunk approach — text context grounding is essential.**
- **Background color blind spot**: Consistently calls dark navy (#0a1628) "gray" or "light gray". Minor, cosmetic.

### What's untested
- Local model backends (LMStudio/Ollama)
- Cross-page model state persistence
- Production UX (Cmd+K modal, search embedded in site chrome)
- Vision on actual site pages (real index.html fish canvas, not synthetic test scenes)

### Related plans (don't duplicate these)
- `SITE_POLISH_PLAN.md` — oval HUD, glass scroll, nav consistency
- `AQUARIUM_GAME_MASTER_PLAN.md` — fish behavior, onboarding
- Plan file (snug-foraging-barto) — design.html fish merge, shape-detection.js extraction

---

## Architecture: The 3-Tier Paradigm

Core principle: **graceful progressive enhancement**. Each tier adds capability without requiring the previous to change. Every tier shares the same chunk format, system prompt, and context window construction. Same question, richer answer as you go up.

```
Tier 1: BM25 Search (always, 0ms, 0 download)
  │  "Here are the relevant chunks"
  ▼
Tier 2: WebGPU Qwen3.5-0.8B (opt-in, ~700MB, ~10-15s gen)
  │  "Here's a synthesized answer from those chunks"
  │  + Vision: "Here's what I see on the canvas"
  ▼
Tier 3: Local LMStudio/Ollama (auto-detected, 0 download, faster gen)
  │  "Here's a deeper answer using a larger model"
  │  + Vision: full VLM with uploaded images
  │  + Multi-turn conversation
```

### Tier 1 — BM25 (production-ready, no changes needed)
- Loads `search-chunks.json` on page init
- MiniSearch index with current field weights
- Intent mapping expands conversational queries
- Returns ranked cards with title, content, page pill, score bar
- **This is the baseline experience for all visitors**

### Tier 2 — WebGPU Qwen3.5-0.8B (proven, needs site integration)
- User opts in via download button
- Model + processor cached in browser after first download
- Text generation: synthesizes top-5 BM25 results into cohesive answer
- Vision generation: captures canvas/section to `RawImage`, sends with text context
- **dtype change for vision**: switch `vision_encoder` from `"q4"` to `"fp16"` (~50MB more, significantly better image understanding)

### Tier 3 — Local Model Backend (needs prototyping)
- On page load, silently probe:
  - LMStudio: `GET http://localhost:1234/v1/models`
  - Ollama: `GET http://localhost:11434/api/tags`
- If either responds, show "Local AI detected" badge
- Use OpenAI-compatible API (`/v1/chat/completions`) — same system prompt, same context construction
- User picks which loaded model to use (could be Qwen3-VL-8B, Llama 4, Gemma 3, etc.)
- For vision: if model supports it, POST base64 image in the message content array
- **Advantage over Tier 2**: faster generation, larger context, more capable reasoning, multi-turn possible
- **Detection is silent and non-blocking** — fetch with short timeout, catch errors, never stall page load

---

## Vision Chunking: The "Emaradar" Approach

Just as text content is pre-chunked into synthesizable facts, visual content should be pre-chunked into describable regions. The vision model doesn't see the whole page — it sees **one visual chunk at a time**, paired with text context about what that chunk represents.

### Visual Chunk Registry (`Assets/vision-chunks.json`)

```json
{
  "chunks": [
    {
      "id": "v1",
      "type": "canvas",
      "target": "#heroCanvas",
      "title": "Interactive Fish Ecosystem",
      "textContext": "Physics-based aquatic ecosystem with AI fish behaviors, coral obstacles, food mechanics, and emergent schooling. Built in JavaScript Canvas. Draw a fish loop to spawn fish, tap to drop food, draw shapes for coral/obstacles.",
      "captureMethod": "canvas",
      "page": "index"
    },
    {
      "id": "v2",
      "type": "section",
      "target": "#about",
      "title": "About Section",
      "textContext": "Portfolio introduction with name pronunciation guide, tagline, education highlights, and key achievements.",
      "captureMethod": "html2canvas",
      "page": "index"
    },
    {
      "id": "v3",
      "type": "image",
      "target": ".earthstar-painting img",
      "title": "Earth Star Painting",
      "textContext": "Original painting by John Hanacek, 2025. Part of the Earth Star worldbuilding project exploring positive futures grounded in tradition and technology.",
      "captureMethod": "img-element",
      "page": "art"
    }
  ]
}
```

### How vision chunks work

1. **Capture**: Each chunk type has a capture method:
   - `"canvas"` → `RawImage.fromCanvas(canvasEl)` — direct, fast, no libraries
   - `"img-element"` → load img into canvas, then `RawImage.fromCanvas(...)` — works for any `<img>` tag
   - `"html2canvas"` → render DOM section to offscreen canvas → `RawImage` (heavier, needs html2canvas lib — use sparingly)

2. **Pair with text context**: The vision chunk's `textContext` is always prepended to the vision prompt. This grounds the model: it knows what it's looking at before analyzing pixels.

3. **Generation prompt pattern**:
   ```
   System: You describe what you see in John Hanacek's portfolio. Use the text context to ground your description.
   User: [text context from chunk] + [image from capture] + [user's question or "describe what you see"]
   ```

4. **Graceful fallback**: If vision encoding fails (WebGPU hiccup, image too large), fall back to text-only answer using the chunk's `textContext`. The user still gets something useful.

### Canvas capture specifics

For `#heroCanvas` (fish ecosystem):
- Canvas is already a `<canvas>` element — no conversion needed
- Capture at current frame: `RawImage.fromCanvas(document.getElementById('heroCanvas'))`
- Scale down for vision encoder: cap at 800px width (same as the WebGPU demo does)
- **Timing**: capture BEFORE showing "Thinking" spinner, so the frame reflects what the user sees

For design.html blueprint canvas (if/when fish merge happens):
- Same approach — it's also a `<canvas>`
- Can capture recognized shapes + fish + drawing all in one frame

### What NOT to do with vision
- Don't auto-capture on every search query — vision adds 3-5s and isn't always relevant
- Don't capture the whole page — too large, too slow, too noisy
- Don't use html2canvas on every section — it's heavy; reserve for explicit "analyze this section" actions
- Don't send vision without text context — the 0.8B model needs grounding

---

## Model State Persistence Across Pages

### The Problem
Each page is a standalone HTML document. Navigating from index.html to art.html reloads the page, losing:
- The loaded Qwen3.5 model (~700MB in GPU memory)
- The processor/tokenizer state
- GPU shader compilation cache (~5-10s of warm-up)

### Solutions (in order of preference)

#### Option A: SharedWorker + model in worker (recommended)
```
scripts/llm-worker.js  ← SharedWorker, loads model once
  ↕ MessagePort
index.html ─┐
art.html   ─┤─ all pages connect to same SharedWorker
design.html ─┘
```

- `SharedWorker` survives page navigations as long as at least one tab is open
- Model loads in worker thread (doesn't block main thread rendering)
- Pages send `{ type: 'generate', query, context }` → worker responds with streamed tokens
- **Catch**: SharedWorker doesn't have WebGPU access in all browsers (Chrome 124+ does)
- **Catch**: If user opens in new tab (not navigation), worker is shared — good
- **Catch**: If ALL tabs close, worker dies, model must re-download on next visit (but it's cached in browser storage)

#### Option B: ServiceWorker model cache + fast reload
- Don't persist the live model — just ensure the ONNX files are cached in ServiceWorker/Cache API
- On page navigation, model "reloads" from local cache (no network) — ~3-5s for GPU compilation instead of 30s download
- Simpler than SharedWorker, works everywhere
- Tradeoff: 3-5s re-init on every page nav (acceptable?)

#### Option C: SPA-like navigation (avoid full reload)
- Use `fetch` + DOM replacement for page transitions instead of `<a href>`
- Canvas and model stay alive because the page never reloads
- **Big architectural change** — conflicts with current standalone HTML approach
- Not recommended unless the site moves to a build system

#### Option D: BroadcastChannel coordination
- Each page loads its own model instance (wasteful)
- But uses BroadcastChannel to coordinate: "I already have the model loaded on tab X, ask that tab"
- Fragile, complex — not recommended

**Recommendation: Start with Option B (cache + fast reload), prototype Option A (SharedWorker) as enhancement.** Option B is simpler, guaranteed to work, and the 3-5s re-init is acceptable UX if we show a quick "Reconnecting AI..." state. Option A is the dream — test SharedWorker+WebGPU in Chrome to see if it works reliably.

---

## Tier 3: Local Model Detection & API

### Detection (silent, non-blocking, on page load)

```js
async function detectLocalAI() {
  const backends = [];

  // LMStudio (OpenAI-compatible)
  try {
    const r = await fetch('http://localhost:1234/v1/models', {
      signal: AbortSignal.timeout(1500)
    });
    if (r.ok) {
      const data = await r.json();
      backends.push({
        type: 'lmstudio',
        baseUrl: 'http://localhost:1234/v1',
        models: data.data.map(m => m.id),
        name: 'LM Studio'
      });
    }
  } catch {}

  // Ollama
  try {
    const r = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(1500)
    });
    if (r.ok) {
      const data = await r.json();
      backends.push({
        type: 'ollama',
        baseUrl: 'http://localhost:11434',
        models: data.models.map(m => m.name),
        name: 'Ollama'
      });
    }
  } catch {}

  return backends;
}
```

### Generation via local backend

Both LMStudio and Ollama support OpenAI-compatible `/v1/chat/completions`:

```js
async function generateLocal(backend, model, messages, onToken) {
  const res = await fetch(`${backend.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: messages,
      stream: true,
      max_tokens: 1024,
      temperature: 0
    })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        const chunk = JSON.parse(line.slice(6));
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) onToken(token);
      }
    }
  }
}
```

### Vision via local backend

For VLMs (Qwen3-VL, LLaVA, etc.) through Ollama:
```js
// Ollama native vision API
const messages = [
  { role: "system", content: systemPrompt },
  {
    role: "user",
    content: query,
    images: [base64ImageData]  // Ollama-specific
  }
];
```

For LMStudio (OpenAI-compatible vision):
```js
const messages = [
  { role: "system", content: systemPrompt },
  {
    role: "user",
    content: [
      { type: "text", text: query },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
    ]
  }
];
```

### UI for Tier 3

When local backend is detected:
- Show subtle badge: "🟢 Local AI ready" next to the model status area
- Dropdown to select which loaded model to use
- Generation uses local API instead of WebGPU (faster, no download needed)
- If local backend goes away mid-session (user quits LMStudio), graceful fallback to Tier 2 or Tier 1

---

## Site Integration: Cmd+K Search Modal

### Trigger
- Keyboard: `/` or `Cmd+K` (Mac) / `Ctrl+K` (Windows)
- Click: search icon in the oval HUD nav (see SITE_POLISH_PLAN.md)
- Mobile: tap search icon in nav

### Modal structure
```
┌─────────────────────────────────────────────────┐
│  🔍 Ask anything about John's work...    [×]    │
│  ─────────────────────────────────────────────── │
│                                                   │
│  SEARCH RESULTS (Tier 1 — always)                │
│  ┌─────────────────────────────────────────────┐ │
│  │ [title]                            [page] ↗ │ │
│  │ content text...                             │ │
│  │ ████████░░░░░░░░░░░░  score                 │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │ [title]                            [page] ↗ │ │
│  │ ...                                         │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  AI ANSWER (Tier 2 or 3 — if available)          │
│  ┌─────────────────────────────────────────────┐ │
│  │ 🟢 Qwen3.5  |  [📷 Vision]                 │ │
│  │                                             │ │
│  │ Synthesized answer text streaming here...   │ │
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  [page pills: index · design · art · about]      │
│  ─────────────────────────────────────────────── │
│  ⚙ Qwen3.5 WebGPU (700MB) [Download]            │
│  🟢 LM Studio detected — qwen3-vl:8b [Use]      │
└─────────────────────────────────────────────────┘
```

### Key UX decisions
- **Page pill links**: clicking a result's page pill navigates to that page (and closes modal)
- **Vision button** (📷): only visible when Tier 2+ is active. Captures the current page's primary canvas (or selected visual chunk) and appends to the next generation.
- **Model switcher**: bottom bar shows available backends. User can switch between Tier 2 (WebGPU) and Tier 3 (local) mid-session.
- **Escape closes**, **click outside closes**, **search input auto-focuses**

---

## File Structure for Integration

```
scripts/
  shared.css            ← already exists
  shape-detection.js    ← planned (from design.html merge plan)
  portfolio-search.js   ← NEW: BM25 + intent mapping + chunk loading
  llm-engine.js         ← NEW: Tier 2 (WebGPU) + Tier 3 (local) abstraction
  search-modal.js       ← NEW: Cmd+K modal UI + keyboard handling
  vision-capture.js     ← NEW: canvas/img/section capture utilities

Assets/
  search-chunks.json    ← exists, text chunks
  vision-chunks.json    ← NEW: visual chunk registry
```

### Module boundaries

**portfolio-search.js** — pure search, no LLM:
- Loads `search-chunks.json`
- MiniSearch setup with field weights
- `expandQuery()` intent mapping
- `search(query)` → ranked results
- `renderResults()` → HTML string
- Exports: `{ initSearch, search, expandQuery }`

**llm-engine.js** — model abstraction:
- `detectBackends()` → checks WebGPU + local
- `loadWebGPUModel(onProgress)` → loads Qwen3.5
- `generate({ query, textContext, image?, backend })` → streamed tokens
- `captureVision(chunkId)` → RawImage from vision-chunks.json
- Exports: `{ detectBackends, loadWebGPUModel, generate, captureVision }`

**search-modal.js** — UI only:
- Injects modal HTML into page
- Keyboard shortcut registration (Cmd+K, /, Escape)
- Wires search input → portfolio-search → render results
- Wires AI toggle → llm-engine → render answer
- Vision button → llm-engine.captureVision → generate with image
- Exports: `{ initSearchModal }`

### Loading in each page

```html
<!-- In <head> or before </body>, all pages: -->
<script src="./scripts/portfolio-search.js"></script>
<script src="./scripts/llm-engine.js"></script>
<script src="./scripts/search-modal.js"></script>
<script>
  // Initialize on each page
  initSearch();
  initSearchModal();
  // Backends detected silently in background
</script>
```

---

## Implementation Phases

### Phase 0 — Prototype baselines (BEFORE site integration)
Still in test-llm.html or new standalone prototypes. Goal: prove unknowns.

**P0.1: Vision PoC** (`test-vision.html`)
- Load Qwen3.5-0.8B with `vision_encoder: "fp16"`
- Add a canvas with something visual (copy fish canvas, or a static image)
- Add "📷 Describe" button
- On click: `RawImage.fromCanvas(canvas)` → multimodal generation
- **Success criteria**: model produces a sensible description of what's on the canvas
- **Estimated effort**: 2-3 hours

**P0.2: Local model PoC** (add to test-llm.html)
- Add `detectLocalAI()` on page load
- If detected, show badge + model selector
- Add toggle: "Use local model" vs "Use WebGPU"
- Route generation through `fetch /v1/chat/completions` when local selected
- **Success criteria**: same query returns answer from local model
- **Estimated effort**: 2-3 hours

**P0.3: SharedWorker PoC** (`test-worker.html` + `scripts/llm-worker.js`)
- Load model in SharedWorker
- Page sends generate requests via MessagePort
- **Success criteria**: navigate away and back, model still responds without re-downloading
- **Risk**: SharedWorker + WebGPU may not work in Chrome — if not, fall back to Option B (cache + fast reload)
- **Estimated effort**: 3-4 hours

### Phase 1 — Extract modules from test-llm.html
- Create `scripts/portfolio-search.js` — extract BM25/MiniSearch/intent code
- Create `scripts/llm-engine.js` — extract model loading/generation code
- Refactor `test-llm.html` to import these modules
- **Verify**: test-llm.html still works identically after extraction
- **Estimated effort**: 3-4 hours

### Phase 2 — Build search modal
- Create `scripts/search-modal.js`
- Add Cmd+K / `/` trigger
- Glass modal overlay matching site design language (from SITE_POLISH_PLAN.md glass tokens)
- BM25 results render inside modal
- AI answer section (if model loaded)
- **Add to index.html first** as integration test
- **Estimated effort**: 4-6 hours

### Phase 3 — Integrate across all pages
- Add `<script>` tags to all 5 pages
- Ensure search-chunks.json loads from correct path on each page
- Vision chunks: register per-page targets in vision-chunks.json
- Test Cmd+K on every page
- Test page pill navigation (click result → goes to correct page)
- **Estimated effort**: 2-3 hours

### Phase 4 — Vision integration
- Add vision capture utilities (`scripts/vision-capture.js`)
- Add 📷 button to search modal
- Wire canvas capture → multimodal generation
- Test on index.html (fish canvas) and art.html (cosmos canvas)
- Graceful fallback when vision fails
- **Depends on**: P0.1 vision PoC passing
- **Estimated effort**: 4-6 hours

### Phase 5 — Tier 3 local model
- Add local backend detection to llm-engine.js
- Add model selector to search modal footer
- Route generation to local API when selected
- Test with LMStudio + Ollama
- Vision through local VLM
- **Depends on**: P0.2 local model PoC passing
- **Estimated effort**: 3-4 hours

### Phase 6 — Model persistence
- Implement Option B (ServiceWorker cache for ONNX files) first
- Show "Reconnecting AI..." on page nav, model re-inits from cache in ~3-5s
- If P0.3 SharedWorker PoC works: implement as progressive enhancement
- **Estimated effort**: 4-6 hours

### Phase 7 — Polish & QA
- Answer UI polish: typing animation, source attribution links
- Mobile UX: modal sizing, touch-friendly controls
- Performance audit: ensure search modal doesn't slow page load
- Accessibility: focus management, screen reader labels, keyboard nav
- Edge cases: empty queries, network errors, model OOM, user quits LMStudio mid-generation
- **Estimated effort**: 3-4 hours

---

## System Prompt (shared across all tiers)

```
You answer questions about John Hanacek's portfolio using ONLY the provided context. Rules:
- Synthesize facts from ALL context chunks into one cohesive answer. Connect dots across sections.
- Be specific: name projects, companies, tools, awards, and concrete outcomes.
- For evaluative questions ("should I hire him?"), advocate confidently with evidence from the context.
- If the context doesn't contain the answer, say so honestly — don't invent facts.
- John is a Design Engineer: he designs AND prototypes in code (10+ years creative/agentic coding).
- 3-4 sentences max. No preamble. Answer the question directly.
```

Vision addendum (when image is included):
```
You can see an image from John's portfolio. Describe what you observe and connect it to the text context. Be specific about visual elements — colors, layout, interactions, animations visible in the frame.
```

---

## Open Questions

1. **SharedWorker + WebGPU**: Does Chrome support WebGPU inside SharedWorker? Need P0.3 to find out. If not, Option B (cache) is the path.

2. **html2canvas dependency**: For capturing non-canvas DOM sections as images. It's ~40KB gzipped. Worth adding? Or skip HTML section capture and only support `<canvas>` + `<img>` elements for vision?

3. **Multi-turn conversation (Tier 3 only)**: Local models can handle conversation history. Should the search modal support follow-up questions? UX complexity vs. power user value.

4. **Model download UX on production**: Currently a manual "Download" button. Should it be more prominent? Auto-suggest after N searches? Or keep it subtle and let power users find it?

5. **Vision chunk auto-detection**: Instead of a static registry, should the system auto-detect canvases and key images on the current page? Less maintenance, but less control over text context pairing.

6. **Offline mode**: With Tier 1 (BM25) + cached Tier 2 (WebGPU), the entire search system works offline after first load. Worth marketing this? "This portfolio works without internet."

---

## Success Metrics

- **Tier 1**: Every page has instant search via Cmd+K. Results are relevant.
- **Tier 2**: Model downloads in <60s on broadband. First answer in <15s. 0 hallucinations on the hiring manager test battery (8 questions).
- **Tier 3**: Auto-detects local model in <2s. Seamless switch between backends.
- **Vision**: Fish canvas description is accurate and connects to portfolio narrative.
- **Persistence**: Page navigation doesn't require full model re-download. Re-init from cache in <5s.
- **The "wow" factor**: A hiring manager at Anthropic, OpenAI, or Apple opens the portfolio, hits Cmd+K, asks "what has he built?", gets a specific, evidence-backed answer synthesized by an AI running entirely in their browser, with an option to point the AI at the fish game and have it describe the emergent behaviors it sees. No server. No API key. The portfolio explains itself.
