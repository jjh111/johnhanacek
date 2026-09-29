// ============================================
// Inquiry Core — a typed paragraph becomes a message to John
// ============================================
// Plan of record: Agent Reference/INQUIRY_COMPOSER_PLAN.md.
//
// A visitor writes what they need. This file parses it ON THEIR DEVICE into a
// brief (track, offer, who, stage, timeline, budget), renders that brief as an
// editable card, and composes the message. Nothing leaves the page until the
// visitor presses Send. Two delivery routes:
//   relay    — when SITE.inquiryEndpoint (scripts/jh-chrome.js) names a
//              deployed Google Apps Script (Agent Reference/inquiry-relay/),
//              Send POSTs the composed message and John's own Gmail sends it
//              to John's own Gmail, Reply-To the visitor. Email is required.
//   mail app — with no endpoint (or when the relay fails), Send opens the
//              visitor's mail app; Copy puts the message on their clipboard.
//
// Two layers, instant then smarter:
//   L0 — grammar + lexicon. Synchronous, runs everywhere, renders on the
//        first pause in typing.
//   L0.5 — MiniLM sentence embeddings (the search bar's semantic tier, WASM,
//        works in Safari and on iOS) match each sentence to the offer
//        catalog and the paragraph to related case studies. Upgrades the
//        same card in place when the embedder is ready.
// No language model ever writes a word of the message: the visitor's own
// paragraph is always sent verbatim, and the brief is an index over it.
//
// Hosts: the command bar (search-core.js mounts a composer into its results
// when detect() says "brief") and services.html #book (a textarea).
// Node: the parse/compose/refine half runs under vm for
// Agent Reference/search-tests/inquirylab.mjs.

