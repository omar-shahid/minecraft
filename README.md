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
  diamond), trees and flowers
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
  - Creative: flying (F), instant breaking, full item palette
  - Survival: health, fall/lava/drowning-free, tool tiers and mining speeds,
    block drops, item pickup, slow regen, death/respawn screen
- **Inventory** (hotbar + 27 slots) with drag & drop, stack splitting,
  shift-quick-move, and a console-style **crafting** list (tools, weapons,
  torches, building blocks; advanced recipes need a nearby crafting table —
  smelting is folded into crafting: ore + coal)
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
| Mouse 2 | Place block / use item / eat / shoot bow |
| E | Inventory & crafting |
| 1-9 / wheel | Select hotbar slot |
| Q | Drop held item |
| Ctrl / Shift | Sprint / sneak |
| F | Toggle flying (creative) |
| F3 | Debug overlay |
| Esc | Pause |

## Tests

The engine core (generation, lighting, meshing, physics, mobs, crafting,
portals) is testable headlessly:

```bash
node test/smoke.mjs
node test/textures.mjs
```

## Known simplifications

- Water/lava are static (no flow simulation); placed fluids can be covered but
  not picked back up
- Iron ore "smelts" via the crafting list instead of a furnace block
- Mobs use box models with procedural colors rather than skinned textures
- The End dimension is not implemented (the Nether is)
