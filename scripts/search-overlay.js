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
    let initialized = false;
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
                        </div>
                        <div id="so-browserModelSection" class="popover-section popover-section--compact" style="--section-color:var(--engine-browser);">
                            <div class="popover-section-header">
                                <span class="popover-radio"></span>
                                <span class="popover-section-name">Qwen 3.5</span>
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

    async function ensureInitialized() {
        if (initialized) return;
        initialized = true;

        overlayEl = createOverlayDOM();
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
    }

    // ============================================
    // Shell Event Wiring (overlay-only concerns)
    // ============================================
    function wireShellEvents() {
        const searchInput = document.getElementById('so-searchInput');

        // Backdrop click → close
        overlayEl.querySelector('.search-overlay-backdrop').addEventListener('click', closeSearch);

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
        await ensureInitialized();

        // First open is when engines get looked at. WebGPU and the model cache
        // are checked either way (neither prompts); localhost is only probed
        // for a visitor who has opted in before. Not awaited — the panel fills
        // itself in as answers arrive, and BM25 needs none of it.
        if (!core.enginesChecked) {
            core.checkEngines({ probeLocal: core.localOptedIn() });
        }

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
        if (typeof initialQuery === 'string' && initialQuery.trim()) {
            input.value = initialQuery;
            setTimeout(() => { core.runQuery(initialQuery); }, 50);
        } else if (!input.value.trim()) {
            core.doSearchOnly('');   // renders the try-these suggestion chips
        }
        // Focus after transition
        requestAnimationFrame(() => { input.focus(); });
    }

    // aria-modal: Tab cycles inside the dialog instead of wandering the page
    // behind it. Selector picks up focusables in both panes; bound once.
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    function trapTab(e) {
        if (e.key !== 'Tab' || overlayEl.getAttribute('aria-hidden') !== 'false') return;
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
        strip.innerHTML = `<button class="so-residue-open" type="button" aria-label="Reopen your last search">◂ <span class="so-residue-q">\u201c${q}\u201d</span>${a ? ` <span class="so-residue-sep">\u2192</span> <span class="so-residue-a">${a}</span>` : ''}<span class="so-residue-cta">reopen</span></button>`
            + `<button class="so-residue-x" type="button" aria-label="Dismiss">×</button>`;
        document.body.appendChild(strip);
        strip.querySelector('.so-residue-open').addEventListener('click', async () => {
            strip.remove();
            await openSearch();          // ensures the core is initialized
            core.restoreSession();
        });
        strip.querySelector('.so-residue-x').addEventListener('click', () => {
            try { sessionStorage.setItem('jh-residue-dismissed', '1'); } catch {}
            strip.remove();
        });
    }

    // ============================================
    // Init on DOM ready
    // ============================================
    function init() {
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
