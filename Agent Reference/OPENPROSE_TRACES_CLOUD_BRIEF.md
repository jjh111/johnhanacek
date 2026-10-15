# OpenProse traces case study: brief for a cloud agent (2026-10-15)

You are building `openprose-traces.html`, a second OpenProse case study on
John Hanacek's portfolio site. It shows how trace visualizations make agent
runs legible, using eleven live views that run on **synthetic** data. Read
this file, then `openprose-traces/HANDOFF.md`, then `CLAUDE.md`. Everything you
need is in this repo. Some tools this project uses live only on John's laptop;
the rules below say what that means for you.

## The hard rules

1. **Work on a branch, never on main.** Name it `traces-case-study`, push it,
   and stop there. Main deploys straight to the live site (GitHub Pages, no CI).
   John merges after two local checks you cannot run (rule 3).
2. **Write only about the invented world.** The views were designed on real
   customer runs, which stay private. The data here is invented: Saltlight
   Aquarium, its five programs, the fleet around it, the week of June 22 to 28,
   2026, and the hero run on Friday June 26. Its full description is in
   `openprose-traces/HANDOFF.md` ("The world"). Every number, name and event
   in your copy comes from there or from the data files. Invent nothing new: no
   other organizations, programs, people, dates or figures.
3. **The privacy firewall cannot run in the cloud.** It lives in a private
   repo on John's laptop. So:
   - never edit, add or regenerate anything under `openprose-traces/data/`,
     `viz/`, `lib/` or `posters/` (that kit was firewall-checked on 2026-10-15;
     to change data, write the request into your report instead);
   - before merging, John runs `node scripts/check-traces-cut.mjs` and the
     firewall over `openprose-traces.html` locally. Plan for that review.
4. **No real names from OpenProse's business.** The only people the page
   may name are John and Dan Barrett, OpenProse's CEO, and Dan only as the
   client on the first case study. Do not quote Dan. Paraphrase the product's
   principles without attributing them to a person or a run.
5. **House prose rules** (from `CLAUDE.md` and the résumé compiler's lint):
   one clause per sentence, no em dashes, no sentence built on what a thing is
   not ("rather than", "instead of", "not only", "without", "beyond"), fact
   then stop, name things instead of summarizing them, sentences of 25 words or
   fewer. John's register is casual, concrete and wry, never salesy. The views'
   own UI text keeps its em dashes; your copy around them has none.

## What the page is

- **Slug:** `openprose-traces.html` at the repo root, beside `openprose.html`
  and `nanome2.html`. It is a Design subpage.
- **Visual language:** the OpenProse language, the same as `openprose.html`.
  Link `styles/jh-chrome.css` (the site chrome) and `openprose/_tokens.css` +
  `openprose/_pairings.css`, and **not** `styles/shared.css`. Wear
  `<jh-nav current="design">`. Read `openprose.html` first and reuse its
  section grammar: `section.section > .inner`, `.section-kicker`, `h2` with
  one `<em>`, `p.lede`, `.cs-figure`, `.embed-live`, `.embed-bar`.
- **Hero:** μ Bloom, blank warm paper with the bloom shader and no photograph.
  `openprose.html` already carries a port of the shader in its closing
  `.cta-bloom` section (`<canvas class="bloom-canvas" id="bloom">`, CSS near
  line 692, script further down); reuse that code.
- **Working title:** *Making agent runs legible.*

## Outline

Each section names its view from HANDOFF's "Which view for which section".

| § | Beat | View(s) and poster(s) |
|---|---|---|
| Hero | the title over the bloom; one line saying every trace on the page is synthetic | none |
| I The problem | a run's whole shape is written to disk, and nobody can see it | a small anatomy diagram drawn in HTML/SVG: program, services, bindings, workspace (use the hero run's real file tree from `openprose-traces/data/synthetic/runs/20260626-143012-09b3c9/`) |
| II The reframe | the question a customer asks is "are my responsibilities handled?"; answer in one paragraph, then let people drill in | `run-story` |
| III Strata | one run as five time strata; the failed photo scout and its recovery | `run-strata` (+ `run-strata-tilted`), `strata-audio` for "hearing a run" |
| IV One run, four ways | the same run as synced views and as a delegation tree | `run-codex` (+ `run-codex-photo-scout`), `trace-trees-graph` |
| V Scaling up | one organization, then the fleet, in one visual language | `run-atrium`, `periscope`, `fleet-atrium`, `confidence-radar`, `fleet-heatmap` |
| VI A run as a document | the run read as a charted document | `syntax-charted` (+ `syntax-charted-memo`) |
| VII Conclusion | the views are disposable; the run record is what lasts | none; close on the bloom like `openprose.html` does |

