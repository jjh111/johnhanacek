# 3D Multi-Viewport Synchronization System

An interactive 3D visualization with three synchronized viewports that can spotlight, follow, or breakout independently.

## Features

- **Three Independent Viewports**: Each with its own camera and controls
- **Spotlight Mode**: One viewport broadcasts its view to others
- **Follow Mode**: Subscribe to another viewport's camera movements
- **Breakout**: Escape synchronization to regain independent control
- **Real-time Synchronization**: Smooth camera state propagation
- **Visual Feedback**: Border highlights, labels, and icons indicate states
- **Orbit + Pan + Zoom**: Full camera controls on each viewport

## Usage

1. Open `index.html` in a web browser (or use a local server)
2. Use the buttons on each viewport:
   - **Spotlight**: Make this viewport broadcast to others
   - **Follow...**: Choose another viewport to follow
   - **Breakout**: Regain independent control

## States

| State | Visual | Description |
|-------|--------|-------------|
| Spotlighter | Yellow border, 🎯 icon | Broadcasts camera to all others |
| Following | Blue border, 👁️ icon, "FOLLOWING X" label | Subscribes to another viewport |
| Independent | Gray border | Free control, not synchronized |

## Tech Stack

- Three.js (3D rendering)
- Vanilla JavaScript (no frameworks)
- HTML5/CSS3 (UI and layout)

## File Structure

```
3d-sync-viewer/
├── index.html          # Main HTML page
├── css/
│   └── styles.css      # Styling and layout
├── js/
│   ├── main.js         # Application initialization
│   ├── viewport.js     # Viewport class (camera, controls, scene)
│   ├── sync-manager.js # Spotlight/follow logic
│   └── model-loader.js # GLTF loading with fallback
└── models/
    └── molecule.gltf   # 3D model (optional, has fallback)
```

## Development

To run locally:
```bash
cd 3d-sync-viewer
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser.

## Custom Models

Replace or add GLTF/OBJ files in the `models/` directory. The system will use a procedural fallback if loading fails.