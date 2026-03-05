// ============================================
// Search Overlay — Site-wide Command Palette
// ES module — self-initializing, creates overlay DOM
// ============================================

(function () {
    'use strict';

    // Prevent double-init
    if (window.__searchOverlayInit) return;
    window.__searchOverlayInit = true;

    // ── State ──
    let initialized = false;
    let overlayEl = null;
    let chunks = [];
    let miniSearchInstance = null;
    let activeEngine = null; // 'local' | 'browser' | 'custom' | null
    let aiEnabled = true;
    let localModel = null;
    let customModel = null;
    let processor = null, llmModel = null, modelReady = false;
    let currentGenId = 0, isGenerating = false, pendingGen = null;
    let searchDebounce, aiDebounce, lastSearchResults = [], lastLlmQuery = '';
    let popoverOpen = false;
    let hasWebGPU = false;
    let modelIsCached = false;
    let previousFocus = null;
    const MODEL_ID = "onnx-community/Qwen3.5-0.8B-ONNX";
    const MODEL_DISPLAY_NAME = "Qwen 3.5";
    const RESULTS_PER_PAGE = 5;

    // Transformers.js imports (lazy)
    let AutoProcessor, Qwen3_5ForConditionalGeneration, TextStreamer;

    // ============================================
    // Query Intent Mapping
    // ============================================
    const QUERY_INTENTS = [
        { patterns: [/should\s+\w*\s*(hire|work\s+with|contract|engage)/i, /is\s+he\s+(good|qualified|worth|a\s+good\s+fit)/i, /why\s+\w*\s*(hire|choose|pick)\s+him/i, /what\s+makes\s+him\s+(stand\s+out|different|unique|special)/i, /why\s+should\s+\w+\s+hire/i], expanded: 'unique differentiator skills expertise experience awards shipped products design AI leadership', hint: 'Showing expertise, awards, and what makes him unique' },
        { patterns: [/what('s|\s+is)\s+his\s+background/i, /tell\s+me\s+about\s+(him|john|this\s+(guy|person))/i, /who\s+is\s+(he|john|this)/i, /what\s+does\s+he\s+do$/i, /^about$/i], expanded: 'about john hanacek innovator designer creator education career work history unique san diego', hint: 'Showing background and career overview' },
        { patterns: [/what\s+has\s+he\s+(built|made|created|shipped|designed|launched|delivered)/i, /his\s+(projects|portfolio|work)/i, /show\s+me\s+his\s+work/i, /what\s+are\s+his\s+projects/i, /shipped\s+(any|AI|products?)/i, /has\s+he\s+shipped/i], expanded: 'shipped AI products nanome badvr avatarmedic holotriage metamedium coaching built', hint: 'Showing shipped products and projects' },
        { patterns: [/what\s+are\s+his\s+(skills|abilities|strengths)/i, /what\s+can\s+he\s+do/i, /his\s+(expertise|capabilities|specialties)/i, /areas\s+of\s+expertise/i], expanded: 'expertise skills AI XR robotics design product LLM agent spatial computing coding engineering', hint: 'Showing skills and areas of expertise' },
        { patterns: [/can\s+he\s+(code|program|write\s+code|develop|build|engineer)/i, /does\s+he\s+(code|program|write\s+code|develop|build)/i, /is\s+he\s+(technical|a\s+developer|an\s+engineer)/i, /coding|programming|technical\s+skills/i, /just\s+design/i], expanded: 'code coding programming engineer technical javascript html css python unity build ship prototype design engineering', hint: 'Showing design engineering and coding ability' },
        { patterns: [/where\s+did\s+he\s+(go\s+to\s+school|study|graduate)/i, /his\s+education/i, /degree|university|college|school/i], expanded: 'education masters thesis Georgetown UCSD research publications', hint: 'Showing education and research' },
        { patterns: [/has\s+he\s+won\s+(any|an)\s+(award|prize)/i, /awards?|recognition|achievement|accomplishment/i, /what\s+has\s+he\s+(won|achieved|accomplished)/i, /biggest\s+(accomplishment|achievement)/i], expanded: 'awards innovation aerospace nist microsoft founder institute accomplishment achievement won', hint: 'Showing awards and recognition' },
        { patterns: [/how\s+(do\s+i|can\s+i|to)\s+(contact|reach|email|message)\s+(him|john)/i, /contact|email|linkedin|twitter|social/i], expanded: 'contact email linkedin bluesky twitter social', hint: 'Showing contact information' },
        { patterns: [/what\s+does\s+he\s+(charge|cost)|pricing|rates?|how\s+much/i, /services?|consulting|coaching|freelance/i, /can\s+he\s+help\s+(me|us|with)/i], expanded: 'services coaching consulting design product workshops retainer sprint', hint: 'Showing services and engagement options' },
        { patterns: [/has\s+he\s+(led|managed|run)\s+(teams?|people|a\s+company)/i, /leadership|management|team\s+lead/i, /manage\s+(people|teams?|reports)/i], expanded: 'leadership team managed led CEO founder cross-functional collaboration hire people', hint: 'Showing leadership and team experience' },
        { patterns: [/his\s+(design\s+)?process/i, /how\s+does\s+he\s+(work|design|approach)/i, /methodology|workflow/i], expanded: 'process methodology design thinking research prototype iterate user-centered approach', hint: 'Showing design process and methodology' },
        { patterns: [/where\s+(does\s+he|is\s+he)\s+(live|based|located)/i, /location|city|state|san\s+diego/i, /where\s+is\s+(he|john)/i], expanded: 'san diego california location lifestyle UCSD native plants gardening outdoors', hint: 'Showing location and lifestyle' },
        { patterns: [/hobbies|hobby|personal|interests|outside\s+work|free\s+time|fun|for\s+fun/i, /what\s+does\s+he\s+(like|enjoy|do\s+for\s+fun)/i, /besides\s+work/i, /personal\s+(life|interests)/i], expanded: 'personal hobby cooking gardening native plants hiking camping photography food san diego outdoors', hint: 'Showing personal interests and hobbies' },
        { patterns: [/cook(ing|s)?|food|recipe|chef|kitchen/i], expanded: 'cooking food personal hobby recipe albondigas tahdig pasta fish brownie', hint: 'Showing cooking interests' },
        { patterns: [/garden(ing|s)?|plant(s|ing)?|native|nature|outdoor(s)?|hik(e|ing)|camp(ing)?/i], expanded: 'gardening native plants california outdoors hiking camping san diego nature', hint: 'Showing outdoor interests' },
        { patterns: [/XR|VR|AR|spatial|immersive|mixed\s+reality|virtual\s+reality/i], expanded: null, hint: null },
        { patterns: [/AI|machine\s+learning|LLM|agent|artificial\s+intelligence/i], expanded: null, hint: null },
    ];

    function expandQuery(rawQuery) {
        const trimmed = rawQuery.trim();
        if (!trimmed) return { query: trimmed, hint: null };
        for (const intent of QUERY_INTENTS) {
            for (const pattern of intent.patterns) {
                if (pattern.test(trimmed)) {
                    if (intent.expanded) return { query: intent.expanded, hint: intent.hint, originalQuery: trimmed };
                    return { query: trimmed, hint: intent.hint };
                }
            }
        }
        let resolved = trimmed.replace(/\b(him|he|his)\b/gi, 'John Hanacek');
        if (resolved !== trimmed) return { query: resolved, hint: null };
        return { query: trimmed, hint: null };
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
        div.setAttribute('aria-label', 'Search');
        div.innerHTML = `
            <div class="search-overlay-backdrop"></div>
            <div class="search-overlay-panel">
                <!-- Engine bar — compact status line -->
                <div class="engine-bar">
                    <span id="so-aiDot" class="status-dot off"></span>
                    <span id="so-engineModelLabel" class="engine-model-label"></span>
                    <span id="so-engineSourceBadge" class="engine-source-badge none"></span>
                    <button class="engine-bar-load-btn" id="so-engineBarLoadBtn" style="display:none;">Load AI</button>
                    <button class="engine-info-btn" id="so-engineInfoBtn" aria-label="Engine settings">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                </div>
                <!-- Engine settings — inline expanding section -->
                <div class="engine-settings" id="so-engineSettings">
                    <div class="engine-settings-inner">
                        <div class="engine-section-label">Search Pipeline</div>
                        <div class="popover-section popover-section--bm25">
                            <div class="popover-section-header">
                                <span class="popover-radio bm25-always-on"></span>
                                <span class="popover-section-name">Keyword Search</span>
                                <span class="popover-section-badge badge-bm25">BM25</span>
                            </div>
                            <div class="popover-section-detail">Always on — instant results</div>
                        </div>
                        <div class="ai-toggle-row">
                            <span class="engine-section-label">AI Answer</span>
                            <label class="ai-toggle-label" id="so-aiToggleLabel">
                                <input type="checkbox" class="ai-toggle-checkbox" id="so-aiToggle" checked>
                                <span id="so-aiToggleText">on</span>
                            </label>
                        </div>
                        <div id="so-localModelSection" class="popover-section" style="--section-color:var(--engine-lmstudio);">
                            <div class="popover-section-header">
                                <span class="popover-radio"></span>
                                <span class="popover-section-name" id="so-localModelName">Local Model</span>
                                <span class="popover-section-badge badge-lmstudio" id="so-localModelSource"></span>
                            </div>
                            <div class="popover-section-detail" id="so-localModelDetail">LMStudio or Ollama on localhost</div>
                            <button id="so-detectLocalBtn">Detect</button>
                        </div>
                        <div id="so-browserModelSection" class="popover-section" style="--section-color:var(--engine-browser);">
                            <div class="popover-section-header">
                                <span class="popover-radio"></span>
                                <span class="popover-section-name">Qwen 3.5</span>
                                <span class="popover-section-badge badge-browser">In-Browser</span>
                                <span class="popover-section-badge badge-webgpu" id="so-webgpuBadge"></span>
                            </div>
                            <div class="popover-section-detail" id="so-browserModelDetail">WebGPU inference · 0.8B params</div>
                            <button id="so-enableBtn">Load Model</button>
                            <div class="cache-hint" id="so-cacheHint"></div>
                            <div id="so-progress"></div>
                            <div id="so-progressBar"><div id="so-progressFill"></div></div>
                        </div>
                        <div id="so-customSection" class="popover-section" style="--section-color:var(--engine-custom);">
                            <div class="popover-section-header">
                                <span class="popover-radio"></span>
                                <span class="popover-section-name">Custom Endpoint</span>
                            </div>
                            <input type="text" class="custom-endpoint-input" id="so-customEndpoint"
                                   placeholder="http://localhost:8080/v1" spellcheck="false">
                        </div>
                    </div>
                </div>
                <!-- Search input -->
                <div class="search-input-wrap">
                    <input type="text" id="so-searchInput" placeholder="Search portfolio or ask a question..." autocomplete="off">
                    <button id="so-clearBtn" class="clear-btn" aria-label="Clear search">&times;</button>
                </div>
                <!-- AI Answer -->
                <div class="ai-answer-wrap">
                    <div id="so-aiAnswer"></div>
                    <div class="ai-actions" id="so-aiActions">
                        <button class="ai-action-btn" id="so-copyBtn" title="Copy answer">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button class="ai-action-btn" id="so-shareBtn" title="Copy link to this query">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        </button>
                    </div>
                </div>
                <!-- Sources -->
                <div id="so-sourcesSection">
                    <div class="section-label">
                        Sources
                        <span class="score-info">ⓘ<span class="score-tooltip">BM25 keyword relevance: title 3×, tags 2×, content 1× with fuzzy matching.</span></span>
                    </div>
                    <div id="so-searchResults"></div>
                </div>
                <!-- Keyboard hint -->
                <div class="so-keyboard-hint">
                    <kbd>esc</kbd> close · <kbd>/</kbd> or <kbd>${shortcut}</kbd> search
                </div>
            </div>
        `;
        document.body.appendChild(div);
        return div;
    }

    // ============================================
    // Lazy Initialization
    // ============================================
    async function ensureInitialized() {
        if (initialized) return;
        initialized = true;

        overlayEl = createOverlayDOM();

        // Load MiniSearch dynamically
        if (typeof MiniSearch === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/minisearch@7.1.1/dist/umd/index.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        // Init MiniSearch
        miniSearchInstance = new MiniSearch({
            fields: ['title', 'content', 'tags'],
            storeFields: ['title', 'content', 'page', 'image'],
            searchOptions: { boost: { title: 3, tags: 2 }, fuzzy: 0.2, prefix: true }
        });

        // Load search chunks
        try {
            const response = await fetch(getBasePath() + 'Assets/search-chunks.json');
            const data = await response.json();
            chunks = data.chunks;
            miniSearchInstance.addAll(chunks);
            console.log(`[SearchOverlay] Loaded ${chunks.length} chunks`);
        } catch (err) {
            console.error('[SearchOverlay] Failed to load search index:', err);
        }

        // Wire up overlay events
        wireOverlayEvents();

        // Check engines (non-blocking)
        checkEnginesAsync();
    }

    function getBasePath() {
        // Determine base path relative to current page
        const path = window.location.pathname;
        if (path.includes('/Assets/') || path.includes('/demos/')) {
            return '../../';
        }
        return './';
    }

    // ============================================
    // Engine Management
    // ============================================
    function getEngineColor(engine) {
        if (engine === 'local' && localModel) {
            return localModel.source === 'Ollama' ? 'var(--engine-ollama)' : 'var(--engine-lmstudio)';
        }
        if (engine === 'browser') return 'var(--engine-browser)';
        if (engine === 'custom') return 'var(--engine-custom)';
        return 'var(--so-muted)';
    }

    function $(id) { return document.getElementById(id); }

    function updateEngineBar() {
        const dot = $('so-aiDot');
        const label = $('so-engineModelLabel');
        const badge = $('so-engineSourceBadge');
        const loadBtn = $('so-engineBarLoadBtn');
        if (!dot || !label || !badge) return;
        const root = overlayEl;

        // Clear active states
        overlayEl.querySelectorAll('.popover-section').forEach(s => s.classList.remove('active'));

        const color = getEngineColor(activeEngine);
        root.style.setProperty('--engine-color', color);

        if (localModel) {
            const localColor = localModel.source === 'Ollama' ? 'var(--engine-ollama)' : 'var(--engine-lmstudio)';
            $('so-localModelSection').style.setProperty('--section-color', localColor);
        }

        // Reset CTA and badge visibility
        if (loadBtn) loadBtn.style.display = 'none';
        badge.style.display = '';

        if (!aiEnabled) {
            label.textContent = 'AI off';
            badge.textContent = '';
            badge.className = 'engine-source-badge none';
            dot.className = 'status-dot off';
            root.style.setProperty('--engine-color', 'var(--so-muted)');
            return;
        }

        if (activeEngine === 'local' && localModel) {
            const shortName = localModel.name.split('/').pop();
            label.textContent = shortName;
            badge.textContent = localModel.source;
            badge.className = 'engine-source-badge ' + localModel.source.toLowerCase();
            dot.className = 'status-dot ready';
            $('so-localModelSection').classList.add('active');
        } else if (activeEngine === 'browser' && modelReady) {
            label.textContent = MODEL_DISPLAY_NAME;
            badge.textContent = 'In-Browser';
            badge.className = 'engine-source-badge browser';
            dot.className = 'status-dot ready';
            $('so-browserModelSection').classList.add('active');
        } else if (activeEngine === 'custom' && customModel) {
            const shortName = customModel.name.split('/').pop();
            label.textContent = shortName;
            badge.textContent = 'Custom';
            badge.className = 'engine-source-badge custom';
            dot.className = 'status-dot ready';
            $('so-customSection').classList.add('active');
        } else {
            // No active engine — show CTA if WebGPU available
            if (hasWebGPU && !modelReady) {
                label.textContent = '';
                badge.textContent = ''; badge.style.display = 'none';
                dot.className = 'status-dot off';
                if (loadBtn) {
                    loadBtn.style.display = 'inline-block';
                    loadBtn.textContent = modelIsCached ? 'Load ' + MODEL_DISPLAY_NAME + ' ⚡' : 'Load ' + MODEL_DISPLAY_NAME;
                    if (modelIsCached) loadBtn.classList.add('cached');
                    else loadBtn.classList.remove('cached');
                }
            } else {
                label.textContent = 'Search only';
                badge.textContent = '';
                badge.className = 'engine-source-badge none';
                dot.className = 'status-dot off';
            }
        }
    }

    function setActiveEngine(engine) {
        activeEngine = engine;
        if (engine) aiEnabled = true;
        updateEngineBar();
        localStorage.setItem('searchActiveEngine', engine || '');
    }

    async function checkEnginesAsync() {
        // WebGPU
        const webgpuBadge = $('so-webgpuBadge');
        if (navigator.gpu) {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                hasWebGPU = true;
                if (webgpuBadge) { webgpuBadge.textContent = 'WebGPU'; webgpuBadge.className = 'popover-section-badge badge-webgpu'; }
            } else {
                if (webgpuBadge) { webgpuBadge.textContent = 'No adapter'; }
            }
        } else {
            if (webgpuBadge) { webgpuBadge.textContent = 'No WebGPU'; }
        }

        if (!hasWebGPU) {
            const btn = $('so-enableBtn');
            if (btn) { btn.textContent = 'WebGPU unavailable'; btn.disabled = true; }
        } else {
            modelIsCached = await checkModelCache();
            const btn = $('so-enableBtn');
            const cacheHint = $('so-cacheHint');
            if (modelIsCached) {
                if (btn) { btn.textContent = 'Load ' + MODEL_DISPLAY_NAME; btn.classList.add('cached'); }
                if (cacheHint) cacheHint.textContent = 'Cached — loads in seconds';
            } else {
                if (btn) btn.textContent = 'Download ' + MODEL_DISPLAY_NAME + ' (~700 MB)';
                if (cacheHint) cacheHint.textContent = '';
            }
        }

        // Local models — auto-detect LMStudio/Ollama on localhost
        localModel = await checkLocalModels();
        if (localModel) {
            console.log(`[SearchOverlay] Local model: ${localModel.name} via ${localModel.source}`);
            $('so-localModelSection').classList.add('detected');
            $('so-localModelName').textContent = localModel.name.split('/').pop();
            $('so-localModelSource').textContent = localModel.source;
            $('so-localModelSource').className = 'popover-section-badge badge-' + localModel.source.toLowerCase();
            $('so-localModelDetail').textContent = localModel.host;
            const detectBtn = $('so-detectLocalBtn');
            if (detectBtn) { detectBtn.textContent = '✓ Connected'; detectBtn.classList.add('model-active'); detectBtn.disabled = true; }
            setActiveEngine('local');
        } else {
            // Show section but as unconnected — user can click Detect to retry
            $('so-localModelSection').classList.add('detected');
        }

        // Custom endpoint from localStorage
        const savedEndpoint = localStorage.getItem('searchCustomEndpoint') || '';
        if (savedEndpoint) {
            $('so-customEndpoint').value = savedEndpoint;
            if (!localModel) {
                customModel = await probeCustomEndpoint(savedEndpoint);
                if (customModel) setActiveEngine('custom');
            }
        }

        if (!activeEngine) updateEngineBar();
    }

    async function checkModelCache() {
        try {
            const names = await caches.keys();
            for (const name of names) {
                const cache = await caches.open(name);
                const keys = await cache.keys();
                if (keys.filter(r => r.url.includes('Qwen3.5-0.8B-ONNX')).length >= 3) return true;
            }
            return false;
        } catch { return false; }
    }

    async function checkLocalModels() {
        try {
            const res = await fetch('http://localhost:1234/v1/models', { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
                const data = await res.json();
                if (data.data?.length > 0) {
                    const m = data.data[0];
                    return { name: m.id || 'Unknown', source: 'LMStudio', endpoint: 'http://localhost:1234/v1/chat/completions', host: 'localhost:1234' };
                }
            }
        } catch {}
        try {
            const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
                const data = await res.json();
                if (data.models?.length > 0) {
                    const m = data.models[0];
                    return { name: m.name || 'Unknown', source: 'Ollama', endpoint: 'http://localhost:11434/api/chat', host: 'localhost:11434' };
                }
            }
        } catch {}
        return null;
    }

    async function probeCustomEndpoint(url) {
        try {
            const base = url.replace(/\/+$/, '');
            const modelsUrl = base.endsWith('/v1') ? base + '/models' : base + '/v1/models';
            const res = await fetch(modelsUrl, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = await res.json();
                if (data.data?.length > 0) {
                    const m = data.data[0];
                    const chatUrl = base.endsWith('/v1') ? base + '/chat/completions' : base + '/v1/chat/completions';
                    return { name: m.id || 'Custom Model', source: 'Custom', endpoint: chatUrl };
                }
            }
        } catch {}
        return null;
    }

    // ============================================
    // Search + Rendering
    // ============================================
    function search(query) {
        if (!query.trim() || !miniSearchInstance) return [];
        return miniSearchInstance.search(query);
    }

    function renderResults(results, hint) {
        const el = $('so-searchResults');
        if (!el) return;
        if (results.length === 0) {
            el.innerHTML = '<div class="result" style="color:var(--so-muted);font-family:Raleway,sans-serif;font-size:0.85rem;">No results found.</div>';
            return;
        }
        const maxScore = results[0]?.score || 1;
        const topResults = results.slice(0, RESULTS_PER_PAGE);
        const remaining = results.length - RESULTS_PER_PAGE;
        let html = '';
        html += topResults.map(r => renderResultCard(r, maxScore)).join('');
        if (remaining > 0) {
            html += `<button class="show-more-btn" onclick="this.parentNode.querySelectorAll('.result-hidden').forEach(e=>e.style.display='block');this.remove();">Show ${remaining} more</button>`;
            html += results.slice(RESULTS_PER_PAGE).map(r => `<div class="result result-hidden" style="display:none">${renderResultCardInner(r, maxScore)}</div>`).join('');
        }
        el.innerHTML = html;
    }

    function renderResultCard(r, maxScore) { return `<div class="result">${renderResultCardInner(r, maxScore)}</div>`; }
    function renderResultCardInner(r, maxScore) {
        const pct = Math.min(100, (r.score / maxScore) * 100);
        const imgHtml = r.image ? `<img class="result-thumb" src="${r.image}" alt="" loading="lazy" />` : '';
        return `<div class="result-row">${imgHtml}<div class="result-body"><div class="result-header"><span class="result-title">${r.title}</span><span class="result-page">${r.page}</span></div><div class="result-content">${r.content}</div><div class="result-bar"><span class="score-track"><span class="score-fill" style="width:${pct}%"></span></span><span class="score-num">${r.score.toFixed(0)}</span></div></div></div>`;
    }

    // ============================================
    // AI Generation
    // ============================================
    const SYSTEM_PROMPT_LOCAL = `Answer questions about John Hanacek using ONLY facts from the context below. NEVER invent or assume facts not in the context.\n- Name specific projects, companies, tools, awards, and places from the context.\n- John has extensive experience — the context lists his real jobs, products, and achievements.\n- For hiring questions: highlight his strengths with specific evidence from context.\n- For personal questions: answer warmly using only stated facts.\n- 3-5 sentences. No preamble. Stop when you run out of context facts.`;

    const SYSTEM_PROMPT_BROWSER = `Answer questions about John Hanacek using ONLY facts from the context below. NEVER invent or assume facts not in the context.\n- Name specific projects, companies, tools, awards, and places from the context.\n- John has extensive experience — the context lists his real jobs, products, and achievements.\n- For hiring questions: highlight his strengths with specific evidence from context.\n- For personal questions: answer warmly using only stated facts.\n- 2-3 sentences. No preamble. Stop when you run out of context facts.`;

    async function generateAnswerLocal(query, results, genId, model) {
        model = model || localModel;
        const answerEl = $('so-aiAnswer');
        const dot = $('so-aiDot');
        answerEl.style.display = 'block';
        answerEl.classList.add('generating');
        answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
        answerEl.dataset.model = model.name.split('/').pop() + ' · ' + model.source;
        $('so-aiActions').classList.remove('visible');
        dot.className = 'status-dot loading';

        const context = results.slice(0, 8).map(r => `[${r.title}]: ${r.content}`).join('\n\n');
        const messages = [
            { role: "system", content: SYSTEM_PROMPT_LOCAL },
            { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer directly and concisely:` }
        ];

        try {
            if (model.source === 'LMStudio' || model.source === 'Custom') {
                const res = await fetch(model.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.name, messages, max_tokens: 300, temperature: 0, stream: true }) });
                const reader = res.body.getReader(); const decoder = new TextDecoder(); let outputText = '', buffer = '';
                while (true) {
                    const { done, value } = await reader.read(); if (done) break;
                    if (genId !== currentGenId) { reader.cancel(); break; }
                    buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop();
                    for (const line of lines) { if (!line.startsWith('data: ')) continue; const payload = line.slice(6).trim(); if (payload === '[DONE]') continue; try { const chunk = JSON.parse(payload); const token = chunk.choices?.[0]?.delta?.content; if (token) { outputText += token; answerEl.textContent = outputText.trimStart(); } } catch {} }
                }
                if (genId === currentGenId) answerEl.textContent = outputText.trim() || '(No answer generated.)';
            } else if (model.source === 'Ollama') {
                const res = await fetch(model.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.name, messages, stream: true, options: { temperature: 0, num_predict: 300 } }) });
                const reader = res.body.getReader(); const decoder = new TextDecoder(); let outputText = '';
                while (true) {
                    const { done, value } = await reader.read(); if (done) break;
                    if (genId !== currentGenId) { reader.cancel(); break; }
                    const text = decoder.decode(value, { stream: true });
                    for (const line of text.split('\n')) { if (!line.trim()) continue; try { const chunk = JSON.parse(line); if (chunk.message?.content) { outputText += chunk.message.content; answerEl.textContent = outputText.trimStart(); } } catch {} }
                }
                if (genId === currentGenId) answerEl.textContent = outputText.trim() || '(No answer generated.)';
            }
        } catch (err) {
            if (genId === currentGenId) { answerEl.textContent = `Error: ${err.message}`; console.error('[SearchOverlay] Local generation error:', err); }
        } finally {
            if (genId === currentGenId) {
                answerEl.classList.remove('generating');
                dot.className = 'status-dot ready';
                $('so-aiActions').classList.add('visible');
            }
        }
    }

    async function generateAnswer(query, results) {
        if (!llmModel || !modelReady) return;
        const genId = ++currentGenId;
        const answerEl = $('so-aiAnswer'); const dot = $('so-aiDot');
        answerEl.style.display = 'block'; answerEl.classList.add('generating');
        answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
        answerEl.dataset.model = MODEL_DISPLAY_NAME + ' · in-browser';
        $('so-aiActions').classList.remove('visible');
        dot.className = 'status-dot loading';
        if (isGenerating) { pendingGen = { query, results, genId }; return; }
        await runGeneration(query, results, genId);
    }

    async function runGeneration(query, results, genId) {
        isGenerating = true;
        const answerEl = $('so-aiAnswer'); const dot = $('so-aiDot');
        const context = results.slice(0, 5).map(r => `[${r.title}]: ${r.content}`).join('\n\n');
        try {
            const messages = [
                { role: "system", content: SYSTEM_PROMPT_BROWSER },
                { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer directly and concisely:` }
            ];
            const text = processor.apply_chat_template(messages, { add_generation_prompt: true, tokenizer_kwargs: { enable_thinking: false } });
            const inputs = processor.tokenizer(text);
            const isCurrent = () => genId === currentGenId; let outputText = '';
            await llmModel.generate({ ...inputs, max_new_tokens: 128, do_sample: false, repetition_penalty: 1.15,
                streamer: new TextStreamer(processor.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (token) => { if (!isCurrent()) return; outputText += token; answerEl.textContent = outputText.trimStart(); } })
            });
            if (isCurrent()) { const f = outputText.trim(); answerEl.textContent = f || '(No answer generated.)'; }
        } catch (err) { if (genId === currentGenId) { answerEl.textContent = `Error: ${err.message}`; console.error('[SearchOverlay] Generation error:', err); } }
        finally {
            isGenerating = false;
            if (pendingGen) { const { query: pq, results: pr, genId: pg } = pendingGen; pendingGen = null; if (pg === currentGenId) { answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>'; dot.className = 'status-dot loading'; await runGeneration(pq, pr, pg); } }
            if (!isGenerating && genId === currentGenId) {
                answerEl.classList.remove('generating'); dot.className = 'status-dot ready';
                $('so-aiActions').classList.add('visible');
            }
        }
    }

    // ============================================
    // Search Wiring
    // ============================================
    function doSearchOnly(rawQuery) {
        const answerEl = $('so-aiAnswer');
        const sourcesSection = $('so-sourcesSection');
        const clearBtn = $('so-clearBtn');
        const aiActionsEl = $('so-aiActions');

        if (!rawQuery.trim()) {
            sourcesSection.classList.remove('visible');
            if (overlayEl) overlayEl.classList.remove('has-results');
            answerEl.style.display = 'none'; delete answerEl.dataset.model;
            aiActionsEl.classList.remove('visible');
            lastSearchResults = []; lastLlmQuery = '';
            clearBtn.style.display = 'none';
            return;
        }
        clearBtn.style.display = 'block';
        const { query: expanded, hint, originalQuery } = expandQuery(rawQuery);
        const results = search(expanded);
        sourcesSection.classList.add('visible');
        if (overlayEl) overlayEl.classList.add('has-results');
        renderResults(results, hint);
        lastSearchResults = results; lastLlmQuery = originalQuery || rawQuery;
        if (answerEl.style.display !== 'none' && isGenerating) answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
        const aiAvailable = modelReady || localModel;
        if (!aiAvailable || results.length === 0) { answerEl.style.display = 'none'; delete answerEl.dataset.model; aiActionsEl.classList.remove('visible'); }
    }

    function doAIGeneration() {
        if (!lastLlmQuery.trim() || lastSearchResults.length === 0) return;
        if ((activeEngine === 'local' && localModel) || (activeEngine === 'custom' && customModel)) {
            const model = activeEngine === 'local' ? localModel : customModel;
            const genId = ++currentGenId;
            generateAnswerLocal(lastLlmQuery, lastSearchResults, genId, model);
        } else if (activeEngine === 'browser' && modelReady) {
            generateAnswer(lastLlmQuery, lastSearchResults);
        }
    }

    function hasAnyEngine() {
        return aiEnabled && activeEngine && ((activeEngine === 'local' && localModel) || (activeEngine === 'browser' && modelReady) || (activeEngine === 'custom' && customModel));
    }

    // ============================================
    // Event Wiring
    // ============================================
    function wireOverlayEvents() {
        const searchInput = $('so-searchInput');
        const clearBtn = $('so-clearBtn');

        // Backdrop click → close
        overlayEl.querySelector('.search-overlay-backdrop').addEventListener('click', closeSearch);

        // Search input
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            clearTimeout(searchDebounce); searchDebounce = setTimeout(() => doSearchOnly(val), 200);
            clearTimeout(aiDebounce);
            if (hasAnyEngine() && val.trim()) {
                const delay = activeEngine === 'browser' ? 800 : 500;
                aiDebounce = setTimeout(() => doAIGeneration(), delay);
            }
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchDebounce); clearTimeout(aiDebounce);
                doSearchOnly(e.target.value);
                if (hasAnyEngine()) doAIGeneration();
            }
            if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
        });

        // Focus search input → close engine settings if open
        searchInput.addEventListener('focus', () => {
            if (popoverOpen) {
                popoverOpen = false;
                $('so-engineSettings').classList.remove('open');
                $('so-engineInfoBtn').classList.remove('open');
            }
        });

        // Clear button
        clearBtn.addEventListener('click', () => {
            searchInput.value = ''; searchInput.focus(); doSearchOnly('');
        });

        // Copy answer
        $('so-copyBtn').addEventListener('click', function () {
            const text = $('so-aiAnswer').textContent;
            navigator.clipboard.writeText(text);
            this.classList.add('copied'); setTimeout(() => this.classList.remove('copied'), 1500);
        });

        // Share link
        $('so-shareBtn').addEventListener('click', function () {
            const query = searchInput.value;
            const url = new URL(window.location.href.split('?')[0]);
            url.searchParams.set('q', query);
            navigator.clipboard.writeText(url.toString());
            this.classList.add('linked'); setTimeout(() => this.classList.remove('linked'), 1500);
        });

        // Engine settings toggle (inline expanding)
        $('so-engineInfoBtn').addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            popoverOpen = !popoverOpen;
            $('so-engineSettings').classList.toggle('open', popoverOpen);
            $('so-engineInfoBtn').classList.toggle('open', popoverOpen);
        });

        // Popover section clicks
        $('so-localModelSection').addEventListener('click', () => { if (localModel) setActiveEngine('local'); });
        $('so-browserModelSection').addEventListener('click', (e) => {
            if (e.target.id === 'so-enableBtn' || e.target.closest('#so-enableBtn')) return;
            if (modelReady) setActiveEngine('browser');
        });
        $('so-customSection').addEventListener('click', (e) => {
            if (e.target.classList.contains('custom-endpoint-input')) return;
            if (customModel) setActiveEngine('custom');
        });

        // Custom endpoint
        $('so-customEndpoint').addEventListener('change', async (e) => {
            const url = e.target.value.trim();
            if (!url) { customModel = null; localStorage.removeItem('searchCustomEndpoint'); updateEngineBar(); return; }
            localStorage.setItem('searchCustomEndpoint', url);
            customModel = await probeCustomEndpoint(url);
            if (customModel) setActiveEngine('custom');
            else e.target.style.borderColor = 'rgba(248, 113, 113, 0.4)';
        });

        // AI toggle
        $('so-aiToggle').addEventListener('change', (e) => {
            aiEnabled = e.target.checked;
            $('so-aiToggleText').textContent = aiEnabled ? 'on' : 'off';
            updateEngineBar();
            if (!aiEnabled) {
                const answerEl = $('so-aiAnswer');
                answerEl.style.display = 'none'; delete answerEl.dataset.model;
                $('so-aiActions').classList.remove('visible');
            } else if (lastLlmQuery.trim() && lastSearchResults.length > 0) {
                doAIGeneration();
            }
        });

        // Engine bar "Load AI" CTA — triggers in-browser model load
        $('so-engineBarLoadBtn').addEventListener('click', () => {
            // Open settings and click the load button
            if (!popoverOpen) {
                popoverOpen = true;
                $('so-engineSettings').classList.add('open');
                $('so-engineInfoBtn').classList.add('open');
            }
            const enableBtn = $('so-enableBtn');
            if (enableBtn && !enableBtn.disabled) enableBtn.click();
        });

        // Detect local models button — manual probe to avoid permission prompts on load
        $('so-detectLocalBtn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const detectBtn = $('so-detectLocalBtn');
            detectBtn.disabled = true; detectBtn.textContent = 'Scanning...';
            localModel = await checkLocalModels();
            if (localModel) {
                console.log(`[SearchOverlay] Local model: ${localModel.name} via ${localModel.source}`);
                $('so-localModelName').textContent = localModel.name.split('/').pop();
                $('so-localModelSource').textContent = localModel.source;
                $('so-localModelSource').className = 'popover-section-badge badge-' + localModel.source.toLowerCase();
                $('so-localModelDetail').textContent = localModel.host;
                detectBtn.textContent = '✓ Connected'; detectBtn.classList.add('model-active');
                setActiveEngine('local');
            } else {
                detectBtn.textContent = 'Not found'; detectBtn.disabled = false;
                setTimeout(() => { detectBtn.textContent = 'Detect'; }, 2000);
            }
        });

        // Load browser model button
        $('so-enableBtn').addEventListener('click', async () => {
            if (!hasWebGPU || modelReady) return;
            const btn = $('so-enableBtn');
            const progress = $('so-progress');
            const progressBar = $('so-progressBar');
            const progressFill = $('so-progressFill');
            const dot = $('so-aiDot');
            btn.disabled = true; btn.textContent = modelIsCached ? 'Loading...' : 'Downloading...';
            dot.className = 'status-dot loading'; progressBar.style.display = 'block';
            $('so-cacheHint').textContent = '';

            // Lazy-load Transformers.js
            if (!AutoProcessor) {
                const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0-next.5');
                AutoProcessor = mod.AutoProcessor;
                Qwen3_5ForConditionalGeneration = mod.Qwen3_5ForConditionalGeneration;
                TextStreamer = mod.TextStreamer;
            }

            const fileProgress = new Map(); let loadStartTime = Date.now(); let detectedSource = modelIsCached ? 'cache' : null;
            function onProgress(info) {
                if (info.status === 'progress' && info.total) {
                    fileProgress.set(info.file, { loaded: info.loaded, total: info.total });
                    let loaded = 0, total = 0; for (const fp of fileProgress.values()) { loaded += fp.loaded; total += fp.total; }
                    if (detectedSource === null && Date.now() - loadStartTime > 1000) detectedSource = (loaded / total > 0.5) ? 'cache' : 'download';
                    if (total > 0) { progressFill.style.width = (loaded / total * 100) + '%'; progress.textContent = detectedSource === 'download' ? `Downloading ${(loaded / 1e6).toFixed(0)}/${(total / 1e6).toFixed(0)} MB` : 'Loading from cache...'; }
                } else if (info.status === 'initiate') { progress.textContent = `Loading ${info.file || 'model'}...`; }
            }

            try {
                progress.textContent = 'Loading processor...';
                processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: onProgress });
                progress.textContent = 'Loading weights...';
                llmModel = await Qwen3_5ForConditionalGeneration.from_pretrained(MODEL_ID, { dtype: { embed_tokens: "q4", vision_encoder: "q4", decoder_model_merged: "q4" }, device: "webgpu", progress_callback: onProgress });
                progress.textContent = 'Compiling shaders...';
                const warmup = processor.tokenizer("hi"); await llmModel.generate({ ...warmup, max_new_tokens: 1 });
                const loadTime = ((Date.now() - loadStartTime) / 1000).toFixed(1);
                modelReady = true; modelIsCached = true;
                btn.textContent = '✓ Active'; btn.classList.remove('cached'); btn.classList.add('model-active');
                progress.textContent = `Ready in ${loadTime}s`; progressBar.style.display = 'none';
                setActiveEngine('browser');
                const query = $('so-searchInput').value;
                if (query.trim()) { doSearchOnly(query); doAIGeneration(); }
            } catch (err) {
                btn.textContent = 'Error — retry'; btn.disabled = false; dot.className = 'status-dot off';
                progress.textContent = `Error: ${err.message}`; progressBar.style.display = 'none';
                console.error('[SearchOverlay] Model load error:', err);
            }
        });
    }

    // ============================================
    // Open / Close
    // ============================================
    async function openSearch(initialQuery) {
        await ensureInitialized();
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

        const input = $('so-searchInput');
        if (typeof initialQuery === 'string' && initialQuery.trim()) {
            input.value = initialQuery;
            setTimeout(() => { doSearchOnly(initialQuery); if (hasAnyEngine()) doAIGeneration(); }, 50);
        }
        // Focus after transition
        requestAnimationFrame(() => { input.focus(); });
    }

    function closeSearch() {
        if (!overlayEl) return;
        // Trigger close animation
        overlayEl.setAttribute('aria-hidden', 'true');
        // Close popover if open
        popoverOpen = false;
        const settings = $('so-engineSettings');
        if (settings) settings.classList.remove('open');
        const infoBtn = $('so-engineInfoBtn');
        if (infoBtn) infoBtn.classList.remove('open');
        // Blur the overlay's own input so it doesn't hold focus while hidden
        const overlayInput = $('so-searchInput');
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
        // Find search links in nav — intercept clicks
        document.querySelectorAll('a[data-search-trigger], a[href="search.html"]').forEach(link => {
            // Only intercept if it's the nav search link (has shape SVG with magnifying glass)
            const svg = link.querySelector('svg');
            if (!svg) return;
            const hasCircle = svg.querySelector('circle');
            const hasLine = svg.querySelector('line');
            if (!hasCircle || !hasLine) return; // Not the magnifying glass

            link.addEventListener('click', (e) => {
                e.preventDefault();
                openSearch();
            });
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
    // Init on DOM ready
    // ============================================
    function init() {
        setupNavTriggers();
        setupHeroSearch();
        checkUrlQuery();
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
