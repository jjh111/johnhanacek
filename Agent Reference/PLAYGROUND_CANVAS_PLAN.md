# Playground → site Review Canvas

> Status: PLAN, not started · Author: drafted 2026-08-24 from a measured read of
> `openprose/canvas-display/` and the current `playground.html`.

Replace `playground.html` with a Review Canvas of the whole site — every page
plus the demo collection — wearing the standard `<jh-nav>` / `<jh-footer>`
chrome. The OpenProse canvas is the real playground; the existing board is the
obsolete first attempt at the same idea.

---

## 1. Why the OpenProse one wins

| | `playground.html` (today) | `canvas-display` |
|---|---|---|
| view modes | one board | canvas / grid / focus |
| lifecycle | visibility load/unload | budgeted **LRU with real teardown** |
| ordering | hand-placed | manifest, `?items=` URL-editable, date or sequence sort |
| review state | none | stars, comments, drawings, git-backed |
| chrome | bespoke hardcoded nav, no footer | headless, embeds anywhere |
| proven | — | shipped, embedded 6× in the case study |

The engine is **not hard-wired to the brand set**. Items resolve as
`iframe.src = it.file` — a plain relative path, no constraint. Pointing it at
this site is a manifest change, not an engine change.

---

## 2. The auto-gate that already exists

This is the system any new gating has to cooperate with. Read from
`canvas-display/index.html`, not from memory:

- **Budget** — `maxLive`, default 8. Drops to 4 when `EMBEDDED && (pointer: coarse)`.
  Overridable per URL with `?budget=N`.
- **Nearness** — one `IntersectionObserver` at `rootMargin: '400px 0px'` sets
  `c.near`. Scroll also triggers a 250ms-throttled `drainCells()`.
- **Wake order** — `drainCells()` wakes near-but-sleeping cells **nearest first**.
- **Eviction** — at budget, `wakeCell` sleeps the farthest live cell, but only
  one that is `!near` or more than **600px farther** than the incoming cell.
  That hysteresis stops two adjacent cells thrashing each other.
- **Idle sweep** — every 3s, anything `!near` for >6s is slept.
- **Teardown is real** — `sleepCell` does `iframe.remove()`, not `src = ''`.
  The document, its canvases and its WebGL contexts are actually released.

Two layers exist **today**: the host page's own embed manager (`MAX_LIVE = 5`
panels in `openprose.html`) sits above the canvas's internal budget. At site
level the outer layer disappears — the canvas *is* the page. That simplifies
things and removes a safety net: nothing throttles above the internal budget.

**There is no poster/screenshot path.** A sleeping card shows a paper-coloured
well with "loading nearby…", and the iframe fades in on `load`. Adding posters
is the single largest lever available (§5, Stage 2).

---

## 3. How click-to-wake should interact with it

Not as a replacement — as a **precondition**. Each cell gains a state:

```
auto    → wakes when near and budget allows        (today's behaviour)
armed   → near and budget-eligible, waits for a click
live    → running
```

Three rules that keep the two systems from fighting:

1. **`armed` is checked before budget, never instead of it.** A clicked cell
   still goes through `wakeCell()`, so LRU still governs. Clicking six heavy
   cards must not put six heavy documents on the page at once — the sixth
   evicts the first, exactly as scrolling would.
2. **Clicking sets `armed = false` for the session, not forever-live.** The
   cell becomes an `auto` cell from then on, so scrolling away still sleeps it
   and scrolling back still re-wakes it without a second click. Without this,
   a woken heavy card either never sleeps (defeats the budget) or demands a
   click every time it scrolls past (infuriating).
3. **Weight is a property of the item, not the viewport.** It belongs in the
   manifest (`weight: 'heavy'`), because it is a fact about the page, not a
   guess about the device. Device capability separately scales `budget`.

---

## 4. The recursion rule

`openprose.html` contains **27 iframes**, six of them `canvas-display` embeds.
Listing it live nests the tool inside itself, each nested copy running its own
budget. Same trap for the playground page itself once it becomes a canvas.

**Rule: any page that itself embeds `canvas-display` is poster-only, never
live.** Enforce it in the manifest with an explicit flag, not by convention —
this is exactly the kind of thing that gets forgotten and then diagnosed for
an hour.

---

## 5. Staged plan — heaviness first, gating last

Deliberately ordered so each stage is only reached if the previous one leaves
a measured deficit. **No hard gating is written until stages 0–2 are exhausted.**

### Stage 0 — Build it naive, then measure the damage

Manifest of every page + the 10 existing demos (all confirmed present):

```
index · design · art · about · services · search · writing · nanome2 ·
404 · onagents · tidepool · beach-beers        (openprose = poster only)
+ Assets/DemosPlayground/*  (10 demos, carried over from playground.html)
```

