# fleet-atrium: TRACE_DATA schema

Data contract for `viz/fleet-atrium.html`. The page reads `window.TRACE_DATA`,
defined by `data/fleet-atrium.js`. Structure only: every example value below is
invented.

The page renders one recorded organization (`PRIMARY_CUSTOMER`) plus, when
`FLEET_CUSTOMERS` is given, further organizations whose runs it synthesizes
in-page from `SHAPE_TEMPLATES` (flagged `isSynth: true`, shown with a
SYNTHETIC chip).

The page mutates these objects at load: it appends synthesized programs and runs
to `PROGRAMS`, `PROGRAM_ORDER`, `RUNS`, `RUN_STATES` and `BINDINGS_INDEX`, and
sets `customer`, `evalChild` and `parentRun` on runs.

## Required keys

### `PRIMARY_CUSTOMER`: object
The organization the recorded runs belong to.
- `id` (string): customer id. Recorded runs without a `customer` field get this id.
- `label` (string): display name (picker, ledger, axis lanes).
- `shortLabel` (string, optional): short name used in narration. Defaults to `label`.
- `domain` (string, optional): the organization's vertical, used by the `customer-domain` aspect.
- `color` (number, optional): hex int brand tint, e.g. `0x3a7a6a`. Defaults to the teal accent.

### `PROGRAMS`: object, program id → program
- `label` (string): display name.
- `cadence` (string): free text, e.g. `"weekly"` or `"on-demand"`. The Cadence filter matches `scheduled|daily|weekly` and `on-demand`.
- `color` (number): hex int identity colour (3D scene).
- `cssColor` (string): CSS colour for swatches. `var(--prog-a)` through `var(--prog-d)` map to the page's four program tokens, and the 3D colour then follows the token.
- `baseline` (object): program quality scores, 0 to 100.
  - `overall` (number): composite score.
  - `rf` (number): runtime fidelity.
  - `te` (number): task effectiveness.
  - `cs` (number): contract satisfaction.
  - `ds` (number): domain score.
- `about` (string): one-sentence description of the program.

### `PROGRAM_ORDER`: string[]
Program ids in display order (lanes, legends, health panel). Must be an array; synthesized programs are appended to it.

### `RUNS`: object[]
One entry per recorded run (producing runs and eval runs).
- `id` (string): unique run id.
- `program` (string): key into `PROGRAMS`.
- `customer` (string, optional): customer id. Defaults to `PRIMARY_CUSTOMER.id`.
- `subject` (string): headline for the run (what it was about).
- `context` (string): one-line input context shown in the selected-run meta.
- `startedAt`, `endedAt` (string): ISO 8601 UTC timestamps.
- `durationMin` (number): wall-clock minutes.
- `steps` (number): step count.
- `mode` (string): `"on-demand"`, `"scheduled"` or `"eval"`.
- `gate` (string): `"delivered"`, `"awaiting"` (pending human review) or `"scheduled"` (not yet fired).
- `summary` (string, HTML allowed): short paragraph for the ledger card.
- `evalRunId` (string, optional): id of the eval run that verified this run.
- `isEval` (boolean, optional): true for an eval run.
- `upstream` (string, optional): on an eval run, the id of the run it verified.
- `evalPass`, `evalTotal` (number, optional): checks passed / total, on eval runs.
- `evalFail` (string[], optional): names of the failed checks.
- `baselineRun` (boolean, optional): true when this run is its program's reference baseline.
- `codexHref` (string, optional): link to a per-run document page, e.g. `"run-codex.html"`. A link appears only when this is set.

### `RUN_STATES`: object, run id → step[]
The parsed step list for each run (one entry per logged step).
- `phase` (number): serial step number.
- `sub` (string): `""`, or `"a"`..`"f"` for branches of a parallel block.
- `name` (string): service or eval-check name, e.g. `"source-scout"` or `"is_well_formed"`.
- `kind` (string): `"input"`, `"agent"` or `"eval"`.
- `status` (string): `"ok"` or `"fail"`.
- `parallel` (boolean): true inside a parallel block.
- `siblings` (string[]): every member name of the parallel block (empty when serial).

Naming conventions the page reads: an agent name ending in `-compiler` is the run's synthesis step; one ending in `profiler` is a lead step.

