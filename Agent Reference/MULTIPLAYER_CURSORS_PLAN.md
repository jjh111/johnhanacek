# Multiplayer Cursors — Live Visitor Presence
*Last updated: April 2026*

Add real-time multiplayer cursors to the index.html hero canvas, letting site visitors see each other's cursors as they explore the fish ecosystem. Creates a subtle "someone else is here" awareness — like seeing flashlights in an aquarium.

---

## Current State

### What exists
- **index.html** — Full-viewport `<canvas id="heroCanvas">` with fish ecosystem. Mouse/touch position already tracked for drawing interaction and fish food targeting.
- **`scripts/shared.js`** — `initCursorSpotlight()` already tracks mouse position via `mousemove` and `touchmove` events. The cursor spotlight div (`#cursorSpotlight`) updates a radial gradient at the pointer position.
- **3d-sync-demo** — Has a `Cursor3D` class with position interpolation (`lerp` at 0.15 smoothing), visibility toggling, and label rendering. Same concept in 3D; the 2D version can reuse the interpolation pattern.
- **Nanome2 Case Study** — Documents "Non-Rivalrous" shared cursor paradigm from XR design work. This feature extends that philosophy to the 2D portfolio.

### What doesn't exist
- No WebSocket/WebRTC/real-time server infrastructure
- No server-side component (site is static HTML on GitHub Pages or similar)
- No visitor identity or session system
- No presence data in the fish canvas render loop

### Related plans (don't duplicate)
- `SITE_POLISH_PLAN.md` — oval HUD, glass scroll, canvas `position: fixed`
- `AQUARIUM_GAME_MASTER_PLAN.md` — fish behavior, onboarding
- `LLM_SEARCH_INTEGRATION_PLAN.md` — SharedWorker for model persistence (relevant pattern for client-side state sharing)
- `ART_HERO_ENHANCEMENT_PLAN.md` — art.html canvas enhancement (independent)

---

## Design Principles

1. **Subtle, not distracting** — Other visitors' cursors are ambient presence, not a chat room. Think "flashlights in an aquarium" not "Twitch chat."
2. **Zero-configuration for visitors** — No login, no name entry. A random aquatic label is auto-assigned (e.g., "🐋", "🐠", "🦑").
3. **Graceful degradation** — If the real-time server is down or unreachable, the site works exactly as it does now. No loading spinners, no error banners.
4. **Performance-first** — Cursor rendering adds minimal overhead to the already-complex fish canvas loop. Target: <0.5ms per frame for all remote cursors combined.
5. **Privacy-respecting** — No IP logging. Cursor positions are ephemeral. No persistent tracking. Connection is anonymous.

---

## Architecture

### Server Options Evaluation

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: PartyKit** (recommended) | Designed for exactly this use case. Built on Cloudflare Durable Objects. Free tier covers low-traffic portfolio. Zero-config rooms. WebSockets. No server management. | External dependency. Requires PartyKit account. | **Best fit** — purpose-built for multiplayer cursors on static sites |
| **B: Ably** | Reliable pub/sub. Generous free tier. Well-documented. | Heavier SDK. Overkill for cursor position broadcasting. API key exposed in client. | Viable but over-engineered |
| **C: Socket.io + custom server** | Full control. Open source. | Requires running a Node server 24/7. Cost, maintenance, uptime. Antithetical to static site architecture. | **Avoid** — defeats the static-site design |
| **D: WebRTC (peer-to-peer)** | No server needed after signaling. Low latency. | No signaling server = no discovery. Complex NAT traversal. Doesn't scale beyond ~10 peers without a mesh/relay. | Too complex for the use case |
| **E: Supabase Realtime** | Free tier. PostgreSQL-backed. Auth available. | Database is unnecessary overhead. SDK is large. | Overkill |
| **F: Fly.io + custom WebSocket** | Full control. Cheap at low scale. | Still requires maintaining a server. More ops than PartyKit. | Viable alternative to A |

**Recommendation: PartyKit** — it's literally designed for "see other cursors on my website." The `@partykit/presence` pattern matches this use case exactly. Free tier handles portfolio-scale traffic trivially.

### Data Flow

