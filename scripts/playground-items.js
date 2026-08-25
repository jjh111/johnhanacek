/*
 * playground-items.js — the manifest behind playground.html.
 *
 * Mirrors the shape canvas-display expects (`file`, `name`, `desc`), plus two
 * fields this site needs that the OpenProse brand set never did:
 *
 *   nested: true   The page ITSELF embeds canvas-display. Waking it live nests
 *                  the tool inside itself, each copy running its own iframe
 *                  budget. Such an item is never woken — the card links out
 *                  instead. This is a FLAG rather than a convention on purpose:
 *                  openprose.html carries 27 iframes, six of them canvases, and
 *                  a rule kept in someone's head is a rule that gets forgotten
 *                  and then debugged for an hour.
 *
 *   weight: 'heavy'  Expensive enough that it may need arming before it wakes.
 *                  A property of the PAGE, not of the device — device capability
 *                  scales the budget separately. Unused until the staged plan
 *                  reaches hard gating (see PLAYGROUND_CANVAS_PLAN.md §5); it is
 *                  recorded now so the measurements have something to key on.
 *
 * `created` drives the date sort. Dates are first-appearance, approximate for
 * the older demos carried over from the hand-built board.
 */
window.CANVAS_ITEMS = [
  // ---- the site itself ----------------------------------------------------
  { file: 'index.html', name: 'index', cat: 'site',
    desc: 'Homepage — fish minigame hero, portfolio intro',
    weight: 'heavy', created: '2026-01-10T00:00:00-08:00' },
  { file: 'design.html', name: 'design', cat: 'site',
    desc: 'Design — Fish Maze: blueprint drawing canvas with living fish',
    weight: 'heavy', created: '2026-02-02T00:00:00-08:00' },
  { file: 'art.html', name: 'art', cat: 'site',
    desc: 'Art — cosmic canvas, writing, Earth Star, Influence',
    weight: 'heavy', created: '2026-01-20T00:00:00-08:00' },
  { file: 'about.html', name: 'about', cat: 'site',
    desc: 'About — bio, experience, education, expertise, awards',
    created: '2026-01-12T00:00:00-08:00' },
  { file: 'services.html', name: 'services', cat: 'site',
    desc: 'Services — AI coaching, Claude Code coaching, founding designer',
    created: '2026-01-15T00:00:00-08:00' },
  { file: 'search.html', name: 'search', cat: 'site',
    desc: 'AI-powered search — BM25, WebGPU, local LLM',
    created: '2026-06-05T00:00:00-07:00' },
  { file: 'writing.html', name: 'writing', cat: 'site',
    desc: 'Writing index and reader — EduOS and MetaMedium essays',
    created: '2026-03-01T00:00:00-08:00' },
  { file: 'nanome2.html', name: 'nanome2', cat: 'case study',
    desc: 'Nanome 2 — XR product design case study',
    created: '2026-02-14T00:00:00-08:00' },

  // Poster-only. See `nested` above.
  { file: 'openprose.html', name: 'openprose', cat: 'case study',
    desc: 'OpenProse — founding design case study. Opens in its own tab: this page embeds six review canvases of its own.',
    nested: true, weight: 'heavy', created: '2026-08-14T00:00:00-07:00' },

  { file: 'onagents.html', name: 'onagents', cat: 'writing',
    desc: 'The Problems of Agent Orchestration — 37k-word essay, 24 canvases',
    weight: 'heavy', created: '2026-07-01T00:00:00-07:00' },

  // ---- experiments --------------------------------------------------------
  { file: 'tidepool.html', name: 'tidepool', cat: 'experiment',
    desc: 'Bioluminescent tidepool visualising an AI-agent ecosystem',
    created: '2026-05-10T00:00:00-07:00' },
  { file: 'beach-beers.html', name: 'beach-beers', cat: 'experiment',
    desc: 'Whimsical animated SVG scene',
    created: '2026-04-02T00:00:00-07:00' },
  { file: '404.html', name: '404', cat: 'site',
    desc: 'Custom 404 with an ambient fish canvas',
    created: '2026-01-18T00:00:00-08:00' },

  // ---- demos, carried over from the hand-built board ----------------------
  { file: 'Assets/DemosPlayground/aethereal-flight/index.html', name: 'cyberbird', cat: 'game',
    desc: 'Radical aerial flight simulator in 3D space',
    weight: 'heavy', created: '2025-11-01T00:00:00-07:00' },
  { file: 'Assets/DemosPlayground/sna-drawing-demo.html', name: 'social-network-viz', cat: 'tool',
    desc: 'Draw nodes and edges, watch force-directed layout emerge',
    created: '2025-11-05T00:00:00-08:00' },
  { file: 'Assets/3d-sync-demo/index.html', name: '3d-sync-demo', cat: 'demo',
    desc: 'Three synchronized 3D viewports with linked camera controls',
    weight: 'heavy', created: '2025-11-10T00:00:00-08:00' },
  { file: 'Assets/DemosPlayground/CreativeCODE2016/hypercube/hypercube.html', name: 'hypercube', cat: 'demo',
    desc: '4D tesseract projected into 3D space, rotating in real time',
    created: '2016-05-01T00:00:00-07:00' },
  { file: 'Assets/DemosPlayground/CreativeCODE2016/DynaBoard1/Dynaboard1.html', name: 'dynaboard-v1', cat: 'demo',
    desc: 'Dynamic 3D board experiment — early spatial interface concept',
    created: '2016-04-01T00:00:00-07:00' },
  { file: 'Assets/DemosPlayground/StyleRefs/black-hole-gothic.html', name: 'black-hole-gothic', cat: 'ideas',
    desc: 'Dark cosmic design system with gold accents and star animations',
    created: '2025-12-01T00:00:00-08:00' },
  { file: 'Assets/DemosPlayground/CreativeCODE2016/transcendence-gold.html', name: 'transcendence-gold', cat: 'ideas',
    desc: 'Luxury warm-toned design system, elegant typography',
    created: '2016-06-01T00:00:00-07:00' },
  { file: 'Assets/DemosPlayground/StyleRefs/gothic-manuscript.html', name: 'gothic-manuscript', cat: 'ideas',
    desc: 'Medieval manuscript aesthetic, parchment tones',
    created: '2025-12-05T00:00:00-08:00' },
  { file: 'Assets/DemosPlayground/StyleRefs/ancient-matrix-lab.html', name: 'ancient-matrix-lab', cat: 'ideas',
    desc: 'Glitch-meets-antiquity design system with matrix aesthetics',
    created: '2025-12-08T00:00:00-08:00' },
  { file: 'Assets/DemosPlayground/StyleRefs/altec-style.html', name: 'typography-experiments', cat: 'ideas',
    desc: 'Expressive type explorations and layout experiments',
    created: '2025-12-12T00:00:00-08:00' },
  { file: 'Assets/DemosPlayground/pretext-wrap-test.html', name: 'pretext-wrap', cat: 'tool',
    desc: 'Prose flowing around obstacles on both sides — scripts/pretext-wrap.js',
    created: '2026-08-24T00:00:00-07:00' },
];
