# Inquiry Composer — plan

> Status: **P1 + P2 BUILT 2026-09-26 (v2.28), committed locally, not pushed.**
> John said "build this up" without picking; every decision below was taken as
> recommended, with two refinements noted in the build record at the end.

A visitor types a paragraph about what they need. The site parses it **on their
device** into a brief: who they are, which track, which offer, stage, timeline,
budget, contact. The card shows that parse. One confirm sends John the brief with
their own words underneath, in full.

---

## What already exists to build on

| Piece | Where | How the composer uses it |
|---|---|---|
| Intent grammar → gold intent cards (services / contact / schedule / hire) | `search-core.js` `QUERY_INTENTS`, `INTENT_CARDS` | The doorway already exists. The composer is the next card in that family |
| Scene language: grammar → **plan card** ("the parse, before anything runs") → confirm → receipts. Never bluffs | `search-core.js` `parseScene`, `renderPlanCard` | Same shape, different grammar: `parseInquiry` → brief card → Send → receipt |
| Semantic tier: MiniLM q8 on **WASM** | `search-core.js` `semanticEx` | Runs in Safari and on iOS, unlike the WebGPU model. This is what makes the parse universal |
| `track` on chunks (`coaching` / `design`) | `Assets/search-chunks.json` `_meta.fields` | Documented as "not yet read at runtime". The composer is its first consumer |
| Confirm chips, never auto-run | tool-use path in `search-core.js` | Same rule for Send |
| Tabs via `data-track` | `services.html` | A parsed track can switch the tab (`?track=`) |
| Session draft survival | residue sentence (sessionStorage) | The draft survives navigation within a visit |
| Offers with names | `services.html` | The offer catalog (below) is these, verbatim |

Contact today is `mailto:` links with per-track subjects plus one Google Calendar
link. There is no form and no backend.

## Constraints that shape it

- **Static site on GitHub Pages.** Nothing can send mail by itself. Delivery is
  decision 1.
- **The parse cannot need a model.** Safari cannot run the WebGPU tier and local
  models are rare. So the brief comes from grammar plus embeddings, both of which
  run everywhere. A model may garnish; it may never be required.
- **Instant, then smarter.** The grammar parse renders on the first pause in typing.
  The embedding pass upgrades the same card in place when MiniLM is ready.
- **One surface.** The brief is a card in the same results surface, edited inline.
  No modal, no second level.
- **Honest.** The parse is an index over the visitor's words, never a rewrite. Their
  paragraph is always sent verbatim. A field nobody stated reads "not stated".
- **Nothing leaves the browser until Send.** The byline says so.

## The brief — the core semantics

| Field | Source | Notes |
|---|---|---|
| **Their words** | verbatim | Always sent in full. The rest is an index over this |
| Email | grammar (address regex) | The only required field. Asked for inline when absent |
| Name | grammar ("I'm…", "my name is…", a sign-off line) | Optional |
| Org + role | grammar ("at Acme", "we're Acme", "I'm the CTO / founder / head of…") | Optional |
| Track | lexicon (P1), then embeddings vs track-tagged chunks (P2) | `coaching` · `design` · `hiring` · `unsure` |
| Offer match | embeddings vs the offer catalog (P2) | Top one or two, with a confidence dot |
| Domain | lexicon | AI-native · XR / spatial · robotics · web · other |
| Stage | lexicon | idea · prototype · shipped · scaling |
| Timeline | grammar | "asap", "next month", "Q1", "by March", "in 6 weeks" |
| Budget | grammar | Only a stated figure. Never inferred |
| Related work | embeddings vs chunks (P2) | 0–2 case studies their need resembles, e.g. molecules → Nanome |

**The offer catalog** is the ten names the services page already uses:

- Coaching: Audit · Guided Coaching · Build Sprint · Embedded Retainer
- Design: Workshop Facilitation · Website Design · MVP Design & Handoff · End-to-End
  Product Design · AI & Agentic Systems
- Hiring: Full-time role (grounded in chunk 49, "What John Is Looking For")

## Where it lives — one core, two shells

