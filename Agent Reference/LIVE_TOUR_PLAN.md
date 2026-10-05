# Live Tour — plan (2026-10-05, plan only, nothing built)

A visitor clicks **▶ Take the tour**. The site drives its own ⌘K command bar through the same
beats as the sizzle reel (`claude/funny-dirac-ytu5la`, cut 2). Play, pause, back, next and exit
are always on screen. The film and the tour are **one edit**: the film is the cut, and the tour
is the same script played on the live site, where every answer can be checked and clicked.

Sources read for this plan:
- the reel script (`Assets/sizzle-reel-2.script.txt` on the dirac branch) and `REEL_PIPELINE.md`
- `scripts/search-overlay.js` and `scripts/search-core.js` on main @ 68aa61d
- a claim-by-claim check of the reel against `search-chunks.json`, `resume.json`, the pages and `media-kit.json`

---

## 1. The principle: one script, two players

The reel's script is already the edit. Each SCENE has a `query`, `tiers` and a `page`, and its
beats are ordered. The tour does not get a second script. It reads the same file through the same
parser (`ReelScript.parse`, a UMD module that already loads in a browser) and plays the scenes
in their order. The tour uses only a scene's question, its page, and its dwell time. The film's
pictures, zooms and music are its own.

Scene → live step:

| Reel scene | Live step (index.html unless noted) | Driver action |
|---|---|---|
| `open` "draw a loop → a fish" | The hero tank. A synthetic loop stroke spawns a fish | the fish engine's stroke path (the same one scene-language uses) |
| `title` | The hero name and tagline, in view | scroll to top, no bar |
| `command` "add 4 medium fish and 2 coral" | The plan card, then **Draw it**, then the receipt "4/4 · read from the canvas" | `openSearch(q)`, then confirm the plan through a new exported `runScene()` |
| `answer` "who is john?" | The postcard: About at dossier depth, then the semantic upgrade morphs in | `openSearch(q)`, then wait for *settled* |
| `results` "what has he shipped?" | The postcard. The cursor walks the modules: Nanome → BadVR → OpenProse → Coaching OS | ↑↓ cursor moves, one per ITEM, timed by the ITEM lengths |
| `feature` "what has he won?" | The awards dossier; the plaque model-viewer is live | query + settled |
| `art` "show me his art" | Earth Star and Influence modules | query + settled |
| `logos` "who has he worked with?" | **No chunk answers this today** (see §5) | query + settled |
| `quotes` "what do people say?" | The testimonials dossier rows, walked one at a time | query + row cursor |
| `offer` "how do i work with john?" | The gold intent card with **Write John a message** | query. The tour ends here |
| `end` | **The bar stays open with the caret in it.** Caption: "Your turn — ask anything." | the tour exits into the product |

The film runs 60 s. The live tour runs about 90–120 s, because answers land as they really
land, and each step holds a little longer than its film scene so a reader can read.

**Optional tour-only fields.** The parser is strict: an unknown field is an error. Add one
`live` field family to `reel-script.js`, which the film ignores:
- `live hold 6` — the dwell time, if the scene's own length × 1.6 is wrong
- `live skip` — a film-only scene, such as `title`
- `live act scene|cursor|rows|none`
- `live detour design.html "Try the maze"` — see §4

That keeps the "words on screen live in one file" rule the reel already lives by.

## 2. Architecture

`scripts/jh-tour.js` — a lazy module. Nothing loads until Play, the same discipline as the overlay.

- **Entry points:**
  - a `▶ Take the tour` pill in the index hero beside the shape-nav
  - `?tour=1` on any URL
  - a "tour" command in `JH_COMMANDS`, so "show me around" in the bar starts it
  - later, the film's end card: "watch · or try it live"
- **The control bar** docks at the bottom, where the residue sentence lives, and replaces the residue while a tour is running. It holds:
  - ◀ back · ❚❚/▶ · ▶▶ next · ✕ exit
  - a step strip of nav-shape marks, one per scene
  - one caption line, which is the scene's question
  
  It uses the site tokens and 44px targets. It has to sit **inside the overlay's focus trap**, or the trap and the rAF input focus will take focus away from it.
- **The step runner** is event-driven, not timecode-driven:
  1. enter the step
  2. act
  3. await settled
  4. dwell
  5. advance
  
  Each step declares its whole start state: page, query, density and workspace mode. That makes back and next idempotent — a step re-enters from nothing and does not undo what the step before it did.
- **Typing.** The question is typed into the bar at the script's `cue typing` speed, by setting `value` and calling `fitInput()`. No synthetic key events are sent, and Enter is never sent: `commitTop` navigates away for questions that are not question-shaped. Under reduced motion the question appears whole.
- **Tiers.** BM25 is instant. MiniLM (24 MB) is fine to load and works in Safari. **The tour never triggers the 255 MB LFM download.** If the visitor already has an engine active, the elaboration streams as a bonus. Otherwise the tier strip shows what would answer, which is honest.

