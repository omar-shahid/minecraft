// Block, item and recipe registry. Pure data — no DOM access, so it can be
// unit-tested in Node. Texture tiles are referenced by name; textures.js paints
// them onto the atlas in the order of the TILES array.

export const TILES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobble', 'planks', 'log_side', 'log_top',
  'leaves', 'sand', 'gravel', 'water', 'lava', 'bedrock', 'coal_ore', 'iron_ore',
  'diamond_ore', 'glass', 'glowstone', 'netherrack', 'soul_sand', 'quartz_ore', 'obsidian',
  'portal', 'crafting_top', 'crafting_side', 'sandstone', 'bricks', 'stonebrick', 'wool',
  'tnt_side', 'tnt_top', 'torch', 'flower_red', 'flower_yellow', 'snow',
];
export const TILE = {};
TILES.forEach((n, i) => TILE[n] = i);

// Tool tier speed multipliers: hand, wood, stone, iron, diamond
export const TIER_SPEED = [1, 2, 4, 6, 8];

export const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4, PLANKS: 5, LOG: 6, LEAVES: 7,
  SAND: 8, WATER: 9, BEDROCK: 10, COAL_ORE: 11, IRON_ORE: 12, DIAMOND_ORE: 13,
  GLASS: 14, TORCH: 15, CRAFTING: 16, OBSIDIAN: 17, NETHERRACK: 18, SOUL_SAND: 19,
  GLOWSTONE: 20, QUARTZ_ORE: 21, PORTAL: 22, LAVA: 23, GRAVEL: 24, SANDSTONE: 25,
  BRICKS: 26, STONEBRICK: 27, WOOL: 28, TNT: 29, FLOWER_RED: 30, FLOWER_YELLOW: 31,
};

// def fields:
//  name, tiles {all} or {top,bottom,side}, opaque (blocks light & hides neighbour
//  faces), solid (collision), liquid, cutout (alpha-tested), translucent (blend pass),
//  emit (0-15 light), filter (extra light attenuation for transparent blocks),
//  hardness (sec by hand), tool ('pickaxe'|'shovel'|'axe'), minTier (required for drop),
//  drops (item id, or null = self, or [] = nothing, or [{id,count,chance}]),
//  model ('cube'|'cross'|'torch'), damage (contact dps)
const D = {};
function def(id, name, tiles, opts = {}) {
  D[id] = Object.assign({
    id, name, tiles,
    opaque: true, solid: true, liquid: false, cutout: false, translucent: false,
    emit: 0, filter: 0, hardness: 1, tool: null, minTier: 0,
    drops: null, model: 'cube', damage: 0, placeable: true,
  }, opts);
}