The existing rule holds: `search-core.js` owns behavior, shells pass an element
adapter.

- **Core:** `parseInquiry(text)` → brief, and `composeInquiry(brief)` →
  `{ subject, body }`, beside `parseScene`.
- **Shell A — the command bar**, every page. A detection gate decides:
  - ≥ ~20 words **and** first-person need signals ("we're building", "I need",
    "looking for", "help us", "our team", "could you") → the brief card leads the
    surface, gold like the intent cards, with the postcard below it.
  - Long input without those signals, e.g. a long question about John → search as
    today, plus one byline link: "Send this to John as a message →".
  - Short queries never trigger it.
- **Shell B — services.html `#book`.** A textarea, "Tell me what you're working
  on", with the same brief card rendering live under it.

**The card:** one row per parsed field, each tappable to correct (a picker for
track and offer, text for the rest), an inline email field when none was found,
then **Send to John** · **Copy message** · **Book a call**. Byline: "parsed on your
device — nothing is sent until you press Send". The card IS the preview of what
John receives.

## Delivery — decision 1

| Option | For | Against |
|---|---|---|
| **A. `mailto:`** with the composed subject and body | No infrastructure. No third party. The reply-to is the visitor's real address. Works well on phones | Needs a configured mail app, so webmail-only desktop visitors get nothing. No confirmation it was sent. Some Windows clients cap the URL near 2,000 characters |
| **B. Hosted form service** (Formspree, Web3Forms, Basin) | One click, a confirmation, spam filtering | A third party holds inquiry text. Contradicts the footer's no-cookies, nothing-stored posture. Free-tier caps |
| **C. Own Cloudflare Worker** → an email API | One click, John owns the data, rate limit plus Turnstile | New infrastructure outside GitHub Pages, one secret to manage, about half a day to set up |

**Recommendation: A in P1, C in P3 only if the numbers ask for it. Skip B.**
A always shows **Copy message** beside Send, which covers webmail users and the
URL-length cap: a long paragraph goes to the clipboard and the mail body says
"paste below". Measure with two GoatCounter events, `inquiry-composed` and
`inquiry-send-clicked`, which are counts only and carry no content.

## Where a model is allowed — decision 3

**Recommendation: no model text in what John receives.** Grammar and embeddings
build the brief, and the visitor's words are the content. LFM2.5 drifted on one of
three grounded answers when measured on 2026-09-01. An inquiry is the one place a
hallucinated field costs a client. The optional P4 lets an active model offer a
labeled one-line summary that the visitor can accept or delete.

## What John receives

```
Subject: [Inquiry · Design] MVP Design & Handoff — robotics teleop startup — Q1

From:      Dana Reyes <dana@example.com> · CTO, Example Robotics
Track:     Design → MVP Design & Handoff (strong), AI & Agentic Systems (weak)
Domain:    robotics · Stage: prototype · Timeline: Q1 · Budget: not stated
Related:   Nanome 2 case study

Their words:
> We're a six-person team building a teleoperation interface for warehouse
> robots. We have a working prototype but operators hate it…

— composed on johnhanacek.com/services.html · parsed on the visitor's device
```

## Phases

**P1 — the grammar brief and mailto (MVP)**
- `parseInquiry` L0: email, name, org / role, track by lexicon, domain, stage,
  timeline, budget. `composeInquiry`. The detection gate.
- The brief card in the bar, and the services textarea shell.
- Send via `mailto:`, Copy message, Book a call. Draft in sessionStorage, cleared
  on send.
- `search-tests/inquirylab.mjs`: about twenty fixture paragraphs with expected
  fields. Coaching founder, design startup, recruiter, vague, a pure question about
  John, very long, an SEO-agency pitch. Ratchet on field accuracy.
- **False-positive gate:** the existing intentlab and fusionlab query sets must not
  trigger the brief card. Zero tolerance.
- Exit: fixture target met, zero false positives, both shells, both themes pass
  `contrasttest.mjs`.

**P2 — the semantic upgrade**
- The offer catalog as authored entries (`kind: 'offer'`, with `track`) embedded by
  `build-chunk-vectors.mjs`, each with its CHUNK_AUDIT section.
