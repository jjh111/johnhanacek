# Art + photo intake — 2026-10-05

John added 20 files to `Assets/art/` and `Assets/photos/`. This is the plan for
getting them onto the site, and for handing the same pieces to the video agent
that makes his marketing material.

## 0. The rule: masters local, web encodes committed

Every original is in `.gitignore` (the repo is public and served, and git keeps
every byte forever). The site serves, and the repo holds, only the encode beside
it. The video agent works from the masters on John's machine.

| Piece | Master (local) | Web encode | Size |
|---|---|---|---|
| HoloLens headshot | photos/hololensheadshot…jpg | photos/hololens-headshot.webp (1200²) | 288K → 70K |
| *Containing Multitudes* | photos/Power-of-Ma-Shakti.jpg | photos/power-of-ma-shakti.webp | 336K → 55K |
| *Aligned Sight* | photos/red moon loop-07022015_1.jpg | photos/red-moon-headlamp.webp | 960K → 10K |
| Moonrise portrait (parked) | photos/_DSC5379.JPG | photos/moonrise-portrait.webp | 7.7M → 24K |
| Street portrait | photos/_JJH6952.jpg | photos/portrait-street.webp | 8.0M → 42K |
| Hat portrait | photos/_JJH7999.jpg | photos/portrait-hat.webp | 2.2M → 63K |
| Mountain-lake selfie | photos/604ade…HeadshotJHmountain.jpg | photos/mountain-lake-selfie.webp | 359K → 170K |
| Sierra hike ×4 | photos/IMG_8033/8057/8092/8096.heic | photos/sierra-hike-{boulders,meadow,cirque,lake}.webp | 128–341K |
| *Blink If You Can Hear Me* (2015) | art/Blink.jpg | art/blink.webp | 84K → 24K |
| *Galaxy Cat* (2018) | art/galaxy_cat.jpg | art/galaxy-cat.webp | 540K → 333K |
| *The Last Frontier* (2016) | art/last-frontierJH.jpg | art/last-frontier.webp | 1.3M → 190K |
| *God-ish* (2015) | art/God-ish.mov | art/god-ish.mp4 + -poster.jpg | 98M → 5.7M |
| *Mirrored Lotus* (2019) | art/LotusFlip-JH.mp4 | art/lotusflip.mp4 + -poster.jpg | 27M → 3.0M |
| New Earth Story vase | art/NewEarthStoryVase.glb + Ceramic_Vase1.usdz | (Phase 2) | 11M + 8.8M |
| Granite Omnistump, mesh | art/Photoscan scene for website.glb | (Phase 2) | 11M |
| Granite Omnistump, splat | art/Sierras tree.compressed.ply | (Phase 3) | 12M |

## 1. One registry for every piece: `Assets/gallery.json`

The site already works this way for careers (`resume.json`) and for the media kit
(`media-kit.json`): one data file is the truth and everything else reads it. The new
pieces get the same treatment, because three consumers need the same facts:
- the site (captions, alt, placement);
- search (chunk facts);
- the video agent (masters, titles, years, usage notes).

Per piece: `id, title, year, kind (photo|still|video|model|splat), caption, alt,
context (event, place), links (IMDb…), web {src, poster, w, h, duration, audio},
master (repo-relative local path), placements [about#bio …], use (site / marketing
OK / site only)`.

Captions live in the registry. At first the HTML is placed by hand and only
mirrors it. Once there are more than a handful of placements, a small compiler
(`scripts/build-gallery.mjs`, the `build-resume` marker pattern:
`<!-- gallery:about-off-clock -->`) stamps the figures in so a caption lives once.
It would also check that every web file exists and is under budget, and emit the
chunk facts.

## 2. Photos: where each one earns its place

Placed now (local, uncommitted):
- **About › Bio:** the HoloLens headshot floats left beside "Since 2012… founding
  designer", captioned "Hackathon at Microsoft Reactor, San Francisco, 2019" (John:
  "2019, I think", so confirm).