### Core hooks to add (search-core / overlay)

Today nothing signals that a render has finished, the scene run is private, and runs close the overlay.

1. **Events.** Dispatch these on `document`:
   - `jh:search-rendered` `{query, phase:'bm25'|'semantic'}`
   - `jh:search-gen` `{state:'start'|'done'}`
   - `jh:search-close`
   
   A step's "settled" means the BM25 render is in, plus the semantic render or 1.5 s, whichever comes first.
2. **Export** `JHSearch.runScene()` (it confirms the current plan card) and `JHSearch.cursorTo(i)`.
3. **A `keepOpen` / tour mode flag.** In tour mode, `onCommandRun` does not close the overlay after a scene or command (it does today, 1400 ms after receipts). Live pieces still sleep normally.
4. **A tour-state key** in `sessionStorage['jh-tour'] = {id, step, state:'playing'|'paused', ts}`. It is only needed if the tour ever crosses pages (§4).

Each hook is small, and each one is useful to more than the tour. The events also give the test suites a way to wait for a render instead of sleeping.

## 3. Taking over: the rules

The tour is a guest in the visitor's bar. **The visitor always wins, and the tour never overwrites them.**

| Visitor does | Tour does |
|---|---|
| Types in the bar, or pastes (a trusted `input`/`keydown` on `#so-searchInput`) | **Pause at once.** The bar reads "Paused — you're driving · ▶ resume · ✕ end". Their query runs normally |
| Scrolls the panel, hovers to read, or moves the cursor with ↑↓ | Pause the dwell timer only. It resumes 2 s after they stop. Reading is not taking over |
| Clicks a result that stays on the page (a piece, a fact row) | Pause |
| Clicks a link that leaves the page | Save `{step, paused}` and let it go. The next page shows a small chip, "Tour paused · step 4/10 · ▶ resume ✕" — the `?from=playground` chip pattern, read from sessionStorage. Resume returns to index and re-enters the step |
| Draws on the fish tank while the bar is closed between steps | Pause |
| **Esc** | Pause first. A second Esc runs the overlay's own ladder. The tour catches Esc in the capture phase so the ladder's "clear the query" rung never fires on the tour's query and wipes `jh-search-session` |
| ✕ | Exit. The bar stays open with whatever is showing, and the residue sentence comes back |
| ▶ after taking over | **Re-enter the current step**: it re-types its own question. What they typed is not lost — it is the residue's question and comes back as the bar's history. Offer "▶ continue from step N" and "↺ restart", nothing cleverer |
| Back or next while paused | Move one step and stay paused (the step's state loads; the timer doesn't run) |

Keys while the tour runs and focus is **not** in the textarea:
- space — play/pause
- ← and → — back/next
- Esc — as in the table

In the textarea the keys belong to the textarea, because a wrapped paragraph uses ↑↓ and ←→.

**Reduced motion:** no typing, no auto-advance. The tour becomes a slideshow the visitor steps with next.

## 4. Where the tour runs

**Recommended for v1: one page.** Run everything on index.html. The bar works on every page, the
reel's command scene is the index tank, and one page means:
- no cross-page state
- no reload between steps
- no first-open wait for the core on every hop

The reel's `page` field still shows as the module's nav badge (`design ↗`), so the site's map is visible even though the tour stays put.

**Later: detours, not hops.** At some steps the tour can offer a detour (`live detour`) that
leaves the main line on purpose and resumes it afterwards. The best one is **design.html:
"draw a circle and put two fish inside"**. The Fish Maze is the strongest live demo on the site,
and the reel never shows it. That needs the `jh-tour` key and the paused-chip machinery from §3.

## 5. The delta: reel vs site

The reel says its copy is the site's own. Mostly true. Here is what has to change before the two can tell the same story. "Chunk N" = `search-chunks.json` id.

### A. Conflicts — John decides which side is true, then one side changes