- Sentence-level matching: each sentence of the paragraph finds its nearest offer
  and track. The card upgrades in place with confidence dots.
- Related work, 0–2 chunks.
- On services.html, a confident track switches the tab.

**P3 — one-click send (only if decision 1 says so)**
- The Worker, Turnstile, a rate limit, a real receipt. `mailto:` stays as the
  fallback.

**P4 — optional model garnish (only if decision 3 allows it)**

Rough effort: P1 one to two sessions, P2 one session, P3 half a day plus account
setup.

## Guardrails

- Never auto-send. Send is the only way out, and the card is the exact preview.
- The verbatim paragraph is always included in full.
- Never infer budget, identity or company. Unfilled reads "not stated".
- The message carries the page it was composed on. It never carries search
  history.
- Card and message copy follow the voice rules: fact, then stop.
- No new storage beyond the sessionStorage draft.

## Decisions for John

1. **Delivery:** A `mailto:` + Copy (recommended) · B form service · C own Worker
2. **Where:** command bar + services `#book` (recommended) · bar only · services only
3. **Model text in the message:** never (recommended) · labeled summary, visitor opts in
4. **Recruiters:** parse them into a hiring brief with role, company and location
   (recommended) · leave them to the existing resume card
5. **Required fields:** email only (recommended) · email and name

---

## Build record — 2026-09-26 (v2.28)

**Files.** `scripts/inquiry-core.js` (parse, detect, refine, compose, card render,
composer controller; runs under `vm` in node for the lab) · `scripts/search-core.js`
(loads inquiry-core beside itself from its own URL so `?v=` carries; brief mode
suppresses the doorway card, command cards, scene plans and generation; Enter
focuses Send; the embedder is now a serialized queue shared by search, commands
and the composer) · `scripts/search-overlay.css` (card styles, shared) ·
`services.html` (`#book` textarea + shell; draft in sessionStorage) ·
`scripts/sync-version.mjs` (inquiry-core in ASSETS) · tests below.

**Decisions as taken.** 1 `mailto:` + Copy · 2 bar and services · 3 no model text,
and generation is off in brief mode · 4 recruiters parse to a hiring brief with
position, location and company · 5 email only.

**Refinement to decision 5.** Email is a field, pre-filled when found, but it does
not gate Send: with the mail-app route the visitor's address arrives with the email
itself, so requiring it would be friction with no gain. It becomes required only if
P3 (a server send) is built.

**Deferred from P2.** A confident track does NOT switch the services tab: the tab
content sits above `#book`, so switching it moves the page under a visitor who is
typing. Offered as a later idea only.

**Calibration (MiniLM cosine, 13 fixtures, `inquirylab.mjs --scores`).** Every clear
inquiry's true offer scored 0.56–0.89; vague paragraphs topped out at 0.40–0.47 on
the wrong offer. So WEAK 0.47 (below it the card says "not sure yet"), STRONG 0.55.
Related work: Nanome scored 0.66 for a molecular-VR brief; unrelated case studies
0.47–0.52, so RELATED 0.55.

**Measured.**
- `inquirylab.mjs`: 62/62 fixture fields, 7/7 negatives, 0 of 72 search-test queries
  raise the card.
- `phase11-inquiry.mjs`: 30 checks, Chromium; the services shell again in WebKit,
  where the WASM embedder lands Guided Coaching the same as Chromium.
- Card text contrast, both themes: lowest 4.79:1 (light, the eyebrow label).
  `contrasttest.mjs`: 0 AA failures site-wide.
- Regression: search phases 1, 3–10 all pass. Phase 2 fails one check ("Awards in
  top 3" for a paraphrase) — it fails identically on a clean HEAD checkout, so it
  predates this work.

**Not built:** P3 (server send) and P4 (model summary), per decisions 1 and 3.

---

## Build record — 2026-09-28: P3, the relay (awaiting John's deploy)

John confirmed hi@johnhanacek.com forwards to Gmail, which made the Google Apps
Script route the pick: free, no new company holding the text, and mail sent by his
own account lands in his inbox. Measured context: DNS and mail are at Namecheap
(`eforward*` MX, no DMARC), which rules out Cloudflare's own sender (it needs
Cloudflare DNS).

