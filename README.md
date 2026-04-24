# Kingdom Defense - 3D Tower Defense

3D tower defense built with Three.js and a custom physics engine.

## Run Locally

Serve the project with a local HTTP server (do not open `index.html` directly).

```bash
npx serve .
# open http://localhost:3000
```

Alternative:

```bash
python -m http.server 8080
# open http://localhost:8080
```

## AI Agent (Kimi)

The game can run an assistant AI that places towers when enabled in `src/settings.js`.

1. Start the AI proxy:

```bash
cd server
npm install
copy .env.example .env
```

1. Open `server/.env` and set:

```bash
KIMI_API_KEY=fw_your_real_key
KIMI_MODEL=kimi-k2p6
PORT=8787
```

1. Run the proxy:

```bash
npm start
```

1. Start the game as usual (`npx serve .`), then configure AI in `src/settings.js`:

   - `ai.enabled`
   - `ai.minGoldToAct`
   - `ai.decisionIntervalMs`

Important: keep `KIMI_API_KEY` only in `server/.env` (never in frontend files).

## Core Gameplay

- Towers: `Archer`, `Cannon`, `Mortar`, `Mage`
- Tower levels: `1` to `10` (cost, size, range, damage, cooldown scale by level)
- Tower deletion: select a placed tower, then delete with the UI button or `Delete`/`Backspace`
- Waves scale over time (HP + speed multipliers)
- Global visual scaling and gameplay tuning are centralized in settings

## Controls

| Action | Control |
| --- | --- |
| Rotate camera | Left click + drag |
| Zoom | Mouse wheel |
| Pan | Right click + drag |
| Move camera | `ZQSD` |
| Move camera up/down | `Up` / `Down` |
| Place tower | Left click on valid terrain |
| Select tower type | Tower card in bottom panel |
| Select tower level | Level dropdown on each tower card |
| Delete selected tower | Delete button or `Delete`/`Backspace` |
| Start wave (when idle) | `Space` |
| Toggle debug panel | `F3` |

## Configuration

All important tuning values are in:

- `src/settings.js`

This includes:

- economy (starting gold/lives, refund ratio, wave rewards)
- world scale
- enemy base stats
- wave multipliers
- tower base stats + level scaling
- projectile behavior
- VFX budgets
- audio setup and optional asset filenames

## Optional Assets (Models + Sounds)

External assets are optional. If files are missing, the game falls back automatically (no crash).

### Optional enemy models (GLB)

Put files in:

- `assets/models/enemies`

Expected filenames:

- `basic.glb`
- `fast.glb`
- `tank.glb`
- `boss.glb`

### Optional sounds

Put files in:

- `assets/audio`

Expected filenames:

- `cannon_shot.ogg`
- `mortar_shot.ogg`
- `mage_fire.ogg`
- `boss_death.ogg`
- `impact_heavy.ogg`

If not found, `AudioManager` uses procedural WebAudio fallback.

## Project Structure (Important Files)

- `src/Game.js` - main game loop, wave flow, input, UI sync
- `src/Tower.js` - tower behavior, targeting, firing, placement animation
- `src/Enemy.js` - enemy logic and optional model loading fallback
- `src/Projectile.js` - projectile movement, collisions, AOE effects
- `src/ParticleSystem.js` - impacts, explosions, screen shake
- `src/audio/AudioManager.js` - sound routing (file + procedural fallback)
- `src/assets/ModelFactory.js` - optional GLB loading helpers
- `src/settings.js` - central configuration
- `src/ai/AgentController.js` - AI decision trigger and validated tower placement
- `server/src/index.js` - secure proxy endpoint for Kimi calls

## Notes

- Requires WebGL2-capable browser.
- Recommended modern browsers: Chrome, Edge, Firefox, Safari (recent versions).
