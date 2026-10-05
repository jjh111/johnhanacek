# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Portfolio website for John Hanacek showcasing work at the intersection of **Creativity, Curiosity, AI & Human Augmentation**.

**Site Structure:**
Each page is a standalone HTML document with embedded CSS and JavaScript. All pages share `styles/shared.css` (design system), the `<jh-nav>`/`<jh-footer>` chrome components (`scripts/jh-chrome.js`), and Google Fonts (Raleway, JetBrains Mono).

**Roadmap:** `Agent Reference/V2_RELEASE_PLAN.md` is the single source of truth for what's planned and decided. v1.7 "Foundation" ✅ → v1.8 "Unified Canvas Engine" ✅ → v1.9 "Fish Maze" ✅ → **v2.0 "Release" ✅ (tagged 2026-08-30)** — Search Enrichment became the full command-bar product (see `Agent Reference/SEARCH_COMMAND_BAR.md`), plus the QA/polish/de-boxing close-out. Next cycle: the bar as the site's interface (resource register, site-wide jumps, chunks-as-content compiler — planned in SEARCH_COMMAND_BAR.md discussions).

## Sitemap

### Public pages (in sitemap.xml, canonical to https://www.johnhanacek.com)

| Page | Shape | Role |
|------|-------|------|
| `index.html` | Triangle | Homepage — fish minigame hero canvas, portfolio intro |
| `design.html` | Rounded Square | Design — Fish Maze: blueprint drawing canvas + living fish (v1.9 flagship; original demo preserved in Archive) |
| `art.html` | Circle | Art — cosmic canvas, writing/worldbuilding, Earth Star, Influence |
| `about.html` | Diamond | About — bio, experience, education, expertise, awards |
| `services.html` | Star | Services — AI coaching (JH Coaching OS), Claude Code coaching, founding designer |
| `nanome2.html` | — | Nanome 2 Redesign case study (subpage of Design) |
| `openprose.html` | — | OpenProse founding-design case study (subpage of Design). Brings its own design language (IBM Plex + Kecal, warm paper) and loads `styles/jh-chrome.css` **instead of** `shared.css` — see below |
| `playground.html` | Hexagon | Playground — a Review Canvas of the whole site: every page and every demo, live, in canvas/grid/focus modes |
| `writing.html` | — | Writing index/reader — fetches and renders the `writing/*.md` essays (EduOS + MetaMedium sets); linked from art.html |
| `search.html` | 🔍 | AI-powered search (3-tier: BM25 / WebGPU / local LLM) |

`404.html` — custom 404 with fish canvas overlay (noindex, has JSON-LD).

### Unlisted pages & internal experiments (registry — do not add to sitemap/nav)

These are intentional. All carry `<meta name="robots" content="noindex, nofollow">` unless noted. Never add `Disallow:` lines for them to robots.txt (that would publish the paths); obscurity = unlisted + noindex.

