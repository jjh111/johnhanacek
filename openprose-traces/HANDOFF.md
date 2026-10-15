# OpenProse traces: the kit

The material for `openprose-traces.html`: eleven live views of agent runs,
their data, posters, and the raw record of the run they center on. **Every
trace is synthetic**: one invented world, built by a seeded script. Open
[`index.html`](index.html) to browse it.

## What's in the folder

| Path | What it is |
|---|---|
| `index.html` | the kit at a glance: posters, live links, the hero run's files (noindex) |
| `viz/<view>.html` | the views. Each is a whole app; embed one per panel |
| `lib/data-slot.js` | how a view gets its data: it reads `window.TRACE_DATA` from `data/<view>.js` |
| `data/<view>.js` | the generated data for each view. Don't hand-edit; see "Changing the data" |
| `data/<view>.schema.md` | the shape of each view's data |
| `data/synthetic/world.mjs` | the invented world: organizations, programs, the hero run's story |
| `data/synthetic/generate.mjs` | turns the world into every data file, deterministically |
| `data/synthetic/runs/<id>/` | the hero run's record, laid out the way OpenProse v0.14 writes a run directory |
| `posters/<view>.webp` | posters, 1600 × 1000, rendered from these views as each first loads, so a poster swaps cleanly to the live view |
| `posters/<view>-<moment>.webp` | highlights: the same view with a moment selected (the failed photo scout, the tilted stack, the memo run) |

## The world (keep the page copy consistent with it)

**Saltlight Aquarium**, a public aquarium with eleven exhibits, runs five
responsibilities:

| Program | Cadence | Shape |
|---|---|---|
| `chemistry-watch` | nightly, 02:00 PT | three readers in parallel, one log |
| `feeding-tracker` | daily, 16:00 PT | two readers reconciled |
| `livestock-memo` | Fridays, 07:30 PT | a profiler, four scouts in parallel, one memo |
| `supplier-scan` | Mondays, and on request | three scouts, each behind its own gate |
| `inspector` | after each memo and scan | OpenProse's standard inspector, `std/evals/inspector` |

**The fleet** around it: Paperwhale Design (a design studio), Graywind
Observatory, Windfall Row Cidery, Ninefold Press, and OpenProse itself
(the platform's own eval sweep). The fleet atrium generates their runs in the
page; the radar and heatmap name the same runs.

**When**: the week of June 22 to 28, 2026 (week 26) for the ledger, the
atriums and the fleet; all of June 2026 for the periscope.

**The hero run**, `livestock-memo` on Friday June 26, took 11m 36s:

1. Four scouts read the week in parallel.
2. The photo scout fails on a late camera export (`export-incomplete`). It
   re-runs, hands the late photos to an `image-reader` delegate, and recovers.
3. The memo ships with three flags:
   - the mangrove lagoon's nitrate, improving;
   - a garibaldi hiding at feeds in the kelp forest;
   - ragged bell margins on two moon jellies.
4. One photo is still missing, so the inspector passes 7 of 8 checks.

Elsewhere in the week, a shortlist of captive-bred mandarin dragonets is
waiting for the curator's approval.

## Which view for which section

| Section | View | Posters (`posters/<name>.webp`) |
|---|---|---|
| The reframe: one paragraph that answers the question | `viz/run-story.html` | `run-story` |
| Strata | `viz/run-strata.html` | `run-strata` (flat, as it loads), `run-strata-tilted` (3D) |
| Hearing a run | `viz/strata-audio.html` | `strata-audio` |
| Scaling up: one run, four ways | `viz/run-codex.html` | `run-codex`, `run-codex-photo-scout` |
| Scaling up: the run as a tree | `viz/trace-trees-graph.html` | `trace-trees-graph`, `trace-trees-graph-photo-scout` |
| Scaling up: one organization | `viz/run-atrium.html`, `viz/periscope.html` | `run-atrium`, `periscope` |
| Scaling up: the fleet | `viz/fleet-atrium.html`, `viz/confidence-radar.html`, `viz/fleet-heatmap.html` | `fleet-atrium`, `confidence-radar`, `fleet-heatmap` |
| A run as a document | `viz/syntax-charted.html` | `syntax-charted`, `syntax-charted-memo` |

## Embedding

- **Paths.** Embed a view directly, for example
  `<iframe src="openprose-traces/viz/run-strata.html">`. Every path inside the
  kit is relative, so the folder works wherever it sits.
- **Heavy views.** Five are three.js scenes: `run-strata`, `run-codex`,
  `run-atrium`, `fleet-atrium` and `strata-audio`. Show the poster first, go
  live on tap, and keep one live view at a time on touch.
- **Links already in the data.** The ledger's latest delivery links to
  `run-strata.html`. The atriums link their hero run to `run-codex.html`. The
  strata memo node opens the raw `memo.md`.
- **External loads.** The views load the same CDNs as `openprose.html`:
  three.js, d3, d3-sankey, the Kecal font and Google Fonts.

## Changing the data

The data is generated in the design-iteration repo
(`JHWorking/traces-public/`) and delivered here file by file:

1. Edit `world.mjs` there.
2. Run `generate.mjs`.
3. Re-render the posters.
4. Re-deliver.

A data file edited here is never overwritten. The next delivery skips it and
reports it, so it doesn't vanish quietly.

## Before committing anything in `openprose-traces*`

From this repo, on this machine:

```bash
node scripts/check-traces-cut.mjs
node ../design-iteration/JHWorking/scripts/trace-firewall.mjs openprose-traces.html --allow /dev/null
```

- **The site's gate** checks the folder. It runs the firewall, checks every
  view has its data, and renders each view. It must say `PASS`.
- **The second line** scans the page itself once it exists. It must end in
  `✓ clean`.

Both checks look for anything private that slipped in. They run inside the
design-iteration repo and copy nothing out. The page copy is where this
matters most: write about the invented world above, never about real runs.

## Open items

- **Eval dimension labels.** The radar, heatmap and atrium have their four
  dimension names (the RF, TE, CS and DS axes) fixed in code. Confirm with
  John before release.
- **The views' own UI text** keeps its original em dashes: the explorations
  stay as captured, as in the brand case study. The page copy around them
  should still have none.
- **A template bug the data works around.** `run-strata`'s flat deliverable
  slide styles memo text only under `.nv-detail`, so the dataset wraps its
  memo body in that class.
- **The film** is not made yet. The renderer that made these posters also
  makes video.
