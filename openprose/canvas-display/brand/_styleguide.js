/* ============================================================
   OpenProse · _styleguide.js — mode-panel + tokens dump
   ----------------------------------------------------------------
   Created 2026-05-26 by JH (consolidation step 3).

   Drives the 7 axes via body data-attributes:
     · data-direction  (β γ δ ζ η θ λ μ ν ρ)
     · data-palette    (light-{cool-default, warm-teal, warm-rust,
                       manuscript-cream, saas-neutral},
                       dark-{machine, livingdoc})
     · data-pairing    (A B C D E F)
     · data-accent     (upright italic) — posture of the em accents;
                       upright is the default (c_a965130b)
     · data-mono       (plex jet space)
     · data-layout     (styleguide homepage concept landscape codex poster)
     · data-mark       (static swap-cycle rain bloom ripple physics 3d blackhole)

   Per Q3: data-direction sets DEFAULTS; user toggles win and persist
   in localStorage. Setting data-direction does not overwrite a key
   that was explicitly user-set.
   ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'styleguide-mode';
  const LS_USER_SET = 'styleguide-user-set';

  /* ---------- Direction defaults (per Q7 user-confirmed) ---------- */
  const DIRECTION_DEFAULTS = {
    'β': { palette: 'light-warm-teal',     pairing: 'A', accent: 'upright', mono: 'plex',  layout: 'styleguide', mark: 'swap-cycle' },
    'γ': { palette: 'light-manuscript-cream', pairing: 'B', accent: 'upright', mono: 'jet',   layout: 'concept',     mark: 'static' },
    'δ': { palette: 'dark-machine',         pairing: 'C', accent: 'upright', mono: 'plex',  layout: 'homepage',  mark: 'rain' },
    'ζ': { palette: 'light-saas-neutral',   pairing: 'B', accent: 'upright', mono: 'jet',   layout: 'homepage',  mark: 'swap-cycle' },
    'η': { palette: 'light-warm-rust',      pairing: 'A', accent: 'upright', mono: 'plex',  layout: 'homepage',  mark: 'swap-cycle' },
    'θ': { palette: 'dark-livingdoc',       pairing: 'F', accent: 'upright', mono: 'jet',   layout: 'concept',   mark: 'static' },
    'λ': { palette: 'light-warm-teal',      pairing: 'D', accent: 'upright', mono: 'plex',  layout: 'codex',     mark: 'static' },
    'μ': { palette: 'light-warm-teal',      pairing: 'A', accent: 'upright', mono: 'plex',  layout: 'homepage',  mark: 'bloom' },
    'ν': { palette: 'light-warm-teal',      pairing: 'E', accent: 'upright', mono: 'plex',  layout: 'concept',   mark: 'static' },
    'ρ': { palette: 'light-warm-rust',      pairing: 'F', accent: 'upright', mono: 'plex',  layout: 'concept',   mark: '3d' },
  };

  const AXES = {
    direction: ['β', 'γ', 'δ', 'ζ', 'η', 'θ', 'λ', 'μ', 'ν', 'ρ'],
    palette: [
      'light-cool-default', 'light-warm-teal', 'light-warm-rust',
      'light-manuscript-cream', 'light-saas-neutral',
      'dark-machine', 'dark-livingdoc'
    ],
    pairing: ['A', 'B', 'C', 'D', 'E', 'F'],
    accent: ['upright', 'italic'],
    mono: ['plex', 'jet', 'space'],
    layout: ['styleguide', 'homepage', 'concept', 'landscape', 'codex', 'poster'],
    mark: ['static', 'swap-cycle', 'rain', 'bloom', 'ripple', 'physics', '3d', 'blackhole'],
  };

  const AXIS_LABELS = {
    direction: 'Direction',
    palette: 'Palette',
    pairing: 'Pairing',
    accent: 'Accent',
    mono: 'Mono',
    layout: 'Layout',
    mark: 'Mark',
  };

  /* ---------- State persistence ---------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveState(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function loadUserSet() {
    try {
      const raw = localStorage.getItem(LS_USER_SET);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveUserSet(us) {
    try { localStorage.setItem(LS_USER_SET, JSON.stringify(us)); } catch (e) {}
  }

  /* ---------- Apply state to body ---------- */
  function applyState(state) {
    Object.keys(state).forEach(k => {
      if (state[k]) document.body.setAttribute('data-' + k, state[k]);
    });
  }

  /* ---------- Resolve effective state from direction defaults + user overrides ---------- */
  function resolveState(direction, userSet) {
    const defaults = DIRECTION_DEFAULTS[direction] || {};
    return {
      direction: direction || 'β',
      palette: userSet.palette || defaults.palette || 'light-warm-teal',
      pairing: userSet.pairing || defaults.pairing || 'A',
      accent:  userSet.accent  || defaults.accent  || 'upright',
      mono:    userSet.mono    || defaults.mono    || 'plex',
      layout:  userSet.layout  || defaults.layout  || 'styleguide',
      mark:    userSet.mark    || defaults.mark    || 'swap-cycle',
    };
  }

  /* ---------- Switchboard helpers ---------- */
  // Compact display labels; the underlying values stay canonical.
  function shortLabel(axis, v) {
    if (axis === 'palette') return v.replace(/^light-/, '');
    return v;
  }
  function syncButtons(panel, state) {
    panel.querySelectorAll('.sg-mp-opt').forEach(btn => {
      const on = state[btn.dataset.axis] === btn.dataset.val;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* ---------- Build the floating panel ---------- */
  function buildPanel(initialState, onChange) {
    const panel = document.createElement('div');
    panel.id = 'sg-mode-panel';
    panel.innerHTML = `
      <style>
        #sg-mode-panel {
          position: fixed; top: 0.75rem; right: 0.75rem;
          z-index: 9999;
          background: var(--paper-elev, var(--paper, #f5f0e8));
          color: var(--ink);
          border: 1px solid var(--rule);
          border-radius: var(--radius-md, 6px);
          box-shadow: var(--shadow-lg);
          padding: 0.6rem 0.8rem 0.8rem;
          font-family: var(--type-mono, 'IBM Plex Mono', monospace);
          font-size: 0.7rem; line-height: 1.4;
          min-width: 264px; max-width: 320px;
          letter-spacing: 0;
          transition: opacity var(--t-fast, 120ms);
        }
        #sg-mode-panel.collapsed > .sg-mp-body { display: none; }
        #sg-mode-panel.collapsed { padding: 0.4rem 0.6rem; min-width: auto; }
        #sg-mode-panel .sg-mp-header {
          display: flex; justify-content: space-between; align-items: center;
          gap: 0.6rem; cursor: pointer;
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em;
          color: var(--ink-2);
        }
        #sg-mode-panel .sg-mp-toggle {
          background: none; border: none; color: var(--ink-3);
          cursor: pointer; font-family: inherit; font-size: inherit;
          padding: 0 0.2rem;
        }
        #sg-mode-panel .sg-mp-body { margin-top: 0.6rem; }
        #sg-mode-panel .sg-mp-row { margin-bottom: 0.45rem; }
        #sg-mode-panel .sg-mp-group {
          display: flex; flex-wrap: wrap; gap: 3px; margin-top: 0.2rem;
        }
        #sg-mode-panel .sg-mp-opt {
          font-family: inherit; font-size: 0.62rem; line-height: 1;
          letter-spacing: 0.04em;
          color: var(--ink-3);
          background: var(--paper);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 0.28rem 0.45rem;
          cursor: pointer;
        }
        #sg-mode-panel .sg-mp-opt:hover { color: var(--ink); border-color: var(--ink-3); }
        #sg-mode-panel .sg-mp-opt.active {
          color: var(--paper);
          background: var(--ink);
          border-color: var(--ink);
        }
        #sg-mode-panel .sg-mp-label {
          color: var(--ink-3);
          text-transform: uppercase; letter-spacing: 0.1em;
          font-size: 0.62rem;
        }
        #sg-mode-panel .sg-mp-select {
          background: var(--paper); color: var(--ink);
          border: 1px solid var(--rule);
          border-radius: 2px;
          padding: 0.2rem 0.3rem;
          font-family: inherit; font-size: inherit;
          width: 100%; cursor: pointer;
        }
        #sg-mode-panel .sg-mp-actions {
          display: flex; gap: 0.4rem; margin-top: 0.5rem;
          padding-top: 0.5rem; border-top: 1px solid var(--rule-mid);
        }
        #sg-mode-panel .sg-mp-btn {
          flex: 1; background: none; border: 1px solid var(--rule);
          color: var(--ink-2);
          padding: 0.3rem 0.4rem;
          font-family: inherit; font-size: 0.62rem;
          letter-spacing: 0.08em; text-transform: uppercase;
          cursor: pointer; border-radius: 2px;
          transition: all var(--t-fast, 120ms);
        }
        #sg-mode-panel .sg-mp-btn:hover { background: var(--paper-warm); color: var(--ink); }
        #sg-mode-panel .sg-mp-dump {
          margin-top: 0.5rem;
          background: var(--paper-warm); border: 1px solid var(--rule-mid);
          border-radius: 2px;
          padding: 0.4rem 0.5rem;
          font-size: 0.62rem; line-height: 1.5;
          color: var(--ink-2);
          white-space: pre-wrap; word-break: break-all;
          max-height: 8rem; overflow-y: auto;
        }
        @media (max-width: 640px) {
          #sg-mode-panel { top: auto; bottom: 0.5rem; right: 0.5rem; left: 0.5rem;
            max-width: none; }
        }
      </style>
      <div class="sg-mp-header">
        <span>Styleguide Mode</span>
        <button class="sg-mp-toggle" aria-label="Toggle panel">[ × ]</button>
      </div>
      <div class="sg-mp-body">
        ${Object.keys(AXES).map(axis => `
          <div class="sg-mp-row" data-axis-row="${axis}">
            <span class="sg-mp-label">${AXIS_LABELS[axis]}</span>
            <div class="sg-mp-group" role="radiogroup" aria-label="${AXIS_LABELS[axis]}">
              ${AXES[axis].map(v => `<button type="button" class="sg-mp-opt" data-axis="${axis}" data-val="${v}" aria-pressed="false">${shortLabel(axis, v)}</button>`).join('')}
            </div>
          </div>
        `).join('')}
        <div class="sg-mp-actions">
          <button class="sg-mp-btn" data-action="reset">Reset to direction</button>
          <button class="sg-mp-btn" data-action="dump">Dump tokens</button>
        </div>
        <pre class="sg-mp-dump" style="display:none"></pre>
      </div>
    `;
    document.body.appendChild(panel);

    // Light the switchboard for the initial state
    syncButtons(panel, initialState);

    // Wire up the switchboard (one delegate for every option button)
    panel.addEventListener('click', e => {
      const btn = e.target.closest('.sg-mp-opt');
      if (!btn) return;
      e.stopPropagation();
      onChange(btn.dataset.axis, btn.dataset.val);
    });

    // Toggle collapsed
    const header = panel.querySelector('.sg-mp-header');
    header.addEventListener('click', () => panel.classList.toggle('collapsed'));

    // Reset to direction defaults (clears user overrides for non-direction keys)
    panel.querySelector('[data-action="reset"]').addEventListener('click', e => {
      e.stopPropagation();
      onChange('__reset__');
    });

    // Dump tokens
    const dump = panel.querySelector('.sg-mp-dump');
    panel.querySelector('[data-action="dump"]').addEventListener('click', e => {
      e.stopPropagation();
      const visible = dump.style.display !== 'none';
      if (visible) { dump.style.display = 'none'; return; }
      dump.style.display = 'block';
      dump.textContent = buildTokensDump();
    });

    return panel;
  }

  /* ---------- Tokens dump (current resolved state as YAML-ish) ---------- */
  function buildTokensDump() {
    const cs = getComputedStyle(document.body);
    const ds = document.body.dataset;
    const lines = [
      `# styleguide mode @ ${new Date().toISOString().slice(0,16)}Z`,
      `direction: ${ds.direction || '(unset)'}`,
      `palette:   ${ds.palette   || '(unset)'}`,
      `pairing:   ${ds.pairing   || '(unset)'}`,
      `accent:    ${ds.accent    || '(unset)'}`,
      `mono:      ${ds.mono      || '(unset)'}`,
      `layout:    ${ds.layout    || '(unset)'}`,
      `mark:      ${ds.mark      || '(unset)'}`,
      ``,
      `tokens:`,
    ];
    const tokens = [
      '--paper', '--ink', '--ink-2', '--rule', '--rule-mid',
      '--teal', '--amber', '--red', '--rust', '--accent',
      '--type-display', '--type-body', '--type-eyebrow', '--type-mono',
      '--w-display', '--w-body',
    ];
    tokens.forEach(t => {
      const v = cs.getPropertyValue(t).trim();
      if (v) lines.push(`  ${t}: ${v}`);
    });
    return lines.join('\n');
  }

  /* ---------- Public init ---------- */
  function init(opts) {
    opts = opts || {};
    const direction = opts.direction || document.body.dataset.direction || 'β';
    let userSet = loadUserSet();
    let state = resolveState(direction, userSet);
    applyState(state);

    function update(axis, val) {
      if (axis === '__reset__') {
        userSet = {};
        saveUserSet(userSet);
        state = resolveState(direction, userSet);
      } else {
        userSet[axis] = val;
        saveUserSet(userSet);
        state[axis] = val;
        // If direction was changed, recompute defaults for unset axes
        if (axis === 'direction') {
          state = resolveState(val, userSet);
        }
      }
      applyState(state);
      // Light the switchboard to reflect current state
      syncButtons(panel, state);
      // Notify listeners
      document.dispatchEvent(new CustomEvent('sg:mode-change', { detail: state }));
    }

    const panel = buildPanel(state, update);

    // On narrow viewports the panel covers most of the page — start
    // collapsed so the reader sees the spec first. They can expand by
    // clicking the header. Listen for viewport changes so rotating
    // a phone or resizing a window doesn't strand the panel open
    // and obstructive at narrow widths.
    if (window.matchMedia) {
      const mq = window.matchMedia('(max-width: 640px)');
      const sync = () => {
        if (mq.matches) panel.classList.add('collapsed');
        else panel.classList.remove('collapsed');
      };
      sync();
      // addEventListener for modern browsers, addListener for older
      if (mq.addEventListener) mq.addEventListener('change', sync);
      else if (mq.addListener) mq.addListener(sync);
    }

    return { panel, getState: () => Object.assign({}, state), setAxis: update };
  }

  // Auto-init if data-styleguide-autoinit on body
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.hasAttribute('data-styleguide-autoinit')) {
      window.SG = init();
    }
  });

  // Expose globally for manual init
  window.StyleguideMode = { init, DIRECTION_DEFAULTS, AXES };
})();
