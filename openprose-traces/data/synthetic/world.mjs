// world.mjs: the invented world every synthetic trace comes from.
//
// One public aquarium (Saltlight) runs five OpenProse responsibilities. Five
// other organizations make up the fleet around it. Nothing here describes a
// real organization, person, run or workflow; the domains were chosen to sit
// well away from any real customer's. generate.mjs turns this file into every
// view's data slot, so a name changed here changes everywhere at once.

export const SEED = 20260626;

// June 2026 starts on a Monday. The month feeds the periscope; the last full
// week (Mon Jun 22 to Sun Jun 28) feeds the atriums, ledger and fleet views.
// Times are UTC; the aquarium keeps Pacific time (UTC-7 in June).
export const MONTH = { year: 2026, month: 6, days: 30, label: 'June 2026' };
export const WEEK = { firstDay: 22, lastDay: 28, number: 26, label: 'Jun 22 → 28' };

export const DIMS = [
  { k: 'rf', short: 'RF', long: 'runtime fidelity', desc: 'fidelity' },
  { k: 'te', short: 'TE', long: 'task effectiveness', desc: 'effect' },
  { k: 'cs', short: 'CS', long: 'contract satisfaction', desc: 'contract' },
  { k: 'ds', short: 'DS', long: 'domain score', desc: 'domain' },
];

export const ORG = {
  id: 'saltlight',
  label: 'Saltlight Aquarium',
  shortLabel: 'Saltlight',
  domain: 'public aquarium',
  color: 0x2f7d82,
};

export const EXHIBITS = [
  'reef wall', 'kelp forest', 'mangrove lagoon', 'jelly gallery', 'seahorse nursery',
  'octopus den', 'shark shallows', 'touch pool', 'eelgrass meadow', 'rocky shore', 'quarantine bay',
];