```
Visitor A (browser)                    PartyKit Server                    Visitor B (browser)
       │                                     │                                    │
       │── mousemove ──→ local cursor ──→    │                                    │
       │                    position {x, y}  │                                    │
       │   WebSocket connect ──────────────→ │ ←── WebSocket connect             │
       │                     {join: id,      │ ──────→ {join: id,                │
       │                      label: "🐋"}   │         label: "🐋"}              │
       │   cursor update ─────────────────→ │ ──────→ cursor update              │
       │   {id, x, y} (throttled 50ms)      │         {id, x, y}                │
       │                                     │ ←──── cursor update               │
       │ ←─────── cursor update ─────────── │        {id, x, y}                 │
       │          {id, x, y}                │                                    │
       │   disconnect ────────────────────→ │ ──────→ {leave: id}               │
```

### Message Protocol

Minimal JSON messages over WebSocket:

```javascript
// Client → Server: Join
{ type: "join", id: "anon-7f3a", label: "🐋" }

// Client → Server: Cursor move (throttled to ~20/sec)
{ type: "cursor", id: "anon-7f3a", x: 0.5, y: 0.3 }
// x, y are normalized 0–1 relative to viewport

// Client → Server: Leave (or server detects disconnect)
{ type: "leave", id: "anon-7f3a" }

// Server → Client: Broadcast any of the above from other clients
// Server also sends periodic heartbeats for connection health
```

**Why normalized coordinates?** The hero canvas may be `position: fixed` (per `SITE_POLISH_PLAN.md`) with different viewport sizes. Normalized coords let each client map to its own canvas dimensions.

---

## Visual Design

### Cursor Appearance

Remote cursors render directly on the `#heroCanvas` — no DOM overlays. This keeps them in the same rendering context as fish, ensuring proper z-ordering and no layout thrashing.

```
        🐋
         ╲
          ╲
           ● ←── glowing dot (4px radius, color-matched)
```

- **Dot**: 4px radius circle, semi-transparent glow matching the site palette
- **Label**: Emoji + thin text name, offset 12px above the dot
- **Trail**: Optional — last 5 positions fade out over 300ms (subtle motion blur)
- **Colors**: Picked from the site palette per-visitor:
  ```javascript
  const CURSOR_COLORS = [
      '#7dd8f7', // cyan (primary)
      '#4dc9f6', // cyan-dim
      '#d4af37', // gold
      '#b8dced', // text-bright
      '#7a9aaa', // muted
      '#a8e6cf', // seafoam (new, complementary)
      '#f0c27f', // warm sand (new, complementary)
  ];
  ```

### Cursor Label Assignment

Auto-assign an aquatic emoji on connection:

```javascript
const AQUATIC_LABELS = [
    '🐋', '🐠', '🦑', '🐙', '🦐', '🐚', '🪸', '🦈',
    '🐬', '🦀', '🐡', '🪼', '🦞', '🐢', '🦭', '🪻'
];
// Assigned round-robin or randomly from available
```

No name input. The emoji IS the identity. Visitors can see "🐋 is also here" — that's enough.

### Fade-in / Fade-out

- **Join**: Cursor fades in over 400ms (opacity 0 → 1)
- **Leave**: Cursor fades out over 600ms (opacity 1 → 0), then removed
- **Idle**: After 10 seconds of no movement, cursor opacity dims to 0.3. Returns to 1.0 on next move.

---

## Implementation

### File Structure

```
scripts/
  multiplayer-cursors.js   ← NEW: Client-side cursor manager

server/                    ← NEW: PartyKit server (minimal)
  server.js                ← PartyKit room handler (~50 lines)

index.html                 ← MODIFY: Add script tag, cursor render in canvas loop
```

### TRACK A — Server (PartyKit)

#### A1. PartyKit Room Setup

