# OpenProse x JHDesign · openprose.html — copy + layout mirror

<!--
HANDOFF NOTE (design-iteration agent → jhsite agent)

This file is the EDITING SURFACE JH uses for the case-study page. It mirrors
openprose.html (site root; payload under openprose/) 1:1, in page order. The
workflow: JH edits copy, moves blocks, or changes embed/style fields HERE,
then asks the agent to "fold the md back in"; the agent translates the diff
into the HTML exactly, normalizes obvious typos, and FLAGS anything
ambiguous instead of guessing — then re-syncs this file so mirror == page.
Keep that loop alive: after any fold or any direct page edit, update this
mirror to match. Embed URLs in the page point at openprose/canvas-display/
(the ?v=N cache-buster bumps whenever anything inside that folder changes).
Pairs with HANDOFF.md (invariants, fragile machinery, QA recipe).

EDITING CONVENTIONS (this file mirrors the page 1:1, in page order)

· Every `##` heading is a page section, in DOM order. Every block under it
  appears on the page in the order written here.
· `[cols: LEFT | RIGHT]` opens a two-column band; the `LEFT:` and `RIGHT:`
  sub-blocks are the columns. Swap them here = swap them on the page.
  Widths noted where uneven.
· `[EMBED · name]` is a live canvas panel. Every embed carries the same
  editable settings, which map 1:1 to its URL params:
    items:   the subset shown, in display order (blob page names; `full set`
             = no filter, all 36). Reorder/add/remove = same change live.
    sort:    sequence | date — sequence shows `items:` order verbatim;
             date re-sorts by first-commit timestamp.
    cols:    auto | 2 | 3 | 4 | 5 — auto picks the biggest cards that fit
             the panel without scroll.
    ratings: on | off — reviewer stars on the cards.
    view:    grid | canvas · zoom N — canvas boots the pan surface zoomed
             to N (or `fit` for everything in frame).
    aspect:  the panel's placeholder ratio = its MAX height (the scroll
             ceiling). Content shorter shrinks the panel; taller scrolls
             inside. Phones override to 3/4 globally (see STYLE PARAMS).
    caption: the bar text under the panel.
  Edit any field here = the agent rewrites that embed's URL to match.
· `(gap: sm|lg|xl)` on a block = an inline spacer above it (the page's
  spacing scale: sm 0.75rem · lg 1.5rem · xl 2.25rem). `(flush)` = inline
  zero-margin. These are the only inline styles in the flow.
· `## STYLE PARAMS` at the end is the sheet of dialed stylesheet values,
  grouped by section — edit a value there = the agent changes the CSS.
· ``` fenced blocks are the literal code-block contents.
· **bold** / *italic* map to strong/em in the HTML (em renders in Kecal).
· Moving a whole block (lede, embed, aside, band) up or down here moves it
  on the page. Tell the agent "fold the md back in" when done; anything
  unclear gets flagged rather than guessed.
-->

## HERO

- Full-viewport WebGL symmetry-ripple over the photograph; frosted oval pill.
- Oval contents, stacked: canonical **OpenProse** logotype (static), then:

byline: [JH signature] *Design Exploration*
sub: OPENPROSE × JHDESIGN · SPRING 2026

## OPENPROSE (standfirst, unnumbered kicker)

kicker: OpenProse

[cols: copy LEFT | code RIGHT]

LEFT (three ledes):

OpenProse is a way to *author outcomes*. The approach is to contract the LLM rather than merely prompt it, using OpenProse structuring to define: *requirements*, *maintenance*, and *strategies*. Agents run, maintain, and review the contract on cadence.

(gap: sm) In April 2026, Dan, the CEO of the newly funded [OpenProse](https://prose.md/), hired JHDesign for a founding design project with two tracks of exploration: the brand, and the design of solutions for visualizing trace data from the RLM product.

(gap: sm) The trace track is still confidential. This page is the brand and web-craft journey.

Upfront please understand that the exact copy for most of this work is intentionally left as LLM-ese; it stands in for lorem ipsum as a placeholder with a twist.

RIGHT (code block):

```
// json-verifier.prose.md · a whole service, one page
name: json-verifier
kind: service

Description
Validates generated JSON before a downstream
system consumes it.

Requires
- `candidate_json`: JSON text to validate

Ensures
- `validation_report`: whether the JSON is valid,
  with parse errors and line references when
  validation fails

