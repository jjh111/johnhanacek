# Art Hero Enhancement Plan

## Overview

Enhance the `art.html` hero canvas with improved interactivity, visual beauty, and an audio component. The goal is a subtle, beautiful cosmic experience that rewards interaction without being cheesy or performance-heavy.

**User Decisions:**
- Sound aesthetic: **B - Harmonic/Musical** (pentatonic scale intervals)
- Performance: **Critical priority** - maintain smooth 60fps
- Shooting stars: **Add-on feature** (implement as optional enhancement)
- Hero height: **Keep current** (100vh)

---

## Current State Analysis

**File**: `art.html` (lines 440-700)

**Existing Features:**
- 400 circular stars with basic sinusoidal twinkle
- Two-layer nebula (golden "milky way" gradient + blue glow)
- Double-ring ripple expansion (gold outer, cyan inner)
- Forest overlay that brightens with clicks
- No audio component

**Performance Profile:**
- 50ms twinkle update interval (good)
- Animation pauses when idle (good)
- ~400 stars rendered each frame

---

## Phase 1: Enhanced Star System

### 1.1 Multi-Layer Stars

Replace single star array with layered system for depth and visual interest:

| Layer | Count | Size | Brightness | Twinkle Speed | Color |
|-------|-------|------|------------|---------------|-------|
| Distant | 200 | 0.3-0.7px | 0.3-0.5 | 0.008-0.015 | Cool blue tint |
| Mid-field | 150 | 0.8-1.4px | 0.5-0.7 | 0.012-0.025 | Warm white |
| Bright | 40 | 1.5-2.5px | 0.7-1.0 | 0.018-0.035 | White with occasional gold/cyan |
| Accent | 10 | 2.0-3.0px | 0.9-1.0 | 0.02-0.04 | Colored (gold, cyan, pale magenta) |

**Implementation:**
```javascript
const STAR_LAYERS = {
    distant: { count: 200, minRadius: 0.3, maxRadius: 0.7, brightness: [0.3, 0.5], twinkleRange: [0.008, 0.015], color: 'cool' },
    mid: { count: 150, minRadius: 0.8, maxRadius: 1.4, brightness: [0.5, 0.7], twinkleRange: [0.012, 0.025], color: 'warm' },
    bright: { count: 40, minRadius: 1.5, maxRadius: 2.5, brightness: [0.7, 1.0], twinkleRange: [0.018, 0.035], color: 'varied' },
    accent: { count: 10, minRadius: 2.0, maxRadius: 3.0, brightness: [0.9, 1.0], twinkleRange: [0.02, 0.04], color: 'special' }
};
```

### 1.2 Star Rendering Optimization

- Sort stars by layer once at initialization
- Use single `fillStyle` per layer where possible
- Limit shadow blur to bright/accent layers only
- Batch similar stars together

### 1.3 Star-Ripple Interaction

When a ripple occurs, stars within radius get temporary brightness boost:

```javascript
function applyRippleToStars(rippleX, rippleY, rippleRadius) {
    const affectedRadius = rippleRadius * 1.5;
    stars.forEach(star => {
        const dist = Math.hypot(star.x - rippleX, star.y - rippleY);
        if (dist < affectedRadius) {
            star.boost = 1.0 - (dist / affectedRadius); // 0 to 1
            star.boostDecay = 0.02; // Decays over ~50 frames
        }
    });
}
```

---

## Phase 2: Enhanced Nebula

### 2.1 Additional Nebula Layers

Add two new gradient layers for depth:

**Purple/Magenta Nebula** (upper-right):
```javascript
const purpleNebula = ctx.createRadialGradient(
    w * 0.75, h * 0.15, 0,
    w * 0.75, h * 0.15, w * 0.4
);
purpleNebula.addColorStop(0, 'rgba(120, 40, 100, 0.12)');
purpleNebula.addColorStop(0.4, 'rgba(80, 20, 80, 0.06)');
purpleNebula.addColorStop(1, 'transparent');
```

**Teal Wisp** (lower-left):
```javascript
const tealWisp = ctx.createRadialGradient(
    w * 0.1, h * 0.85, 0,
    w * 0.1, h * 0.85, w * 0.35
);
tealWisp.addColorStop(0, 'rgba(20, 80, 90, 0.1)');
tealWisp.addColorStop(0.5, 'rgba(10, 60, 70, 0.05)');
tealWisp.addColorStop(1, 'transparent');
```

### 2.2 Subtle Animation

Very slow drift (imperceptible at glance, noticeable over time):