```javascript
// server/server.js
import type * as Party from "partykit/server";

export default class CursorRoom implements Party.Server {
  connections: Map<string, Party.Connection> = new Map();
  cursors: Map<string, { x: number; y: number; label: string }> = new Map();

  onConnect(conn: Party.Connection) {
    // Send existing cursors to new connection
    for (const [id, cursor] of this.cursors) {
      conn.send(JSON.stringify({ type: "cursor", id, ...cursor }));
    }
    this.connections.set(conn.id, conn);
  }

  onMessage(msg: string, sender: Party.Connection) {
    const data = JSON.parse(msg);

    if (data.type === "join") {
      this.cursors.set(sender.id, { x: 0.5, y: 0.5, label: data.label });
      this.broadcast(JSON.stringify({ type: "join", id: sender.id, ...this.cursors.get(sender.id) }), [sender.id]);
    }

    if (data.type === "cursor") {
      const cursor = this.cursors.get(sender.id);
      if (cursor) {
        cursor.x = data.x;
        cursor.y = data.y;
      }
      this.broadcast(JSON.stringify({ type: "cursor", id: sender.id, x: data.x, y: data.y }), [sender.id]);
    }
  }

  onClose(conn: Party.Connection) {
    this.connections.delete(conn.id);
    this.cursors.delete(sender.id);
    this.broadcast(JSON.stringify({ type: "leave", id: conn.id }));
  }

  broadcast(msg: string, exclude: string[] = []) {
    for (const [id, conn] of this.connections) {
      if (!exclude.includes(id)) conn.send(msg);
    }
  }
}
```

**Deployment**: `npx partykit deploy server/server.js` — one command, live on Cloudflare edge.

#### A2. Rate Limiting & Connection Limits

