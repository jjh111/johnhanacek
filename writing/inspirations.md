# Inspirations

A signpost, not an archive: the talks and lectures I keep returning to, with the notes I'd hand you if you asked why they matter. These four — two from Bret Victor, two from Ken Perlin — argue the same thing from four directions: the computer is not a faster pencil, and the work is finding the native language of a medium that can behave.

Two ground rules borrowed from the talks themselves: watch for **behavior**, not structure, and be suspicious of every representation you inherited from paper.

## The Talks

### Bret Victor — Media for Thinking the Unthinkable

*MIT Media Lab, 2013 · 39 min* — [youtube.com/watch?v=HK77hLfRPEA](https://www.youtube.com/watch?v=HK77hLfRPEA)

Victor opens with the Nature paper that launched network theory, reads a paragraph of it, and calls it what it is: a brilliant writer compressing a rich mental picture over a low-bandwidth channel of symbols.

> The authors have a very rich picture in their heads and they're trying to compress that picture to transmit over a very low bandwidth channel.

Then he redraws the paper so the algorithm *plays* — the picture in the author's head, illustrated. A circuit schematic whose components are replaced by live plots of their own voltage and current. Hamming's "unthinkable thoughts," with the obvious rejoinder Victor says Hamming skipped: we know about sounds we can't hear because we build tools that bring them to our senses. The closing checklist — see the behavior, see the whole state at once, adjust and feel the response, demand multiple linked representations, and *draw* the representations instead of coding them — is the closest thing MetaMedium has to a spec.

https://www.youtube.com/watch?v=HK77hLfRPEA

### Bret Victor — Stop Drawing Dead Fish

*San Francisco, 2012 · 53 min* — [youtube.com/watch?v=ZfytHvgHybA](https://www.youtube.com/watch?v=ZfytHvgHybA)

A drawn fish that swims in a circle while a hook drops past it is, in this medium, a picture of a dead fish. Victor walks from dead fish to dumb fish (keyframed, oblivious) to an alive one — a fish with behaviors, performing *with* the artist, neither knowing the script. Simulation, not animation, is the computer's native power; video games were the first art form to figure that out.

> Everything we draw should be alive by default.

And the line I want on a wall somewhere: creating behavior does not mean writing code. Artists don't need to code; we need ways of creating behavior that make sense in the medium. He ends with a digital puppet show — no timeline, no prerecorded frames, just pictures that know how to listen to his hand — and a charge: open Photoshop and *feel* that everything you draw is dead.

https://www.youtube.com/watch?v=ZfytHvgHybA

### Ken Perlin — AR and the Future of Language

*AR in Action, 2017 · 14 min* — [youtube.com/watch?v=ZDkHgP45Tqg](https://www.youtube.com/watch?v=ZDkHgP45Tqg)

Perlin's homework assignment is *Rainbows End*, and his question is what language becomes when drawing in the air is as cheap as speaking. Kids under seven are the engine of all language evolution — so kids who grow up gestural will simply assume that what they draw is conversational, alive, and shared. In the demos, drawn objects behave (every noun is also a verb), a friend remixes your design by grabbing a piece of it mid-conversation, and the talk closes on a ticklish bird whose whole point is that it watches you back.

> The most important thing about these characters is that they are interested in us.

https://www.youtube.com/watch?v=ZDkHgP45Tqg

### Ken Perlin — The Future Evolution of Language

*UIST 2018, Berlin · 32 min* — [youtube.com/watch?v=ZZi3I_NCiUk](https://www.youtube.com/watch?v=ZZi3I_NCiUk)

The longer version of the argument, grounded in autobiography: plastic dinosaurs, Harold and his purple crayon, Tron, and the noise functions that later put dinosaurs in movies. Written language, he argues, was the greatest power-up human communication ever got — and the next one gets spent on ads unless children reach the new medium first. The demo I think about most: two fish, drawn with different gestures, already *instructed* by how they were drawn. The Q&A lands the thesis that every medium carries rules from what it can't do — montage from the cut, iambic pentameter from the syllable — and the future belongs to people who grow up native:

> All we can do in any one generation is create possibilities… we are strangers in a strange land. We are not natives.

https://www.youtube.com/watch?v=ZZi3I_NCiUk

## Threads

- **Behavior is the truth of the medium.** Victor's live circuits and Victor's alive fish make the same move: stop staring at structure, start watching what the system *does*. The code "becomes the program" in our attention; what matters is what it's doing.
- **Drawing is the interface.** Perlin's air-drawings and Victor's demand to *draw* the representations agree: direct manipulation of the picture is how behavior gets authored — MetaMedium's whole premise.
- **Natives inherit the medium.** Super Mario Bros. wasn't modeled on chess; gestural language won't be modeled on English. Our job is the possibilities. The kids make the language.
- **Where it points:** the MetaMedium section on this page is the attempt to build the thing these talks describe.

## The Lineage

These talks don't come from nowhere. The MetaMedium whitepaper opens with a lineage — every thread from Licklider's 1960 man-computer symbiosis memo to MetaMedium itself, tagged as *visions*, *recognition*, or *intelligence*. Two of the four talks above are already nodes in it: Victor's *Inventing on Principle* (2012) and Perlin's ChalkTalk (2015), marked there as "the direct ancestor." The whole timeline lives here:

@iframe:../Assets/lineage-timeline.html

The full project — the whitepaper, the recognition pipeline (marks become features become shapes become compositions become meaning become executable), and the live canvas demos — is at [jjh111.github.io/MetaMedium](https://jjh111.github.io/MetaMedium/), with the repo at [github.com/jjh111/MetaMedium](https://github.com/jjh111/MetaMedium).
