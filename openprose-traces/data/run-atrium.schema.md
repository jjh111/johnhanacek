# run-atrium: TRACE_DATA schema

Page: `viz/run-atrium.html`. Slot file: `data/run-atrium.js`, which sets
`window.TRACE_DATA = { ... }` with the keys below. Structure only; every
example value here is invented.

Required: `PROGRAMS`, `RUNS`, `RUN_STATES`, `BINDINGS_INDEX`.

Optional: `PROGRAM_ORDER`, `ORG`, `EPOCH_WINDOW`, `TRACE_WINDOW`,
`ENSURES_GIST`, `INPUT_GLOSS`, `RUN_PROGRAM_FLOW`, `SERVICE_SYNOPSES`,
`EVAL_PREDICATES`, `PHASE_GLOSS`, `TREND_NOTES`, `DELIVERABLE_PROGRAMS`,
`VERDICT_PREDICATES`, `PROGRAM_NODES`, `ROLE_WEIGHT`, `DEFAULT_RUN_ID`.

Strings marked "HTML" are inserted as markup; the page styles `<em>`,
`<code>` and `<strong>` inside them.

## PROGRAMS: object, program id → program

One lane, hull and ledger row per program. The id is the key used by
`RUNS[].program`.

| field | type | meaning |
|---|---|---|
| `label` | string | display name of the program |
| `cadence` | string | how often it runs (e.g. `"weekly"`), shown in the lane tooltip |
| `baseline` | object | the program's baseline scores, see below |
| `cssColor` | string, optional | CSS colour for the program's swatches; defaults to the palette slot `var(--prog-N)` by position in `PROGRAM_ORDER` |
| `color` | number, optional | hex colour int; not read by this page |
| `about` | string, optional | one-line description; not read by this page |

### baseline

All numbers on a 0..100 scale. They drive the Quality aspects, the
operations health bars and the Baseline drift read-back.

| field | type | meaning |
|---|---|---|
| `overall` | number | composite baseline score |
| `rf` | number | runtime fidelity |
| `te` | number | task effectiveness |
| `cs` | number | contract satisfaction |
| `ds` | number | domain score |

## PROGRAM_ORDER: array of program ids (optional)

Lane order, legend order, and the order palette slots are handed out.
Defaults to the key order of `PROGRAMS`.

## RUNS: array of run objects

Every cube in the scene. Eval runs are runs too, linked to the run they
verify.

| field | type | meaning |
|---|---|---|
| `id` | string | unique run id; the key into `RUN_STATES` and `BINDINGS_INDEX`. The text after the last `-` is shown as the short id |
| `program` | string | program id, a key of `PROGRAMS` |
| `subject` | string (HTML) | what the run was about; the run's headline. A subject containing `eval` is set in italics |
| `context` | string (HTML), optional | one dim line of run inputs shown in the selected-run meta |
| `startedAt` | ISO 8601 string, UTC | start time; drives every When aspect and the day lanes |
| `endedAt` | ISO 8601 string, UTC | end time; used for the time window |
| `durationMin` | number | wall-clock minutes |
| `steps` | integer | number of logged steps |
| `mode` | `"on-demand"` \| `"scheduled"` \| `"eval"` | how the run was triggered |
| `gate` | `"delivered"` \| `"awaiting"` \| `"scheduled"` | review state of the run's output |
| `summary` | string (HTML), optional | one-paragraph read of the run, shown when selected |
| `evalRunId` | string, optional | id of the eval run that verified this run |
| `isEval` | boolean, optional | true for eval runs |
| `upstream` | string, optional | eval runs only: id of the run being verified |
| `evalPass` | integer, optional | eval runs only: checks passed |
| `evalTotal` | integer, optional | eval runs only: checks run |
| `evalFail` | array of strings, optional | eval runs only: names of failed checks |
| `baselineRun` | boolean, optional | true when this run is its program's reference baseline |
| `hasCodex` | boolean, optional | true when a per-run codex page exists; adds an "Open full codex" link to `run-codex.html` |

The page adds `evalChild` and `parentRun` to each run at load; do not
supply them.

## RUN_STATES: object, run id → array of steps