- Max 50 concurrent connections per room (portfolio won't exceed this)
- Cursor updates throttled server-side: max 20/sec per client (drop excess)
- Idle timeout: 5 minutes of no messages → disconnect
- No message persistence — cursors are ephemeral

### TRACK B — Client Module (`scripts/multiplayer-cursors.js`)

#### B1. Connection Manager

```javascript
// scripts/multiplayer-cursors.js
export class MultiplayerCursors {
    constructor(canvasId = 'heroCanvas') {
        this.canvas = document.getElementById(canvasId);
        this.room = null;
        this.myId = 'anon-' + Math.random().toString(36).slice(2, 6);
        this.myLabel = this.pickLabel();
        this.remoteCursors = new Map(); // id → { x, y, label, opacity, lastSeen, trail[] }
        this.connected = false;
        this.enabled = true;

        // Throttle cursor sends to ~20/sec
        this.lastSendTime = 0;
        this.sendInterval = 50; // ms
        this.pendingPosition = null;
    }

    pickLabel() {
        const labels = ['🐋','🐠','🦑','🐙','🦐','🐚','🪸','🦈','🐬','🦀','🐡','🪼','🦞','🐢','🦭','🪻'];
        return labels[Math.floor(Math.random() * labels.length)];
    }

    async connect() {
        if (!this.enabled) return;
        try {
            // PartyKit client — loaded via CDN or bundled
            this.room = new PartySocket({
                host: 'johnhanacek.partykit.co', // or whatever the deploy URL is
                room: 'homepage-cursors',
                id: this.myId,
            });

            this.room.addEventListener('message', (event) => {
                this.handleMessage(JSON.parse(event.data));
            });

            this.room.addEventListener('open', () => {
                this.connected = true;
                this.room.send(JSON.stringify({ type: 'join', id: this.myId, label: this.myLabel }));
            });

            this.room.addEventListener('close', () => {
                this.connected = false;
                // Attempt reconnect after 5s
                setTimeout(() => this.connect(), 5000);
            });

            this.room.addEventListener('error', () => {
                this.connected = false;
            });
        } catch (e) {
            // Graceful degradation — site works fine without multiplayer
            console.warn('Multiplayer cursors unavailable:', e.message);
            this.connected = false;
        }
    }

    handleMessage(data) {
        if (data.id === this.myId) return; // Ignore own messages

        switch (data.type) {
            case 'join':
                this.remoteCursors.set(data.id, {
                    x: data.x || 0.5,
                    y: data.y || 0.5,
                    label: data.label,
                    opacity: 0, // Will fade in
                    targetOpacity: 1.0,
                    lastSeen: Date.now(),
                    trail: [],
                    color: this.pickColor(data.id)
                });
                break;

            case 'cursor':
                if (!this.remoteCursors.has(data.id)) {
                    // Joined before we received the join message — create entry
                    this.remoteCursors.set(data.id, {
                        x: data.x, y: data.y,
                        label: '?', opacity: 1.0, targetOpacity: 1.0,
                        lastSeen: Date.now(), trail: [],
                        color: this.pickColor(data.id)
                    });
                }
                const cursor = this.remoteCursors.get(data.id);
                // Add current position to trail before updating
                cursor.trail.push({ x: cursor.x, y: cursor.y, time: Date.now() });
                if (cursor.trail.length > 5) cursor.trail.shift();
                cursor.x = data.x;
                cursor.y = data.y;
                cursor.lastSeen = Date.now();
                cursor.targetOpacity = 1.0;
                break;

            case 'leave':
                const leaving = this.remoteCursors.get(data.id);
                if (leaving) leaving.targetOpacity = 0; // Will fade out then be removed
                break;
        }
    }

    pickColor(id) {
        const colors = ['#7dd8f7', '#4dc9f6', '#d4af37', '#b8dced', '#a8e6cf', '#f0c27f'];
        const index = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
        return colors[index];
    }

    // Called from mousemove/touchmove on the canvas
    updatePosition(clientX, clientY) {
        if (!this.connected) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

        this.pendingPosition = { x, y };

        const now = Date.now();
        if (now - this.lastSendTime >= this.sendInterval) {
            this.room.send(JSON.stringify({
                type: 'cursor',
                id: this.myId,
                x: this.pendingPosition.x,
                y: this.pendingPosition.y
            }));
            this.lastSendTime = now;
            this.pendingPosition = null;
        }
    }

    // Called from the canvas render loop — draws all remote cursors
    render(ctx) {
        if (!this.enabled) return;

        const now = Date.now();
        const canvasW = this.canvas.width;
        const canvasH = this.canvas.height;

        for (const [id, cursor] of this.remoteCursors) {
            // Fade in/out
            const opacitySpeed = 0.03;
            if (cursor.opacity < cursor.targetOpacity) {
                cursor.opacity = Math.min(cursor.opacity + opacitySpeed, cursor.targetOpacity);
            } else if (cursor.opacity > cursor.targetOpacity) {
                cursor.opacity = Math.max(cursor.opacity - opacitySpeed * 0.7, cursor.targetOpacity);
            }

            // Remove fully faded cursors
            if (cursor.targetOpacity === 0 && cursor.opacity <= 0.01) {
                this.remoteCursors.delete(id);
                continue;
            }

            // Idle dimming: 10s no movement → dim to 0.3
            const idleTime = now - cursor.lastSeen;
            if (idleTime > 10000 && cursor.targetOpacity > 0) {
                cursor.targetOpacity = 0.3;
            }

            // Draw trail
            for (let i = 0; i < cursor.trail.length; i++) {
                const t = cursor.trail[i];
                const age = now - t.time;
                if (age > 300) { cursor.trail.splice(i, 1); i--; continue; }
                const trailOpacity = (1 - age / 300) * 0.3 * cursor.opacity;
                ctx.beginPath();
                ctx.arc(t.x * canvasW, t.y * canvasH, 2, 0, Math.PI * 2);
                ctx.fillStyle = cursor.color + Math.round(trailOpacity * 255).toString(16).padStart(2, '0');
                ctx.fill();
            }

            const px = cursor.x * canvasW;
            const py = cursor.y * canvasH;

            // Glow
            ctx.save();
            ctx.globalAlpha = cursor.opacity * 0.3;
            ctx.shadowColor = cursor.color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fillStyle = cursor.color;
            ctx.fill();
            ctx.restore();

            // Dot
            ctx.save();
            ctx.globalAlpha = cursor.opacity;
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = cursor.color;
            ctx.fill();
            ctx.restore();

            // Label
            ctx.save();
            ctx.globalAlpha = cursor.opacity;
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillStyle = cursor.color;
            ctx.textAlign = 'center';
            ctx.fillText(cursor.label, px, py - 14);
            ctx.restore();
        }
    }
}
```

#### B2. Integration into index.html

```html
<!-- In <head> or before </body> -->
<script type="module">
    import { MultiplayerCursors } from './scripts/multiplayer-cursors.js';

    // Initialize after canvas is set up
    const mpCursors = new MultiplayerCursors('heroCanvas');

    // Connect (async, non-blocking)
    mpCursors.connect();

    // Hook into existing mouse tracking
    const heroCanvas = document.getElementById('heroCanvas');

    // The canvas already has mousemove/touchmove listeners for fish interaction.
    // Add cursor position reporting to those existing handlers:
    heroCanvas.addEventListener('mousemove', (e) => {
        mpCursors.updatePosition(e.clientX, e.clientY);
    });
    heroCanvas.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            mpCursors.updatePosition(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    // In the existing canvas render loop (drawFishEntities or equivalent),
    // add the cursor rendering call AFTER fish/entities, BEFORE the debug overlay:
    // mpCursors.render(ctx);
</script>
```

#### B3. Canvas Render Loop Integration

The existing `drawFishEntities()` function in `index.html` has a structured render order. Insert cursor rendering after entities, before debug overlays:

```javascript
// Inside the main animation loop, after all fish/coral/food/bubble rendering:

// ── Remote visitor cursors ──
if (typeof mpCursors !== 'undefined') {
    mpCursors.render(ctx);
}

// ── Debug overlay (existing) ──
if (debugMode) { ... }
```

### TRACK C — Visitor Counter Badge

A small, unobtrusive indicator showing how many visitors are currently on the page.

#### C1. Badge Design

Placed in the bottom-left of the hero canvas, above the debug toggle:

```
┌──────────────┐
│ 🐋 3 here    │
└──────────────┘
```

- Same glass style as the oval HUD (`var(--glass-bg)`, `var(--glass-blur)`)
- Updates when visitors join/leave
- Positioned `bottom: 3.5rem; left: 1rem;` (above the existing `.canvas-controls`)
- Font: `'JetBrains Mono'`, 0.65rem, `var(--text-muted)`

#### C2. Implementation

```javascript
// Inside MultiplayerCursors class:
updateVisitorBadge() {
    let badge = document.getElementById('visitorBadge');
    const count = this.remoteCursors.size + 1; // +1 for self

    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'visitorBadge';
        badge.style.cssText = `
            position: fixed; bottom: 3.5rem; left: 1rem; z-index: 5;
            padding: 0.35rem 0.7rem; border-radius: 1rem;
            background: rgba(2, 10, 18, 0.60);
            backdrop-filter: blur(20px) saturate(1.1);
            border: 1px solid rgba(77, 201, 246, 0.15);
            font: 0.65rem 'JetBrains Mono', monospace;
            color: #7a9aaa; letter-spacing: 0.08em;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(badge);
    }

    if (count > 1) {
        badge.textContent = `${this.myLabel} ${count} here`;
        badge.style.opacity = '1';
    } else {
        badge.style.opacity = '0'; // Hide when alone
    }
}
```

### TRACK D — Settings & Privacy

#### D1. Opt-Out Toggle

Add a small toggle in the `.canvas-controls` area:

```html
<button id="mpToggle" class="canvas-btn" title="Toggle visitor presence" aria-label="Toggle multiplayer cursors">
    👁