- **About › Off the clock:**
  - *Containing Multitudes* floats right.
  - Beside it, *Aligned Sight* and one Sierra lake shot form a pair.
  - The Sierra caption is still TODO.

Proposed, needs John:
- **Headshots.** About's main portrait is the circle-cropped flower headshot. The
  street and hat portraits are one strong session; the mountain-lake selfie is
  warmer and outdoors. Which is primary (About bio, `john-hanacek.json` image, OG
  card, media kit), and do the others rotate in anywhere?
- **The art photos.** *Containing Multitudes* and *Aligned Sight* are staged
  long-exposure works, not snapshots. They could move from About to art.html
  › Photography & Media, which today is text and links only, as a captioned row.
  About would then keep the life photos: Sierra hikes, the mountain selfie.
- **The Sierra set (4).** These fit Off the clock ("I hike, camp, and photograph").
  That card's text says "across Southern California", which these aren't. The text
  is also the source of search chunks 30–32, so changing it means re-auditing
  those chunks.
  - These four are also the natural frame for the Omnistump capture (§4): the trip,
    then the object scanned on it.

## 3. Art stills and videos → art.html (Phase 1, easy once credits are in)

- **Visual Art:** *Galaxy Cat* (2018) and *The Last Frontier* (2016), as a captioned
  two-up that opens in the existing shared.js lightbox.
- **Film:** *Blink If You Can Hear Me* (2015) gets a poster card with the IMDb link
  (tt6064026). Needs: John's role on it.
- **Interactive Installations:** *God-ish* (2015), the Leap Motion interactive
  lightning strike, as a self-hosted `<video controls preload="none" poster>` with
  sound. It sits with the installations it belongs to, not in 4D Art.
- **4D Art:** *Mirrored Lotus* (2019), the same kind of player, beside Merkaba Island.
- No autoplay (both have sound), so the jh-chrome autoplay gate never touches
  them. `preload="none"` means neither costs a byte until played.

## 4. 3D without hurting the page: a facade, not an embed (Phase 2)

Today art.html loads a Sketchfab iframe for the Omnistump, which pulls Sketchfab's
whole viewer at page load. Replacement:

1. **Poster first.** At load the card is a still render (~40 KB WebP, rendered once
   from the model by the same headless rig used here) plus a "Explore in 3D" button.
   No 3D JavaScript, no model bytes.
2. **On tap.** Dynamically import `<model-viewer>` (the same CDN build design.html
   and search-core use, so often already cached), then load the GLB.
3. **Shrink the GLBs first.** `npx @gltf-transform/cli optimize in.glb out.glb
   --compress meshopt --texture-compress webp --texture-size 2048`. 11 MB scans
   typically land at 2–4 MB. Check the result side by side before committing;
   masters stay local.
4. **Touch doctrine.** In-flow viewers give vertical swipes back to the page
   (`touch-action="pan-y"`). One finger orbits only after the tap that woke it.
5. **AR, iOS and visionOS.** model-viewer's `ar` button, with `ios-src` pointing at
   the USDZ:
   - iPhone and iPad open it in AR Quick Look ("view in your space");
   - visionOS Safari opens the same USDZ in Quick Look in the room.
   - The 8.8 MB USDZ is fetched only when someone taps AR. Without it,
     model-viewer converts the GLB to USDZ on the fly, so it isn't strictly
     required. A hand-made USDZ keeps materials exact, though, so keep it.
   - Only the vase has a USDZ today. The Omnistump could get one by exporting from
     the same source.

Result: art.html gets lighter than today (Sketchfab gone) and the models load
only for people who ask.

## 5. The Omnistump, two ways: mesh ⇄ splat (Phase 3)

The photoscan GLB and the Sierras tree splat are one capture rendered two ways: a
photogrammetry mesh, and a Gaussian splat (SuperSplat 1.8.4 compressed PLY,
749,465 splats, 12 MB). The card can show that directly: one stage, a
`mesh | splat` toggle, the same camera.
- Mesh mode is §4's model-viewer.
- Splat mode lazy-loads **Spark** (sparkjs.dev, a three.js splat renderer). It
  reads SuperSplat's compressed PLY as-is, on WebGL2, iOS included.