| File | Status |
|------|--------|
| `onagents.html` | Finished ~37k-word essay "The Problems of Agent Orchestration". Still `noindex`, but now **linked from playground.html** — the canvas was its release vehicle, so it is discoverable by humans while staying out of search. |
| `tidepool.html` | Internal experiment — bioluminescent tidepool canvas visualizing an AI-agent ecosystem. Now listed on playground.html (still `noindex`). |
| `beach-beers.html` | Internal experiment — whimsical animated SVG scene. Now listed on playground.html (still `noindex`). |
| `fish-demo/` | Standalone extraction of the fish minigame (`index.html` + `fish.js`). Testbed / seed for the v1.8 `scripts/fish-engine.js` extraction. |
| `Assets/JH-brand-styleguide.html` | Internal brand/design-token reference ("Deep Sea Terminal" styleguide v1.0). |
| `Assets/DemosPlayground/test-llm.html`, `test-vision.html` | LLM/VLM proof-of-concept pages (Qwen 0.8B WebGPU + LMStudio/Ollama). |
| `Assets/DemosPlayground/pretext-wrap-test.html` | Test rig for `scripts/pretext-wrap.js` — circle and ellipse obstacles with prose flowing both sides. |
| `Assets/media-kit.html` | Render rig for the social media pack — 13 boards in the site's tokens (7 endorsements, clients, services ×2, outcomes, awards, offer). **The copy lives in `Assets/media-kit.json`** — edit that file, never board markup; the rig only draws. `node scripts/render-media-kit.mjs` screenshots each at 2x into `Assets/media-kit/` (square / portrait / wide; `--light`, `--only=`, `--video` for 12 s MP4s). Both rigs serve the repo via `scripts/serve-verified.mjs` (port-probe + sentinel proof — the 2026-09-10 404-resume incident). |
| `Assets/sizzle-reel.html` | 70 s portfolio sizzle reel (1920×1080), the media kit's moving sibling. **The edit lives in `media-kit.json` → `reel`** (scenes, copy, clip in-points, seconds on a 96 BPM grid) under the boards' evidence rule; the rig only knows how things move. One grammar: a single outline, the "actor", unfolds out of each chapter's nav mark (jh-shapes.js) into the window onto the work and folds into the next chapter's mark; one tank of the real fish engine runs underneath, and the opening loop IS the fish that swims the reel. Plays live in a browser (space, ←/→, `?t=`); `node scripts/render-sizzle-reel.mjs` renders it frame-exact on a virtual clock (`?render=1`: Date.now/rAF owned by the renderer, engine ticked at 60 Hz, every clip seeked) into `Assets/media-kit/video/sizzle-reel.mp4` — `--fps=30`, `--from=/--to=` to cut one scene, `--stills=` for PNGs. Chromium can't decode H.264, so clips are served as VP9 transcodes cached in `.local/sizzle-cache/`, **answered with byte ranges**: a media element only seeks a file it can range-request, and served whole (as `python3 -m http.server` serves everything) every seek snaps back to 0. Until 2026-09-26 both cuts filmed each clip as its first frame for exactly that reason. |
| `Assets/sizzle-reel-2.html` | Cut 2 of the reel, on a 120 BPM grid: it runs as long as its script says (60 s as cut, 63.5 s since John's first edits in the hosted editor, 2026-09-29). Cut 1 stays as it was. **The edit lives in `Assets/sizzle-reel-2.script.txt`**, a plain-text script: one line per line on screen, `SCENE <kind> <seconds>`, `ITEM`, and `@<seconds>` beats counted from their scene, so a change of length ripples. `scripts/reel-script.js` reads it (the rig loads it as a classic script, the renderer requires it) and checks it: `node scripts/reel-script.js check` prints the cue sheet and the total and names any mistake by line; `fmt` refreshes the [bracketed] timecodes. Live, the rig is the script's preview, and an edit plays in place: the film is built again inside the running page (`REEL_LIVE.apply`, about 20-30 ms), the playhead, the clips and the fish carry on, and nothing reloads (a reload by hand comes back to the same moment, `#t=`); `[`/`]` jump a scene, `L` loops one. The boards it borrows (clients, offer) stay in `media-kit.json`. **It edits like a timeline:** `node scripts/reel-dev.mjs` serves the repo (byte ranges, text no-store, media revalidated by ETag) and saves scripts (`POST /__reel/save`: parsed first, backed up in `.local/reel-backups/`); in the preview, **every key is also a button**: the HUD's transport (play, ±5 s, scene back and forward, loop, restart) and its tools, which each add their own button through `REEL_LIVE.addTool` (the key named in the tooltip). Every button is an icon and a label (`scripts/reel-ui.js`), and every bar folds by one measured rule, `REEL_UI.fit`: while anything overflows, key hints go, then labels (kept in the tooltip), then what can hide (the HUD's seek buttons move into a More menu); the timeline's inspector opens over the whole panel under 760 px, and the synth rack lies over the preview in a window under 1080 px. **Timeline** (E) opens `scripts/reel-timeline.js`: every scene is a card holding what belongs to it, its works (the results scene's ITEMs, named by their eyebrows: Nanome, BadVR, OpenProse), its moments (every @ time: pictures, clips, quotes, and the stats' and awards' @, which `setAt` now rewrites too) and its hatched `cue out`; each track is named by an icon in a 34 px column, so the lanes take the panel's whole width (248 px tall). A scroll of yours stays put while it plays, until the playhead jumps, play starts again, or it comes back into view. **The music has its own timeline under it** (2026-10-02; John: "think ableton mixed with easy pad"), on the same clock as the scenes: a ruler of bars and beats (its time signature and tempo, `4/4 · 120`, at its left), the chords on the bars, and a gold marker and a faint dashed line at every scene's cut, so the picture stays in view; open (the chevron in the icon column), a lane per part (drums, bass, chords, arp, lead, fx) holding the part's **clips**, each a box with its pad's name over what it plays (the drums as a drum grid, kick at the foot; pitched parts at their pitches; a riser's wedge; fades shaded under a line). **Drag a clip** to move it (on the grid: a bar zoomed out, a beat in, a sixteenth closer; Shift the bar, Alt free), its **edges** to start and end it, its **top corners** to fade it in and out, **up or down** for its level; an edge near a scene's cut is drawn to it. **Double-click** a lane for a new clip of the part's chosen pad (up to four bars, to the next clip). **Click** a clip for its inspector (its bars as typed positions, its part's pads as tiles with ▶ to hear one, a level slider, fades in beats, Play from here, Duplicate, Delete; ⌫ and ⌘D too); click a lane's name for its pads alone, to hear them and choose the one a new clip gets. Then **one lane of cues** for the sound effects, read from the edit: each question while it stands on the bar (its words), a tick a key typed, its Enter, the select-all that clears it, and a dot for each pop on an @ moment (its tooltip names the moment); click a question or a dot to play from just before it. M and S beside each lane mute and solo for listening (not saved; a part's for all its sounds, the cues' for every sound effect). Each change is one line of the score, through the rack (`REEL_RACK.change`), which keeps it. **One Undo**: the timeline's Undo and ⌘Z take back the last edit, a line of the script or of the score (`REEL_LIVE.journal`, which every tool notes its edits in). A window too short for it all keeps the preview 200 px and lets the lanes scroll under a ruler that stays. Suite: `reel-tests/musiclanestest.mjs`. Drag a card's or work's edge, a moment or the out handle, click anything for an inspector of its lines (the line lit), and zoom with − fit + (or ⌘/Ctrl + wheel, a pinch, `- = 0`); Undo and Redo are buttons. **Media picker:** an `img` or `video` line in the inspector is a chip (thumbnail, name, Change…) that opens `scripts/reel-picker.js`, every picture or clip in `Assets/` (top level, `grad/`, `blokdok/`, `posters/`, `openprose-approaches/`: `scripts/reel-media.mjs`) as thumbnails, searchable, clips playing on hover; a pick is one `setField`, and a clip shorter than the slot's `from` starts at 0. The dev server serves the catalogue (`/__reel/media`) and thumbnails (`/__reel/thumb/<key>.webp`, cached in `.local/reel-media/`); the claude.ai build carries them and every file, so a pick plays at once. **Export** (X, `scripts/reel-export.js`) makes the video: on the dev server it renders right there (`POST /__reel/render` runs the renderer per format, `GET` reports frames and seconds left, films linked when done); on claude.ai it sends Claude a render request as a comment (`comments.sendToClaude`), and Claude renders the saved edit, uploads the films to the page's assets and records them in `films/latest`, which the panel lists, each to Play in the panel and Download through claude.ai's save dialog (inside its sandboxed frame a link neither opens nor downloads; every download in the editor says what came of it). Every change is one line through `ReelScript.setDur/setAt/setField/setCue`, then `REEL_LIVE.save`, which plays it at once, in place, and keeps it in the background (the file through the dev server, else the page's host, else a draft in the tab with Download and Discard; `settled()` resolves when it is kept, and Export waits on it). Every panel redraws through `REEL_LIVE.onChange`, keeping its place (the timeline's zoom and inspector, the Fish panel's selected line). Live, the tank is never regrown: a spawn remembers what it put in (`made`), so a step back (a scrub, a seek, an edit that moves a birth past the playhead) takes out only what was born after it and every fish there swims on (`FishCanvas.remove`), and food, darts and scatters happen only when the clock plays through them (until 2026-10-01 every scrub back regrew the tank and dropped the food again: the repeating "pop"). The sound keeps the same rule: the live player starts again at once after one jump, but a second jump within 0.2 s is a scrub and it waits, silent, for the reel to play on smoothly (it had restarted at every step, and the score's `pop` on a beat went off over and over); the ruler holds the reel still while you scrub it and plays on when you let go. An event new and due (food written at the playhead) happens at once. A save from another editor plays here in place too. Suite: `reel-tests/applytest.mjs` (the in-place frame equals a fresh load's, to the pixel). **Words change where they stand:** paused, a line on the stage shows a dashed outline under the pointer; double-click it and type (Enter or a click away keeps it, Esc puts it back, ⌘Z undoes it like any edit). `scripts/reel-text.js` writes the one line through `setField` (the part written back in the script's own words, `ReelScript.writeValue`); the rig tags each line it draws from the script, live only (`data-ln`, `data-part`), so a render is untouched. Suite: `reel-tests/texttest.mjs`. **Transitions** (2026-10-02; John: "the transitions take a long time give me some flexibility"): a scene takes `cue in` (seconds from its question's Enter to the arrival), `cue arrive` (how long the arrival takes: every motion, stagger and step of it scales against the rig's own 0.6 s), `cue out` (seconds before the cut that its content starts to leave), `cue leave` (how long that takes, against 0.3 s), `cue ease own|expo|cubic|sine|back|linear` (`own` keeps each motion's own curve) and `cue typing` (characters a second). A `cue` line above the first SCENE sets one for every scene (`ReelScript.setReelCue`; a scene's own wins; `ReelScript.cue(sc, name, edit)`). The rig hands each scene a motion (`motionOf`, `MO` while it paints) that the type helpers and every builder read; with no cues it changes no number: every element's inline style, at 63 moments of the cut in all three frames, is what the rig drew before (`ordertest.mjs` plays the cues). **The scenes are interchangeable:** each scene wears one thing (the opening nothing, the title the hero oval, the end card its oval, every scene that asks the bar) and the glass morphs between whatever scenes are next to each other, so the oval-to-bar-to-oval narrative, the fish's data chip and the opening's camera work in any order (`ReelScript.moveScene`, `duplicateScene`, `removeScene` move a scene's whole block, notes above it included). **S** opens `scripts/reel-shots.js`, the **shot list**: a row per shot (its first picture or its words, what it says, its length, its transitions as chips: gold its own, cyan every shot's), the one under the playhead marked; click one to go there and open it (its length; when it arrives and how long it takes, when it leaves and how long that takes, its curve and typing; Play here, Earlier, Later, Duplicate, Delete); drag a row to move the shot (Alt+↑/↓ too); "Every shot" sets the reel-wide cues. One save each, on the timeline's Undo; the music stays on its bars. Suites: `reel-tests/shotstest.mjs`, `ordertest.mjs`. **Determinism rule:** anything that touches the tank runs in `EVENTS` or `TICKS` (after every engine tick), never in a scene's paint function, because stills, parts and parallel chunks paint only some frames. The renderer takes `--script=Assets/x.script.txt` (a new cut is a new script), `--scene=`, `--jobs=N` (chunks start at scene cuts and join without re-encoding; about 1.2-1.4× on 4 cores) and `--deliver` (a web copy under 14 MB, a poster, `chapters.json`). **It has a score:** a script's music is the `.score.txt` with its name (`Assets/sizzle-reel-2.score.txt`), set up the way a music program is (2026-10-02; before, one SECTION per scene said what played, and there was nothing to drag): **sounds**, SYNTH and DRUM blocks built from numbers (like-every-cloud's SynthVoice patch vocabulary: osc/noise voices, filter, ADSR, one LFO; drums are small equations); **parts**, PART blocks, each with its **pads**, the patterns its clips can play (`pad beat kick X...x...X...x...  clap ....x.......x...  hat ..x...x...x...x.`: sixteen steps a bar per sound, or a tune, `pad hook C5 . . . | …`; `len` caps a note, `once` plays from its clip's start); and **clips**, `CLIP drums 5-8 beat 0.8 in 2 out 2`: a part plays one pad over bars written as positions (`5`, `5-8`, `4.4-6`, `9.3`, `5.2.3`; each end at its precision, both included), at a level, fading in and out in beats. `TIME 4/4` and `TEMPO 120` set the bars; `CHORDS F C G Am` goes round from bar 1, one a bar (`Am:2` holds two), and `CHORDS 30-32 Am` gives bars their own. A clip is a window onto its pad, which goes round on the bars: move or stretch it and it plays what the music plays there, in time with the chords. A part's clips set its sounds' level (`A.levels`, automated in the synth, so notes ring on through a fade); a note lasts until its pad's next, `len` at most; a chord carried on is held, not struck again. The parts: drums (kick, clap, hat), bass, chords, arp, lead, fx (a riser and a crash), all synth; John's edits in the hosted editor (arp and kick in the art, a riser into the offer, a longer bass, more reverb on the arp) are in the arrangement. **One song** (2026-10-05; John: "the score skips and jumps and changes concepts ... strip the song itself down and keep it coherent throughout"): three clips, the chords from the first frame, the bass from the title, one soft groove (kick and hats) from the first question to the end card, where it fades and the chords and bass ring out; nothing enters or leaves in between, and the sound effects carry the cuts (the arrangement before it put each scene's music between its cuts, with rolls, risers and crashes on them: 2026-10-03). The other pads stay in their parts, for the rack and the timeline. The music suites play the old arrangement as a fixture (`reel-tests/fixtures/sizzle-reel-2.score.txt`), so a re-arrangement of the real score never breaks them. `SECTION`, `into`, `sweep` and steps or notes on a sound are gone, and say so by line. Sound effects play off the edit itself (`on key|enter|clear|cut|item|beat`, the keys at `ReelScript.queries`' times, which the rig types from too). No samples, and nothing to license. `scripts/reel-music.js` reads, checks (`check` prints the arrangement) and edits it one line at a time; `scripts/reel-synth.js` plays it through Web Audio, live and offline; **M** opens `scripts/reel-rack.js`, the synth rack: each part's pads as tiles (a picture of each, ▶ to hear it on its own; the one chosen opens a step grid per sound, or its tune to type), then every sound and effect drawn with knobs and meters, each control one line of the score, heard at once and saved through the dev server (no reload); a saved score in the older format plays the file instead and says so. The renderer mixes the soundtrack offline, writes `<name>-music.wav`, muxes it in as AAC (`--audio-only`, `--mute`), and logs peak and LUFS. **It is also hosted:** `scripts/build-reel-editor.mjs` builds the same preview, timeline and rack as one claude.ai artifact whose saves go to the page's own store (`window.REEL_HOST`, `scripts/reel-host-claude.js`); the rig, timeline and rack save to the dev server first, then a host, then a draft in the tab. Suites: `Agent Reference/reel-tests/`. Plan and contracts: `Agent Reference/REEL_PIPELINE.md`. Its spine is the thesis *freehand expression meets structured data*: the drawn opening loop becomes a fish that carries a live data chip (size, heading, speed read off the engine), "who is john?" answers with the thesis beside John's portrait in the About page's oval (the answer's `img`: a 2:3 picture rounded by half, its ring drawn round it as it opens; right of the copy in wide, beside the headline in square, above the copy in vertical), and "add 4 medium fish and 2 coral" types a school into being. The site's own command bar narrates (no ⌘K, and the tiers under it are marks, not method names: keyword lines for BM25, a constellation for MiniLM, a spark for a model, the drawn loop for scene language, the Services star for intent; `tierKind` reads a tier's name, which stays its label): the hero oval collapses into the bar, each section is a question typed over the last one's selection, and the last answer opens the bar back into the oval (in the cut's own order; in any other, the glass morphs between whatever each scene wears). No email on screen (offer and end card point at the site). The tank is a band along the bottom (the canvas runs from mid-frame so the engine's 100/180 px edge zones don't fill it). Nothing hides a fish: the mask that faded the canvas's top is gone (2026-09-29), and the live preview keeps the HUD's strip off the picture. **The school swims under the copy** (2026-10-05): the engine's `surface` hook puts the top of its water at the foot of the copy band (`F.surface` per format; stage 710 in wide), so it turns back there as it would at the tank's top. The canvas starts at mid-frame, and before this the school swam up into the answer's figures, the awards, the art's captions and the quotes' names: 16.75 s of the cut with a school fish over a line of copy, 0.5 s after (and that behind a window). The big fish keeps the whole tank, and so does a school a `fish … school to` line sends somewhere. **The fish take direction:** `fish @<s> big|school|all <what>` lines in a scene (`to x y|auto`, `look x y|auto|off`, `idle hover|sweep|circle|wander|auto`, `pace`, `auto` (all of it back to the reel's own), and once `dart`, `turn`, `scatter`, `regroup`, `feed x y`; points are fractions of the frame) drive a director in the rig through the same hooks. **A line belongs to its scene:** `to`, `look`, `idle` and `pace` hold from their time until the next line of their kind for that fish or its `auto`, and no further than their scene's end, so a scene plays the same wherever it is put; a line that ends in `carry` runs on past the cut until changed (`ReelScript.fishHolds`, which the rig, the panel, the timeline and the cue sheet all read; `by`: line, cut or reel). Where no line holds, the fish swim exactly as before (0 px). (2026-10-02, twice: John's "locked to the section i have to keep re-creating them" made lines hold across cuts by default; his next note, that anchoring them to their sections makes the sections modular, put the default back and made the carry explicit.) **F** opens `scripts/reel-fish.js`, the Fish panel: the selected line's editor (when, who, what, its point: typed or picked on the stage, how long it holds, Carry on, Stop here), then At the playhead (what the chosen fish does now, lit; press another to change it from there to the scene's end; Reel's own, key A; playing, a take kept on pause), then the lines: those carried in from earlier scenes (their spots on the stage too), then the scene's own, each with where it stops. It shares the preview's left side with the shot list, one at a time. One selected line lights its row, its numbered mark on the stage and its mark in the timeline together. The timeline has a **fish lane** per fish (the rig's `REEL_LIVE.fish.track`): spans naming what it looks at (each scene's attention has a name) and how it idles, cyan for the reel's own, gold where a line decides, a mark per line to drag anywhere in the cut (across a cut it moves into that scene, `ReelScript.moveFish`) or click, and where the gold stops at a cut or the reel's end a handle like a clip's: back writes a `<who> auto` where it lands, on past the cut carries the lines that stopped there (`carry`, to an auto where it lands). A dotted line on the stage shows, live, what the chosen fish is looking at. Suites: `reel-tests/fishdirecttest.mjs`, `fishpaneltest.mjs`. **The fish look at what matters:** each scene registers `look(t0, t1, x, y)`; the big fish swims to a spot left of it and tilts its nose up at it, the school sweeps under it to the right, through the engine's opt-in host hooks (`steer`, `schoolTarget`, `calmSchool`, `largeRightOfWay` — see fish-engine.js header; inert on every other page). The big fish has right of way: smaller fish part around it and dart off when it comes close, and never shove it off its line. Copy inside the title and end ovals is fitted to the curve (`fitInOval` moves the block until every line's ends clear the ellipse), not centred on its box, which had set taglines on the oval's lower rim. The coral is two wide beds along the floor, drawn as rectangles (`JHStrokes.points.rect`). **The hosted editor is WYSIWYG:** it draws the renderer's frame to the pixel (0 px across 174 text boxes at 13 moments, `REEL_PIPELINE.md`). Motion grammar: lines slide up out of their own clip; the work pushes in from the right inside one window; counters roll like an odometer. Layout is one grid: the bar, its tier chips and pager, every window, panel and card sit on the 96 px margins, and copy centres on the content band's middle (y 457). A video beat plays from `from`; `loop: true` repeats a short clip (the AROC HUD); live mode loads clips as blobs so they seek on any server. **More pictures per beat** (2026-10-05; John: "bring in more videos/frames per beat"): a beat that carries only a picture keeps the words before it (the AvatarMEDIC caption too), so a window cuts on the music's grid without new copy: Nanome's atom building and its hand-off into the headset, BadVR's hand-tracked data and its boards close, eight OpenProse approaches (screenshots of `openprose/canvas-display/brand/`, in `Assets/openprose-approaches/`) flipping a sixteenth each onto the homepage they came to, HoloTRIAGE's "Keep Going!" and AED, the Clinic wide, and Influence's screen through its shapes. A beat's picture dissolves in over the last; `cut` brings it in at once on its time. A picture-only beat is silent: the score's `pop on beat` sounds only on beats that bring words, so the pops stayed 8. A render gives each clip its file only around its own layer (`REEL.frame`): eleven clip slots decoding at once in three parallel pages took the browser down. John's clips live on YouTube, which this environment's network policy refuses (www.youtube.com, googlevideo.com), so every frame here is local. `node scripts/render-sizzle-reel.mjs --cut=2` renders it (same flags as cut 1) into `Assets/media-kit/video/sizzle-reel-2.mp4`. **`?format=square|vertical`** plays the same script in a 1080×1080 or 1080×1920 frame, re-laid out from one `FORMATS` table in the rig (square keeps the wide split, narrower; vertical stacks it, the tank the bottom third; copy in `#stage.narrow` never under 27 px); `--format=` on the renderer suffixes every output (`sizzle-reel-2-square.mp4`), and wide films as before (its stills byte-identical or within decode noise, `reel-tests/formattest.mjs`). |

