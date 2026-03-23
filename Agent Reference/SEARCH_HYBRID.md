# Search Hybrid — Multi-Engine Collaboration
*Status: Planned | Priority: 4 | Depends on: SEARCH_OVERLAY*

## Context
Instead of "pick one engine," the WebGPU in-browser model and a local model work together in a draft→refinement pipeline. The small browser model generates a fast draft, then the larger local model refines it into a better answer.

## Pipeline

```
User query → BM25 results (instant)
         → WebGPU Qwen 0.8B drafts answer (~3-8s)
         → Draft shown immediately (dimmed, border-left indicator)
         → Local model receives draft + context + query (~5-15s)
         → Refined answer replaces draft (smooth fade transition)
```

## Implementation

### New Engine Mode: `'hybrid'`
Fourth option in engine popover. Only visible when BOTH browser model AND a local/custom model are available.

### Hybrid Generation Flow
```js
if (activeEngine === 'hybrid' && modelReady && localModel) {
    // Phase 1: Browser draft (fast, small model)
    const draft = await generateAnswerBrowser(query, results, genId, { maxTokens: 150 });
    aiAnswerEl.innerHTML = `<div class="ai-draft">${draft}</div>`;

    // Phase 2: Local refinement (slower, bigger model)
    const refined = await generateAnswerLocal(refinementPrompt, results, genId, localModel);
    aiAnswerEl.innerHTML = `<div class="ai-refined">${refined}</div>`;
}
```

### Refinement Prompt
```
You are refining a quick AI draft about John Hanacek's portfolio.
User asked: "${query}"
Quick draft (from a small model): ${draft}
Source data: ${results}
Improve the draft: fix inaccuracies, add detail from sources, make it natural. 3-5 sentences.
Do not mention that you are refining a draft.
```

### Visual Distinction
- Draft: `opacity: 0.7; border-left: 2px solid var(--cyan-dim)`
- Refined: `animation: fadeInUp 0.3s ease`

### Engine Bar Display
- During draft: `● Qwen 0.8B ⇒ [LocalModel] Hybrid`
- During refine: `● [LocalModel] ⇐ Qwen 0.8B Hybrid`
- At rest: `● Hybrid Draft→Refine`

## Files to Modify
- `scripts/search-overlay.js` — hybrid engine mode, refinement flow
- `scripts/search-overlay.css` — draft/refined visual styles, hybrid badge

## Verification
1. Both engines loaded → hybrid option appears in popover
2. Hybrid query: draft appears fast (~5s), refined replaces smoothly (~10s later)
3. Cancel mid-hybrid: new query cancels both phases
4. Only browser model → hybrid option hidden
5. Only local model → hybrid option hidden