### `BINDINGS_INDEX`: object, run id → { step name → artifact[] }
What each step wrote. Two special step keys: `caller` (files behind the operator-supplied `[input]` steps, matched by `<input name>.md`) and `evaluator` (an eval run's result file).
- `name` (string): artifact filename, e.g. `"report.md"`.
- `bytes` (number): file size in bytes.

## Optional keys

### `TIME_WINDOW`: object
- `start`, `end` (string): ISO timestamps bounding the time axis. Default: the recorded runs' span, rounded out to whole hours.
- `label` (string): masthead window text, e.g. `"Jan 1 → 2"`. Default: first and last calendar day in the data.

### `SERVICE_SYNOPSES`: object, agent step name → string
One-line contract of what the service does. Shown in the slab hover card.

### `EVAL_PREDICATES`: object, eval step name → string
Plain-language phrasing of each eval check, e.g. `"Is every claim cited?"`.

### `ENSURES_GIST`: object, agent step name → string
One-line gist of what the agent's contract guarantees. Shown under EMITS in the sidebar step card.

### `INPUT_GLOSS`: object, input step name → string
What each operator-supplied input is.

### `PHASE_GLOSS`: object
Overrides for the page's built-in phase descriptions. Keys: `input`, `profile`, `scout`, `synthesis`, `eval` (each a string).

### `RUN_PROGRAM_FLOW`: object, program label (or program id) → string
One-line description of the program's run shape, e.g. `"Inputs → two parallel scouts → widget-compiler."`.

### `STEP_HINTS`: object
Step names that need special handling beyond the naming conventions. Each field is a string[]:
- `verdictEvals`: eval checks that read as the verdict (role `verdict`, heavier slab).
- `weightyEvals`: further eval checks that get the heavier slab.
- `compositeSteps`: single agent steps that run a whole fan-out + synthesis internally (synthesis gloss, heavy slab).
- `leadSteps`: first-pass agents that run ahead of a fan-out.

### `PROGRAM_NODES`: object, program id → node[]
Fallback role chain for runs that have no `RUN_STATES` entry.
- `role` (string): one of `profile`, `scout`, `scanner`, `detector`, `sizer`, `mapper`, `counter`, `compiler`, `check`, `verdict` (drives slab weight + tint).
- `label` (string): slab label.

### `TREND_NOTES`: object, program id → string (HTML allowed)
One-line note under each program in the operations health panel.

### `DELIVERABLE_PROGRAMS`: string[]
Program ids whose delivered runs the Ship log insight names as this window's deliverables.

### `DEFAULT_RUN_ID`: string
Run selected on first paint. Default: the first recorded producing run.

### `FLEET_CUSTOMERS`: object, customer id → organization (synthesized)
- `label` (string): display name.
- `domain` (string): the organization's vertical.
- `color` (number): hex int brand tint.
- `provider` (boolean, optional): marks the platform's own organization. Its programs count as OpenProse-provided in the Authorship filter.
- `programs` (object, program key → program):
  - `shape` (string): a key into `SHAPE_TEMPLATES`. Shapes `scanner-fan` and `tracker` get two synthesized runs, every other shape gets one.
  - `label` (string): display name.
  - `baseline` (number): overall quality score, 0 to 100. Synthesized pass rates land near it.
  - `about` (string): one-sentence description. Its first sentence also becomes the run context.

### `SHAPE_TEMPLATES`: object, shape name → step[]
Step-tree template copied for each synthesized run. Same step fields as `RUN_STATES`. Customary shape names: `memo`, `scanner-fan`, `monitor`, `tracker`, `meta`.

### `FAIL_BY_CUSTOMER`: object, customer id → string
Step name flipped to `status: "fail"` on that organization's last synthesized run, so each synthesized organization has exactly one flagged run.

### `SYNTH_START`: string
ISO timestamp where synthesized runs start (they are spaced 18 minutes apart). Default: the start of the time window.

## Minimal example (invented)

```js
window.TRACE_DATA = {
  PRIMARY_CUSTOMER: { id: 'acme', label: 'Acme Labs', domain: 'testing' },
  PROGRAMS: { 'alpha-report': { label: 'Alpha Report', cadence: 'weekly', color: 0xc8664e,
    cssColor: 'var(--prog-a)', baseline: { overall: 80, rf: 80, te: 80, cs: 80, ds: 80 },
    about: 'Writes a weekly report.' } },
  PROGRAM_ORDER: ['alpha-report'],
  RUNS: [{ id: 'r1', program: 'alpha-report', subject: 'Widget Co', context: 'topic: widgets',
    startedAt: '2030-01-01T10:00:00Z', endedAt: '2030-01-01T10:10:00Z', durationMin: 10,
    steps: 2, mode: 'on-demand', gate: 'delivered', summary: 'A short report.' }],
  RUN_STATES: { r1: [
    { phase: 1, sub: '', name: 'topic', kind: 'input', status: 'ok', parallel: false, siblings: [] },
    { phase: 2, sub: '', name: 'widget-compiler', kind: 'agent', status: 'ok', parallel: false, siblings: [] },
  ] },
  BINDINGS_INDEX: { r1: { caller: [{ name: 'topic.md', bytes: 40 }],
    'widget-compiler': [{ name: 'report.md', bytes: 4000 }] } },
};
```