**Never commit business/personal documents (invoices, contracts) to this repo — it is public and served.** Resumes in `Assets/` are intentionally public.

## Navigation System

Rendered by the `<jh-nav current="home|design|art|about|services|search">` component from `scripts/jh-chrome.js` — edit the nav in that one file, not per-page:

```
[🔍 Search] [Triangle/Home] [Square/Design] [Circle/Art]   "John Hanacek"   [Diamond/About] [Star/Services] [Hexagon/Play]
```

- Search icon leftmost, then primary shapes: Home, Design, Art
- Center: "John Hanacek" text link → index.html
- Secondary shapes (right): About, Services, Play
- `current` attribute sets `class="active"` + `aria-current="page"`
- Each page keeps its own `.nav-toggle` + `.nav-right` (per-page section TOC)
- **Two states, one measured boundary** (`initNavFit` in jh-chrome.js): DESKTOP (shapes + title + full-word TOC row) until the row stops fitting — per page, ~1020px (art) to ~1340px (design), with index ~1220 and about/services ~1140 (v2.08 measurements: the +10% type moved every fold point, which is exactly what a measured boundary is for) — then MENU (`.nav-menu` on `#nav`): title gone, TOC in the hamburger dropdown with full words, shape strip wearing its labels at one fluid size with a **9px floor** (v2.18 — the old 0.31rem floor rendered 5.8px labels on a 390 phone; items are width:auto so SERVICES takes the room it needs, measured to fit from 360px up), **glyph-only below 360px** (seven legible words plus the chrome need ~345px), in 44px-tall targets. On TOUCH the hero shape-nav pill wears the same grammar — labels on by default, a 22px glyph inside the folded bar's own 16–26px band, 44×44 targets — instead of the bare 20px glyphs it used to show while the bar an inch above it showed the same marks with words. No abbreviation tier (the old auto 2-char codes collided: about.html rendered EX twice) and no viewport breakpoints for the swap; hysteresis prevents boundary flicker (regression suite: `Agent Reference/maze-tests/navfittest.mjs`). Pages without a `.nav-right` get `.nav-no-toc` (toggle hidden)
- Nav is fixed, appears after scrolling past hero section. Its side padding is `--nav-pad` = max(page padding, (100vw − 1500px) / 3.2): 40px at every width where a page can fold (so no fold point moves), then ~130px at 1920, ~330px at 2560, ~600px at 3440, so on a wide screen the bar's ends sit about halfway between the screen edge and the content edge instead of 600px away (v2.26). The menu-state strip arithmetic reads the same token
- `writing.html` wears the chrome too now (integrated 2026-08; keeps its own reader header/toggle, shares `jh-theme`)

