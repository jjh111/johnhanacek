# run-story: TRACE_DATA schema

Page: `viz/run-story.html`. Slot: `data/run-story.js`.
Structure only. The example values below are invented placeholders.

The page tells the story of one organization's recurring runs: a lede with
inline sparklines, a ledger of responsibilities, a grid of small multiples, and
the latest delivery with a message preview. Every content section renders from
these keys. Fields marked HTML are inserted as markup (trusted data only);
all other fields are inserted as plain text.

## Spark spec (used by several keys)

`object`: `{ values, kind }`

| field    | type             | meaning |
|----------|------------------|---------|
| `values` | array of numbers | series in time order; higher values plot higher |
| `kind`   | string           | optional; `"line"` (default) or `"dots"` (one marker per value, joined by hairlines, for sparse periodic deliveries) |

## `ORG` (required)

`string`: organization label. Used in the nav, the lede kicker, the ledger
heading, the footer and the document title.

## `LEDE` (required)

`array` of parts, concatenated into one paragraph:

- `string`: HTML. Hooks: `<em>` (teal italic), `<strong>`, `<span class="fig">` (mono figure).
- `{ spark: <spark spec> }`: an inline word-size sparkline, placed right after the figure it explains.

## `LEDGER` (required)

`array`, one row per responsibility.

| field         | type          | meaning |
|---------------|---------------|---------|
| `name`        | string        | responsibility name |
| `route`       | string        | optional; where deliveries go, shown under the name after an arrow |
| `cadence`     | string        | schedule, e.g. `daily 08:00` |
| `last`        | string        | when it last delivered, e.g. `today, 08:03` |
| `runs`        | string/number | run count for the window |
| `pct`         | string        | optional; success rate shown beside the count |
| `trend`       | spark spec    | trend sparkline |
| `status`      | string        | `ok`, `warn` or `err` (sets colour) |
| `statusLabel` | string        | optional; status text, defaults to `status` |

## Optional keys

| key             | type   | meaning |
|-----------------|--------|---------|
| `LIVE`          | string | nav status line (pulsing dot); hidden when absent |
| `PERIOD`        | string | period label in the lede kicker, e.g. `week 1` |
| `CODA`          | array of `{ value, label }` | figures under the lede, e.g. `{ value: '10', label: 'deliveries' }` |
| `RUNS_LABEL`    | string | ledger runs column header, defaults to `Runs` |
| `GLANCE`        | array  | small multiples (below); section hidden when absent |
| `GLANCE_KICKER` | string | small-multiples kicker, defaults to `This week · at a glance` |
| `LATEST`        | object | latest delivery (below); section hidden when absent |
| `FOOTER`        | string | footer text, defaults to `Operating ledger for <ORG>` |

### `GLANCE` item

| field         | type       | meaning |
|---------------|------------|---------|
| `name`        | string     | short responsibility name |
| `status`      | string     | `ok` or `warn`; `ok` panels count as deliveries in the heading |
| `statusLabel` | string     | optional; status text |
| `spark`       | spark spec | panel sparkline |
| `meta`        | string     | left meta line, e.g. an item count |
| `figure`      | string     | right meta figure, e.g. a run duration |

### `LATEST`

| field       | type            | meaning |
|-------------|-----------------|---------|
| `when`      | string          | optional; appended to the `Latest delivery` kicker |
| `headline`  | string (HTML)   | optional; section heading |
| `tag`       | string          | optional; small label above the title |
| `title`     | string (HTML)   | optional; card title |
| `body`      | array of HTML   | card paragraphs; `<span class="hl">` for mono figures |
| `link`      | string          | optional; URL for the view link |
| `linkLabel` | string          | optional; view link text |
| `preview`   | object          | optional; message preview (below), hidden when absent |

`preview` fields: `stamp` (string, the small label on the preview's top edge),
`subject` (string, from/to line), `heading` (HTML), `body` (array of HTML,
`<span class="fig">` for figures), `footnote` (HTML, small grey line).

Example shape:

```js
{
  ORG: 'Org A',
  LEDE: ['The <em>example task</em> ran <span class="fig">10 times</span>',
         { spark: { values: [1, 2, 3] } }, '.'],
  LEDGER: [{ name: 'Example task', cadence: 'daily', last: 'today', runs: 10,
             pct: '100%', trend: { values: [1, 2, 3] }, status: 'ok' }]
}
```