- Phones: 750k splats is heavy. Measure on a real iPhone. If it stutters, export a
  ~250k-splat variant from SuperSplat for coarse pointers.
- Splat mode releases its WebGL context when toggled off or scrolled away, the
  playground's sleep rule.
- First step before any of it: render both and confirm they really are the same
  object (John: "I believe").

It becomes a Playground item (`weight: 'heavy'`) and gets a search chunk ("one
capture, two renderings").

## 6. The video agent

The registry is its interface: titles, years, captions, alt, and `master` paths to
the full-resolution originals on this machine. Masters are never committed, so the
agent reads them in place. `use` marks anything that is site-only. Open: where that
agent works (this repo's media-kit rig, `Assets/media-kit.json`, or another repo),
and what it wants (masters, captions, crops, a manifest format).

## 7. Search + docs, every phase

New and changed pieces go into the art chunk(s) as facts, with an audit section in
CHUNK_AUDIT.md, then `node scripts/build-chunk-vectors.mjs`. CLAUDE.md gets the
registry and the facade rule.

## Phases

| Phase | What | Blocked on |
|---|---|---|
| 1 | About photos; art stills + videos; `gallery.json` by hand | Blink credit, Sierra captions, art-photo placement call |
| 2 | 3D facade, optimized GLBs, Sketchfab removed, vase with AR | nothing (go) |
| 3 | Omnistump mesh ⇄ splat stage | confirming same capture; iPhone test |
| 4 | `build-gallery.mjs` compiler | once placements grow past hand-keeping |

## Status — 2026-10-05 (v2.42, Phase 1 built)

John's answers:
- *Blink*: actor, selected for DC Shorts.
- The flower headshot stays main.
- *Containing Multitudes* stays small on About; *Aligned Sight* goes on About as a square crop; both also go on art.html, larger.
- He also camps in the Sierra Nevada.
- HoloLens: 2019 confirmed.
- The video agent is on branch `claude/funny-dirac-ytu5la`.

Built:
- **About.** HoloLens floats left in Bio. In Off the clock, *Containing Multitudes* is small and floats right; *Aligned Sight* (`aligned-sight-square.webp`) pairs with a square Sierra lake shot ("Sierra Nevada"); the text gains the Sierra sentence.
- **art.html.**
  - Visual Art: Digital Illustration, *Galaxy Cat* + *The Last Frontier*.
  - Installations: God-ish is self-hosted (the YouTube iframe is gone).
  - 4D Art: *Mirrored Lotus*.
  - Photography: a Photographs card (*Containing Multitudes*, *Aligned Sight*) and the *Blink* card.
- **Search.** Chunks 12/15/31 updated, CHUNK_AUDIT §K, vectors rebuilt.
- **Registry.** `Assets/gallery.json`.

For the reel agent (on its branch, not here):
- `scripts/reel-media.mjs` scans `FOLDERS = ['', 'grad', 'blokdok', 'posters']`, so it needs `'photos', 'art'` added to see these.
- Clip posters already follow its `<name>-poster.webp` rule.
- Masters sit beside the encodes with different names, so it would list both. Reading `gallery.json` (web vs master) is the clean way to pick.

Still unplaced: portrait-street, portrait-hat, mountain-lake-selfie, three Sierra hikes, moonrise (parked).

## Open questions for John (answered ones kept for the record)

1. *Blink If You Can Hear Me*: your role on the film?
2. Primary headshot: flower (current), street, hat or mountain-lake? Where do the others go?
3. *Containing Multitudes* and *Aligned Sight*: keep on About, or move to art.html
   Photography as works?
4. The Sierra set: place and date for captions; and should Off the clock's
   "across Southern California" change? (That text is search chunks 30–32.)
5. HoloLens: is 2019 right?
6. The video agent: where does it live and what does it want from the registry?