// ---------------------------------------------------------------- programs
// Each program is a small service graph: caller inputs, an optional lead
// step, one parallel layer, and a compiler that writes the deliverable.
export const PROGRAMS = {
  'chemistry-watch': {
    label: 'Chemistry watch',
    cadence: 'daily · 02:00 PT',
    schedule: { days: 'daily', utc: [9, 0] },
    color: 0x4587b3, cssColor: 'var(--prog-b)',
    about: 'Reads every tank\'s overnight probe export and flags any reading that drifted out of range.',
    register: 'three readers, one log',
    deliverable: 'readings', deliverableLong: 'overnight readings log',
    inputs: ['probe_export', 'tank_roster'],
    scouts: ['salinity-reader', 'alkalinity-reader', 'nutrient-reader'],
    compiler: 'chemistry-compiler', output: 'readings.md',
    durMin: [3.2, 5.6],
    baseline: { rf: 95, te: 88, cs: 92, ds: 89 },
    topology: 'reader-fan', pattern: 'parallel',
    checks: ['every_tank_read', 'units_consistent', 'ranges_from_roster', 'drift_flagged',
      'no_stale_readings', 'flags_show_values', 'week_trend_attached', 'alerts_routed', 'plain_language'],
  },
  'feeding-tracker': {
    label: 'Feeding tracker',
    cadence: 'daily · 16:00 PT',
    schedule: { days: 'daily', utc: [23, 0] },
    color: 0x339c6d, cssColor: 'var(--prog-c)',
    about: 'Checks the day\'s feeding log against each exhibit\'s diet plan and notes every refusal.',
    register: 'two readers, reconciled',
    deliverable: 'ledger', deliverableLong: 'daily feeding ledger',
    inputs: ['feeding_log', 'diet_plan'],
    scouts: ['log-reader', 'diet-reader'],
    compiler: 'feeding-compiler', output: 'ledger.md',
    durMin: [1.6, 3.1],
    baseline: { rf: 93, te: 90, cs: 91, ds: 86 },
    topology: 'reconcile', pattern: 'bidirectional',
    checks: ['every_feed_matched', 'refusals_listed', 'diet_plan_current', 'amounts_in_grams',
      'no_double_counts', 'plain_language'],
  },
  'livestock-memo': {
    label: 'Livestock health memo',
    cadence: 'weekly · Fri 07:30 PT',
    schedule: { days: 'fri', utc: [14, 30] },
    color: 0xc8664e, cssColor: 'var(--prog-a)',
    about: 'Turns the week\'s keeper notes, feeding logs, photo survey and water readings into one health memo per exhibit.',
    register: 'four scouts, one memo',
    deliverable: 'memo', deliverableLong: 'weekly livestock health memo',
    inputs: ['week_of', 'keeper_notes', 'tank_roster', 'photo_survey'],
    lead: 'roster-profiler',
    scouts: ['behavior-scout', 'feeding-scout', 'photo-scout', 'water-scout'],
    compiler: 'husbandry-compiler', output: 'memo.md',
    durMin: [8.2, 10.4],
    baseline: { rf: 90, te: 89, cs: 90, ds: 91 },
    topology: 'scout-fan', pattern: 'self-refine',
    checks: ['covers_every_exhibit', 'flags_cite_evidence', 'photo_for_every_flag', 'no_diagnosis_claims',
      'actions_have_owners', 'readings_match_watch', 'quarantine_status_current', 'plain_language'],
  },
  'supplier-scan': {
    label: 'Supplier scan',
    cadence: 'weekly · Mon 09:00 PT',
    schedule: { days: 'mon', utc: [16, 0] },
    color: 0xa45b9f, cssColor: 'var(--prog-d)',
    about: 'Scans the approved suppliers for wishlist livestock and dry goods, with price and quarantine notes.',
    register: 'three gated scans',
    deliverable: 'shortlist', deliverableLong: 'supplier shortlist for approval',
    inputs: ['wishlist', 'supplier_list'],
    scouts: ['coral-scout', 'fish-scout', 'drygoods-scout'],
    compiler: 'order-compiler', output: 'shortlist.md',
    durMin: [6.5, 9.0],
    baseline: { rf: 87, te: 85, cs: 90, ds: 88 },
    topology: 'supplier-gate', pattern: 'branch-gate',
    checks: ['only_approved_suppliers', 'captive_bred_first', 'quarantine_days_listed', 'prices_dated',
      'links_resolve', 'no_duplicate_listings', 'wishlist_covered', 'within_budget', 'ship_window_ok', 'plain_language'],
  },
  inspector: {
    label: 'Inspector',
    cadence: 'after each memo and scan',
    color: 0x8a8478, cssColor: '#8a8478',
    about: 'OpenProse\'s standard inspector: re-reads a finished run against its contract and scores it.',
    isEval: true,
    root: 'std/evals/inspector',
    baseline: { rf: 96, te: 92, cs: 95, ds: 90 },
  },
};
export const PROGRAM_ORDER = ['chemistry-watch', 'feeding-tracker', 'livestock-memo', 'supplier-scan', 'inspector'];
export const PRODUCING = PROGRAM_ORDER.filter((p) => !PROGRAMS[p].isEval);

// ------------------------------------------------------------- the glosses
export const INPUT_GLOSS = {
  probe_export: 'the night\'s probe export: temperature, salinity, alkalinity, pH, nitrate and phosphate per tank',
  tank_roster: 'every exhibit with its species list and the ranges each tank should hold',
  feeding_log: 'every feed the keepers logged today, with amounts and refusals',
  diet_plan: 'what each exhibit is meant to be fed, and how often',
  week_of: 'the Monday that opens the week being reported',
  keeper_notes: 'the keepers\' free-text notes for the week, one entry per observation',
  photo_survey: 'the week\'s photo survey from the gallery cameras, one set per exhibit',
  wishlist: 'livestock and dry goods the curators want, in priority order',
  supplier_list: 'the suppliers the aquarium has approved, with their quarantine terms',
  subject: 'the finished run the inspector re-reads',
};

