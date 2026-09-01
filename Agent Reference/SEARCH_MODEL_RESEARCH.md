# In-browser search model — findings and options

Research done 2026-08-20 after the WebGPU tier "loaded but then timed out".
Everything below is measured, not quoted: sizes come from the Hugging Face
API (`?blobs=true`), request behaviour from Playwright route interception,
and the q4f16 result from an actual load-and-generate run.

**Status: steps 1 and 2 shipped (v1.50). Step 3 — the LFM2.5-350M swap — shipped 2026-09-01 (v2.05). See the measurements at the end.**

---

## What the site ships today

`onnx-community/Qwen3.5-0.8B-ONNX` via Transformers.js, WebGPU, loaded in
`scripts/search-overlay.js` and, separately, `search.html`. Keep the two in
step — they have diverged before, most recently over the enable-button bug.

| part | q4 (was) | q4f16 (now) |
|---|---|---|
| `decoder_model_merged` | 486.3 MB | 437.7 MB |
| `embed_tokens` | 162.9 MB | 147.0 MB |
| `vision_encoder` | 68.5 MB | 62.1 MB |
| **total** | **717.7 MB** | **584.7 MB** |

---

## Done (v1.50)

1. **Transformers.js 4.0.0-next.5 → 4.2.0.** The page sat on a *pre-release*
   from 2026-03-02 while stable 4.2.0 shipped 2026-04-22. Verified
   `Qwen3_5ForConditionalGeneration` still exists in 4.2.0 before switching.
2. **dtype q4 → q4f16.** Saves 133 MB for the same model and same answers.