Tools
- `cli:jq`: JSON CLI available on PATH

Strategies
- when JSON validation fails, report the parse
  error and location without rewriting the input
```

## I THE BRIEF

kicker: I The Brief
h2: Branding an *AI programming paradigm*.

lede: Communicating quality and stability with useful elegance in a growing sea of noise.

[3-card row: paradigm cards]

card 01 / the pitch · **Agents with *responsibilities*.** claim: Beyond prompts, author outcomes
Combining the best of declarative approaches, like SQL, with the reasoning power of LLMs. Describe the outcome, set the contract, let it run and self-correct.
foot: · OpenProse.md

card 02 / the audience · ***Four* core *personas*.** · claim: Power users to investors.
AI power users, investors, CTOs, senior engineers.  
foot: · PERSONAS.md

card 03 / the voice · **Understated *authority*.** · claim: Open and informative with style.
No hype. Show the work: real outputs, real numbers. Technical depth when asked, accessible by default. Confident with reciepts.
foot: · brief.md

## II THE TOOLING

kicker: II The Tooling
h2: Building the *workshop* while working in it.

[cols: intro copy LEFT (55%) | contract RIGHT (45%)]

LEFT (five ledes):

For this project I debuted my take on a 'canvas' for generative web design: the **JHDesign Review Canvas**, built alongside the work as needs emerged. The Review Canvas shows the content of a repo as one navigable page with three view modes (canvas, grid, focus), where every page is a live iframe with star ratings, typed comments, and freehand drawings composited onto screenshots. Review state lives in *git*; each reviewer writes only their own file, so feedback merges without conflict.

Reviewing dozens of live website experiments needed more than a folder, but I wanted a better way. I've been a designer for about 10 solid years now; from Adobe XD to Figma. Being real with you, I've been there and I don't want to go back. As an artist I've done creative coding, as an XR designer I've done hacking and copy/pasting. Now finally I can "stop drawing dead fish". Yet, the rise of vibe coding, I'm also recalling my history and standards; for so long we designers have been adding abstractions of different apps and tools just to simulate code, now why not just use the code and standards directly? Thus the webpage that is a canvas that shows iframes. Took some iteration to get it performance stable, but now it's such a great way to scan a bunch of sites or docs.  

The Review Canvas just needs a Github repo to make it multiplayer. Dan could look at the material directly, review it, and leave his feedback, all as code in the shared GitHub repo, with no extra overhead, no accounts to set up, and no intermediary steps to get the comments back into production.

The supporting tooling for the Canvas even runs on *OpenProse* itself: the canvas's integrity is a written responsibility an agent keeps, audited by script and attested with commit SHAs, and the design system is indexed by a runnable OpenProse program. 

This system was essential in managing the large surface area of this project across two tracks. Instead of staying linear in code chat I could spread out and review whole swaths of work, specify changes, then just have the agent read the latest manifest and get to work in parallel plans. Every exhibit grid on this page is a stripped-down version of the review canvas; the full canvas viewer is at the end. I'm still developing this project to enhance realtime and be deployable as a platform outside of the dev environment of sharing a repo.

RIGHT (code block, then the 4 steps stacked):

```
// .agents/prose/src/review-state-stays-coherent.prose.md 
name: review-state-stays-coherent
kind: responsibility

Criteria · `agent-close.mjs --audit-all` must read OPEN=0 for every closed round
Constraints · never close a comment to make the audit green — a clean audit is
              the result of coherent state, not the goal to be gamed