export const SERVICES = {
  'salinity-reader': ['Reads conductivity and temperature for every tank.', 'salinity and temperature per tank, with the previous night beside it'],
  'alkalinity-reader': ['Reads alkalinity, calcium and pH for the reef systems.', 'alkalinity, calcium and pH per reef tank'],
  'nutrient-reader': ['Reads nitrate and phosphate and compares them with the last seven nights.', 'nitrate and phosphate per tank, with a seven-night trend'],
  'chemistry-compiler': ['Writes the overnight log and routes any out-of-range reading to the morning crew.', 'one line per tank; every flag shows its value and its range'],
  'log-reader': ['Reads the feeding log and groups feeds by exhibit.', 'feeds per exhibit with amounts and refusals'],
  'diet-reader': ['Reads each exhibit\'s diet plan and what was due today.', 'what each exhibit was due today'],
  'feeding-compiler': ['Matches feeds to the plan and writes the daily ledger.', 'every planned feed matched or listed as missed'],
  'roster-profiler': ['Reads the roster and last week\'s memo and decides what to look at first.', 'a watchlist of exhibits, with the reason each is on it'],
  'behavior-scout': ['Reads the keeper notes for changes in behaviour: hiding, appetite, aggression.', 'behaviour changes per exhibit, each with the note it came from'],
  'feeding-scout': ['Reads the week\'s feeding ledgers for refusals and missed feeds.', 'refusals and missed feeds per exhibit'],
  'photo-scout': ['Reads the photo survey for visible change: colour, fins, bell margins.', 'visible changes per exhibit, each with its photo'],
  'water-scout': ['Pulls the week\'s chemistry logs and marks any drift.', 'drift per tank with the nights it lasted'],
  'image-reader': ['Delegate: reads one photo set and describes what changed since last week.', 'one description per photo'],
  'husbandry-compiler': ['Writes the weekly memo: flags first, then the steady exhibits, then actions with owners.', 'one section per exhibit; every flag cites its evidence; actions have owners'],
  'coral-scout': ['Scans the approved suppliers for wishlist corals.', 'in-stock corals with price, size and quarantine terms'],
  'fish-scout': ['Scans the approved suppliers for wishlist fish, captive-bred first.', 'in-stock fish with origin, price and quarantine terms'],
  'drygoods-scout': ['Scans for food, salt mix and filter media against the reorder list.', 'dry goods with price per unit and ship date'],
  'order-compiler': ['Writes the shortlist for the curator to approve.', 'a shortlist within budget, every line dated and linked'],
};

export const CHECKS = {
  every_tank_read: 'Did every tank on the roster get a reading?',
  units_consistent: 'Are all readings in the roster\'s units?',
  ranges_from_roster: 'Are the ranges the ones the roster sets?',
  drift_flagged: 'Is every out-of-range reading flagged?',
  no_stale_readings: 'Are all readings from last night?',
  flags_show_values: 'Does every flag show its value and the previous night\'s?',
  week_trend_attached: 'Is the seven-night trend attached?',
  alerts_routed: 'Did flags reach the morning crew?',
  plain_language: 'Is it written so a new keeper could act on it?',
  every_feed_matched: 'Is every planned feed matched to a logged one?',
  refusals_listed: 'Is every refusal listed?',
  diet_plan_current: 'Was the current diet plan used?',
  amounts_in_grams: 'Are amounts in grams?',
  no_double_counts: 'Is each feed counted once?',
  covers_every_exhibit: 'Does every exhibit on the roster have a section?',
  flags_cite_evidence: 'Does each flag point to a note, a log line or a reading?',
  photo_for_every_flag: 'Does every flagged exhibit have a photo?',
  no_diagnosis_claims: 'Does it describe, and leave diagnosis to the vet?',
  actions_have_owners: 'Does every action have an owner?',
  readings_match_watch: 'Do the water readings match the chemistry watch?',
  quarantine_status_current: 'Is the quarantine bay\'s status current?',
  only_approved_suppliers: 'Are all listings from approved suppliers?',
  captive_bred_first: 'Are captive-bred animals listed before wild-caught?',
  quarantine_days_listed: 'Does every animal show its quarantine days?',
  prices_dated: 'Is every price dated?',
  links_resolve: 'Do all listing links resolve?',
  no_duplicate_listings: 'Is each listing on the shortlist once?',
  wishlist_covered: 'Is every wishlist item found or marked unavailable?',
  within_budget: 'Is the shortlist within the month\'s budget?',
  ship_window_ok: 'Can everything ship before the quarantine bay frees up?',
};

export const RUN_PROGRAM_FLOW = {
  'Chemistry watch': 'Inputs → three parallel readers → chemistry-compiler.',
  'Feeding tracker': 'Inputs → two readers reconciled → feeding-compiler.',
  'Livestock health memo': 'Inputs → roster-profiler → four parallel scouts → husbandry-compiler.',
  'Supplier scan': 'Inputs → three gated scouts → order-compiler.',
  Inspector: 'One finished run → the contract re-read check by check.',
};

