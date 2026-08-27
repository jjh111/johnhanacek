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
- [ ] Go-to dishes: albondigas soup, rice tahdig, leek-anchovy-lemon pasta, whole fish on the grill
- [ ] "Has a brownie recipe memorized from scratch"
- [ ] Keep the chunk at all? (It humanizes; it also answers questions the site itself can't corroborate.)

### Chunk 31 — Personal: Gardening & Outdoors
"Native plants" appears on-site only in other senses; hiking/camping are chunk-only.
- [ ] Gardens with a focus on native California plants in San Diego
- [ ] "Hikes and camps regularly"

### Chunk 32 — Location & Lifestyle
- [ ] "UCSD alum who stayed" + the lifestyle summary (hiking, camping, photography across SoCal)

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

## C. Consistency flags

- [ ] **Nanome title**: chunk 5 says "**Primary** XR designer", chunk 26 says
  "**Lead** designer at Nanome". Pick one (page uses which?).
- [ ] **MetaMedium status**: chunk 3 calls it a "shipped interactive web
  **prototype**"; chunk 27 counts it among "four shipped AI **products**".
  Prototype or product — one word, both places.
- [ ] **Nanome as "founding design engagement"** (chunk 4) vs employment
  2022–24 (chunks 5/23). If Nanome was a job, "founding design" belongs to
  OpenProse alone in chunk 4.
- [ ] **Chunk 34 "no build tools, no npm"**: true of the shipped site, but the
  repo does use npm dev-side (vector builder, QA suites). Suggest: "no
  frameworks, no build step" (drop "no npm") — precise and still the point.
- [ ] **OpenProse "(2026)"** in the timeline reads oddly once 2026 is over —
  fine now, flagging for the annual pass.

---

## D. Tone flags — John's call, not errors

- [ ] Chunk 24 micro: "**Predicted answer-engines before ChatGPT.**" — the
  boldest line in the index; keep only if the piece fully supports it.
- [ ] Chunk 27 micro: "Four shipped AI products, **all real**." — "all real"
  protests too much; suggest just "Four shipped AI products."
- [ ] Chunk 28 micro: "Intelligence augmentation, **before it was cool**." —
  cheeky-on-purpose; keep or straighten.
- [ ] Chunk 35 micro: "Draw a loop, get a fish. **Really.**" — same register;
  probably on-brand for the fish tank.
- [ ] Chunk 1: "Has been prototyping in code for **over a decade**" + chunks
  10/25 "**10+ years**" — consistent with about.html; confirm the count still
  holds and pick one phrasing.

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