Verified end to end on 4.2.0 + q4f16: loads, and answers a context question
correctly (`"San Diego, California (SD)."`). fp16 on WebGPU is NOT
automatically safe — the same path makes `gemma-3-270m-it` emit `<unused56>`
forever ([onnxruntime#26732](https://github.com/microsoft/onnxruntime/issues/26732))
— so this was tested rather than assumed.

---

## The trap: the vision encoder is not droppable

The obvious-looking win is to stop downloading a **vision encoder for a
text-only search box**. It does not work, and it backfires.

Omitting `vision_encoder` from the `dtype` map does not skip the module. It
falls back to the **unquantized** `vision_encoder.onnx`:

```
{ embed_tokens: q4, vision_encoder: q4, decoder: q4 }  → vision_encoder_q4.onnx      68.5 MB
{ embed_tokens: q4,                     decoder: q4 }  → vision_encoder.onnx        402.4 MB
```

So "dropping the vision encoder" makes the download ~330 MB **larger**.
Confirmed by intercepting and aborting weight requests to see what each config
asks for. The only way to lose the vision tower is a text-only model.

---

## Step 3 (open): a smaller model

| model | q4f16 | IFEval | notes |
|---|---|---|---|
| **LFM2.5-350M** | **255 MB** | **65.1** | RAG named as a target use; text-only |
| SmolLM2-360M-Instruct | 272 MB | 41.0 | known-good on WebGPU fp16 |
| gemma-3-270m-it | 273 MB | — | ❌ broken on WebGPU fp16/q4f16 |
| Qwen3-0.6B | 570 MB | 64.2 | |
| Qwen3.5-0.8B *(current)* | 585 MB | — | carries a vision tower it never uses |

**Recommendation: `onnx-community/LFM2.5-350M-ONNX`.** 255 MB against 585 MB,
IFEval 65.1 (vs SmolLM2-360M's 41.0, and a shade over Qwen3-0.6B's 64.2 at
under half the size). Liquid AI name RAG and data extraction as its target,
which is exactly this workload: hand it chunks, get an answer back. Their
stated weakness is knowledge-intensive and coding tasks — neither applies.

It also simplifies the code: LFM2 runs on the generic
`pipeline("text-generation", …)` rather than the model-specific
`Qwen3_5ForConditionalGeneration` + `AutoProcessor` pair used now.

`Lfm2ForCausalLM` is present in **both** 4.0.0-next.5 and 4.2.0, so the
version upgrade was not a prerequisite for this (an earlier assumption that
turned out to be wrong).

### Before committing to it
- Measure **first-token latency**, not just download size. The complaint was a
  timeout, and a smaller model only helps if generation is the bottleneck.
- Benchmark on real hardware. A headless run measured ~72 ms/token, but that
  WebGPU path may be software-emulated and is not representative.
- Check the chat template and `enable_thinking` handling; the current call
  passes `tokenizer_kwargs: { enable_thinking: false }`, which is Qwen-specific.

---

## Other threads worth pulling

- **`max_new_tokens: 128`** with `repetition_penalty: 1.15`. At ~72 ms/token
  that is a 9-second answer. Streaming already shows partial text, but a
  lower cap, or a stop sequence, would end answers sooner.
- **No generation timeout exists.** A hung or very slow generate has nothing
  to abort it and no user-facing "this is taking too long" path.
- **iOS is excluded** from WebGPU on purpose (Safari reports support and then
  crashes). Override: `localStorage.setItem("jh-force-webgpu","true")`.


---

## 2026-09-01 — measured on real hardware, and the swap shipped

Chrome (Chromium 148, WebGPU, Apple M2 Max, `shader-f16` present), the site's real
RAG prompt (SYSTEM_PROMPT_BROWSER + top-5 chunks, ~2.5–3k chars), `max_new_tokens`
128, `repetition_penalty` 1.15:

| | Qwen3.5-0.8B q4f16 (was) | LFM2.5-350M q4f16 (now) |
|---|---|---|
| cold load (download) | 69.9 s (666 MB on the wire) | 45.7 s (255 MB) |
| load from cache | **69.0 s** | **0.7–2.1 s** |
| first token, query 1 | **109 s** | 0.29 s |
| first token, query 2 | **47.9 s** | 0.23 s |
| decode | ~25 tok/s | 44–100 tok/s |
| answer | grounded, some drift | grounded, some drift |

The Qwen problem was prefill, not download and not a one-time shader compile — the
second query still took 48 s to its first token. Answer quality between the two is
small-model quality either way (each hallucinated a detail once in three runs); LFM2.5
is 150–400× faster to the first token, which is the whole difference between a tier
people use and one they close.

Code change: `pipeline('text-generation', MODEL_ID, { dtype: 'q4f16', device: 'webgpu' })`
replaces `AutoProcessor` + `Qwen3_5ForConditionalGeneration`; generation passes the
messages array straight to the pipeline (it applies the chat template), so the
Qwen-specific `enable_thinking:false` kwarg is gone. `stripThink` stays as a harmless guard.

### Safari: the WebGPU tier cannot run there — ORT, not the model

Safari 26 exposes a WebGPU adapter (with `shader-f16`) and Playwright WebKit does too,
but onnxruntime-web's WebGPU backend never initialises on WebKit. Every load, both
models, ends in:

```
no available backend found. ERR: [webgpu] TypeError: De().webgpuInit is not a function
```

Transformers.js 4.2.0 (2026-04-22) is the newest release and ships ORT 1.26-dev, so
there is no version to move to. `checkEngines` now treats desktop Safari like iOS: the
tier reads "Safari — unsupported" / "Not in Safari" instead of downloading 255 MB into
an "Error — retry" that no retry fixes. Same `jh-force-webgpu` override for when ORT
catches up.

### Local servers from the https site

Also measured while here: Safari blocks `https://www.johnhanacek.com` → `http://localhost`
as mixed content (`[blocked] … requested insecure content`), so LM Studio/Ollama
detection can never succeed in Safari from the live site. Chrome asks for
local-network permission instead (denied = the same opaque TypeError). And a running
Ollama answers **403** to the site's origin unless `OLLAMA_ORIGINS` admits it, while LM
Studio ships `Access-Control-Allow-Origin: *`. Detect's detail line now says which of
these it is, by environment (`localProbeDiagnosis()`), since the fetch error itself
cannot tell them apart.
