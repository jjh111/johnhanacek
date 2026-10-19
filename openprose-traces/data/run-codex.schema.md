# run-codex: TRACE_DATA schema

Page: `viz/run-codex.html`. Slot: `data/run-codex.js`.
Structure only. The example values below are invented placeholders.

The page shows one run four ways at once, all driven by the same selection:
a file tree of strata and nodes (left), a 3D stack of strata planes
(center), an aggregate or node detail panel (right), and a one-paragraph
narrative with inline sparklines (above the stage).

## `TRACE` (required)

`object`: one run.

| field           | type     | meaning |
|-----------------|----------|---------|
| `id`            | string   | run identifier; top bar, and the root of every tree path |
| `program`       | string   | optional; identifier of the program that ran (kept for parity, not drawn) |
| `customer`      | string   | optional; organization label in the top bar |
| `subject`       | string   | optional; what the run was about, joined to `customer` in the top bar |
| `totalTime`     | string   | elapsed-time label in the top bar |
| `totalNodes`    | number   | optional; node count in the top bar, defaults to the counted nodes |
| `elapsedEvents` | number[] | seconds into the run at each stratum close, one per slice; drives the duration sparkline |
| `slices`        | object[] | the strata, bottom to top (see below) |

### `TRACE.slices[]`

| field     | type     | meaning |
|-----------|----------|---------|
| `id`      | string   | short stratum id (`T1`, `T2`, ...); also the tree folder id and selection id |
| `label`   | string   | stratum label, starting with `id` (`'T2 Example phase'`) |
| `short`   | string   | short label (usually same as `id`) |
| `phase`   | string   | one-word phase name in the aggregate eyebrow |
| `time`    | string   | elapsed-at-close label for the timeline strip |
| `y`       | number   | plane height in the 3D stack (layout is tuned for 0 to 12 in steps of 3) |
| `summary` | string   | stratum summary, HTML allowed |
| `nodes`   | object[] | nodes on this plane (see below) |

### `TRACE.slices[].nodes[]`

| field        | type     | meaning |
|--------------|----------|---------|
| `id`         | string   | unique node id, referenced by edges and `data-nav` |
| `name`       | string   | node name; tree label (type extension appended) and detail title |
| `type`       | string   | `agent`, `delegation`, `data` or `output`; picks the icon, 3D shape and color |
| `status`     | string   | one of `M`, `A`, `U`, `P`, `D`; tree status chip and filter key (`P` tints a data node amber) |
| `kind`       | string   | short kind line (eyebrow, tooltip); containing `optional` dashes derived edges |
| `state`      | string   | short state line (meta grid, tooltip) |
| `tokens`     | number   | token count, or `null` |
| `latency`    | string   | latency label, or `null` |
| `upstream`   | string[] | ids of nodes this one reads from |
| `downstream` | string[] | ids of nodes this one feeds |
| `pos3d`      | object   | `{ x, z }` position on the plane (plane is 12 by 9, centered on 0) |
| `summary`    | string   | optional; node summary, HTML allowed |
| `sources`    | object[] | optional; `{ name, kind, state? }` source pills, `state: 'partial'` marks a weak source |
| `fields`     | string[] | optional; binding field pills (output nodes) |
| `evalChecks` | object[] | optional; makes the node an eval aggregate (octagon); see below |

An output node is nested in the tree under an agent in the same slice whose
`downstream` lists it.

### `evalChecks[]`

| field    | type   | meaning |
|----------|--------|---------|
| `id`     | string | check id |
| `label`  | string | check name, shown in mono |
| `state`  | string | `pass` or `fail` |
| `detail` | string | one-line note, HTML allowed |

The pass tally in the top bar, the detail header and the eval donut are
counted from the first node that has `evalChecks`.

Example shape:

```js
TRACE: {
  id: 'run-0001', customer: 'Org A', subject: 'Example subject',
  totalTime: '3m 10s', elapsedEvents: [0, 70, 190],
  slices: [
    { id: 'T1', label: 'T1 Inputs', short: 'T1', phase: 'inputs', time: '0s', y: 0,
      summary: 'Caller bindings.',
      nodes: [
        { id: 'in-a', name: 'input_a', type: 'data', status: 'U', kind: 'binding · required',
          state: 'consumed', tokens: null, latency: 'instant',
          upstream: [], downstream: ['svc-a'], pos3d: { x: 0, z: 0 } }
      ] }
  ]
}
```

## `PRETEXT_HTML` (required)

`string`: the narrative paragraph, HTML. Three tokens are replaced with
inline sparklines drawn from `TRACE`:

| token       | sparkline |
|-------------|-----------|
| `{{sparkA}}` | per-stratum duration bars from `elapsedEvents` |
| `{{sparkB}}` | eval pass-ratio donut |
| `{{sparkC}}` | fan-out glyph |

Any element with class `pre-tap` and a `data-nav` attribute (a node id or a
slice id) selects that node or slice when clicked. Classes `fig` (figures)
and `em`/`strong` are styled.

```js
PRETEXT_HTML: 'In <strong class="pre-tap" data-nav="T1"><span class="fig">3m</span></strong>{{sparkA}}, ...'
```

## `EDGE_SPECS` (optional)

`array` of `{ s, t, dashed? }`: 3D edge lines from node id `s` to node id
`t`; `dashed: true` draws an optional input. When absent, edges come from
each node's `downstream`, dashed when the source node's `kind` contains
`optional`.
