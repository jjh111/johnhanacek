# confidence-radar: TRACE_DATA schema

Page: `viz/confidence-radar.html`. Slot: `data/confidence-radar.js`.
Structure only. The example values below are invented placeholders.

The page shows one card per program (radar of four scores, a score column,
an overall figure, an italic note) and one tab per organization. A first tab,
`All organizations`, is built by the page from every organization's programs;
do not supply it (an organization entry with no programs is ignored).

## `FLEET_DATA` (required)

`object`: organization label -> `object`: program label -> score record.

Tab order follows key order. Within a tab, cards sort by `overall`, highest first.

| field     | type   | meaning |
|-----------|--------|---------|
| `rf`      | number | runtime fidelity score, 0 to 100 |
| `te`      | number | task effectiveness score, 0 to 100 |
| `cs`      | number | contract satisfaction score, 0 to 100 |
| `ds`      | number | domain score, 0 to 100 |
| `overall` | number | overall score shown top right, 0 to 100; drives the colour band (90+ strong, 70 to 89 adequate, below 70 investigate) |
| `runId`   | string | run identifier shown under the program heading |
| `verdict` | string | `"pass"` or `"partial"`; `"partial"` adds the amber badge |
| `notes`   | string | one-line note, HTML allowed (`<em>` renders teal italic) |

Example shape:

```js
FLEET_DATA: {
  'Org A': {
    'example-program': { rf: 80, te: 75, cs: 90, ds: 85, overall: 82.5,
                         runId: 'run-0001', verdict: 'pass', notes: 'Example note.' }
  }
}
```

## `PRETEXT` (optional)

`object`: tab label -> `string` of HTML (one or more `<p>`), shown above the grid
when that tab is active. Use the key `All organizations` for the aggregate tab.
Markup hooks: `<strong>`, `<em>`, `<span class="hl">`, `<span class="hl-hot">`,
`<span class="fig">` (mono figure).

## `UPDATED` (optional)

`string`: shown in the masthead as `Updated <value>`.