```javascript
// In drawBackground()
const time = Date.now() * 0.00005; // Very slow
// Offset nebula centers by ±2px over 60 seconds
const driftX = Math.sin(time) * 2;
const driftY = Math.cos(time * 0.7) * 2;
```

**Performance Note**: Only update time once per frame, use for all nebula calculations.

---

## Phase 3: Sound Component (Web Audio API)

### 3.1 Activation Model

**User-initiated only** (required for mobile compatibility):

- Show speaker icon in hint area (muted initially)
- First click/tap creates AudioContext and enables sound
- State persists for session

```javascript
let audioContext = null;
let audioEnabled = false;

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioEnabled = true;
        updateAudioIcon();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}
```

### 3.2 Harmonic/Musical Sound Design

**Pentatonic scale** (pleasing, no dissonance):

| Note | Frequency (Hz) | Position X |
|------|---------------|------------|
| C4 | 261.63 | 0% (left edge) |
| D4 | 293.66 | 20% |
| E4 | 329.63 | 40% |
| G4 | 392.00 | 60% |
| A4 | 440.00 | 80% |
| C5 | 523.25 | 100% (right edge) |

**Y-axis variation**:
- Top of canvas → Add harmonic (octave above)
- Bottom of canvas → Sub-bass undertone

### 3.3 Sound Implementation

```javascript
function playClickSound(x, y, canvasWidth, canvasHeight) {
    if (!audioEnabled || !audioContext) return;
    
    // Limit simultaneous sounds for performance
    if (activeOscillators.length >= 5) return;
    
    const noteIndex = Math.floor((x / canvasWidth) * 5);
    const frequencies = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const baseFreq = frequencies[Math.min(noteIndex, 5)];
    
    // Y position affects harmonic content
    const yRatio = y / canvasHeight;
    const addHarmonic = yRatio < 0.3; // Top third gets octave
    const addSubBass = yRatio > 0.7; // Bottom third gets sub
    
    createTone(baseFreq, addHarmonic, addSubBass);
}

function createTone(freq, withHarmonic, withSubBass) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    
    // Smooth envelope
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2.5);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + 2.5);
}
```

### 3.4 UI Indicator

Add speaker icon to hint area:

```html
<div class="hero-hint">
    <span class="hint-icon">&#10024;</span>
    <span class="hint-text">click</span>
    <span class="audio-icon" id="audioIcon">&#128263;</span> <!-- Muted speaker -->
</div>
```

```javascript
function updateAudioIcon() {
    const icon = document.getElementById('audioIcon');
    icon.innerHTML = audioEnabled ? '&#128266;' : '&#128263;'; // Speaker on / muted
}
```

---

## Phase 4: Improved Ripple Effect

### 4.1 Multi-Ring Burst

Replace single ring with staggered concentric rings:

```javascript
function createRipple(x, y) {
    const ringCount = 4;
    for (let i = 0; i < ringCount; i++) {
        setTimeout(() => {
            expansions.push({
                x: x,
                y: y,
                radius: 5,
                opacity: 1 - (i * 0.15), // Outer rings slightly dimmer
                delay: i * 0.1,
                lineWidth: 2 - (i * 0.3)
            });
        }, i * 50); // 50ms stagger
    }
}
```

### 4.2 Position-Based Color

```javascript
function getRippleColor(x, y, canvasWidth, canvasHeight) {
    // Check proximity to nebula centers
    const nearGoldNebula = Math.hypot(x - canvasWidth * 0.15, y - canvasHeight * 0.1) < canvasWidth * 0.3;
    const nearPurpleNebula = Math.hypot(x - canvasWidth * 0.75, y - canvasHeight * 0.15) < canvasWidth * 0.3;
    
    if (nearGoldNebula) {
        return { outer: 'rgba(212, 175, 55, 0.8)', inner: 'rgba(255, 200, 100, 0.5)' };
    } else if (nearPurpleNebula) {
        return { outer: 'rgba(180, 100, 200, 0.7)', inner: 'rgba(220, 150, 255, 0.4)' };
    } else {
        return { outer: 'rgba(77, 201, 246, 0.6)', inner: 'rgba(100, 220, 255, 0.4)' };
    }
}
```

### 4.3 Performance Optimization

- Limit total expansions to 20 (oldest removed when exceeded)
- Use object pooling for ripple objects
- Skip shadow blur on mobile devices

---

## Phase 5: Interaction Reward System

### 5.1 Intensity Meter (Hidden State)