Keep sections short. The views carry the page.

## Embeds (performance is a hard requirement)

- Five views are three.js scenes: `run-strata`, `run-codex`, `run-atrium`,
  `fleet-atrium`, `strata-audio`. Every embed shows its poster
  (`openprose-traces/posters/<view>.webp`, 1600 × 1000) first and goes live on
  tap or click.
- **One live view at a time on touch.** Waking a second one sleeps the first
  (remove its iframe, restore the poster). `openprose.html` crashed on phones
  once from stacked live embeds; see the commit "openprose: stop the mobile
  crash from stacked live embeds" (`git log --all --grep "mobile crash"`).
- Embed with `<iframe src="openprose-traces/viz/<view>.html">`; paths inside
  the kit are relative.
- Each `.embed-bar` names the view and links "open full view ↗" to the view
  page in a new tab, the same pattern as `openprose.html`.

## Deliverables on the branch

1. `openprose-traces.html`, working at 390, 768, 1440 and 1920 wide, in light
   and dark (`html[data-mode="dark"]`, the way `openprose.html` themes).
2. `openprose-traces/COPY.md`: the page's prose as plain Markdown, section by
   section, so John can edit it and the edits can be folded back. Same loop as
   the first case study.
3. **Do not** wire the page into the site yet (no sitemap, llms.txt, search
   chunks, playground item, nav, or link from `openprose.html`), and do not
   bump the site version. Those land after John's review; list them in your
   report instead:
   - `sitemap.xml` and `llms.txt` entries beside `openprose.html`;
   - search chunks in `Assets/search-chunks.json` with a `CHUNK_AUDIT.md`
     section, then `node scripts/build-chunk-vectors.mjs`;
   - a playground item in `scripts/playground-items.js`, `weight: 'heavy'`;
   - `openprose.html` line 1837, "The trace track is still confidential. This
     page is the brand and web-craft journey.", becomes a link to the new page;
   - version bump in `scripts/jh-chrome.js`, then `node scripts/sync-version.mjs`.

## Checks you can run in the cloud

```bash
npm install
npm run browsers
python3 -m http.server 1337 &
node scripts/check-traces-cut.mjs --no-firewall
BASE_URL=http://127.0.0.1:1337 PAGES=openprose-traces node "Agent Reference/maze-tests/contrasttest.mjs"
```

- `check-traces-cut.mjs --no-firewall` proves every view still has its data
  and renders. It must say PASS.
- Run the contrast gate on the new page. Add `openprose-traces` to its page
  list if it does not accept the page by name, and report what you changed.
- Load the page headless at the four widths in both themes and report three
  things: zero page errors, zero horizontal overflow, and at most one live
  iframe after tapping two posters at 390 wide.
- **Never run a bare `npx playwright install`** (CLAUDE.md explains why).
  Use `npm run browsers`.

## Open questions for John (use the default, list it in your report)

| Question | Default |
|---|---|
| May the page say, in one sentence, that the designs were developed on real customer runs that stay private? | yes, one sentence, no detail |
| Dan's words: paraphrase only, or quote him with his OK? | paraphrase, no attribution |
| The eval dimension names (RF runtime fidelity, TE task effectiveness, CS contract satisfaction, DS domain score) are fixed in the views' code. Are they right for public? | use them as they are |
| The film is not made yet. Ship without it? | yes; the hero is the bloom, not video |

## Report

End with: the branch name and last commit; screenshots at 390 and 1440 in
both themes; the gate outputs; anything in the kit that looked wrong (data,
labels, a view that misbehaves); the wiring checklist above; and the four
open questions with the defaults you used.
