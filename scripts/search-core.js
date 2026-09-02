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

    // In-browser generation model. LFM2.5-350M replaced Qwen3.5-0.8B on
    // 2026-09-01 after measuring both on the site's real RAG prompt in Chrome
    // WebGPU on an M2 Max: Qwen took 48–109 s to its FIRST token on every
    // query (prefill, not download — decode ran at ~25 tok/s once it started)
    // and 69 s to load even from cache; LFM2.5 answers in 0.2–0.3 s to first
    // token at 45–100 tok/s, loads from cache in under a second, and is 255 MB
    // against 585. Text-only, so no vision tower rides along, and it runs on
    // the generic pipeline() rather than a model-specific class.
    // Research + numbers: Agent Reference/SEARCH_MODEL_RESEARCH.md.
    const MODEL_ID = "onnx-community/LFM2.5-350M-ONNX";
    const MODEL_DISPLAY_NAME = "LFM2.5";
    const MODEL_SIZE_LABEL = "255MB";
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
        { patterns: [/should\s+\w*\s*(hire|work\s+with|contract|engage)/i, /is\s+he\s+(good|qualified|worth|a\s+good\s+fit)/i, /why\s+\w*\s*(hire|choose|pick)\s+him/i, /what\s+makes\s+him\s+(stand\s+out|different|unique|special)/i, /why\s+should\s+\w+\s+hire/i], expanded: 'unique differentiator skills expertise experience awards shipped products design AI leadership', hint: 'Expertise, awards, and what makes him unique' },
        { patterns: [/what('s|\s+is)\s+his\s+background/i, /tell\s+me\s+about\s+(him|john|this\s+(guy|person))/i, /who\s+is\s+(he|john|this)/i, /what\s+does\s+he\s+do$/i, /^about$/i], expanded: 'about john hanacek innovator designer creator education career work history unique san diego', hint: 'Background and career overview' },
        { patterns: [/what\s+has\s+he\s+(built|made|created|shipped|designed|launched|delivered)/i, /his\s+(projects|portfolio|work)/i, /show\s+me\s+his\s+work/i, /what\s+are\s+his\s+projects/i, /shipped\s+(any|AI|products?)/i, /has\s+he\s+shipped/i], expanded: 'shipped AI products nanome badvr avatarmedic holotriage metamedium coaching built', hint: 'Shipped products and projects' },
        // v2.1 "voice in the data": the orchestration essay's ideas are chunks
        // 51–57; questions about how John THINKS route there, not to the bio
        { patterns: [/what\s+does\s+(john|he)\s+think/i, /how\s+does\s+(john|he)\s+think/i, /his\s+(philosophy|approach|views?|take|thinking|principles?)\s+(on|about|to)/i, /(philosophy|principles?|beliefs?)\s+(on|about|of)\s+(ai|agents?|orchestration|design)/i, /agent\s+orchestration/i, /multi-?agent/i], expanded: 'philosophy how he thinks agents orchestration ecosystem harness stigmergy ratchet fractal attractor polychronic beliefs', hint: 'How John thinks' },
        { patterns: [/what\s+are\s+his\s+(skills|abilities|strengths)/i, /what\s+can\s+he\s+do/i, /his\s+(expertise|capabilities|specialties)/i, /areas\s+of\s+expertise/i], expanded: 'expertise skills AI XR robotics design product LLM agent spatial computing coding engineering', hint: 'Skills and areas of expertise' },
        { patterns: [/can\s+he\s+(code|program|write\s+code|develop|build|engineer)/i, /does\s+he\s+(code|program|write\s+code|develop|build)/i, /is\s+he\s+(technical|a\s+developer|an\s+engineer)/i, /coding|programming|technical\s+skills/i, /just\s+design/i], expanded: 'code coding programming engineer technical javascript html css python unity build ship prototype design engineering', hint: 'Design engineering and coding ability' },
        // expansion leads with the DEGREE words — "research publications" in
        // here made chunk 24 (Research) outrank both schools for "where did he
        // go to school"
        { patterns: [/where\s+did\s+he\s+(go\s+to\s+school|study|graduate)/i, /his\s+education/i, /degree|university|college|school/i], expanded: 'education degree masters bachelors graduate school Georgetown UCSD university studied', hint: 'Education' },
        { patterns: [/what\s+(tools|software|stack|programs?|apps?)\s+does\s+he\s+use/i, /his\s+(tools|toolset|tool\s*chain|tech\s+stack|software)/i, /what\s+does\s+he\s+(use|work\s+in|build\s+with)/i], expanded: 'skills tools software stack figma unity blender three.js claude code ollama obsidian coda', hint: 'Tools and stack' },
        { patterns: [/has\s+he\s+won\s+(any|an)\s+(award|prize)/i, /awards?|recognition|achievement|accomplishment/i, /what\s+has\s+he\s+(won|achieved|accomplished)/i, /biggest\s+(accomplishment|achievement)/i], expanded: 'awards innovation aerospace nist microsoft founder institute accomplishment achievement won', hint: 'Awards and recognition' },
        { patterns: [/schedul(e|ing)|book\s+(a\s+)?(call|meeting|session)|availability|set\s+up\s+a\s+(call|meeting|time)/i], expanded: 'services coaching intro call consultation contact email', hint: 'How to book time with John', card: 'schedule' },
        { patterns: [/how\s+(do\s+i|can\s+i|to)\s+(contact|reach|email|message)\s+(him|john)/i, /contact|email|linkedin|twitter|social/i, /send\s+(him|john)\s+a\s+message/i], expanded: 'contact email linkedin bluesky twitter social', hint: 'Contact information', card: 'contact' },
        { patterns: [/what\s+does\s+he\s+(charge|cost)|pricing|rates?|how\s+much/i, /\bcosts?\b|\bprices?\b/i, /services?|consulting|coaching|freelance/i, /can\s+he\s+help\s+(me|us|with)/i, /i\s+need\s+help\s+with/i, /looking\s+for\s+a\s+designer/i], expanded: 'services coaching consulting design product workshops retainer sprint', hint: 'Services and engagement options', card: 'services' },
        { patterns: [/has\s+he\s+(led|managed|run)\s+(teams?|people|a\s+company)/i, /leadership|management|team\s+lead/i, /manage\s+(people|teams?|reports)/i], expanded: 'leadership team managed led CEO founder cross-functional collaboration hire people', hint: 'Leadership and team experience' },
        { patterns: [/his\s+(design\s+)?process/i, /how\s+does\s+he\s+(work|design|approach)/i, /methodology|workflow/i], expanded: 'process methodology design thinking research prototype iterate user-centered approach', hint: 'Design process and methodology' },
        { patterns: [/where\s+(does\s+he|is\s+he)\s+(live|based|located)/i, /location|city|state|san\s+diego/i, /where\s+is\s+(he|john)/i], expanded: 'san diego california location lifestyle UCSD native plants gardening outdoors', hint: 'Location and lifestyle' },
        { patterns: [/hobbies|hobby|personal|interests|outside\s+work|free\s+time|fun|for\s+fun/i, /what\s+does\s+he\s+(like|enjoy|do\s+for\s+fun)/i, /besides\s+work/i, /personal\s+(life|interests)/i], expanded: 'personal hobby cooking gardening native plants hiking camping photography food san diego outdoors', hint: 'Personal interests and hobbies' },
        { patterns: [/cook(ing|s)?|food|recipe|chef|kitchen/i], expanded: 'cooking food personal hobby recipe albondigas tahdig pasta fish brownie', hint: 'Cooking interests' },
        { patterns: [/garden(ing|s)?|plant(s|ing)?|native|nature|outdoor(s)?|hik(e|ing)|camp(ing)?/i], expanded: 'gardening native plants california outdoors hiking camping san diego nature', hint: 'Outdoor interests' },
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
        // Diagnostics stay quiet in production: opt in via ?searchDebug=1 or
        // localStorage jh-search-debug=1 to see the pipeline's breadcrumbs.
        const DEBUG = /(?:^\?|&)searchDebug=1/.test(location.search)
            || (function(){ try { return localStorage.getItem('jh-search-debug') === '1'; } catch { return false; } })();
        const log = DEBUG ? console.log.bind(console) : function(){};
        const mutedColor = config.mutedColor || 'var(--muted)';

        // ── State ──
        let chunks = [];
        let miniSearchInstance = null;
        let activeEngine = null; // 'local' | 'browser' | 'custom' | null
        let aiEnabled = true;
        let localServers = [];   // every local server that answered, with its full model list
        let localModel = null;
        let customModel = null;
        let llmModel = null, modelReady = false;
        let currentGenId = 0, isGenerating = false, pendingGen = null;
        let searchDebounce, aiDebounce, lastSearchResults = [], lastLlmQuery = '';
        let hasWebGPU = false;
        let modelIsCached = false;
        let enginesChecked = false;

        // Transformers.js imports (lazy — nothing downloads until Load is clicked).
        // llmModel holds the text-generation pipeline; `processor` is gone with
        // the vision-language model that needed one.
        let pipeline, TextStreamer;

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
            renderTierStrip();
            (async () => {
                try {
                    const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
                    // device/dtype pinned to what build-chunk-vectors.mjs used, so
                    // query and chunk vectors come from identical weights.
                    semanticEx = await mod.pipeline('feature-extraction', EMBED_MODEL_ID, { dtype: 'q8', device: 'wasm' });
                    await semanticEx('warmup', { pooling: 'mean', normalize: true });
                    semanticState = 'ready';
                    document.body.dataset.searchSemantic = 'ready';
                    renderTierStrip();
                    log(`${logTag} Semantic tier ready (MiniLM 384d · WASM)`);
                    if (currentQueryRaw) refineSemantic(currentQueryRaw, ++semanticGen);
                } catch (err) {
                    semanticState = 'failed';
                    renderTierStrip();
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
                    video: c.video, model3d: c.model3d,
                    micro: c.micro, tldr: c.tldr, facts: c.facts, pieces: c.pieces, score,
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
            } catch (err) {
                console.warn(`${logTag} Semantic refine failed:`, err?.message || err);
            }
        }


        // ============================================
        // Scene Language (Phase 6b) — the mini-MetaMedium
        // ============================================
        // One intermediate representation: entities + quantities + spatial
        // relations. Drawing produces it (recognition), language produces it
        // (this small grammar — it never bluffs; unparsed input falls through
        // to search), and the canvas answers back in it (census). The parse
        // renders as a PLAN CARD before anything executes — structure shown,
        // not inference hidden. Pages register window.JH_SCENE providers.
        let lastScenePlan = null, lastSceneCensus = null;

        const SCENE_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1, couple: 2, few: 3, some: 3, max: 'max' };
        const SCENE_ENTITY = [
            [/jelly(?:fish)?(?:es)?/, 'jellyfish'], [/fish(?:es)?/, 'fish'],
            [/corals?/, 'coral'], [/foods?|pellets?/, 'food'], [/bubbles?/, 'bubble'],
            [/circles?|rings?/, 'circle'], [/squares?|rect(?:angle)?s?|box(?:es)?/, 'square'],
            [/triangles?/, 'triangle'], [/lines?/, 'line'],
        ];
        function sceneEntity(word) {
            for (const [re, name] of SCENE_ENTITY) if (re.test(word)) return name;
            return null;
        }
        function sceneSize(s) {
            if (/small|little|tiny/.test(s)) return 'small';
            if (/medium|mid/.test(s)) return 'medium';
            if (/large|big|huge|giant/.test(s)) return 'large';
            return null;
        }
        function sceneRel(s) {
            if (/inside|into|\bin\b|within/.test(s)) return 'inside';
            if (/near|next to|beside|\bby\b|around|close to/.test(s)) return 'near';
            if (/intersect|cross/.test(s)) return 'intersect';
            return null;
        }

        // parse → null | {kind:'query', about} | {kind:'plan', steps, labels}
        function parseScene(raw) {
            const q = (raw || '').toLowerCase().trim();
            if (!q || !window.JH_SCENE) return null;

            if (/^(how many|what shapes|what is (on|in)|what's (on|in)|describe|count)\b/.test(q)) {
                const about = /shape/.test(q) ? 'shapes' : (/fish|tank/.test(q) ? 'fish' : 'scene');
                return { kind: 'query', about };
            }

            if (!/^(add|draw|put|spawn|place|make|create|give)\b/.test(q)) return null;
            const clauses = q.replace(/^(add|draw|put|spawn|place|make|create|give)\b/, '')
                .split(/,| and | then |;/).map(c => c.trim()).filter(Boolean);
            const steps = [];
            const made = [];   // utterance entities, in order, for "the circle" resolution
            for (const clause of clauses) {
                const c = clause.replace(/^(add|draw|put|spawn|place|make|create|give)\b/, '').trim();
                // count
                let count = 1, rest = c;
                const nm = rest.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|couple(?: of)?|few|some|max)\s+/);
                if (nm) {
                    const w = nm[1].replace(/ of$/, '');
                    count = /^\d+$/.test(w) ? parseInt(w, 10) : SCENE_NUM[w] ?? 1;
                    rest = rest.slice(nm[0].length);
                }
                // "two intersecting lines" — mutual relation as modifier
                const mutual = /^(intersecting|crossing|crossed)\s+/.test(rest);
                if (mutual) rest = rest.replace(/^(intersecting|crossing|crossed)\s+/, '');
                const size = sceneSize(rest);
                if (size) rest = rest.replace(/\b(small|little|tiny|medium|mid|large|big|huge|giant)\b\s*/, '');
                const em = rest.match(/^([a-z]+)/);
                const entity = em && sceneEntity(em[1]);
                if (!entity) return null;   // never bluff — unparsed falls to search
                rest = rest.slice(em[0].length).trim();
                // relation + reference
                let rel = null;
                const rm = rest.match(/^(inside|into|in|within|near|next to|beside|by|around|close to)\s+(.*)$/);
                if (mutual) {
                    rel = { type: 'intersect', mutual: true };
                    if (count < 2) count = 2;
                } else if (rm) {
                    const type = sceneRel(rm[1]);
                    const refText = rm[2].trim();
                    const refEm = refText.match(/(?:the|a|an|that)?\s*([a-z]+)/);
                    const refEntity = refEm && sceneEntity(refEm[1]);
                    if (!type || !refEntity) return null;
                    // "the X" → latest X made in this utterance, else the canvas's latest X
                    const idx = made.map(m => m.entity).lastIndexOf(refEntity);
                    rel = { type, ref: idx >= 0 ? idx : null, refEntity };
                }
                const step = { count, size, entity, rel, label: entity + '\u2460'.charCodeAt ? '' : '' };
                steps.push(step);
                for (let i = 0; i < count; i++) made.push({ entity, step });
                if (steps.length > 6) return null;   // scope guard
            }
            if (!steps.length) return null;
            return { kind: 'plan', steps };
        }

        // ── stroke synthesis kit (handed to providers) ──
        function ptsClosed(fn, n) {
            const pts = [];
            for (let i = 0; i <= n; i++) pts.push(fn(i / n));
            return pts;
        }
        const sceneKit = {
            circle: (cx, cy, r) => ptsClosed(t => ({ x: cx + Math.cos(t * 2 * Math.PI) * r, y: cy + Math.sin(t * 2 * Math.PI) * r }), 26),
            square: (cx, cy, s) => {
                const h = s / 2, cs = [[-h, -h], [h, -h], [h, h], [-h, h]];
                const pts = [];
                for (let e = 0; e < 4; e++) {
                    const [x1, y1] = cs[e], [x2, y2] = cs[(e + 1) % 4];
                    for (let i = 0; i < 7; i++) pts.push({ x: cx + x1 + (x2 - x1) * i / 7, y: cy + y1 + (y2 - y1) * i / 7 });
                }
                pts.push({ x: cx + cs[0][0], y: cy + cs[0][1] });
                return pts;
            },
            triangle: (cx, cy, s) => {
                const h = s / 2, cs = [[0, -h], [h, h * 0.9], [-h, h * 0.9]];
                const pts = [];
                for (let e = 0; e < 3; e++) {
                    const [x1, y1] = cs[e], [x2, y2] = cs[(e + 1) % 3];
                    for (let i = 0; i < 9; i++) pts.push({ x: cx + x1 + (x2 - x1) * i / 9, y: cy + y1 + (y2 - y1) * i / 9 });
                }
                pts.push({ x: cx + cs[0][0], y: cy + cs[0][1] });
                return pts;
            },
            line: (x1, y1, x2, y2) => ptsClosed(t => ({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }), 12),
            // the open, self-crossing loop the classifier reads as a fish;
            // scale sets the behavior tier (see CONTROL_SURFACES §1)
            ichthys: (cx, cy, tier) => {
                const S = tier === 'large' ? 1.55 : tier === 'medium' ? 1.0 : 0.62;
                const rx = 45 * S, ry = 32 * S, ov = 0.55, tx = 75 * S, ty = 28 * S;
                const pts = [];
                const a0 = ov, a1 = Math.PI * 2 - ov;
                const sx = cx + rx * Math.cos(a0), sy = cy + ry * Math.sin(a0);
                for (let i = 0; i <= 3; i++) pts.push({ x: (cx + tx) + (sx - cx - tx) * i / 4, y: (cy - ty) + (sy - cy + ty) * i / 4 });
                for (let i = 0; i <= 26; i++) { const a = a0 + (a1 - a0) * i / 26; pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }); }
                const ex = cx + rx * Math.cos(a1), ey = cy + ry * Math.sin(a1);
                for (let i = 1; i <= 4; i++) pts.push({ x: ex + (cx + tx - ex) * i / 4, y: ey + (cy + ty - ey) * i / 4 });
                return pts;
            },
            // greedy placement: sequential, verified after — not a solver
            place: {
                near: (ref, size) => {
                    const a = Math.random() * 2 * Math.PI;
                    const d = (ref.size || 60) / 2 + size / 2 + 34;
                    return { x: ref.x + Math.cos(a) * d, y: ref.y + Math.sin(a) * d };
                },
                crossPair: (cx, cy) => [
                    [cx - 85, cy - 55, cx + 85, cy + 55],
                    [cx - 85, cy + 55, cx + 85, cy - 55],
                ],
            },
        };

        function scenePlural(entity, n) {
            if (n === 1) return entity;
            if (['fish', 'food', 'coral', 'jellyfish'].includes(entity)) return entity;
            return entity + 's';
        }

        function renderPlanCard(plan) {
            // an executed plan renders its receipts — any later re-render
            // (semantic upgrade, density toggle) must not resurrect the button
            if (plan.receipts) {
                return `<div class="pc-plan" data-scene-plan="1"><div class="cmdbar-group-label">Done — receipts</div>`
                    + `<div class="pc-plan-steps">${plan.receipts.map(r => `<span class="pc-plan-step">${r}</span>`).join('')}</div></div>`;
            }
            const stepText = (s) => {
                let t = s.count === 'max' ? 'max' : s.count;
                t += ' ' + (s.size ? s.size + ' ' : '') + scenePlural(s.entity, s.count === 'max' ? 2 : s.count);
                if (s.rel && s.rel.mutual) t += ', intersecting';
                else if (s.rel) t += ` ${s.rel.type} the ${s.rel.refEntity}`;
                return t;
            };
            return `<div class="pc-plan" data-scene-plan="1"><div class="cmdbar-group-label">Plan — the parse, before anything runs</div>`
                + `<div class="pc-plan-steps">${plan.steps.map(s => `<span class="pc-plan-step">→ ${stepText(s)}</span>`).join('')}</div>`
                + `<div class="pc-plan-actions"><button class="intent-cta" data-scene-run="1">Draw it</button>`
                + `<span class="pc-plan-note">runs on the canvas behind this panel</span></div></div>`;
        }

        async function executeScene(plan) {
            const provider = window.JH_SCENE;
            if (!provider) return;
            const receipts = [];
            const madeRefs = [];   // placement info per created entity, for "the circle"
            for (const step of plan.steps) {
                try {
                    const out = await provider.materialize(step, sceneKit, madeRefs);
                    (out.made || []).forEach(m => madeRefs.push(m));
                    receipts.push(out.note || ('✓ ' + step.entity));
                } catch (err) {
                    receipts.push('✗ ' + step.entity + ' — ' + (err?.message || 'failed'));
                    console.warn(`${logTag} scene step failed:`, step, err);
                }
            }
            plan.receipts = receipts;
            const card = el('searchResults').querySelector('[data-scene-plan]')
                || el('aiAnswer').querySelector('[data-scene-plan]');
            if (card) card.innerHTML = `<div class="cmdbar-group-label">Done — receipts</div>`
                + `<div class="pc-plan-steps">${receipts.map(r => `<span class="pc-plan-step">${r}</span>`).join('')}</div>`;
            // let the receipts read, then show the canvas itself
            setTimeout(() => { if (config.onCommandRun) config.onCommandRun({ id: 'scene' }); }, 1400);
        }

        function renderCensusHtml() {
            const provider = window.JH_SCENE;
            if (!provider || !lastSceneCensus) return '';
            let c;
            try { c = provider.census(); } catch { return ''; }
            if (!c) return '';
            const bits = [];
            const n = (v, label) => { if (v > 0) bits.push(`<span class="pc-count"><strong>${v}</strong> ${label}</span>`); };
            n(c.smallFish, 'small'); n(c.mediumFish, 'medium'); n(c.largeFish, 'large');
            if ((c.smallFish + c.mediumFish + c.largeFish) > 0) bits.push('<span class="pc-count-unit">fish</span>');
            else bits.push('<span class="pc-count"><strong>0</strong> fish</span>');
            n(c.coral, 'coral'); n(c.food, 'food'); n(c.bubbles, 'bubbles'); n(c.jellyfish, 'jellyfish');
            if (c.shapes && c.shapes.length) {
                const byType = {};
                c.shapes.forEach(s => { byType[s.type] = (byType[s.type] || 0) + 1; });
                bits.push('<span class="pc-sep">·</span>');
                Object.entries(byType).forEach(([t, v]) => bits.push(`<span class="pc-count"><strong>${v}</strong> ${t}${v > 1 ? 's' : ''}</span>`));
            }
            if (c.enclosed > 0) bits.push(`<span class="pc-sep">·</span><span class="pc-count"><strong>${c.enclosed}</strong> enclosed</span>`);
            return `<div class="pc-census"><div class="cmdbar-group-label">read from the canvas</div>`
                + `<div class="pc-census-row">${bits.join(' ')}</div></div>`;
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
            const rawWords = (rawQuery || '').trim().split(/\s+/).filter(Boolean).length;
            const q = stripPronouns((rawQuery || '').trim())
                .replace(/\b(a|an|the|to|with|for|of|in|on|at|me|my|it|is|do|can|could|would|you|please|i)\b/gi, ' ')
                // generic command verbs appear in EVERY nav/section entry, so
                // inside this corpus they carry no signal — the object does
                .replace(/\b(go|open|show|jump|take|navigate)\b/gi, ' ')
                // QUESTION words are noise here too: "Toggle logic view" hints
                // "what are the fish thinking", so a bare "what" grazed it and
                // the fish action rode along on "what has he shipped", "what
                // awards has he won", "what does he cook"… — an aquarium
                // control answering a hiring question. (A hint still matches
                // on its content words — "fish thinking".)
                .replace(/\b(what|what's|whats|how|who|where|when|why|which|does|did|has|have|had|he|his|him|she|her|are|was|were|be|been|tell|explain|about|there)\b/gi, (m) =>
                    // "about" as the query's LAST word is the About page
                    // ("about", "jump to about"); mid-sentence it is a
                    // preposition ("tell me about the fish") and noise
                    (/^about$/i.test(m) && /\babout\s*$/i.test(rawQuery || '')) ? m : ' ')
                // single-char orphans: "who's" tokenizes to who + s, and a
                // bare "s" prefix-matches Startle/Scare/Services/Section —
                // fabricating action cards for informational queries
                .replace(/\b\w\b/g, ' ')
                .replace(/\s+/g, ' ').trim();
            if (!q) return [];
            const qTokens = q.split(' ').length;
            const bScore = new Map(), bTerms = new Map();
            for (const r of cmdIndex.search(q)) { bScore.set(r.id, r.score); bTerms.set(r.id, (r.terms || []).length); }
            const out = [];
            for (const c of matchableCommands()) {
                // Keyword score scaled to roughly cosine range but NOT capped:
                // capping collapsed every strong match to the same value and
                // the "ranking" degenerated to registration order.
                let s = 0;
                const b = bScore.get(c.id);
                // A LONG query (3+ content words) must meet a command on at
                // least two terms — one shared word inside a sentence is a
                // graze, not an instruction. Short imperatives ("feed",
                // "scare fish") still match on one.
                if (b && !(qTokens >= 3 && (bTerms.get(c.id) || 0) < 2)) s = b / 8;
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
                    markContinuity();
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
            const altTitle = ext ? ' title="Leaves the site — your search is kept"' : '';
            return `<div class="intent-card"><div class="intent-card-title">${c.title}</div><div class="intent-card-body">${c.body}</div><div class="intent-card-actions"><a class="intent-cta" href="${resolveHref(c.cta.href)}">${c.cta.label}</a><a class="intent-alt" href="${resolveHref(c.alt.href)}"${ext ? ' target="_blank" rel="me noopener"' : ''}${altTitle}>${c.alt.label}</a></div></div>`;
        }

        function renderCmdCard(c) {
            const isNav = !c.run;
            return `<div class="cmd-card" data-cmd="${c.id}" role="button" tabindex="0"><span class="cmd-icon">${isNav ? '→' : '▸'}</span><span class="cmd-body"><span class="cmd-title">${c.title}</span>${c.detail ? `<span class="cmd-detail">${c.detail}</span>` : ''}</span><span class="cmd-kbd">${isNav ? 'go' : 'run'}</span></div>`;
        }

        // Piece queries get the rail: an intent match sets pieceRail and
        // renderResults collects the top results' pieces into one strip.
        // Deliberately NARROW: browsy words only. A specific query like
        // "fish minigame" must rank its own chunk, not get hijacked into the
        // demo sweep (found the hard way — 'minigame' was in this list).
        const PIECE_INTENT = { patterns: [/\b(demos?|widgets?|experiments?|playground|interactive stuff|what can i (play|try))\b/i], expanded: 'playground demos interactive experiments canvas minigame live fish', hint: 'Live pieces — tap ▶ to wake', pieceRail: true };
        function expandQuery(rawQuery) {
            const trimmed = rawQuery.trim();
            if (!trimmed) return { query: trimmed, hint: null };
            for (const pattern of PIECE_INTENT.patterns) {
                if (pattern.test(trimmed)) return { query: PIECE_INTENT.expanded, hint: PIECE_INTENT.hint, originalQuery: trimmed, pieceRail: true };
            }
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
            applyDensityFlag();
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
                storeFields: ['title', 'content', 'page', 'image', 'url', 'type', 'video', 'model3d', 'micro', 'tldr', 'facts', 'pieces'],
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
                log(`${logTag} Loaded ${chunks.length} chunks${chunkVecs ? ` (${chunkVecs.size} with vectors)` : ''}`);
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


        // ============================================
        // The Tier Strip — one line that IS the intelligence ladder
        // ============================================
        // Left→right ascending: keyword → semantic → lfm (in-browser; the seg key
        // stays 'qwen' for the tests and CSS that grew up with it) → local (→ custom).
        // Facts render as facts (keyword/semantic are never buttons that lie),
        // loadable tiers wear their cost as their label ("qwen ↓585mb"), the
        // active generation engine glows in its color, and the whole state is
        // legible with the detail panel closed. Clicks proxy to the existing
        // panel controls, so consent semantics (Detect = opt-in) are unchanged.
        let browserLoadPct = null;
        function renderTierStrip() {
            const strip = el('tierStrip');
            if (!strip) return;
            const seg = (tier, dot, label, state, title, color) =>
                `<button type="button" class="tier tier-${state}" data-tier="${tier}" title="${title}"${color ? ` style="--tier-color:${color}"` : ''}><span class="tier-dot">${dot}</span>${label}</button>`;
            let html = '';
            html += seg('keyword', '\u25cf', 'keyword', 'fact-on', 'BM25 keyword match \u2014 always on');
            const semTitle = 'meaning match \u2014 ~24MB on-device, loads with your first search';
            if (semanticState === 'ready') html += seg('semantic', '\u25cf', 'semantic', 'fact-on', semTitle);
            else if (semanticState === 'loading') html += seg('semantic', '\u25d0', 'semantic', 'loading', 'meaning match \u2014 loading\u2026');
            else if (semanticState === 'failed') html += seg('semantic', '\u25cb', 'semantic', 'gone', 'meaning match unavailable');
            else html += seg('semantic', '\u25cb', 'semantic', 'fact-off', semTitle);
            // qwen (in-browser generation)
            if (!hasWebGPU && enginesChecked) {
                html += seg('qwen', '\u25cb', 'lfm', 'gone', 'in-browser model needs WebGPU \u2014 unavailable here (Safari: onnxruntime cannot start its WebGPU backend)');
            } else if (browserLoadPct != null) {
                html += seg('qwen', '\u25d0', `lfm ${browserLoadPct}%`, 'loading', `loading ${MODEL_DISPLAY_NAME}\u2026`, 'var(--engine-browser)');
            } else if (modelReady) {
                const st = (activeEngine === 'browser' && aiEnabled) ? 'active' : 'ready';
                html += seg('qwen', '\u25cf', 'lfm', st, `${MODEL_DISPLAY_NAME} in-browser \u2014 tap to answer with it`, 'var(--engine-browser)');
            } else {
                html += seg('qwen', '\u25cb', modelIsCached ? 'lfm \u26a1' : `lfm \u2193${MODEL_SIZE_LABEL.toLowerCase()}`, 'load',
                    modelIsCached ? `${MODEL_DISPLAY_NAME} \u2014 cached, tap to load` : `${MODEL_DISPLAY_NAME} in-browser \u2014 tap to download (${MODEL_SIZE_LABEL}, WebGPU)`, 'var(--engine-browser)');
            }
            // local
            if (localModel) {
                const st = (activeEngine === 'local' && aiEnabled) ? 'active' : 'ready';
                const color = localModel.source === 'Ollama' ? 'var(--engine-ollama)' : 'var(--engine-lmstudio)';
                html += seg('local', '\u25cf', localModel.name.split('/').pop().slice(0, 16), st, localModel.source + ' \u2014 tap to answer with it', color);
            } else {
                html += seg('local', '\u25cb', 'local', 'load', 'LMStudio/Ollama on this machine \u2014 tap to detect (asks your browser for local access)', 'var(--engine-lmstudio)');
            }
            if (customModel) {
                const st = (activeEngine === 'custom' && aiEnabled) ? 'active' : 'ready';
                html += seg('custom', '\u25cf', 'custom', st, customModel.name + ' \u2014 tap to answer with it', 'var(--engine-custom)');
            }
            html += seg('ai', aiEnabled ? '\u23fb' : '\u25cb', aiEnabled ? 'ai on' : 'ai off', aiEnabled ? 'ai-on' : 'ai-off', 'toggle AI answers');
            strip.innerHTML = html;
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
                renderTierStrip();   // the early return must not skip the strip
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
            renderTierStrip();
        }

        function setActiveEngine(engine, opts) {
            const changed = activeEngine !== engine;
            activeEngine = engine;
            if (engine) aiEnabled = true;
            updateEngineBar();
            broadcastEngineState();
            localStorage.setItem('searchActiveEngine', engine || '');
            // Picking an engine with a question already on screen must ANSWER
            // it. Generation was only ever kicked from runQuery() — i.e. on
            // INPUT — so selecting a model after typing relabelled the strip
            // and did nothing else; only a reload, which replays the query out
            // of session storage, appeared to "fix" it. The AI toggle right
            // below already carries this exact clause; setActiveEngine simply
            // never got it.
            if (changed && (!opts || opts.generate !== false)) kickGeneration();
        }

        // NEVER SEND A PARTIAL. lastLlmQuery and lastSearchResults are both
        // assigned together, after a search settles (and cleared together when
        // the box empties), so gating on them means we can only ever fire on a
        // complete query with real results behind it — never on a half-typed
        // string, and never at boot-time engine restore, where no query exists
        // yet. isGenerating keeps a second request from stacking on the first.
        function kickGeneration(force) {
            if (!aiEnabled || !hasAnyEngine()) return false;
            if (!lastLlmQuery.trim() || lastSearchResults.length === 0) return false;
            // the comment above says "never at boot-time engine restore, where
            // no query exists yet" — the residue restore BROKE that assumption
            // (a restored session HAS a query): a kept answer stands, never
            // auto-regenerated under it (10b contract)
            if (el('aiAnswer').dataset.restored && !force) return false;
            if (isGenerating && !force) return false;
            doAIGeneration();
            return true;
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
            // Desktop Safari too: Safari 26 exposes a WebGPU adapter (with
            // shader-f16, even) but onnxruntime-web's WebGPU backend cannot
            // initialise on WebKit — every load, any model, ends in
            // "no available backend found. ERR: [webgpu] TypeError:
            // De().webgpuInit is not a function" (reproduced 2026-09-01 in
            // WebKit with Transformers.js 4.2.0, the newest release). Better
            // to say so up front than to let a visitor download 255 MB into an
            // "Error — retry" that no retry can fix. Same override as iOS.
            const isSafari = /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg\//.test(navigator.userAgent);
            const forceWebGPU = localStorage.getItem('jh-force-webgpu') === 'true';
            const webgpuBlocked = (isIOS || isSafari) && !forceWebGPU;

            if (webgpuBlocked) {
                log(`${logTag} ${isIOS ? 'iOS' : 'Safari'} detected — in-browser WebGPU model disabled (${isIOS ? 'crashes Safari' : 'onnxruntime-web WebGPU backend does not initialise on WebKit'}). Override: localStorage.setItem("jh-force-webgpu", "true")`);
            }

            const webgpuBadge = el('webgpuBadge');
            if (navigator.gpu && !webgpuBlocked) {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    hasWebGPU = true;
                    if (webgpuBadge) { webgpuBadge.textContent = 'WebGPU'; webgpuBadge.className = 'popover-section-badge badge-webgpu'; }
                } else {
                    if (webgpuBadge) { webgpuBadge.textContent = 'No adapter'; }
                }
            } else {
                if (webgpuBadge) {
                    webgpuBadge.textContent = isIOS ? 'iOS — disabled' : (isSafari ? 'Safari — unsupported' : 'No WebGPU');
                    // John (2026-08-31): say unsupported, and point at Chrome
                    if (isSafari) webgpuBadge.title = 'Safari cannot run the in-browser model (its WebGPU runtime never initializes) — try this site in Chrome or Edge';
                }
            }

            const btn = el('enableBtn');
            if (!hasWebGPU) {
                if (btn) {
                    btn.textContent = isSafari && !isIOS ? 'Not in Safari' : 'No WebGPU'; btn.disabled = true;
                    if (isSafari) btn.title = 'Try in Chrome — the in-browser model needs a WebGPU runtime Safari does not provide yet';
                }
            } else {
                modelIsCached = await checkModelCache();
                const cacheHint = el('cacheHint');
                // Re-enable explicitly: an earlier pass may have disabled this while
                // WebGPU was still undetermined, and a stale disabled flag is the
                // difference between "the model loads" and "nothing happens".
                if (btn && !modelReady) btn.disabled = false;
                if (modelIsCached) {
                    if (btn) { btn.textContent = 'Load \u26a1'; btn.classList.add('cached'); }
                    if (cacheHint) cacheHint.textContent = 'Cached — loads in seconds';
                } else {
                    if (btn) btn.textContent = `Download ${MODEL_SIZE_LABEL}`;
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
                renderTierStrip();
                return;
            }

            localModel = await checkLocalModels();
            if (localModel) {
                rememberLocalOptIn();
                log(`${logTag} Local: ${localServers.length} server(s), ${localServers.reduce((n, sv) => n + sv.models.length, 0)} chat model(s); using ${localModel.name} via ${localModel.source}`);
                applyLocalModel();
                setActiveEngine('local');
            } else {
                applyLocalModel();
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
            renderTierStrip();
        }

        async function checkModelCache() {
            try {
                const names = await caches.keys();
                for (const name of names) {
                    const cache = await caches.open(name);
                    const keys = await cache.keys();
                    if (keys.filter(r => r.url.includes(MODEL_ID.split('/').pop())).length >= 3) return true;
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

        // Every chat model a server offers, not just the first. firstChatModel
        // skipped embedders and stopped; this keeps the whole list so the
        // visitor can pick, and reports what was hidden and why.
        function chatModels(list, nameOf) {
            const out = [], skipped = [];
            for (const m of list || []) {
                const n = nameOf(m) || '';
                if (!n) continue;
                if (/embed/i.test(n)) { skipped.push(n); continue; }
                out.push(n);
            }
            return { models: out, skipped };
        }

        // BOTH servers, in parallel. This used to `return` on the first one that
        // answered, so a running LMStudio meant Ollama was never probed at all —
        // two servers could not be offered because the second was never seen.
        // Parallel also makes the worst case one 2s timeout instead of two.
        async function checkLocalServers() {
            const probes = [
                { source: 'LMStudio', host: 'localhost:1234',
                  list: 'http://localhost:1234/v1/models',
                  endpoint: 'http://localhost:1234/v1/chat/completions',
                  pick: (d) => chatModels(d.data, m => m.id) },
                { source: 'Ollama', host: 'localhost:11434',
                  list: 'http://localhost:11434/api/tags',
                  endpoint: 'http://localhost:11434/api/chat',
                  pick: (d) => chatModels(d.models, m => m.name) },
            ];
            const settled = await Promise.allSettled(probes.map(async (pr) => {
                const res = await fetch(pr.list, { signal: AbortSignal.timeout(2000) });
                if (!res.ok) throw new Error(String(res.status));
                const { models, skipped } = pr.pick(await res.json());
                if (!models.length && !skipped.length) throw new Error('no models');
                return { source: pr.source, host: pr.host, endpoint: pr.endpoint, models, skipped };
            }));
            return settled.filter(r => r.status === 'fulfilled').map(r => r.value);
        }

        // The chosen {host, model} survives a reload, but ONLY as a preference:
        // it is honoured when that server still offers that model, and quietly
        // ignored otherwise. A remembered pointer at something that is no longer
        // running is worse than no memory at all.
        const LOCAL_PICK_KEY = 'jh-local-llm-pick';
        function savedLocalPick() {
            try { return JSON.parse(localStorage.getItem(LOCAL_PICK_KEY) || 'null'); } catch { return null; }
        }
        function rememberLocalPick(host, model) {
            try { localStorage.setItem(LOCAL_PICK_KEY, JSON.stringify({ host, model })); } catch {}
        }

        function modelFrom(server, name) {
            return { name, source: server.source, endpoint: server.endpoint, host: server.host };
        }

        function resolveLocalChoice(servers) {
            if (!servers.length) return null;
            const want = savedLocalPick();
            if (want) {
                const srv = servers.find(sv => sv.host === want.host);
                if (srv && srv.models.includes(want.model)) return modelFrom(srv, want.model);
            }
            const first = servers.find(sv => sv.models.length);
            return first ? modelFrom(first, first.models[0]) : null;
        }

        async function checkLocalModels() {
            localServers = await checkLocalServers();
            return resolveLocalChoice(localServers);
        }

        // Why "Not found" — said out loud. Every failure a fetch to localhost
        // can have arrives as the same opaque TypeError (connection refused,
        // Chrome's local-network permission denied, Ollama's 403 without CORS
        // headers, Safari's mixed-content block), so the browser cannot be
        // asked which one it was. The environment CAN be read, and it names
        // the cause in the two cases that matter most:
        //  - Safari on the https site blocks http://localhost outright
        //    ("[blocked] … requested insecure content" — verified in WebKit).
        //    No setting fixes it; nothing on this page can reach a local server.
        //  - Chrome on the https site asks for local-network permission, and
        //    Ollama additionally answers 403 unless OLLAMA_ORIGINS admits the
        //    site (verified with curl against a running Ollama).
        function localProbeDiagnosis() {
            const https = location.protocol === 'https:';
            const ua = navigator.userAgent;
            const isSafari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg\//.test(ua);
            if (https && isSafari) {
                return 'Safari blocks this https page from reaching http://localhost — a local model needs Chrome or Firefox here';
            }
            if (https) {
                return 'nothing answered on :1234 / :11434 — allow the local-network prompt if one appeared; Ollama also needs OLLAMA_ORIGINS to include this site';
            }
            return 'nothing answered on :1234 / :11434 — is the server running with CORS on? (Ollama: OLLAMA_ORIGINS)';
        }

        // The picker. One row per model per server, so two running servers are
        // two labelled groups rather than a coin flip resolved by probe order.
        // Rendered into a container the shells provide; absent container = no-op,
        // so a shell that has not adopted it degrades to the single-model row.
        function renderLocalPicker() {
            const box = el('localPicker');
            if (!box) return;
            if (!localServers.length) { box.innerHTML = ''; box.classList.remove('has-choice'); return; }
            const total = localServers.reduce((n, sv) => n + sv.models.length, 0);
            const skipped = localServers.reduce((n, sv) => n + sv.skipped.length, 0);
            // ONE native <select>, servers as optgroups (John, 2026-08-31: "a
            // better way to select… both detectable and manual, with a default
            // chosen by the site — whatever hits — and then they can edit").
            // Detection picks the first model that answered; the select shows
            // it and swaps it in one gesture. A stack of buttons per model read
            // as a list to scan, not a control to change.
            let html = '';
            if (total) {
                html += `<label class="lp-select-wrap"><span class="lp-select-label">model</span><select class="lp-select" aria-label="Local model">`;
                for (const sv of localServers) {
                    if (!sv.models.length) continue;
                    html += `<optgroup label="${sv.source} · ${sv.host}">`;
                    for (const m of sv.models) {
                        const on = localModel && localModel.host === sv.host && localModel.name === m;
                        html += `<option value="${sv.host}|${encodeURIComponent(m)}"${on ? ' selected' : ''}>${m.split('/').pop()}</option>`;
                    }
                    html += `</optgroup>`;
                }
                html += `</select></label>`;
            }
            for (const sv of localServers) {
                // An embedding-only server used to show NOTHING and explain
                // nothing — you were left wondering why your running Ollama was
                // invisible. Say it instead.
                if (!sv.models.length && sv.skipped.length) {
                    html += `<div class="lp-empty">${sv.source} at ${sv.host}: only embedding models — they cannot chat</div>`;
                }
            }
            if (skipped && total) html += `<div class="lp-empty">${skipped} embedding model${skipped > 1 ? 's' : ''} hidden</div>`;
            box.innerHTML = html;
            box.classList.toggle('has-choice', total > 0);
        }

        // ONE place that reflects `localModel` into the section. Detection ran in
        // two code paths — the opt-in scan and the Detect button — each with its
        // own copy of the same five DOM writes, and they had already drifted
        // (only one of them ever got the picker). Now they share this.
        function applyLocalModel() {
            const sec = el('localModelSection');
            if (sec) sec.classList.add('detected');
            if (localModel) {
                const nameEl = el('localModelName'), srcEl = el('localModelSource'), detEl = el('localModelDetail');
                if (nameEl) nameEl.textContent = localModel.name.split('/').pop();
                if (srcEl) { srcEl.textContent = localModel.source; srcEl.className = 'popover-section-badge badge-' + localModel.source.toLowerCase(); }
                if (detEl) detEl.textContent = localModel.host;
            }
            renderLocalPicker();
            const btn = el('detectLocalBtn');
            if (!btn) return;
            // Rescan stays ENABLED on success. It used to disable itself, so
            // starting a second server or swapping the loaded model could not be
            // noticed short of a page reload.
            btn.disabled = false;
            btn.classList.toggle('model-active', !!localModel);
            btn.textContent = localModel ? '\u21bb Rescan' : 'Detect';
        }

        function pickLocalModel(host, name) {
            const sv = localServers.find(s2 => s2.host === host);
            if (!sv || !sv.models.includes(name)) return;
            localModel = modelFrom(sv, name);
            rememberLocalPick(host, name);
            const nameEl = el('localModelName'), srcEl = el('localModelSource'), detEl = el('localModelDetail');
            if (nameEl) nameEl.textContent = name.split('/').pop();
            if (srcEl) { srcEl.textContent = sv.source; srcEl.className = 'popover-section-badge badge-' + sv.source.toLowerCase(); }
            if (detEl) detEl.textContent = sv.host;
            renderLocalPicker();
            // setActiveEngine kicks generation when the engine CHANGES; picking a
            // different model on an already-active local engine is not a change,
            // so ask for the answer explicitly.
            if (activeEngine === 'local') { renderTierStrip(); updateEngineBar(); kickGeneration(true); }
            else setActiveEngine('local');
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
                // 0.45 was a hard gate in a space whose genuine neighbours sit
                // at 0.37–0.45: for Earth Star the NEAREST chunk scored 0.447,
                // so nothing qualified and the workspace pane rendered its lead
                // over an empty column. The top-N cap already does the limiting;
                // this floor only has to exclude the unrelated tail.
                if (s >= 0.32) out.push({ c, s });
            }
            out.sort((a, b) => b.s - a.s);
            return out.slice(0, n).map(o => o.c);
        }

        function relatedChipHtml(c, extraClass) {
            if (!c || !c.url) return '';
            const ext = /^https?:/i.test(c.url);
            if (ext) {
                // chip-scale departure: glyph + hostname; the full card lives
                // where the chunk has room
                let host = c.url; try { host = new URL(c.url).hostname; } catch {}
                return `<a class="related-chip departure-chip${extraClass ? ' ' + extraClass : ''}" href="${c.url}" target="_blank" rel="me noopener" title="${c.title} — leaves the site; your search is kept">↗ ${host}</a>`;
            }
            // A chip that OPENS the page you are already reading is a no-op
            // dressed as navigation — drop it rather than reload in place.
            const target = c.url.replace(/^\.\//, '').replace(/\.html$/, '').replace(/#.*$/, '');
            if ((target || 'index') === curPage) return '';
            const href = resolveHref(c.url.replace(/^\.\//, ''));
            // the trailing ↗ marks every chip that OPENS a page (badge grammar)
            return `<a class="related-chip${extraClass ? ' ' + extraClass : ''}" href="${href}">↳ ${c.title} ↗</a>`;
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

        // ============================================
        // The Postcard (Phase 6a) — microdense, density-adaptive surface
        // ============================================
        // One composed surface whose density adapts to query specificity.
        // LOD ladder per module: L0 inline mention → L1 one-liner → L2 dense
        // sentence → L3 dossier (prose flowing BOTH sides of an inline media
        // obstacle via pretext-wrap). The allocator picks each module's
        // largest LOD that fits the line budget, using pretext's arithmetic
        // line counting — deterministic typography, no clamp guessing.
        // Chunks carry dev-time-authored `micro` (~40ch) and `tldr` (~110ch)
        // fields; the runtime only ever SELECTS, never generates.
        let pretextMod = null, pretextWrapMod = null, pretextState = 'idle';
        const preparedCache = new Map();
        let currentWrap = null;       // live pretext-wrap instance (destroy before re-render)
        let tipEl = null;             // the one shared hover-tooltip node

        function pcDensity() {
            try { return localStorage.getItem('jh-postcard-density') || 'compact'; } catch { return 'compact'; }
        }
        // the density is a GLOBAL semantic-zoom state — frames scale with it
        function applyDensityFlag() {
            document.documentElement.dataset.pcDensity = pcDensity();
            renderPcControls();
        }
        // Surface-wide controls, docked in the never-scrolling command frame
        // ahead of the tier strip so they are reachable whatever the results do.
        function renderPcControls() {
            const host = el('pcControls');
            if (!host) return;
            const compact = pcDensity() === 'compact';
            host.innerHTML =
                `<span class="pc-info" data-tip="${PC_INFO_TIP}" aria-label="How results are ranked" tabindex="0">ⓘ</span>`
                + `<button class="pc-density" title="Density: ${compact ? 'micro — tap for full sentences' : 'full — tap for micro'}" aria-label="Toggle density">${compact ? '⊞' : '⊟'}</button>`;
        }
        function pcMetrics() {
            const comfy = pcDensity() === 'comfortable';
            return {
                font: comfy ? '400 14px "JetBrains Mono", monospace' : '400 13px "JetBrains Mono", monospace',
                lineHeight: comfy ? 22 : 20,
                // Comfortable lines are TALLER, so the same panel holds fewer
                // of them: 16 lines x 20px is 320px, and 320px of 22px lines is
                // ~15. Seeding 24 claimed ~65% more height than compact in the
                // same box — the fit loop, which only ever shrinks, answered by
                // collapsing the ladder. Comfortable trades breadth for depth:
                // fuller wording, fewer rungs.
                budget: comfy ? 20 : 16,
            };
        }

        // ── The wording ladder (10e.3) ──────────────────────────────────
        // LOD is STRUCTURAL (where a module sits); density picks the WORDING
        // inside it. Tiers: micro < tldr < brief (microparagraph) < full.
        // `brief` is authored or DERIVED BY SELECTION — whole sentences of
        // `content` accumulated to ~260ch (never generation).
        const briefCache = new Map();
        function deriveBrief(content) {
            if (!content) return '';
            const cached = briefCache.get(content);
            if (cached !== undefined) return cached;
            // Split ONLY at punctuation followed by whitespace/end. The old
            // match() pattern could not cross a mid-token period ("sound.js",
            // "web.zone"), so it restarted AFTER it — and the join(' ')
            // re-spaced the fragments into "sound. js for web. zone." in the
            // rendered brief. Selection must never alter the wording.
            const sentences = [];
            let segStart = 0;
            const boundary = /[.!?]+(?=\s|$)/g;
            let bm;
            while ((bm = boundary.exec(content))) {
                const piece = content.slice(segStart, bm.index + bm[0].length).trim();
                if (piece) sentences.push(piece);
                segStart = bm.index + bm[0].length;
            }
            const rest = content.slice(segStart).trim();
            if (rest) sentences.push(rest);
            if (!sentences.length) sentences.push(content);
            let out = sentences[0].trim();
            for (let i = 1; i < sentences.length; i++) {
                const next = out + ' ' + sentences[i].trim();
                if (next.length > 300) break;   // hard ceiling — a whole sentence never pushes past
                out = next;
                if (out.length >= 260) break;   // target reached
            }
            briefCache.set(content, out);
            return out;
        }
        function briefOf(r) { return r.brief || deriveBrief(r.content) || r.tldr || r.content || ''; }
        // The ONE selector — render AND allocator must both ask this (they
        // will drift if they choose wording independently; that class of bug
        // is all over the records).
        function textFor(r, lod, density) {
            const comfy = density === 'comfortable';
            if (lod === 1) return r.micro || '';
            if (lod === 2) return comfy ? briefOf(r) : (r.tldr || r.content || '');
            return comfy ? (r.content || '') : briefOf(r);   // lod 3 prose
        }
        // The tier stamp for morph diffs: a density flip that changes wording
        // AT THE SAME lod must still swap the node.
        function txtTier(r, lod, density) {
            if (lod < 2) return '';
            if (lod === 2) return density === 'comfortable' ? 'brief' : 'tldr';
            if (r.facts && r.facts.length) return 'facts';
            return density === 'comfortable' ? 'full' : 'brief';
        }
        // The hover tooltip shows the NEXT tier up from what renders.
        function tipFor(r, lod, density) {
            const comfy = density === 'comfortable';
            if (lod === 1) return r.tldr || r.content || '';
            if (lod === 2) return comfy ? (r.content || '') : briefOf(r);
            return '';
        }

        function ensurePretext() {
            if (pretextState !== 'idle') return;
            pretextState = 'loading';
            // Dynamic import in a classic script resolves against the SCRIPT's
            // URL, not the page's — resolve explicitly against the document.
            const abs = (p) => new URL(getBasePath() + p, document.baseURI).href;
            Promise.all([
                import(abs('scripts/pretext/layout.js')),
                import(abs('scripts/pretext-wrap.js')),
            ]).then(([lay, wrap]) => {
                pretextMod = lay; pretextWrapMod = wrap; pretextState = 'ready';
                if (currentQueryRaw && lastSearchResults.length) renderResults(lastSearchResults, lastHint);
                else renderDetailPane(lastSearchResults);   // empty-state pane still needs its wrap
            }).catch(err => {
                pretextState = 'failed';
                console.warn(`${logTag} pretext unavailable — estimated line fitting:`, err?.message || err);
            });
        }

        // Lines this text will occupy at this width — pretext arithmetic when
        // ready, honest character estimate until then / if it failed.
        function countLines(text, width, m) {
            if (!text) return 0;
            if (pretextState === 'ready') {
                try {
                    const key = m.font + '|' + text;
                    let prep = preparedCache.get(key);
                    if (!prep) { prep = pretextMod.prepare(text, m.font); preparedCache.set(key, prep); }
                    return pretextMod.layout(prep, width, m.lineHeight).lineCount;
                } catch { /* fall through to estimate */ }
            }
            const cpl = Math.max(18, Math.floor(width / (m.lineHeight * 0.4)));
            return Math.ceil(text.length / cpl);
        }

        // ── The allocator ──
        // Dominance mirrors the confidence rule the overview used: a decisive
        // top hit (or an intent firing) earns the dossier; a close field
        // shares the space; a broad field waterfalls to one-liners + a tail.
        function allocate(results, width, m, budgetLines) {
            const mods = [];
            let budget = budgetLines != null ? budgetLines : m.budget;
            const dominant = results.length === 1 ||
                (results[1] && results[0].score >= 1.5 * results[1].score);
            const density = pcDensity();
            // Workspace (9d): the list stays a compact waterfall — the detail
            // pane owns dossier depth.
            const ws = workspaceOn();
            results.forEach((r, i) => {
                // Nested semantic zoom, top-down: the lead reads at full
                // dossier depth, the next few at tldr, then one-liners, then
                // the tail. Nothing expands on click any more, so the ladder
                // is the whole story — the lead must ARRIVE at depth rather
                // than wait to be opened.
                let lod;
                if (i === 0) lod = 3;
                else if (i === 1) lod = 2;
                else if (i === 2 && dominant) lod = 2;
                else if (i <= 4) lod = 1;
                else lod = 0;
                // Density picks the WORDING at a constant tier (10e.3, via
                // textFor) and scales the wakeable frame — it does not promote
                // the ladder. Promoting was 6a behaviour from when the lead
                // started at L2; with the lead already at dossier depth it
                // only added demand below, and on a short viewport the fit
                // loop then flattened everything, so comfortable rendered
                // LESS depth than compact.
                // Workspace splits the labour: the left becomes an INDEX (one
                // line each, so more of the field is visible at once) and the
                // right pane carries the semantic expansion. Clamping the list
                // at L2 made both halves try to be the reading surface, which
                // is why the pane read as redundant next to it.
                if (ws) lod = Math.min(lod, i === 0 ? 2 : 1);
                mods.push({ r, lod });
            });
            // Budget pass: measure top-down, downgrade what does not fit.
            const costOf = (mod) => {
                if (mod.lod === 3) {
                    // the floor follows what actually RENDERS: a demo piece /
                    // image / video / model is a 148-176px obstacle; a LINK
                    // piece is a small pill — charging it the big floor was
                    // shaving innocent modules off the ladder
                    const p0 = mod.r.pieces && mod.r.pieces[0];
                    // kind follows what RENDERS: a frameable link-piece wakes
                    // into the big demo card (10f), so it costs big
                    const kind = p0 ? ((p0.kind === 'demo' || (p0.kind === 'link' && isFrameable(p0.src))) ? 'big' : 'small')
                        : (mod.r.video || mod.r.model3d || mod.r.image) ? 'big' : 'none';
                    // the 190px reserve is the OBSTACLE column — a text-only
                    // dossier renders its prose full-width, and charging it
                    // the reserve over-counted its lines by ~35% (cost follows
                    // what RENDERS, doctrine 7 — same fix as the pane's)
                    const lines = countLines(textFor(mod.r, 3, density), kind === 'none' ? width - 10 : width - 190, m);
                    // The frame scales with density (264px compact → 352px
                    // comfortable), so its line-equivalent has to scale too —
                    // a floor calibrated for compact under-charges comfortable
                    // by a third, and the fit loop pays for the gap by
                    // shrinking the budget until the whole ladder collapses.
                    const comfyFloor = density === 'comfortable';
                    const bigFloor = comfyFloor ? 13 : 9;
                    const smallFloor = comfyFloor ? 5 : 3;
                    const mediaFloor = kind === 'big' ? bigFloor : kind === 'small' ? smallFloor : 0;
                    // Fact rows sit BESIDE the media, so the taller governs.
                    // The facts branch used to return early and ignore media
                    // entirely — the awards dossier carries a trophy, and the
                    // unpaid frame was 50px of overflow the fit loop could not
                    // see coming.
                    if (mod.r.facts && mod.r.facts.length) {
                        return Math.max(mod.r.facts.length + 3, mediaFloor + 3);
                    }
                    return Math.max(lines, mediaFloor) + 3;
                }
                if (mod.lod === 2) {
                    // L2 carries media too — a small piece for a media-less
                    // chunk, otherwise a thumb (see pcMediaHtml's !big branch).
                    // Charging only text let the fit loop measure pixels the
                    // budget never paid for, so it shrank on every pass and
                    // walked the whole ladder down to mentions.
                    const hasMedia = (mod.r.pieces && mod.r.pieces.length)
                        || mod.r.video || mod.r.model3d || mod.r.image;
                    return countLines(textFor(mod.r, 2, density), width - 88, m) + 1
                        + (hasMedia ? (density === 'comfortable' ? 5 : 3) : 0);
                }
                if (mod.lod === 1) return 1;
                return 0;
            };
            // Shed from the BOTTOM up. Charging top-down spent the budget on
            // the lead first and then downgraded it when the total overran —
            // so a tighter budget flattened the lead before it touched the
            // tail, and comfortable could render LESS depth than compact.
            // The ladder's promise is the other way round: the tail yields
            // first, and the lead is the last thing to lose a tier.
            // The lead must not eat the ladder. A dossier carrying a media frame
            // costs most of a compact budget on its own, which left exactly one
            // module and a tail — a card, not a ladder. Whenever something sits
            // below it, the lead is capped at a share of the budget so the rungs
            // beneath it survive.
            if (mods.length > 1) {
                // Reserve room for the rungs, don't cap by percentage: a media
                // dossier costs ~12 of a 16-unit compact budget, so any share
                // cap below ~80% banned L3 outright and the lead never arrived
                // at depth. Three units is three one-liners underneath it.
                // Derived from the density SEED budget, not the fit-shrunken
                // one: keyed to the shrunken budget, a 31px overflow (1.5
                // lines) walked the budget to 14, the cap to 11, and the whole
                // 250px dossier died over a rounding error — leaving a 375px
                // panel in a 900px viewport. The shed loop below already
                // degrades bottom-up (the doctrine: the lead loses its tier
                // LAST); the cap only exists to stop a dossier eating the
                // rungs at full budget, so it holds still while fit shrinks.
                const leadCap = Math.max(4, m.budget - 3);
                // Never below L2 here: the lead giving up its dossier is fine,
                // the lead reading shallower than the module beneath it is not.
                while (mods[0].lod > 2 && costOf(mods[0]) > leadCap) mods[0].lod--;
            }
            const total = () => mods.reduce((s, m2) => s + costOf(m2), 0);
            let guard = mods.length * 4;
            while (total() > budget && guard-- > 0) {
                let victim = null;
                for (let k = mods.length - 1; k >= 0; k--) {
                    if (mods[k].lod > 0) { victim = mods[k]; break; }
                }
                if (!victim) break;          // everything is already a mention
                victim.lod--;
            }
            // What this ladder actually costs in line-units — the fit loop
            // scales the budget PROPORTIONALLY against measured pixels
            // (fixed chrome never shrinks, so subtracting raw pixel overflow
            // from a line budget over-corrects into oblivion).
            let spent = 0;
            for (const mod of mods) spent += costOf(mod);
            mods.usedCost = spent;
            if (window.__pcDbg) console.log('[allocdbg] budget-start', budgetLines, 'spent', spent, mods.map(m2 => m2.r.id + '/' + m2.lod).join(','));
            return mods;
        }

        // ── Pieces (10c): the site's interactive widgets as first-class
        // search material. kind 'demo' = same-origin page that WAKES into a
        // live iframe on tap (budget: ONE live at a time — the playground's
        // budgeted-LRU lesson, degenerate case). kind 'link' = off-origin,
        // NEVER framed (X-Frame-Options paints silent blanks) — a labeled
        // card that opens its own tab. Where a piece exists, it leads and
        // the text wraps around it.
        // ── 10f: the three-tier external policy ─────────────────────────
        // 1. Own + frameable → wakes LIVE like a demo piece. John controls
        //    these hosts; header-checked (jhana.zone + jjh111.github.io are
        //    GitHub Pages, which send no framing headers; earthstar.space
        //    sends none either). curl -sI each before adding — never assume.
        // 2. Own + unframeable (Substack, SmugMug) → DEPARTURE CARD: local
        //    poster, title, hostname, explicit ↗. Leaving is labeled.
        // 3. Third-party → departure card, no allowlist entries, ever.
        // teamreadi.xyz added 2026-08-31: John's product, sends no framing
        // headers (checked) — CHUNK_AUDIT §I holds the ownership confirm
        const FRAMEABLE_HOSTS = new Set(['jhana.zone', 'jjh111.github.io', 'earthstar.space', 'teamreadi.xyz']);
        function isFrameable(url) {
            try { return FRAMEABLE_HOSTS.has(new URL(url).hostname); } catch { return false; }
        }
        // THE one external-link builder — departure cards and chips route
        // through here; no bespoke <a target=_blank> anywhere else. Posters
        // (Assets/posters/<host>.webp, dated in CHUNK_AUDIT §G) render when
        // provided. The title attr softens the exit: the session survives it.
        function departureCardHtml(url, title, opts = {}) {
            let host = url;
            try { host = new URL(url).hostname; } catch {}
            // A capture makes this a CARD, not a chip. The poster is a
            // screenshot of the destination and needs real geometry to read as
            // one — inside the chip's auto height it stretches to a ~37px
            // sliver, and inside an unbounded obstacle it blows up to fill the
            // column. `has-poster` gives it the demo card's dimensions.
            const poster = opts.poster ? `<img class="pc-piece-poster" src="${resolveHref(opts.poster)}" alt="" decoding="async">` : '';
            return `<a class="pc-piece pc-piece--link${opts.poster ? ' has-poster' : ''}${opts.big ? ' pc-obstacle' : ''}" href="${url}" target="_blank" rel="me noopener" title="Leaves the site — your search is kept">`
                + `${poster}<span class="pc-piece-kind">↗</span><span class="pc-piece-title">${title || host}</span><span class="pc-piece-host">${host}</span></a>`;
        }
        let livePieceEl = null;
        function sleepLivePiece() {
            if (!livePieceEl) return;
            const fr = livePieceEl.querySelector('iframe');
            if (fr) fr.remove();   // actually releases the document
            livePieceEl.classList.remove('pc-piece--woken');
            const k = livePieceEl.querySelector('.pc-piece-kind');
            if (k) k.textContent = '▶ live';
            livePieceEl = null;
        }
        function wakePiece(node) {
            if (livePieceEl === node) return;
            sleepLivePiece();
            const fr = document.createElement('iframe');
            fr.src = resolveHref(node.dataset.pieceSrc);
            fr.loading = 'lazy';
            fr.setAttribute('title', 'live demo');
            // fade in on the page's OWN paint — until then the poster shows
            // through the transparent frame (no white flash, unreachable
            // hosts keep showing the poster)
            fr.addEventListener('load', () => fr.classList.add('ready'));
            node.appendChild(fr);
            node.classList.add('pc-piece--woken');
            const k = node.querySelector('.pc-piece-kind');
            if (k) k.textContent = '✕';
            livePieceEl = node;
        }
        function pcPieceHtml(piece, r, big) {
            if (!piece) return '';
            if (piece.kind === 'link') {
                // John-owned frameable hosts wake LIVE — same budget, graft,
                // and sleep-on-close semantics as same-origin demos
                if (isFrameable(piece.src)) {
                    const poster = r && r.image ? `<img class="pc-piece-poster" src="${r.image}" alt="" decoding="async">` : (piece.poster ? `<img class="pc-piece-poster" src="${piece.poster}" alt="" decoding="async">` : '');
                    return `<span class="pc-piece pc-piece--demo${big ? ' pc-obstacle' : ''}" data-piece-src="${piece.src}" role="button" tabindex="0" aria-label="Wake live demo">`
                        + `${poster}<span class="pc-piece-kind">▶ live</span><span class="pc-piece-title">${piece.title || (r && r.title) || ''}</span></span>`;
                }
                return departureCardHtml(piece.src, piece.title, { big, poster: piece.poster });
            }
            // the chunk's image, else the piece's own captured poster — a
            // sleeping demo card with neither was a blank box wearing a label
            const posterSrc = (r && r.image) || piece.poster;
            const poster = posterSrc ? `<img class="pc-piece-poster" src="${resolveHref(posterSrc)}" alt="" decoding="async">` : '';
            return `<span class="pc-piece pc-piece--demo${big ? ' pc-obstacle' : ''}" data-piece-src="${piece.src}" role="button" tabindex="0" aria-label="Wake live demo">`
                + `${poster}<span class="pc-piece-kind">▶ live</span><span class="pc-piece-title">${piece.title || (r && r.title) || ''}</span></span>`;
        }

        // `seen` (10e.1): a Set of src keys already shown in this render pass.
        // Threaded by the caller — NEVER module state (morph re-renders single
        // modules against a stale set). A repeat visual renders text-only:
        // the same face twice in one list reads as a glitch. Piece keys are
        // namespaced 'P:' so a piece and its poster never collide.
        function pcMediaHtml(r, big, seen) {
            // a piece outranks flat media at obstacle scale — the interactive
            // thing IS the visual, prose wraps it
            if (big && r.pieces && r.pieces.length) {
                const pk = 'P:' + r.pieces[0].src;
                if (seen && seen.has(pk)) return '';
                if (seen) seen.add(pk);
                return pcPieceHtml(r.pieces[0], r, true);
            }
            // small scale: a media-less chunk still shows its piece as the
            // visual (tapping it zooms the module AND wakes the demo)
            if (!big && r.pieces && r.pieces.length && !r.video && !r.model3d && !r.image) {
                const pk = 'P:' + r.pieces[0].src;
                if (seen && seen.has(pk)) return '';
                if (seen) seen.add(pk);
                return pcPieceHtml(r.pieces[0], r, false);
            }
            const mediaKey = r.video || r.model3d || r.image;
            if (mediaKey) {
                if (seen && seen.has(mediaKey)) return '';
                if (seen) seen.add(mediaKey);
            }
            if (r.video) {
                const poster = r.image
                    ? `<img class="result-thumb" src="${r.image}" alt="" loading="lazy" />`
                    : `<span class="result-thumb video-placeholder"></span>`;
                return `<span class="result-video-wrap${big ? ' pc-obstacle' : ''}" data-video="${r.video}" role="button" tabindex="0" aria-label="Play video">${poster}<span class="play-icon">▶</span></span>`;
            }
            if (r.model3d) {
                ensureModelViewer();
                const spin = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : ' auto-rotate';
                // data-mv keeps the RAW chunk path on the node — morph's
                // seen-set harvest reads data attrs, not resolved srcs
                return `<model-viewer class="result-model${big ? ' pc-obstacle' : ''}" src="${resolveHref(r.model3d)}" data-mv="${r.model3d}"${spin} camera-controls loading="lazy"></model-viewer>`;
            }
            if (r.image) return `<img class="result-thumb${big ? ' pc-obstacle' : ''}" src="${r.image}" alt="" loading="lazy" />`;
            return '';
        }

        function pcTitleHtml(r) {
            const ext = r.url && /^https?:/i.test(r.url);
            return r.url
                ? `<a class="result-title result-link${ext ? ' result-link-ext' : ''}" href="${ext ? r.url : resolveHref(r.url.replace(/^\.\//, ''))}"${ext ? ' target="_blank" rel="noopener"' : ''}>${r.title}</a>`
                : `<span class="result-title">${r.title}</span>`;
        }

        // 9c grammar: navigation's EXPLICIT affordance — the page badge is a
        // link wearing ↗. (Titles also navigate, declared on hover; clicks
        // anywhere else on a module zoom in place.)
        function pcPageBadge(r) {
            if (!r.url) return `<span class="result-page">${r.page}</span>`;
            const ext = /^https?:/i.test(r.url);
            const href = ext ? r.url : resolveHref(r.url.replace(/^\.\//, ''));
            return `<a class="result-page result-page-link" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${r.page} ↗</a>`;
        }

        function pcFactsHtml(r, nRelated) {
            const bits = [`<span class="result-page">${r.page}</span>`];
            if (r.video) bits.push('<span class="pc-glyph" title="video">▸</span>');
            if (r.model3d) bits.push('<span class="pc-glyph" title="3D">◆</span>');
            const rel = relatedChunks(r.id, nRelated);
            rel.forEach(c => bits.push(relatedChipHtml(c, 'card-related')));
            return `<div class="pc-facts">${bits.join('<span class="pc-sep">·</span>')}</div>`;
        }

        // A list-like chunk renders its dossier as FACT ROWS, not a prose
        // monolith — one row per authored fact (9b granularity). The chunk's
        // media sits beside the row it belongs to (fact.media), not looming
        // over the whole list. Compact density shows `t · y` (detail lives in
        // the hover tip); comfortable adds the detail inline — semantic zoom
        // reaches inside the dossier.
        function pcFactRowsHtml(r, seen) {
            const media = pcMediaHtml(r, false, seen);
            let mediaPlaced = false;
            const rows = r.facts.map(f => {
                const own = f.media && media && !mediaPlaced;
                if (own) mediaPlaced = true;
                return `<div class="pc-fact-row${own ? ' pc-fact-row--media' : ''}"${f.d ? ` data-tip="${f.d.replace(/"/g, '&quot;')}"` : ''}>`
                    + `<span class="pc-fact-t">${f.t}</span>`
                    + (f.d ? `<span class="pc-fact-d">${f.d}</span>` : '')
                    + (f.y ? `<span class="pc-fact-y">${f.y}</span>` : '')
                    + (own ? `<span class="pc-fact-media">${media}</span>` : '')
                    + `</div>`;
            }).join('');
            // media with no marked row: float it beside the list, top-right
            const loose = media && !mediaPlaced ? `<span class="pc-fact-media pc-fact-media--loose">${media}</span>` : '';
            return `<div class="pc-fact-list">${loose}${rows}</div>`;
        }

        // `seen` (10e.1): pass the render pass's Set to suppress repeated
        // visuals; `noMedia`: the workspace pane owns this chunk's visual
        // (the pane wins — it has depth), so render text-only.
        function renderModule(mod, seen, noMedia) {
            const r = mod.r;
            // media computed LAZILY per tier: the two scales are alternatives,
            // never both — computing the unused one would spend its seen-key
            // and suppress the used one (bitten, logged in the 10e.1 record).
            const density = pcDensity();
            if (mod.lod === 3) {
                // facts path must not touch the seen-set — pcFactRowsHtml
                // spends the key itself (mediaBig here would poison it and
                // starve the fact row of its media — bitten, logged)
                const body = r.facts && r.facts.length
                    ? pcFactRowsHtml(r, seen)
                    : `<div class="pc-dossier">${noMedia ? '' : pcMediaHtml(r, true, seen)}<div class="pc-prose">${textFor(r, 3, density)}</div></div>`;
                return `<div class="result pc-mod pc-l3" data-id="${r.id}" data-lod="3" data-txt="${txtTier(r, 3, density)}">`
                    + `<div class="result-header">${pcTitleHtml(r)}${pcPageBadge(r)}</div>`
                    + body
                    + pcFactsHtml(r, 2)
                    + `</div>`;
            }
            if (mod.lod === 2) {
                const mediaSmall = noMedia ? '' : pcMediaHtml(r, false, seen);
                return `<div class="result pc-mod pc-l2" data-id="${r.id}" data-lod="2" data-txt="${txtTier(r, 2, density)}" data-tip="${tipFor(r, 2, density).replace(/"/g, '&quot;')}">`
                    + `<div class="result-row">${mediaSmall}<div class="result-body">`
                    + `<div class="result-header">${pcTitleHtml(r)}${pcPageBadge(r)}</div>`
                    + `<div class="pc-tldr">${textFor(r, 2, density)}</div>`
                    + pcFactsHtml(r, 1)
                    + `</div></div></div>`;
            }
            return `<div class="result pc-mod pc-l1" data-id="${r.id}" data-lod="1" data-tip="${(r.tldr || r.content || '').replace(/"/g, '&quot;')}">`
                + `<span class="pc-l1-line">${pcTitleHtml(r)}<span class="pc-sep">·</span><span class="pc-micro">${r.micro || ''}</span>${pcPageBadge(r)}</span>`
                + `</div>`;
        }

        // The fusion note — was the shells' "Results ⓘ" label row; now it
        // travels in the postcard byline so chrome earns its lines.
        const PC_INFO_TIP = 'BM25 keyword relevance (title 3×, tags 2×, fuzzy), fused with semantic similarity once the on-device embedding tier loads.';
        let lastRenderedQuery = null;   // same-query re-render → morph/preserve scroll
        let fitKey = null, fitBudget = null;   // no-scroll: viewport-fitted line budget
        let lastPieceRail = false;             // piece intent fired → render the rail
        let refitKey = null;                   // one post-wrap refit per fit context

        function scrollAnchor(resultsEl) {
            // Nearest scrollable ancestor (the overlay's .so-panel-scroll);
            // null means the page itself scrolls (search.html).
            let n = resultsEl;
            while (n && n !== document.body) {
                const s = getComputedStyle(n);
                if (/(auto|scroll)/.test(s.overflowY)) return n;
                n = n.parentElement;
            }
            return null;
        }

        function applyDossierWrap(container, m, slot) {
            // The dossier gets the signature: prose flowing on BOTH sides of
            // its media. Degrades honestly — a failed wrap leaves the plain
            // paragraph exactly as rendered. slot 'detail' is the workspace
            // pane's wrap, tracked apart from the list's.
            if (pretextState !== 'ready') return;
            const dossier = container.querySelector('.pc-l3 .pc-dossier');
            const obstacle = dossier && dossier.querySelector('.pc-obstacle');
            const prose = dossier && dossier.querySelector('.pc-prose');
            if (dossier && obstacle && prose) {
                // wrapAround resolves ASYNCHRONOUSLY — the same race the pane
                // fixed (wrapStrata): a morph landing while the first wrap is
                // in flight sees currentWrap still null and wraps the same
                // node AGAIN, painting the prose twice. The node claims
                // itself. (Every destroy path replaces the node, so a claim
                // never outlives its wrap.)
                if (prose.dataset.wrapped) return;
                prose.dataset.wrapped = '1';
                obstacle.classList.add('pc-obstacle--float');
                pretextWrapMod.wrapAround(prose, {
                    obstacles: [{ el: obstacle, shape: 'rect', hPad: 14, vPad: 4 }],
                    lineHeight: m.lineHeight,
                    font: m.font,
                    minSlot: 80,
                }).then(w => {
                    currentWrap = w;
                    postWrapRefit();
                    // fonts.ready / ResizeObserver relayouts can grow the wrap
                    // AFTER this resolves — one delayed re-check catches it
                    setTimeout(postWrapRefit, 350);
                }).catch(() => { delete prose.dataset.wrapped; });
            }
        }

        // The fit loop measures BEFORE the pretext wrap runs, and wrapped
        // prose is taller than the plain paragraph (narrower slots → more
        // lines). One post-wrap correction per fit context closes that gap;
        // the refitKey guard makes it a step, never a loop.
        let refitSteps = 0;
        function postWrapRefit() {
            const resultsEl = el('searchResults');
            if (!resultsEl) return;
            const anchor = scrollAnchor(resultsEl);
            if (!anchor) return;
            const m = pcMetrics();
            if (anchor.scrollHeight <= anchor.clientHeight + m.lineHeight / 2) return;
            if (refitKey !== fitKey) { refitKey = fitKey; refitSteps = 0; }
            const base = fitBudget != null ? fitBudget : m.budget;
            if (refitSteps >= 3 || base <= 4) return;
            refitSteps++;
            // a 1-line decrement can land between allocation breakpoints and
            // change nothing — each step shaves at least a line, and the wrap
            // completion re-invokes this until it fits or the steps run out
            fitBudget = Math.max(4, base - Math.max(1, Math.ceil((anchor.scrollHeight - anchor.clientHeight) / m.lineHeight)));
            renderResults(lastSearchResults, lastHint);
            // no wrap will run if the dossier demoted away — check once more
            if (anchor.scrollHeight > anchor.clientHeight + m.lineHeight / 2) postWrapRefit();
        }

        // ── 9d/9e: the workspace detail pane — a pretext META-PARAGRAPH ──
        // Not one dossier floating in empty space: the pane composes STRATA —
        // the pinned (or top, or this page's own) chunk at full depth, then
        // its nearest related chunks as running tldr prose — each stratum's
        // media placed as a pretext obstacle with prose flowing BOTH sides,
        // alternating insets for rhythm. Sized by line arithmetic to the
        // pane's real height: the pane obeys the no-scroll doctrine too, and
        // what doesn't fit becomes related chips, not scroll.
        let detailWraps = [];
        function clearDetailWraps() {
            for (const w of detailWraps) { try { w.destroy(); } catch {} }
            detailWraps = [];
        }
        function workspaceOn() {
            // Below 900px the CSS collapses the pane away — the list must
            // keep its dossiers there even with the class still latched.
            return !!(config.workspaceActive && config.workspaceActive() && el('detailPane')
                && window.matchMedia && window.matchMedia('(min-width: 900px)').matches);
        }
        function wrapStrata(pane, m) {
            if (pretextState !== 'ready') return;
            for (const dossier of pane.querySelectorAll('.pc-dossier')) {
                const obstacle = dossier.querySelector('.pc-obstacle');
                const prose = dossier.querySelector('.pc-prose');
                if (!obstacle || !prose) continue;
                // wrapAround resolves ASYNCHRONOUSLY, so detailWraps is still
                // empty while the first wrap is in flight — and the caller's
                // "pretext arrived late" guard tests exactly that. A second
                // render inside that window wrapped the same node again and
                // painted the prose twice. The node carries its own claim.
                if (prose.dataset.wrapped) continue;
                prose.dataset.wrapped = '1';
                obstacle.classList.add('pc-obstacle--float');
                pretextWrapMod.wrapAround(prose, {
                    obstacles: [{ el: obstacle, shape: 'rect', hPad: 14, vPad: 4 }],
                    lineHeight: m.lineHeight,
                    font: m.font,
                    minSlot: 80,
                }).then(w => { detailWraps.push(w); }).catch(() => { delete prose.dataset.wrapped; });
            }
        }
        // The pane's seed, computable WITHOUT the pane: pinned (from the list
        // OR a promoted stratum) → top result → this page's own chunk — the
        // pane is never an empty half of the screen, empty state included.
        // Computed BEFORE the list builds so the pane-wins suppression reads
        // the CURRENT pane intent, not the previous render's (bitten: the
        // morph path seeded the pane after the list, leaving the list one
        // pane-state behind — logged in the 10e.1 record).
        function paneSeed(results) {
            let r = (results && results[0]) || chunks.find(c => c.page === curPage) || chunks[0];
            if (!r) return null;
            // A pool of 8, line-budget does the limiting: at 4 the pane
            // routinely stopped ~250px short of its own height — the strata
            // ran out of candidates, not room. What doesn't fit becomes chips.
            const rel = relatedChunks(r.id, 8);
            // When the cosine neighbourhood runs dry (a chunk with few
            // neighbours above the floor), the query's OWN ranking continues
            // the story — next-ranked results pad the pool.
            if (rel.length < 8 && results) {
                for (const c of results.slice(1)) {
                    if (rel.length >= 8) break;
                    if (c.id !== r.id && !rel.some(x => x.id === c.id)) rel.push(c);
                }
            }
            // Density is in the key: the ⊞/⊟ flip rescales the pane's metrics
            // (line height, frame scale, costs) — without it the flip
            // early-returned on dataset.showing and the pane never re-rendered.
            return { r, rel, key: r.id + '|' + rel.map(c => c.id).join(',') + '|' + pcDensity() };
        }
        function renderDetailPane(results, seed) {
            const pane = el('detailPane');
            if (!pane) return;
            if (!workspaceOn()) {
                clearDetailWraps();
                if (pane.innerHTML) pane.innerHTML = '';
                delete pane.dataset.showing;
                return;
            }
            ensurePretext();   // the strata wraps need it; empty state never hits renderResults
            seed = seed || paneSeed(results);
            if (!seed) { clearDetailWraps(); pane.innerHTML = ''; return; }
            const r = seed.r, rel = seed.rel, key = seed.key;
            if (pane.dataset.showing === key && pane.firstChild) {
                if (!detailWraps.length) wrapStrata(pane, pcMetrics());   // pretext arrived late
                return;
            }
            const m = pcMetrics();
            const width = Math.max(280, pane.clientWidth || 460);
            let lines = Math.max(10, Math.floor((pane.clientHeight || 480) / m.lineHeight) - 1);
            let html = '';
            const seenMedia = new Set();   // the same portrait twice reads as a glitch
            const stratum = (c, depth) => {
                // related strata ride the microparagraph tier (10e.3) — the
                // tldr read as a fragment at pane width
                const text = depth === 'full' ? (c.content || '') : (briefOf(c) || c.tldr || c.content || '');
                const hasFacts = depth === 'full' && c.facts && c.facts.length;
                const mediaKey = (c.pieces && c.pieces[0] && c.pieces[0].src) || c.video || c.model3d || c.image;
                let mediaHtml = '';
                if (mediaKey && !seenMedia.has(mediaKey)) { mediaHtml = pcMediaHtml(c, true); seenMedia.add(mediaKey); }
                // The 190px reserve is the OBSTACLE column — charging it to a
                // text-only stratum over-counted its lines by ~35% and the
                // pane under-filled by exactly that margin.
                let cost = (hasFacts ? c.facts.length : countLines(text, mediaHtml ? width - 190 : width - 10, m)) + 2;
                if (mediaHtml && !hasFacts) {
                    const p0 = c.pieces && c.pieces[0];
                    // A departure card with a capture is card-sized too, not a
                    // pill — and the frame scales with density. Under-charging
                    // here is what pushed the pane past its own height.
                    const big = p0 ? (p0.kind === 'demo' || !!p0.poster) : true;
                    const comfy = pcDensity() === 'comfortable';
                    cost = Math.max(cost, big ? (comfy ? 15 : 12) : (comfy ? 6 : 4));
                }
                if (cost > lines) return null;
                lines -= cost;
                let body;
                if (hasFacts) body = pcFactRowsHtml(c);
                else if (mediaHtml) {
                    // all media sits at the clean right edge (the alternating
                    // left inset read as imbalance with short strata)
                    body = `<div class="pc-dossier">${mediaHtml}<div class="pc-prose">${text}</div></div>`;
                } else body = `<div class="pc-meta-prose">${text}</div>`;
                return `<div class="pc-meta-stratum" data-id="${c.id}">`
                    + `<div class="result-header">${pcTitleHtml(c)}${pcPageBadge(c)}</div>`
                    + body + `</div>`;
            };
            html += stratum(r, 'full') || '';
            const leftovers = [];
            for (const c of rel) {
                const s = stratum(c, 'tldr');
                if (s) html += s; else leftovers.push(c);
            }
            if (leftovers.length) {
                html += `<div class="pc-artifacts">` + leftovers.map(c => relatedChipHtml(c, 'card-related')).join('') + `</div>`;
            }
            clearDetailWraps();
            const media = harvestMedia(pane);
            pane.dataset.showing = key;
            pane.innerHTML = html;
            graftMedia(pane, media);
            wrapStrata(pane, m);
        }

        // ── Live media continuity ──
        // A model-viewer's WebGL context (or a playing video, or a decoded
        // image) is GRAFTED from the old DOM into the fresh markup instead of
        // being rebuilt — the frame never blinks when a module changes tier.
        function harvestMedia(container) {
            const map = new Map();
            const mods = container.matches && container.matches('[data-id]') ? [container] : [];
            mods.push(...container.querySelectorAll('[data-id]'));
            for (const mod of mods) {
                const media = mod.querySelector('model-viewer, video, img.result-thumb');
                if (media) map.set(mod.dataset.id + '|' + media.tagName, media);
                const woken = mod.querySelector('.pc-piece--woken');
                if (woken) map.set(mod.dataset.id + '|PIECE|' + woken.dataset.pieceSrc, woken);
            }
            return map;
        }
        function graftMedia(scope, map) {
            if (!map || !map.size) return;
            const mods = scope.matches && scope.matches('[data-id]') ? [scope] : [];
            mods.push(...scope.querySelectorAll('[data-id]'));
            for (const mod of mods) {
                const freshPiece = mod.querySelector('.pc-piece--demo');
                if (freshPiece) {
                    const liveP = map.get(mod.dataset.id + '|PIECE|' + freshPiece.dataset.pieceSrc);
                    if (liveP && liveP !== freshPiece) {
                        liveP.className = freshPiece.className + ' pc-piece--woken';
                        freshPiece.replaceWith(liveP);
                        map.delete(mod.dataset.id + '|PIECE|' + liveP.dataset.pieceSrc);
                    }
                }
                const fresh = mod.querySelector('model-viewer, img.result-thumb, .result-video-wrap');
                if (!fresh) continue;
                // an activated (playing) video lives under the VIDEO key but
                // fresh markup re-renders its poster wrap — match either
                const tag = fresh.classList.contains('result-video-wrap') ? 'VIDEO' : fresh.tagName;
                const live = map.get(mod.dataset.id + '|' + tag);
                if (!live || live === fresh) continue;
                if (live.tagName === fresh.tagName) live.className = fresh.className;
                fresh.replaceWith(live);
                map.delete(mod.dataset.id + '|' + tag);
            }
        }

        // Morph, don't rebuild: when a same-query interaction (pin, density)
        // changes only LODs, swap ONLY the changed module nodes. Unchanged
        // modules keep their DOM — a live model-viewer never re-initializes
        // because a sibling was pinned, and nothing flashes. Returns false
        // when the structure itself changed (tail item promoted, labels
        // shift) — the caller falls back to a full, scroll-preserved render.
        function morphPostcard(resultsEl, mods, tailRs, m, seed) {
            const pcEl = resultsEl.querySelector('.postcard');
            if (!pcEl) return false;
            const live = [...pcEl.querySelectorAll('.pc-mod')];
            const want = mods.filter(mod => mod.lod > 0);
            if (live.length !== want.length) return false;
            for (let i = 0; i < want.length; i++)
                if (String(want[i].r.id) !== live[i].dataset.id) return false;
            const liveTail = [...pcEl.querySelectorAll('.pc-tail-item')].map(n => n.dataset.id).join();
            if (liveTail !== tailRs.map(r => String(r.id)).join()) return false;
            let dossierTouched = false;
            // 10e.1: a morph re-renders ONE module — ambient dedupe state
            // would be stale. Harvest each live module's visible srcs, then
            // per swap suppress everything EXCEPT the swapped module's own
            // (its media must survive the tier change — graftMedia re-homes
            // it). Pane-owned srcs suppress entirely (pane wins).
            // slice(0, 4): only the likely strata suppress — see buildPc.
            const paneIds = (workspaceOn() && seed)
                ? new Set([seed.r.id, ...seed.rel.slice(0, 4).map(c => c.id)])
                : null;
            const srcsByMod = new Map();
            for (const el2 of pcEl.querySelectorAll('.pc-mod')) {
                const s = new Set();
                const img = el2.querySelector('img.result-thumb');
                if (img) s.add(img.getAttribute('src'));
                const mv = el2.querySelector('model-viewer[data-mv]');
                if (mv) s.add(mv.getAttribute('data-mv'));
                const vw = el2.querySelector('.result-video-wrap');
                if (vw) s.add(vw.dataset.video);
                const piece = el2.querySelector('.pc-piece');
                if (piece) s.add('P:' + (piece.dataset.pieceSrc || ''));
                srcsByMod.set(el2.dataset.id, s);
            }
            for (let i = 0; i < want.length; i++) {
                // 10e.3: a density flip changes WORDING at a constant lod —
                // the data-txt tier stamp catches what the lod check misses
                const wantTxt = txtTier(want[i].r, want[i].lod, pcDensity());
                if (String(want[i].lod) === live[i].dataset.lod && wantTxt === (live[i].dataset.txt || '')) continue;
                if (live[i].dataset.lod === '3' || want[i].lod === 3) dossierTouched = true;
                const keep = harvestMedia(live[i]);   // the module's own live media
                const noMedia = !!(paneIds && paneIds.has(want[i].r.id));
                let suppress = null;
                if (!noMedia) {
                    suppress = new Set();
                    for (const [id, s] of srcsByMod) {
                        if (id === String(want[i].r.id)) continue;
                        for (const k of s) suppress.add(k);
                    }
                }
                const tpl = document.createElement('template');
                tpl.innerHTML = renderModule(want[i], suppress, noMedia);
                const fresh = tpl.content.firstElementChild;
                fresh.classList.add('pc-swap-in');
                graftMedia(fresh, keep);              // frame survives the tier change
                live[i].replaceWith(fresh);
            }
            pcEl.dataset.density = pcDensity();
            const btn = pcEl.querySelector('.pc-density');
            if (btn) btn.textContent = pcDensity() === 'compact' ? '⊞' : '⊟';
            if (dossierTouched) {
                if (currentWrap) { try { currentWrap.destroy(); } catch {} currentWrap = null; }
                applyDossierWrap(resultsEl, m);
            } else if (!currentWrap) {
                // pretext just became ready over an unchanged structure —
                // the wrap is the only thing missing
                applyDossierWrap(resultsEl, m);
            }
            return true;
        }

        // Routed, topline down: intent card → actions → the postcard
        // (on-this-page eyebrow → across-the-site eyebrow → modules → tail).
        function renderResults(results, hint) {
            const resultsEl = el('searchResults');
            if (!resultsEl) return;
            // The frame-scale CSS keys off the ROOT density stamp; only the
            // toggle click used to refresh it, so a density set any other way
            // (storage write + re-render) re-worded the text but never
            // rescaled the frames. The render is the one place every path
            // passes through — stamp it here, idempotently.
            document.documentElement.dataset.pcDensity = pcDensity();
            ensurePretext();
            if (cursorIdx >= 0) setCursor(-1);   // a new surface is a new traversal
            const sameQuery = lastRenderedQuery === currentQueryRaw;
            lastRenderedQuery = currentQueryRaw;

            const m = pcMetrics();
            const width = Math.max(240, resultsEl.clientWidth || 560);
            const localFirst = results[0] && results[0].page === curPage && results.length > 1
                && results.slice(0, 3).some(r => r.page === curPage);
            const anchor = scrollAnchor(resultsEl);

            // ── The no-scroll doctrine ──
            // Inside the panel, depth comes from semantic zoom, never from
            // scrolling: the line budget is fitted to the actual viewport
            // (measure → shrink → re-render), and the fitted value is keyed
            // so morphs reuse it instead of re-deriving a different ladder.
            // keyed on the WINDOW viewport, not the anchor's clientHeight —
            // the panel auto-grows under content, so its clientHeight churns
            // with every wrap and was nulling the fitted budget mid-flight
            const fk = currentQueryRaw + '|' + pcDensity() + '|' + window.innerWidth + 'x' + window.innerHeight + '|' + (workspaceOn() ? 'ws' : '');
            if (fk !== fitKey) { fitKey = fk; fitBudget = null; }
            // The pane's seed, BEFORE any list build: the pane-wins
            // suppression must read the pane's CURRENT intent, not the
            // previous render's dataset.showing.
            const paneSeedState = paneSeed(results);
            let budget = fitBudget != null ? fitBudget : m.budget;
            let mods = results.length ? allocate(results, width, m, budget) : [];
            const TAIL_MAX = 8;   // the tail run stays ≤ ~2 lines; the rest is "+N more"
            const splitTail = (ms) => {
                const all = ms.filter(mod => mod.lod === 0).map(mod => mod.r);
                return { shown: all.slice(0, TAIL_MAX), extra: all.slice(TAIL_MAX) };
            };
            let tail = splitTail(mods);

            // Same query, same structure → surgical swap, no rebuild.
            if (sameQuery && results.length && morphPostcard(resultsEl, mods, tail.shown, m, paneSeedState)) {
                // The morph path skips the fit loop — fine while the ladder's
                // pixel shape holds, but a density flip re-words every module
                // at a taller line height with nobody measuring (and a text-
                // only dossier gets no wrap, so postWrapRefit never fires
                // either). Measure here; fall through to the fitted rebuild
                // only when the morph actually overflowed the panel.
                if (!(anchor && anchor.scrollHeight > anchor.clientHeight + m.lineHeight / 2)) {
                    renderDetailPane(results, paneSeedState);
                    return;
                }
            }

            if (currentWrap) { try { currentWrap.destroy(); } catch {} currentWrap = null; }

            let html = '';
            if (lastScenePlan) html += renderPlanCard(lastScenePlan);
            if (lastSceneCensus) html += renderCensusHtml();
            if (lastIntentCard) html += renderIntentCard(lastIntentCard);
            // No "Actions" label — the run-chip on the cards already says it.
            if (lastCmdMatches.length) html += lastCmdMatches.map(renderCmdCard).join('');
            if (results.length === 0) {
                html += `<div class="result" style="color:${mutedColor};font-family:Raleway,sans-serif;font-size:0.85rem;">${html ? 'No other results.' : 'No results found.'}</div>`;
                resultsEl.innerHTML = html;
                renderDetailPane([], paneSeedState);
                return;
            }

            const buildPc = (ms, t) => {
                let pc = `<div class="postcard" data-density="${pcDensity()}">`;
                // ONE byline row: intent hint (only when one fired — a permanent
                // "tl;dr" is filler, not signal) · fusion ⓘ · density toggle.
                // ⓘ and the density control live in the command frame (see
                // renderPcControls), not here: they are surface-wide controls,
                // and inside the scrolling postcard they scrolled away from the
                // thing they control. The byline stays — it describes THIS render.
                pc += `<div class="pc-head">${hint ? `<span class="cmdbar-group-label">${hint}</span>` : '<span class="pc-head-spacer"></span>'}</div>`;
                if (lastPieceRail) {
                    const seen = new Set(); const rail = [];
                    for (const r2 of results.slice(0, 12)) {
                        for (const pz of (r2.pieces || [])) {
                            if (seen.has(pz.src) || rail.length >= 6) continue;
                            seen.add(pz.src); rail.push([pz, r2]);
                        }
                    }
                    if (rail.length) pc += `<div class="pc-piece-rail">` + rail.map(([pz, r2]) => pcPieceHtml(pz, r2, false)).join('') + `</div>`;
                }
                // 10e.1 dedupe: one src-keyed set per render pass, walked in
                // module order — first (highest-rank) occurrence keeps the
                // visual, later repeats render text-only. Fresh set each call:
                // the fit loop re-renders the WHOLE list, so per-pass scope is
                // correct here; only the morph path harvests (it re-renders
                // single modules).
                const listSeen = new Set();
                // Cross-pane: in workspace the pane leads with a chunk at full
                // depth — the pane wins, the list suppresses that chunk's
                // visual. dataset.showing = "leadId|rel,rel,rel".
                let paneIds = null;
                if (workspaceOn() && paneSeedState) {
                    // Only the likely STRATA suppress (lead + the first few
                    // related): the pool is bigger than the pane can seat, and
                    // a chunk the pane demotes to a chip shows no media there —
                    // suppressing its list visual too would drop it everywhere.
                    paneIds = new Set([paneSeedState.r.id, ...paneSeedState.rel.slice(0, 4).map(c => c.id)]);
                }
                let localLabelDone = !localFirst, siteLabelDone = !localFirst;
                for (const mod of ms) {
                    if (mod.lod === 0) continue;
                    if (localFirst && !localLabelDone && mod.r.page === curPage) {
                        pc += `<div class="cmdbar-group-label">On this page</div>`; localLabelDone = true;
                    } else if (localFirst && localLabelDone && !siteLabelDone && mod.r.page !== curPage) {
                        pc += `<div class="cmdbar-group-label">Across the site</div>`; siteLabelDone = true;
                    }
                    pc += renderModule(mod, listSeen, paneIds && paneIds.has(mod.r.id));
                }
                if (t.shown.length) {
                    pc += `<div class="pc-tail">also<span class="pc-sep">:</span> ` + t.shown.map(r =>
                        `<span class="pc-tail-item" data-id="${r.id}" data-tip="${(r.micro || '').replace(/"/g, '&quot;')}">${pcTitleHtml(r)}</span>`
                    ).join('<span class="pc-sep">·</span>')
                    + (t.extra.length ? `<span class="pc-sep">·</span><span class="pc-tail-more" data-tip="${t.extra.map(r => r.title).join(' · ').replace(/"/g, '&quot;')}">+${t.extra.length} more</span>` : '')
                    + `</div>`;
                }
                return pc + `</div>`;
            };

            // Scroll discipline: a NEW query starts at the top; a same-query
            // structural re-render (density reshuffle, semantic upgrade)
            // keeps the reader exactly where they were. Live media is
            // harvested before and grafted after — frames never blink.
            const saved = anchor ? anchor.scrollTop : (window.scrollY || 0);
            let media = harvestMedia(resultsEl);
            resultsEl.innerHTML = html + buildPc(mods, tail);
            graftMedia(resultsEl, media);

            // Fit pass: shrink the ladder until the whole surface fits the
            // panel viewport (the tail absorbs what the ladder sheds).
            // Steps are GENTLE — exactly the measured overflow, no slack —
            // and a sub-line residue is tolerated rather than costing a
            // whole module (interstitial paddings don't quantize to lines).
            if (anchor) {
                let guard = 0;
                while (anchor.scrollHeight > anchor.clientHeight + m.lineHeight / 2 && budget > 4 && guard++ < 5) {
                    // Proportional step: scale by (viewport / content) applied
                    // to the line-units actually spent, not to raw pixels —
                    // the fixed chrome (heads, hint, paddings) is in both
                    // measurements, so the ratio lands where a subtraction
                    // wildly overshoots.
                    const used = mods.usedCost || budget;
                    budget = Math.max(4, Math.min(budget - 1,
                        Math.floor(used * anchor.clientHeight / anchor.scrollHeight)));
                    mods = allocate(results, width, m, budget);
                    tail = splitTail(mods);
                    media = harvestMedia(resultsEl);
                    resultsEl.innerHTML = html + buildPc(mods, tail);
                    graftMedia(resultsEl, media);
                }
                fitBudget = budget;
            }

            if (sameQuery) { if (anchor) anchor.scrollTop = saved; else window.scrollTo(0, saved); }
            else if (anchor) anchor.scrollTop = 0;

            applyDossierWrap(resultsEl, m, 'list');
            renderDetailPane(results, paneSeedState);
            if (livePieceEl && !document.contains(livePieceEl)) livePieceEl = null;
        }

        function renderResultCard(r, maxScore) { return renderModule({ r, lod: 2 }); }

        // Empty state: the capability should be discoverable in the first
        // five seconds of a demo — an empty panel teaches nothing.
        function pageSuggestions() {
            if (curPage === 'index') return ['add 3 small fish', 'how many fish are there?', 'why should I hire him'];
            if (curPage === 'design') return ['draw a circle and put two fish inside', 'what shapes are there?', 'clear the walls'];
            return ['why should I hire him', 'what has he shipped', 'go to design'];
        }
        function renderEmptyState() {
            const resultsEl = el('searchResults');
            if (!resultsEl) return;
            lastRenderedQuery = null;   // next query is "new" — scroll to top
            cursorIdx = -1;
            renderDetailPane([]);
            if (currentWrap) { try { currentWrap.destroy(); } catch {} currentWrap = null; }
            resultsEl.innerHTML = `<div class="pc-suggest"><span class="cmdbar-group-label">try</span>` +
                pageSuggestions().map(s => `<button class="pc-suggest-chip" data-suggest="${s}">${s}</button>`).join('') + `</div>`;
            el('sourcesSection').classList.add('visible');
            if (config.onResultsChange) config.onResultsChange(true);
        }

        // ── 9c: keyboard cursor over the composed surface ──
        // One ephemeral highlight across actions → modules → tail; dies on
        // any re-render (a new surface is a new traversal).
        let cursorIdx = -1;
        function cursorItems() {
            const resultsEl = el('searchResults');
            return resultsEl ? [...resultsEl.querySelectorAll('.cmd-card, .pc-mod, .pc-tail-item')] : [];
        }
        function setCursor(i) {
            const items = cursorItems();
            cursorIdx = i;
            items.forEach((n, k) => n.classList.toggle('pc-cursor', k === i));
            if (i >= 0 && items[i]) items[i].scrollIntoView({ block: 'nearest' });
        }
        function moveCursor(delta) {
            const items = cursorItems();
            if (!items.length) return;
            setCursor(Math.min(items.length - 1, Math.max(-1, cursorIdx + delta)));
        }
        function commitItem(n) {
            if (n.classList.contains('cmd-card')) { executeCommand(n.dataset.cmd); return; }
            const a = n.querySelector('a.result-link');
            if (a) { markContinuity(); window.location.href = a.href; return; }
        }
        // Enter's semantics: the top thing on the surface, in surface order —
        // the cursor item if one is lit, the plan card's confirm (the visible
        // parse IS the confirm), the first action, else the top result.
        function commitTop() {
            if (cursorIdx >= 0) { const it = cursorItems()[cursorIdx]; if (it) { commitItem(it); return; } }
            if (lastScenePlan && !lastScenePlan.receipts) {
                const btn = el('searchResults') && el('searchResults').querySelector('[data-scene-run]');
                if (btn && !btn.disabled) { btn.disabled = true; executeScene(lastScenePlan); return; }
            }
            if (lastCmdMatches.length) { executeCommand(lastCmdMatches[0].id); return; }
            // A QUESTION is answered by the surface, not by leaving it. "why
            // should I hire him" + Enter used to navigate to about.html — the
            // most natural gesture in a demo threw the visitor off the answer
            // (and off the streaming elaboration, when an engine was active).
            // Destination-shaped queries ("nanome", "go to design") still
            // commit; question-shaped ones hold the surface.
            if (/\?\s*$|^(what|what's|whats|why|how|who|who's|whos|where|when|which|does|do|did|is|are|can|could|should|would|will|has|have|tell me|explain|describe)\b/i.test(currentQueryRaw || '')) return;
            if (lastSearchResults.length && lastSearchResults[0].url) {
                const r = lastSearchResults[0];
                const ext = /^https?:/i.test(r.url);
                // 10f: Enter never leaves the origin. Every chunk url is
                // same-origin after the url sweep, so this is a pure guard —
                // the departure card on the surface is the deliberate exit.
                if (ext) return;
                const href = resolveHref(r.url.replace(/^\.\//, ''));
                markContinuity();
                window.location.href = href;
            }
        }

        // The one shared tooltip node — fixed, repositioned, zero per-module DOM.
        function ensureTip() {
            if (tipEl) return tipEl;
            tipEl = document.createElement('div');
            tipEl.className = 'pc-tip';
            document.body.appendChild(tipEl);
            return tipEl;
        }
        function showTip(text, x, y) {
            const t = ensureTip();
            t.textContent = text;
            t.style.display = 'block';
            const pad = 12;
            const w = Math.min(360, window.innerWidth - 2 * pad);
            t.style.maxWidth = w + 'px';
            t.style.left = Math.min(x + 14, window.innerWidth - w - pad) + 'px';
            t.style.top = Math.min(y + 16, window.innerHeight - 80) + 'px';
        }
        function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

        // The answer slot is the LLM's elaboration seam (6c): the postcard
        // carries the deterministic layer; the model only ever adds to it.
        // The rail below the answer pins the ARTIFACTS that grounded it —
        // collected deterministically from the context chunks, never parsed
        // out of model text.
        function appendArtifactRail(answerEl, results) {
            if (answerEl.querySelector('.pc-artifacts')) return;
            const top = (results || []).slice(0, 4).filter(r => r.url);
            if (!top.length) return;
            const rail = document.createElement('div');
            rail.className = 'pc-artifacts';
            rail.innerHTML = `<span class="cmdbar-group-label">artifacts</span>` + top.map(r => {
                const ext = /^https?:/i.test(r.url);
                if (ext) return relatedChipHtml(r);
                const href = resolveHref(r.url.replace(/^\.\//, ''));
                const glyph = r.video ? '▸ ' : r.model3d ? '◆ ' : r.image ? '▣ ' : '';
                return `<a class="related-chip" href="${href}">${glyph}${r.title} ↗</a>`;
            }).join('');
            answerEl.appendChild(rail);
        }
        function beginAnswer(answerEl, dot, label) {
            answerEl.style.display = 'block';
            answerEl.classList.add('generating');
            delete answerEl.dataset.restored;   // a live generation supersedes a kept one
            el('aiActions').classList.remove('visible');
            dot.className = 'status-dot loading';
            answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
            answerEl.dataset.model = label;
        }
        function writeAnswer(answerEl, text) {
            answerEl.textContent = text;
        }

        // THE HARD LIMIT, in one place for every local engine. It is not a
        // suggestion the model can talk past; it is where we stop reading.
        const ANSWER_TOKEN_CAP = 600;

        // A model stopped by the cap ends wherever it happened to be — the
        // observed case ended "...collaborating with Open", mid-word, which
        // reads as a rendering fault rather than as a budget. Wind back to the
        // last sentence that actually finished, and stop there. No notice: an
        // answer that ends on a complete sentence simply reads as finished,
        // and a label announcing the machinery is louder than the seam it
        // explains. John's call, 2026-08-27.
        function endCleanly(text) {
            const t = (text || '').trim();
            if (!t) return t;
            const m = t.match(/^[\s\S]*[.!?]["')\]]?(?=\s|$)/);
            const body = (m ? m[0] : t).trim();
            // Nothing finished at all — keep what there is rather than blanking
            // an answer the visitor can still read.
            return body.length >= t.length * 0.4 ? body : t;
        }

        // ── Session memory (10b): the collapsed search ──
        // The last generated answer — and, failing that, the last query —
        // survives navigation for the length of the tab session.
        // sessionStorage is the deliberate scope: per-tab, private by
        // construction, gone when the visitor is. The answer is NEVER
        // regenerated to fake continuity; what you saw is what you kept.
        const SESSION_KEY = 'jh-search-session';
        const SESSION_TTL = 30 * 60 * 1000;
        // 10g: the residue — the session at its most minimized tier, ONE
        // line: query + the answer's first clause (selection, never
        // generation), or the top result's micro when no answer exists.
        // The shell renders it verbatim; it knows nothing about chunks.
        function residueOf(answer) {
            const a = (answer || '').trim();
            if (a) {
                const first = (a.match(/[^.!?]+[.!?]/) || [a])[0].trim();
                return first.length > 90 ? first.slice(0, 90).trimEnd() + '…' : first;
            }
            const top = lastSearchResults && lastSearchResults[0];
            return (top && top.micro) || '';
        }
        function saveSession(answer, model) {
            try {
                const a = (answer || '').trim();
                if (!currentQueryRaw) return;
                if (a.startsWith('Error:') || a === '(No answer generated.)') return;
                // a query-only render never downgrades a kept ANSWER for the
                // same query (the pre-navigation fill re-renders and would
                // otherwise destroy the kept answer — bitten, logged)
                if (!a) {
                    let prev = null;
                    try { prev = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch {}
                    if (prev && prev.query === currentQueryRaw && prev.answer) return;
                }
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                    query: currentQueryRaw, answer: a, model: model || '',
                    residue: residueOf(a),
                    fromPage: curPage, ts: Date.now(),
                }));
                // a fresh generation resurrects a dismissed residue
                sessionStorage.removeItem('jh-residue-dismissed');
            } catch {}
        }
        // A navigation is about to happen: make sure the session reflects
        // the current query (the postcard re-derives deterministically).
        // The residue sentence itself is STANDING chrome now (10g) — no
        // one-shot flag; every page renders it while the session is fresh.
        function markContinuity() {
            try {
                // an emptied box means reset, not continuity (10g revision)
                if (!currentQueryRaw) { sessionStorage.removeItem(SESSION_KEY); return; }
                let s = null;
                try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch {}
                if (!s || s.query !== currentQueryRaw) saveSession('', '');
            } catch {}
        }
        // Reopen restored: query refilled, postcard re-derived (search is
        // pure), the KEPT answer re-attached with an honest byline.
        function restoreSession() {
            let s = null;
            try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch {}
            if (!s || !s.query || Date.now() - (s.ts || 0) > SESSION_TTL) return false;
            const input = el('searchInput');
            if (input) input.value = s.query;
            doSearchOnly(s.query);
            if (s.answer) {
                const answerEl = el('aiAnswer');
                answerEl.style.display = 'block';
                answerEl.textContent = s.answer;
                answerEl.dataset.model = s.model || 'earlier this session';
                answerEl.dataset.restored = '1';
                el('aiActions').classList.add('visible');
                appendArtifactRail(answerEl, lastSearchResults);
            }
            return true;
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
            const tools = matchableCommands().map(c => ({
                type: 'function',
                function: {
                    name: toolName(c.id),
                    description: `${c.title}${c.detail ? ' — ' + c.detail : ''}`,
                    parameters: { type: 'object', properties: {} },
                },
            }));
            // The model composes scenes by EMITTING SCENE LANGUAGE — the same
            // deterministic grammar the keyboard uses parses and gates it, so
            // the parser stays the single authority over what can happen.
            if (window.JH_SCENE) {
                tools.push({
                    type: 'function',
                    function: {
                        name: 'scene_execute',
                        description: 'Compose entities on the live canvas behind this panel. Express the composition as a short scene-language utterance, e.g. "add 3 small fish and 2 coral" or "draw a circle and put two fish inside the circle". Supported: add/draw/put · counts · small/medium/large · fish/coral/food/bubble/jellyfish/circle/square/triangle/line · inside/near/intersecting.',
                        parameters: {
                            type: 'object',
                            properties: { utterance: { type: 'string', description: 'the scene-language sentence to execute' } },
                            required: ['utterance'],
                        },
                    },
                });
            }
            return tools;
        }

        function sceneCensusLine() {
            if (!window.JH_SCENE) return '';
            try {
                const c = window.JH_SCENE.census();
                if (!c) return '';
                const bits = [];
                if (c.smallFish) bits.push(c.smallFish + ' small fish');
                if (c.mediumFish) bits.push(c.mediumFish + ' medium fish');
                if (c.largeFish) bits.push(c.largeFish + ' large fish');
                if (c.coral) bits.push(c.coral + ' coral');
                if (c.food) bits.push(c.food + ' food');
                if (c.jellyfish) bits.push(c.jellyfish + ' jellyfish');
                if (c.shapes && c.shapes.length) bits.push(c.shapes.length + ' drawn shapes (' + c.shapes.map(s => s.type).join(', ') + ')');
                if (c.enclosed) bits.push(c.enclosed + ' fish enclosed');
                return bits.length ? `[Canvas right now]: ${bits.join(', ')}.\n\n` : '';
            } catch { return ''; }
        }
        function commandByToolName(name) {
            return matchableCommands().find(c => toolName(c.id) === name);
        }
        function renderToolChips(answerEl, calls) {
            const seen = new Set();
            const chips = [];
            let sceneHtml = '';
            for (const tc of calls) {
                if (tc.name === 'scene_execute') {
                    // model-emitted scene language → the SAME parser, the SAME
                    // plan card, the SAME confirm — grammar and model converge
                    let utter = '';
                    try { utter = JSON.parse(tc.args || '{}').utterance || ''; } catch {}
                    const plan = parseScene(utter);
                    if (plan && plan.kind === 'plan') {
                        lastScenePlan = plan;
                        sceneHtml = renderPlanCard(plan);
                    }
                    continue;
                }
                const c = commandByToolName(tc.name);
                // NOTE: a model suggestion can coincide with a registry card
                // already on the surface ("Scare the fish" twice). Tried
                // suppressing the chip (2026-08-31): a tool-only reply then
                // rendered an EMPTY elaboration box, which read worse than
                // the agreement. The chip is the model's own act, confirm-
                // first; the card is the grammar's. Both stay.
                if (c && !seen.has(c.id) && seen.add(c.id)) chips.push(c);
            }
            if (!chips.length && !sceneHtml) return;
            const wrap = document.createElement('div');
            wrap.innerHTML = (chips.length ? `<div class="cmdbar-group-label">Suggested action — tap to run</div>` + chips.map(renderCmdCard).join('') : '') + sceneHtml;
            answerEl.appendChild(wrap);
        }

        async function generateAnswerLocal(query, results, genId, model) {
            model = model || localModel;
            const answerEl = el('aiAnswer');
            const dot = el('aiDot');
            beginAnswer(answerEl, dot, model.name.split('/').pop() + ' · ' + model.source);

            const context = sceneCensusLine() + results.slice(0, 8).map(r => `[${r.title}]: ${r.content}`).join('\n\n');
            const tools = (model.source === 'LMStudio' || model.source === 'Custom') ? buildTools() : null;
            const toolLine = tools && tools.length
                ? '\n- Tools are live actions on the current page. If the visitor asks you to DO something the tools cover (feed, clear, toggle, navigate, compose a scene), call the matching tool instead of describing it. Otherwise just answer.'
                : '';
            const messages = [
                { role: "system", content: SYSTEM_PROMPT_LOCAL + toolLine },
                { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer directly and concisely:` }
            ];

            try {
                if (model.source === 'LMStudio' || model.source === 'Custom') {
                    const body = { model: model.name, messages, max_tokens: ANSWER_TOKEN_CAP, temperature: 0, stream: true };
                    let cutByLength = false;
                    if (tools && tools.length) body.tools = tools;
                    const res = await fetch(model.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`LMStudio ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`); }
                    const reader = res.body.getReader(); const decoder = new TextDecoder(); let outputText = '', reasoning = '', buffer = '';
                    const toolCalls = []; // accumulated across deltas, keyed by index
                    while (true) {
                        const { done, value } = await reader.read(); if (done) break;
                        if (genId !== currentGenId) { reader.cancel(); break; }
                        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop();
                        for (const line of lines) { const s = line.trim(); if (!s.startsWith('data:')) continue; const payload = s.slice(5).trim(); if (payload === '[DONE]') continue; try { const choice = JSON.parse(payload).choices?.[0] || {}; if (choice.finish_reason === 'length') cutByLength = true; const delta = choice.delta || {}; if (delta.reasoning_content) reasoning += delta.reasoning_content; if (delta.tool_calls) { for (const tc of delta.tool_calls) { const i = tc.index || 0; if (!toolCalls[i]) toolCalls[i] = { name: '', args: '' }; if (tc.function?.name) toolCalls[i].name += tc.function.name; if (tc.function?.arguments) toolCalls[i].args += tc.function.arguments; } } if (delta.content) { outputText += delta.content; const vis = stripThink(outputText).trimStart(); if (vis) writeAnswer(answerEl, vis); } } catch {} }
                    }
                    if (genId === currentGenId) {
                        let finalText = stripThink(outputText).trim();
                        if (cutByLength && finalText) finalText = endCleanly(finalText);
                        const calls = toolCalls.filter(Boolean).filter(tc => tc.name);
                        if (!finalText && !calls.length) console.warn(`${logTag} LMStudio returned no answer — content chars:`, outputText.length, 'reasoning chars:', reasoning.length, '— a reasoning model may need a higher token budget or a non-reasoning model.');
                        writeAnswer(answerEl, finalText || (calls.length ? '' : '(No answer — the model returned only reasoning. Try a non-reasoning model.)'));
                        if (calls.length) renderToolChips(answerEl, calls);
                    }
                } else if (model.source === 'Ollama') {
                    const res = await fetch(model.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.name, messages, stream: true, options: { temperature: 0, num_predict: ANSWER_TOKEN_CAP } }) });
                    if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`Ollama ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`); }
                    const reader = res.body.getReader(); const decoder = new TextDecoder(); let outputText = '';
                    let cutByLength = false;
                    while (true) {
                        const { done, value } = await reader.read(); if (done) break;
                        if (genId !== currentGenId) { reader.cancel(); break; }
                        const text = decoder.decode(value, { stream: true });
                        for (const line of text.split('\n')) { if (!line.trim()) continue; try { const chunk = JSON.parse(line); if (chunk.done_reason === 'length') cutByLength = true; if (chunk.message?.content) { outputText += chunk.message.content; const vis = stripThink(outputText).trimStart(); if (vis) writeAnswer(answerEl, vis); } } catch {} }
                    }
                    if (genId === currentGenId) {
                        let finalText = stripThink(outputText).trim();
                        if (cutByLength && finalText) finalText = endCleanly(finalText);
                        writeAnswer(answerEl, finalText || '(No answer generated.)');
                    }
                }
            } catch (err) {
                if (genId === currentGenId) { writeAnswer(answerEl, `Error: ${err.message}`); console.error(`${logTag} Local generation error:`, err); }
            } finally {
                if (genId === currentGenId) {
                    answerEl.classList.remove('generating');
                    dot.className = 'status-dot ready';
                    el('aiActions').classList.add('visible');
                    saveSession(answerEl.textContent, answerEl.dataset.model);
                    appendArtifactRail(answerEl, results);
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
                // The pipeline applies the chat template itself. (The Qwen-era
                // enable_thinking:false kwarg is gone with the model — LFM2.5
                // has no thinking mode; stripThink stays as a harmless guard.)
                const isCurrent = () => genId === currentGenId; let outputText = '';
                await llmModel(messages, { max_new_tokens: 128, do_sample: false, repetition_penalty: 1.15,
                    streamer: new TextStreamer(llmModel.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (token) => { if (!isCurrent()) return; outputText += token; writeAnswer(answerEl, outputText.trimStart()); } })
                });
                if (isCurrent()) { const f = outputText.trim(); writeAnswer(answerEl, f || '(No answer generated.)'); }
            } catch (err) { if (genId === currentGenId) { writeAnswer(answerEl, `Error: ${err.message}`); console.error(`${logTag} Generation error:`, err); } }
            finally {
                isGenerating = false;
                if (pendingGen) { const { query: pq, results: pr, genId: pg } = pendingGen; pendingGen = null; if (pg === currentGenId) { answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>'; dot.className = 'status-dot loading'; await runGeneration(pq, pr, pg); } }
                if (!isGenerating && genId === currentGenId) {
                    answerEl.classList.remove('generating'); dot.className = 'status-dot ready';
                    el('aiActions').classList.add('visible');
                    saveSession(answerEl.textContent, answerEl.dataset.model);
                    appendArtifactRail(answerEl, results);
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
                // John, 2026-08-27: clearing the box CLOSES OUT AND RESETS the
                // residue session. Distinguished from the overlay's open-time
                // empty render by whether a query existed going in — opening
                // the overlay on an empty input must NOT wipe the session.
                if (currentQueryRaw) {
                    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
                    try { sessionStorage.removeItem('jh-residue-dismissed'); } catch {}
                }
                sourcesSection.classList.remove('visible');
                if (config.onResultsChange) config.onResultsChange(false);
                answerEl.style.display = 'none'; delete answerEl.dataset.model;
                aiActionsEl.classList.remove('visible');
                lastSearchResults = []; lastLlmQuery = '';
                currentQueryRaw = ''; lastFusionQuery = '';
                lastCmdMatches = []; lastIntentCard = null;
                lastScenePlan = null; lastSceneCensus = null; lastPieceRail = false;
                clearBtn.style.display = 'none';
                renderEmptyState();
                return;
            }
            clearBtn.style.display = 'block';
            // Set BEFORE renderResults: the renderer keys its same-query
            // morph/scroll decisions off currentQueryRaw — rendering first
            // left it one query stale until a semantic refine happened by.
            currentQueryRaw = rawQuery;
            const scene = parseScene(rawQuery);
            lastScenePlan = scene && scene.kind === 'plan' ? scene : null;
            lastSceneCensus = scene && scene.kind === 'query' ? scene : null;
            const { query: expanded, hint, originalQuery, card, pieceRail } = expandQuery(rawQuery);
            lastIntentCard = card || null;
            lastPieceRail = !!pieceRail;
            lastCmdMatches = lastScenePlan ? [] : matchCommands(rawQuery, null);
            const results = search(expanded);
            // a real search un-dismisses the residue sentence (10g)
            try { sessionStorage.removeItem('jh-residue-dismissed'); } catch {}
            sourcesSection.classList.add('visible');
            if (config.onResultsChange) config.onResultsChange(true);
            renderResults(results, hint);
            lastSearchResults = results; lastLlmQuery = originalQuery || rawQuery;
            // every RENDERED query updates the session (10g): the residue
            // sentence reflects what you last SAW, engine or no engine
            saveSession('', '');
            // Semantic tier: BM25 rendered instantly above; the vectors refine
            // it in place. First real search is also what triggers the one-time
            // embedder load — until it lands, this is a no-op.
            lastFusionQuery = originalQuery ? expanded : stripPronouns(rawQuery.trim());
            lastIntentFired = !!originalQuery;
            lastHint = hint;
            if (chunkVecs) {
                ensureSemantic();
                if (semanticState === 'ready') refineSemantic(rawQuery, ++semanticGen);
            }
            if (answerEl.style.display !== 'none' && isGenerating) answerEl.innerHTML = '<span class="thinking-spinner">Thinking</span>';
            else if (!isGenerating) { answerEl.style.display = 'none'; delete answerEl.dataset.model; aiActionsEl.classList.remove('visible'); }
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
                if (wrap.classList.contains('pc-obstacle')) {
                    // keep the node — pretext-wrap's ResizeObserver watches it
                    wrap.innerHTML = '';
                    wrap.appendChild(v);
                    wrap.classList.add('pc-obstacle--video');
                    wrap.removeAttribute('data-video');
                    if (currentWrap) currentWrap.refresh();
                } else {
                    wrap.replaceWith(v);
                }
            }
            for (const host of [el('searchResults'), el('aiAnswer'), el('detailPane'), el('pcControls')]) {
                if (!host) continue;
                host.addEventListener('click', (e) => {
                    if (e.target.closest('a.result-link, a.result-page-link')) { markContinuity(); return; }
                    const pw = e.target.closest('[data-piece-src]');
                    if (pw) {
                        hideTip();
                        if (pw.classList.contains('pc-piece--woken')) {
                            if (e.target.closest('.pc-piece-kind')) sleepLivePiece();
                            // clicks inside a woken frame's chrome otherwise pass through
                            return;
                        }
                        wakePiece(pw);
                        return;
                    }
                    const vid = e.target.closest('[data-video]');
                    if (vid) { activateVideo(vid); return; }
                    const card = e.target.closest('[data-cmd]');
                    if (card) { executeCommand(card.dataset.cmd); return; }
                    const run = e.target.closest('[data-scene-run]');
                    if (run) { run.disabled = true; executeScene(lastScenePlan); return; }
                    const sug = e.target.closest('[data-suggest]');
                    if (sug) { searchInput.value = sug.dataset.suggest; runQuery(sug.dataset.suggest); return; }
                    const dens = e.target.closest('.pc-density');
                    if (dens) {
                        try { localStorage.setItem('jh-postcard-density', pcDensity() === 'compact' ? 'comfortable' : 'compact'); } catch {}
                        applyDensityFlag();
                        renderResults(lastSearchResults, lastHint);
                        return;
                    }

                });
                // hover LOD: the next level up, in the one shared tooltip node
                if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
                    host.addEventListener('mouseover', (e) => {
                        const t = e.target.closest('[data-tip]');
                        if (t && t.dataset.tip) showTip(t.dataset.tip, e.clientX, e.clientY);
                    });
                    host.addEventListener('mousemove', (e) => {
                        const t = e.target.closest('[data-tip]');
                        if (t && t.dataset.tip) showTip(t.dataset.tip, e.clientX, e.clientY);
                    });
                    host.addEventListener('mouseout', (e) => {
                        if (e.target.closest('[data-tip]')) hideTip();
                    });
                }
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
            // ── 9c: one keyboard grammar ──
            // ↑↓ traverses actions/modules/tail; Enter COMMITS the top thing
            // (cursor item → plan confirm → first action → top result);
            // Esc is a ladder: cursor → pin → query → (the shell may close).
            // This listener registers before the shells' own — consuming a
            // ladder rung stops theirs via stopImmediatePropagation.
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveCursor(e.key === 'ArrowDown' ? 1 : -1);
                    return;
                }
                if (e.key === 'Escape') {
                    const consume = () => { e.preventDefault(); e.stopImmediatePropagation(); };
                    if (cursorIdx >= 0) { setCursor(-1); consume(); return; }
                    if (searchInput.value) {
                        searchInput.value = '';
                        clearTimeout(searchDebounce); clearTimeout(aiDebounce);
                        doSearchOnly('');
                        consume(); return;
                    }
                    return; // nothing left to unwind — the shell closes
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(searchDebounce); clearTimeout(aiDebounce);
                    const val = e.target.value;
                    if (!val.trim()) return;
                    if (val !== currentQueryRaw) doSearchOnly(val);   // flush a pending debounce
                    commitTop();
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
                // the select handles itself on change — a click inside it must
                // not also toggle the section's engine
                if (e.target.closest('.lp-select-wrap')) { e.stopPropagation(); return; }
                if (localModel) setActiveEngine('local');
            });
            el('localModelSection').addEventListener('change', (e) => {
                const sel = e.target.closest('.lp-select');
                if (!sel) return;
                const [host, enc] = sel.value.split('|');
                pickLocalModel(host, decodeURIComponent(enc));
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
                    // a RESTORED answer stands — auto-regen here would destroy
                    // the kept state the visitor explicitly reopened (10b)
                    if (!el('aiAnswer').dataset.restored) doAIGeneration();
                }
            });

            // Tier strip — every segment is signal AND control
            const strip = el('tierStrip');
            if (strip) {
                strip.addEventListener('click', (e) => {
                    const t = e.target.closest('[data-tier]');
                    if (!t) return;
                    const tier = t.dataset.tier;
                    // THE FORCE: clicking the tier that is ALREADY active
                    // re-runs the answer. setActiveEngine only kicks on a
                    // CHANGE, so without this the active chip would be the one
                    // dead control on the strip — and when a generation stalls,
                    // re-clicking the model is the first thing a hand reaches
                    // for. No new chrome, and the fluid path is untouched:
                    // this only fires on a deliberate second click.
                    const engineFor = { qwen: 'browser', local: 'local', custom: 'custom' }[tier];
                    if (engineFor && activeEngine === engineFor && hasAnyEngine()) {
                        kickGeneration(true);
                        return;
                    }
                    if (tier === 'qwen') {
                        if (modelReady) setActiveEngine('browser');
                        else { const b = el('enableBtn'); if (b && !b.disabled) b.click(); }
                    } else if (tier === 'local') {
                        if (localModel) setActiveEngine('local');
                        else el('detectLocalBtn')?.click();
                    } else if (tier === 'custom') {
                        if (customModel) setActiveEngine('custom');
                    } else if (tier === 'semantic') {
                        ensureSemantic();
                    } else if (tier === 'ai') {
                        const c = el('aiToggle');
                        if (c) { c.checked = !c.checked; c.dispatchEvent(new Event('change')); }
                    }
                });
            }

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
                    log(`${logTag} Local: ${localServers.length} server(s), ${localServers.reduce((n, sv) => n + sv.models.length, 0)} chat model(s); using ${localModel.name} via ${localModel.source}`);
                    applyLocalModel();
                    setActiveEngine('local');
                } else {
                    applyLocalModel();
                    detectBtn.textContent = 'Not found'; detectBtn.disabled = false;
                    // The detail line carries the WHY — "Not found" alone sent
                    // Safari users hunting for a server setting that cannot help.
                    const detEl = el('localModelDetail');
                    if (detEl) detEl.textContent = localProbeDiagnosis();
                    log(`${logTag} Local: no server reachable — ${localProbeDiagnosis()}`);
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
                // 4.0.0-next.5 (2026-03-02) for months while 4.2.0 shipped. 4.2.0 is
                // still the newest release as of 2026-09-01.
                //
                // dtype q4f16: fp16 on WebGPU is not automatically safe — the same
                // path makes gemma-3-270m emit `<unused56>` forever
                // (onnxruntime#26732) — so the model was loaded and generated at
                // q4f16 on real hardware before this was committed, and answers
                // correctly. LFM2.5 is text-only, so the vision-encoder trap that
                // haunted the Qwen build (omit the key and it downloads the
                // UNQUANTIZED 402 MB tower) is gone with it.
                if (!pipeline) {
                    const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
                    pipeline = mod.pipeline;
                    TextStreamer = mod.TextStreamer;
                }

                const fileProgress = new Map(); let loadStartTime = Date.now(); let detectedSource = modelIsCached ? 'cache' : null;
                function onProgress(info) {
                    if (info.status === 'progress' && info.total) {
                        fileProgress.set(info.file, { loaded: info.loaded, total: info.total });
                        let loaded = 0, total = 0; for (const fp of fileProgress.values()) { loaded += fp.loaded; total += fp.total; }
                        if (detectedSource === null && Date.now() - loadStartTime > 1000) detectedSource = (loaded / total > 0.5) ? 'cache' : 'download';
                        if (total > 0) { progressFill.style.width = (loaded / total * 100) + '%'; progress.textContent = detectedSource === 'download' ? `Downloading ${(loaded / 1e6).toFixed(0)}/${(total / 1e6).toFixed(0)} MB` : 'Loading from cache...'; browserLoadPct = Math.min(99, Math.round(loaded / total * 100)); renderTierStrip(); }
                    } else if (info.status === 'initiate') { progress.textContent = `Loading ${info.file || 'model'}...`; }
                }

                try {
                    progress.textContent = 'Loading weights...';
                    llmModel = await pipeline('text-generation', MODEL_ID, { dtype: 'q4f16', device: 'webgpu', progress_callback: onProgress });
                    progress.textContent = 'Compiling shaders...';
                    await llmModel([{ role: 'user', content: 'hi' }], { max_new_tokens: 1, do_sample: false });
                    const loadTime = ((Date.now() - loadStartTime) / 1000).toFixed(1);
                    modelReady = true; modelIsCached = true; browserLoadPct = null;
                    btn.textContent = '✓ Active'; btn.classList.remove('cached'); btn.classList.add('model-active');
                    progress.textContent = `Ready in ${loadTime}s`; progressBar.style.display = 'none';
                    setActiveEngine('browser');
                    const query = searchInput.value;
                    if (query.trim()) { doSearchOnly(query); doAIGeneration(); }
                } catch (err) {
                    btn.textContent = 'Error — retry'; btn.disabled = false; dot.className = 'status-dot off';
                    progress.textContent = `Error: ${err.message}`; progressBar.style.display = 'none';
                    browserLoadPct = null; renderTierStrip();
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
            restoreSession,
            sleepPieces: sleepLivePiece,
            get commands() { return matchableCommands(); },
            renderCurrent: () => {
                if (currentQueryRaw && lastSearchResults.length) renderResults(lastSearchResults, lastHint);
                else renderDetailPane([]);
            },
        };
    }

    window.JHSearchCore = { create, localOptedIn, register: registerCommand, MODEL_DISPLAY_NAME };
})();
