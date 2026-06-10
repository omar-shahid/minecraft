// Node smoke test for the DOM-free engine core.
import { World, H } from '../src/world.js';
import { B, I, RECIPES } from '../src/blocks.js';
import { meshChunk } from '../src/mesher.js';
import { Inventory, craftableRecipes, craft } from '../src/inventory.js';
import { Player } from '../src/player.js';
import { moveEntity } from '../src/physics.js';
import { makeMob, updateEntity, trySpawn } from '../src/mobs.js';
import { mulberry32 } from '../src/math.js';

let failures = 0;
function check(name, cond) {
  if (cond) console.log('  ok', name);
  else { console.error('  FAIL', name); failures++; }
}

// ---- overworld generation + lighting ----
const w = new World(1337, 'over');
const t0 = Date.now();
for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w.ensureChunk(cx, cz);
console.log('generated 9 chunks in', Date.now() - t0, 'ms');

let surf = w.highestSolid(8, 8);
check('surface height sane', surf > 3 && surf < H - 5);
check('surface block solid', w.isSolid(8, surf, 8));
check('air above surface', !w.isSolid(8, surf + 1, 8));
check('bedrock at 0', w.getBlock(8, 0, 8) === B.BEDROCK);
check('sky light above surface = 15', w.getSky(8, surf + 2, 8) === 15);
check('no light deep underground', w.getSky(8, 3, 8) <= 4);

// ---- meshing ----
const mt0 = Date.now();
const mesh = meshChunk(w, 0, 0);
console.log('meshed chunk in', Date.now() - mt0, 'ms;',
  mesh.opaque.length / 8, 'opaque verts,', mesh.trans.length / 8, 'trans verts');
check('opaque mesh non-empty', mesh.opaque.length > 0);
check('vertex count multiple of 6', (mesh.opaque.length / 8) % 6 === 0);

// ---- editing + incremental light ----
w.setBlock(8, surf + 1, 8, B.GLOWSTONE);
check('placed glowstone', w.getBlock(8, surf + 1, 8) === B.GLOWSTONE);
check('glowstone emits', w.getBlockLight(8, surf + 2, 8) === 14);
w.setBlock(8, surf + 1, 8, B.AIR);
check('removed glowstone light', w.getBlockLight(8, surf + 2, 8) === 0);

// dig a hole and verify sky column updates
w.setBlock(10, surf, 10, B.AIR);
check('sky light flows into dug hole', w.getSky(10, surf, 10) > 0);

// place a torch underground and check light spreads
const caveY = 20;
w.setBlock(5, caveY, 5, B.AIR, false);
w.setBlock(5, caveY + 1, 5, B.AIR, false);
w.setBlock(5, caveY, 5, B.TORCH);
check('torch light', w.getBlockLight(5, caveY, 5) === 14);
check('torch light spreads up', w.getBlockLight(5, caveY + 1, 5) === 13);

// ---- raycast ----
const hit = w.raycast(8.5, surf + 3, 8.5, 0, -1, 0, 10);
check('raycast hits ground', hit && hit.y === surf);
check('raycast prev cell above', hit && hit.py === surf + 1);

// ---- explosion ----
const before = w.getBlock(8, surf, 8);
check('block before explosion', before !== B.AIR);
const destroyed = w.explode(8.5, surf + 0.5, 8.5, 3);
check('explosion destroyed blocks', destroyed.length > 5);
check('explosion cleared center', w.getBlock(8, surf, 8) === B.AIR);

// ---- portal ----
// build a frame manually at a clear area
const px = 4, pz = 4, py = surf + 10;
for (let i = -1; i <= 2; i++) {
  w.setBlock(px + i, py - 1, pz, B.OBSIDIAN);
  w.setBlock(px + i, py + 3, pz, B.OBSIDIAN);
}
for (let j = 0; j < 3; j++) {
  w.setBlock(px - 1, py + j, pz, B.OBSIDIAN);
  w.setBlock(px + 2, py + j, pz, B.OBSIDIAN);
}
for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) w.setBlock(px + i, py + j, pz, B.AIR);
check('ignite portal', w.ignitePortal(px, py + 1, pz) === true);
check('portal blocks placed', w.getBlock(px, py, pz) === B.PORTAL && w.getBlock(px + 1, py + 2, pz) === B.PORTAL);
check('portal registered', w.nearestPortal(px, pz, 10) !== null);

// frame with vegetation inside must still light (regression: tall grass blocked ignition)
const gx = 12, gz = 12, gy = surf + 10;
for (let i = -1; i <= 2; i++) {
  w.setBlock(gx + i, gy - 1, gz, B.OBSIDIAN);
  w.setBlock(gx + i, gy + 3, gz, B.OBSIDIAN);
}
for (let j = 0; j < 3; j++) {
  w.setBlock(gx - 1, gy + j, gz, B.OBSIDIAN);
  w.setBlock(gx + 2, gy + j, gz, B.OBSIDIAN);
}
for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) w.setBlock(gx + i, gy + j, gz, B.AIR);
w.setBlock(gx, gy, gz, B.TALL_GRASS);
w.setBlock(gx + 1, gy + 1, gz, B.FLOWER_RED);
check('ignite portal with plants inside frame', w.ignitePortal(gx, gy + 2, gz) === true);
check('plants replaced by portal', w.getBlock(gx, gy, gz) === B.PORTAL);

