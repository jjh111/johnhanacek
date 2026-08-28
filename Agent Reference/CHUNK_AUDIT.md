# Chunk Honesty Audit — Assets/search-chunks.json

*Phase 10a, generated 2026-08-26. Every string in the search index — content, tags,
micro, tldr, facts — is a claim the site makes on John's behalf. This doc extracts
every claim that needs a human, classifies it, and gives John a mark-up surface.*

**How to mark:** on each `- [ ]` line, either check it (`- [x]` = confirmed as-is),
write `EDIT:` followed by the corrected wording, or write `CUT`. Marks get applied
verbatim, then `node scripts/build-chunk-vectors.mjs` rebuilds vectors and the
offline eval labs re-run to prove retrieval didn't drift.

**Classifications:**
- **[chunk-only]** — the claim appears NOWHERE on the site's pages; search says
  something the site itself never says. Highest scrutiny.
- **[John-confirm]** — page-backed, but the backing is itself John's claim about
  the external world (award, date, employer, client, publication). The site and
  the index stand or fall together; John vouches once, here.
- **[consistency]** — two chunks (or a chunk and a page) say it differently.
- **[tone]** — phrasing that oversells or reads as AI-written; John's call.
- **[site-verifiable]** — the site demonstrably backs it (a feature that runs, a
  file that exists, text mechanically found on the page). Verified; listed only
  for completeness.

**Standing rule (from Phase 10a forward):** a new or edited chunk lands together
with its audit section here, or it doesn't land.

**Machine sweep (2026-08-26):** every proper noun / distinctive claim was grepped
across `*.html`. Backed on-page: Muse.bio, CHARIoT, Danskey, EduLearn, "Answer
Engine", Collaborate.org, CNDLS, Founder Institute, AsMA, Reactor Hackathon,
'Most Meta', just-war thesis, A1R, jhana.zone, Technium, HuffPost, Gumroad,
Kindle, Substack, stealth clients, Hermes, OpenCode, 471 commits, Sierra Nevada,
wrist UI, ShapesXR, Barcelona, Godish, Leap Motion, Media Fest, hand-tracking,
HoloLens, "10+ years" (about.html). **Chunk-only:** the cooking dishes, the
brownie, hiking/camping — see §A.

---

## A. Chunk-only claims — the site never says these

### Chunk 30 — Personal: Cooking & Food
The whole chunk is chunk-only (about.html has no cooking section). Sourced from
conversation, not from any page.
- [x] Go-to dishes: albondigas soup, rice tahdig, leek-anchovy-lemon pasta, whole fish on the grill — **John confirmed 2026-08-27, keep as-is**
- [x] "Has a brownie recipe memorized from scratch" — **confirmed, keep**
- [x] Keep the chunk at all? — **yes, keep** (John, 2026-08-27)

### Chunk 31 — Personal: Gardening & Outdoors
"Native plants" appears on-site only in other senses; hiking/camping are chunk-only.
- [x] Gardens with a focus on native California plants in San Diego — **confirmed, keep**
- [x] "Hikes and camps regularly" — **confirmed, keep**

### Chunk 32 — Location & Lifestyle
- [x] "UCSD alum who stayed" — **REWRITTEN from John's own account (2026-08-27).** He is a
  UCSD alum who went east for grad school in Washington, DC, toured with friends' band, then
  came home to settle back by the ocean. "Who stayed" was wrong — he left and returned.
  New content, micro ("Back by the ocean, on purpose.") and tldr applied.

---

## B. External-world claims — page-backed, John vouches here

### Chunk 4 — JH Design LLC
- [ ] Independent design practice **since 2016**
- [ ] Current client: **Muse.bio** (workshop facilitation, user personas) — "current" as of when?
- [ ] Current clients: **stealth AI startups** (MVP design, demo prototypes)
- [ ] Founding design engagements: **OpenProse and Nanome** (is "founding design" accurate for Nanome, vs employed XR designer? see §C)

### Chunk 5 — Nanome
- [ ] **Primary XR designer**, Nanome Inc., **2022–2024**
- [ ] **Shipped** a conversational AI interface for molecular analysis
- [ ] Led UX research with scientists