| Reel says | Site says | Suggestion |
|---|---|---|
| "3 products shipped" | chunk 27 lists **5** (AROC, Nanome 2, Coaching OS, Muse.bio, OpenProse); the reel itself shows 4 | Make the stat 5, or name what "3" counts |
| "3 award wins" | chunk 21 / resume.json also list **AT&T 5G Hackathon 2019** and the **Kevin Kelly challenge 2014** | Make the stat 5, or "3 awards for AvatarMEDIC" |
| "4 domains: AI, web, 3D, XR" | `resume.json skills.domains` is a *different* four (biotech, medtech, education, tools for thought); chunk 22 says "AI, XR, physical computing" | Pick one list, everywhere |
| Coaching OS "adapts to your **goals**" | chunk 16: "adapts to your **business**" | Align |
| Influence "**interactive** installation, 2016" | chunk 13: "**Audiovisual** installation, Georgetown Media Fest 2016" | Align |
| Earth Star "Envisioning a New Old Future" | art.html: "Earth Star: A New Old Way" | Align |
| Kevin Kelly cite: "Founder of Wired, on John's winning future scenario" | art.html: "on his 100-word desirable-future challenge (2014)" | Align |
| "137 **live** approaches" | "137 total brand approaches / working homepages" | Use "working" |

### B. Reel copy the site never says — add it to the site (and a chunk), or cut it from the reel

These are taglines, so this is John's call. If they are the brand, they belong on index/about and in chunk 1 or 28, so "who is john?" can return them live:
- "Artistic Expression Meets Structured Data."
- "Tools for thought, visualization, communication and action"
- "Science x Craft = Design"
- the "| Artist" half of the tagline
- the two Nanome lines: "New Paradigm meets industry standard…" and "Refactored UX for elite collaboration"

### C. Site gaps the tour exposes (needed for the live steps to answer)

1. **A clients chunk.** "Who has he worked with?" has no direct answer. The logo strips (services.html "Who I've worked with", index.html) and the media-kit clients board need one chunk with `facts` rows, a `services.html#…` anchor and the logos as media.
2. **A "John at a glance" chunk (or `facts` on chunk 1).** It carries the stats the answer scene shows (years, shipped, wins, domains) once §5A is settled. Generate it from `resume.json` with `build-resume.mjs`, like chunks 4/21/23/26/27/50, so the number lives once.
3. **Kevin Kelly in the endorsements.** He is quoted in the reel's quotes scene but is not in chunk 59. Add him as a fact row, cite aligned per §5A.
4. **The OpenProse approaches images** (8 webp, branch-only). Land them, show them on openprose.html, and list them as media/pieces on chunk 40 so the results step can show what the film flips through.
5. **`earthstar-painting.webp`** is chunk 11's image, but no page shows it. Put it on art.html so the chunk's link lands on the picture.
6. After 1–5: run `build-chunk-vectors.mjs`, add `CHUNK_AUDIT.md` sections, and keep `anchorcheck` at 0.

### D. On the site, missing from the reel — candidates for detours or a longer tour

These are not deltas to close in the film; they are material the live tour can reach:
- the Fish Maze (design.html) — the best one
- onagents talk, chunks 51–57
- Writing, chunks 39/14/24
- Playground (38) and READI (58)
- MetaMedium (3)
- the Nanome research pivot (46, about 24 sessions at Pfizer and Novartis)
- Coaching OS details and packages (16/17)
- the search tiers themselves (36): the reel shows the marks but never says what they are. A caption on the `answer` step can.

## 6. Parity, enforced

`Agent Reference/search-tests/tourtest.mjs` — this is the evidence rule as a test. For every scene in the reel script that has a `query`:
1. run the query through the real pipeline (the way servicetest does)
2. assert the scene's on-screen claims appear in the rendered postcard: its stats, cites and headlines, normalized

A reel line the site cannot return fails the build. When it does, either the site gains the claim or the reel loses it. Today it would fail on every row of §5A–B, and that list is the delta.

A second pass in the same suite drives `jh-tour.js` headless:
- play to the end
- pause and type over it, then resume
- back across the scene step
- Esc twice
- exit

It asserts that the tour never overwrites a trusted keystroke and never leaves the overlay in a half state.

## 7. Phases

0. **Decide §5A and §5B** (John, about 15 minutes) and land the reel branch, or at least `reel-script.js`, the script and the approaches images, on main. The tour's parser comes from there.
1. **Core hooks** (§2): events, `runScene`, `cursorTo`, tour-mode keepOpen. Existing search suites must stay green.
2. **Content delta** (§5C) and `tourtest.mjs` part 1 green.
3. **`jh-tour.js` on index**: the runner, the control bar, the takeover rules, reduced motion, and tourtest part 2. Add the `live` fields to the script.
4. **Entry points**: the hero pill, `?tour=1`, the "show me around" command, the film's end card.
5. **Detours** (the Fish Maze first), the paused chip across pages.

## Open questions for John

- **Entry point.** Is a hero pill on index enough, or does every page get the tour in its nav?
- **Length.** The film is 60 s. Is a live tour of about 2 minutes all right, or should some scenes be `live skip`?
- **Sound.** Does the tour play the reel's score, quietly and opt-in, or run silent?
- **Taglines in §5B.** Are they the brand (so they go on the site), or film-only (so they come out of the reel)?
