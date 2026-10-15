# OpenProse traces case study: site-side plan (2026-10-05)

A second OpenProse case study, about the trace-visualization work: ten views of
agent runs, shown live on **invented** traces, on a page in the μ Bloom
language (blank paper and the bloom shader, not the photo-and-ripples hero of
`openprose.html`). Dan approved an anonymized case study (JH, 2026-10-05).

This file is the jhsite side. The design-iteration side already has a fuller
plan, which this one builds on and must not contradict:
`design-iteration/JHWorking/_traces-case-plan.md` (staged 2026-09-26, its §8
decisions still open).

## What exists (read 2026-10-05)

**The ten views, code only:** `jh-deng-template/traces/` (untracked there, so
another agent is mid-flight).
- `viz/<page>.html` reads `window.TRACE_DATA` from `data/<page>.js` through
  `lib/data-slot.js`. An empty slot draws a notice naming the missing keys and
  halts the page.
- Each `data/<page>.schema.md` documents its keys, with structure only. **The
  schemas are complete enough to generate data from. No extra reference is
  needed for structure.**

| Page | Unit | Required keys | Weight |
|---|---|---|---|
| run-strata | one run, 5 strata | `strata`, `EVAL_CHECKS`, `verticalEdges`, `RUN_META` (+ memo HTML) | 162K, three.js |
| run-codex | one run, 4 synced views | `TRACE`, `PRETEXT_HTML` | 76K, three.js |
| trace-trees-graph | one run, file tree + d3 force | `TRACE` | 53K, d3 |
| run-story | one org's week (ledger) | `ORG`, `LEDE`, `LEDGER` | 27K |
| syntax-charted | runs as sankey documents | `programData`, `RUNS`, `RUN_DATA`, `runDims`, `RADAR_DIMS` | 73K, d3-sankey |
| periscope | programs × 30 days, sentence → node | `PROGRAMS`, `DIM_LABELS`, `TOPOLOGY_SPECS` | 86K |
| confidence-radar | per-program eval radar | `FLEET_DATA` | 28K |
| fleet-heatmap | programs × 4 eval dims | `FLEET` | 29K |
| run-atrium | one org, 3D atrium | `PROGRAMS`, `RUNS`, `RUN_STATES`, `BINDINGS_INDEX` | 305K, three.js |
| fleet-atrium | many orgs, 3D, has its own seeded generator | `PRIMARY_CUSTOMER`, `PROGRAMS`, `PROGRAM_ORDER`, `RUNS`, `RUN_STATES`, `BINDINGS_INDEX` | 384K, three.js |

**The shared vocabulary across all ten:**
- an organization runs programs on a cadence;
- a run fans out from inputs through parallel scouts to a `*-compiler`
  synthesis, then eval checks;
- four eval dimensions: rf runtime fidelity, te task effectiveness, cs contract
  satisfaction, ds domain score;
- verdicts pass / partial / fail;
- artifacts with byte sizes.

That is the OpenProse v0.14 run shape (a service graph). "RLM" traces in the
older sense are process trees with an iteration budget, and they feed only the
flame pages, which are not in this set of ten.

**The guards, already built** (design-iteration):
- `scripts/trace-firewall.mjs` fingerprints the private client corpus in memory
  and FAILs any overlap (slugs, run ids, 8-word passages, proper nouns).
- `build-traces-cut.mjs` is the gated cut.
- `render-frames.mjs` does deterministic video capture.

## Landing contract (2026-10-15)

For the agent delivering the views and the synthetic data. The page is built
against exactly this, so a cut in another shape waits until it is reshaped.

- **Where:** `openprose-traces/` at the repo root, the same shape as
  `jh-deng-template/traces`: `viz/<page>.html`, `lib/data-slot.js`,
  `data/<page>.js` (one per view, `window.TRACE_DATA = {…}`), and optionally
  `posters/<page>.webp` (1600 px wide, from `render-frames.mjs`) for the
  poster-first embeds. Schema docs may come along; they are dev notes.
- **The gate:** `node scripts/check-traces-cut.mjs` must PASS before the cut is
  committed. It runs design-iteration's `trace-firewall.mjs` on the folder,
  checks every view has its data file, and loads each view headless at
  1440×900 and 390×844: no `#trace-slot-notice`, no page errors, something
  drawn. `--only a,b` gates a subset while the rest is in progress. Proven
  2026-10-15 both ways: the empty template FAILs with the missing keys named;
  a three-row synthetic heatmap PASSes.
- **Names the firewall rejects even when invented:** its proper-noun list
  holds common words that also occur in the private corpus. Seen so far:
  *Studio*, *Brooklyn*, *Cursor*, *Corner*, *Lake*, *Tan*, *Captions*, *Vertex*.
  A fixture organization called "Kelp Street Studio" failed on *Studio*; the
  design-studio world in design-iteration §8.2 will hit this. Pick names that
  avoid these, or add a reviewed line to `openprose-traces/.firewall-allow.txt`
  (`token:<token>:<path-part>  # why`), never a blanket allow.