### Chunk 6 — BadVR
- [ ] Immersive UX Designer, **2021–2022**
- [ ] **Shipped** hand-tracking interaction systems for **Meta Quest and HoloLens 2**
- [ ] Designed AR HUD interfaces for real-time sensor data

### Chunk 7 — AvatarMEDIC
- [ ] Founding CEO, **2019–2021**
- [ ] Led product strategy, pitching, concept development; directed engineering and marketing/website design
- [ ] Built demo prototypes: HoloTRIAGE, A1R Augmented First Responder, Robot Digital Twin Control
- [ ] **Founder Institute SF 2020 graduate**

### Chunk 8 — HoloTRIAGE
- [ ] Won **Microsoft Reactor Hackathon (2020)**
- [ ] HoloLens 2, Unity + mixed reality toolkits

### Chunks 9 + 21 — Awards (the facts rows render verbatim in search)
- [ ] **R&D Innovation Award, Aerospace Medical Association (AsMA), 2022** — for robot digital twin
- [ ] **NIST CHARIoT Phase 2 Winner, 2021** (exact program name/phase?)
- [ ] **Microsoft Reactor Hackathon Winner, 2020** — HoloTRIAGE
- [ ] **Founder Institute Graduate, San Francisco, 2020**
- [ ] **'Most Meta', Georgetown CCT, 2016**

### Chunk 12 — Interactive Installations
- [ ] Godish (**2015**), Leap Motion
- [ ] God Like (**2016**), Kinect, collaboration with **Nathan Danskey** (name spelled right?)

### Chunk 13 — Influence
- [ ] Georgetown Media Fest (**2016**)
- [ ] **Live at jhana.zone** (still up? external link in search results)

### Chunk 14 — Fractal Futures
- [ ] Published on **Substack, Gumroad, and Amazon Kindle** (all three still live/purchasable?)

### Chunk 16 — JH Coaching OS
- [ ] "Designed and **shipped**" — in active client use?

