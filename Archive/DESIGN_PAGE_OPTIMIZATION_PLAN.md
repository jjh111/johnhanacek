# Design Page Optimization Plan

## Asset Changes Noted

### New/Modified Files in `/Assets/`
- Created `DemosPlayground/` folder:
  - `black-hole-gothic.html`
  - `sna-drawing-demo.html`
- Added: `AvatarMEDIC -Clinic-concept.mp4`

### Unused Assets (Available for Integration)
| File | Suggested Use |
|------|---------------|
| `Aerospace Award.glb` | Replace Sketchfab iframe in Awards section |
| `BlackBox-Model.glb` | Replace Sketchfab iframe in Awards section |
| `Avatarmedic-Holotriageclip-1.mp4` | Replace YouTube iframe in AvatarMEDIC section |
| `AvatarMEDIC -Clinic-concept.mp4` | Add to AvatarMEDIC section |
| `Scaffold_3_2022-08-18_00.37.12.gltf` | Use in Nanome2 3D viewer |
| `3d-sync-demo/` | Reference for Three.js integration |
| `jjh-20250323-95 flower headshot Large.jpeg` | Use on about page |

---

## Proposed Improvements

### 1. New Nanome2 Case Study Page

**Approach**: Create new HTML page using about.html as template

**File**: `nanome2.html` (new)

**Template Base**: Copy from `about.html`
- Same navigation structure
- Same styling/script includes
- Use `.page-header` hero style

**Content Structure**:
```html
<header class="page-header">
  <h1>Nanome 2 Redesign</h1>
</header>

<main>
  <!-- Case Study Content converted from MD -->
  <section id="overview">
    <!-- Challenge, Goal, Role sections -->
  </section>
  
  <!-- Process sections with images -->
  <section id="discovery">...</section>
  <section id="concept">...</section>
  <section id="prototyping">...</section>
  
  <!-- Inline 3D Viewer -->
  <section id="demo">
    <h2>Interactive 3D Demo</h2>
    <div class="model-viewer-container">
      <!-- Three.js canvas with Scaffold model -->
    </div>
  </section>
  
  <!-- Videos -->
  <section id="videos">
    <!-- YouTube embeds from lines 73-75 of MD -->
  </section>
</main>
```

**3D Viewer Implementation**:
- Use Three.js code from `Assets/3d-sync-demo/`
- Load `Scaffold_3_2022-08-18_00.3712.gltf` model
- Implement spotlight/follow controls (Nanome feature)
- Include orbit controls for user interaction

---

### 2. AvatarMEDIC Section Updates (design.html)

**Current State**: YouTube iframes

**Proposed Change**: Replace with local `<video>` elements

**Line ~530-565 in design.html**:
```html
<!-- Replace YouTube iframes with: -->
<video controls playsinline>
  <source src="./Assets/Avatarmedic-Holotriageclip-1.mp4" type="video/mp4">
</video>
```

**Videos to swap**:
| Current | Replace With |
|---------|-------------|
| `youtube.com/embed/FtbAL-kmIJs` (HoloTRIAGE) | `./Assets/Avatarmedic-Holotriageclip-1.mp4` |
| `youtube.com/embed/gz5KL8uXK2A` (Robot Digital Twin) | `./Assets/AvatarMEDIC -Clinic-concept.mp4` |

---

### 3. Awards Section 3D Viewers (design.html)

**Current State**: Sketchfab iframes (lines 578, 590)

**Proposed Change**: Use `<model-viewer>` web component

**Implementation**:
```html
<!-- Add to <head> -->
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js"></script>

<!-- Replace Sketchfab iframes with: -->
<model-viewer 
  src="./Assets/Aerospace Award.glb" 
  alt="Aerospace Innovation Award 3D model"
  auto-rotate 
  camera-controls
  ar
  style="width: 100%; height: 400px;">
</model-viewer>
```

**Files**:
| Replace | With |
|---------|------|
| Sketchfab (line 578) | `./Assets/Aerospace Award.glb` |
| Sketchfab (line 590) | `./Assets/BlackBox-Model.glb` |

---

### 4. Canvas Controls Responsiveness (design.html)

**Issue**: Fixed positioning breaks on mobile

**Current** (lines 198-206):
```css
.canvas-controls {
  position: absolute;
  bottom: 5rem;
  left: 5rem;
}
```

**Proposed**:
```css
.canvas-controls {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
}

@media (min-width: 768px) {
  .canvas-controls {
    bottom: 5rem;
    left: 5rem;
    transform: none;
  }
}
```

---

## Implementation Order

1. **Quick wins** (no new files):
   - Canvas controls CSS fix
   - AvatarMEDIC video replacements
   - Awards 3D viewer replacements

2. **Medium effort**:
   - Create `nanome2.html` page

3. **Future** (playground reference):
   - Integrate 3d-sync-demo as interactive project
   - Link black-hole-gothic.html as creative demo