**Shape SVGs:** single-sourced in `scripts/jh-shapes.js` (triangle, rounded-square, circle, diamond, star, hexagon, search magnifier) — consumed by both `<jh-nav>` and the hero shape-nav strips via `data-jh-hero-nav` placeholders; nav-link metadata lives there too.

## Design System — "Deep Sea Terminal"

**Color Palette (`:root` in `styles/jh-chrome.css` — NOT shared.css):**
- `--sea-deep`: #020a12 (page background) · `--sea-mid`: #051018
- `--cyan`: #b2e8fa (headings, accents) · `--cyan-dim`: #4dc9f6 (borders/glows only)
- `--gold`: #d4af37 (hover accent, highlights)
- `--text-primary`: #b0cedc (body) · `--text-bright`: #eaf5fa · `--text-heading`: #b2e8fa
- `--muted`: #95aebb (dimmed text) · `--border`: rgba(var(--cyan-dim-rgb), 0.2)
- `--ink-quiet`: #a5d5e6 · `--ink-faint`: #86bccf — see the alpha rule below

**v2.08 ink brightness.** Every dark-mode TEXT token is its v2.07 value at **+15% HSL
lightness** (hue and saturation held; capped at 97% — this palette has no pure white).
`--cyan` is in that set because 14 of its 25 uses are `color:`, and `--cyan-rgb` with it
because that triplet is almost entirely dimmed cyan text. `--cyan-dim` is NOT — it is
never a text color, only borders and glows, so decoration weight is unchanged.

**Two rules that keep the palette one palette:**
1. **A page may ALIAS tokens; it must never RESTATE values.** `playground.html` is the
   model (`--paper: var(--sea-deep)`); `writing.html` was the counter-example and is now
   aliases only. A restated hex is a frozen copy that drifts silently — and worse, a
   page's own `[data-theme="light"]` block (0,1,0) LOSES to jh-chrome's
   `:root[data-theme="light"]` (0,2,0), so a hand-rolled light theme half-applies. That
   is exactly what writing.html shipped: the site's cool ground with its own warm gold.
2. **Never dim text with alpha.** `rgba(var(--cyan-rgb), 0.35)` reads as "quiet" but buys
   it with contrast, and **alpha cannot be fixed by a theme** — the same 0.35 that is too
   faint on black is too faint on paper. The canvas chrome failed AA in BOTH themes this
   way (2.6–4.3:1 dark, 1.7–2.3:1 light). Use `--ink-quiet` / `--ink-faint`, which carry
   a real per-theme value. Alpha on *borders, fills and glows* is fine.

**Theme flips must not straddle a transition.** An element with a `transition` on `color`
does not re-resolve a `var()`-derived color when `data-theme` flips — it keeps the old
theme's computed value indefinitely. jh-chrome.js adds `.jh-theme-switching` around the
attribute swap (dropped two frames later) and that class kills transitions. Loading into
a theme was always fine; only the live toggle broke, which is why it went unnoticed —
`contrasttest.mjs` now tests both paths for exactly this reason.

**Typography:**
- Headings: 'Raleway' (thin weights 200-600)
- Subheadings/Labels: 'Raleway'
- Body/Code: 'JetBrains Mono' (monospace, primary body font)
- **ONE scale, ten steps** (`--text-4xs` … `--text-3xl` in jh-chrome.css) and **one
  multiplier**, `--type-scale`. Every font-size on the site is a step — there is no
  such thing as a literal `font-size: 0.62rem` any more (v2.08 folded 45 distinct
  literals across ~160 declarations onto the ladder; 25 of them lived in the
  0.4–0.95rem band where no two neighbours were tellable apart, which is what read
  to visitors as "lots of fonts"). Step values are the historical ones, so the
  SIZE lives entirely in the multiplier: 1.1 site-wide, **1.15 in the tablet band**
  (601–1024px). Sizes derived from a step multiply by it explicitly (`h2`'s clamp,
  the about-card clamp). The hero `h1` clamps are deliberately outside it — they
  are fitted to the oval drawn around them and answer to vw.
- **Weights move in one step, mono only.** Running text 400 → 500, everything that
  was emphasis at 500 (h3, h4, `strong`, the year badges) → 600. Raleway keeps its
  thin 200/300 display faces — that thinness is the voice. Free of layout risk:
  JetBrains Mono's 400/500/600 share an advance width, so no line can rewrap.