export const TREND_NOTES = {
  'chemistry-watch': 'Steady all month; one truncated export on the 9th, one <em>nitrate</em> flag on the 24th.',
  'feeding-tracker': 'Holding; a stale diet plan on the 17th was the only miss.',
  'livestock-memo': 'Four memos; the 26th shipped with one photo missing.',
  'supplier-scan': 'One supplier site was down on the 15th; Thursday\'s request is awaiting approval.',
  inspector: 'Re-read every memo and scan this week, plus one chemistry spot check.',
};

// ------------------------------------------------- the month's story beats
// Everything else is seeded noise around each program's baseline.
export const EVENTS = {
  'chemistry-watch': {
    9: { verdict: 'fail', weak: 'rf', hit: { rf: -34, te: -20, cs: -18 },
      summary: 'The probe export stopped after six of eleven tanks; the log went out marked incomplete.' },
    24: { verdict: 'partial', weak: 'cs', hit: { cs: -14 }, flag: true,
      summary: 'Nitrate in the <em>mangrove lagoon</em> read 12 ppm, double its usual; flagged for the morning crew.' },
    25: { summary: 'Mangrove lagoon nitrate back to 9 ppm after Wednesday\'s water change; every other tank in range.' },
  },
  'feeding-tracker': {
    17: { verdict: 'partial', weak: 'ds', hit: { ds: -15, cs: -8 },
      summary: 'The jelly gallery\'s diet plan was a week old; two feeds were matched against the wrong amounts.' },
    23: { summary: '46 feeds logged; a garibaldi in the kelp forest refused krill.' },
    24: { summary: '47 feeds logged; the same garibaldi refused again.' },
  },
  'livestock-memo': {
    26: { verdict: 'partial', weak: 'cs', hero: true, hit: { cs: -9, te: -3 } },
  },
  'supplier-scan': {
    15: { verdict: 'partial', weak: 'rf', hit: { rf: -16, te: -6 },
      summary: 'One supplier\'s site was down; its corals are missing from the shortlist.' },
  },
};

// The on-demand request in the reported week.
export const ON_DEMAND = {
  program: 'supplier-scan', day: 25, utc: [20, 10], durMin: 7.2, gate: 'awaiting',
  subject: 'Captive-bred mandarin dragonets',
  context: 'requested by the reef team · wishlist: one pair',
  summary: 'One approved supplier now lists a captive-bred pair, with 30 days of quarantine included. The shortlist is waiting for the curator.',
};

// Inspector runs in the reported week: which run each one re-reads.
export const INSPECTIONS = [
  { program: 'supplier-scan', day: 22, failed: [] },
  { program: 'chemistry-watch', day: 24, failed: ['flags_show_values'] },
  { program: 'supplier-scan', day: 25, failed: [] },
  { program: 'livestock-memo', day: 26, failed: ['photo_for_every_flag'] },
];