```javascript
let intensity = 0;
const MAX_INTENSITY = 50;

function incrementIntensity() {
    intensity = Math.min(MAX_INTENSITY, intensity + 1);
    scheduleDecay();
}

function scheduleDecay() {
    clearTimeout(decayTimer);
    decayTimer = setTimeout(() => {
        if (intensity > 0) {
            intensity = Math.max(0, intensity - 1);
            scheduleDecay();
        }
    }, 30000); // Decay 1 point every 30 seconds
}
```

### 5.2 Effects of Intensity

| Intensity | Effect |
|-----------|--------|
| 0-10 | Baseline |
| 10-20 | +10% twinkle speed |
| 20-30 | +20% twinkle speed, +5% ripple radius |
| 30-40 | +30% twinkle speed, +10% ripple radius, +2% nebula saturation |
| 40-50 | +50% twinkle speed, +15% ripple radius, +5% nebula saturation |

**Implementation:**
```javascript
function getTwinkleMultiplier() {
    return 1 + (intensity / 100); // Max 1.5x at intensity 50
}

function getRippleRadiusMultiplier() {
    return 1 + (intensity * 0.003); // Max 1.15x at intensity 50
}
```

---

## Phase 6: Add-On Features (Optional)

### 6.1 Shooting Stars

**Trigger**: Random, max 1 per 10 seconds, only when user has interacted

```javascript
let shootingStars = [];
let lastShootingStar = 0;
const SHOOTING_STAR_INTERVAL = 10000; // 10 seconds minimum

function maybeCreateShootingStar(timestamp) {
    if (intensity < 10) return; // Requires some interaction
    if (timestamp - lastShootingStar < SHOOTING_STAR_INTERVAL) return;
    if (Math.random() > 0.02) return; // 2% chance per frame when eligible
    
    lastShootingStar = timestamp;
    shootingStars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.3, // Top third only
        length: 80 + Math.random() * 120,
        speed: 8 + Math.random() * 4,
        angle: Math.PI / 4 + Math.random() * 0.3,
        life: 1.0,
        decay: 0.02
    });
}

function drawShootingStars() {
    shootingStars = shootingStars.filter(ss => {
        ss.x += Math.cos(ss.angle) * ss.speed;
        ss.y += Math.sin(ss.angle) * ss.speed;
        ss.life -= ss.decay;
        
        if (ss.life <= 0) return false;
        
        const gradient = ctx.createLinearGradient(
            ss.x, ss.y,
            ss.x - Math.cos(ss.angle) * ss.length,
            ss.y - Math.sin(ss.angle) * ss.length
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${ss.life})`);
        gradient.addColorStop(1, 'transparent');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(
            ss.x - Math.cos(ss.angle) * ss.length,
            ss.y - Math.sin(ss.angle) * ss.length
        );
        ctx.stroke();
        
        return true;
    });
}
```

---

## Implementation Order

| Phase | Priority | Complexity | Impact |
|-------|----------|------------|--------|
| 1: Enhanced Stars | High | Medium | Visual foundation |
| 2: Enhanced Nebula | High | Low | Depth and atmosphere |
| 3: Sound Component | Medium | Medium | Unique differentiator |
| 4: Improved Ripples | High | Low | Interaction satisfaction |
| 5: Reward System | Medium | Low | Engagement incentive |
| 6: Shooting Stars | Low | Low | Delight surprise |

**Recommended sequence**: 1 → 2 → 4 → 5 → 3 → 6

---

## Performance Guidelines

1. **Maintain 60fps target** - Test on mid-range mobile device
2. **Limit active elements**:
   - Max 400 stars (current)
   - Max 20 ripples
   - Max 5 audio oscillators
   - Max 1 shooting star
3. **Use requestAnimationFrame** - Already implemented
4. **Throttle updates**:
   - Twinkle: 50ms interval (current)
   - Nebula drift: 1 update per frame
   - Intensity decay: 30s interval
5. **Mobile detection**: Reduce particle counts on low-DPI screens

---

## Testing Checklist

- [ ] Chrome desktop (60fps)
- [ ] Safari desktop (audio autoplay policy)
- [ ] Firefox desktop
- [ ] iOS Safari (touch events, audio activation)
- [ ] Android Chrome (touch events, audio activation)
- [ ] Reduced motion preference (disable animations)
- [ ] Low-end device performance

---

## File Changes Summary

**`art.html`**
- CSS: Add audio icon styles, nebula animation keyframes
- HTML: Add audio icon to hero-hint
- JS: Complete rewrite of canvas logic (stars, nebula, ripples, audio)

**No new assets required** - All procedural generation
