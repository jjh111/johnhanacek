// ============================================
// Search Core — the one search pipeline
// ============================================
// Knowledge (intents, prompts, chunks) + behavior (retrieval, engine tiers,
// generation) live HERE and only here. scripts/search-overlay.js and
// search.html are thin shells that hand this core their elements and keep
// only surface concerns (overlay open/close, page layout).
//
// The two used to carry near-identical copies of everything below. The
// payloads (intents, prompts) stayed in sync by hand; the wiring diverged —
// which is exactly where the bugs lived. Same cure as fish-engine.js:
// extract the engine, pages become hosts.
//
// Adapter contract: the shell passes `el(name)` mapping logical element
// names to its DOM. Capability is by element presence — a shell without an
// `engineBarLoadBtn` simply never shows that CTA. No per-surface branches.

(function () {
    'use strict';
    if (window.JHSearchCore) return;

    const MODEL_ID = "onnx-community/Qwen3.5-0.8B-ONNX";
    const MODEL_DISPLAY_NAME = "Qwen 3.5";
    const RESULTS_PER_PAGE = 5;

    // ============================================
    // Query Intent Mapping (regex fast path)
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

    // ============================================
    // System Prompts
    // ============================================
    const SYSTEM_PROMPT_LOCAL = `Answer questions about John Hanacek using ONLY facts from the context below. NEVER invent or assume facts not in the context.\n- Name specific projects, companies, tools, awards, and places from the context.\n- John has extensive experience — the context lists his real jobs, products, and achievements.\n- For hiring questions: highlight his strengths with specific evidence from context.\n- For personal questions: answer warmly using only stated facts.\n- 3-5 sentences. No preamble. Stop when you run out of context facts.`;

    const SYSTEM_PROMPT_BROWSER = `Answer questions about John Hanacek using ONLY facts from the context below. NEVER invent or assume facts not in the context.\n- Name specific projects, companies, tools, awards, and places from the context.\n- John has extensive experience — the context lists his real jobs, products, and achievements.\n- For hiring questions: highlight his strengths with specific evidence from context.\n- For personal questions: answer warmly using only stated facts.\n- 2-3 sentences. No preamble. Stop when you run out of context facts.`;

    // ── Local-network opt-in ─────────────────────────────────────────────
    // Probing localhost for LMStudio/Ollama makes the browser ask the visitor
    // for permission to reach devices on their own machine/network. Asking
    // that of someone who just opened a portfolio homepage is alarming and
    // unexplained, so nothing touches localhost until they ask for it: the
    // engine panel offers it, the Detect button performs it, and the answer
    // is remembered so a returning opted-in visitor is not made to re-ask.
    const LOCAL_OPTIN_KEY = 'jh-local-llm-optin';
    function localOptedIn() {
        try { return localStorage.getItem(LOCAL_OPTIN_KEY) === 'true'; } catch { return false; }
    }
    function rememberLocalOptIn() {
        try { localStorage.setItem(LOCAL_OPTIN_KEY, 'true'); } catch {}
    }

    function getBasePath() {
        const path = window.location.pathname;
        if (path.includes('/Assets/') || path.includes('/demos/')) return '../../';
        return './';
    }

    // The index and this script change independently of the pages that load
    // them, so bust on the stamped site version. Read it off a script tag
    // rather than window.JH_SITE: load order of deferred scripts isn't
    // guaranteed, but the tags are in the DOM from parse time.
    function getSiteVersion() {
        const vTag = document.querySelector('script[src*="jh-chrome.js"], script[src*="search-overlay.js"], script[src*="search-core.js"]');
        const vM = vTag && /[?&]v=([\w.]+)/.exec(vTag.getAttribute('src') || '');
        return vM ? vM[1] : null;
    }

    // Strip reasoning so only the final answer shows — handles models that emit
    // <think>…</think> inline in content, or split reasoning into delta.reasoning_content.
    function stripThink(s) {
        s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
        const o = s.search(/<think>/i);
        return o === -1 ? s : s.slice(0, o);
    }

    // ============================================
    // Core factory
    // ============================================
    // config:
    //   el(name)         — logical name → element (or null). Names used:
    //                      aiDot engineModelLabel engineSourceBadge engineBarLoadBtn
    //                      searchInput clearBtn aiAnswer aiActions copyBtn shareBtn
    //                      sourcesSection searchResults
    //                      localModelSection localModelName localModelSource localModelDetail detectLocalBtn
    //                      browserModelSection webgpuBadge enableBtn cacheHint progress progressBar progressFill
    //                      customSection customEndpoint aiToggle aiToggleText
    //   root             — element that carries --engine-color (overlay panel / documentElement)
    //   sectionsRoot     — element under which .popover-section active states are cleared
    //   logTag           — console prefix, e.g. '[SearchOverlay]'
    //   mutedColor       — CSS color string for the "no engine" state (surfaces name the token differently)
    //   updateHistory    — share/clear also rewrite the address bar (search.html)
    //   onResultsChange(hasResults)  — optional (overlay toggles its has-results class)
    //   onRequestSettingsOpen()      — optional; engine-bar CTA asks the shell to reveal settings
    function create(config) {
        const el = config.el;
        const logTag = config.logTag || '[Search]';
        const mutedColor = config.mutedColor || 'var(--muted)';

        // ── State ──
        let chunks = [];
        let miniSearchInstance = null;
        let activeEngine = null; // 'local' | 'browser' | 'custom' | null
        let aiEnabled = true;
        let localModel = null;
        let customModel = null;
        let processor = null, llmModel = null, modelReady = false;
        let currentGenId = 0, isGenerating = false, pendingGen = null;
        let searchDebounce, aiDebounce, lastSearchResults = [], lastLlmQuery = '';
        let hasWebGPU = false;
        let modelIsCached = false;
        let enginesChecked = false;

        // Transformers.js imports (lazy — nothing downloads until Load is clicked)
        let AutoProcessor, Qwen3_5ForConditionalGeneration, TextStreamer;

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
        // Init — index + chunks + common event wiring
        // ============================================
        async function init() {
            if (typeof MiniSearch === 'undefined') {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/minisearch@7.1.1/dist/umd/index.min.js';
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            }

            miniSearchInstance = new MiniSearch({
                fields: ['title', 'content', 'tags'],
                storeFields: ['title', 'content', 'page', 'image', 'url', 'type'],
                searchOptions: { boost: { title: 3, tags: 2 }, fuzzy: 0.2, prefix: true }
            });

            try {
                const v = getSiteVersion();
                const response = await fetch(getBasePath() + 'Assets/search-chunks.json' + (v ? '?v=' + v : ''));
                const data = await response.json();
                chunks = data.chunks;
                miniSearchInstance.addAll(chunks);
                console.log(`${logTag} Loaded ${chunks.length} chunks`);
            } catch (err) {
                console.error(`${logTag} Failed to load search index:`, err);
            }

            wireCommonEvents();
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
            return mutedColor;
        }

        function updateEngineBar() {
            const dot = el('aiDot');
            const label = el('engineModelLabel');
            const badge = el('engineSourceBadge');
            const loadBtn = el('engineBarLoadBtn');
            if (!dot || !label || !badge) return;
            const root = config.root || document.documentElement;

            const sectionsRoot = config.sectionsRoot || document;
            sectionsRoot.querySelectorAll('.popover-section').forEach(s => s.classList.remove('active'));

            const color = getEngineColor(activeEngine);
            root.style.setProperty('--engine-color', color);

            if (localModel) {
                const localColor = localModel.source === 'Ollama' ? 'var(--engine-ollama)' : 'var(--engine-lmstudio)';
                el('localModelSection').style.setProperty('--section-color', localColor);
            }

            // Reset CTA and badge visibility
            if (loadBtn) loadBtn.style.display = 'none';
            badge.style.display = '';

            if (!aiEnabled) {
                label.textContent = 'AI off';
                badge.textContent = '';
                badge.className = 'engine-source-badge none';
                dot.className = 'status-dot off';
                root.style.setProperty('--engine-color', mutedColor);
                return;
            }

            if (activeEngine === 'local' && localModel) {
                const shortName = localModel.name.split('/').pop();
                label.textContent = shortName;
                badge.textContent = localModel.source;
                badge.className = 'engine-source-badge ' + localModel.source.toLowerCase();
                dot.className = 'status-dot ready';
                el('localModelSection').classList.add('active');
            } else if (activeEngine === 'browser' && modelReady) {
                label.textContent = MODEL_DISPLAY_NAME;
                badge.textContent = 'In-Browser';
                badge.className = 'engine-source-badge browser';
                dot.className = 'status-dot ready';
                el('browserModelSection').classList.add('active');
            } else if (activeEngine === 'custom' && customModel) {
                const shortName = customModel.name.split('/').pop();
                label.textContent = shortName;
                badge.textContent = 'Custom';
                badge.className = 'engine-source-badge custom';
                dot.className = 'status-dot ready';
                el('customSection').classList.add('active');
            } else {
                // No active engine — offer the load CTA where the surface has one
                if (hasWebGPU && !modelReady && loadBtn) {
                    label.textContent = '';
                    badge.textContent = ''; badge.style.display = 'none';
                    dot.className = 'status-dot off';
                    loadBtn.style.display = 'inline-block';
                    loadBtn.textContent = modelIsCached ? 'Load ' + MODEL_DISPLAY_NAME + ' ⚡' : 'Load ' + MODEL_DISPLAY_NAME;
                    loadBtn.classList.toggle('cached', modelIsCached);
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
            broadcastEngineState();
            localStorage.setItem('searchActiveEngine', engine || '');
        }

        // Body data attribute drives the nav search indicator CSS
        function broadcastEngineState() {
            let state = 'bm25';
            if (!aiEnabled) {
                state = 'bm25';
            } else if (activeEngine === 'browser' && modelReady) {
                state = 'webgpu-active';
            } else if (activeEngine === 'local' && localModel) {
                state = localModel.source === 'Ollama' ? 'ollama' : 'lmstudio';
            } else if (activeEngine === 'custom' && customModel) {
                state = 'custom';
            } else if (hasWebGPU) {
                state = 'webgpu-available';
            }
            document.body.dataset.searchEngine = state;
        }

        // probeLocal:false does only same-origin/in-browser work (WebGPU adapter,
        // model cache) — nothing that can raise a permission prompt.
        async function checkEngines({ probeLocal = false } = {}) {
            enginesChecked = true;

            // iOS detection — Safari on iOS reports WebGPU but crashes loading models
            const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
                || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const forceWebGPU = localStorage.getItem('jh-force-webgpu') === 'true';

            if (isIOS && !forceWebGPU) {
                console.log(`${logTag} iOS detected — WebGPU disabled (crashes Safari). Override: localStorage.setItem("jh-force-webgpu", "true")`);
            }

            const webgpuBadge = el('webgpuBadge');
            if (navigator.gpu && !(isIOS && !forceWebGPU)) {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    hasWebGPU = true;
                    if (webgpuBadge) { webgpuBadge.textContent = 'WebGPU'; webgpuBadge.className = 'popover-section-badge badge-webgpu'; }
                } else {
                    if (webgpuBadge) { webgpuBadge.textContent = 'No adapter'; }
                }
            } else {
                if (webgpuBadge) { webgpuBadge.textContent = isIOS ? 'iOS — disabled' : 'No WebGPU'; }
            }

            const btn = el('enableBtn');
            if (!hasWebGPU) {
                if (btn) { btn.textContent = 'WebGPU unavailable'; btn.disabled = true; }
            } else {
                modelIsCached = await checkModelCache();
                const cacheHint = el('cacheHint');
                // Re-enable explicitly: an earlier pass may have disabled this while
                // WebGPU was still undetermined, and a stale disabled flag is the
                // difference between "the model loads" and "nothing happens".
                if (btn && !modelReady) btn.disabled = false;
                if (modelIsCached) {
                    if (btn) { btn.textContent = 'Load ' + MODEL_DISPLAY_NAME; btn.classList.add('cached'); }
                    if (cacheHint) cacheHint.textContent = 'Cached — loads in seconds';
                } else {
                    if (btn) btn.textContent = 'Download ' + MODEL_DISPLAY_NAME + ' (~585 MB)';
                    if (cacheHint) cacheHint.textContent = '';
                }
            }

            // Local models — only when the visitor has asked for it (see the
            // opt-in note above). Otherwise the section just sits there offering.
            const localSection = el('localModelSection');
            if (!probeLocal) {
                if (localSection) localSection.classList.add('detected');
                if (!activeEngine) updateEngineBar();
                broadcastEngineState();
                return;
            }

            localModel = await checkLocalModels();
            if (localModel) {
                rememberLocalOptIn();
                console.log(`${logTag} Local model: ${localModel.name} via ${localModel.source}`);
                if (localSection) {
                    localSection.classList.add('detected');
                    el('localModelName').textContent = localModel.name.split('/').pop();
                    el('localModelSource').textContent = localModel.source;
                    el('localModelSource').className = 'popover-section-badge badge-' + localModel.source.toLowerCase();
                    el('localModelDetail').textContent = localModel.host;
                }
                const detectBtn = el('detectLocalBtn');
                if (detectBtn) { detectBtn.textContent = '✓ Connected'; detectBtn.classList.add('model-active'); detectBtn.disabled = true; }
                setActiveEngine('local');
            } else {
                // Show section but as unconnected — user can click Detect to retry
                if (localSection) localSection.classList.add('detected');
            }

            // Saved custom endpoint — saving one was itself an explicit act, so
            // this is not a cold prompt, but it is still a network reach and so
            // rides the same opt-in gate as the localhost scan.
            const savedEndpoint = localStorage.getItem('searchCustomEndpoint') || '';
            if (savedEndpoint) {
                const customInput = el('customEndpoint');
                if (customInput) customInput.value = savedEndpoint;
                if (!localModel) {
                    customModel = await probeCustomEndpoint(savedEndpoint);
                    if (customModel) setActiveEngine('custom');
                }
            }

            if (!activeEngine) updateEngineBar();
            broadcastEngineState();
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
            const resultsEl = el('searchResults');
            if (!resultsEl) return;
            if (results.length === 0) {
                resultsEl.innerHTML = `<div class="result" style="color:${mutedColor};font-family:Raleway,sans-serif;font-size:0.85rem;">No results found.</div>`;
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
            resultsEl.innerHTML = html;
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
        async function generateAnswerLocal(query, results, genId, model) {
            model = model || localModel;
            const answerEl = el('aiAnswer');
            const dot = el('aiDot');
            answerEl.style.display = 'block';
            answerEl.classList.add('generating');
            answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
            answerEl.dataset.model = model.name.split('/').pop() + ' · ' + model.source;
            el('aiActions').classList.remove('visible');
            dot.className = 'status-dot loading';

            const context = results.slice(0, 8).map(r => `[${r.title}]: ${r.content}`).join('\n\n');
            const messages = [
                { role: "system", content: SYSTEM_PROMPT_LOCAL },
                { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer directly and concisely:` }
            ];

            try {
                if (model.source === 'LMStudio' || model.source === 'Custom') {
                    const res = await fetch(model.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.name, messages, max_tokens: 600, temperature: 0, stream: true }) });
                    if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`LMStudio ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`); }
                    const reader = res.body.getReader(); const decoder = new TextDecoder(); let outputText = '', reasoning = '', buffer = '';
                    while (true) {
                        const { done, value } = await reader.read(); if (done) break;
                        if (genId !== currentGenId) { reader.cancel(); break; }
                        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop();
                        for (const line of lines) { const s = line.trim(); if (!s.startsWith('data:')) continue; const payload = s.slice(5).trim(); if (payload === '[DONE]') continue; try { const delta = JSON.parse(payload).choices?.[0]?.delta || {}; if (delta.reasoning_content) reasoning += delta.reasoning_content; if (delta.content) { outputText += delta.content; const vis = stripThink(outputText).trimStart(); if (vis) answerEl.textContent = vis; } } catch {} }
                    }
                    if (genId === currentGenId) { const finalText = stripThink(outputText).trim(); if (!finalText) console.warn(`${logTag} LMStudio returned no answer — content chars:`, outputText.length, 'reasoning chars:', reasoning.length, '— a reasoning model may need a higher token budget or a non-reasoning model.'); answerEl.textContent = finalText || '(No answer — the model returned only reasoning. Try a non-reasoning model.)'; }
                } else if (model.source === 'Ollama') {
                    const res = await fetch(model.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.name, messages, stream: true, options: { temperature: 0, num_predict: 600 } }) });
                    if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`Ollama ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`); }
                    const reader = res.body.getReader(); const decoder = new TextDecoder(); let outputText = '';
                    while (true) {
                        const { done, value } = await reader.read(); if (done) break;
                        if (genId !== currentGenId) { reader.cancel(); break; }
                        const text = decoder.decode(value, { stream: true });
                        for (const line of text.split('\n')) { if (!line.trim()) continue; try { const chunk = JSON.parse(line); if (chunk.message?.content) { outputText += chunk.message.content; const vis = stripThink(outputText).trimStart(); if (vis) answerEl.textContent = vis; } } catch {} }
                    }
                    if (genId === currentGenId) answerEl.textContent = stripThink(outputText).trim() || '(No answer generated.)';
                }
            } catch (err) {
                if (genId === currentGenId) { answerEl.textContent = `Error: ${err.message}`; console.error(`${logTag} Local generation error:`, err); }
            } finally {
                if (genId === currentGenId) {
                    answerEl.classList.remove('generating');
                    dot.className = 'status-dot ready';
                    el('aiActions').classList.add('visible');
                }
            }
        }

        async function generateAnswer(query, results) {
            if (!llmModel || !modelReady) return;
            const genId = ++currentGenId;
            const answerEl = el('aiAnswer'); const dot = el('aiDot');
            answerEl.style.display = 'block'; answerEl.classList.add('generating');
            answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
            answerEl.dataset.model = MODEL_DISPLAY_NAME + ' · in-browser';
            el('aiActions').classList.remove('visible');
            dot.className = 'status-dot loading';
            if (isGenerating) { pendingGen = { query, results, genId }; return; }
            await runGeneration(query, results, genId);
        }

        async function runGeneration(query, results, genId) {
            isGenerating = true;
            const answerEl = el('aiAnswer'); const dot = el('aiDot');
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
            } catch (err) { if (genId === currentGenId) { answerEl.textContent = `Error: ${err.message}`; console.error(`${logTag} Generation error:`, err); } }
            finally {
                isGenerating = false;
                if (pendingGen) { const { query: pq, results: pr, genId: pg } = pendingGen; pendingGen = null; if (pg === currentGenId) { answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>'; dot.className = 'status-dot loading'; await runGeneration(pq, pr, pg); } }
                if (!isGenerating && genId === currentGenId) {
                    answerEl.classList.remove('generating'); dot.className = 'status-dot ready';
                    el('aiActions').classList.add('visible');
                }
            }
        }

        // ============================================
        // Search Wiring
        // ============================================
        function doSearchOnly(rawQuery) {
            const answerEl = el('aiAnswer');
            const sourcesSection = el('sourcesSection');
            const clearBtn = el('clearBtn');
            const aiActionsEl = el('aiActions');

            if (!rawQuery.trim()) {
                sourcesSection.classList.remove('visible');
                if (config.onResultsChange) config.onResultsChange(false);
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
            if (config.onResultsChange) config.onResultsChange(true);
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

        function runQuery(rawQuery) {
            doSearchOnly(rawQuery);
            if (hasAnyEngine()) doAIGeneration();
        }

        // ============================================
        // Common Event Wiring (everything both surfaces share)
        // ============================================
        function wireCommonEvents() {
            const searchInput = el('searchInput');
            const clearBtn = el('clearBtn');

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
                    runQuery(e.target.value);
                }
            });

            clearBtn.addEventListener('click', () => {
                searchInput.value = ''; searchInput.focus(); doSearchOnly('');
                if (config.updateHistory) history.replaceState(null, '', window.location.pathname);
            });

            el('copyBtn').addEventListener('click', function () {
                const text = el('aiAnswer').textContent;
                navigator.clipboard.writeText(text);
                this.classList.add('copied'); setTimeout(() => this.classList.remove('copied'), 1500);
            });

            el('shareBtn').addEventListener('click', function () {
                const query = searchInput.value;
                const url = new URL(window.location.href.split('?')[0]);
                url.searchParams.set('q', query);
                navigator.clipboard.writeText(url.toString());
                if (config.updateHistory) history.replaceState(null, '', url);
                this.classList.add('linked'); setTimeout(() => this.classList.remove('linked'), 1500);
            });

            // Popover section clicks (switch engine)
            el('localModelSection').addEventListener('click', (e) => {
                if (e.target.id?.endsWith('detectLocalBtn') || e.target.closest('[id$="detectLocalBtn"]')) return;
                if (localModel) setActiveEngine('local');
            });
            el('browserModelSection').addEventListener('click', (e) => {
                if (e.target.id?.endsWith('enableBtn') || e.target.closest('[id$="enableBtn"]')) return;
                if (modelReady) setActiveEngine('browser');
            });
            el('customSection').addEventListener('click', (e) => {
                if (e.target.classList.contains('custom-endpoint-input')) return;
                if (customModel) setActiveEngine('custom');
            });

            // Custom endpoint
            el('customEndpoint').addEventListener('change', async (e) => {
                const url = e.target.value.trim();
                if (!url) { customModel = null; localStorage.removeItem('searchCustomEndpoint'); updateEngineBar(); return; }
                localStorage.setItem('searchCustomEndpoint', url);
                rememberLocalOptIn(); // typing an endpoint is consent to reach it
                customModel = await probeCustomEndpoint(url);
                if (customModel) setActiveEngine('custom');
                else e.target.style.borderColor = 'rgba(248, 113, 113, 0.4)';
            });

            // AI toggle
            el('aiToggle').addEventListener('change', (e) => {
                aiEnabled = e.target.checked;
                el('aiToggleText').textContent = aiEnabled ? 'on' : 'off';
                updateEngineBar();
                broadcastEngineState();
                if (!aiEnabled) {
                    const answerEl = el('aiAnswer');
                    answerEl.style.display = 'none'; delete answerEl.dataset.model;
                    el('aiActions').classList.remove('visible');
                } else if (lastLlmQuery.trim() && lastSearchResults.length > 0) {
                    doAIGeneration();
                }
            });

            // Engine bar "Load AI" CTA (surfaces that have one)
            const loadBtn = el('engineBarLoadBtn');
            if (loadBtn) {
                loadBtn.addEventListener('click', () => {
                    if (config.onRequestSettingsOpen) config.onRequestSettingsOpen();
                    const enableBtn = el('enableBtn');
                    if (enableBtn && !enableBtn.disabled) enableBtn.click();
                });
            }

            // Detect local models — manual probe to avoid permission prompts on load
            el('detectLocalBtn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const detectBtn = el('detectLocalBtn');
                detectBtn.disabled = true; detectBtn.textContent = 'Scanning...';
                rememberLocalOptIn(); // clicking Detect IS the consent
                localModel = await checkLocalModels();
                if (localModel) {
                    console.log(`${logTag} Local model: ${localModel.name} via ${localModel.source}`);
                    el('localModelName').textContent = localModel.name.split('/').pop();
                    el('localModelSource').textContent = localModel.source;
                    el('localModelSource').className = 'popover-section-badge badge-' + localModel.source.toLowerCase();
                    el('localModelDetail').textContent = localModel.host;
                    detectBtn.textContent = '✓ Connected'; detectBtn.classList.add('model-active');
                    setActiveEngine('local');
                } else {
                    detectBtn.textContent = 'Not found'; detectBtn.disabled = false;
                    setTimeout(() => { detectBtn.textContent = 'Detect'; }, 2000);
                }
            });

            // Load browser model
            el('enableBtn').addEventListener('click', async () => {
                if (!hasWebGPU || modelReady) return;
                const btn = el('enableBtn');
                const progress = el('progress');
                const progressBar = el('progressBar');
                const progressFill = el('progressFill');
                const dot = el('aiDot');
                btn.disabled = true; btn.textContent = modelIsCached ? 'Loading...' : 'Downloading...';
                dot.className = 'status-dot loading'; progressBar.style.display = 'block';
                el('cacheHint').textContent = '';

                // Lazy-load Transformers.js.
                //
                // Pinned to a real release, not a `next` pre-release: the page sat on
                // 4.0.0-next.5 (2026-03-02) for months while 4.2.0 shipped.
                //
                // dtype is q4f16, not q4 — 585 MB against 718 MB for the same model.
                // Measured, because fp16 on WebGPU is not automatically safe: the
                // same path makes gemma-3-270m emit `<unused56>` forever
                // (onnxruntime#26732). Qwen3.5 was loaded and generated at q4f16
                // before this was committed, and answers correctly.
                //
                // The vision encoder is NOT droppable, however tempting: omitting it
                // from dtype does not skip it, it falls back to the UNQUANTIZED
                // vision_encoder.onnx (402 MB vs 62 MB at q4f16), i.e. dropping the
                // key makes the download bigger. Losing the vision tower means
                // moving to a text-only model — see SEARCH_MODEL_RESEARCH.md.
                if (!AutoProcessor) {
                    const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
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
                    llmModel = await Qwen3_5ForConditionalGeneration.from_pretrained(MODEL_ID, { dtype: { embed_tokens: "q4f16", vision_encoder: "q4f16", decoder_model_merged: "q4f16" }, device: "webgpu", progress_callback: onProgress });
                    progress.textContent = 'Compiling shaders...';
                    const warmup = processor.tokenizer("hi"); await llmModel.generate({ ...warmup, max_new_tokens: 1 });
                    const loadTime = ((Date.now() - loadStartTime) / 1000).toFixed(1);
                    modelReady = true; modelIsCached = true;
                    btn.textContent = '✓ Active'; btn.classList.remove('cached'); btn.classList.add('model-active');
                    progress.textContent = `Ready in ${loadTime}s`; progressBar.style.display = 'none';
                    setActiveEngine('browser');
                    const query = searchInput.value;
                    if (query.trim()) { doSearchOnly(query); doAIGeneration(); }
                } catch (err) {
                    btn.textContent = 'Error — retry'; btn.disabled = false; dot.className = 'status-dot off';
                    progress.textContent = `Error: ${err.message}`; progressBar.style.display = 'none';
                    console.error(`${logTag} Model load error:`, err);
                }
            });
        }

        // ── Public API ──
        return {
            init,
            checkEngines,
            runQuery,
            doSearchOnly,
            doAIGeneration,
            hasAnyEngine,
            updateEngineBar,
            broadcastEngineState,
            localOptedIn,
            get enginesChecked() { return enginesChecked; },
            get chunks() { return chunks; },
        };
    }

    window.JHSearchCore = { create, localOptedIn, MODEL_DISPLAY_NAME };
})();
