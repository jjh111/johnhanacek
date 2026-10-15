# syntax-charted: TRACE_DATA schema

Page: `viz/syntax-charted.html`. Slot file: `data/syntax-charted.js`, which
sets `window.TRACE_DATA = { ... }` with the keys below. Structure only; every
example value here is invented.

Required: `programData`, `RUNS`, `RUN_DATA`, `runDims`, `RADAR_DIMS`.
Optional: `SCOUT_DELTAS`, `TIP_DATA`, `PAGE`.

Run keys tie the keys together: every `RUNS[].key` should have an entry in
`RUN_DATA` and `runDims` (and, if used, `SCOUT_DELTAS` and `TIP_DATA`). Keys
become element ids (`card-<key>`, `diag-<key>`, ...), so keep them slug-safe.

## programData: array, one entry per program

Drives the small-multiples trend grid and the inline sparklines in the lede.

| field | type | meaning |
|---|---|---|
| `name` | string | program display name |
| `short` | string | short key for the program (not read by the page today) |
| `data` | number[] (0..100) | score per period, oldest first; length sets the `wN` axis label |
| `score` | number | current score shown under the panel |

## RUNS: array, one entry per run card (display order)

| field | type | meaning |
|---|---|---|
| `key` | string | run key used by every other keyed object |
| `name` | string | card title (usually the program's display name) |
| `short` | string, optional | short row label in the heatmap and glossary exemplar; defaults to `key` |
| `score` | number | overall score shown on the card and beside the terminal node |
| `runId` | string | run identifier, first item of the id line |
| `verdict` | string | verdict word, second item of the id line |
| `facts` | string[] | further id-line items (e.g. `"3 scouts"`, `"4 evals"`) |
| `topologyLabel` | string | connection pattern name shown on the card and in the lede |
| `pattern` | `"parallel"` \| `"self-refine"` \| `"bidirectional"` \| `"branch-gate"`, optional | links the run to a glossary topology as its exemplar |
| `note` | string (HTML allowed, `<em>` used) | paragraph beside the radar |
| `detailTitle` | string, optional | detail panel heading after the name (default `per-scout findings`) |
| `detailTag` | string, optional | text in the detail panel's form tag parentheses (default `delta to score`) |

## RUN_DATA: object keyed by run key

A d3-sankey graph per run.

| field | type | meaning |
|---|---|---|
| `nodes` | node[] | graph nodes (see below) |
| `links` | link[] | graph links (see below) |
| `nodePadding` | number, optional | sankey node padding (default 14); lower it for dense graphs |
| `exchange` | `{ hub, a, b, label? }`, optional | node ids for the bidirectional-exchange annotation: two nodes `a` and `b` trading through `hub`; `label` overrides the caption |

### node

| field | type | meaning |
|---|---|---|
| `id` | string | unique within the run; the terminal node must be `"terminal"` to get the score numeral, eval nodes use the `RADAR_DIMS[].key` ids to get the tip mini-bars |
| `type` | `"orch"` \| `"scout"` \| `"source"` \| `"gate"` \| `"eval"` \| `"synth"` \| `"dot"` \| `"verdict"` \| `"terminal"` | shape drawn by `drawShape()` |
| `label` | string | text beside the node |
| `score` | number, optional | eval nodes: the score drawn beside the label |
| `weak` / `strong` | boolean, optional | colour and note emphasis |
| `amber` | boolean, optional | gate / synth drawn amber |
| `loop` | boolean, optional | draws the self-refine loop annotation above this node |
| `kind` | `"partial"` \| `"fail"`, optional | `dot` nodes: colour |

### link

| field | type | meaning |
|---|---|---|
| `source`, `target` | string | node ids |
| `value` | `"thin"` \| `"normal"` \| `"strong"` \| `"critical"` or number | ribbon weight; a name resolves through the page's `W` constants |
| `kind` | `"dispatch"` \| `"process"` \| `"pass"` \| `"partial"` \| `"weak"` \| `"fail"` | colour role (see the glossary) |

## runDims: object keyed by run key

`{ [runKey]: { [dimKey]: number 0..100 } }`, one score per `RADAR_DIMS[].key`.
Feeds the radar, the heatmap, and the eval tip mini-bars.

## RADAR_DIMS: array of eval dimensions

Order sets radar axes (clockwise from the top), heatmap columns and tip rows.

| field | type | meaning |
|---|---|---|
| `key` | string | dimension key used in `runDims` and as eval node id |
| `label` | string | short axis label |
| `desc` | string | one-word description shown under the heatmap column and in tips |

## SCOUT_DELTAS: optional object keyed by run key

`{ [runKey]: card[] }`, the per-scout cards in the expanded detail panel.

| field | type | meaning |
|---|---|---|
| `id` | string | scout id |
| `name` | string | small caps label |
| `headline` | string | one-line finding headline |
| `num` | string | one-line figures under the headline |
| `delta` | number | contribution to the score; sign sets bar direction and colour |
| `weak` / `strong` | boolean, optional | card emphasis |

## TIP_DATA: optional object keyed by run key

`{ [runKey]: { [nodeId]: string } }`. Each string is split on `" · "`: the
first part is the tip title, each later part a row; a row containing
`" — "` or `" - "` splits into label and value. Example: `"scout-one · step 1 · read 3 sources"`.

## PAGE: optional object

| field | type | meaning |
|---|---|---|
| `kicker` | string | replaces the default kicker line |
| `trendRange` | string | period label beside the trend grid heading |
| `runsLabel` | string | label beside the runs heading (e.g. a date) |
