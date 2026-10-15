# fleet-heatmap: TRACE_DATA schema

Page: `viz/fleet-heatmap.html`. Slot: `data/fleet-heatmap.js`.
Structure only. The example values below are invented placeholders.

The page draws one ledger row per program with four heat cells, an overall
figure and a verdict, plus summary cells and a lede computed from the rows.

## `FLEET` (required)

`array` of row objects.

| field      | type   | meaning |
|------------|--------|---------|
| `customer` | string | organization label; rows group under it when sorted by organization |
| `program`  | string | program label shown in the row |
| `rf`       | number | runtime fidelity score, 0 to 100 |
| `te`       | number | task effectiveness score, 0 to 100 |
| `cs`       | number | contract satisfaction score, 0 to 100 |
| `ds`       | number | domain score, 0 to 100 |
| `runId`    | string | run identifier shown under the program |
| `notes`    | string | one-line note shown in the heat-cell tooltip, HTML allowed |
| `verdict`  | string | optional; `"partial"` flags the row, defaults to `"pass"` |

Computed by the page, do not supply: `overall` (mean of the four scores, one
decimal) and the default `verdict`.

Example shape:

```js
FLEET: [
  { customer: 'Org A', program: 'example-program', rf: 80, te: 75, cs: 90, ds: 85,
    runId: 'run-0001', notes: 'Example note.' }
]
```

## `UPDATED` (optional)

`string`: shown in the masthead as `Updated <value>`.