- **Say synthetic:** every data file's header comment says the data is
  invented, and the generator's seed is recorded there. The gate WARNs when a
  rendered view never says "synthetic"; the case-study page labels every view
  either way.
- **Weight:** the gate WARNs past 1 MB per data file. Views load only on tap.
- **Commit rule:** nothing from `customers/`, no client screenshots, no
  client run ids. The firewall is the proof; a FAIL means the cut does not
  ship, whatever the reason.

**State on 2026-10-15:** the ten views are still untracked in
`jh-deng-template/traces` with empty slots. design-iteration §8 decisions are
still open (slug, world, own runs, client-context sentence, founder quotes,
film). The site's one hard firewall hit (a client program slug in
`direction-styleguide.html`'s card specimen) was fixed in v2.48; the other 37
hits on the published OpenProse payload are the common words above.

## The data: one invented world, ten views of it

Write **one seeded generator** that builds a single coherent invented world.
Emit all ten `data/<page>.js` files from it, so the same organization,
programs, run ids and scores reappear across every view, the way a real fleet
would. This matches the design-iteration architecture (scenario → canonical
runs → per-page emitters). It needs no reference data: the schemas plus the
public run shape suffice.

- **World.** Per design-iteration §8.2 (its recommendation): a reef-aquarium
  operation for the fleet, which fits the site's fish motif, and a design studio
  for the single-run views.
  - Programs such as a nightly water-chemistry monitor, a weekly livestock
    health memo, a feeding-schedule tracker, a supplier scanner, a meta-eval.
  - Every domain any client works in is off-limits: fleet ops, energy, deal
    flow, sales, clinical, product intelligence.
- **Shape calibration** comes from public ranges only:
  - 3 to 7 services, one parallel layer of 2 to 4, depth ≤ 2, runs of minutes;
  - rare hard failures, with most "failure" living in evals;
  - one run that fails and recovers, because *failure is the story*.
- **Ids.** Fresh `YYYYMMDD-HHMMSS-hex6` run ids. No hyphenated name that occurs
  in client material; the firewall checks this.
- **Honesty.** Tokens, latency and model never existed in any real trace; the
  original pages invented them. Every view on the page says **synthetic**.
- **Gate.** Run `trace-firewall.mjs` on the generated data, and on the cut,
  before anything leaves the machine.

## The page

- **Slug:** `openprose-traces.html` plus `openprose-traces/` (the viz, lib,
  data and assets). It is a Design subpage like `openprose` and `nanome2`, and
  wears the chrome (`jh-chrome.css` only, the OpenProse language, like
  `openprose.html`).
- **Hero:** μ Bloom. Blank warm paper with the bloom shader
  (`openprose/canvas-display/brand/direction-mu-bloom*.html`; `openprose.html`'s
  `.cta-bloom` already carries a port). No photograph.
- **Embeds:** each view is an `embed-live` panel. Prefer **direct iframes of
  single views** over review-canvas grids, since each view is a whole app.
  - Poster first, live on tap.
  - **One live view at a time on touch.** The mobile-crash rule from 23ced07:
    three of these pages are three.js scenes of 160–380 KB.
  - Posters come from `render-frames.mjs`.
- **Outline:** design-iteration §5 ("Making agent runs legible").
  1. The problem.
  2. Going wide.
  3. The reframe: the summary paragraph.
  4. Strata.
  5. Scaling up: codex, atrium, fleet.
  6. The conclusion.
- **Editing loop:** the same as the brand study, a Markdown mirror John edits
  and I fold in.
- **Site wiring:**
  - add to sitemap and llms.txt;
  - add search chunks plus a CHUNK_AUDIT section;
  - a Playground item, marked `weight: 'heavy'`;
  - change openprose.html's "trace track is still confidential" line to a link.

## Dependencies

1. **The other agent's port.** The ten views are untracked in jh-deng-template.
   Need: are they final? Which copy is canonical, jh-deng-template/traces or
   design-iteration traces-public?
2. **The design-iteration §8 decisions**, which are John's: slug, world, own
   runs, client-context sentence, founder quotes, film ambition.
3. **CDNs** the views load: three.js, d3, d3-sankey, Kecal and Google Fonts.
   The OpenProse page already does this.

## Flags found while reading

- **One genuine client detail is still published on johnhanacek.com:**
  `openprose/canvas-display/brand/direction-styleguide.html:2126`, a card
  specimen naming a real client run. The firewall FAILs it as a client slug.
- The firewall's other 37 FAILs over the payload look like false positives on
  common words: "Cursor blink", "Corner radius", "Tan paper", "printed in
  Brooklyn". Spot-checked.
- Its 9 name-pair WARNs are in the approach pages ff731af just anonymized, and
  need a look.
- Proposed fix (design-iteration §12A): fix at the design-iteration source,
  rebuild, copy changed files in one by one.