// torch mesh maps only the 2px stick strip (regression: skewed full-tile sides)
{
  const ty = surf + 20;
  w.setBlock(2, ty, 2, B.TORCH, false);
  const tm = meshChunk(w, 0, 0);
  let minU = Infinity, maxU = -Infinity;
  const torchVerts = [];
  for (let i = 0; i < tm.opaque.length; i += 8) {
    if (Math.abs(tm.opaque[i + 1] - ty) <= 1 &&
        Math.floor(tm.opaque[i]) === 2 && Math.floor(tm.opaque[i + 2]) === 2) {
      minU = Math.min(minU, tm.opaque[i + 3]);
      maxU = Math.max(maxU, tm.opaque[i + 3]);
      torchVerts.push(i);
    }
  }
  check('torch mesh exists', torchVerts.length >= 30);
  check('torch uv spans the narrow stick strip, not the full tile',
    maxU - minU < (2.2 / 16) / 16);
  w.setBlock(2, ty, 2, B.AIR, false);
}

// ---- nether ----
const n = new World(1337 ^ 0x6e657468, 'nether');
n.ensureChunk(0, 0);
let lavaFound = false, rackFound = false, glowFound = false;
for (let y = 0; y < H; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
  const b = n.getBlock(x, y, z);
  if (b === B.LAVA) lavaFound = true;
  if (b === B.NETHERRACK) rackFound = true;
  if (b === B.GLOWSTONE) glowFound = true;
}
check('nether has lava', lavaFound);
check('nether has netherrack', rackFound);
check('nether has glowstone', glowFound);
check('nether bedrock ceiling', n.getBlock(5, H - 1, 5) === B.BEDROCK);
const np = n.buildPortal(4, 4);
check('nether buildPortal', n.getBlock(np.x, np.y, np.z) === B.PORTAL);
const nm = meshChunk(n, 0, 0);
check('nether mesh non-empty', nm.opaque.length > 0);

// ---- physics ----
const ent = { pos: [8.5, surf + 6, 8.5], vel: [0, -5, 0], w: 0.3, h: 1.8 };
for (let i = 0; i < 200; i++) { ent.vel[1] -= 0.5; moveEntity(w, ent, 1 / 60); if (ent.onGround) break; }
check('entity lands on ground', ent.onGround);

// ---- player ----
const pl = new Player('survival');
pl.pos = [8.5, surf + 5, 8.5];
const input = new Set();
for (let i = 0; i < 300; i++) pl.update(w, input, 1 / 60, null);
check('player lands', pl.onGround);
check('player alive after small fall', !pl.dead);
check('break time uses tool', pl.breakTime(B.STONE, I.DIAMOND_PICK) < pl.breakTime(B.STONE, null));
check('cannot harvest diamond without iron pick', !pl.canHarvest(B.DIAMOND_ORE, I.STONE_PICK));
check('can harvest diamond with iron pick', pl.canHarvest(B.DIAMOND_ORE, I.IRON_PICK));

// ---- mobs ----
const mob = makeMob('zombie', 12.5, surf + 4, 12.5);
const ctx = {
  player: pl, dayFactor: 0,
  damagePlayer: () => {}, explode: () => {}, shootArrow: () => {},
  sound: () => {}, dropItem: () => {},
};
for (let i = 0; i < 300; i++) updateEntity(mob, w, 1 / 60, ctx);
check('zombie alive and grounded', !mob.dead && mob.onGround);

const ents = [];
trySpawn(w, pl, ents, 0, mulberry32(7));
console.log('  spawned', ents.length, 'mobs (probabilistic)');

// ---- inventory / crafting ----
const inv = new Inventory();
inv.add(B.LOG, 3);
const list = craftableRecipes(inv, false);
const plankR = list.find(r => r.recipe.out === B.PLANKS);
check('plank recipe available', plankR && plankR.ok);
craft(inv, plankR.recipe);
check('crafted 4 planks', inv.count(B.PLANKS) === 4);
check('log consumed', inv.count(B.LOG) === 2);
const pickR = list.find(r => r.recipe.out === I.WOOD_PICK);
check('pick needs table', pickR && !pickR.ok);
inv.add(B.PLANKS, 64 + 30);
check('stacking caps at 64', inv.slots.filter(s => s && s.id === B.PLANKS).every(s => s.count <= 64));
const ser = inv.serialize();
const inv2 = Inventory.deserialize(ser);
check('inventory roundtrip', inv2.count(B.PLANKS) === inv.count(B.PLANKS));

// ---- recipes valid ----
check('all recipe outputs known', RECIPES.every(r => r.out !== undefined));

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