</button>
```

- Clicking toggles `mpCursors.enabled`
- When disabled: disconnects WebSocket, removes remote cursors, hides badge
- State persisted in `localStorage('mpEnabled')`
- Default: **enabled** (the feature is opt-out, not opt-in)

#### D2. Privacy Considerations

- No IP addresses stored — PartyKit connections are ephemeral
- No cursor position logging — positions exist only in real-time broadcast
- No cross-session tracking — random ID generated each visit
- PartyKit's Durable Objects are in-memory only (no persistent storage)
- Consider adding a brief note to the site's privacy approach if one exists

---

## Performance Considerations

### Canvas Render Overhead

Current fish canvas already renders ~400 entities per frame. Remote cursors add:

| Metric | Per Remote Cursor | 10 Remote Cursors |
|--------|------------------|-------------------|
| `arc()` calls | 2 (dot + glow) | 20 |
| `fillText()` calls | 1 (label) | 10 |
| Trail dots | 0–5 | 0–50 |
| **Estimated render time** | ~0.03ms | ~0.3ms |
| **At 60fps budget (16.6ms)** | <0.2% | <2% |

**Verdict**: Negligible. Even 20 remote cursors with full trails would use <1ms per frame.

### Network Overhead

| Metric | Value |
|--------|-------|
| Cursor update payload | ~40 bytes JSON |
| Send rate | 20 updates/sec per client |
| Bandwidth per client (send) | ~800 bytes/sec |
| Bandwidth per client (receive, 10 others) | ~8KB/sec |
| PartyKit free tier | 10M messages/month, 100 concurrent |

**Verdict**: Trivial bandwidth. Free tier covers thousands of visitors per month.

### Fallback Performance

If PartyKit is unreachable:
- `connect()` fails silently — `connected` stays `false`
- `updatePosition()` returns immediately — no send attempted
- `render()` draws nothing — empty `remoteCursors` map
- **Zero overhead** when offline — same as current site

---

## Relationship to Existing Features

| Existing Component | Impact from Multiplayer Cursors |
|--------------------|--------------------------------|
| `#heroCanvas` element | No change — cursors render on existing canvas |
| Fish animation loop | Minor: one `mpCursors.render(ctx)` call added |
| Mouse/touch tracking | Add `mpCursors.updatePosition()` call to existing handlers |
| `initCursorSpotlight()` | No conflict — spotlight is DOM-based, cursors are canvas-based |
| `.hero-oval` HUD | No change — cursors render behind oval |
| `.hero-hint` draw tutorial | No change — cursors render behind hint overlay |
| Fish drawing interaction | No conflict — cursor tracking is passive (read-only) |
| Debug mode ('D' key) | Could add: show remote cursor IDs and connection status |
| `SITE_POLISH_PLAN.md` fixed canvas | Compatible — cursors use normalized coords, work at any viewport size |
| `AQUARIUM_GAME_MASTER_PLAN.md` onboarding | Compatible — cursors visible during onboarding adds to the "living aquarium" feel |

