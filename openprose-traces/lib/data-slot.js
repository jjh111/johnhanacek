// data-slot.js: the one place a code-only trace page gets its data from.
//
// Every page in traces/viz/ ships WITHOUT data. Each one loads a slot file,
// data/<page>.js, which is empty here and is where a dataset gets dropped in
// later. A dataset defines window.TRACE_DATA = { KEY: value, ... } with the
// keys that page's data/<page>.schema.md describes.
//
//   <script src="../lib/data-slot.js"></script>
//   <script src="../data/fleet-heatmap.js"></script>
//   <script>
//     const { FLEET } = TraceSlot.require('fleet-heatmap', ['FLEET']);
//     ... the page's own code, unchanged ...
//   </script>
//
// With the slot empty, require() draws a notice at the top of the page and
// stops that script by throwing. The throw is deliberate: the page's code ran
// at top level against inline data, and halting it is the only change that
// leaves that code byte-for-byte as it was. The error is a known sentinel, so
// the handler below keeps it out of the console; a real error still shows.
(function () {
  const SENTINEL = 'TraceDataMissing';

  window.addEventListener('error', (e) => {
    if (e.error && e.error.name === SENTINEL) e.preventDefault();
  });

  function notice(slot, missing) {
    if (document.getElementById('trace-slot-notice')) return;
    const box = document.createElement('div');
    box.id = 'trace-slot-notice';
    box.setAttribute('role', 'status');
    box.style.cssText = [
      'position:fixed', 'left:50%', 'top:16px', 'transform:translateX(-50%)',
      'z-index:2147483647', 'max-width:min(560px, calc(100vw - 32px))',
      'padding:12px 16px', 'background:#fbf8f2', 'color:#26211d',
      'border:1px solid rgba(38,33,29,0.25)', 'border-radius:4px',
      'box-shadow:0 2px 12px rgba(38,33,29,0.12)',
      'font:13px/1.5 ui-monospace, Menlo, Consolas, monospace',
    ].join(';');
    box.innerHTML =
      '<strong>No trace data loaded.</strong> This page ships as code only. ' +
      'Add <code>data/' + slot + '.js</code> defining <code>window.TRACE_DATA</code> ' +
      'with: <code>' + missing.join(', ') + '</code>. ' +
      'See <code>data/' + slot + '.schema.md</code>.';
    (document.body || document.documentElement).appendChild(box);
  }

  window.TraceSlot = {
    // Returns window.TRACE_DATA when every required key is present; otherwise
    // shows the notice and throws the sentinel. Optional keys are not checked.
    require(slot, required) {
      const data = window.TRACE_DATA || {};
      const missing = (required || []).filter((k) => data[k] == null);
      if (!missing.length) return data;
      if (document.body) notice(slot, missing);
      else document.addEventListener('DOMContentLoaded', () => notice(slot, missing));
      const err = new Error('trace data missing for ' + slot + ': ' + missing.join(', '));
      err.name = SENTINEL;
      throw err;
    },
  };
})();