**One switch.** `SITE.inquiryEndpoint` in `scripts/jh-chrome.js`. Empty (as
committed) = the mail-app route, unchanged. Set to the `/exec` URL = the relay.

**The relay** (`Agent Reference/inquiry-relay/Code.gs`, deploy steps in its README):
sends to the script owner's Gmail with the visitor as Reply-To. Not to hi@: Gmail
files a message you sent to yourself through a forward under Sent only, never Inbox.
Refuses a missing or malformed email, a paragraph under 20 or over 6,000 characters,
and a body that does not contain the paragraph. Silently drops the honeypot and
anything posted under 3 s. Limits 3 per address and 30 in total per hour, plus
Gmail's own 100 a day. No secrets in the file.

**The page.** Send becomes a button, disabled until the email is valid; the email row
is always shown ("so John can reply"). POST is `text/plain` so no CORS preflight is
needed. States: Sending… → "Sent. It is in John's inbox, and he will reply to X." or
a failure that names the reason and offers "Send it from your mail app" and Copy.
The page holds a fast Send until 3.2 s after the card appeared, because the relay's
silent bot drop would otherwise swallow a real person who restored a draft and sent
at once (found by the test: it clicked at 1.4 s). GoatCounter counts
`inquiry-sent` / `inquiry-send-failed` / `inquiry-send-fallback`.

**Measured.** `relaytest.mjs` 23/23 (the relay under node, Google stubbed).
`phase11-inquiry.mjs` section 6: 13 checks against a mock that answers the way a
deployed Apps Script does (302 → echo, CORS on both), all pass, plus the earlier
sections unchanged and the WebKit pass. Not provable here: Google's real redirect
and Gmail delivery. Step 7 of the relay README (the health-check URL) and one real
test inquiry after deploy settle that.

---

## Build record — 2026-09-28, later: coherence, triggers, layout (v2.31)

From John's live testing. Baseline first (`servicetest.mjs` on the real pipeline), then fixes:

- **"What John Is Looking For" led service queries.** Baseline: it led "hire john for a
  project", "work with john", "what does he offer", and sat second under "can he help my
  startup". Causes: the hiring intent fired on any "hire"; chunk 49's tags included
  `startups consulting coaching`. Fixes: a services-bound intent ahead of hiring ("hire
  him FOR …" unless it names full-time/role/job, "work with john", "what does he offer",
  "can he help"); chunk 49 tags narrowed to hiring terms and its vector rebuilt (only 49's
  vector changed). Now 13/13: every service seeker has an offer in its top 3 and none is
  led by 49; the two hiring questions still get 49.
- **Triggering.** Commands by name open the card (prompt state when empty); "Write John a
  message" on every doorway card; `ASK` phrases ("hire him", "work with you", "consult
  on…") raise the card at 8+ words and a link below that; third-person questions about
  John never do. Lab: 71/71 fields, 8 commands, 12 negatives, 0 of 71 other queries.
- **Parsing.** "hire him for consulting on how to use agentic AI" read as design; it is
  coaching (the visitor wants to learn to use it): coaching words gain "how to use …" and
  "consult…", and Guided Coaching / Audit / End-to-End gained exemplars. Scores now
  0.83 Guided Coaching for that sentence; "help with the onboarding design" of an app lands
  End-to-End (it matched nothing before).
- **Around a card** the results are re-queried from the brief's track + offer; the coaching
  brief now leads with 17, 16 (and no 49), the design brief with 41.
- **Layout.** The card is a size container: under 440px its labels stack and each picker
  gets a full line, the arrow, offer and mark kept together. The tier strip's labels had
  gone gold uppercase on services.html because that page had its own `.tier-label` class;
  renamed `.fit-label`. CSS `content:` values are ASCII-escaped (a charset-less local
  server rendered `·` as `Â·`).