def(B.AIR, 'Air', null, { opaque: false, solid: false, placeable: false });
def(B.STONE, 'Stone', { all: 'stone' }, { hardness: 1.5, tool: 'pickaxe', drops: B.COBBLE });
def(B.GRASS, 'Grass Block', { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
  { hardness: 0.6, tool: 'shovel', drops: B.DIRT });
def(B.DIRT, 'Dirt', { all: 'dirt' }, { hardness: 0.5, tool: 'shovel' });
def(B.COBBLE, 'Cobblestone', { all: 'cobble' }, { hardness: 2, tool: 'pickaxe' });
def(B.PLANKS, 'Oak Planks', { all: 'planks' }, { hardness: 2, tool: 'axe' });
def(B.LOG, 'Oak Log', { top: 'log_top', bottom: 'log_top', side: 'log_side' },
  { hardness: 2, tool: 'axe' });
def(B.LEAVES, 'Oak Leaves', { all: 'leaves' },
  { opaque: false, cutout: true, filter: 1, hardness: 0.2, drops: [] });
def(B.SAND, 'Sand', { all: 'sand' }, { hardness: 0.5, tool: 'shovel' });
def(B.WATER, 'Water', { all: 'water' },
  { opaque: false, solid: false, liquid: true, translucent: true, filter: 2,
    hardness: 100, drops: [], placeable: true });
def(B.BEDROCK, 'Bedrock', { all: 'bedrock' }, { hardness: Infinity, drops: [] });
def(B.COAL_ORE, 'Coal Ore', { all: 'coal_ore' },
  { hardness: 3, tool: 'pickaxe', drops: 101 });
def(B.IRON_ORE, 'Iron Ore', { all: 'iron_ore' },
  { hardness: 3, tool: 'pickaxe', minTier: 2, drops: null });
def(B.DIAMOND_ORE, 'Diamond Ore', { all: 'diamond_ore' },
  { hardness: 3, tool: 'pickaxe', minTier: 3, drops: 103 });
def(B.GLASS, 'Glass', { all: 'glass' },
  { opaque: false, cutout: true, hardness: 0.3, drops: [] });
def(B.TORCH, 'Torch', { all: 'torch' },
  { opaque: false, solid: false, model: 'torch', emit: 14, hardness: 0.1 });
def(B.CRAFTING, 'Crafting Table', { top: 'crafting_top', bottom: 'planks', side: 'crafting_side' },
  { hardness: 2.5, tool: 'axe' });
def(B.OBSIDIAN, 'Obsidian', { all: 'obsidian' },
  { hardness: 30, tool: 'pickaxe', minTier: 4 });
def(B.NETHERRACK, 'Netherrack', { all: 'netherrack' }, { hardness: 0.4, tool: 'pickaxe' });
def(B.SOUL_SAND, 'Soul Sand', { all: 'soul_sand' }, { hardness: 0.5, tool: 'shovel' });
def(B.GLOWSTONE, 'Glowstone', { all: 'glowstone' }, { emit: 15, hardness: 0.3 });
def(B.QUARTZ_ORE, 'Quartz Ore', { all: 'quartz_ore' }, { hardness: 3, tool: 'pickaxe' });
def(B.PORTAL, 'Nether Portal', { all: 'portal' },
  { opaque: false, solid: false, translucent: true, emit: 11, hardness: Infinity,
    drops: [], placeable: false });
def(B.LAVA, 'Lava', { all: 'lava' },
  { opaque: false, solid: false, liquid: true, emit: 15, hardness: 100, drops: [],
    damage: 4 });
def(B.GRAVEL, 'Gravel', { all: 'gravel' },
  { hardness: 0.6, tool: 'shovel',
    drops: [{ id: 104, count: 1, chance: 0.25 }, { id: B.GRAVEL, count: 1, chance: 0.75 }] });
def(B.SANDSTONE, 'Sandstone', { all: 'sandstone' }, { hardness: 0.8, tool: 'pickaxe' });
def(B.BRICKS, 'Bricks', { all: 'bricks' }, { hardness: 2, tool: 'pickaxe' });
def(B.STONEBRICK, 'Stone Bricks', { all: 'stonebrick' }, { hardness: 1.5, tool: 'pickaxe' });
def(B.WOOL, 'Wool', { all: 'wool' }, { hardness: 0.8 });
def(B.TNT, 'TNT', { top: 'tnt_top', bottom: 'tnt_top', side: 'tnt_side' }, { hardness: 0 });
def(B.FLOWER_RED, 'Rose', { all: 'flower_red' },
  { opaque: false, solid: false, model: 'cross', hardness: 0 });
def(B.FLOWER_YELLOW, 'Dandelion', { all: 'flower_yellow' },
  { opaque: false, solid: false, model: 'cross', hardness: 0 });

export const BLOCKS = D;
export const blockDef = (id) => D[id] || D[B.AIR];

// ---------------- items (ids >= 100) ----------------
// type: 'material' | 'tool' | 'food' | 'weapon'
export const I = {
  STICK: 100, COAL: 101, IRON_INGOT: 102, DIAMOND: 103, FLINT: 104, FLINT_STEEL: 105,
  STRING: 106, GUNPOWDER: 107, BONE: 108,
  WOOD_PICK: 110, STONE_PICK: 111, IRON_PICK: 112, DIAMOND_PICK: 113,
  WOOD_AXE: 114, STONE_AXE: 115, IRON_AXE: 116, DIAMOND_AXE: 117,
  WOOD_SHOVEL: 118, STONE_SHOVEL: 119, IRON_SHOVEL: 120, DIAMOND_SHOVEL: 121,
  WOOD_SWORD: 122, STONE_SWORD: 123, IRON_SWORD: 124, DIAMOND_SWORD: 125,
  BOW: 130, ARROW: 131,
  PORKCHOP: 140, BEEF: 141, MUTTON: 142,
};

export const ITEMS = {};
function item(id, name, opts = {}) {
  ITEMS[id] = Object.assign({ id, name, type: 'material', stack: 64 }, opts);
}
item(I.STICK, 'Stick');
item(I.COAL, 'Coal');
item(I.IRON_INGOT, 'Iron Ingot');
item(I.DIAMOND, 'Diamond');
item(I.FLINT, 'Flint');
item(I.FLINT_STEEL, 'Flint and Steel', { type: 'tool', stack: 1 });
item(I.STRING, 'String');
item(I.GUNPOWDER, 'Gunpowder');
item(I.BONE, 'Bone');
const tiers = ['Wooden', 'Stone', 'Iron', 'Diamond'];
['PICK', 'AXE', 'SHOVEL', 'SWORD'].forEach((kind, k) => {
  const names = { PICK: 'Pickaxe', AXE: 'Axe', SHOVEL: 'Shovel', SWORD: 'Sword' };
  const toolType = { PICK: 'pickaxe', AXE: 'axe', SHOVEL: 'shovel', SWORD: 'sword' }[kind];
  for (let t = 0; t < 4; t++) {
    const id = I[`${tiers[t].toUpperCase().replace('WOODEN', 'WOOD')}_${kind}`];
    item(id, `${tiers[t]} ${names[kind]}`, {
      type: kind === 'SWORD' ? 'weapon' : 'tool', stack: 1,
      toolType, tier: t + 1,
      damage: kind === 'SWORD' ? 4 + t : 2 + t,
    });
  }
});
item(I.BOW, 'Bow', { type: 'weapon', stack: 1 });
item(I.ARROW, 'Arrow');
item(I.PORKCHOP, 'Porkchop', { type: 'food', food: 6 });
item(I.BEEF, 'Steak', { type: 'food', food: 7 });
item(I.MUTTON, 'Mutton', { type: 'food', food: 5 });

export function itemName(id) {
  if (id < 100) return blockDef(id).name;
  return ITEMS[id] ? ITEMS[id].name : '?';
}
export function maxStack(id) {
  if (id < 100) return 64;
  return ITEMS[id] ? ITEMS[id].stack : 64;
}

// ---------------- recipes (shapeless, console-edition style list) ----------------
// { out, count, ins: [[id, qty], ...], table: needs crafting table nearby }
export const RECIPES = [
  { out: B.PLANKS, count: 4, ins: [[B.LOG, 1]] },
  { out: I.STICK, count: 4, ins: [[B.PLANKS, 2]] },
  { out: B.CRAFTING, count: 1, ins: [[B.PLANKS, 4]] },
  { out: B.TORCH, count: 4, ins: [[I.COAL, 1], [I.STICK, 1]] },
  { out: I.WOOD_PICK, count: 1, ins: [[B.PLANKS, 3], [I.STICK, 2]], table: true },
  { out: I.STONE_PICK, count: 1, ins: [[B.COBBLE, 3], [I.STICK, 2]], table: true },
  { out: I.IRON_PICK, count: 1, ins: [[I.IRON_INGOT, 3], [I.STICK, 2]], table: true },
  { out: I.DIAMOND_PICK, count: 1, ins: [[I.DIAMOND, 3], [I.STICK, 2]], table: true },
  { out: I.WOOD_AXE, count: 1, ins: [[B.PLANKS, 3], [I.STICK, 2]], table: true },
  { out: I.STONE_AXE, count: 1, ins: [[B.COBBLE, 3], [I.STICK, 2]], table: true },
  { out: I.IRON_AXE, count: 1, ins: [[I.IRON_INGOT, 3], [I.STICK, 2]], table: true },
  { out: I.DIAMOND_AXE, count: 1, ins: [[I.DIAMOND, 3], [I.STICK, 2]], table: true },
  { out: I.WOOD_SHOVEL, count: 1, ins: [[B.PLANKS, 1], [I.STICK, 2]], table: true },
  { out: I.STONE_SHOVEL, count: 1, ins: [[B.COBBLE, 1], [I.STICK, 2]], table: true },
  { out: I.IRON_SHOVEL, count: 1, ins: [[I.IRON_INGOT, 1], [I.STICK, 2]], table: true },
  { out: I.DIAMOND_SHOVEL, count: 1, ins: [[I.DIAMOND, 1], [I.STICK, 2]], table: true },
  { out: I.WOOD_SWORD, count: 1, ins: [[B.PLANKS, 2], [I.STICK, 1]], table: true },
  { out: I.STONE_SWORD, count: 1, ins: [[B.COBBLE, 2], [I.STICK, 1]], table: true },
  { out: I.IRON_SWORD, count: 1, ins: [[I.IRON_INGOT, 2], [I.STICK, 1]], table: true },
  { out: I.DIAMOND_SWORD, count: 1, ins: [[I.DIAMOND, 2], [I.STICK, 1]], table: true },
  { out: I.FLINT_STEEL, count: 1, ins: [[I.IRON_INGOT, 1], [I.FLINT, 1]] },
  { out: I.BOW, count: 1, ins: [[I.STICK, 3], [I.STRING, 3]], table: true },
  { out: I.ARROW, count: 4, ins: [[I.FLINT, 1], [I.STICK, 1]] },
  // "smelting" folded into crafting (no furnace in this clone)
  { out: I.IRON_INGOT, count: 1, ins: [[B.IRON_ORE, 1], [I.COAL, 1]] },
  { out: B.GLASS, count: 1, ins: [[B.SAND, 1], [I.COAL, 1]] },
  { out: B.STONEBRICK, count: 4, ins: [[B.STONE, 4]], table: true },
  { out: B.SANDSTONE, count: 1, ins: [[B.SAND, 4]] },
  { out: B.BRICKS, count: 4, ins: [[B.COBBLE, 4], [I.COAL, 1]], table: true },
  { out: B.WOOL, count: 1, ins: [[I.STRING, 4]] },
  { out: B.TNT, count: 1, ins: [[B.SAND, 4], [I.GUNPOWDER, 5]], table: true },
  { out: B.STONE, count: 1, ins: [[B.COBBLE, 1], [I.COAL, 1]] },
];

// items shown in the creative inventory
export const CREATIVE_ITEMS = [
  B.STONE, B.GRASS, B.DIRT, B.COBBLE, B.PLANKS, B.LOG, B.LEAVES, B.SAND, B.SANDSTONE,
  B.GRAVEL, B.GLASS, B.BRICKS, B.STONEBRICK, B.WOOL, B.OBSIDIAN, B.BEDROCK,
  B.COAL_ORE, B.IRON_ORE, B.DIAMOND_ORE, B.QUARTZ_ORE, B.GLOWSTONE, B.NETHERRACK,
  B.SOUL_SAND, B.TORCH, B.CRAFTING, B.TNT, B.WATER, B.LAVA, B.FLOWER_RED, B.FLOWER_YELLOW,
  I.FLINT_STEEL, I.DIAMOND_PICK, I.DIAMOND_AXE, I.DIAMOND_SHOVEL, I.DIAMOND_SWORD,
  I.BOW, I.ARROW, I.STICK, I.COAL, I.IRON_INGOT, I.DIAMOND, I.FLINT, I.STRING,
  I.GUNPOWDER, I.PORKCHOP, I.BEEF, I.MUTTON,
];
