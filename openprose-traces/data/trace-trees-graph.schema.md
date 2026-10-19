# trace-trees-graph: TRACE_DATA schema

Page: `viz/trace-trees-graph.html`. Slot: `data/trace-trees-graph.js`.
Structure only. The example values below are invented placeholders.

The page renders one run as a file tree (a folder per time slice, a file per
node, delegation outputs nested under their delegation), a detail panel, a
timeline minimap, and a d3-force control-flow graph built from the node edges.

## `TRACE` (required)

`object`, one run.

| field    | type   | meaning |
|----------|--------|---------|
| `id`     | string | run identifier; the tree root and the header label |
| `slices` | array  | time slices in order (see below); keys `1` to `9` jump to slice 1 to 9, and the first slice is selected on load |

### slice

| field   | type   | meaning |
|---------|--------|---------|
| `id`    | string | slice id, unique, e.g. `T1` |
| `label` | string | slice label that starts with the id, e.g. `T1 Setup`; the folder name is the label with its first space hyphenated, lowercased, and the detail title is the label minus the id |
| `phase` | string | phase word; its first five letters label the minimap segment |
| `nodes` | array  | trace nodes in this slice (see below) |

### node

| field        | type           | meaning |
|--------------|----------------|---------|
| `id`         | string         | node id, unique across the whole run |
| `name`       | string         | node name; the tree shows it with a type suffix such as `.agent` |
| `type`       | string         | `agent`, `delegation`, `output` or `data` (sets icon, colour and summary sentence) |
| `status`     | string         | tree badge and filter key: `M` executing, `A` newly spawned, `U` untracked, `D` has descendants, or `''` for none |
| `model`      | string or null | model id for agent and delegation nodes; `null` for data and output |
| `tokens`     | number         | token count |
| `latency`    | string         | display latency, e.g. `120ms`; any placeholder string when not applicable |
| `state`      | string         | lifecycle word shown as status in the detail panel, e.g. `active`, `produced` |
| `upstream`   | array of ids   | nodes this one reads from |
| `downstream` | array of ids   | nodes this one feeds; an `output` listed downstream of a `delegation` in the same slice nests under it |
| `code`       | string (HTML)  | snippet for the detail panel's code block; `\n` for line breaks, optional highlight spans `ck` keyword, `cn` name/number, `cs` string, `cc` comment |

Example shape:

```js
TRACE: {
  id: 'run-0001',
  slices: [
    { id: 'T1', label: 'T1 Setup', phase: 'setup', nodes: [
      { id: 'n1', name: 'planner', type: 'agent', status: 'M', model: 'model-x',
        tokens: 100, latency: '10ms', state: 'active',
        upstream: [], downstream: [], code: 'plan()' }
    ] }
  ]
}
```
