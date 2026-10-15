# Trace schema

Every trace in this folder is stored once in a canonical form and emitted into
the data shape each visualization expects.

```
data/<kind>/runs/<run-id>/     canonical run, kind = synthetic | own
data/<kind>/models/<model>.js  emitted per-page globals, generated, never hand-edited
```

## Canonical form: an OpenProse run directory (v0.14)

The layout OpenProse's filesystem state backend writes, so a trace here is
shaped like the real thing:

```
runs/<YYYYMMDD>-<HHMMSS>-<hex6>/
  root.prose.md               snapshot of the invoked system
  sources/<name>.prose.md     snapshot of each service it resolved
  forme.manifest.json         the wiring: caller interface, graph, execution order
  vm.log.md                   the execution log, append-only
  bindings/caller/<in>.md     inputs from the caller
  bindings/<svc>/<out>.md     each service's public outputs
  workspace/<svc>/…           each service's private working files
  timing.json                 our sidecar, below
```

### vm.log.md

One line per event, numbered by step:

```
# run:<run-id> <system>
root: <path>

1→ [input] <name> ✓
2→ <service> ✓
3→ ∥start <a>,<b>,<c>
3a→ <a> ✓
3b→ <b> ✗ <error-name>
3c→ <c> ✓
3→ ∥done
4→ <service> ⟳ (resumed)
5→ [eval] <criterion> ✓
---end <ISO-8601>
```

Markers: `✓` done, `✗ <error>` failed, `⇒ <delegate>` delegated,
`⟳` resumed, `⊘ terminated`, `∥start`/`∥done` a parallel block.

### forme.manifest.json

```
{ id, systemName, sourcePath,
  caller: { requires: [{name, description}], returns: [{name, source}] },
  graph: [{ id, sourcePath, workspacePath,
            inputs:  [{name, from, sourceNodeId, sourceOutput, path}],
            outputs: [{name, workspacePath, bindingPath, public}],
            errors, delegates }],
  executionOrder: [{ nodeId, dependsOn: [] }],
  environment, tools, warnings }
```

### timing.json (sidecar)

OpenProse's file logs carry no per-step times. This sidecar follows the
columns of OpenProse's SQLite state backend, one row per log statement:

```
{ run: { status, started_at, completed_at },
  execution: [{ statement_index, statement_text, status,
                started_at, completed_at, parent_id, metadata }] }
```

- **Synthetic runs**: the generator writes it.
- **Our own runs**: it comes from a SQLite-backend run, which records real
  times. Failing that, it comes from when each output binding was written, and
  each row says which.

## The other family: rlm process trees

The flame graphs show the older recursive-LLM runtime, where a node is one
LLM conversation and its size is its iteration count:

```
Node = { id, query, iterations, status: success | failed | truncated,
         depth, children: Node[] }
```

The iteration budget is 15 at depth 0, 7 at depth 1 and 4 at depth 2. Deeper
calls leave no trace of their own.

## Honest fields

No OpenProse or rlm trace records tokens, latency, cost or model per step. Views
that show them draw on these sources:

- **Synthetic runs**: the invented values in the scenario.
- **Our own runs**: nothing, unless a real measurement exists.