- Loaded from Google Fonts — **one request string on every page** (Raleway
  200;300;400;500;600 + JetBrains Mono 400;500;600). Raleway 100 was loaded for
  years and never used; JetBrains 600 was used (`.oval-scroll-label`) and never
  loaded. writing.html and playground.html carried their own third and fourth
  variants of the string. openprose.html keeps its own — it needs Raleway 300 only.
  (Cinzel was retired; only onagents.html still uses it.)
- Reference: `Assets/JH-brand-styleguide.html`

**Accessibility:**
- WCAG AA compliant color contrast — **verified, not assumed**: `Agent Reference/maze-tests/contrasttest.mjs`
  sweeps 10 pages × both themes × both entry paths (loaded into a theme, and the real
  `.jh-theme-btn` clicked) and exits non-zero on any failure. Currently 0. Run it after
  any color, weight or size change; measuring by flipping `data-theme` from JS alone
  reads mid-transition values and will lie to you.
- Prefers-reduced-motion support
- Skip-link for keyboard navigation
- Semantic HTML with ARIA labels
- Structured JSON-LD data on all pages

## Versioning (single source of truth)

The site version lives in **one** place: `version` in the `SITE` object in `scripts/jh-chrome.js`. It renders the footer badge at runtime. After bumping it (or changing any shared asset), run:

```
node scripts/sync-version.mjs
```

which stamps every `?v=` cache-bust ref across root `*.html` **and** the `Portfolio vX.Y` badge in README.md. Never hand-edit `?v=` values.

## Key Features