```

✎ **Draw · comment** — **Drawn** annotations over the live page become typed work items, each with a stable id like **c_1c28d078**.
⇄ **Claim · two locks** — **Claimed** by an agent under a two-lock protocol (a file reservation plus a comment claim), so parallel sessions never collide.
⊕ **Close · commit** — **Closed** with a commit SHA attached. Every fix is traceable back to the sentence that asked for it.
↺ **Return · chip** — **Returned** to the canvas as a closed chip. The designer sees the loop complete where it started.

(film band parked — hidden on the page until the capture lands:)

[FILM SLOT · review-canvas-loop.mp4, placeholder until filmed] (flush to column top)
caption: The working review canvas: draw, claim, close, return. 

[3-card row: paradigm cards]

CARDS BELOW (gap: md)

card pattern 01 · **Dial it in, then *bake* it.** · claim: Dynamic UI as a hand tool.
Create on-demand live tuner panels for dialing in elements of the pages. For example, a set of controls was used to dial in the hero's reflection: seven registration parameters as sliders over the real shader. The values were baked into source and the tuner retired off the page into markdown, ready to re-use if needed.
foot: · _reflection-tuner.md

card pattern 02 · **Annotations become the *artifact*.** · claim: Feedback is a pipeline.
A drawing on the canvas becomes a typed work item with a stable id. It is claimed, fixed, closed with a commit SHA, and returns as a chip. The same notes ride the exhibit cards under the ✎ toggle. 
foot: · reviews/*.json

card pattern 03 · **Two locks, zero *collisions*.** · claim: Parallel agents, one truth.
Sessions claim work under a file reservation plus a comment claim. Both locks must agree before an edit lands, so parallel agents never write over each other.
foot: · agent-reserve.mjs

## III BREADTH

kicker: III Breadth
h2: *37* approaches. *29* marks.

lede: Two months of parallel explorations looking for the best surface area. Every approach is a working page. 

[EMBED · top-rated approaches]
items: approach-f-v2, approach-d2-gothic-humanist, approach-h-warm-editorial, approach-i-editorial-saas, approach-j-tufte-v2, approach-f-v5-openprose, approach-m-dan-accordion
sort: sequence
cols: 4
ratings: on
view: grid
aspect: 15 / 8
caption: The combined top-rated set, both reviewers, live. Stars shown on each card.

lede (gap: xl): Round-one stars and comments were compiled into a written document, **BRAND-PRINCIPLES.md**: *seven* invariants, *five* named rejects. A calibration signal to work from.

[cols: Rewarded LEFT | Rejected RIGHT — two checklists, no rules]

REWARDED (✓):
- **Warm editorial** surfaces · paper, ink, patience
- **Elegance and the developer surface** on one page
- **Tufte data-density** written as prose
- **Calm confidence** · the quiet voice wins
- Real artifacts over abstract decoration

REJECTED (×):
- 2020 SaaS tropes: gradient cards, floating blobs
- Cryptic visuals that don't relate to the product
- Aqua / Matrix / neon nostalgia
- High-contrast aggression
- "Cool, but doesn't say what it does"

lede (gap: xl): The top of the ratings shared a look: warm serif editorial. By 2026 that look was everywhere. Serif fonts were undergoing their vibe-coded assault, the default dress of generated landing pages. OpenProse needed its own *style*.

lede (gap: sm): Turning to legibility and tradition, I explored monospace families. However, the appearance can become monotonous. Then at just the right moment of scrolling TwXtter I see [Kecal](https://github.com/FungiType/Kecal) for the accents. Kecal is an open typeface (OFL) by FungiType: Rodrigo Fuenzalida, Jordan Egstad, and Jiří Krblich. Used with thanks.
Monotypes and Kecal became a way to rise above the noise and contribute to *legibility*: clearly readable, quietly esoteric, a face no generator reaches for.
[EMBED · the type studies]
items: direction-delta-machine, direction-delta-machine-kecal, direction-theta-living-document-concept, direction-gamma-manuscript-concept-kecal, direction-eta-organism-mono-kecal, direction-beta-tufte-mono-kecal-styleguide-teal, typography-pairings, direction-experiments
sort: sequence
cols: auto
ratings: off
view: grid
aspect: 15 / 8
caption: The type studies: the pure monospaced page, the pinned mono spec, the permutation sheet, and the aspect catalog where exploration continues.

lede (gap: xl): In parallel the *voice* settled: monospace families for the running text, Tufte density for the register, *Kecal*, upright, as the one accent. The system consolidated into **_tokens.css**, **_pairings.css**, **_styleguide.js**; the permutation sheet keeps every pairing.


## IV THE LOGO

kicker: IV The Logo
h2: *Five* directions emerged from doodling. *One* stood out.

lede: To differentiate the brand of OpenProse from pure vibe-coded competitors, I returned to my roots: *drawing* by hand, then rebuilding in vector. Now with a modern twist: I used Arrow, an SVG-generating LLM from [QuiverAI](https://quiver.ai/), to help fill in details and explore alternates.

(gap: sm) Five families emerged and one seemed to call out more than the others. The logo family called **Style** was forwarded as a candidate for canonical mark. Pick one below to *see* it at size.

[5-tile row: logo families, ink-normalized — each tile is a button that shows that family in the specimen; teal marks the one showing] style · canonical / infinite / circle / swish / cursive

[LIVING SPECIMEN · constant stage, signet + logotype, click cycles families]
figcap: The living specimen · pick a family above, or click the mark to cycle infinite → style → circle → swish → cursive.

[EXPLORATION SHEET · click-to-expand overlay]
figcap: The field of studies the five families were distilled from, clustered by idea. Click to expand.

## V THE EVOLUTION

kicker: V The Evolution
h2: Make the page feel *alive*.

lede: Aiming to become more interactive: a surface that responds.

(gap: sm) I went in a handful of directions, different metaphors. Cellular automata were interesting; then, as I made UI to mess with the parameters, I found settings that evoked ripples and water.

(gap: sm) While I was working on this project over the two months, I went on a quick vacation to La Paz, where I swam with a *Whale Shark* for the first time. As a palette cleanser, with the power of Arrow letting me generate clean SVGs from images plus some manual touchups, the little Whale Shark was born, combined with him eating the cellular automata.

(gap: sm) From there I went into trying black hole motifs: pure vibe-coded 2D versions alongside a port of [vlwkaos/threejs-blackhole](https://github.com/vlwkaos/threejs-blackhole).

(gap: sm) A fun idea, but ultimately just a moment of creative madness that helped me transition back into refining the cellular automata style.

[EMBED · the mediums]
items: direction-eta-organism-homepage-kecal, direction-delta-machine-homepage-rain-infinite, direction-nu-tideline, direction-rho-blackhole-hero-physics, direction-rho-blackhole-hero-threejs, direction-mu-bloom
sort: sequence
cols: auto
ratings: off
view: grid
aspect: 15 / 8
caption: Click into any card; ⛶ in its header goes fullscreen.

lede (gap: xl): The automata were alive but abstract, and thus also possible for others to generate. The search for unique texture led back to my oldest medium, *photography*, and one motif held through the search: the bloom and its ripples. I started by simply putting photographs in place of whitespace, but it became clear that I had to try combining the interactive elements with photography, something I have found myself doing as an [artist](https://www.johnhanacek.com/art.html), here in its most advanced form.

[EMBED · the mu chain]
items: direction-beta-tufte-mono-homepage-kecal, direction-mu-bloom-homepage-landscape-tufte-kecal, direction-mu-bloom-homepage-symmetry-ripple-topmask
sort: sequence
cols: auto
ratings: off
view: grid
aspect: 15 / 8
caption: Exploring the bloom and grounding it.
[3-photo row] Just the Light / Like Dust / Moon Shine
figcap: The Sierra Nevada series.
[3-row feature list]
01 **Texture** — A series of Sierra Nevada lake scenes, shot in **2011**, a decade before the project.
02 **The move** — Keep the photograph. **Replace** the sky and the water with shaders: real mountain, procedural dawn clouds, simulated ripples.
03 **Registration** — Aligning the digital reflection with the real one took **11** documented revisions and a hand-dialed tuner, later retired into markdown.

[cols: labels + code LEFT (42%) | 3D layer stack RIGHT (58%), vertically centered]

LEFT (legend stacked 01-04, then code block):

**01 · the photograph** — real mountain, real reflection. When WebGL is unavailable it shows.
**02 · the clouds** — the procedural pass, rendered alone: an FBM cloud field lit from the upper left.
**03 · the ripples** — gaussian ring displacement plus ambient shimmer, raindrop randomness and larger response to the cursor.
**04 · the mask** — the mountain with its sky cut away by hand.

```
// reflection registration · dialed by hand, then baked (_reflection-tuner.md)
axis 0.505   shorten 1.012   shiftX 0.000   scaleX 0.990
tilt −0.004   axisTilt −0.009   keystone 0.000
// cloud-clear brush · 96² persistent mask · radius 0.13 · strength 0.55 · 7s return
```

RIGHT: [3D LAYER STACK · four plates exploded in perspective]

lede (gap: lg): I wanted to make something that would stand out from the increasingly crowded field of design in the generative age. The real photograph hangs printed above my monitor, its ripples frozen except in memory; on the monitor below, they move.

(gap: sm) A reminder of how far technology has come; of all that will change, and all that will stay the same.


## VI THE DISTILLATION

kicker: VI The Distillation
h2: Everything above settled into a *style*.

lede: Thirty-seven approaches, five families, and a chain of heroes distill into the canonical set: the homepage concept, the permutation sheet, and the styleguide that pins the defaults, with the aspect catalog beside them showing the different aspects of this style landscape. 

The catalog is a way to explore alternatives and play with the best feeling. The 'canonical' style and page represent crystallizations of the possibilities into some ideal candidates.

[EMBED · the canonical set]
items: logo-collection, direction-styleguide, direction-canonical-homepage
sort: sequence
cols: auto
ratings: off
view: grid
aspect: 10 / 7
caption: The canonical set: the logo collection, the pinned styleguide, and the homepage concept that lands it.

## VII CONCLUSION

kicker: VII Conclusion (bloom canvas behind)
h2: Initial work. *Whole* craft. [JH signature]

lede: Branding, design, engineering, and tooling in one engagement. Founding design where agentic tools meet the handcrafted.

counts: **471** commits · **130** total pages · **6** permutation styleguide pages · **5** logos · **1** distillation

```  (gap: lg above, flush below)
$ npx skills add openprose/prose
```

button (gap: sm): OpenProse ↗ (prose.md)

[EMBED · the full canvas]
items: full set (all 35, oldest first — the blob is written in creation order;
       direction-zeta-saas-concept-kecal pulled by hand from items.js)
sort: sequence
cols: auto
ratings: off
view: canvas · zoom 0.65
aspect: none (fixed panel, scrolls/pans inside)
caption: The parting gift: a sampling of brand experiments in the Review Canvas Lite. Modes, comments (✎) and fullscreen in its header.

## FOOTER

left: [JH signature] × [OpenProse mark] OpenProse · 2026
right nav: Tooling / Breadth / Evolution / Distillation

## STYLE PARAMS (dialed stylesheet values — edit here, agent folds into CSS)

### hero oval
desktop: top 42% · padding 1.85rem 3.9rem 1.0rem (top-heavy)
mobile (≤640): top 27% · padding 1.55rem 1.5rem 0.9rem
logotype width: clamp(260px, 34vw, 410px) desktop · clamp(200px, 64vw, 320px) mobile
byline size: clamp(1.15rem, 1.75vw, 1.375rem) desktop · 1.08rem mobile

### embeds (all panels)
placeholder aspect = max height (see each embed's aspect: field)
mobile placeholder: 3 / 4 portrait, all fit panels (≤640)
fit padding: content + 6px (scrollbar guard)
collapse floor: 240px minimum (never fully collapses)
auto columns: fewest columns whose grid fits the ceiling = biggest cards; narrow shells cap at 2
embed card budget: 8 live subframes desktop · 4 on phones

### §II columns
intro band: copy 1.1fr | contract 0.9fr
steps: stacked under the contract in the intro band's right column (film band parked)
collapse: ≤980px single column

### §IV logo
tile signet heights (ink-normalized around canonical): style 46px · infinite 30px · circle 31px · swish 30px · cursive 36px
tile logotype heights: base 39px · infinite 40px · swish 38px · cursive 40px
tile pair stage: 48px tall
specimen stage: height clamp(200px, 40vw, 300px) · signet clamp(84-160px) · logotype min(500px, 58%) × clamp(80-110px)
specimen per-family optical scale: circle 0.90 · swish 0.92 · cursive 0.83 (signet) · infinite 1.03 · swish 0.98 (type)

### §V stack band
columns: labels+code 0.85fr | visual 1.15fr, vertically centered
band top clearance (for the projecting plate): clamp(4rem, 16vw, 9rem)
stack: height clamp(280px, 44vw, 440px) · scene min(540px, 74%) · tilt rotateX(58°) rotateZ(−32°)
plate lifts: 0 / 64 / 128 / 192px · hover 0 / 90 / 180 / 270 · mobile 0 / 38 / 76 / 114
collapse: ≤980px single column (visual → labels 2-up → code)

### code blocks
spec blocks (.spec-pre): 0.82rem (fs-small)
install command: 1rem

### breakpoints (page-wide)
980px: all two-column bands collapse
720px: legend/photo rows go 2-up · marks-era grids
640px: hero mobile layout · embed portrait placeholders · shell 2-col cap
560px: logo tile row goes single column
