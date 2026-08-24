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
    // Command Registry
    // ============================================
    // Pages declare what they can DO the same way chunks declare what the
    // site KNOWS. Inline page scripts run before this (lazy-loaded) file, so
    // registration goes through a plain queue array — push before or after
    // core load, both work:
    //   (window.JH_COMMANDS = window.JH_COMMANDS || []).push({
    //       id: 'fish.feed', title: 'Feed the fish', page: 'index',
    //       tags: 'food feed', hints: ['feed the fish', 'give them food'],
    //       detail: 'Drop food into the tank', run: () => { ... } });
    // `run` executes on the page; `href` navigates instead. `hints` are the
    // exemplar phrases the semantic tier matches against. `page` limits the
    // command to the page that can actually perform it.
    const registeredCommands = [];
    let registryVersion = 0;
    function registerCommand(cmd) {
        if (!cmd || !cmd.id || !cmd.title) return;
        if (registeredCommands.some(c => c.id === cmd.id)) return;
        registeredCommands.push(cmd);
        registryVersion++;
    }
    const cmdQueue = window.JH_COMMANDS = window.JH_COMMANDS || [];
    cmdQueue.forEach(registerCommand);
    cmdQueue.push = function (...cmds) {
        Array.prototype.push.apply(this, cmds);
        cmds.forEach(registerCommand);
        return this.length;
    };

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
        { patterns: [/schedul(e|ing)|book\s+(a\s+)?(call|meeting|session)|availability|set\s+up\s+a\s+(call|meeting|time)/i], expanded: 'services coaching intro call consultation contact email', hint: 'Showing how to book time with John', card: 'schedule' },
        { patterns: [/how\s+(do\s+i|can\s+i|to)\s+(contact|reach|email|message)\s+(him|john)/i, /contact|email|linkedin|twitter|social/i, /send\s+(him|john)\s+a\s+message/i], expanded: 'contact email linkedin bluesky twitter social', hint: 'Showing contact information', card: 'contact' },
        { patterns: [/what\s+does\s+he\s+(charge|cost)|pricing|rates?|how\s+much/i, /\bcosts?\b|\bprices?\b/i, /services?|consulting|coaching|freelance/i, /can\s+he\s+help\s+(me|us|with)/i, /i\s+need\s+help\s+with/i, /looking\s+for\s+a\s+designer/i], expanded: 'services coaching consulting design product workshops retainer sprint', hint: 'Showing services and engagement options', card: 'services' },
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

        // ── Semantic tier (Tier 0.5) ──
        // Chunk vectors ship inside search-chunks.json (int8 base64, built by
        // scripts/build-chunk-vectors.mjs), so chunk↔chunk similarity costs
        // zero download. The query-side embedder (MiniLM q8, ~24 MB, WASM —
        // works everywhere incl. iOS, where the WebGPU generation tier is
        // disabled) lazy-loads in the background on the first real search;
        // until it's ready BM25 + intents serve alone, and the live query
        // upgrades in place when it arrives. Failure = silent keyword-only.
        // Model choice + the repo traps: Agent Reference/SEARCH_EMBEDDER_RESEARCH.md.
        const EMBED_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
        let chunkVecs = null;          // Map id → normalized Float32Array
        let semanticEx = null;         // feature-extraction pipeline
        let semanticState = 'idle';    // idle | loading | ready | failed
        let semanticGen = 0;           // stale-refine guard
        let currentQueryRaw = '';
        let lastFusionQuery = '', lastHint = null, lastIntentFired = false;

        // For the fusion's BM25 leg, pronouns are STRIPPED, not resolved to
        // "John Hanacek" — every chunk is about John, so the name matches
        // everything (measured: it handed the About chunk a 145.6 BM25 score
        // for "prizes he has been given") and drowned real hits. The legacy
        // name-resolution stays for the instant BM25-only render.
        function stripPronouns(q) {
            return q.replace(/\b(him|he|his|she|her)\b/gi, ' ').replace(/\s+/g, ' ').trim();
        }

        function decodeVec(b64, scale) {
            const bin = atob(b64);
            const v = new Float32Array(bin.length);
            let norm = 0;
            for (let i = 0; i < bin.length; i++) {
                let b = bin.charCodeAt(i);
                if (b > 127) b -= 256;
                v[i] = b * scale;
                norm += v[i] * v[i];
            }
            norm = Math.sqrt(norm) || 1;
            for (let i = 0; i < v.length; i++) v[i] /= norm;
            return v;
        }

        function cosSim(a, b) {
            let s = 0;
            for (let i = 0; i < a.length; i++) s += a[i] * b[i];
            return s;
        }

        function ensureSemantic() {
            if (semanticState !== 'idle' || !chunkVecs) return;
            semanticState = 'loading';
            (async () => {
                try {
                    const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
                    // device/dtype pinned to what build-chunk-vectors.mjs used, so
                    // query and chunk vectors come from identical weights.
                    semanticEx = await mod.pipeline('feature-extraction', EMBED_MODEL_ID, { dtype: 'q8', device: 'wasm' });
                    await semanticEx('warmup', { pooling: 'mean', normalize: true });
                    semanticState = 'ready';
                    document.body.dataset.searchSemantic = 'ready';
                    console.log(`${logTag} Semantic tier ready (MiniLM 384d · WASM)`);
                    if (currentQueryRaw) refineSemantic(currentQueryRaw, ++semanticGen);
                } catch (err) {
                    semanticState = 'failed';
                    console.warn(`${logTag} Semantic tier unavailable — staying keyword-only:`, err?.message || err);
                }
            })();
        }

        // BM25 finds what the words match; the vectors find what the words
        // MEAN. Fused by reciprocal rank (RRF), not score-weighting: BM25
        // scores aren't comparable across queries — the pronoun-resolution
        // fallback ("he" → "John Hanacek") can hand an irrelevant chunk a
        // huge name-match score, and a weighted sum lets that noise outrank a
        // decisive semantic hit. Ranks are honest where scores lie. Semantic
        // rank only counts above a similarity floor (in a 42-item list,
        // everything HAS a rank; that alone is not evidence), and chunks in
        // neither list — no BM25 hit, similarity below floor — drop out.
        // Two trust modes, both tuned offline: when the intent grammar fired,
        // its expansion is hand-authored knowledge — BM25 gets more weight and
        // weak cosines are floored out (5/5 on intent queries). When the query
        // fell through the grammar, meaning carries more (21/22 top-3 on a
        // 22-query eval, 5/5 exact-keyword top-1).
        function hybridMerge(bm25Results, qv, intentFired) {
            const K = 60;
            const W_BM25 = intentFired ? 1.5 : 1.0;
            const W_SEM = intentFired ? 1.0 : 1.15;
            const SEM_FLOOR = intentFired ? 0.25 : 0.18;
            const INCLUDE_FLOOR = 0.28;
            const bRank = new Map(bm25Results.map((r, i) => [r.id, i + 1]));
            const cosById = new Map();
            for (const c of chunks) {
                const v = chunkVecs.get(c.id);
                if (v) cosById.set(c.id, cosSim(qv, v));
            }
            const sRank = new Map([...cosById.entries()].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]));
            const merged = [];
            for (const c of chunks) {
                const rb = bRank.get(c.id);
                const cosS = cosById.get(c.id) ?? 0;
                if (!rb && cosS < INCLUDE_FLOOR) continue;
                const rs = sRank.get(c.id);
                const score = 1000 * ((rb ? W_BM25 / (K + rb) : 0) + (rs && cosS >= SEM_FLOOR ? W_SEM / (K + rs) : 0));
                merged.push({
                    id: c.id, title: c.title, content: c.content, page: c.page,
                    image: c.image, url: c.url, type: c.type,
                    video: c.video, model3d: c.model3d, score,
                });
            }
            merged.sort((a, b) => b.score - a.score);
            return merged;
        }

        async function refineSemantic(rawQuery, gen) {
            if (semanticState !== 'ready' || !chunkVecs) return;
            try {
                const naturalQuery = (rawQuery || '').trim();
                if (!naturalQuery) return;
                const out = await semanticEx(naturalQuery, { pooling: 'mean', normalize: true });
                if (gen !== semanticGen || rawQuery !== currentQueryRaw) return; // stale
                // The fusion's BM25 leg: intent-expanded query when the
                // grammar fired (its expansion IS knowledge), pronoun-stripped
                // natural query otherwise.
                const merged = hybridMerge(search(lastFusionQuery), out.data, lastIntentFired);
                // Commands get the semantic pass too — paraphrases of an
                // action's hints match here even when keywords whiffed.
                await ensureCmdVecs();
                if (gen !== semanticGen || rawQuery !== currentQueryRaw) return;
                lastCmdMatches = matchCommands(naturalQuery, out.data);
                if (!merged.length && !lastCmdMatches.length) return;
                renderResults(merged, lastHint);
                lastSearchResults = merged;
                updateOverview();
            } catch (err) {
                console.warn(`${logTag} Semantic refine failed:`, err?.message || err);
            }
        }

        // ============================================
        // Command Bar — matching, execution, intent cards
        // ============================================
        const curPage = (() => {
            const f = location.pathname.split('/').pop() || 'index.html';
            return f.replace(/\.html$/, '') || 'index';
        })();

        let cmdIndex = null, cmdIndexVersion = -1;
        let localCommands = null;      // synthetic per-page commands (page nav + section TOC)
        const cmdVecs = new Map();     // command id → hint embedding
        let cmdVecsVersion = -1;
        let lastCmdMatches = [];
        let lastIntentCard = null;

        // The pages can be navigated and the page's own TOC can be jumped —
        // synthesized from the DOM (the per-page .nav-right list every page
        // already maintains), so there is no anchor JSON to keep in step.
        function buildLocalCommands() {
            const cmds = [];
            const PAGES = [['index', 'Home'], ['design', 'Design'], ['art', 'Art'], ['about', 'About'], ['services', 'Services']];
            for (const [slug, name] of PAGES) {
                if (slug === curPage) continue;
                cmds.push({
                    id: 'goto:' + slug, title: 'Go to ' + name,
                    detail: slug === 'index' ? 'Open the homepage' : 'Open the ' + name.toLowerCase() + ' page',
                    tags: 'go open navigate page ' + slug,
                    hints: ['go to ' + name.toLowerCase(), 'open the ' + name.toLowerCase() + ' page', 'take me to ' + name.toLowerCase()],
                    href: getBasePath() + (slug === 'index' ? 'index.html' : slug + '.html'),
                });
            }
            document.querySelectorAll('.nav-right a[href^="#"]').forEach(a => {
                const label = a.textContent.trim();
                const hash = a.getAttribute('href');
                if (!label || hash.length < 2) return;
                cmds.push({
                    id: 'section:' + hash.slice(1), title: 'Jump to ' + label,
                    detail: 'Section on this page',
                    tags: 'go jump section show ' + label.toLowerCase(),
                    hints: ['go to ' + label.toLowerCase(), 'show me ' + label.toLowerCase(), 'jump to the ' + label.toLowerCase() + ' section'],
                    href: hash,
                });
            });
            return cmds;
        }

        function matchableCommands() {
            if (!localCommands) localCommands = buildLocalCommands();
            return registeredCommands.filter(c => !c.page || c.page === curPage).concat(localCommands);
        }

        function ensureCmdIndex() {
            if (cmdIndex && cmdIndexVersion === registryVersion) return;
            cmdIndexVersion = registryVersion;
            cmdIndex = new MiniSearch({
                fields: ['title', 'tags', 'hints'],
                storeFields: ['title'],
                searchOptions: { boost: { hints: 3, title: 2 }, fuzzy: 0.2, prefix: true }
            });
            cmdIndex.addAll(matchableCommands().map(c => ({
                id: c.id, title: c.title, tags: c.tags || '', hints: (c.hints || []).join(' ')
            })));
        }

        async function ensureCmdVecs() {
            if (semanticState !== 'ready' || cmdVecsVersion === registryVersion) return;
            cmdVecsVersion = registryVersion;
            for (const c of matchableCommands()) {
                if (cmdVecs.has(c.id)) continue;
                try {
                    const text = `${c.title}. ${(c.hints || []).join('. ')}`;
                    const out = await semanticEx(text, { pooling: 'mean', normalize: true });
                    cmdVecs.set(c.id, Float32Array.from(out.data));
                } catch { /* command just stays keyword-matched */ }
            }
        }

        function matchCommands(rawQuery, qv) {
            ensureCmdIndex();
            // Stopwords are stripped for the COMMAND search only: with a
            // ~15-doc corpus and prefix matching on, a bare "a" prefix-matches
            // "art"/"about" across three boosted fields and fabricates hits.
            const q = stripPronouns((rawQuery || '').trim())
                .replace(/\b(a|an|the|to|with|for|of|in|on|at|me|my|it|is|do|can|could|would|you|please|i)\b/gi, ' ')
                // generic command verbs appear in EVERY nav/section entry, so
                // inside this corpus they carry no signal — the object does
                .replace(/\b(go|open|show|jump|take|navigate)\b/gi, ' ')
                .replace(/\s+/g, ' ').trim();
            if (!q) return [];
            const bScore = new Map(cmdIndex.search(q).map(r => [r.id, r.score]));
            const out = [];
            for (const c of matchableCommands()) {
                // Keyword score scaled to roughly cosine range but NOT capped:
                // capping collapsed every strong match to the same value and
                // the "ranking" degenerated to registration order.
                let s = 0;
                const b = bScore.get(c.id);
                if (b) s = b / 8;
                if (qv) {
                    const v = cmdVecs.get(c.id);
                    if (v) { const cs = cosSim(qv, v); if (cs >= 0.45 && cs > s) s = cs; }
                }
                // 0.6 ≈ BM25 4.8: real hint/title matches land well above this;
                // fuzzy one-word grazes ("a call"~"art") land below it.
                if (s >= 0.6) out.push({ c, s });
            }
            out.sort((a, b) => b.s - a.s);
            return out.slice(0, 2).map(o => o.c);
        }

        function executeCommand(id) {
            const c = matchableCommands().find(x => x.id === id);
            if (!c) return;
            if (c.run) {
                try { c.run(); } catch (err) { console.error(`${logTag} Command failed:`, id, err); }
                if (config.onCommandRun) config.onCommandRun(c);
            } else if (c.href) {
                if (c.href.startsWith('#')) {
                    const t = document.getElementById(c.href.slice(1));
                    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (config.onCommandRun) config.onCommandRun(c);
                } else {
                    window.location.href = c.href;
                }
            }
        }

        // Intent cards (absorbed from SEARCH_COMMANDS): certain queries are a
        // person reaching out, not a person searching — those get a doorway,
        // not just documents.
        const INTENT_CARDS = {
            services: {
                title: 'Work with John',
                body: 'AI-native product design, design engineering, and coaching — from sprints to founding-designer engagements.',
                cta: { label: 'See services', href: 'services.html' },
                alt: { label: 'hi@johnhanacek.com', href: 'mailto:hi@johnhanacek.com' },
            },
            contact: {
                title: 'Reach John',
                body: 'Email is the fastest route; LinkedIn and Bluesky also work.',
                cta: { label: 'Email John', href: 'mailto:hi@johnhanacek.com' },
                alt: { label: 'LinkedIn', href: 'https://linkedin.com/in/johnhanacek' },
            },
            schedule: {
                title: 'Book an intro call',
                body: 'Email a couple of times that work and what you want to cover — John will confirm one.',
                cta: { label: 'Email to schedule', href: 'mailto:hi@johnhanacek.com?subject=Intro%20call' },
                alt: { label: 'Coaching options', href: 'services.html#coaching' },
            },
        };

        function resolveHref(href) {
            return /^(https?:|mailto:|#)/.test(href) ? href : getBasePath() + href;
        }

        function renderIntentCard(kind) {
            const c = INTENT_CARDS[kind];
            if (!c) return '';
            const ext = c.alt.href.startsWith('http');
            return `<div class="intent-card"><div class="intent-card-title">${c.title}</div><div class="intent-card-body">${c.body}</div><div class="intent-card-actions"><a class="intent-cta" href="${resolveHref(c.cta.href)}">${c.cta.label}</a><a class="intent-alt" href="${resolveHref(c.alt.href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${c.alt.label}</a></div></div>`;
        }

        function renderCmdCard(c) {
            const isNav = !c.run;
            return `<div class="cmd-card" data-cmd="${c.id}" role="button" tabindex="0"><span class="cmd-icon">${isNav ? '→' : '▸'}</span><span class="cmd-body"><span class="cmd-title">${c.title}</span>${c.detail ? `<span class="cmd-detail">${c.detail}</span>` : ''}</span><span class="cmd-kbd">${isNav ? 'go' : 'run'}</span></div>`;
        }

        function expandQuery(rawQuery) {
            const trimmed = rawQuery.trim();
            if (!trimmed) return { query: trimmed, hint: null };
            for (const intent of QUERY_INTENTS) {
                for (const pattern of intent.patterns) {
                    if (pattern.test(trimmed)) {
                        if (intent.expanded) return { query: intent.expanded, hint: intent.hint, originalQuery: trimmed, card: intent.card };
                        return { query: trimmed, hint: intent.hint, card: intent.card };
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
                storeFields: ['title', 'content', 'page', 'image', 'url', 'type', 'video', 'model3d'],
                searchOptions: { boost: { title: 3, tags: 2 }, fuzzy: 0.2, prefix: true }
            });

            try {
                const v = getSiteVersion();
                const response = await fetch(getBasePath() + 'Assets/search-chunks.json' + (v ? '?v=' + v : ''));
                const data = await response.json();
                chunks = data.chunks;
                miniSearchInstance.addAll(chunks);
                // Precomputed chunk vectors (if the build has run) — decoded
                // here once; the query-side embedder is a separate lazy load.
                const withVecs = chunks.filter(c => c.vec && c.vecScale);
                if (withVecs.length) {
                    chunkVecs = new Map(withVecs.map(c => [c.id, decodeVec(c.vec, c.vecScale)]));
                }
                console.log(`${logTag} Loaded ${chunks.length} chunks${chunkVecs ? ` (${chunkVecs.size} with vectors)` : ''}`);
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

        // An embedding-only model (nomic-embed-text and friends) can sit first
        // in a local server's list and cannot chat — picking it produced
        // silent garbage. Skip anything that names itself an embedder.
        function firstChatModel(list, nameOf) {
            for (const m of list || []) {
                const n = nameOf(m) || '';
                if (/embed/i.test(n)) continue;
                return n;
            }
            return null;
        }

        async function checkLocalModels() {
            try {
                const res = await fetch('http://localhost:1234/v1/models', { signal: AbortSignal.timeout(2000) });
                if (res.ok) {
                    const data = await res.json();
                    const name = firstChatModel(data.data, m => m.id);
                    if (name) return { name, source: 'LMStudio', endpoint: 'http://localhost:1234/v1/chat/completions', host: 'localhost:1234' };
                }
            } catch {}
            try {
                const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
                if (res.ok) {
                    const data = await res.json();
                    const name = firstChatModel(data.models, m => m.name);
                    if (name) return { name, source: 'Ollama', endpoint: 'http://localhost:11434/api/chat', host: 'localhost:11434' };
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

        // Routed rendering, topline down: intent card → actions → on-this-page
        // → across the site. Groups only appear when they have members, so a
        // plain content query renders exactly as it always did.
        function renderResults(results, hint) {
            const resultsEl = el('searchResults');
            if (!resultsEl) return;
            let html = '';
            if (lastIntentCard) html += renderIntentCard(lastIntentCard);
            if (lastCmdMatches.length) {
                html += `<div class="cmdbar-group-label">Actions</div>`;
                html += lastCmdMatches.map(renderCmdCard).join('');
            }
            if (results.length === 0) {
                html += `<div class="result" style="color:${mutedColor};font-family:Raleway,sans-serif;font-size:0.85rem;">${html ? 'No other results.' : 'No results found.'}</div>`;
                resultsEl.innerHTML = html;
                return;
            }
            const maxScore = results[0]?.score || 1;
            let rest = results;
            // "On this page" appears only when search already put a local
            // chunk FIRST; locals within the global top 3 may join it.
            // Locality labels relevance — it never fabricates it (the old
            // unconditional hoist put weak local matches above real answers).
            const local = (results[0] && results[0].page === curPage)
                ? results.slice(0, 3).filter(r => r.page === curPage).slice(0, 2)
                : [];
            if (local.length && results.length > local.length) {
                const localIds = new Set(local.map(r => r.id));
                rest = results.filter(r => !localIds.has(r.id));
                html += `<div class="cmdbar-group-label">On this page</div>`;
                html += local.map(r => renderResultCard(r, maxScore)).join('');
                html += `<div class="cmdbar-group-label">Across the site</div>`;
            }
            const topResults = rest.slice(0, RESULTS_PER_PAGE);
            const remaining = rest.length - RESULTS_PER_PAGE;
            html += topResults.map(r => renderResultCard(r, maxScore)).join('');
            if (remaining > 0) {
                html += `<button class="show-more-btn" onclick="this.parentNode.querySelectorAll('.result-hidden').forEach(e=>e.style.display='block');this.remove();">Show ${remaining} more</button>`;
                html += rest.slice(RESULTS_PER_PAGE).map(r => `<div class="result result-hidden" style="display:none">${renderResultCardInner(r, maxScore)}</div>`).join('');
            }
            resultsEl.innerHTML = html;
        }

        // Related chunks by cosine over the SHIPPED vectors — chunk↔chunk
        // similarity costs the visitor zero download and no embedder.
        function relatedChunks(id, n) {
            if (!chunkVecs) return [];
            const v = chunkVecs.get(id);
            if (!v) return [];
            const out = [];
            for (const c of chunks) {
                if (c.id === id) continue;
                const cv = chunkVecs.get(c.id);
                if (!cv) continue;
                const s = cosSim(v, cv);
                if (s >= 0.45) out.push({ c, s });
            }
            out.sort((a, b) => b.s - a.s);
            return out.slice(0, n).map(o => o.c);
        }

        function relatedChipHtml(c, extraClass) {
            if (!c || !c.url) return '';
            const ext = /^https?:/i.test(c.url);
            const href = ext ? c.url : resolveHref(c.url.replace(/^\.\//, ''));
            return `<a class="related-chip${extraClass ? ' ' + extraClass : ''}" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>↳ ${c.title}</a>`;
        }

        // <model-viewer> loads from CDN only when a 3D card first renders.
        let modelViewerRequested = false;
        function ensureModelViewer() {
            if (modelViewerRequested || customElements.get('model-viewer')) return;
            modelViewerRequested = true;
            const s = document.createElement('script');
            s.type = 'module';
            s.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
            document.head.appendChild(s);
        }

        function renderResultCard(r, maxScore) { return `<div class="result">${renderResultCardInner(r, maxScore)}</div>`; }
        function renderResultCardInner(r, maxScore) {
            const pct = Math.min(100, (r.score / maxScore) * 100);
            let mediaHtml = '';
            if (r.video) {
                // Click-to-play: poster (or placeholder tile) with a play glyph;
                // the embeds carry no audio track, so muted playback loses nothing.
                const poster = r.image
                    ? `<img class="result-thumb" src="${r.image}" alt="" loading="lazy" />`
                    : `<span class="result-thumb video-placeholder"></span>`;
                mediaHtml = `<span class="result-video-wrap" data-video="${r.video}" role="button" tabindex="0" aria-label="Play video">${poster}<span class="play-icon">▶</span></span>`;
            } else if (r.model3d) {
                ensureModelViewer();
                const spin = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : ' auto-rotate';
                mediaHtml = `<model-viewer class="result-model" src="${resolveHref(r.model3d)}"${spin} camera-controls loading="lazy"></model-viewer>`;
            } else if (r.image) {
                mediaHtml = `<img class="result-thumb" src="${r.image}" alt="" loading="lazy" />`;
            }
            const ext = r.url && /^https?:/i.test(r.url);
            const titleHtml = r.url
                ? `<a class="result-title result-link${ext ? ' result-link-ext' : ''}" href="${ext ? r.url : resolveHref(r.url.replace(/^\.\//, ''))}"${ext ? ' target="_blank" rel="noopener"' : ''}>${r.title}</a>`
                : `<span class="result-title">${r.title}</span>`;
            const rel = relatedChunks(r.id, 1)[0];
            const relHtml = rel ? `<div class="card-related-row">${relatedChipHtml(rel, 'card-related')}</div>` : '';
            return `<div class="result-row">${mediaHtml}<div class="result-body"><div class="result-header">${titleHtml}<span class="result-page">${r.page}</span></div><div class="result-content">${r.content}</div>${relHtml}<div class="result-bar"><span class="score-track"><span class="score-fill" style="width:${pct}%"></span></span><span class="score-num">${r.score.toFixed(0)}</span></div></div></div>`;
        }

        // ============================================
        // Overview slot (Phase 5)
        // ============================================
        // ONE slot, upgraded in place by the tiers: instantly a deterministic
        // composition from the top chunk (which is hand-authored to be
        // answer-shaped), replaced by the model's answer when a tier speaks.
        // Confidence-gated — an intent fired, or the top result dominates —
        // because an overview on a garbage query reads as bluffing.
        function buildOverviewHtml(results, hint) {
            if (!results.length || lastIntentCard) return null;
            const top = results[0];
            const confident = !!hint || results.length === 1 || (results[1] && top.score >= 1.5 * results[1].score);
            if (!confident || !top.content) return null;
            let text = top.content;
            if (text.length > 260) {
                const cut = text.slice(0, 260);
                const p = cut.lastIndexOf('. ');
                text = p > 120 ? cut.slice(0, p + 1) : cut + '…';
            }
            const lead = hint ? `<span class="overview-lead">${hint}.</span> ` : '';
            const chips = relatedChunks(top.id, 2).map(c => relatedChipHtml(c)).join('');
            return `<div class="overview-body">${lead}${text}${chips ? `<div class="overview-related">${chips}</div>` : ''}</div>`;
        }

        function updateOverview() {
            const answerEl = el('aiAnswer');
            if (isGenerating) return; // the model owns the slot right now
            const html = buildOverviewHtml(lastSearchResults, lastHint);
            if (html) {
                answerEl.style.display = 'block';
                answerEl.classList.remove('generating', 'refining');
                answerEl.innerHTML = html;
                answerEl.dataset.model = 'composed from sources';
                answerEl.dataset.overview = 'true';
            } else {
                answerEl.style.display = 'none';
                answerEl.innerHTML = '';
                delete answerEl.dataset.model;
                delete answerEl.dataset.overview;
                el('aiActions').classList.remove('visible');
            }
        }

        // The generators share the slot with the overview: while an overview
        // is showing, generation dims it instead of stomping it with a
        // spinner, and the first written token takes the slot over.
        function beginAnswer(answerEl, dot, label) {
            answerEl.style.display = 'block';
            answerEl.classList.add('generating');
            el('aiActions').classList.remove('visible');
            dot.className = 'status-dot loading';
            if (answerEl.dataset.overview === 'true') {
                answerEl.classList.add('refining');
                answerEl.dataset.pendingModel = label;
            } else {
                answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
                answerEl.dataset.model = label;
            }
        }
        function writeAnswer(answerEl, text) {
            if (answerEl.dataset.overview === 'true') {
                delete answerEl.dataset.overview;
                answerEl.classList.remove('refining');
                if (answerEl.dataset.pendingModel) answerEl.dataset.model = answerEl.dataset.pendingModel;
                delete answerEl.dataset.pendingModel;
            }
            answerEl.textContent = text;
        }

        // ============================================
        // AI Generation
        // ============================================
        // ── Tool-use (Phase 4): the registry IS the tool schema ──
        // The same commands a keyboard user fuzzy-matches are handed to the
        // local model as OpenAI-style tools. The model can only invoke what
        // structure already defines — and even then it only SUGGESTS: a tool
        // call renders as a confirm chip the visitor taps, never an auto-run.
        function toolName(id) { return id.replace(/[^a-zA-Z0-9_-]/g, '_'); }
        function buildTools() {
            return matchableCommands().map(c => ({
                type: 'function',
                function: {
                    name: toolName(c.id),
                    description: `${c.title}${c.detail ? ' — ' + c.detail : ''}`,
                    parameters: { type: 'object', properties: {} },
                },
            }));
        }
        function commandByToolName(name) {
            return matchableCommands().find(c => toolName(c.id) === name);
        }
        function renderToolChips(answerEl, calls) {
            const seen = new Set();
            const chips = calls
                .map(tc => commandByToolName(tc.name))
                .filter(c => c && !seen.has(c.id) && seen.add(c.id));
            if (!chips.length) return;
            const wrap = document.createElement('div');
            wrap.innerHTML = `<div class="cmdbar-group-label">Suggested action — tap to run</div>` + chips.map(renderCmdCard).join('');
            answerEl.appendChild(wrap);
        }

        async function generateAnswerLocal(query, results, genId, model) {
            model = model || localModel;
            const answerEl = el('aiAnswer');
            const dot = el('aiDot');
            beginAnswer(answerEl, dot, model.name.split('/').pop() + ' · ' + model.source);

            const context = results.slice(0, 8).map(r => `[${r.title}]: ${r.content}`).join('\n\n');
            const tools = (model.source === 'LMStudio' || model.source === 'Custom') ? buildTools() : null;
            const toolLine = tools && tools.length
                ? '\n- Tools are live actions on the current page. If the visitor asks you to DO something the tools cover (feed, clear, toggle, navigate), call the matching tool instead of describing it. Otherwise just answer.'
                : '';
            const messages = [
                { role: "system", content: SYSTEM_PROMPT_LOCAL + toolLine },
                { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer directly and concisely:` }
            ];

            try {
                if (model.source === 'LMStudio' || model.source === 'Custom') {
                    const body = { model: model.name, messages, max_tokens: 600, temperature: 0, stream: true };
                    if (tools && tools.length) body.tools = tools;
                    const res = await fetch(model.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`LMStudio ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`); }
                    const reader = res.body.getReader(); const decoder = new TextDecoder(); let outputText = '', reasoning = '', buffer = '';
                    const toolCalls = []; // accumulated across deltas, keyed by index
                    while (true) {
                        const { done, value } = await reader.read(); if (done) break;
                        if (genId !== currentGenId) { reader.cancel(); break; }
                        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop();
                        for (const line of lines) { const s = line.trim(); if (!s.startsWith('data:')) continue; const payload = s.slice(5).trim(); if (payload === '[DONE]') continue; try { const delta = JSON.parse(payload).choices?.[0]?.delta || {}; if (delta.reasoning_content) reasoning += delta.reasoning_content; if (delta.tool_calls) { for (const tc of delta.tool_calls) { const i = tc.index || 0; if (!toolCalls[i]) toolCalls[i] = { name: '', args: '' }; if (tc.function?.name) toolCalls[i].name += tc.function.name; if (tc.function?.arguments) toolCalls[i].args += tc.function.arguments; } } if (delta.content) { outputText += delta.content; const vis = stripThink(outputText).trimStart(); if (vis) writeAnswer(answerEl, vis); } } catch {} }
                    }
                    if (genId === currentGenId) {
                        const finalText = stripThink(outputText).trim();
                        const calls = toolCalls.filter(Boolean).filter(tc => tc.name);
                        if (!finalText && !calls.length) console.warn(`${logTag} LMStudio returned no answer — content chars:`, outputText.length, 'reasoning chars:', reasoning.length, '— a reasoning model may need a higher token budget or a non-reasoning model.');
                        writeAnswer(answerEl, finalText || (calls.length ? '' : '(No answer — the model returned only reasoning. Try a non-reasoning model.)'));
                        if (calls.length) renderToolChips(answerEl, calls);
                    }
                } else if (model.source === 'Ollama') {
                    const res = await fetch(model.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.name, messages, stream: true, options: { temperature: 0, num_predict: 600 } }) });
                    if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`Ollama ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`); }
                    const reader = res.body.getReader(); const decoder = new TextDecoder(); let outputText = '';
                    while (true) {
                        const { done, value } = await reader.read(); if (done) break;
                        if (genId !== currentGenId) { reader.cancel(); break; }
                        const text = decoder.decode(value, { stream: true });
                        for (const line of text.split('\n')) { if (!line.trim()) continue; try { const chunk = JSON.parse(line); if (chunk.message?.content) { outputText += chunk.message.content; const vis = stripThink(outputText).trimStart(); if (vis) writeAnswer(answerEl, vis); } } catch {} }
                    }
                    if (genId === currentGenId) writeAnswer(answerEl, stripThink(outputText).trim() || '(No answer generated.)');
                }
            } catch (err) {
                if (genId === currentGenId) { writeAnswer(answerEl, `Error: ${err.message}`); console.error(`${logTag} Local generation error:`, err); }
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
            beginAnswer(answerEl, dot, MODEL_DISPLAY_NAME + ' · in-browser');
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
                    streamer: new TextStreamer(processor.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (token) => { if (!isCurrent()) return; outputText += token; writeAnswer(answerEl, outputText.trimStart()); } })
                });
                if (isCurrent()) { const f = outputText.trim(); writeAnswer(answerEl, f || '(No answer generated.)'); }
            } catch (err) { if (genId === currentGenId) { writeAnswer(answerEl, `Error: ${err.message}`); console.error(`${logTag} Generation error:`, err); } }
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
                currentQueryRaw = ''; lastFusionQuery = '';
                lastCmdMatches = []; lastIntentCard = null;
                clearBtn.style.display = 'none';
                return;
            }
            clearBtn.style.display = 'block';
            const { query: expanded, hint, originalQuery, card } = expandQuery(rawQuery);
            lastIntentCard = card || null;
            lastCmdMatches = matchCommands(rawQuery, null);
            const results = search(expanded);
            sourcesSection.classList.add('visible');
            if (config.onResultsChange) config.onResultsChange(true);
            renderResults(results, hint);
            lastSearchResults = results; lastLlmQuery = originalQuery || rawQuery;
            // Semantic tier: BM25 rendered instantly above; the vectors refine
            // it in place. First real search is also what triggers the one-time
            // embedder load — until it lands, this is a no-op.
            currentQueryRaw = rawQuery;
            lastFusionQuery = originalQuery ? expanded : stripPronouns(rawQuery.trim());
            lastIntentFired = !!originalQuery;
            lastHint = hint;
            if (chunkVecs) {
                ensureSemantic();
                if (semanticState === 'ready') refineSemantic(rawQuery, ++semanticGen);
            }
            if (answerEl.style.display !== 'none' && isGenerating) answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
            updateOverview();
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

            // Action cards execute on click or Enter (delegated — cards
            // re-render). Bound on the results list AND the answer area,
            // where model-suggested tool chips render.
            function activateVideo(wrap) {
                const v = document.createElement('video');
                v.className = 'result-video';
                v.src = wrap.dataset.video;
                v.autoplay = true; v.loop = true; v.muted = true;
                v.playsInline = true; v.controls = true;
                wrap.replaceWith(v);
            }
            for (const host of [el('searchResults'), el('aiAnswer')]) {
                if (!host) continue;
                host.addEventListener('click', (e) => {
                    const vid = e.target.closest('[data-video]');
                    if (vid) { activateVideo(vid); return; }
                    const card = e.target.closest('[data-cmd]');
                    if (card) executeCommand(card.dataset.cmd);
                });
                host.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter') return;
                    const vid = e.target.closest('[data-video]');
                    if (vid) { e.preventDefault(); activateVideo(vid); return; }
                    const card = e.target.closest('[data-cmd]');
                    if (card) { e.preventDefault(); executeCommand(card.dataset.cmd); }
                });
            }

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
                    // the overview is composed, not generated — it stays
                    updateOverview();
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
            get semanticState() { return semanticState; },
            executeCommand,
            get commands() { return matchableCommands(); },
        };
    }

    window.JHSearchCore = { create, localOptedIn, register: registerCommand, MODEL_DISPLAY_NAME };
})();
