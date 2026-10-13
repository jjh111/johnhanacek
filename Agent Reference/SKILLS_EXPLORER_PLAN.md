# Skills Explorer — Plan

> Status: **DRAFT, awaiting John's picks** · Author: 2026-10-13 · Prototype:
> https://claude.ai/artifact/FJ1UNeZyvtHdUSLYtKBxUD (private until shared)

## Goal

An interactive, searchable explorer of John's skills, abilities and technologies
that shows how they connect, where they overlap, and the work that proves each
one, with the case-study media attached. It replaces the three static cards in
`about.html#expertise` and becomes a thing the ⌘K bar can answer with.

It is a V3 "Data-Driven Site" piece: one source of truth (`resume.json`),
compiled outputs, agent-legible structure, and the standing doctrines
(instant-then-smarter, one surface, chunks are audited claims, suites green in
the same change).

## What the prototype tested

Six views over one graph, all driven by one search box, one hover and one pin,
with a shared dossier panel:

| View | What it answers | Verdict from the prototype |
|------|-----------------|----------------------------|
| **A Constellation** | What clusters exist, what bridges them. Work settles between the skills it used, so an overlap is a position. | Strong desktop first impression. Crowded under ~600px. Pointer-only. |
| **B Reel** | Show me the proof, as pictures. | The most persuasive view per pixel. Needs media on more works. |
| **C Matrix** | "Has he used X with Y?" Pinning a row turns the count column into shared-work counts. | Exact and accessible. Wide on phones. A natural build-time table. |
| **D Strata** | Depth and recency on a 2008→now axis. | Clear story (XR layer 2019–24, AI layer from 2024). Better as a dossier sparkline than a module. |
| **E Lens** | What sits where A, B and C meet. Default (Design ∩ AI ∩ XR) returns Nanome 2 alone. | Answers the rare-combination question directly. Best beside services. |
| **F Proof ladder** | Daily / shipped / used / tried / never, with evidence counts. | Honest and phone-friendly. Surfaces data gaps. |

Every work node wears the nav shape of the page it lives on (jh-shapes.js), so
the graph doubles as a map of the site.

The graph in the prototype: 21 practices, 34 tools (tiers verbatim from
`resume.json → skills.tools`), 4 domains (`skills.domains`), 24 pieces of work
(work, projects, awards, clients, talks, publications, art), ~150 links. Links
were checked against résumé highlights, search chunks 4–16, 27, 34, 37, 40, 41,
58, and nanome2.html / services.html copy. **It is a draft mapping**: P1 turns
each link into an evidenced claim.

### Gaps it surfaced

Tools rated **daily** that no work in the graph cites: **Obsidian, React,
TypeScript, Hermes Agent.** Either link evidence or lower the tier. The claims
audit should catch this class automatically (P1).

## Recommended cut

1. **Dossier + Reel are the core.** Every search, hover or click ends in one
   panel of proof: where a skill was used, alongside what, with media.
2. **Constellation** is the desktop hero on `about.html#expertise`. Below a
   **measured** width (the initNavFit doctrine: measure fit, no viewport
   breakpoint) the **Proof ladder** takes its place.
3. **Matrix** ships as a build-time HTML table between resume markers. It is the
   no-JS, screen-reader and Safari-Reader path, and the DOM the other views
   hydrate.
4. **Strata** folds into the dossier as a year sparkline.
5. **Lens** waits for services.html, beside the inquiry composer's offer
   matching ("what sits where your need meets his work").

## Architecture

### Data: one graph in `resume.json` (P1)

Keep the existing string fields so the one-page résumé build does not break.
Add ids and links beside them:

```jsonc
"skills": {
  "practice": [ ...unchanged strings... ],
  "graph": {
    "$comment": "Ids for the explorer. label must match a practice string or a tools[].name.",
    "clusters": { "design": "Design & research", "ai": "AI & agentic", "code": "Code", "xr": "XR & robotics" },
    "nodes": [
      { "id": "ix3d",  "label": "3D interaction design", "cluster": "xr", "aliases": ["spatial", "hand tracking", "vr", "ar"] },
      { "id": "unity", "label": "Unity / C#", "cluster": "xr", "aliases": ["c#", "game engine"] }
    ]
  }
},
"work": [{
  "id": "nanome", ...,
  "uses": [
    { "id": "unity",    "evidence": ["chunk:5", "chunk:37"] },
    { "id": "shapesxr", "evidence": ["chunk:5", "site:nanome2.html"] }
  ]
}]
```

- `uses` lands on `work`, `projects`, `awards`, `clients`, `talks`,
  `publications`. Evidence uses the existing `chunk:` / `site:` / `interview:`
  vocabulary. Tier stays where it is (`skills.tools[].tier`).
- Each work's page and anchor come from its chunk `url`, so the node shape and
  the deep link are derived, never declared twice.
- Art and photography live in `Assets/gallery.json`; whether they join the graph
  is decision 4.

### Compiler (P1)

`build-resume.mjs --apply` also writes **`Assets/skills-graph.json`**:
nodes, edges (with evidence), per-node derived facts (works, year span, top
partners), and a **precomputed layout** (normalised 0–1 coordinates from a
seeded d3-force run at build time; `d3-force` as a devDependency only). The page
then ships no physics library, paints complete on first frame, and never
jitters.