// ------------------------------------------------------------- the hero run
// The livestock memo of Friday June 26: four scouts in parallel, the photo
// scout fails on a late camera export, re-runs through a delegate and
// recovers, and the memo ships with one gap the inspector then catches.
export const HERO = {
  program: 'livestock-memo', day: 26,
  start: [14, 30, 12],                 // 07:30:12 PT
  // seconds from start at which each step closes
  closes: {
    week_of: 1, keeper_notes: 2, tank_roster: 2, photo_survey: 3,
    'roster-profiler': 38,
    'behavior-scout': 214, 'feeding-scout': 166, 'water-scout': 191,
    'photo-scout#1': 247,              // fails: export-incomplete
    'image-reader': 431,               // the delegate reads the late export
    'photo-scout#2': 452,              // resumed and complete
    'husbandry-compiler': 641,
    end: 696,                          // 11m 36s
  },
  error: 'export-incomplete',
  subject: 'Livestock health · week of Jun 22',
  context: 'week_of: Jun 22 · 11 exhibits · photo survey, keeper notes, feeding ledgers, chemistry logs',
  summary: 'Three flags: the <em>mangrove lagoon</em>\'s nitrate (improving), a garibaldi hiding at feeds in the <em>kelp forest</em>, and ragged bell margins on two moon jellies. The photo scout failed once on a late camera export and recovered; one jelly photo is still missing.',
  flags: [
    { exhibit: 'mangrove lagoon', state: 'improving',
      text: 'Nitrate read 12 ppm on Tuesday night, double its usual. Wednesday\'s water change brought it back to 6 ppm by Friday. The upside-down jellies are feeding normally.' },
    { exhibit: 'kelp forest', state: 'watch',
      text: 'One garibaldi has hidden at feeds three days running (keeper notes, Tue to Thu) and refused krill twice. Its photo is clear: no fin damage, colour normal.' },
    { exhibit: 'jelly gallery', state: 'needs a look',
      text: 'Two moon jellies show ragged bell margins in Monday\'s photos. Thursday\'s photo set arrived late and incomplete, so there is no second photo to compare.' },
  ],
  steady: ['reef wall', 'seahorse nursery', 'octopus den', 'shark shallows', 'touch pool', 'eelgrass meadow', 'rocky shore'],
  quarantine: 'Two captive-bred clownfish, day 12 of 30, eating well.',
  actions: [
    { owner: 'kelp team', text: 'Watch the garibaldi at Saturday\'s feed; offer mysis if it refuses krill again.' },
    { owner: 'jelly team', text: 'Retake the kreisel photos on Saturday morning, before feeding.' },
    { owner: 'water team', text: 'Keep the mangrove lagoon on nightly nitrate checks until it holds under 8 ppm for three nights.' },
  ],
  readings: [
    // exhibit, temp °C, salinity ppt, nitrate ppm, note
    ['reef wall', 25.6, 35.1, 2, 'steady'],
    ['kelp forest', 14.2, 33.8, 4, 'steady'],
    ['mangrove lagoon', 26.1, 31.9, 6, '12 on Tue, after a water change 6'],
    ['jelly gallery', 15.8, 33.2, 3, 'steady'],
    ['seahorse nursery', 24.4, 34.6, 2, 'steady'],
    ['octopus den', 13.9, 33.9, 5, 'steady'],
    ['shark shallows', 23.8, 34.9, 7, 'steady'],
    ['touch pool', 16.3, 33.5, 6, 'steady'],
    ['eelgrass meadow', 15.1, 32.8, 3, 'steady'],
    ['rocky shore', 14.8, 33.4, 4, 'steady'],
    ['quarantine bay', 25.2, 34.8, 1, 'two clownfish, day 12'],
  ],
  checks: {
    covers_every_exhibit: 'All 11 exhibits have a section.',
    flags_cite_evidence: 'Each flag names its note, ledger line or reading.',
    photo_for_every_flag: 'The jelly gallery flag has one photo, not two: the second set never arrived.',
    no_diagnosis_claims: 'Observations only; the vet is named for the jellies.',
    actions_have_owners: 'Three actions, three owners.',
    readings_match_watch: 'Matches the chemistry watch for all seven nights.',
    quarantine_status_current: 'Day 12 of 30, as of Friday morning.',
    plain_language: 'Reads in under two minutes.',
  },
};

