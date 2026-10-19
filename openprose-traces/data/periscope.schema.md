# periscope: TRACE_DATA schema

Page: `viz/periscope.html`. Slot file: `data/periscope.js`, which sets
`window.TRACE_DATA = { ... }` with the keys below. Structure only; every
example value here is invented.

Required: `PROGRAMS`, `DIM_LABELS`, `TOPOLOGY_SPECS`. Optional: `WINDOW`.

## PROGRAMS: array of program objects

One row of the run-space band per entry, in display order.

| field | type | meaning |
|---|---|---|
| `id` | string | unique program key; used in element ids, so keep it slug-safe |
| `name` | string | display name of the program |
| `register` | string | short descriptor of the program's shape, shown under the name |
| `cadence` | string | how often it runs (e.g. `"weekly"`) |
| `note` | string (HTML allowed, `<em>` used) | one-line gloss shown in the run-strip footer |
| `topology` | string | key into `TOPOLOGY_SPECS` |
| `deliverable` | string, optional | short name of the run's final output, shown on the terminal node |
| `deliverableLong` | string, optional | longer name for the same output, shown in the L4 detail |
| `runs` | array of run objects | the program's runs inside the window (see below) |

The page adds a derived `history` array to each program at load; do not
supply it.

### run object

| field | type | meaning |
|---|---|---|
| `day` | integer, 1..`WINDOW.days` | day of the window the run happened |
| `runId` | string | run identifier shown in meta lines |
| `dur` | string | human-readable duration (e.g. `"2.0 min"`) |
| `steps` | integer | number of steps in the run |
| `evals` | object `{ [dimKey]: number 0..100 }` | one score per `DIM_LABELS[].k` |
| `overall` | number 0..100 | overall score; anchors the sparkline at `day` |
| `verdict` | `"pass"` \| `"partial"` \| `"fail"` | run verdict |
| `weak` | string, optional | the dimension key that was the run's weakest |
| `marquee` | boolean, optional | flag for a featured run (not read by the page) |

## DIM_LABELS: array of eval dimensions

Order sets the row order in the run strip and the eval-gate stack in the tree.

| field | type | meaning |
|---|---|---|
| `k` | string | key used in `runs[].evals` |
| `short` | string | 2 to 3 letter abbreviation |
| `long` | string | full dimension name |

## TOPOLOGY_SPECS: object keyed by topology name

Each value describes the agent tree drawn in L3 for programs whose
`topology` names it.

| field | type | meaning |
|---|---|---|
| `layout` | `"fan"` \| `"gate"` | `fan`: orchestrator, scouts, writer, eval gates, terminal. `gate`: orchestrator, one scout plus its own gate per branch, writer, eval gates |
| `branches` | array of branch objects | the scouts (fan) or gated branches (gate), top to bottom |

### branch object

| field | type | meaning |
|---|---|---|
| `id` | string | unique within the spec; used in node ids |
| `label` | string | node label |
| `note` | string | one-line description of what the branch reads |
| `weakOnDim` | string, optional | dimension key; the branch is drawn weak when the run's `weak` equals it |
| `weak` | boolean, optional | draw the branch weak on every run |

## WINDOW: optional object

| field | type | meaning |
|---|---|---|
| `days` | integer | length of the window in days (default 30) |
| `month` | string | short month label for day ticks (`"Mon 07"`); without it ticks read `"Day 07"` |
| `period` | string | label for the whole window in the masthead and lede (e.g. `"the sample month"`) |

## Tiny invented example

```js
window.TRACE_DATA = {
  DIM_LABELS: [{ k: 'a', short: 'AA', long: 'Alpha quality' }],
  TOPOLOGY_SPECS: { demo: { layout: 'fan', branches: [{ id: 'one', label: 'scout-one', note: 'reads one source' }] } },
  PROGRAMS: [{ id: 'sample-program', name: 'sample-program', register: 'fan-out', cadence: 'weekly',
    note: 'Example note.', topology: 'demo', deliverable: 'digest',
    runs: [{ day: 3, runId: 'run-0001', dur: '1.0 min', steps: 5, evals: { a: 82 }, overall: 82, verdict: 'pass' }] }],
};
```