### Chunk 17 — Coaching Packages
- [ ] Guided Coaching (4 sessions / 2 months) · Embedded Retainer · Build Sprint (1–2 wk) · Audit — **is this the current offer?** (Search quotes it as today's menu.)

### Chunks 19 + 20 — Education
- [ ] Georgetown MA in CCT, **2014–2016**; thesis on AI-powered conversational interfaces; **second thesis** on technology standardization
- [ ] UCSD BA Political Science / IR, **2008–2012**; thesis on remotely piloted aircraft + just war theory

### Chunk 23 — Career Timeline (facts rows render verbatim)
- [ ] Nanome 2022–24 · BadVR 2021–22 · AvatarMEDIC 2019–21 · OpenProse 2026 · JH Design LLC 2016–present
- [ ] **Collaborate.org (2015–18)** — role? (currently rendered with no description)
- [ ] **Georgetown CNDLS (2014–15)** — role? (same; overlaps the MA — intentional?)

### Chunk 24 — Research & Publications (strongest external claims in the index)
- [ ] Masters thesis: "Art Math, Math Art"
- [ ] EduLearn **2015 Barcelona** — technology adoption research
- [ ] Atlantic Council, **"Internet as Answer Engine"** — exact title + venue right?
- [ ] "**predicted ChatGPT-style systems years before they existed**" — stands as-is? (Also the micro: "Predicted answer-engines before ChatGPT.")
- [ ] "Featured in **Kevin Kelly's Technium** and **HuffPost**" — featured, cited, or linked?

### Chunk 26 — Leadership & Teams
- [ ] "Lead designer at Nanome" — see §C title conflict
- [ ] AvatarMEDIC scope line (matches chunk 7)

### Chunk 27 — Shipped AI Products
- [ ] "**Four shipped AI products**" — does John stand behind "shipped" for all four? (1) JH Coaching OS (2) Nanome conversational AI (3) **MetaMedium** (4) this site's LLM search — see §C on MetaMedium.

### Chunk 40 — OpenProse
- [ ] **Two-month** engagement, **2026** — and the case-study numbers quoted into search: 5 logos, 37 working approaches, 471 commits, 130 pages, 2011 Sierra Nevada photograph (all appear in openprose.html; confirming they're final)
- [ ] Client sign-off status — memory says sign-off was still John's to get; is the case study cleared to be quoted by search?

---

## B2. New claims entering the index — Round 1 (2026-08-27)

Claims John supplied in conversation this round. They enter the index under the same rule as
everything else: recorded here, sourced, and his to withdraw.

- [x] **JHDesign LLC was formally founded in 2024**; John has operated as an independent
  creator and designer **since 2014**. The index said "since 2016" in chunks 4, 23 and 26 —
  wrong on the date AND conflicting with about.html, which already carried 2014–2024
  Independent Designer / 2024–Present JHDesign LLC. Chunks corrected. Spelling is
  **JHDesign LLC**, no space (chunks said "JH Design LLC"); swept.
- [x] **AROC Situational Awareness system** at BadVR — John's name for the AR HUD he
  designed there. NOT on any page today (only as an asset filename), so this is a
  **chunk-only** claim resting on his word. Added to chunks 6 and 27. *If it should be
  on-page too, that is a site edit not yet made.*
- [x] **Nanome, JH Coaching OS and AROC are shipped products; MetaMedium and this site's
  in-browser LLM search are experiments** (John, 2026-08-27). Chunk 27 restructured to say
  exactly that, and retitled "Shipped Products & Experiments".
- [x] **Chunk 34 technical detail** — the fish canvas's eight-level behavior priority stack,
  three size classes, V-formation schooling and BFS navigation field, and the three search
  tiers (BM25 field-boosted → all-MiniLM-L6-v2 int8 embeddings fused by reciprocal rank →
  in-browser WebGPU or a local LMStudio/Ollama endpoint). Each verified against the code and
  `Assets/FISH_SYSTEM_TECHNICAL.md`, not written from memory.

---

## C. Consistency flags

- [x] **Nanome title** — John: "**Lead XR Product Designer**" (2026-08-27). Applied to
  chunks 5, 26 and the chunk-23 facts row. about.html said "XR Product & Interaction
  Designer" / "Primary XR Spatial Computing designer" — BOTH corrected on the page too, so
  site and index now agree.
- [x] **MetaMedium status** — John: "a **prototype and whitepaper**, a north star I work
  towards and want to share with others by showing more than telling as demos" (2026-08-27).
  Chunk 3 reworded; "shipped" dropped. Chunk 27 moves it out of the shipped list into
  **experiments**.
- [x] **Nanome as "founding design engagement"** — John: employed there as Lead XR Product
  Designer (2026-08-27). Chunk 4 now reads "Recent founding design engagement: OpenProse."
- [x] **Chunk 34 "no build tools, no npm"** — John: "get rid of this, the whole thing where
  it says 'hand made' … I use claude code and open code, then we should say the state of it
  currently. be explicit and accurate no flourish or judgmental type" (2026-08-27). The
  "hand-built / no frameworks / no build step" framing is gone; the chunk now states what the
  site IS and describes the fish steering system and the three search tiers technically.
- [ ] **OpenProse "(2026)"** in the timeline reads oddly once 2026 is over —
  fine now, flagging for the annual pass. *(still open — annual pass)*

---

## D. Tone flags — John's call, not errors

- [x] Chunk 24 micro — John: soften to "writing about the coming Answer Engines in society
  (in 2014)" (2026-08-27). Now "**Wrote about answer engines in 2014, eight years before
  ChatGPT.**" — "predicted" dropped throughout the chunk. about.html said "written 10+ years
  before ChatGPT"; 2014 → Nov 2022 is **eight**, so the page was corrected too.
- [x] Chunk 27 micro — John: "ya 15 is goofy" → "**Shipped products: XR + AI, agentic
  workflows, and web applications.**" Chunk restructured into shipped vs experiments; see §B
  new-claims below.
- [x] Chunk 28 micro — John: "silly" → "**Student of the rich history of intelligence
  augmentation.**"
- [x] Chunk 35 micro — John: "simpler" → "**Draw a loop, get a fish.**"
- [x] Chunk 1 / 25 tenure — John: "Prototyping for over a decade, agentic programming since
  2024, 10+ year creative coder and lifelong hacker and computer enthusiast" (2026-08-27).
  Chunk 1 unchanged; chunk 25 now reads "10+ year creative coder. Prototyping in code for over
  a decade; agentic programming since 2024." NOTE: the site's only "10+ years" was about a
  publication, not tenure — the tenure claim is chunk-only and rests on John's word here.

---

## E. Site-verifiable — checked, no action needed

2 (contact strings match the site) · 3 body (the MetaMedium page exists; status
flag is §C) · 10 (tools list mirrors design.html) · 11 (art.html backs it) ·
15 · 18 (services.html) · 22 (about.html) · 25 (the site is the working proof)
· 28 body · 29 · 33 (index beliefs) · 34 (features all run; npm nit in §C) ·
35 · 36 (matches the actual tier code) · 37 (nanome2.html) · 38 (playground) ·
39 (writing.html) · 41 (services.html) · 42 (openprose.html embed).

---

*After marking: edits applied verbatim → `node scripts/build-chunk-vectors.mjs`
→ `fusionlab.mjs`/`intentlab.mjs` replay to prove retrieval didn't drift →
commit chunks + this doc together.*

---

## F. Pieces (10c) — authored 2026-08-26, same audit rule

Nine chunks carry `pieces` (live/linkable widgets). All `demo` srcs verified to
exist on disk; all `link` srcs are John's own properties. Confirm the externals
are meant to be surfaced by search:
- [ ] 35 → fish-demo/index.html (live) · 34 → JH-brand-styleguide.html (live)
- [ ] 38 → tidepool.html, hypercube, beach-beers (live — note tidepool and
  beach-beers are noindex-unlisted; the playground already links them, and
  search now surfaces them too. Intended?)
- [ ] 25 → hypercube (live, as the "creative code since 2016" proof)
- [ ] 3 → jjh111.github.io/MetaMedium (new tab) · 11 → earthstar.space ·
  13 → jhana.zone · 14 → fractalfuture.substack.com · 15 → smugmug

## G. Media fields (10e.1) — authored 2026-08-27, same audit rule

The visual-dedupe pass also finished f775ced's asset swap and gave dupe'd
chunks their own visuals. Media depict — so each line is a claim. Confirm the
batch (all swaps are dev-directed from the 10e plan; vectors unaffected —
text fields untouched, no re-embed needed):

- [ ] 1 (About John) image → `jjh-…flower headshot Large.webp` (was .jpeg —
  same frame, 63% lighter; re-encoded at matched fidelity in f775ced)
- [ ] 28 (What Makes John Unique) image → `nanome2-beforeafter.webp` (was the
  SAME headshot as chunk 1 — now the redesign before/after as the evidence of
  the rare-combination claim. John: does this image belong on THIS claim?)
- [ ] 5 (Nanome XR Molecular Design) video → `nanome-mara.mp4` +
  poster `nanome-mara-poster.webp` (was nanome-hero.mp4 + the SAME
  casestudy.webp as chunk 37. Mara = the molecular-contact demo.)
- [ ] render rule, not a claim but visible: when two results would show the
  same visual, the lower-ranked renders text-only; in workspace the side pane
  owns its lead chunk's visual and the list yields.

## H. Externals containerized (10f) — authored 2026-08-27

- [ ] 13's `url` re-pointed `https://jhana.zone` → `art.html#installations`
  (the chunk is where WE talk about the installation; the live site is and
  remains its `pieces` entry). After the sweep ZERO chunk urls are external.
- [ ] Frameable allowlist (these wake LIVE inside the postcard, same
  one-iframe budget as demos): `jhana.zone`, `jjh111.github.io`,
  `earthstar.space`. Header-checked 2026-08-27: GitHub Pages sends no
  framing headers; earthstar.space sends none. John owns all three.
- [ ] Departure cards (poster + title + hostname + ↗, `rel="me noopener"`,
  title attr notes the search is kept): `fractalfuture.substack.com`
  (Substack CSP), `johnhanacek.smugmug.com` (X-Frame-Options DENY).
- [ ] Posters captured 2026-08-27 (`scripts/capture-posters.mjs` →
  `Assets/posters/<host>.webp`): jjh111.github.io, earthstar.space,
  fractalfuture.substack.com, johnhanacek.smugmug.com. jhana.zone: capture
  FAILED — its DNS mixes a dead parking A record (192.64.119.230) with the
  GitHub Pages record; **John should drop the dead record at his
  registrar** (visitors hit this too). Poster added when reachable.
- [ ] Enter on a top result never leaves the site anymore — external top
  results pin to their dossier instead (unreachable after the sweep; kept
  as a guard).

## H2. Media swaps — John-directed, confirmed in chat 2026-08-27

- [x] 25 (Agentic Coding & Prototyping): hypercube demo piece →
  `openprose-casestudy.webp` image (the current flagship of the same claim;
  openprose.html itself is never framed — nested canvas). John: "that media
  should be the openprose case study."
- [x] 28 (What Makes John Unique): `nanome2-beforeafter.webp` →
  `model3d: BlackBox-Model.glb` (86 KB). John: "the media for what makes
  john unique should be the blackbox model." (Resolves the §10e.2 open
  question — the model's home is 28, not 9.)

---

## I. Interview chunks (43–49) — authored 2026-08-27 from John's own answers

Seven chunks covering how John works, not what he shipped. Every line came from him in
conversation on 2026-08-27; two draw on the case studies as noted. These are **chunk-only by
nature** — the site does not say any of it — so they rest entirely on his word, which is the
point: they exist to answer design-interview questions the pages were never written to answer.

- [x] **43 Handling Disagreement** — best design at the level of authority he has; works with
  engineering toward the same user outcome; compromise as a forcing function; defers only on
  the impossible, and not before exhausting options.
- [x] **44 Ambiguity and Constraint** — thrives in ambiguity; hunts unspoken structure inside
  settled processes; generates standards as needed; revisits ambiguity even on narrow scope;
  already knows what goes when a timeline halves. *(Titled "Ambiguity and Shrinking Timelines"
  at first — the word "Timelines" carries the 3x title boost and stole "tell me about a TIME
  you disagreed" from chunk 43. Retitled; the constraint story stays in the body.)*
- [x] **45 Critique and Design Reviews** — playful critique, "how might we" against
  solutionizing, expectations set going in, work kept outside the self, a good roast welcomed,
  yes/no steered toward shared understanding.
- [x] **46 Research That Changed the Design — Nanome** — sourced from nanome2.html, not from
  memory: test criteria, multi-round testing with real pharma groups, qualitative coding into
  four buckets, the "still have trouble moving around the structure" finding, and the pivot
  that removed teleportation for Spotlight/Follow.
- [x] **47 Working with AI** — "the ultimate omni-developer who is perhaps a bit too obedient";
  definitions and expectations are the designer's job; verification systems over trust;
  intentional steering between hand manipulation and vibe coding; sculpting rather than
  painting; QA manual and non-negotiable; know every screen and state.
- [x] **48 Failure and Resilience** — AvatarMEDIC too early and underfunded, own capital
  exhausted, pivoted to a revenue-earning consultancy; failures as the lead of golden wisdom.
  **Includes lifeguarding and having saved lives** — first on scene for a c-spine injury, large
  surf rescues, and the preventative work. John confirmed he is comfortable with search saying
  this (2026-08-27). The site mentions Junior Lifeguards instruction; the rescues are new.
- [x] **49 What John Is Looking For** — seeking full-time and open to projects, biased toward
  full time; early-stage startups, orthogonal work for established companies, continued
  coaching; Lead or Senior Designer, founding designer for the right team; a founder's
  experience with an IC's ruthlessness and a Director's vision. **The revenue-stability line
  from the first draft was CUT at John's direction** — "in this era we still need to do
  posturing".

### Nanome title, resolved for the third time
- [x] The job was labelled XR interaction designer; John was doing PM and lead design and owns
  the title **Lead XR Product Designer** (2026-08-27). Applied to chunks 5/23/26, about.html,
  design.html and nanome2.html (which had said "Lead Product Designer"). `Archive/` is a frozen
  snapshot and keeps the old wording by rule.
- [ ] nanome2.html labels the project **2023–2024** while employment is **2022–2024**. Both can
  be true — the redesign inside a longer tenure. Left as-is; flag if that reads wrong.