// ------------------------------------------------------------- the fleet
// The other organizations. The fleet atrium synthesizes their runs in-page
// from SHAPE_TEMPLATES (its own seeded generator); generate.mjs reproduces
// the run ids it will make so the radar and heatmap name the same runs.
export const FLEET = {
  paperwhale: {
    label: 'Paperwhale Design', domain: 'design studio', color: 0xc8664e,
    programs: {
      'proofread-pass': { shape: 'memo', label: 'Proofread pass', baseline: 88,
        about: 'Reads a draft case study for typos, em dashes and dead links before it ships.' },
      'contrast-audit': { shape: 'scanner-fan', label: 'Contrast audit', baseline: 84,
        about: 'Checks every page in light and dark mode for text and marks that disappear.' },
      'review-digest': { shape: 'tracker', label: 'Review digest', baseline: 90,
        about: 'Rolls the week\'s review comments into one list of what is still open.' },
    },
  },
  graywind: {
    label: 'Graywind Observatory', domain: 'public observatory', color: 0x4f6d9a,
    programs: {
      'seeing-forecast': { shape: 'monitor', label: 'Seeing forecast', baseline: 86,
        about: 'Reads the overnight weather models and calls tonight\'s seeing for the public telescope.' },
      'observing-plan': { shape: 'memo', label: 'Observing plan', baseline: 89,
        about: 'Drafts the evening\'s target list for the volunteer telescope operators.' },
      'mirror-log': { shape: 'tracker', label: 'Mirror log', baseline: 92,
        about: 'Tracks mirror cleaning and collimation against the maintenance plan.' },
    },
  },
  windfall: {
    label: 'Windfall Row Cidery', domain: 'cidery', color: 0x8f9a3e,
    programs: {
      'cellar-log': { shape: 'tracker', label: 'Cellar log', baseline: 87,
        about: 'Logs each tank\'s gravity and temperature and flags slow ferments.' },
      'harvest-window': { shape: 'scanner-fan', label: 'Harvest window', baseline: 81,
        about: 'Reads orchard notes and the forecast to call the next picking day for each block.' },
    },
  },
  ninefold: {
    label: 'Ninefold Press', domain: 'small press', color: 0xa45b78,
    programs: {
      'submissions-reader': { shape: 'scanner-fan', label: 'Submissions reader', baseline: 85,
        about: 'Reads the week\'s submissions and drafts a first-read note for each.' },
      'catalog-memo': { shape: 'memo', label: 'Catalog memo', baseline: 90,
        about: 'Drafts the season\'s catalog copy from the editors\' notes.' },
    },
  },
  openprose: {
    label: 'OpenProse', domain: 'platform', color: 0x26211d, provider: true,
    programs: {
      'fleet-eval-sweep': { shape: 'meta', label: 'Fleet eval sweep', baseline: 93,
        about: 'Samples recent runs across the fleet and re-scores them with the standard inspector.' },
    },
  },
};

// Step trees for the synthesized organizations, one per program shape.
export const SHAPES = {
  memo: [['input', 'brief'], ['input', 'sources'], ['agent', 'context-profiler'],
    ['par', 'scout-one', 'scout-two', 'scout-three'], ['agent', 'draft-compiler']],
  'scanner-fan': [['input', 'watchlist'], ['par', 'scan-a', 'scan-b', 'scan-c', 'scan-d'], ['agent', 'shortlist-compiler']],
  monitor: [['input', 'feed'], ['agent', 'reading-check'], ['agent', 'alert-compiler']],
  tracker: [['input', 'log'], ['input', 'plan'], ['par', 'log-reader', 'plan-reader'], ['agent', 'tracker-compiler']],
  meta: [['input', 'fleet_runs'], ['par', 'run-sampler', 'contract-check'], ['agent', 'sweep-compiler']],
};
// One flagged run per synthesized organization: the named step fails on
// that organization's last synthesized run (which belongs to its last program).
export const FAIL_BY_ORG = {
  paperwhale: 'plan-reader', graywind: 'log-reader', windfall: 'scan-b', ninefold: 'scout-two', openprose: 'contract-check',
};
export const SYNTH_START = '2026-06-25T15:00:00Z';

export const SHAPE_GLOSS = {
  'context-profiler': 'Reads the brief and the sources and decides what each scout should look for.',
  'scout-one': 'Reads the first source set.', 'scout-two': 'Reads the second source set.', 'scout-three': 'Reads the third source set.',
  'draft-compiler': 'Writes the draft from the scouts\' findings.',
  'scan-a': 'Scans the first quarter of the watchlist.', 'scan-b': 'Scans the second quarter.',
  'scan-c': 'Scans the third quarter.', 'scan-d': 'Scans the last quarter.',
  'shortlist-compiler': 'Writes the shortlist from the four scans.',
  'reading-check': 'Reads the feed and checks it against tonight\'s thresholds.',
  'alert-compiler': 'Writes the alert, or a one-line all clear.',
  'plan-reader': 'Reads the plan for what was due.',
  'tracker-compiler': 'Matches the log to the plan and writes the tracker entry.',
  'run-sampler': 'Picks a sample of recent runs across the fleet.',
  'contract-check': 'Re-reads each sampled run against its contract.',
  'sweep-compiler': 'Writes the sweep report.',
};