It also writes the **Matrix table** into `about.html` between
`<!-- resume:skills-matrix -->` markers.

Lint, in the compiler and in `claims-audit.mjs`:
- an edge whose id resolves to nothing → refuse `--apply`;
- a non-`never` tool with zero `uses` → warn (today: Obsidian, React,
  TypeScript, Hermes Agent, OpenClaw, Python);
- a `never` tool with a `uses` entry → refuse.

### Runtime module (P2)

`scripts/skills-explorer.js` — vanilla ESM + SVG, dynamically imported when
`#expertise` nears the viewport (the pretext-wrap pattern: pages that don't use
it pay nothing). It reads `skills-graph.json`, hydrates the build-time matrix,
and draws the constellation, reel, ladder and dossier. Shared state is one
object (`q`, `hits`, `sel`, `hover`), as in the prototype.

- Colors: cluster hues as new tokens in `jh-chrome.css` with per-theme values;
  labels use `--ink-quiet` / `--ink-faint`, never alpha (palette rule 2).
- Type: steps from the ten-step ladder only.
- Media: reel cards and the dossier use each chunk's `image` / `video` /
  `pieces` (posters from `Assets/posters/`), lazy, under the site autoplay gate.
- Keyboard: constellation nodes are pointer sugar; the matrix rows and ladder
  chips are the keyboard path and drive the same pin.

### Search integration (P3)

- Graph nodes become a searchable kind in `search-core.js` (label + aliases
  field-boosted in BM25; vectors from `build-chunk-vectors.mjs`), so "unity",
  "what has he done in XR" or "llm" answer with a **skill dossier postcard
  module** (dossier + three reel posters) instead of the generic chunk.
- Commands via `JH_COMMANDS` on about.html: `show skill <x>` pins it in the
  explorer; `compare <x> and <y>` opens the Lens (when it ships).
- The explorer's own filter reuses search-core's tokenizer and alias table, so
  "vr" means the same thing in both places.
- Intent cards for hire/services queries can append "see the skills behind
  this" → explorer pinned to the matching track's practices.

### Rich media (P4)

Fill media for works that have none yet (AsMA award, SAR 5G, CHARIoT, Collaborate,
talks, onagents, Transfyr) from existing assets or new posters. Reel cards for
video works preview on hover (desktop, fine pointer, motion allowed) and stay
posters elsewhere.

## Phases

| Phase | Scope | Done when |
|-------|-------|-----------|
| **P0** | Prototype (this doc + artifact) | John picks views, home, and answers the decisions below |
| **P1** | Graph in `resume.json`, compiler output, matrix markers, audit lint | `--apply` writes `skills-graph.json` + matrix; `claims-audit --strict` clean or gaps listed with reasons; `skillgraphtest.mjs` green |
| **P2** | `skills-explorer.js` on about.html#expertise (dossier, reel, constellation/ladder swap, hydrated matrix) | No horizontal scroll at 360/390/768/1440; contrasttest 0 failures both themes and both entry paths; navfittest unaffected |
| **P3** | Search: node kind, dossier postcard, commands, shared tokenizer | `search-tests` additions: "vr" → XR practices + headsets, "llm" → 5 AI practices, "2019" → the 2019 works, "never" → 3 tools; existing suites unchanged |
| **P4** | Media for every work; hover preview | Every reel card has a poster or a deliberate typographic card |
| **P5** *(optional)* | Lens on services.html tied to inquiry offers | Inquiry brief's matched offer pins the Lens |

Tests: new `Agent Reference/maze-tests/skillgraphtest.mjs` — every edge
resolves; every work url resolves to a live anchor; every non-never tool has a
use or an allowlisted reason; search behaviours above; layout fits at four
widths. Run `contrasttest.mjs` after any color change.

## Decisions for John

1. **Which views make the cut.** Recommendation above (dossier + reel core;
   constellation desktop / ladder phone; matrix at build time; strata as
   sparkline; lens later).
2. **Home:** about.html#expertise, or a new public `skills.html` in the sitemap
   with about.html carrying a compact version.
3. **Is the Never tier public?** It reads as honest; it also names tools a
   recruiter might filter on.
4. **Art and personal skills** (photography, illustration, installations,
   acting, writing): same graph, a separate lens, or out.
5. **Daily-but-unlinked tools** (Obsidian, React, TypeScript, Hermes Agent):
   link evidence or lower the tier.
6. **Practice granularity:** the prototype added Data visualization, Founding &
   pitching, Photography, Animatics & illustration, Research writing and Creative
   coding to the `skills.practice` list. Keep, rename or drop each.

## Risks

- **Edges are claims.** A link from a skill to a work says John did that there.
  They get the same evidence and audit as résumé bullets, or they don't ship.
- **Constellation clutter** at mid widths; the measured swap to the ladder is
  the mitigation, not a smaller graph.
- **Maintenance:** links authored once in `resume.json` and compiled
  everywhere, so a new role or client updates the explorer, the résumé and the
  search answer together.