Instrument and record, desktop **and a real phone**:

- live documents at peak (`p.frames().length`)
- decoded bitmap MB — the metric that actually kills iOS tabs
- JS heap, long tasks >50ms, FPS during a canvas-mode pan
- time to first interactive card

Known starting weights, worst first:

| page | size | canvases | iframes |
|---|---|---|---|
| `onagents.html` | 400KB | **24** | 0 |
| `openprose.html` | 225KB | 2 | **27** ← poster only |
| `design.html` | 137KB | 3 | 4 |
| `art.html` | 41KB | 1 | **10** (YouTube) |
| `index.html` | 42KB | 1 (fish sim) | 0 |

**Gate to Stage 1:** a number, not an opinion. If peak decoded bitmap is under
~150MB and pan holds 50fps on the phone, stop here and ship it.

### Stage 1 — Optimise the load, no UX change

In rough order of expected payoff:

1. **Fix the heavy pages, because we own them.** The single biggest win and
   the one nobody else could do. A `?embed=1` query on our own pages could:
   serve `-1000` image variants instead of `-2400` (we already know
   openprose.html ships 2400px photos into 130px frames), skip the WebGL hero,
   seed the fish sim with fewer entities, and skip the YouTube facades on
   art.html. Pages opting into being cheap when observed.
2. **Adaptive budget** from `navigator.deviceMemory` / `hardwareConcurrency`
   rather than the current binary coarse-pointer test.
3. **`content-visibility: auto`** on off-screen cards — free layout/paint skip.
4. **Widen the sleep hysteresis** if thrash shows up in the Stage 0 numbers.

**Gate to Stage 2:** re-measure the same five metrics. Only continue on a
measured shortfall.

### Stage 2 — Tricks: posters and freezing

1. **Poster-first, live on intent.** The largest structural lever, and the tool
   has no poster path at all today. Card shows a static capture; the iframe
   wakes on hover-intent (desktop) or on entering focus mode. Feels instant,
   costs one image. Captures can be generated headlessly by the same Playwright
   setup in `Agent Reference/maze-tests/`.
2. **Freeze on blur.** `postMessage` a pause to our own pages so an off-screen
   fish sim or cosmos canvas stops its rAF instead of burning battery while
   technically still "live". The fish engine already self-suspends when idle —
   this extends it to "not looked at".
3. **Stagger wake.** `drainCells()` already wakes nearest-first; adding a small
   delay between wakes turns a simultaneous six-document boot into a ripple.

**Gate to Stage 3:** if the phone still can't hold it after 1 and 2, the
content genuinely is too heavy and gating is honest rather than lazy.

### Stage 3 — Hard gating, last

Per-item `weight: 'heavy'` in the manifest → `armed` state → click to wake,
using the three interaction rules in §3. Applies to a named handful
(`onagents`, `design`, `art`), never to the whole board — a canvas where
everything needs a click is a directory listing with extra steps.

---

## 6. Chrome and routing

- Wears `<jh-nav current="playground">` and `<jh-footer>`, like `openprose.html`.
  Note `NAV` in `scripts/jh-chrome.js` has no playground entry — either add one
  or accept `current=""`.
- Site-level copy of the tool, **not** a reach into
  `openprose/canvas-display/`. That folder is the client deliverable, governed
  by the `?v=` bump invariant; coupling the portfolio to it would break if the
  brand set is ever regenerated. Same reasoning as `scripts/pretext/`.
- Keep the URL grammar: `?mode=`, `?items=`, `?budget=`, `?zoom=` are already
  good and make narrative sequences shareable.

---

## 7. What gets deleted from `playground.html`

The whole implementation, keeping only the demo inventory as manifest rows:

- bespoke hardcoded nav (no `<jh-nav>`, no footer at all — confirmed 0 matches)
- board pan/zoom, `.demo-card` drag, `.iframe-blocker`, `.zoom-display`
- its own visibility-based load/unload — superseded by the LRU budget
- caustic ripple background

Retain: the 10 demo paths, the OG/JSON-LD block (updated), the page's sitemap entry.

---

## 8. Open decisions

1. **Does the canvas replace `playground.html` at that URL, or become
   `canvas.html`?** Replacing keeps the sitemap entry and inbound links.
2. **Is `onagents.html` (400KB, 24 canvases) an item at all,** or does it stay
   unlisted and only reachable directly? CLAUDE.md currently holds it for
   release *with* the playground rebuild — so this plan is its release vehicle.
3. **Do review features (stars/comments) belong on a public site canvas,** or
   is this display-only? They imply a git-write path that makes no sense for
   visitors.
4. **Capture pipeline for posters** — one-off script, or committed images
   regenerated on change? Affects repo weight.