(function (root) {
    'use strict';
    if (root.JHInquiry) return;

    const TO = 'hi@johnhanacek.com';
    const CALENDAR = 'https://calendar.app.google/gpSXKWuwxrGZ2HweA';
    const EMBED_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
    const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

    // ── Thresholds (MiniLM cosine). Calibrated by inquirylab.mjs — re-run it
    // before moving any of these. ──
    const T = {
        // Measured 2026-09-26 on 13 fixtures: every clear inquiry's true offer
        // scored 0.56–0.89; vague ones topped out at 0.40–0.47 on the WRONG
        // offer, so below 0.47 the honest answer is "not sure yet".
        STRONG: 0.55,   // offer match shown as a firm match
        WEAK: 0.47,     // below this an offer is not proposed at all
        TRACK: 0.44,    // a meaning-match may settle the track when words did not
        // Nanome for a molecular-VR brief scored 0.66; unrelated case studies
        // (MetaMedium for an AI-tools audit) sat at 0.47–0.52.
        RELATED: 0.55,  // a case study is offered as related work
        LEX_BONUS: 0.06,// an offer the words also named gets a nudge
    };

    const TRACKS = [
        ['design', 'Design & product'],
        ['coaching', 'AI coaching'],
        ['hiring', 'Hiring (full-time)'],
        ['unsure', 'Not sure yet'],
    ];
    const TRACK_LABEL = Object.fromEntries(TRACKS);

    // ── The offer catalog: the names services.html already uses, verbatim.
    // `lex` is the words that name it; `ex` are exemplar sentences a visitor
    // might write, embedded once and matched by meaning. ──
    const OFFERS = [
        { id: 'audit', track: 'coaching', name: 'Audit',
          lex: /\b(audit|assess(ment)?|where (do i|to|should i) start|readiness|action plan)\b/i,
          ex: ["I don't know where to start with AI", 'Review how my team uses AI tools and tell us what to fix first', 'A one-time assessment of our workflows and AI readiness', 'Advice on our AI strategy and which tools to adopt'] },
        { id: 'guided', track: 'coaching', name: 'Guided Coaching',
          lex: /\b(coach(ing|es)?|mentor(ing|ship)?|teach me|learn (to|how)|upskill|get up to speed|from (zero|scratch))\b/i,
          ex: ['I want to learn how to use AI agents in my own work', 'Coaching sessions to get comfortable with Claude Code', 'Teach me to build software with AI', 'Consulting on how to use agentic AI in my business'] },
        { id: 'sprint', track: 'coaching', name: 'Build Sprint',
          lex: /\b(sprint|intensive|pair(ing)?|build it (together|with me))\b/i,
          ex: ['Help me build my specific project over a couple of intense weeks', 'A week of daily pairing to ship my tool', 'Build this with me quickly, side by side'] },
        { id: 'retainer', track: 'coaching', name: 'Embedded Retainer',
          lex: /\b(retainer|ongoing|weekly|biweekly|monthly|long[- ]term|embedded)\b/i,
          ex: ['Ongoing weekly support as we bring AI into the company', 'Someone embedded with us for the long term', 'A monthly retainer for AI help'] },
        { id: 'workshop', track: 'design', name: 'Workshop Facilitation',
          lex: /\b(workshops?|journey map(s|ping)?|personas?|design thinking|offsite|facilitat\w*)\b/i,
          ex: ['Run a workshop to align our team on the product direction', 'Facilitate journey mapping and personas with our stakeholders', 'A design thinking session for our leadership team'] },
        { id: 'website', track: 'design', name: 'Website Design',
          lex: /\b(websites?|web site|landing pages?|home ?page|site redesign)\b/i,
          ex: ['Redesign our company website', 'We need a landing page for our launch', 'Design and build a new homepage for our product'] },
        { id: 'mvp', track: 'design', name: 'MVP Design & Handoff',
          lex: /\b(mvp|prototypes?|first version|v1|hand ?off|proof of concept|poc|investor demo)\b/i,
          ex: ['Design and prototype the first version of our app', 'We need an MVP designed and handed off to our engineers', 'A clickable prototype to show investors'] },
        { id: 'e2e', track: 'design', name: 'End-to-End Product Design',
          lex: /\b(end[- ]to[- ]end|founding designer|design lead|head of design|product design(er)?|zero to one|0 ?(to|→) ?1|design system)\b/i,
          ex: ['We are looking for a founding designer to own the product', 'End to end product design from research to shipped interface', 'Build our design system and lead product design', 'Design the onboarding and core flows of our app'] },
        { id: 'agentic', track: 'design', name: 'AI & Agentic Systems',
          lex: /\b(agents?|agentic|llms?|multi[- ]agent|tool use|chatbots?|copilots?|ai (features?|assistants?|products?)|rag)\b/i,
          ex: ['Design the experience of an AI agent for our users', 'Our product uses LLMs and the assistant experience is confusing', 'An interface for orchestrating multiple AI agents'] },
        { id: 'fulltime', track: 'hiring', name: 'Full-time role',
          lex: /\b(full[- ]time|we'?re hiring|we are hiring|recruit(er|ing)|job (opening|offer)|open (role|position)|join (our|the) team|w-?2|salary|headcount)\b/i,
          ex: ["We're hiring a senior product designer", 'I am a recruiter with a full-time role that fits your background', 'Would you consider joining our team as lead designer'] },
    ];
    const OFFER_BY_ID = Object.fromEntries(OFFERS.map(o => [o.id, o]));

    const TRACK_WORDS = {
        // "hire him for consulting on how to use agentic AI" is coaching: the
        // visitor wants to learn to use it, not a product designed.
        coaching: /\b(coach(ing)?|mentor\w*|learn|teach|upskill|my own work|for myself|productivity|chief of staff|claude code|use ai (in|for) my|get (my|our) team using|how to (use|build with|work with|get started with|adopt)|consult(ing|ation|ant)?)\b/gi,
        design: /\b(design(er|ing)?|ux|ui|interface|app|product|user experience|figma|brand(ing)?|logo|prototype|mvp|website|landing page)\b/gi,
        hiring: /\b(hiring|recruit(er|ing)?|full[- ]time|position|opening|job|candidate|interview|talent|headcount|salary|compensation|w-?2|join (our|the) team)\b/gi,
    };

    const DOMAINS = [
        ['AI', /\b(ai|a\.i\.|llms?|gpt|claude|agents?|agentic|machine learning|ml|genai|copilots?)\b/i],
        ['XR / spatial', /\b(xr|vr|ar|mixed reality|virtual reality|augmented reality|spatial|vision ?pro|quest|immersive|headsets?)\b/i],
        ['robotics', /\b(robots?|robotics|robotic|teleop(eration)?|drones?|autonomous|hardware)\b/i],
        ['web', /\b(websites?|web ?apps?|saas|landing pages?|webgl|browser)\b/i],
        ['science', /\b(biotech|pharma\w*|molecul\w*|scientists?|scientific|lab(oratory)?|clinical|health ?care|medical)\b/i],
    ];

    const STAGES = [
        // Not a bare "idea": "I have no idea where to start" is not a stage.
        ['idea', /\b(just an idea|an idea for|rough idea|concept stage|napkin|pre-?seed|early[- ]stage|just starting out|haven'?t built)\b/gi],
        ['prototype', /\b(prototypes?|mvp|beta|alpha|proof of concept|poc|pilot|working demo|v0|first version)\b/gi],
        ['shipped', /\b(launched|live in|in production|shipped|released|paying customers|customers|our users)\b/gi],
        ['scaling', /\b(scal(e|ing)|series [a-d]|growth stage|enterprise customers|thousands of users|millions of)\b/gi],
    ];

    const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
    const TIMELINE = new RegExp('\\b(asap|as soon as possible|urgent(?:ly)?|immediately|right away|this week|next week|this month|next month|this quarter|next quarter|this (?:spring|summer|fall|autumn|winter)|next year'
        + '|(?:in|within|over the next)\\s+(?:\\d+|a|one|two|three|four|six|few|couple(?: of)?)\\s+(?:days?|weeks?|months?)'
        + '|by (?:the )?end of (?:the )?(?:week|month|quarter|year|' + MONTH + ')'
        + '|(?:by|before|starting|from|after|in)\\s+(?:early |mid[- ]|late )?' + MONTH + '(?:\\s+20\\d\\d)?'
        + '|(?:early|mid|late)[- ](?:20\\d\\d|' + MONTH + ')'
        + '|q[1-4](?:\\s*(?:20)?\\d\\d)?)\\b', 'i');

    const MONEY = '\\$\\s?\\d[\\d,.]*\\s?[kKmM]?(?:\\s?(?:-|–|to)\\s?\\$?\\s?\\d[\\d,.]*\\s?[kKmM]?)?(?:\\s?(?:\\/|per|an?)\\s?(?:hr|hour|day|week|month|mo|year|yr))?';
    const BUDGET = new RegExp('(' + MONEY + ')|\\b(\\d[\\d,.]*\\s?[kK](?:\\s?(?:-|–|to)\\s?\\d[\\d,.]*\\s?[kK])?)\\s+(?:budget|usd|dollars)\\b|\\bbudget (?:of|is|around|about|~)\\s*(\\d[\\d,.]*\\s?[kKmM]?)', 'i');

    const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const NAME_WORD = "[A-Z][a-zA-Z'’-]+";
    // Capitalized words that follow "I'm" but are not names.
    const NOT_NAMES = new Set(['I', 'A', 'An', 'The', 'Looking', 'Building', 'Interested', 'Hoping', 'Trying', 'Working', 'Reaching', 'Currently', 'Based', 'Just', 'Not', 'Also', 'Here', 'So', 'Really', 'Writing', 'Curious', 'Excited', 'Leading', 'Running', 'From', 'At', 'With', 'In', 'On', 'Head', 'Founder', 'Cofounder', 'Co-founder', 'Director', 'Senior', 'Lead', 'Product', 'Design', 'Chief', 'President', 'Principal', 'Staff']);
    const ROLE_ABBR = /^(CEO|CTO|COO|CPO|CMO|CFO|VP|PM|HR|UX|UI|AI|XR|VR|AR)$/;
    const NOT_ORGS = new Set(['AI', 'I', 'XR', 'VR', 'AR', 'MR', 'UX', 'UI', 'LLM', 'LLMs', 'Claude', 'Claude Code', 'Figma', 'Unity', 'San Diego', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Q1', 'Q2', 'Q3', 'Q4', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'John', 'You']);

    const SENDER_ROLE = /\b(?:i'?m|i am|as|my role is|i work as|i serve as)\s+(?:a |an |the |our )?((?:co-?)?founder(?: and (?:ceo|cto))?|ceo|cto|coo|cpo|cmo|vp of [a-z ]{2,24}?|head of [a-z]{2,20}|director of [a-z ]{2,20}?|(?:senior |staff |principal |lead )?(?:product manager|engineering manager|designer|product designer|engineer|software engineer|researcher)|(?:technical )?recruiter|talent (?:partner|acquisition(?: lead)?)|hiring manager|professor|student|consultant|executive|owner)\b/i;
    // "I'm Priya Shah, founder of Loop Health" — a role in apposition.
    const ROLE_APPOS = /(?:,|\band)\s*(?:the |a |an )?((?:co-?)?founder(?: and (?:ceo|cto))?|ceo|cto|coo|cpo|cmo|head of [a-z]+|director of [a-z]+|vp of [a-z]+)\s+(?:of|at)\b/i;
    const POSITION = /\b(?:hiring(?: for)?|looking for|seeking|to hire|role(?: for)?|position(?: for)?|opening(?: for)?)\s+(?:a |an )?((?:senior |staff |lead |principal |founding )?(?:head of design|design lead|design engineer|product designer|ux designer|ui designer|ux\/ui designer|designer|design director))\b/i;
    const LOCATION = /\b(remote|hybrid|on-?site|in[- ]office)\b/i;
    const BASED_IN = new RegExp('\\bbased in (' + NAME_WORD + '(?:\\s' + NAME_WORD + ')?)');

    // Detection: is this paragraph someone reaching out, or a question about
    // John? Tested against every query in search-tests (inquirylab.mjs):
    // none of them may trigger the card.
    const NEED = /\b(we'?re (building|making|working|looking|trying|hiring|a |an )|we are (building|making|working|looking|trying|hiring)|we (have|need|want)\b|our (team|company|startup|product|app|platform|studio|agency|clients?|founders?)\b|i need\b|i want\b|i'?m (looking|hoping|trying|building|working on|interested|reaching)|i am (looking|hoping|trying|building|interested|reaching)|looking for (a|an|someone|help|support)\b|help (us|me)\b|could you|would you|can you help|are you (available|open|interested)|interested in (working|hiring|your|coaching)|i'?d (like|love)|we'?d (like|love)|work(ing)? with you|hire you|reach(ing)? out)/i;
    const ABOUT_JOHN = /^(what|who|where|when|which|why|how)\b.*\b(john|he|his|him)\b|^(does|did|is|has|was|can|could|would|will|should)\s+(john|he)\b/i;

    // Asked for BY NAME at the start: "inquire", "send a message", "message
    // john: …", "get in touch". Always the card; the command itself is
    // stripped, and with nothing after it the card is a prompt to keep typing.
    const COMMAND = /^\s*(?:inquire|inquiry|enquire|enquiry|send\s+(?:a\s+|an\s+)?(?:message|note|email|inquiry)(?:\s+to\s+(?:john|him))?|send\s+(?:john|him)\s+(?:a\s+|an\s+)?(?:message|note|email)|message\s+(?:john|him)|write\s+(?:to\s+)?(?:john|him)|contact\s+(?:john|him)|email\s+(?:john|him)|get\s+in\s+touch(?:\s+with\s+(?:john|him))?|reach\s+out(?:\s+to\s+(?:john|him))?)\b\s*[:,.\-–—]?\s*/i;
    // Asking to reach John anywhere in the text.
    const ASK = /\b(inquire|inquiry|inquiring|enquire|send (?:a |him a |john a )?(?:message|note)|message (?:john|him)|write to (?:john|him)|contact (?:john|him|you)|email (?:john|him|you)|get in touch|reach(?:ing)? out|hire (?:john|him|you)|work with (?:john|him|you)|consult(?:ing|ation)? (?:with|for|on)|engage (?:john|him|you))\b/i;
    // A question ABOUT John (third person) is a search, whatever it mentions:
    // "should i hire him for a founding designer role", "how do i contact him".
    const QUESTION_ABOUT = /^(should|can|could|would|will|do|does|is|are|may)\s+(i|we)\b.*\b(john|him|he|his)\b/i;

    function wordCount(t) { return (t.match(/\S+/g) || []).length; }

    function stripCommand(text) {
        const t = String(text || '');
        const m = t.match(COMMAND);
        return m ? t.slice(m[0].length) : t;
    }

    function detect(text) {
        const t = String(text || '').trim();
        if (!t) return null;
        if (COMMAND.test(t)) return 'brief';
        const words = wordCount(t);
        const email = EMAIL.test(t);
        const need = NEED.test(t);
        const ask = ASK.test(t);
        if ((ABOUT_JOHN.test(t) || QUESTION_ABOUT.test(t)) && !email) return words >= 18 ? 'offer' : null;
        if ((ask && words >= 8) || (need && words >= 14) || (email && words >= 8)) return 'brief';
        if (words >= 18 || ((need || ask) && words >= 3)) return 'offer';
        return null;
    }

    function countMatches(re, text) {
        re.lastIndex = 0;
        return (text.match(re) || []).length;
    }

    function cleanPhrase(s) {
        return String(s || '').replace(/\s+/g, ' ').replace(/[\s,.;:!?)]+$/, '').trim();
    }

    function findName(raw) {
        const m = raw.match(new RegExp("\\b(?:I'?m|I am|my name is|My name is|this is|This is|It'?s|it'?s)\\s+(" + NAME_WORD + "(?:\\s" + NAME_WORD + ")?)"));
        if (m) {
            const first = m[1].split(/\s+/)[0];
            if (!NOT_NAMES.has(first) && !ROLE_ABBR.test(first)) {
                // "I'm Dana Reyes" keeps both; "I'm Dana CTO" keeps Dana
                return m[1].split(/\s+/).filter(w => !ROLE_ABBR.test(w) && !NOT_NAMES.has(w)).join(' ');
            }
        }
        const lines = raw.trim().split(/\n+/).map(s => s.trim()).filter(Boolean);
        const last = lines[lines.length - 1] || '';
        const prev = lines[lines.length - 2] || '';
        const signoff = /^(thanks|thank you|best|cheers|regards|best regards|kind regards|sincerely|warmly|talk soon)[,!.]?$/i;
        const nameLine = new RegExp('^[-–—~]?\\s*(' + NAME_WORD + '(?:\\s' + NAME_WORD + ')?)$');
        if (signoff.test(prev) && nameLine.test(last)) return last.match(nameLine)[1];
        const inline = raw.trim().match(new RegExp('(?:thanks|thank you|best|cheers|regards|sincerely)[,!.]?\\s+[-–—]?\\s*(' + NAME_WORD + '(?:\\s' + NAME_WORD + ')?)\\s*$', 'i'));
        if (inline && !NOT_NAMES.has(inline[1].split(/\s+/)[0])) return inline[1];
        const dash = raw.trim().match(new RegExp('(?:^|\\s)[-–—]\\s*(' + NAME_WORD + '(?:\\s' + NAME_WORD + ')?)\\s*$'));
        if (dash) return dash[1];
        return '';
    }

    function findOrg(raw) {
        // No bare '.' in a word: "Example Robotics. Budget" ran across the
        // sentence end. A dotted domain (Acme.io) still reads as one word.
        const cap = "[A-Z][\\w&'’-]*(?:\\.[A-Za-z]{2,})*";
        const tries = [
            new RegExp("\\b(?:company|startup|studio|agency|lab|team) called (" + cap + "(?:\\s" + cap + "){0,2})"),
            new RegExp("\\b(?:We'?re|We are|we'?re|we are)\\s+(" + cap + "(?:\\s" + cap + "){0,2})"),
            new RegExp("\\b(?:founder of|co-?founder of|CEO of|CTO of|ceo of|cto of|here at|work at|working at|recruiting for|hiring for)\\s+(" + cap + "(?:\\s(?:" + cap + "|&))*)"),
            new RegExp("\\b(?:at|from)\\s+(" + cap + "(?:\\s(?:" + cap + "|&))*)"),
        ];
        for (const re of tries) {
            const g = new RegExp(re.source, 'g');
            let m;
            while ((m = g.exec(raw))) {
                let org = cleanPhrase(m[1]).replace(/\s+&$/, '');
                if (!org || NOT_ORGS.has(org) || NOT_ORGS.has(org.split(' ')[0]) && org.split(' ').length === 1) continue;
                if (/^(A|An|The|I|My|Our|We)$/.test(org.split(' ')[0])) continue;
                return org;
            }
        }
        return '';
    }

    function pickStage(lower) {
        let best = '', bestN = 0;
        for (const [id, re] of STAGES) {
            const n = countMatches(re, lower);
            if (n > bestN || (n === bestN && n > 0)) { best = id; bestN = n; }
        }
        return best;
    }

    // L0 — synchronous. Everything here is grammar and lexicon.
    function parse(text) {
        const raw = String(text || '').trim();
        const flat = raw.replace(/\s+/g, ' ');
        const lower = flat.toLowerCase();

        const trackScore = {};
        for (const k of Object.keys(TRACK_WORDS)) trackScore[k] = countMatches(TRACK_WORDS[k], lower);
        const lexOffers = OFFERS
            .map(o => ({ o, n: (flat.match(new RegExp(o.lex.source, 'gi')) || []).length }))
            .filter(x => x.n > 0);
        for (const x of lexOffers) trackScore[x.o.track] = (trackScore[x.o.track] || 0) + x.n;

        let track = 'unsure', trackBasis = 'none';
        const ranked = Object.entries(trackScore).sort((a, b) => b[1] - a[1]);
        if (trackScore.hiring >= 2) { track = 'hiring'; trackBasis = 'words'; }
        else if (ranked[0][1] > 0 && ranked[0][1] > (ranked[1] ? ranked[1][1] : 0)) { track = ranked[0][0]; trackBasis = 'words'; }

        const offers = lexOffers
            .sort((a, b) => b.n - a.n)
            .map(x => ({ id: x.o.id, strength: 'words', score: null }));

        const email = (flat.match(EMAIL) || [''])[0];
        const role = cleanPhrase((flat.match(SENDER_ROLE) || flat.match(ROLE_APPOS) || [, ''])[1]);
        const position = cleanPhrase((flat.match(POSITION) || [, ''])[1]);
        const tl = flat.match(TIMELINE);
        const bm = flat.match(BUDGET);
        const loc = flat.match(LOCATION);
        const based = flat.match(BASED_IN);

        return {
            text: raw,
            words: wordCount(raw),
            email,
            name: findName(raw),
            org: findOrg(flat),
            role,
            position,
            location: cleanPhrase([loc && loc[1], based && based[1]].filter(Boolean).join(', ')),
            track, trackBasis,
            offers,
            lexOffers: lexOffers.map(x => x.o.id),
            domains: DOMAINS.filter(([, re]) => re.test(lower)).map(([label]) => label),
            stage: pickStage(lower),
            timeline: tl ? cleanPhrase(tl[1]) : '',
            budget: bm ? cleanPhrase(bm[1] || bm[2] || bm[3]) : '',
            related: [],
            upgraded: false,
        };
    }

    // ── L0.5 — the embedder. search-core hands over its MiniLM when its
    // semantic tier is ready; a host without search-core loads its own. ──
    let embedFn = null;
    let embedLoading = false;
    let corpus = null;              // { chunks, vecs: Map id → Float32Array }
    let offerVecs = null;           // Map offerId → Float32Array[]
    const composers = new Set();

    function setEmbedder(fn) {
        if (!fn || embedFn) return;
        embedFn = async (t) => {
            const v = await fn(t);
            return v instanceof Float32Array ? v : Float32Array.from(v);
        };
        for (const c of composers) c._refine();
    }
    function setCorpus(chunks, vecs) {
        if (!chunks || !vecs) return;
        corpus = { chunks, vecs };
        for (const c of composers) c._refine();
    }
    function embedderReady() { return !!embedFn; }

    function ensureEmbedder() {
        if (embedFn || embedLoading || typeof document === 'undefined') return;
        embedLoading = true;
        (async () => {
            try {
                const mod = await import(TRANSFORMERS_URL);
                // same weights, dtype and device as search-core and
                // build-chunk-vectors.mjs, so vectors are comparable
                const ex = await mod.pipeline('feature-extraction', EMBED_MODEL_ID, { dtype: 'q8', device: 'wasm' });
                setEmbedder(async (t) => (await ex(t, { pooling: 'mean', normalize: true })).data);
            } catch (err) {
                console.warn('[Inquiry] embedder unavailable, staying on the grammar parse:', err && err.message || err);
            } finally {
                embedLoading = false;
            }
        })();
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

    let corpusLoading = false;
    function ensureCorpus(url) {
        if (corpus || corpusLoading || typeof fetch === 'undefined') return;
        corpusLoading = true;
        fetch(url).then(r => r.json()).then(d => {
            const chunks = d.chunks || d;
            const vecs = new Map(chunks.filter(c => c.vec).map(c => [c.id, decodeVec(c.vec, c.vecScale)]));
            setCorpus(chunks, vecs);
        }).catch(() => {}).finally(() => { corpusLoading = false; });
    }

    function cos(a, b) {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
    }

    function sentences(text) {
        return String(text || '')
            .split(/(?<=[.!?])\s+|\n+/)
            .map(s => s.trim())
            .filter(s => wordCount(s) >= 4)
            .slice(0, 14);
    }

    // Case studies a need can resemble. Services, bio and personal chunks
    // are not "related work".
    function isWorkChunk(c) {
        const u = String(c.url || '').replace(/^\.\//, '');
        return /^(nanome2|openprose)\.html|^design\.html#/.test(u);
    }

    async function ensureOfferVecs() {
        if (offerVecs || !embedFn) return;
        const m = new Map();
        for (const o of OFFERS) {
            const vs = [];
            for (const e of o.ex) vs.push(await embedFn(e));
            m.set(o.id, vs);
        }
        offerVecs = m;
    }

    // L0.5 — returns a new brief, or null when the embedder is not ready.
    async function refine(brief) {
        if (!embedFn || !brief || !brief.text) return null;
        await ensureOfferVecs();
        const sents = sentences(brief.text);
        if (!sents.length) sents.push(brief.text);
        const svecs = [];
        for (const s of sents) svecs.push(await embedFn(s));

        const scored = OFFERS.map(o => {
            let best = 0, sent = '';
            for (let i = 0; i < svecs.length; i++) {
                for (const ev of offerVecs.get(o.id)) {
                    const c = cos(svecs[i], ev);
                    if (c > best) { best = c; sent = sents[i]; }
                }
            }
            const lex = brief.lexOffers.includes(o.id);
            return { id: o.id, cos: best, score: best + (lex ? T.LEX_BONUS : 0), lex, sent };
        }).sort((a, b) => b.score - a.score);

        const offers = scored
            .filter(s => s.score >= T.WEAK)
            .slice(0, 2)
            .map(s => ({ id: s.id, strength: s.score >= T.STRONG ? 'strong' : 'weak', score: +s.score.toFixed(3) }));

        let track = brief.track, trackBasis = brief.trackBasis;
        const top = scored[0];
        if (top && top.score >= T.TRACK) {
            const topTrack = OFFER_BY_ID[top.id].track;
            // Meaning settles the track when the words did not, or when the
            // words were a single stray hit and meaning is firm.
            if (trackBasis === 'none' || (topTrack !== track && top.score >= T.STRONG && !(track === 'hiring'))) {
                track = topTrack; trackBasis = 'meaning';
            }
        }

        let related = [];
        if (corpus) {
            const whole = await embedFn(brief.text.slice(0, 1200));
            related = corpus.chunks
                .filter(isWorkChunk)
                .map(c => ({ c, s: corpus.vecs.has(c.id) ? cos(whole, corpus.vecs.get(c.id)) : 0 }))
                .filter(x => x.s >= T.RELATED)
                .sort((a, b) => b.s - a.s)
                .slice(0, 2)
                .map(x => ({ id: x.c.id, title: x.c.title, url: x.c.url, score: +x.s.toFixed(3) }));
        }

        return Object.assign({}, brief, {
            offers: offers.length ? offers : brief.offers,
            track, trackBasis, related, upgraded: true,
            _scores: scored.map(s => [s.id, +s.score.toFixed(3)]),
        });
    }

    // ── The view: the brief with the visitor's corrections applied ──
    const FIELDS = ['name', 'email', 'org', 'role', 'position', 'location', 'stage', 'timeline', 'budget'];

    function view(brief, ov) {
        ov = ov || {};
        const v = Object.assign({}, brief);
        for (const f of FIELDS) if (f in ov) v[f] = ov[f];
        if ('track' in ov) v.track = ov.track;
        if ('domains' in ov) v.domains = String(ov.domains).split(',').map(s => s.trim()).filter(Boolean);
        const inTrack = (brief.offers || []).filter(o => OFFER_BY_ID[o.id] && (v.track === 'unsure' || OFFER_BY_ID[o.id].track === v.track));
        v.offer = 'offer' in ov ? ov.offer : (inTrack[0] ? inTrack[0].id : '');
        v.offerStrength = (brief.offers.find(o => o.id === v.offer) || {}).strength || (v.offer ? 'chosen' : '');
        v.alsoOffer = v.offer ? ((inTrack.find(o => o.id !== v.offer) || {}).id || '') : '';
        return v;
    }

    // ── The message John receives ──
    function compose(v, ctx) {
        ctx = ctx || {};
        const offer = v.offer && OFFER_BY_ID[v.offer] ? OFFER_BY_ID[v.offer].name : '';
        const also = v.alsoOffer && OFFER_BY_ID[v.alsoOffer] ? OFFER_BY_ID[v.alsoOffer].name : '';
        const who = v.org || v.name;
        const ns = (x) => x || 'not stated';
        let subject;
        if (v.track === 'hiring') {
            subject = '[Hiring] ' + [v.position || 'Role', v.org, v.location].filter(Boolean).join(' · ');
        } else {
            const tl = v.track === 'unsure' ? 'General' : (v.track === 'coaching' ? 'Coaching' : 'Design');
            subject = '[Inquiry · ' + tl + '] ' + [offer || 'General', who, v.timeline].filter(Boolean).join(' · ');
        }
        const lines = [];
        const from = [v.name && v.email ? v.name + ' <' + v.email + '>' : (v.name || v.email), [v.role, v.org].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
        if (from) lines.push('From:      ' + from);
        lines.push('Track:     ' + TRACK_LABEL[v.track] + (offer ? ' → ' + offer : '') + (also ? ' (also: ' + also + ')' : ''));
        if (v.track === 'hiring') {
            lines.push('Position:  ' + ns(v.position));
            lines.push('Location:  ' + ns(v.location));
        }
        lines.push('Domain:    ' + (v.domains && v.domains.length ? v.domains.join(', ') : 'not stated') + ' · Stage: ' + ns(v.stage));
        lines.push('Timeline:  ' + ns(v.timeline) + ' · Budget: ' + ns(v.budget));
        if (v.related && v.related.length) lines.push('Related:   ' + v.related.map(r => r.title).join('; '));
        lines.push('');
        lines.push('Their words:');
        for (const l of String(v.text || '').split(/\n/)) lines.push('> ' + l);
        lines.push('');
        lines.push('Composed on johnhanacek.com/' + (ctx.page || '') + ' · parsed on the visitor’s device, no model wrote any of it');
        const body = lines.join('\n');
        const enc = encodeURIComponent;
        let mailto = 'mailto:' + TO + '?subject=' + enc(subject) + '&body=' + enc(body);
        let clipped = false;
        // Some Windows mail clients cap the URL near 2,000 characters. The
        // full message goes to the clipboard instead and the body says so.
        if (mailto.length > 1900) {
            const head = lines.slice(0, lines.indexOf('Their words:')).join('\n');
            const short = head + '\n\nTheir words are on your clipboard. Paste them here.\n';
            mailto = 'mailto:' + TO + '?subject=' + enc(subject) + '&body=' + enc(short);
            clipped = true;
        }
        return { to: TO, subject, body, mailto, clipped, full: 'To: ' + TO + '\nSubject: ' + subject + '\n\n' + body };
    }

    // ── Rendering (HTML strings, like the rest of the command bar) ──
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const FIELD_LABEL = { name: 'Name', email: 'Email', org: 'Company', role: 'Your role', position: 'Position', location: 'Location', stage: 'Stage', timeline: 'Timeline', budget: 'Budget' };
    const STAGE_OPTS = [['', 'not stated'], ['idea', 'idea'], ['prototype', 'prototype'], ['shipped', 'shipped'], ['scaling', 'scaling']];

    function fieldsFor(v) {
        const f = ['name', 'email', 'org', 'role'];
        if (v.track === 'hiring') f.push('position', 'location');
        f.push('stage', 'timeline', 'budget');
        return f;
    }

    function inputHtml(field, value, required) {
        if (field === 'stage') {
            return '<select class="inq-v" data-inq-field="stage" aria-label="Stage">'
                + STAGE_OPTS.map(([k, l]) => '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + l + '</option>').join('')
                + '</select>';
        }
        const type = field === 'email' ? 'email' : 'text';
        return '<input class="inq-v" type="' + type + '" data-inq-field="' + field + '" value="' + esc(value) + '" placeholder="' + (required ? 'so John can reply' : 'not stated') + '"' + (required ? ' required' : '') + ' aria-label="' + FIELD_LABEL[field] + '" autocomplete="' + (field === 'email' ? 'email' : field === 'name' ? 'name' : field === 'org' ? 'organization' : 'off') + '">';
    }

    function renderCard(v, st, opts) {
        const trackSel = '<select class="inq-v inq-track" data-inq-field="track" aria-label="Track">'
            + TRACKS.map(([k, l]) => '<option value="' + k + '"' + (k === v.track ? ' selected' : '') + '>' + l + '</option>').join('')
            + '</select>';
        const offerChoices = OFFERS.filter(o => v.track === 'unsure' || o.track === v.track);
        const offerSel = '<select class="inq-v inq-offer" data-inq-field="offer" aria-label="What you are looking for">'
            + '<option value=""' + (v.offer ? '' : ' selected') + '>not sure yet</option>'
            + offerChoices.map(o => '<option value="' + o.id + '"' + (o.id === v.offer ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('')
            + '</select>';
        const mark = v.offerStrength === 'strong' ? '<span class="inq-mark" title="Matched by meaning">●</span>'
            : v.offerStrength === 'weak' ? '<span class="inq-mark inq-mark--weak" title="A loose match. Change it if it is wrong">◐</span>'
            : v.offerStrength === 'words' ? '<span class="inq-mark inq-mark--weak" title="Matched by your words">◐</span>' : '';

        // The arrow, offer and mark travel as one unit, so a narrow card breaks
        // the line between the two pickers and never strands "→" or "◐".
        let rows = '<div class="inq-row inq-row--lead"><span class="inq-k">Looking for</span><span class="inq-lead">' + trackSel + '<span class="inq-offer-line"><span class="inq-arrow">→</span>' + offerSel + mark + '</span></span></div>';
        const missing = [];
        for (const f of fieldsFor(v)) {
            const val = v[f] || '';
            const forced = f === 'email' && st.relay;   // the relay needs somewhere to reply
            if (val || st.open.has(f) || forced) rows += '<div class="inq-row"><span class="inq-k">' + (forced ? 'Your email' : FIELD_LABEL[f]) + '</span>' + inputHtml(f, val, forced) + '</div>';
            else missing.push(f);
        }
        if (v.domains && v.domains.length) rows += '<div class="inq-row"><span class="inq-k">Domain</span><input class="inq-v" type="text" data-inq-field="domains" value="' + esc(v.domains.join(', ')) + '" aria-label="Domain"></div>';
        if (v.related && v.related.length) {
            rows += '<div class="inq-row"><span class="inq-k">Related work</span><span class="inq-related">'
                + v.related.map(r => '<a href="' + esc(opts.resolveHref ? opts.resolveHref(r.url) : r.url) + '">' + esc(r.title.split(':')[0]) + '</a>').join('<span class="inq-sep">·</span>')
                + '</span></div>';
        }
        const add = missing.length
            ? '<div class="inq-missing"><span class="inq-k">Not stated</span>' + missing.map(f => '<button type="button" class="inq-add" data-inq-add="' + f + '">+ ' + FIELD_LABEL[f].toLowerCase() + '</button>').join('') + '</div>'
            : '';
        const words = opts.showWords
            ? '<blockquote class="inq-words" title="Sent in full, exactly as written">' + esc(v.text) + '</blockquote>'
            : '';
        let foot;
        const emailOk = EMAIL_OK.test(String(v.email || '').trim());
        if (st.relay && st.ui === 'sending') {
            foot = '<div class="inq-receipt" role="status">Sending…</div>';
        } else if (st.relay && st.ui === 'sent') {
            foot = '<div class="inq-receipt inq-receipt--sent" role="status">Sent. It is in John’s inbox, and he will reply to ' + esc(v.email) + '.</div>';
        } else if (st.relay && st.ui === 'failed') {
            const m = compose(v, { page: opts.page });
            foot = '<div class="inq-receipt" role="status">That did not go through. ' + esc(RELAY_ERRORS[st.error] || 'The connection failed.')
                + ' <a class="inq-link" href="' + esc(m.mailto) + '" data-inq-act="mailto">Send it from your mail app</a> or <button type="button" class="inq-link" data-inq-act="copy">copy the message</button>.</div>';
        } else if (st.ui === 'opened') {
            foot = '<div class="inq-receipt" role="status">Your mail app should now show this message, addressed to ' + TO + '. It reaches John when you press send there.'
                + (st.clipped ? ' Your full words are on your clipboard. Paste them into the body.' : '')
                + ' Nothing opened? <button type="button" class="inq-link" data-inq-act="copy">Copy the message</button> and email it from anywhere.</div>';
        } else if (st.ui === 'copied') {
            foot = '<div class="inq-receipt" role="status">Copied. Paste it into an email to ' + TO + ' or a LinkedIn message.</div>';
        } else if (st.relay && !emailOk) {
            foot = '<div class="inq-note">Nothing leaves this page until you press Send.</div>';
        } else if (st.relay) {
            foot = '<div class="inq-note">Parsed on your device. Send delivers it straight to John’s inbox. Nothing leaves this page before that.</div>';
        } else {
            foot = '<div class="inq-note">Parsed on your device. Nothing leaves this page until you press Send.</div>';
        }
        const sendBtn = st.relay
            ? '<button type="button" class="intent-cta" data-inq-act="send"' + (emailOk && st.ui !== 'sending' && st.ui !== 'sent' ? '' : ' disabled') + '>' + (st.ui === 'sent' ? 'Sent' : 'Send to John') + '</button>'
            : '<a class="intent-cta" data-inq-act="send" href="mailto:' + TO + '">Send to John</a>';
        // A field no person sees or fills. Bots fill every field.
        const trap = st.relay ? '<div class="inq-hp" aria-hidden="true"><label>Leave this empty <input type="text" name="hp_field" data-inq-hp tabindex="-1" autocomplete="off"></label></div>' : '';
        return '<div class="inq-card" data-inq-card>'
            + '<div class="inq-head"><span class="inq-title">Message to John</span></div>'
            + '<div class="inq-rows">' + rows + '</div>' + add + words
            + trap + '<div class="inq-actions">'
            + sendBtn
            + '<button type="button" class="inq-btn" data-inq-act="copy">Copy message</button>'
            + '<a class="intent-alt" href="' + CALENDAR + '" target="_blank" rel="noopener" title="Leaves the site">Book a call</a>'
            + '</div>' + foot + '</div>';
    }

    // The card before there is anything to parse: the visitor asked to write
    // John a message ("message john", "inquire", the intent cards' button).
    function renderPrompt(opts) {
        const form = opts.resolveHref ? opts.resolveHref('services.html#book') : 'services.html#book';
        return '<div class="inq-card inq-prompt" data-inq-card>'
            + '<div class="inq-head"><span class="inq-title">Message to John</span><span class="cmdbar-group-label">write it right here</span></div>'
            + '<p class="inq-prompt-body">Keep typing and fill in the details to check before sending.</p>'
            + (opts.page === 'services.html' ? '' : '<div class="inq-actions"><a class="intent-alt" href="' + esc(form) + '">or use the form on the services page</a></div>')
            + '</div>';
    }

    // Count-only events (GoatCounter is cookieless; only the event NAME is sent).
    function count(name) {
        try {
            if (root.goatcounter && root.goatcounter.count) root.goatcounter.count({ path: name, title: name, event: true });
        } catch (e) {}
    }

    // Where Send posts, when anywhere. Read lazily: jh-chrome.js (which sets
    // JH_SITE) is deferred, and a test can set JH_INQUIRY_ENDPOINT first.
    // A string JH_INQUIRY_ENDPOINT overrides the site config, and '' pins the
    // mail-app route (the test suite uses both).
    function relayEndpoint(opts) {
        if (opts && opts.endpoint) return opts.endpoint;
        if (typeof root.JH_INQUIRY_ENDPOINT === 'string') return root.JH_INQUIRY_ENDPOINT;
        return (root.JH_SITE && root.JH_SITE.inquiryEndpoint) || '';
    }
    // Same shape the relay accepts (Agent Reference/inquiry-relay/Code.gs).
    const EMAIL_OK = /^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[A-Za-z]{2,}$/;
    // Keep in step with LIMITS.minComposeMs in the relay, plus a margin.
    const MIN_COMPOSE_MS = 3200;
    const RELAY_ERRORS = {
        email: 'The email address looks incomplete.',
        short: 'The message is too short to send.',
        long: 'The message is too long for the relay.',
        rate: 'Too many messages from this address in the last hour.',
        quota: 'The relay has reached its daily limit.',
    };

    // ── The composer: one live card bound to a host element. The command bar
    // rebuilds its results on every full render, so the host can change;
    // attach() moves the card and its state to the new host. ──
    function composer(opts) {
        opts = Object.assign({ page: '', showWords: true, autoEmbed: false, corpusUrl: null, resolveHref: null, onSent: null, endpoint: '' }, opts || {});
        const st = { text: '', brief: null, refined: null, ov: {}, open: new Set(), ui: 'draft', clipped: false, host: null, gen: 0, counted: false, timer: 0, relay: false, shownAt: 0, error: '', prompt: false };

        function current() { return st.brief ? view(st.refined || st.brief, st.ov) : null; }

        function render() {
            const host = st.host;
            if (!host) return;
            const v = current();
            if (!v) { host.innerHTML = st.prompt ? renderPrompt(opts) : ''; return; }
            // Keep focus and caret across re-renders (a refine can land while
            // the visitor is typing in a field).
            const a = typeof document !== 'undefined' ? document.activeElement : null;
            const focusField = a && host.contains(a) && a.dataset ? a.dataset.inqField : null;
            const sel = focusField && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
            st.relay = !!relayEndpoint(opts);
            if (!st.shownAt) st.shownAt = Date.now();
            host.innerHTML = renderCard(v, st, opts);
            if (focusField) {
                const n = host.querySelector('[data-inq-field="' + focusField + '"]');
                if (n) { n.focus(); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) {} }
            }
            if (!st.counted) { st.counted = true; count('inquiry-composed'); }
        }

        function onInput(e) {
            const f = e.target.dataset && e.target.dataset.inqField;
            if (!f || e.target.tagName === 'SELECT') return;
            const wasOk = EMAIL_OK.test(String((current() || {}).email || '').trim());
            st.ov[f] = e.target.value;
            const leaving = st.ui !== 'draft' && st.ui !== 'sending';
            if (leaving) st.ui = 'draft';
            // Send's enabled state follows the email; repaint only when it flips
            // (render keeps the caret), or when a receipt has to clear.
            if (st.relay && ((f === 'email' && wasOk !== EMAIL_OK.test(e.target.value.trim())) || leaving)) render();
        }
        function onChange(e) {
            const f = e.target.dataset && e.target.dataset.inqField;
            if (!f || e.target.tagName !== 'SELECT') return;
            st.ov[f] = e.target.value;
            if (f === 'track') delete st.ov.offer;
            st.ui = 'draft';
            render();
            if ((f === 'track' || f === 'offer') && opts.onRefine) opts.onRefine(current());
        }
        function onClick(e) {
            const add = e.target.closest('[data-inq-add]');
            if (add) {
                const f = add.dataset.inqAdd;
                st.open.add(f);
                render();
                const n = st.host.querySelector('[data-inq-field="' + f + '"]');
                if (n) n.focus();
                return;
            }
            const act = e.target.closest('[data-inq-act]');
            if (!act) return;
            const msg = compose(current(), { page: opts.page });
            if (act.dataset.inqAct === 'send' && st.relay) {
                e.preventDefault();
                sendViaRelay(msg);
                return;
            }
            if (act.dataset.inqAct === 'mailto') {
                // The relay failed; the visitor chose the mail-app route.
                act.setAttribute('href', msg.mailto);
                count('inquiry-send-fallback');
                return;
            }
            if (act.dataset.inqAct === 'send') {
                // The anchor's own default action opens the mail app; set its
                // href now so it carries the latest corrections.
                act.setAttribute('href', msg.mailto);
                st.clipped = msg.clipped;
                if (msg.clipped && navigator.clipboard) navigator.clipboard.writeText(msg.full).catch(() => {});
                count('inquiry-send');
                // Re-render AFTER the navigation: a detached anchor cannot navigate.
                setTimeout(() => { st.ui = 'opened'; render(); if (opts.onSent) opts.onSent(msg); }, 80);
                return;
            }
            if (act.dataset.inqAct === 'copy') {
                e.preventDefault();
                const done = () => { st.ui = 'copied'; render(); count('inquiry-copy'); };
                if (navigator.clipboard) navigator.clipboard.writeText(msg.full).then(done, done);
                else done();
            }
        }
        function sendViaRelay(msg) {
            const v = current();
            const email = String(v.email || '').trim();
            if (st.ui === 'sending' || !EMAIL_OK.test(email)) return;
            const hp = st.host && st.host.querySelector('[data-inq-hp]');
            st.ui = 'sending'; st.error = '';
            render();
            // The relay silently drops anything posted under 3 s after the card
            // appeared (a bot's pace). A person who restores a draft and sends
            // at once must never be dropped, so the page waits out the rest.
            const hold = Math.max(0, MIN_COMPOSE_MS - (Date.now() - st.shownAt));
            setTimeout(() => post(email, v, msg, hp ? hp.value : ''), hold);
        }
        function post(email, v, msg, trap) {
            const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = setTimeout(() => ctl && ctl.abort(), 20000);
            // text/plain keeps this a "simple" request: no CORS preflight,
            // which an Apps Script web app cannot answer.
            fetch(relayEndpoint(opts), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    email, name: v.name || '', subject: msg.subject, body: msg.body, text: v.text,
                    page: opts.page, elapsed: Date.now() - st.shownAt, website: trap,
                }),
                signal: ctl ? ctl.signal : undefined,
            }).then(r => r.json()).then(res => {
                if (res && res.ok) {
                    st.ui = 'sent';
                    count('inquiry-sent');
                    if (opts.onSent) opts.onSent(msg);
                } else {
                    st.ui = 'failed'; st.error = (res && res.error) || '';
                    count('inquiry-send-failed');
                }
            }).catch(() => {
                st.ui = 'failed'; st.error = 'network';
                count('inquiry-send-failed');
            }).then(() => { clearTimeout(timer); render(); });
        }
        function onKey(e) {
            // Enter in a card field commits the field, never the search bar's top result.
            if (e.key === 'Enter' && e.target.dataset && e.target.dataset.inqField) { e.preventDefault(); e.stopPropagation(); e.target.blur(); }
        }

        const api = {
            attach(host) {
                if (host === st.host) return;
                if (st.host) {
                    st.host.removeEventListener('input', onInput);
                    st.host.removeEventListener('change', onChange);
                    st.host.removeEventListener('click', onClick);
                    st.host.removeEventListener('keydown', onKey);
                }
                st.host = host;
                if (host) {
                    host.addEventListener('input', onInput);
                    host.addEventListener('change', onChange);
                    host.addEventListener('click', onClick);
                    host.addEventListener('keydown', onKey);
                }
                render();
            },
            update(text) {
                text = String(text || '');
                if (text.trim() === st.text.trim()) return;
                st.text = text;
                // "message john: we're building…" parses only what follows.
                const body = stripCommand(text);
                st.prompt = !body.trim() && COMMAND.test(text);
                st.brief = body.trim() ? parse(body) : null;
                st.refined = null;
                st.ui = 'draft';
                render();
                if (st.brief && opts.autoEmbed) { ensureEmbedder(); if (opts.corpusUrl) ensureCorpus(opts.corpusUrl); }
                api._refine();
            },
            reset() { st.text = ''; st.brief = null; st.refined = null; st.ov = {}; st.open.clear(); st.ui = 'draft'; render(); },
            // The card's current HTML, for hosts that must measure it before
            // attaching (the command bar's fit loop counts its height).
            html() { const v = current(); if (!v) return st.prompt ? renderPrompt(opts) : ''; st.relay = !!relayEndpoint(opts); return renderCard(v, st, opts); },
            view() { return current(); },
            // A host that rebuilds its DOM calls these around the rebuild so a
            // visitor typing in a card field keeps their place.
            captureFocus() {
                const a = typeof document !== 'undefined' ? document.activeElement : null;
                if (!a || !st.host || !st.host.contains(a) || !a.dataset || !a.dataset.inqField) return null;
                return { field: a.dataset.inqField, sel: typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null };
            },
            restoreFocus(f) {
                if (!f || !st.host) return;
                const n = st.host.querySelector('[data-inq-field="' + f.field + '"]');
                if (!n) return;
                n.focus();
                if (f.sel && n.setSelectionRange) try { n.setSelectionRange(f.sel[0], f.sel[1]); } catch (e) {}
            },
            focusSend() {
                const s = st.host && st.host.querySelector('[data-inq-act="send"]');
                // A disabled Send cannot take focus; the email it waits for can.
                const target = s && s.disabled ? st.host.querySelector('[data-inq-field="email"]') : s;
                if (target) target.focus();
                return !!target;
            },
            state() { return { text: st.text, brief: st.brief, refined: st.refined, view: current(), ui: st.ui }; },
            message() { const v = current(); return v ? compose(v, { page: opts.page }) : null; },
            _refine() {
                if (!st.brief || !embedFn) return;
                const gen = ++st.gen;
                clearTimeout(st.timer);
                st.timer = setTimeout(() => {
                    refine(st.brief).then(r => {
                        if (!r || gen !== st.gen) return;
                        st.refined = r;
                        render();
                        if (opts.onRefine) opts.onRefine(current());
                    }).catch(err => console.warn('[Inquiry] refine failed:', err && err.message || err));
                }, 350);
            },
            destroy() { api.attach(null); composers.delete(api); },
        };
        composers.add(api);
        return api;
    }

    root.JHInquiry = {
        detect, parse, refine, view, compose, renderCard, composer,
        setEmbedder, setCorpus, ensureEmbedder, ensureCorpus, embedderReady,
        OFFERS, TRACKS, T, TO, relayEndpoint, stripCommand,
    };
})(typeof window !== 'undefined' ? window : globalThis);
