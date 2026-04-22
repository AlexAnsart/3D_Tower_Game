# Kingdom Defense - 3D Physics Tower Defense

A beautiful, natural-styled 3D Tower Defense game built with Three.js and a custom physics engine.

## How to Run

This game uses ES6 modules and Three.js from a CDN, so you need to serve it via a local HTTP server. Opening `index.html` directly in a browser will NOT work due to CORS restrictions.

### Option 1: npx serve (Recommended)
```bash
npx serve .
# Then open http://localhost:3000
```

### Option 2: Python
```bash
# Python 3
python -m http.server 8080
# Then open http://localhost:8080

# Python 2
python -m SimpleHTTPServer 8080
```

### Option 3: Node.js http-server
```bash
npx http-server -p 8080
# Then open http://localhost:8080
```

### Option 4: PHP
```bash
php -S localhost:8080
```

## Controls

| Action | Control |
|--------|---------|
| Rotate Camera | Left Click + Drag |
| Zoom | Scroll Wheel |
| Pan | Right Click + Drag |
| Move Forward | Z or Up Arrow |
| Move Backward | S or Down Arrow |
| Move Left | Q or Left Arrow |
| Move Right | D or Right Arrow |
| Move Camera Up | Up Arrow |
| Move Camera Down | Down Arrow |
| Place Tower | Click stone platform |
| Select Tower Type | Click tower button |
| Toggle Debug | F3 |
| Start Next Wave | Space |

## Tower Types

| Tower | Cost | Range | Damage | Special |
|-------|------|-------|--------|---------|
| Archer | 50 | 12 | 25 | Rapid fire arrows |
| Cannon | 120 | 16 | 80 | Arcing cannonballs |
| Mage | 200 | 28 | 200 | Piercing magic bolts |

## Enemy Types

| Enemy | HP | Speed | Reward |
|-------|-----|-------|--------|
| Goblin | 100 | 3 | 10 |
| Wolf | 60 | 5 | 15 |
| Knight | 300 | 1.5 | 25 |
| Dragon | 1000 | 1 | 100 |

## Features

- **Detailed 3D Models**: Goblin with club, Wolf with tail, Knight with shield/sword, Dragon with wings
- **Natural Environment**: Green grass, dirt road, trees, rocks, flowers, pond, clouds
- **Custom Physics**: Continuous collision detection, no clipping
- **Self-Testing**: Automatic physics validation on startup
- **Keyboard Navigation**: ZQSD + Arrow keys for camera movement

## Browser Compatibility
Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

Requires WebGL 2.0 support.
