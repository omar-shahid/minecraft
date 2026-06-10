# WebCraft — a Minecraft clone in pure JavaScript + WebGL2

A fully playable, GPU-accelerated voxel game that runs entirely in the browser.
**Zero dependencies, zero binary assets** — every texture, icon, and sound is
generated procedurally at startup.

![](https://img.shields.io/badge/engine-WebGL2-blue) ![](https://img.shields.io/badge/deps-none-green)

## Running

The game uses ES modules, so it needs to be served over HTTP (any static server works):

```bash
npm start                       # python http.server, falls back to npx http-server
# or
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Requires a browser with WebGL2 (any modern
Chrome / Firefox / Edge / Safari).

## Features

### World
- Infinite, procedurally generated terrain (Perlin/fBm noise): plains, forests,
  deserts, mountains, oceans, beaches, caves, lava pools, ores (coal / iron /
  gold / redstone / lapis / emerald / diamond), trees, flowers, tall grass,
  mushrooms, pumpkins and cacti
- **Two dimensions**: the Overworld and the **Nether** (netherrack caverns, lava
  seas, glowstone, soul sand, quartz ore), linked by buildable obsidian portals
  (build a frame with a 2×3 interior, light it with flint & steel; coordinates
  scale 8:1, return portals are auto-built and linked)
- **Day/night cycle** with a moving sun and moon, dusk glow, stars, and
  procedural clouds — sky light is recomputed live in the shader
- Real voxel lighting engine: flood-fill skylight + block light (torches,
  glowstone, lava, portals), smooth per-vertex ambient occlusion
- Multiple persistent worlds saved to `localStorage` (terrain edits, inventory,
  time of day, portals, position)

### Gameplay
- **Creative and Survival modes**
  - Creative: flying (toggle with F or double-tap Space; Space/Shift to fly
    up/down), instant breaking, a full item palette with 60+ blocks, and
    **spawn eggs** for every mob
  - Survival: health, fall/lava/drowning-free, tool tiers and mining speeds,
    block drops, item pickup, slow regen, death/respawn screen
- **Inventory** (hotbar + 27 slots) with drag & drop, stack splitting,
  shift-quick-move, and a console-style **crafting** list available in both
  modes (tools, weapons, torches, building blocks; in survival, advanced
  recipes need a nearby crafting table — smelting is folded into crafting:
  ore + coal). Dropped items render as their actual item sprites.
- **Mobs**: pigs, cows and sheep (wander, flee, drop food); zombies (chase &
  melee, burn in daylight), skeletons (kite you and shoot arrows), **creepers**
  (hiss, flash, explode), spiders (climb walls, neutral in daylight)
- Combat: swords, knockback, a working **bow**; TNT (ignite with flint & steel,
  chain reactions)
- Explosions destroy terrain and damage entities

### Tech
- WebGL2 renderer: chunked meshing (16×128×16), frustum culling, face culling
  via neighbour tests, translucent pass for water/portals, alpha-tested leaves
  and glass, fog, animated procedural sky shader
- Incremental lighting: BFS light addition *and* removal on every block edit
- Texture atlas + all item icons painted to canvas pixel-by-pixel at boot
- Procedural WebAudio sound effects (no audio files)
- Time-budgeted chunk generation/meshing to keep frame times smooth

## Controls

| Key | Action |
|---|---|
| WASD / Space | Move / jump (swim) |
| Mouse 1 | Mine block / attack |
| Mouse 2 | Place block / use item / eat / shoot bow / spawn egg |
| E | Inventory & crafting |
| 1-9 / wheel | Select hotbar slot |
| Q | Drop held item |
| Ctrl | Sprint |
| Shift | Sneak / **fly down** |
| Space | Jump / **fly up** |
| F or double-tap Space | Toggle flying (creative) |
| F3 | Debug overlay |
| Esc | Pause |

## Tests

The engine core (generation, lighting, meshing, physics, mobs, crafting,
portals) is testable headlessly:

```bash
npm install   # jsdom, used only by the integration test
npm test      # engine smoke tests + texture tests + full-game integration test
```

## Known simplifications

- Water/lava are static (no flow simulation); placed fluids can be covered but
  not picked back up
- Iron ore "smelts" via the crafting list instead of a furnace block
- Mobs use box models with procedural colors rather than skinned textures
- The End dimension is not implemented (the Nether is)
