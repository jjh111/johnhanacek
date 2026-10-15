# run-strata: TRACE_DATA schema

Page: `viz/run-strata.html`. Slot: `data/run-strata.js`.
Structure only. The example values below are invented placeholders.

The page lays one run out as stacked strata (time runs bottom to top). Two
modes: **flat**, a scrolling slide per stratum with the deliverable stratum
pinned first, and **tilted**, a 3D stack of planes with node shapes, source
dots and edges. A top overview panel, a delta ledger (right rail), a hover
card and a node modal all read the same data.

Layout is tuned for five strata at `y` = 0, 3, 6, 9, 12 (stack center 6,
per-stratum fill tones for five, number keys 1 to 5). Fewer strata work;
more than five fall back to a white fill and lose number-key access.

## `strata` (required)

`array`, bottom stratum first.

| field     | type     | meaning |
|-----------|----------|---------|
| `id`      | number   | must equal the array index (0, 1, 2, ...); used as the slide and selection key |
| `label`   | string   | `'<short> · <name>'`; the part after the first `·` is the stratum name in the rail and slide head |
| `short`   | string   | short label (`T1`, `T2`, ...) for rail chips, prefixes and arrows |
| `y`       | number   | plane height in the 3D stack |
| `time`    | string   | elapsed-at-close label (`t = <time>` on the slide) |
| `summary` | string   | stratum summary under the slide head, HTML allowed |
| `nodes`   | object[] | nodes on this plane (see below) |
| `edges`   | object[] | edges within this plane: `{ source, target, type }`, node ids, `type` `'solid'` or `'dashed'` |

A stratum with four nodes gets the four-up card grid; otherwise two-up. The
stratum holding the `richBody: 'memo'` node renders as the deliverable slide
(memo body plus compact eval) when `MEMO_BODY_HTML` is set.

### `strata[].nodes[]`

| field      | type     | meaning |
|------------|----------|---------|
| `id`       | string   | unique node id, referenced by edges |
| `type`     | string   | shape: `circle` (service), `rectangle` (binding), `parallelogram` (output), `octagon` (eval), `octagon-compound` (eval aggregate) |
| `label`    | string   | node label (3D sprite, cards, modal, ref pills) |
| `state`    | string   | state word; `pass` and `fail` color the outline, `fail` also tints the fill; on `octagon-compound` anything but `pass` draws the flagged inset |
| `meta`     | string   | one-line meta (card, hover, modal); on a `rectangle`, containing `empty` dims the card |
| `stat`     | string   | optional; dim stat line under the 3D label |
| `x`, `z`   | number   | position on the plane (plane is 12 by 9, centered on 0) |
| `detail`   | string   | optional; narrative, HTML allowed |
| `sources`  | object[] | optional; `{ name, kind, state? }`; on a `circle` each becomes an orbiting dot, `state` `partial` or `fail` marks it red |
| `fields`   | string[] | optional; field pills |
| `richBody` | string   | optional; `'memo'` opens `MEMO_BODY_HTML` in the modal, `'eval'` opens the `EVAL_CHECKS` gate |
| `cta`      | object   | optional; `{ label, href }` link on the card, modal and deliverable slide. Keep `href` relative to the dataset; nothing ships with the page |

Example shape:

```js
strata: [
  { id: 0, label: 'T1 · Inputs', short: 'T1', y: 0, time: '0s', summary: 'Caller bindings.',
    nodes: [
      { id: 'in-a', type: 'rectangle', label: 'input_a', state: 'consumed',
        meta: 'caller · required', x: 0, z: 0, stat: 'required', detail: 'Example input.' }
    ],
    edges: [] }
]
```

## `EVAL_CHECKS` (required)

`array` of checks (may be empty).

| field    | type   | meaning |
|----------|--------|---------|
| `id`     | string | check id |
| `label`  | string | check name, shown in mono |
| `state`  | string | `pass` or `fail` |
| `detail` | string | one-line note, HTML allowed |

Computed by the page, do not supply: the pass / total tally used in the
overview sentence, eval donuts, the aggregate's centre label and the gate
heading.

## `verticalEdges` (required)

`array` of edges that cross strata.

| field      | type   | meaning |
|------------|--------|---------|
| `sourceId` | string | source node id |
| `s0`       | number | source stratum index |
| `targetId` | string | target node id |
| `s1`       | number | target stratum index |
| `type`     | string | `'solid'` (with end dots) or `'dashed'` (optional input) |

These also feed each node's Reads / Feeds pills.

## `RUN_META` (required)

`object`: overview panel and ledger head.

| field            | type   | meaning |
|------------------|--------|---------|
| `brand`          | string | optional; small brand line top-left |
| `subjectHtml`    | string | optional; subject line under the brand, HTML allowed (`<em>` is styled) |
| `kicker`         | string | optional; kicker at the start of the overview sentence |
| `customer`       | string | optional; organization label after the kicker |
| `runtimeMinutes` | number | run length in minutes; drives the pie-hour sparks |
| `runtimeLabel`   | string | optional; runtime figure, defaults to `<runtimeMinutes>m` |
| `verdict`        | string | optional; verdict chip at the end of the overview sentence |
| `runId`          | string | optional; run identifier titling the delta ledger |
| `evalNote`       | string | optional; extra meta span in the eval gate modal |

```js
RUN_META: { brand: 'Example', subjectHtml: 'Subject <em>(note)</em>', kicker: 'Report',
  customer: 'Org A', runtimeMinutes: 12, verdict: 'Example verdict.', runId: 'run-0001' }
```

## `PRETEXT_HTML` (optional)

`string`: the overview paragraph, HTML. Spark tokens are replaced inline:

| token           | spark |
|-----------------|-------|
| `{{pie:N}}`     | pie-hour wedge for N minutes |
| `{{eval}}`      | pass / fail donut from `EVAL_CHECKS` |
| `{{ratio:A/B}}` | single filled donut at A / B |

Classes `fig`, `verdict` and `code` are styled.

## `DELTA_LEDGER` (optional)

`array` of `{ time, html }`. Row `i` narrates `strata[i]` to `strata[i + 1]`
(so at most `strata.length - 1` rows); `time` is the transition duration
label, `html` the narrative (spark tokens allowed). Clicking a row jumps to
`strata[i + 1]`.

## `DELTA_COPY` (optional)

`array` of HTML strings, one per transition, for the callout at the top of
each flat slide. Defaults to the `DELTA_LEDGER` `html`.

## `MEMO_BODY_HTML` (optional)

`string`: the deliverable body, HTML, for the node with `richBody: 'memo'`.
Styled classes: `memo-h1`, `memo-sub`, `memo-h2`, `memo-meta-row`,
`memo-conviction`, `memo-footnote-row`. The page appends a runtime and eval
spark pair to the end of the first `<div class="memo-meta-row">` (keep that
div free of nested divs).

## `MEMO_MORE_HTML` (optional)

`string`: continuation revealed by "Show more" on the deliverable slide.
`memo-table` and `fig` are styled.
