// Terrain generation for the Overworld and the Nether.

import { Noise, mulberry32, hash2i, clamp } from './math.js';
import { B } from './blocks.js';

export const CX = 16, CZ = 16, H = 128;
export const SEA = 62;
export const idx = (x, y, z) => x | (z << 4) | (y << 8);

export class Generator {
  constructor(seed, dim) {
    this.seed = seed;
    this.dim = dim;                     // 'over' | 'nether'
    this.terr = new Noise(seed);
    this.terr2 = new Noise(seed ^ 0x9e3779b9);
    this.biomeN = new Noise(seed ^ 0x5bd1e995);
    this.caveN = new Noise(seed ^ 0x27d4eb2f);
  }

  biome(x, z) {
    const b = this.biomeN.fbm2(x * 0.0025, z * 0.0025, 3);
    if (b < -0.28) return 'desert';
    if (b > 0.22) return 'forest';
    return 'plains';
  }

  height(x, z) {
    const c = this.terr.fbm2(x * 0.004, z * 0.004, 4);
    let h = SEA + 4 + c * 16;
    const m = this.terr2.fbm2(x * 0.0012 + 53.7, z * 0.0012 - 91.2, 3);
    if (m > 0.18) h += (m - 0.18) * 110;          // mountains
    const hills = this.terr2.fbm2(x * 0.02, z * 0.02, 2);
    h += hills * 4;
    return clamp(h | 0, 4, H - 10);
  }

  generate(cx, cz, blocks) {
    if (this.dim === 'nether') this.genNether(cx, cz, blocks);
    else this.genOver(cx, cz, blocks);
  }

  genOver(cx, cz, blocks) {
    const x0 = cx * CX, z0 = cz * CZ;
    const heights = new Int16Array(CX * CZ);
    for (let z = 0; z < CZ; z++)
      for (let x = 0; x < CX; x++)
        heights[x + z * CX] = this.height(x0 + x, z0 + z);

    for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = heights[x + z * CX];
      const biome = this.biome(wx, wz);
      const beach = h <= SEA + 1;
      for (let y = 0; y < H; y++) {
        let b = B.AIR;
        if (y === 0 || (y === 1 && hash2i(this.seed, wx * 7 + y, wz * 13) % 3 === 0)) b = B.BEDROCK;
        else if (y < h - 3) b = B.STONE;
        else if (y < h) b = (biome === 'desert' || beach) ? B.SAND : B.DIRT;
        else if (y === h) {
          if (biome === 'desert' || beach) b = B.SAND;
          else b = B.GRASS;
        } else if (y <= SEA) b = B.WATER;

        // caves
        if (b !== B.AIR && b !== B.BEDROCK && b !== B.WATER && y > 1 && y < h) {
          const cv = this.caveN.noise3(wx * 0.045, y * 0.07, wz * 0.045)
            + this.caveN.noise3(wx * 0.09 + 31, y * 0.12, wz * 0.09) * 0.4;
          if (cv > 0.62) b = (y <= 10) ? B.LAVA : B.AIR;
        }
        if (b !== B.AIR) blocks[idx(x, y, z)] = b;
      }
    }

    // ores: random blobs
    const rng = mulberry32(hash2i(this.seed, cx, cz));
    const blob = (ore, count, yMin, yMax, size) => {
      for (let i = 0; i < count; i++) {
        const bx = (rng() * CX) | 0, bz = (rng() * CZ) | 0;
        const by = yMin + (rng() * (yMax - yMin)) | 0;
        for (let j = 0; j < size; j++) {
          const ox = bx + ((rng() * 3) | 0) - 1, oy = by + ((rng() * 3) | 0) - 1,
            oz = bz + ((rng() * 3) | 0) - 1;
          if (ox < 0 || ox >= CX || oz < 0 || oz >= CZ || oy < 1 || oy >= H) continue;
          if (blocks[idx(ox, oy, oz)] === B.STONE) blocks[idx(ox, oy, oz)] = ore;
        }
      }
    };
    blob(B.COAL_ORE, 10, 8, 100, 8);
    blob(B.IRON_ORE, 7, 4, 60, 6);
    blob(B.DIAMOND_ORE, 2, 2, 16, 5);
    blob(B.GRAVEL, 4, 10, 70, 9);

    // trees & flowers (kept fully inside the chunk so generation stays local)
    for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = heights[x + z * CX];
      if (h >= H - 9 || blocks[idx(x, h, z)] !== B.GRASS) continue;
      const biome = this.biome(wx, wz);
      const r = hash2i(this.seed ^ 0xabcdef, wx, wz) % 1000;
      const treeChance = biome === 'forest' ? 18 : biome === 'plains' ? 3 : 0;
      if (r < treeChance && x >= 2 && x <= 13 && z >= 2 && z <= 13) {
        this.tree(blocks, x, h + 1, z, 4 + (r % 3));
      } else if (r >= 988 && biome !== 'desert') {
        blocks[idx(x, h + 1, z)] = (r % 2) ? B.FLOWER_RED : B.FLOWER_YELLOW;
      }
    }
  }

  tree(blocks, x, y, z, trunk) {
    for (let i = 0; i < trunk; i++) blocks[idx(x, y + i, z)] = B.LOG;
    const top = y + trunk;
    for (let dy = -2; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const r = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) * 2;
      if (r > 3 + (dy < 0 ? 1 : 0)) continue;
      const ox = x + dx, oy = top + dy, oz = z + dz;
      if (oy >= H) continue;
      const ii = idx(ox, oy, oz);
      if (blocks[ii] === B.AIR) blocks[ii] = B.LEAVES;
    }
  }

  genNether(cx, cz, blocks) {
    const x0 = cx * CX, z0 = cz * CZ;
    const LAVA_SEA = 31;
    for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
      const wx = x0 + x, wz = z0 + z;
      for (let y = 0; y < H; y++) {
        let b = B.AIR;
        if (y <= 1 || y >= H - 2) b = B.BEDROCK;
        else {
          let d = this.terr.fbm3(wx * 0.045, y * 0.05, wz * 0.045, 3);
          d += Math.max(0, (24 - y)) * 0.05;       // solid floor
          d += Math.max(0, (y - (H - 24))) * 0.05; // solid ceiling
          d -= Math.max(0, (y - 40) * (70 - y)) * 0.0007; // open middle
          if (d > 0.08) b = B.NETHERRACK;
          else if (y <= LAVA_SEA) b = B.LAVA;
        }
        if (b !== B.AIR) blocks[idx(x, y, z)] = b;
      }
    }
    const rng = mulberry32(hash2i(this.seed ^ 0x6e7468, cx, cz));
    // soul sand patches on floor, glowstone on ceilings, quartz in rock
    for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
      for (let y = 2; y < H - 2; y++) {
        const here = blocks[idx(x, y, z)], above = blocks[idx(x, y + 1, z)];
        if (here === B.NETHERRACK && above === B.AIR && rng() < 0.06)
          blocks[idx(x, y, z)] = B.SOUL_SAND;
        if (here === B.NETHERRACK && y > 3 && blocks[idx(x, y - 1, z)] === B.AIR && rng() < 0.02) {
          blocks[idx(x, y - 1, z)] = B.GLOWSTONE;
          if (rng() < 0.5 && y > 4) blocks[idx(x, y - 2, z)] = B.GLOWSTONE;
        }
        if (here === B.NETHERRACK && rng() < 0.004) blocks[idx(x, y, z)] = B.QUARTZ_ORE;
      }
    }
  }

  // surface y for spawning (overworld)
  surfaceY(x, z) {
    return this.height(x, z) + 1;
  }
}
