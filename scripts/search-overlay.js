// ============================================
// Search Overlay — Site-wide Command Palette (shell)
// ============================================
// Surface only: overlay DOM, open/close, focus management, keyboard
// shortcuts, nav triggers, hero search. The pipeline — chunks, intents,
// engines, generation — lives in scripts/search-core.js, which this shell
// lazy-loads on first open and drives through its element adapter.

(function () {
    'use strict';

    // Prevent double-init
    if (window.__searchOverlayInit) return;
    window.__searchOverlayInit = true;

    // ── State ──
    let overlayEl = null;
    let core = null;
    let popoverOpen = false;
    let previousFocus = null;

    function getBasePath() {
        const path = window.location.pathname;
        if (path.includes('/Assets/') || path.includes('/demos/')) return '../../';
        return './';
    }

    // ============================================
    // Overlay DOM Creation
    // ============================================
    function createOverlayDOM() {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const shortcut = isMac ? '⌘K' : 'Ctrl+K';

        const div = document.createElement('div');
        div.id = 'searchOverlay';
        div.className = 'search-overlay';
        div.setAttribute('aria-hidden', 'true');
        div.setAttribute('role', 'dialog');
        div.setAttribute('aria-modal', 'true');
        div.setAttribute('aria-label', 'Search');
        div.innerHTML = `
            <div class="search-overlay-backdrop"></div>
            <div class="search-overlay-panel">
                <!-- The command frame never scrolls — the bar IS the product.
                     Results scroll beneath it in .so-panel-scroll. -->
                <div class="so-command-frame">
                <!-- Search first — the bar is the point -->
                <div class="search-input-wrap">
                    <input type="text" id="so-searchInput" placeholder="Search, ask, or command..." autocomplete="off" aria-label="Search, ask, or command">
                    <button id="so-clearBtn" class="clear-btn" aria-label="Clear search">&times;</button>
                </div>
                <!-- The tier strip: the intelligence ladder, one legible line -->
                <div class="tier-strip-row">
                    <div class="pc-controls" id="so-pcControls"></div>
                    <div class="tier-strip" id="so-tierStrip" role="group" aria-label="Search intelligence tiers"></div>
                    <button class="engine-info-btn so-workspace-btn" id="so-workspaceBtn" aria-label="Workspace view" title="Workspace view">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    </button>
                    <button class="engine-info-btn" id="so-engineInfoBtn" aria-label="Engine details" title="Engine details">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                </div>
                <!-- Engine details — compact, opened from the strip's chevron -->
                <div class="engine-settings" id="so-engineSettings">
                    <div class="engine-settings-inner">
                        <div class="engine-status-row">
                            <span id="so-aiDot" class="status-dot off"></span>
                            <span id="so-engineModelLabel" class="engine-model-label"></span>
                            <span id="so-engineSourceBadge" class="engine-source-badge none"></span>
                            <label class="ai-toggle-label" id="so-aiToggleLabel">
                                <input type="checkbox" class="ai-toggle-checkbox" id="so-aiToggle" checked>
                                <span id="so-aiToggleText">on</span>
                            </label>
                        </div>
                        <div id="so-localModelSection" class="popover-section popover-section--compact" style="--section-color:var(--engine-lmstudio);">
                            <div class="popover-section-header">
                                <span class="popover-radio"></span>
                                <span class="popover-section-name" id="so-localModelName">Local model</span>
                                <span class="popover-section-badge badge-lmstudio" id="so-localModelSource"></span>
                                <button id="so-detectLocalBtn">Detect</button>
                            </div>
                            <div class="popover-section-detail" id="so-localModelDetail">LMStudio/Ollama · Detect asks your browser for local access</div>
                            <div class="local-picker" id="so-localPicker"></div>
                        </div>
                        <div id="so-browserModelSection" class="popover-section popover-section--compact" style="--section-color:var(--engine-browser);">
                            <div class="popover-section-header">
                                <span class="popover-radio"></span>
                                <span class="popover-section-name">LFM2.5</span>
                                <span class="popover-section-badge badge-webgpu" id="so-webgpuBadge"></span>
                                <button id="so-enableBtn">Load</button>
                            </div>
                            <div class="popover-section-detail" id="so-browserModelDetail">0.8B in-browser · WebGPU</div>
                            <div class="cache-hint" id="so-cacheHint"></div>
                            <div id="so-progress"></div>
                            <div id="so-progressBar"><div id="so-progressFill"></div></div>
                        </div>
                        <div id="so-customSection" class="popover-section popover-section--compact" style="--section-color:var(--engine-custom);">
                            <div class="popover-section-header">
                                <span class="popover-radio"></span>
                                <span class="popover-section-name">Custom endpoint</span>
                            </div>
                            <input type="text" class="custom-endpoint-input" id="so-customEndpoint"
                                   placeholder="http://localhost:8080/v1" spellcheck="false" aria-label="Custom endpoint URL">
                        </div>
                    </div>
                </div>
                </div><!-- /.so-command-frame -->
                <div class="so-panel-scroll">
                <!-- AI Answer (the elaboration seam) -->
                <div class="ai-answer-wrap">
                    <div id="so-aiAnswer"></div>
                    <div class="ai-actions" id="so-aiActions">
                        <button class="ai-action-btn" id="so-copyBtn" title="Copy answer" aria-label="Copy answer">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button class="ai-action-btn" id="so-shareBtn" title="Copy link to this query" aria-label="Copy link to this query">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        </button>
                    </div>
                </div>
                <!-- Results (the "Results" label row is gone — the postcard's
                     own byline carries the ⓘ; chrome must earn its lines) -->
                <div id="so-sourcesSection">
                    <!-- role=status: result re-renders are announced politely
                         (the postcard morph rewrites this subtree in place) -->
                    <div id="so-searchResults" role="status" aria-live="polite"></div>
                </div>
                <!-- Workspace detail pane (9d): on wide screens the ⤢ toggle
                     turns the panel into two panes — compact waterfall left,
                     whatever's pinned living here on the right -->
                <div id="so-detailPane"></div>
                <!-- Keyboard hint -->
                <div class="so-keyboard-hint">
                    <kbd>esc</kbd> close · <kbd>/</kbd> or <kbd>${shortcut}</kbd> search
                </div>
                </div><!-- /.so-panel-scroll -->
            </div>
        `;
        document.body.appendChild(div);
        return div;
    }

    // ============================================
    // Lazy Initialization
    // ============================================
    // The core script is fetched on first open, not on page load — pages pay
    // nothing for search until a visitor reaches for it. Version comes off
    // this script's own stamped tag so the core busts with the site version.
    async function loadCore() {
        if (window.JHSearchCore) return;
        const ownTag = document.querySelector('script[src*="search-overlay.js"]');
        const vM = ownTag && /[?&]v=([\w.]+)/.exec(ownTag.getAttribute('src') || '');
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = getBasePath() + 'scripts/search-core.js' + (vM ? '?v=' + vM[1] : '');
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function openSettings() {
        popoverOpen = true;
        document.getElementById('so-engineSettings').classList.add('open');
        document.getElementById('so-engineInfoBtn').classList.add('open');
    }
    function closeSettings() {
        popoverOpen = false;
        const settings = document.getElementById('so-engineSettings');
        if (settings) settings.classList.remove('open');
        const infoBtn = document.getElementById('so-engineInfoBtn');
        if (infoBtn) infoBtn.classList.remove('open');
    }

    // The SHELL is synchronous — pure DOM, no network — so the overlay can
    // appear the instant it is asked for. The design philosophy is "present
    // something instantly, then it gets smarter": awaiting the core (script
    // fetch + chunks + MiniSearch build) before revealing made the search
    // icon feel dead for the whole cold-cache load.
    function ensureShell() {
        if (overlayEl) return overlayEl;
        overlayEl = createOverlayDOM();
        // Shell-only wiring that must work BEFORE the core arrives: the
        // backdrop closes (Esc already works — the global keydown handler is
        // core-free). Everything else waits for wireShellEvents.
        overlayEl.querySelector('.search-overlay-backdrop').addEventListener('click', closeSearch);
        return overlayEl;
    }

    let initPromise = null;
    function ensureInitialized() {
        if (initPromise) return initPromise;
        ensureShell();
        // A failed core load (offline, server blip) must not poison the
        // promise forever — clear it so the NEXT open retries the fetch.
        initPromise = initCore().catch(err => { initPromise = null; throw err; });
        return initPromise;
    }
    async function initCore() {
        await loadCore();

        core = window.JHSearchCore.create({
            el: (name) => document.getElementById('so-' + name),
            root: overlayEl,
            sectionsRoot: overlayEl,
            logTag: '[SearchOverlay]',
            mutedColor: 'var(--so-muted)',
            onResultsChange: (has) => overlayEl.classList.toggle('has-results', has),
            onRequestSettingsOpen: openSettings,
            onCommandRun: () => closeSearch(),   // the effect is on the page — show it
            workspaceActive: () => overlayEl.classList.contains('so-workspace'),
        });
        await core.init();
        wireShellEvents();
        core.updateEngineBar();
        window.JHSearch = core;   // public handle (debugging, future tool-use tier)

        // Catch up: the shell was live while the core loaded — anything the
        // visitor already typed runs now, and an empty open gets its
        // suggestion chips. (Skip if they closed the overlay mid-load.)
        const inp = document.getElementById('so-searchInput');
        if (inp && isOverlayOpen()) {
            if (inp.value.trim()) core.runQuery(inp.value);
            else core.doSearchOnly('');
        }
    }

    // ============================================
    // Shell Event Wiring (overlay-only concerns)
    // ============================================
    // ═══ 9e addendum — the panel is only as tall as it needs to be ═══
    // Workspace mode pinned the panel to 88vh whatever it held, so a short
    // result set sat in a half-empty box.
    //
    // The obvious fix — height:auto — is a TRAP, and a quiet one. The detail
    // pane derives its strata count from its own clientHeight (search-core.js,
    // renderDetailPane), so auto-height makes that circular and it settles
    // shallow: measured across six queries it cost up to 55% of the pane's
    // content ("ai": 1358 chars -> 613) while looking perfectly fine on the
    // short queries that fit either way.
    //
    // So this is two passes, and the ORDER is the whole trick:
    //   1. before every render the inline height is cleared, so the core always
    //      measures against the full 88vh and allocates the same depth it
    //      always did;
    //   2. after the render settles, the panel shrinks to what was actually
    //      produced. Purely cosmetic, and gone again before the next render.
    // Shrinking never feeds back into allocation because allocation has already
    // happened and the next one starts from a cleared height.
    const PANEL_MIN = 260;
    // CONTENT high-water for the current query. Chrome is deliberately NOT in
    // it — see fitPanel.
    let fitTimer = null, fitObserver = null, contentFloor = 0;

    function panelEl() { return overlayEl && overlayEl.querySelector('.search-overlay-panel'); }
    function inWorkspace() { return overlayEl && overlayEl.classList.contains('so-workspace'); }

    // Pass 1. Called before the core can re-render, so it never measures a
    // panel we already shrank.
    function releasePanelHeight() {
        const panel = panelEl();
        if (panel) panel.style.height = '';
        contentFloor = 0;
    }

    // Pass 2. Content height is the TALLER column, because the grid rows are
    // sized by the tallest cell — measuring only the pane would clip the list.
    // Pass 2. GROW-TO-FIT, and the split between content and chrome is the
    // whole design:
    //
    //   contentFloor is a HIGH-WATER MARK, reset only by a new query. Content
    //   arrives late and in pieces — a streamed answer, a woken iframe, the
    //   semantic re-rank — and every one of those used to squeeze whatever was
    //   already on screen into a scrollbar, because the panel was pinned at the
    //   height measured before they landed. Measured: the answer arriving took
    //   the detail pane from 403px to 63px with 155px of overflow. Never
    //   shrinking within a query means late content can only ever push the
    //   panel out, never crush its neighbours. It also kills the jitter for
    //   free — a re-wrap that reflows a line shorter cannot pull the panel back
    //   in, so there is nothing left to oscillate.
    //
    //   CHROME is measured live every time and deliberately NOT conserved. It
    //   is the command frame, which doubles in height when the engine details
    //   disclosure opens (92px -> 342px measured). That is a deliberate act by
    //   the visitor, and the panel should give it room rather than take 250px
    //   out of the results — which is exactly what it did: pane 63px -> 4px,
    //   list 399px -> 149px, everything scrolling. Closing it hands the space
    //   straight back.
    function fitPanel() {
        const panel = panelEl();
        if (!panel || !inWorkspace()) return;
        const scroll = overlayEl.querySelector('.so-panel-scroll');
        const frame = overlayEl.querySelector('.so-command-frame');
        if (!scroll || !frame) return;
        const list = overlayEl.querySelector('#so-sourcesSection');
        const pane = overlayEl.querySelector('#so-detailPane');
        const ai = overlayEl.querySelector('.ai-answer-wrap');
        // scrollHeight is NO USE here: both columns are grid items stretched to
        // the row, so when their content is shorter than the box scrollHeight
        // just reports the stretched box back. Measure the real extent instead
        // — the furthest child bottom relative to the container top.
        const col = (e) => {
            if (!e || e.offsetParent === null) return 0;
            const top = e.getBoundingClientRect().top - e.scrollTop;
            let max = 0;
            for (const k of e.children) {
                const bottom = k.getBoundingClientRect().bottom - top;
                if (bottom > max) max = bottom;
            }
            const pad = parseFloat(getComputedStyle(e).paddingBottom || 0);
            return max ? Math.ceil(max + pad) : 0;
        };
        const right = col(pane) + col(ai);
        const content = Math.max(col(list), right);
        if (!content) { releasePanelHeight(); return; }
        const cs = getComputedStyle(scroll);
        const chrome = frame.getBoundingClientRect().height
                     + parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
        const cap = Math.round(window.innerHeight * 0.88);
        // whatever any column has ever needed this query, plus whatever the
        // chrome needs right now
        contentFloor = Math.max(contentFloor, content);
        // Fit to the CAP, not to content. The pane derives its line budget from
        // its own height while this sized the panel from the pane's content, so
        // the two settled each other into a short box with a mostly empty right
        // column. In workspace the pane is a READING surface and should get the
        // room; each column scrolls itself, so the disclosure still has somewhere
        // to go. contentFloor stays measured for the rAF correction below.
        const want = Math.max(PANEL_MIN, cap);
        if (Math.abs(want - panel.getBoundingClientRect().height) < 2) return;
        panel.style.height = want + 'px';
        // One self-correcting step rather than a magic slack constant: child
        // margins are outside the extent measurement, so if anything is still
        // clipped, hand back exactly that many pixels — and remember it, so the
        // correction survives into the floor instead of being re-derived.
        requestAnimationFrame(() => {
            const over = Math.max(
                (list && list.scrollHeight - list.clientHeight) || 0,
                (pane && pane.scrollHeight - pane.clientHeight) || 0);
            if (over <= 0) return;
            contentFloor += over + 2;
            panel.style.height = Math.round(Math.min(cap, contentFloor + chrome + 2)) + 'px';
        });
    }

    function schedulePanelFit() {
        clearTimeout(fitTimer);
        // 450ms clears the core's own post-wrap refit (a 350ms timeout), so we
        // measure the settled layout rather than an intermediate one.
        fitTimer = setTimeout(fitPanel, 450);
    }

    // Any mutation inside the results grid means a render happened. Cheaper and
    // more reliable than trying to hook every path in the core that can redraw.
    function watchForRenders() {
        if (fitObserver) return;
        const scroll = overlayEl.querySelector('.so-panel-scroll');
        if (!scroll || typeof MutationObserver === 'undefined') return;
        fitObserver = new MutationObserver(schedulePanelFit);
        fitObserver.observe(scroll, { childList: true, subtree: true, characterData: true });
        // The engine-details disclosure lives in the command FRAME, outside the
        // results grid, so a grid-only observer never saw it open.
        const frame = overlayEl.querySelector('.so-command-frame');
        if (frame && typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => schedulePanelFit()).observe(frame);
        }
        window.addEventListener('resize', () => { releasePanelHeight(); schedulePanelFit(); });
    }

    function wireShellEvents() {
        const searchInput = document.getElementById('so-searchInput');

        // Typing invalidates the fitted height BEFORE the core re-renders, so
        // allocation always starts from the full panel (see pass 1 above).
        searchInput.addEventListener('input', () => { releasePanelHeight(); schedulePanelFit(); });
        watchForRenders();

        // (Backdrop click → close is wired in ensureShell — it must work
        // before the core arrives.)

        // Escape inside the input → close overlay. The CORE's Esc ladder
        // (cursor → pin → query) registered first and consumes its rungs via
        // stopImmediatePropagation — this handler is only reached when there
        // is nothing left to unwind, so Esc closes. (Enter is the core's.)
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
        });

        // Focus search input → close engine settings if open
        searchInput.addEventListener('focus', () => {
            if (popoverOpen) closeSettings();
        });

        // Engine settings toggle (inline expanding)
        document.getElementById('so-engineInfoBtn').addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            if (popoverOpen) closeSettings(); else openSettings();
        });

        // Workspace toggle (9d): two-pane view on wide screens, persisted.
        const wsBtn = document.getElementById('so-workspaceBtn');
        wsBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const on = overlayEl.classList.toggle('so-workspace');
            releasePanelHeight();
            if (on) schedulePanelFit();
            wsBtn.classList.toggle('open', on);
            try { localStorage.setItem('jh-search-workspace', on ? '1' : ''); } catch {}
            core.renderCurrent();   // re-lay the surface for the new geometry
            searchInput.focus();
        });
        try {
            if (localStorage.getItem('jh-search-workspace') === '1') {
                overlayEl.classList.add('so-workspace');
                wsBtn.classList.add('open');
            }
        } catch {}
    }

    // ============================================
    // Open / Close
    // ============================================
    async function openSearch(initialQuery) {
        // Reveal FIRST, load underneath. The shell is pure DOM: the panel
        // appears and the input takes focus in the same frame as the click,
        // whatever the network is doing. The core arrives async and catches
        // up on anything typed meanwhile (see initCore) — the surface is
        // instant, then it gets smarter. Awaiting init here made the search
        // icon feel dead for the whole cold-cache core load.
        const hadCore = !!core;
        ensureShell();

        previousFocus = document.activeElement;

        // Detect which nav is visible and position panel below it
        const fixedNav = document.getElementById('nav');
        const heroShapeNav = document.querySelector('.hero > nav.shape-nav');
        let navBottom = 44; // fallback: fixed nav height

        if (fixedNav && fixedNav.classList.contains('visible')) {
            navBottom = fixedNav.getBoundingClientRect().bottom;
        } else if (heroShapeNav) {
            navBottom = heroShapeNav.getBoundingClientRect().bottom;
        }

        overlayEl.style.setProperty('--nav-bottom', navBottom + 'px');
        overlayEl.classList.add('search-overlay--from-nav');

        // Ensure overlay starts hidden, force reflow, then reveal — prevents same-frame transition bug
        overlayEl.setAttribute('aria-hidden', 'true');
        void overlayEl.offsetHeight; // force style recalc
        overlayEl.setAttribute('aria-hidden', 'false');
        document.body.classList.add('search-overlay-open');

        const input = document.getElementById('so-searchInput');
        if (typeof initialQuery === 'string' && initialQuery.trim()) input.value = initialQuery;
        // Focus after transition — before the core exists, the focused input
        // IS the instant surface
        requestAnimationFrame(() => { input.focus(); });

        // A failed load leaves the shell open and typeable — the visitor loses
        // the smarts, not the surface; the next open retries the fetch.
        try { await ensureInitialized(); } catch { return; }
        if (!core) return;

        // First open is when engines get looked at. WebGPU and the model cache
        // are checked either way (neither prompts); localhost is only probed
        // for a visitor who has opted in before. Not awaited — the panel fills
        // itself in as answers arrive, and BM25 needs none of it.
        if (!core.enginesChecked) {
            core.checkEngines({ probeLocal: core.localOptedIn() });
        }

        // On the FIRST open initCore's catch-up already ran the query (or the
        // suggestion chips); only a re-open with a core in hand drives it here.
        if (hadCore) {
            if (typeof initialQuery === 'string' && initialQuery.trim()) {
                setTimeout(() => { core.runQuery(initialQuery); }, 50);
            } else if (!input.value.trim()) {
                core.doSearchOnly('');   // renders the try-these suggestion chips
            }
        }
    }

    // aria-modal: Tab cycles inside the dialog instead of wandering the page
    // behind it. Selector picks up focusables in both panes; bound once.
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    function trapTab(e) {
        if (e.key !== 'Tab' || !overlayEl || overlayEl.getAttribute('aria-hidden') !== 'false') return;
        const focusables = [...overlayEl.querySelectorAll(FOCUSABLE)]
            .filter(el => el.offsetParent !== null || el === document.activeElement);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function closeSearch() {
        if (!overlayEl) return;
        // A hidden overlay must not keep a live demo running behind it
        if (core && core.sleepPieces) core.sleepPieces();
        // Trigger close animation
        overlayEl.setAttribute('aria-hidden', 'true');
        closeSettings();
        renderResidue();   // 10g: the sentence re-reads — a new generation shows
        // Blur the overlay's own input so it doesn't hold focus while hidden
        const overlayInput = document.getElementById('so-searchInput');
        if (overlayInput) overlayInput.blur();
        // Restore focus — but not to hero search input (would block '/' shortcut)
        if (previousFocus && previousFocus.focus) {
            if (previousFocus.classList.contains('hero-search-input')) {
                previousFocus = null;
            } else {
                previousFocus.focus();
                previousFocus = null;
            }
        }
        // Delay cleanup so close animation plays
        setTimeout(() => {
            document.body.classList.remove('search-overlay-open');
            if (overlayEl) {
                overlayEl.classList.remove('search-overlay--from-nav');
                overlayEl.classList.remove('has-results');
            }
        }, 300);
    }

    function isOverlayOpen() {
        return overlayEl && overlayEl.getAttribute('aria-hidden') === 'false';
    }

    // ============================================
    // Global Keyboard Shortcuts
    // ============================================
    document.addEventListener('keydown', (e) => {
        // ⌘K / Ctrl+K → toggle
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            if (isOverlayOpen()) closeSearch();
            else openSearch();
            return;
        }

        // Escape → close
        if (e.key === 'Escape' && isOverlayOpen()) {
            e.preventDefault();
            closeSearch();
            return;
        }

        // Tab → cycle within the modal dialog
        trapTab(e);

        // / → open (when not in input/textarea)
        if (e.key === '/' && !isOverlayOpen()) {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
            e.preventDefault();
            openSearch();
        }
    });

    // ============================================
    // Nav Trigger Setup
    // ============================================
    function setupNavTriggers() {
        // Delegated, because <jh-nav> renders its search link AFTER this script runs
        // (jh-chrome.js is a later deferred script). Per-link listeners bound at init
        // only ever caught the hero's hand-written nav, so once the hero scrolled away
        // the sticky nav fell through to search.html instead of opening the overlay.
        document.addEventListener('click', (e) => {
            const link = e.target.closest && e.target.closest('a[data-search-trigger], a[href="search.html"], a[href="./search.html"]');
            if (!link) return;
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            if (link.target && link.target !== '_self') return;

            // Only intercept the magnifying-glass shape link (circle + line), never a
            // prose link that happens to point at the search page.
            const svg = link.querySelector('svg');
            if (!link.hasAttribute('data-search-trigger')) {
                if (!svg || !svg.querySelector('circle') || !svg.querySelector('line')) return;
            }

            e.preventDefault();
            openSearch();
        });
    }

    // ============================================
    // Hero Search Input (index.html)
    // ============================================
    function setupHeroSearch() {
        const heroInput = document.querySelector('.hero-search-input');
        if (!heroInput) return;

        // Guard: don't trigger on page-load auto-focus (Chrome may restore focus state)
        let ready = false;
        requestAnimationFrame(() => { setTimeout(() => { ready = true; }, 100); });

        heroInput.addEventListener('focus', () => {
            if (!ready) { heroInput.blur(); return; }
            const val = heroInput.value.trim();
            openSearch(val || undefined);
            heroInput.blur();
        });
        heroInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                openSearch(heroInput.value.trim() || undefined);
                heroInput.blur();
            }
        });
    }

    // ============================================
    // URL ?q= param auto-open
    // ============================================
    function checkUrlQuery() {
        const urlParams = new URLSearchParams(window.location.search);
        const q = urlParams.get('q');
        if (q) {
            openSearch(q);
        }
    }

    // ============================================
    // The residue sentence (10g): the session's standing chrome. After any
    // search, ONE line docks at the bottom of every page — question and the
    // answer's first clause — until the 30-min TTL, ✕, or a new search.
    // Click anywhere on it: the overlay reopens RESTORED. Feather-weight:
    // one storage read, no core load.
    // ============================================
    function escResidue(t) {
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }
    function renderResidue() {
        document.querySelectorAll('.so-residue').forEach(n => n.remove());
        let s = null;
        try { s = JSON.parse(sessionStorage.getItem('jh-search-session') || 'null'); } catch { return; }
        if (!s || !s.query || Date.now() - (s.ts || 0) > 30 * 60 * 1000) return;
        try { if (sessionStorage.getItem('jh-residue-dismissed') === '1') return; } catch {}
        const q = escResidue(String(s.query).slice(0, 60));
        const a = escResidue(String(s.residue || '').slice(0, 110));
        const strip = document.createElement('div');
        strip.className = 'so-residue';
        // ✕ exists ONLY when there's no kept answer — a bare query tease may
        // be dismissed; a kept answer stands until TTL or a new search (John,
        // 2026-08-27)
        const x = s.answer ? '' : `<button class="so-residue-x" type="button" aria-label="Dismiss">×</button>`;
        strip.innerHTML = `<button class="so-residue-open" type="button" aria-label="Reopen your last search">◂ <span class="so-residue-q">\u201c${q}\u201d</span>${a ? ` <span class="so-residue-sep">\u2192</span> <span class="so-residue-a">${a}</span>` : ''}<span class="so-residue-cta">reopen</span></button>${x}`;
        document.body.appendChild(strip);
        strip.querySelector('.so-residue-open').addEventListener('click', async () => {
            strip.remove();
            await openSearch();          // ensures the core is initialized
            if (core) core.restoreSession();
        });
        if (x) strip.querySelector('.so-residue-x').addEventListener('click', () => {
            try { sessionStorage.setItem('jh-residue-dismissed', '1'); } catch {}
            strip.remove();
        });
    }

    // ============================================
    // Init on DOM ready
    // ============================================
    function init() {
        try { document.documentElement.dataset.pcDensity = localStorage.getItem('jh-postcard-density') || 'compact'; } catch {}
        setupNavTriggers();
        setupHeroSearch();
        checkUrlQuery();
        renderResidue();
        // Deliberately no engine detection here. It used to run on every page
        // load "for the nav indicator", which meant a visitor was asked for
        // permission to reach their own machine before they had asked the site
        // for anything. Detection now happens when the overlay is opened, and
        // the localhost half of it only on request — see search-core.js.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose globally
    window.openSearch = openSearch;
    window.closeSearch = closeSearch;
})();