### Interactive Hero Canvas (index.html — Fish Minigame)
- Interactive aquatic ecosystem with fish, coral, food, bubbles, jellyfish
- Real-time physics, AI behaviors, and steering systems
- Touch and mouse support for drawing entities
- See `Assets/FISH_SYSTEM_TECHNICAL.md` for full technical reference
- Debug mode: "Logic view" checkbox in the hero controls (wired to `heroFish.setDebug`)
- **Shared engine (v1.8):** the whole system lives in `scripts/fish-engine.js` — `FishCanvas(canvasEl, opts)` (full minigame, used by index.html; page hooks: `onDrawingChange`, `onStroke`; opt-in host choreography hooks `steer`, `schoolTarget`, `calmSchool`, `largeRightOfWay`, `surface` (the top of the water for a fish: its edge avoidance and the school's waypoint and slots turn back there instead of at the canvas top), and the calls `schoolPhase('scatter'|'regroup')` and `remove(fishOrCoral)`, used only by the sizzle reel and inert when absent) and `FishCanvas.ambient(canvasEl)` (single cursor-following fish, used by 404.html). `fish-demo/` still runs its own `fish.js` — that file is a compiled esbuild bundle whose source (`fish-src.js`) lives only on John's machine (gitignored); rebase it onto the engine locally when convenient

**Fish Minigame Architecture:**
- **Layered Behavior System**: Priority stack (Edge Avoidance → Heading Commitment → State Behaviors → Collision → Formation → Wander)
- **Three Fish Categories**: Small (<35px), Medium (35-60px), Large (>60px)
- **Small Fish**: Home in coral, flee from predators, behavior locking
- **Medium Fish**: V-formation schooling with stable slot assignments — rewritten 2026-09-15: slots ride the school's smoothed centre in body units, one shared heading (capped turn, so turns are arcs), lateral-only slot steering with pace paying the along error, and a school phase clock **schooling → scatter → regroup** (also fired by a predator or a tap). `maze-tests/schooltest.mjs` measures coherence/spacing/phases; FISH_SYSTEM_TECHNICAL.md has the numbers
- **Large Fish**: Solitary, territorial, dominance challenges
- Design doc: `Assets/FISH_MINIGAME_DESIGN.md`

### Blueprint Drawing Canvas + Fish Maze (design.html — v1.9 flagship)
- Fullscreen blueprint canvas; shape recognition (circles, squares, triangles, arrows, lines) with morph animations, whisper labels, particle effects
- **Fish Maze:** a transparent `#fishCanvas` above the blueprint runs the shared engine in embedded mode (`interactive:false`, `renderStyle:'blueprint'` cyan line-art). Stroke routing priority in design's `endDraw`: scratch-out erases any wall the stroke crosses ≥3 times (amber burst) → loop spawns a fish → tap feeds fish (blueprint Point when tank empty) → clean shape becomes a blueprint wall + maze obstacle → fallback stroke fades
- **Erase is relational, not gestural.** A stroke removes a wall by *crossing its outline* ≥3 times (`ERASE_CROSSINGS`, via `ShapeDetect.segmentsIntersect`) — no speed, density, or ink-ratio thresholds to tune per device. A line drawn through a wall crosses twice and is safe; a stroke on empty canvas crosses nothing; a scribble kept strictly *inside* a shape crosses nothing and deliberately does not erase. This replaced a reversal-counting + ink-ratio heuristic that was tuned against dense synthetic zigzags and silently failed on real sparse hand-drawn scratches
- Walls are the drawn OUTLINE (block chains along idealPoints — a rectangle is a pen, a circle a ring tank; interiors are open water). Engine wall physics (`applyWallPhysics` in `scripts/fish-engine.js`): lookahead slide steering + hard containment that **redirects** velocity along the wall face at full magnitude rather than zeroing the into-wall component — so a fish in contact with a wall can never be stationary, whatever the behaviour stack wants. Plus sustained-contact disengage.
- **Solids are told apart by capability, not by type.** `SOLID_KINDS` gives each solid `blocks / shelters / raisesLane / softBuffer / engineRenders`. Coral has all but `blocks`; a maze wall has only `blocks`. Capabilities are opt-in, so a new coral behaviour can never silently apply itself to walls. `isExternal` is just the "supplied by the host page" marker
- **Idle is shaped by the shapes, via rooms.** The same grid is flood-filled into *rooms* — connected open water, per size class. A fish idles in the room it is actually in: small fish patrol its rim (`rim_patrol`), cruisers reverse at the ends of their **corridor** rather than at the canvas edge and pull their lane inside the room. Before this, every tier's idle was anchored to coral and a seabed, neither of which the blueprint has, so idle fish sank to the bottom third and treated the maze as pure collision. Room-restricted targets alone proved sufficient — a 25s soak showed 0.6s of stall — so idle deliberately does **not** run per-fish pathfinding
- **`floorAffinity` is a per-page setting, not a per-page code path.** The aquarium has a seabed (fish sink toward it, cruise lanes hang above the coral); design.html passes `floorAffinity:false` so fish use the full canvas
- **Fish navigate, they don't only steer.** A navigation field (`NAV_CELL` grid + multi-source BFS out from every food pellet, one field per size class dilated by fish clearance) lets fish route *around* walls, through gaps and out of dead ends — so you can lead a fish through a maze by placing food. Local steering alone provably cannot escape a concave pen. The field is rebuilt only when walls or food change, and **with no walls it is never built at all**, so index.html seeks in exact straight lines as it always has. It also answers "is this food reachable, at my size?" as a fact, replacing a 2.5s no-progress guess Clear button removes walls, fish remain; maxShapes 50
- The "Labels" toggle also shows live behavior chips over fish/food (`tier · state · enclosed/gave up`) via engine `setInfoLabels` + the `annotateAt` hook
- The original pre-maze MetaMedium whitepaper demo is snapshotted verbatim at `Archive/design-blueprint-frozen.html` — never edit that snapshot

### Site-wide AI Search / Command Bar (scripts/search-core.js + shells)
- **One pipeline, two shells.** `scripts/search-core.js` owns ALL knowledge and behavior
  (intents, prompts, chunks, engines, generation, command registry); `scripts/search-overlay.js`
  (⌘K overlay, lazy-loads the core on first open) and `search.html` are thin shells passing an
  `el(name)` element adapter. The old "keep the two copies in step" rule is retired — there is
  one copy. Umbrella plan + build record: `Agent Reference/SEARCH_COMMAND_BAR.md`; QA suites:
  `Agent Reference/search-tests/`.
- **Tier 0**: BM25 (MiniSearch) + regex intent grammar — instant, always on
- **Tier 0.5**: semantic layer — chunk vectors precomputed into `Assets/search-chunks.json`
  (`node scripts/build-chunk-vectors.mjs` after editing chunk text; int8 base64) + a ~24 MB
  MiniLM q8 embedder on WASM (works on iOS), lazy-loaded on first search. Results upgrade in
  place via two-mode reciprocal-rank fusion (constants in `hybridMerge` — tuned by
  `search-tests/fusionlab.mjs`, re-run it before touching them). Model choice + HF repo traps:
  `Agent Reference/SEARCH_EMBEDDER_RESEARCH.md`
- **Tier 1**: In-browser LFM2.5-350M (q4f16, 255 MB) via WebGPU on Transformers.js 4.2.0's
  generic `pipeline('text-generation')`. Replaced Qwen3.5-0.8B on 2026-09-01: measured on the
  real RAG prompt, Qwen took 48–109 s to its FIRST token every query (prefill) and 69 s to load
  from cache; LFM2.5 is 0.2–0.3 s to first token, 45–100 tok/s, sub-second cache load.
  **Not available in Safari** (desktop or iOS): onnxruntime-web's WebGPU backend never
  initialises on WebKit (`De().webgpuInit is not a function`) — `checkEngines` says so up
  front instead of downloading into an error. Numbers + Safari findings: SEARCH_MODEL_RESEARCH.md
- **Tier 2**: Local LMStudio/Ollama. **Never probed on page load** — detection runs when the
  overlay first opens, localhost only after the visitor clicks Detect (or opted in before,
  `jh-local-llm-optin`). Embedding-only local models (nomic-embed etc.) are skipped.
- **Commands**: pages declare actions via `(window.JH_COMMANDS = window.JH_COMMANDS || []).push({...})`
  (index: feed/logic/scare; design: clear walls/fish, labels, feed, spawn). Nav + section-jump
  commands are synthesized from each page's `.nav-right` TOC. Typing a matching query surfaces
  action cards; Enter/click runs them. Services/contact/schedule queries get gold intent cards.
- **Tool-use**: with an LMStudio/Custom engine active, the registry is handed to the model as
  OpenAI tools; a tool call renders as a confirm chip — never auto-run.
- **BYOM**: Custom endpoint input with OpenAI-compatible API probing
- **Chunks**: `Assets/search-chunks.json` — flat factual text, field-boosted, each with a
  verified `url` (titles render as links) and a precomputed `vec`. Schema notes live in
  `_meta.fields`: `track` ("coaching" | "design", absent = both — the v2.5 fork key, not yet
  read at runtime), `facts[].url` (a fact row that is its own deep link — Blok Dok →
  `design.html#blokdok`), `model3dOrbit` (a model-viewer's opening pose; the awards plaque
  is face-on at "90deg 85deg auto", not its back). **Every chunk has an anchor** —
  `search-tests/anchorcheck.mjs` ratchet is 0 since 2026-09-14 (the personal chunks land on
  `about.html#off-the-clock`); an arrival-target `.content-card[id]` carries the section's
  `scroll-margin-top` so its heading clears the fixed nav
- **The Postcard (6a)**: results render as ONE microdense surface whose density adapts to
  query specificity — LOD ladder (mention → one-liner → tldr sentence → dossier with prose
  pretext-wrapped BOTH sides of its media), allocated by pretext line-arithmetic. Chunks
  carry dev-authored `micro`/`tldr` fields (data, not runtime generation). Hover = shared
  tooltip; compact/comfortable density toggle; empty state shows page-aware suggestion
  chips. **There is no second level** — nothing expands on click. The ladder IS the whole
  surface: the lead arrives at dossier depth, the next at tldr, then one-liners, then the
  tail, all deduped and fitted to the viewport.
- **Production coherence (Phase 9)**: renders MORPH instead of rebuilding (same-query
  interactions swap only changed modules — keyed by `data-id`; new query = full render +
  scroll-to-top); the input + tier strip live in a never-scrolling command frame
  (`.so-command-frame` in the overlay, sticky `.search-wrap` on search.html); list-like
  chunks carry dev-authored `facts` arrays rendered as dossier ROWS (density toggle then
  reaches inside the dossier); one grammar — page badge = the nav link (`design ↗`),
  module bodies are INERT (click-to-pin and its breadcrumb are gone), ↑↓/Enter and a
  3-rung Esc on the keyboard; ⤢ workspace mode
  (≥768px, persisted) splits the overlay into list + a pretext META-PARAGRAPH pane
  (strata of chunks, media as both-sides wrap obstacles, empty state seeds the page's
  own story). **The panel NEVER scrolls** (9e doctrine): the line budget is fitted to
  the viewport by measure→shrink proportional to line-units spent, the tail caps at
  "+N more", and live media (model-viewer/video/img) is GRAFTED across re-renders so
  frames never blink. Spec + build records: SEARCH_COMMAND_BAR.md Phase 9.
- **Scene language (6b)**: on index + design, utterances like "add 3 small fish and 2
  coral" or "draw a circle and put two fish inside" parse (deterministic grammar, never
  bluffs) into a PLAN CARD → confirm → materialize through the real recognizer (design:
  synthetic pointer strokes; providers in each page's inline script close over sealed
  state) with cap-aware receipts and physics-verified "N/N enclosed". "how many fish/what
  shapes" → census bylined "read from the canvas". Providers: `window.JH_SCENE`.
- **Escalation seam (6c)**: the model APPENDS below the postcard ("elaboration" eyebrow),
  an artifact rail pins the grounding chunks deterministically, the census line grounds
  local-model context, and the `scene_execute` tool has the model EMIT scene language
  that the same parser gates into the same plan card.
- **Phase 10 — truth, memory, pieces**: chunks are audited claims (`CHUNK_AUDIT.md` —
  new/edited chunks land with their audit section); the session survives as the
  **residue sentence** (a standing 26px line docked at the bottom of every page:
  question → answer clause, click = reopen restored, ✕ = dismiss for the session, any
  new search resurrects it); **pieces** (`pieces` on chunks — John-owned frameable
  hosts wake LIVE under a one-iframe budget, others render **departure cards** with
  captured posters; every chunk `url` is same-origin, Enter never exits); the
  **wording ladder** (micro → tldr → brief → full — density picks the wording inside
  a constant LOD via `textFor`, stamped `data-txt` for morphs); **media dedupe** (one
  src per render pass, pane wins). Spec + records: SEARCH_COMMAND_BAR.md Phase 10.
- **Engine color coding**: WebGPU=blue, LMStudio=purple, Ollama=orange, Custom=green
- AI toggle: users can disable LLM even when engine detected

### Playground — the site Review Canvas (playground.html)
Rebuilt on the OpenProse review-canvas engine, which replaced the old hand-built
board wholesale. Wears `<jh-nav current="play">`; **no footer** — it is a
full-viewport canvas app, so the site footer and the tool's own were both
removed along with their CSS and the vestigial `?footer=` config.

- Three view modes: canvas (pan/zoom), grid, focus. `?mode=`, `?items=`,
  `?budget=`, `?zoom=`, `?cols=`, `?sort=` all URL-editable
- Manifest: `scripts/playground-items.js` — 31 items, the whole site plus the
  demo collection carried over from the old board
- **Budgeted LRU lifecycle, not naive lazy-load.** `maxLive` iframes (8 by
  default), an IntersectionObserver at 400px, nearest-first wake, eviction with
  600px hysteresis, a 3s idle sweep, and `sleepCell` doing a real
  `iframe.remove()` so documents and WebGL contexts are actually released
- **`nested: true` in the manifest is a recursion guard.** `openprose.html`
  embeds six copies of this same canvas; waking it live would nest the tool
  inside itself. Enforced at BOTH wake paths (`wakeCell` and `openFocus`),
  because focus sets `fFrame.src` directly and bypasses the first one
- `weight: 'heavy'` is recorded per item but not yet acted on — the staged
  perf plan spends optimisation before it spends clicks
- **Type filters are derived, not declared.** The chip vocabulary is whatever
  `cat` values the manifest uses, collected at boot; a new type appears by
  tagging an item. Click selects one, shift-click accumulates, `all` clears.
  State lives in `?cat=a,b` so a filtered view is shareable
- `external: true` marks an off-origin URL — never framed (X-Frame-Options
  would paint a blank), card shows the poster captured for that host
  (`Assets/posters/<hostname>.webp`, derived never declared; `onerror` falls
  back to the hostname line) and opens in a new tab. Shares the
  `neverWake()` predicate with `nested`
- **`featured: true`** (2026-09-14) — six items lead the default sequence order,
  the most complex first, then the webs (John's ruling): 3D sync, fish demo,
  hypercube, the 2015 hypercube port, READI, OpenProse. A stable partition in
  `featuredFirst()`, no chip, no param; `date` sort and `?items=` are exempt
- **Types** are `site · case study · tools · experiments · demos · external`.
  `demos` is software you can use wherever it is hosted (READI, MetaMedium);
  `external` is writing and portfolios (the Substacks, the photography). The
  header carries no ratings toggle and no second item count (the chips say
  "N items"); the sort reads `seq` / `date made`
- **Focus mode is `z-index: 1100`, above the site nav's 1000.** It is an
  `aria-modal` dialog; at the tool's native z-50 the `← back` button landed
  inside the fixed nav's 40px band and `elementFromPoint` returned a nav icon,
  so it was unclickable — fully-zoomed genuinely had no way out
- Leaving for a real tab appends `?from=playground`, and `jh-chrome.js` renders
  a `← back to playground` chip on any page carrying it — one place, every page
- Plan of record: `Agent Reference/PLAYGROUND_CANVAS_PLAN.md`

### Writing (writing.html + writing/)
- Client-side markdown reader with its own chrome (light/dark theme, breadcrumbs, prev/next)
- Content manifest: `writing/eduos-*.md` (sovereign AI in education) and `writing/metamedium-*.md` (drawing-as-programming lineage)
- Requires an HTTP server locally (fetch()es the .md files)

## Shared Resources

```
styles/shared.css         — design system (typography, cards, hero, grids, responsive).
                            Does NOT @import jh-chrome.css any more (that made the chrome a
                            sequential round-trip). **Every page must link jh-chrome.css
                            itself, BEFORE shared.css** — miss it and the page loses all
                            design tokens and #nav falls back to position:static, growing
                            to thousands of px of stacked shape SVGs that push the content
                            below the fold. This bit onagents.html on 2026-08-27.
styles/jh-chrome.css      — the chrome alone: design tokens + #nav + shape nav + body > footer.
                            Split out so a page with its OWN visual language can still wear the site
                            header/footer (openprose.html loads only this). Two rules keep it portable:
                            no bare element selectors (#nav, body > footer — never nav/footer), and
                            tokens a host may also define (gold, spacing) are read as --jh-* so a host
                            palette cannot reach in. Chrome also resets font-size-adjust, which
                            openprose's body sets and which otherwise revives the font-size:0 the
                            compact <900px nav title relies on.
scripts/jh-chrome.js      — <jh-nav> + <jh-footer> components; JH_SITE identity + THE site version.
                            Also the ANALYTICS switch: `SITE.goatcounter` ('jjh111' since v2.15) injects the
                            GoatCounter beacon — cookieless, no fingerprint, no banner; the footer says so;
                            never on localhost. Empty string turns it off.
                            Also the site-wide AUTOPLAY GATE: under prefers-reduced-motion or on a
                            coarse pointer, every <video autoplay> is stripped of autoplay, keeps its
                            poster, and gets a corner play/pause control (.video-gate in shared.css).
                            It lives here, not shared.js, because index.html and design.html do not
                            load shared.js but every page with a <video> loads this. design.html's own
                            2-loop videos restate the same media query inline (its block runs before
                            this deferred file).
scripts/shared.js         — nav scroll-visibility, cursor spotlight, lightbox, responsive nav
scripts/search-core.js    — THE search/command-bar pipeline (knowledge + behavior, no DOM);
                            both search surfaces are shells over it
scripts/search-overlay.js — ⌘K overlay shell (lazy-loads search-core on first open)
scripts/search-overlay.css— overlay styles + command-bar card styles (search.html links it too)
scripts/build-chunk-vectors.mjs — dev-time: embeds chunks into search-chunks.json (run after
                            editing chunk text; run `npm install` once — package.json holds the dev deps)
Assets/resume.json         — THE single career source (v2.07): lanes, evidence-backed highlights,
                            awards, talks, publications, projects. Edit this, never the outputs.
                            Highlights flagged `lead: true` (≤3 per role) ARE the one-page, LinkedIn
                            and About bullets; the long CV takes every highlight. (The hand-written
                            `onePage` arrays drifted and are gone, 2026-09-16.) House prose rules,
                            linted by the compiler: one clause per sentence, no em dashes, no sentence
                            built on what a thing is not, fact then stop, name never summarize. An em
                            dash or a banned construction in the JSON REFUSES `--apply`; long sentences
                            and semicolon chains warn; the chunks are warned on every rule.
scripts/build-resume.mjs   — compiles resume.json: designed one-page PDF (fish-tank margin),
                            ATS twin, 3-page CV, markdown, LinkedIn blocks; `--apply` also writes
                            the served PDF (no phone — the application PDF stays in .local/out/),
                            chunks 4/21/23/26/27/50, john-hanacek.json and about.html resume blocks
                            between `<!-- resume:* -->` markers — and the case-study figures, from
                            `figures` on `work[id=nanome]` / `clients[OpenProse]`, into the same
                            markers on nanome2.html (`nanome-testing`, `nanome-pivot`, `op-card`) and
                            openprose.html (`op-approaches`, `op-breadth-duration`, `op-duration`,
                            `op-distillation`, `op-colophon`), so a number lives once; a meta
                            description cannot hold a comment, so those stay hand-written and the
                            compiler only WARNs when they disagree. `--lane=` picks emphasis — an unknown
                            lane is an ERROR (it used to fall back to designEngineer in silence) and
                            `--apply` REFUSES any lane but designEngineer unless you add `--force-lane`,
                            because none of the public surfaces carry the lane in their name. Guard
                            suite: `npm run test:lane`. Run build-chunk-vectors.mjs after. Serves
                            itself via serve-verified.mjs.
scripts/serve-verified.mjs — shared by both render rigs: probe a genuinely free port, then PROVE
                            the server is ours (sentinel round-trip) before rendering anything.
                            Exists because a stale server once rendered its 404 into the live
                            resume PDF (2026-09-10).
scripts/reel-script.js    — the sizzle reel's script: reader, checker (`check`, `fmt`, `json`) and line
                            editor (setDur/setAt/setField/setCue); loaded by the rig, the renderer and the tools
scripts/reel-dev.mjs      — the reel's dev server: serves the repo, saves scripts and scores, reloads the preview on change,
                            and renders for Export (/__reel/render: one job at a time, progress, cancel)
scripts/reel-timeline.js  — the reel preview's timeline panel (E): scene cards with their works, moments and out,
                            a fish lane per fish, and the music under them on its own bars (a lane per part, its clips
                            to drag, stretch, fade and level, the pads, the sound effects' cues, M and S); zoom
scripts/reel-export.js    — the reel preview's Export (X): render on the dev server, or ask Claude on claude.ai
scripts/reel-media.mjs    — the reel's media library: every picture and clip in Assets/ a script could name, with
                            size, length and a thumbnail (ffmpeg, cached in .local/reel-media/); `node scripts/reel-media.mjs`
scripts/reel-picker.js    — the reel preview's media picker: choose a slot's picture or clip by its thumbnail
scripts/reel-ui.js        — the reel editor's icons and buttons, the collapse rule every bar folds by (REEL_UI.fit), and
                            a part's notes as SVG paths (REEL_UI.rollPaths: the timeline's clips, the pads' tiles)
scripts/reel-fish.js      — the reel preview's Fish panel (F): edits the selected `fish` line, writes new ones at
                            the playhead (paused: at once; playing: a take kept on pause), marks the stage's spots
                            to drag, and shares its selection with the timeline's fish lanes
scripts/reel-text.js      — the reel preview's in-place text editor: paused, double-click a line on the stage and
                            type; Enter keeps it (one `setField`, on the timeline's undo stack), Esc puts it back
scripts/reel-shots.js     — the reel preview's shot list (S): the scenes in order, dragged into another order,
                            timed, given their transitions (and every shot's), copied, taken out
scripts/reel-music.js     — the reel's score: reader, checker (`check` draws the clips on the bars), arranger, and line
                            editors (setClip, addClip, removeClip, setPad, setArg) and padPreview
scripts/reel-synth.js     — the score's synths and effects in Web Audio: the live preview's player and the offline mix
scripts/reel-rack.js      — the reel preview's synth rack (M): each part's pads (tiles to hear, steps or a tune to edit),
                            the sounds and effects, drawn and playable; it keeps the score, and tells the timeline of
                            every change (a `reel-score` event)
scripts/reel-host-claude.js — the editor's host on claude.ai: window.REEL_HOST keeps saves in the page's `db` (it reads each file once a page: the rig asks for the score's saved version beside the script's, so the synth rack never waits on a slow store a second time)
                            (files/<name> = { text, file, savedAt }), reads the films Claude rendered (films/latest),
                            saves files through the viewer's dialog (`downloads`: download, saveFilm for a film's
                            Blob, said() for what came of it) and sends Export's request to Claude (`comments`);
                            only the built editor loads it. Each
                            save leaves a timed copy in the tab (a reload plays it at once); the store is read
                            behind it, and a newer save there (another tab's, or one Claude wrote) is offered and
                            played in place. So after writing files/<name> with ArtifactData, include `savedAt`
                            (an ISO time): an open editor then offers John the new version instead of keeping its copy
scripts/build-reel-editor.mjs — packs the live rig (preview, timeline, rack, export, picker) with its scripts, media
                            and the picker's whole library (catalogue, thumbnails, files: about 40 MB) into
                            one page for the Artifact tool (--out=dir; files.json is the `files` map); publish with
                            capabilities { db, downloads, comments, assets }. Pull John's edits with ArtifactData `get`
                            files/sizzle-reel-2.script.txt and .score.txt. An Export request arrives as a comment sent
                            to Claude: render the formats it names from the saved edit, upload each film to the
                            artifact (Artifact, asset: true) and write films/latest = { renderedAt, from, items }.
                            Test: reel-tests/hosttest.mjs
scripts/record-walkthrough.mjs — a one-minute captioned walkthrough of the hosted editor, every control set, with its
                            sound: the build served with a stand-in claude.ai host, the browser's screencast held to
                            30 fps, captions drawn in a band above the page; `--dry` checks every step (a click that
                            would miss its target stops the take) → .local/walk/reel-editor-walkthrough.mp4
scripts/playground-items.js — manifest for playground.html (31 items). `featured: true` leads
                            the default sequence sort (stable partition; `date` and `?items=` exempt). `nested: true` marks a
                            page that embeds the canvas itself (recursion guard); `weight: 'heavy'`
                            records cost for the staged perf work.
scripts/pretext-wrap.js   — flows running prose around obstacles on BOTH sides, which no CSS
                            shape can do (`shape-outside` excludes on one edge only; `shape-inside`
                            never shipped). Wraps the vendored pretext line-breaker, whose
                            `layoutNextLine(prepared, cursor, maxWidth)` is incremental — so each
                            row is carved into slots and asked for a line per slot. ESM, dynamically
                            imported, so pages that don't wrap pay nothing. Extracted from
                            direction-lambda-inkwell-concept.html and generalised (any shape, DOM as
                            source of truth, aria-hidden line layer over a retained prose copy,
                            re-layout on document.fonts.ready + ResizeObserver). The retained copy
                            (`.pretext-source`) is FULL-SIZE in transparent ink, never clipped to a
                            pixel: Safari Reader judges by geometry and skipped the §II ledes on
                            openprose.html until 2026-09-14. The line layer holds NO text nodes:
                            each run is an empty <span>/<strong> whose text is `data-text`, painted
                            by `::before { content: attr(data-text) }` — Safari Reader ignores
                            aria-hidden and read every wrapped paragraph twice. Three copies of
                            both rules exist (shared.css, search-overlay.css, openprose.html's
                            inline block) — the overlay's wins the cascade on openprose, so change
                            all three together. openprose.html also declares itself ONE article
                            (`<main itemscope Article>` > `<article itemprop=articleBody>`) so a
                            reader takes the whole case study, not the densest section.
                            Demo/test: Assets/DemosPlayground/pretext-wrap-test.html
scripts/pretext/          — vendored copy of the pretext text-measurement + line-breaking engine
                            (see VENDORED.md). Also usable measurement-only: prepare() + layout()
                            answer "how many lines at width W" arithmetically with no DOM read,
                            which is the right way to use it for fit/truncate decisions.
scripts/sync-version.mjs  — dev-time version stamper (reads version from jh-chrome.js)
john-hanacek.json         — structured data for AI/Search (Schema.org Person)
robots.txt                — allows AI crawlers explicitly; points to sitemap
sitemap.xml               — the 9 public pages (www host); secrets stay out
llms.txt                  — AI-readable site summary
CNAME                     — www.johnhanacek.com (GitHub Pages)
Assets/
  search-chunks.json      — search index
  media-kit.json          — the media pack's copy (13 boards) and cut 1's sizzle-reel edit (`reel`);
                            media-kit.html and the reel rigs only draw them
  sizzle-reel-2.script.txt — cut 2's edit as a plain-text script (read by scripts/reel-script.js)
  sizzle-reel-2.score.txt — cut 2's music as a plain-text score (read by scripts/reel-music.js)
  favicon-jhsigfrmpaper.png
  JHsig.svg               — signature used in nav + footer + hero (vector; white fill baked in)
  footer-JHsig.png        — superseded raster signature; still referenced by the frozen Archive/ snapshots, so it stays
  socialgraph-jhcom.webp  — OG image
  FISH_*.md               — fish system design/technical docs
  DemosPlayground/        — interactive demos loaded by playground.html + test-llm/test-vision PoCs
  3d-sync-demo/           — Three.js synchronized viewports demo
```

## Footer Pattern

Rendered by `<jh-footer>` (scripts/jh-chrome.js) on all standard pages — edit there, not per-page:
signature image → copyright "© 2026 John Hanacek · JHDesign LLC" → GitHub link → version badge.

## Contact & Social

- Email: hi@johnhanacek.com (the ONLY email; jhanacek.net is the retired old domain)
- LinkedIn: linkedin.com/in/johnhanacek
- Bluesky: johnhanacek.bsky.social
- X/Twitter: x.com/johnhanacek
- GitHub: github.com/jjh111/johnhanacek

## Development Notes

**File Structure:**
Each page is a standalone HTML file with:
- shared.css + jh-chrome.js (components) + Google Fonts + inline CSS/JS
- Inline `<style>` and `<script>` blocks for page-specific behavior
- Open Graph + Twitter Card meta tags, self-canonical (public pages only)
- JSON-LD structured data
- WCAG AA accessibility

**Performance Optimizations Applied:**
- Voronoi background removed (was 40-50% CPU)
- CSS shimmer simplified (removed hue-rotate)
- Canvas animation pauses when idle (30-40% savings)
- Playground: visibility-based iframe loading/unloading
- Videos compressed to web bitrates (1280w, H.264 CRF 27, muted-autoplay embeds have no audio track)

**Local dev:** `python3 -m http.server 1337` from the repo root (writing.html and search need HTTP, not file://). For the sizzle reel's editor, `node scripts/reel-dev.mjs` instead.

**Running the test suites** (`Agent Reference/maze-tests/`, `search-tests/`):
from the repo root, `npm install`, then `npm run browsers` — the installer
PINNED to the version `package.json` pins (1.62.1 → chromium-1234). The suites
resolve the browser as `CHROMIUM_PATH || chromium.executablePath()`:
playwright-core's own answer, so no suite spells a cache path by hand and
nothing needs exporting. `CHROMIUM_PATH` remains the override.

**Never run a bare `npx playwright install`.** It fetches the LATEST playwright's
browsers and *deletes* the build the installed `playwright-core` needs, so every
suite breaks at launch with "Executable doesn't exist". That happened on
2026-09-10: it removed a working 1217, installed 1243, matched neither, and
killed two gate runs mid-sweep. Recovery without any download:
`CHROMIUM_PATH=<path to a Chrome for Testing binary>` overrides the lookup, and
every suite honours it.

**After a push, prove the deploy** — there is no CI: `node scripts/check-live.mjs`
fetches every page in the sitemap and asserts each `?v=` ref matches `SITE.version`,
then validates the resume PDF by magic bytes (the 404-page-as-resume incident) and
that both JSON artifacts parse. `--base http://127.0.0.1:1337` runs the same checks
against a local server. Exits non-zero on any disagreement.