The run's step tree in logged order. One slab per step.

| field | type | meaning |
|---|---|---|
| `phase` | integer | serial step number; parallel siblings share one |
| `sub` | string | `""`, or `"a"`, `"b"`, ... for branches of a parallel block |
| `name` | string | the service, input or eval-check name |
| `kind` | `"input"` \| `"agent"` \| `"eval"` | what kind of step it is |
| `status` | `"ok"` \| `"fail"` | the logged outcome |
| `parallel` | boolean | true inside a parallel block |
| `siblings` | array of strings | names of every member of the parallel block (empty when serial) |

Naming conventions the page reads: an agent step whose name ends in
`-compiler` is the run's synthesis step; an agent step named exactly
after its program id is treated as a single-step composite.

A run with no entry here falls back to a synthetic tree built from
`PROGRAM_NODES`.

## BINDINGS_INDEX: object, run id → object, step name → array of artifacts

What each step wrote (or received). Use `{}` for a run with none.

| key | meaning |
|---|---|
| `caller` | the caller-supplied inputs; one file per input step, named `<input name>.md` |
| `evaluator` | eval runs: the single check-result file, shared by every eval step |
| any agent step name | the files that step wrote |

Each artifact:

| field | type | meaning |
|---|---|---|
| `name` | string | file name (e.g. `"report.md"`) |
| `bytes` | integer | file size; drives the artifact-bytes step aspect |

## ORG: object (optional)

| field | type | meaning |
|---|---|---|
| `name` | string | organization name shown under the product mark (default `Organization`) |
| `windowLabel` | string (HTML), optional | date-window label beside it; defaults to the first and last run day (e.g. `Jan 1 &rarr; 2`) |
| `slug` | string, optional | short key recorded in the trace bundle |

## EPOCH_WINDOW: object (optional)

`{ start, end }`, ISO 8601 strings. Pins the run-time window. Defaults to
the earliest start floored to the hour through the latest end rounded up
to the hour plus one hour.

## TRACE_WINDOW: object (optional)

`{ start, end }`, `YYYY-MM-DD` strings recorded in the trace bundle.
Defaults to the first and last run day.

## Gloss tables (all optional, all plain objects of strings)

| key | keyed by | value |
|---|---|---|
| `SERVICE_SYNOPSES` | agent step name | one-line description of what the step does (HTML), shown on the step card |
| `ENSURES_GIST` | agent step name | one-line gist of what the step's contract guarantees (HTML), shown under EMITS in the sidebar |
| `EVAL_PREDICATES` | eval step name | the check phrased as a question (HTML) |
| `INPUT_GLOSS` | input step name | what the caller supplies in that input (HTML) |
| `RUN_PROGRAM_FLOW` | program **label** (not id) | one-line shape of the program, shown in the cube tooltip |
| `TREND_NOTES` | program id | operations note under the program's health bar (HTML) |
| `PHASE_GLOSS` | `input`, `profile`, `scout`, `synthesis`, `eval` | overrides the built-in phase descriptions on the step card |

Example: `SERVICE_SYNOPSES: { "widget-counter": "Counts the widgets." }`.

## DELIVERABLE_PROGRAMS: array of program ids (optional)

Programs whose delivered runs the Ship log read-back names one by one.
Empty by default, which omits that sentence.

## VERDICT_PREDICATES: array of eval step names (optional)

Checks that read as a verdict rather than a single predicate: they get
the `verdict` role and a heavier slab. Defaults to any eval step whose
name contains `verdict`.

## PROGRAM_NODES: object, program id → array of nodes (optional)

Role template for the synthetic fallback tree. Each node is
`{ role, label }`: `role` is a string (built-in roles: `profile`, `scout`,
`compiler`, `check`, `verdict`, `load`, `parse`), `label` is the slab's
display label. A built-in `__eval` template covers eval runs; supplying
`__eval` replaces it.

## ROLE_WEIGHT: object, role → number (optional)

Relative effort weight per synthetic role, merged over the built-in
weights. Roles without a weight count as 1.0.

## DEFAULT_RUN_ID: string (optional)

Run selected on load. Defaults to the first non-eval run.