---

## Implementation Phases

### Phase 0 — Local Prototype (no server)

Prove the cursor rendering on canvas without any server:

1. Create `scripts/multiplayer-cursors.js` with just the rendering logic
2. Simulate 3–5 fake cursors moving in random walks
3. Verify: cursors render on canvas with proper glow/label/trail
4. Verify: no measurable FPS impact
5. Verify: cursors respect canvas coordinate system (including if `position: fixed`)
6. **Estimated effort**: 2–3 hours
7. **Success criteria**: Smooth cursor rendering with simulated data, <0.5ms render time

### Phase 1 — Server Setup

1. Create `server/` directory with `server.js` (PartyKit room)
2. Create `package.json` with `partykit` dependency
3. Test locally: `npx partykit dev server/server.js`
4. Open 2+ browser tabs, verify cursor sharing
5. **Estimated effort**: 1–2 hours
6. **Success criteria**: Two tabs see each other's cursors

### Phase 2 — Client-Server Integration

1. Add PartySocket client to `multiplayer-cursors.js`
2. Wire `connect()`, `handleMessage()`, `updatePosition()`
3. Add cursor position calls to index.html mouse/touch handlers
4. Add `mpCursors.render(ctx)` to canvas render loop
5. Add visitor badge (Track C)
6. Test with multiple browser tabs and devices
7. **Estimated effort**: 3–4 hours
8. **Success criteria**: Real visitors see each other in real-time

### Phase 3 — Polish

1. Add opt-out toggle (Track D)
2. Add idle dimming and fade animations
3. Test on mobile (touch events, smaller viewport)
4. Test with `prefers-reduced-motion` (disable trails and glow)
5. Add visitor count to debug overlay
6. Performance audit: measure frame time with/without cursors
7. **Estimated effort**: 2–3 hours
8. **Success criteria**: Feels polished, not distracting; accessible; opt-out works

### Phase 4 — Deploy

1. Deploy PartyKit server: `npx partykit deploy`
2. Update `host` URL in `multiplayer-cursors.js` to production endpoint
3. Test on production URL
4. Commit and push index.html changes
5. **Estimated effort**: 1 hour

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `scripts/multiplayer-cursors.js` | Client-side cursor manager (connect, render, badge, toggle) |
| `server/server.js` | PartyKit WebSocket room handler |
| `server/package.json` | PartyKit dependency |

### Modified Files
| File | Changes |
|------|---------|
| `index.html` | Add `<script type="module">` import, wire mouse/touch events to `mpCursors.updatePosition()`, add `mpCursors.render(ctx)` call in canvas loop, add opt-out toggle button |
| `CLAUDE.md` | Add multiplayer cursors to Key Features section, add server/ directory to Shared Resources |

### No Changes
| File | Reason |
|------|--------|
| `styles/shared.css` | Cursor rendering is canvas-based, not CSS |
| `scripts/shared.js` | No shared changes needed; multiplayer is index.html-specific |
| Other pages | Feature is index.html-only for now |

---

## Future Enhancements (Out of Scope)

These ideas are **not** part of this plan but worth noting for later:

1. **Cross-page cursors** — Show cursors on all pages (art.html cosmos, design.html blueprint). Would require each page to connect to the same PartyKit room and have its own canvas integration.
2. **Cursor-fish interaction** — Remote cursors could drop food or scare fish. A "tap" event from a remote visitor spawns food at their cursor position. Requires adding a `{ type: "tap", x, y }` message.
3. **Cursor click ripple** — When a remote visitor clicks, show a ripple on the canvas at their position (reusing the existing ripple effect from art.html).
4. **Named sessions** — Allow visitors to set a display name via a small input. Store in `localStorage`. Optional, not prompted.
5. **Cursor recording/replay** — Record cursor paths and replay them as "ghost" visitors when the site is empty, so it never feels totally deserted.
6. **Spatial audio** — Use Web Audio API to play subtle ambient sounds based on remote cursor positions (splash when near water surface, etc.). See `ART_HERO_ENHANCEMENT_PLAN.md` for audio patterns.

---

## Open Questions

1. **PartyKit vs self-hosted** — Is PartyKit acceptable as an external dependency? If the portfolio needs to run fully offline/self-contained, a Fly.io + custom WebSocket server is the alternative. **Recommendation**: PartyKit for speed of implementation; migrate later if needed.

2. **Scope: index-only or all pages?** — Start with index.html only (where the fish canvas is). The art.html cosmos canvas and design.html blueprint canvas are candidates for future expansion. **Recommendation**: Index-only for v1.

3. **Max visible cursors** — Should we cap the number of rendered remote cursors? If the site gets a traffic spike, 50+ cursors might be cluttered. **Recommendation**: Cap at 15 visible cursors. When more are present, render the 15 most recently active.

4. **Cursor-fish interaction** — Should remote cursors influence fish? (e.g., fish flee from any cursor, not just the local one.) This would be a delightful touch but adds complexity. **Recommendation**: Defer to future enhancement.

5. **Mobile behavior** — On mobile, touch events don't give continuous position (only during active touch). Mobile cursors would appear stationary between touches. **Recommendation**: Accept this limitation; the mobile cursor naturally "leaves" when the user lifts their finger and "returns" on next touch.

6. **Reduced motion** — When `prefers-reduced-motion` is active, should we: (a) disable cursor trails only, (b) disable all cursor animations (instant position), or (c) disable the feature entirely? **Recommendation**: (a) — disable trails and glow, keep the static dot and label.

7. **Label on badge** — The visitor badge currently shows the local user's emoji ("🐋 3 here"). Should it instead show a generic icon? **Recommendation**: Use the local emoji — it personalizes the experience.

---

## Dependency Graph

```
Phase 0 (local prototype) ──→ Phase 1 (server) ──→ Phase 2 (integration) ──→ Phase 3 (polish) ──→ Phase 4 (deploy)
                                                                              │
                                                                              └──→ Visitor badge (Track C)
                                                                              └──→ Opt-out toggle (Track D)

Independent of:
- SEARCH_OVERLAY / SEARCH_ENRICHMENT (different feature area)
- FISH_DESIGN_MERGE (different feature area)
- PLAYGROUND_CLEANUP (different page)
- ART_HERO_ENHANCEMENT (different page)
```

---

## Testing Checklist

- [ ] Phase 0: Simulated cursors render smoothly on canvas
- [ ] Phase 0: No measurable FPS impact with 10 simulated cursors
- [ ] Phase 0: Cursor coordinates map correctly at various viewport sizes
- [ ] Phase 0: `prefers-reduced-motion` disables trails and glow
- [ ] Phase 1: PartyKit server starts locally and accepts connections
- [ ] Phase 1: Two tabs in same browser see each other's cursors
- [ ] Phase 2: Mouse move sends cursor position to server
- [ ] Phase 2: Remote cursor positions render at correct canvas coordinates
- [ ] Phase 2: Touch events on mobile send cursor position
- [ ] Phase 2: Visitor badge shows correct count
- [ ] Phase 2: Cursor fade-in on join, fade-out on leave
- [ ] Phase 2: Idle dimming after 10 seconds of no movement
- [ ] Phase 3: Opt-out toggle works (disconnects, removes cursors, hides badge)
- [ ] Phase 3: `localStorage('mpEnabled')` persists across page reloads
- [ ] Phase 3: Graceful degradation when server is unreachable
- [ ] Phase 3: Fish drawing interaction unaffected by cursor tracking
- [ ] Phase 3: No console errors or warnings
- [ ] Phase 4: Production PartyKit server deployed and accessible
- [ ] Phase 4: Cross-device testing (desktop + mobile on different networks)
