// Chunked voxel world: storage, incremental flood-fill lighting (sky + block
// channels), raycasting, explosions and nether-portal logic.

import { B, blockDef, isReplaceable } from './blocks.js';
import { Generator, CX, CZ, H, idx } from './worldgen.js';

export { CX, CZ, H };

const ckey = (cx, cz) => cx * 65536 + cz;   // unique for |c| < 32768
const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CX * CZ * H);
    this.light = new Uint8Array(CX * CZ * H);   // high nibble sky, low nibble block
    this.generated = false;
  }
}

export class World {
  constructor(seed, dim) {
    this.seed = seed;
    this.dim = dim;                                  // 'over' | 'nether'
    this.gen = new Generator(seed, dim);
    this.chunks = new Map();
    this.dirty = new Set();                          // chunk keys needing remesh
    this.edits = new Map();                          // ckey -> Map(blockIdx -> id)
    this.portals = [];                               // [{x,y,z}] portal interiors
    this._lastChunk = null;
    this._addQ = [];
    this._remQ = [];
  }

  chunk(cx, cz) {
    const k = ckey(cx, cz);
    const lc = this._lastChunk;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const c = this.chunks.get(k);
    if (c) this._lastChunk = c;
    return c;
  }

  chunkOfBlock(x, z) { return this.chunk(x >> 4, z >> 4); }

  hasChunk(cx, cz) {
    const c = this.chunk(cx, cz);
    return c && c.generated;
  }

  ensureChunk(cx, cz) {
    let c = this.chunk(cx, cz);
    if (c && c.generated) return c;
    c = new Chunk(cx, cz);
    this.chunks.set(ckey(cx, cz), c);
    this._lastChunk = c;
    this.gen.generate(cx, cz, c.blocks);
    const edits = this.edits.get(ckey(cx, cz));
    if (edits) for (const [i, id] of edits) c.blocks[i] = id;
    c.generated = true;
    this.initChunkLight(c);
    this.markDirty(cx, cz);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (this.hasChunk(cx + dx, cz + dz)) this.markDirty(cx + dx, cz + dz);
    return c;
  }

  markDirty(cx, cz) { this.dirty.add(ckey(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0 || y >= H) return B.AIR;
    const c = this.chunk(x >> 4, z >> 4);
    if (!c || !c.generated) return B.AIR;
    return c.blocks[idx(x & 15, y, z & 15)];
  }

  // For collision: unloaded chunks behave as solid so entities never fall through.
  isSolid(x, y, z) {
    if (y < 0) return true;
    if (y >= H) return false;
    const c = this.chunk(x >> 4, z >> 4);
    if (!c || !c.generated) return true;
    return blockDef(c.blocks[idx(x & 15, y, z & 15)]).solid;
  }

  getSky(x, y, z) {
    if (y >= H) return 15;
    if (y < 0) return 0;
    const c = this.chunk(x >> 4, z >> 4);
    if (!c || !c.generated) return 0;
    return c.light[idx(x & 15, y, z & 15)] >> 4;
  }

  getBlockLight(x, y, z) {
    if (y < 0 || y >= H) return 0;
    const c = this.chunk(x >> 4, z >> 4);
    if (!c || !c.generated) return 0;
    return c.light[idx(x & 15, y, z & 15)] & 15;
  }

  _setLight(x, y, z, channel, v) {
    if (y < 0 || y >= H) return;
    const c = this.chunk(x >> 4, z >> 4);
    if (!c || !c.generated) return;
    const i = idx(x & 15, y, z & 15);
    if (channel === 0) c.light[i] = (c.light[i] & 0x0f) | (v << 4);
    else c.light[i] = (c.light[i] & 0xf0) | v;
    this.markDirty(c.cx, c.cz);
    const lx = x & 15, lz = z & 15;
    if (lx === 0) this.markDirty(c.cx - 1, c.cz);
    if (lx === 15) this.markDirty(c.cx + 1, c.cz);
    if (lz === 0) this.markDirty(c.cx, c.cz - 1);
    if (lz === 15) this.markDirty(c.cx, c.cz + 1);
  }

  _getLight(x, y, z, channel) {
    return channel === 0 ? this.getSky(x, y, z) : this.getBlockLight(x, y, z);
  }

  _opacity(x, y, z) {
    // returns [opaque, filter]; unloaded chunks block light (fixed on border exchange)
    if (y >= H || y < 0) return [false, 0];
    const c = this.chunk(x >> 4, z >> 4);
    if (!c || !c.generated) return [true, 0];
    const d = blockDef(c.blocks[idx(x & 15, y, z & 15)]);
    return [d.opaque, d.filter];
  }

  // ---------------- lighting ----------------

  initChunkLight(c) {
    const x0 = c.cx * CX, z0 = c.cz * CZ;
    const addQ = this._addQ;
    if (this.dim !== 'nether') {
      // skylight column fill
      for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
        let lv = 15;
        for (let y = H - 1; y >= 0 && lv > 0; y--) {
          const d = blockDef(c.blocks[idx(x, y, z)]);
          if (d.opaque) break;
          lv = Math.max(0, lv - d.filter);
          c.light[idx(x, y, z)] = lv << 4;
          if (lv > 1) addQ.push(x0 + x, y, z0 + z);
        }
      }
      this._lightAdd(0);
    }
    // block-light emitters
    for (let y = 0; y < H; y++) for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
      const e = blockDef(c.blocks[idx(x, y, z)]).emit;
      if (e > 0) {
        c.light[idx(x, y, z)] = (c.light[idx(x, y, z)] & 0xf0) | e;
        addQ.push(x0 + x, y, z0 + z);
      }
    }
    this._lightAdd(1);

    // exchange light with already-generated neighbours
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.chunk(c.cx + dx, c.cz + dz);
      if (!n || !n.generated) continue;
      for (let y = 0; y < H; y++) for (let i = 0; i < 16; i++) {
        let ax, az, bx, bz;
        if (dx === 1) { ax = x0 + 15; az = z0 + i; bx = ax + 1; bz = az; }
        else if (dx === -1) { ax = x0; az = z0 + i; bx = ax - 1; bz = az; }
        else if (dz === 1) { ax = x0 + i; az = z0 + 15; bx = ax; bz = az + 1; }
        else { ax = x0 + i; az = z0; bx = ax; bz = az - 1; }
        for (const ch of [0, 1]) {
          if (this._getLight(ax, y, az, ch) > 1) addQ.push(ax, y, az);
          if (this._getLight(bx, y, bz, ch) > 1) addQ.push(bx, y, bz);
        }
      }
      this._lightAdd(0);
      // queue was consumed by sky pass; redo seeds for block channel
      for (let y = 0; y < H; y++) for (let i = 0; i < 16; i++) {
        let ax, az, bx, bz;
        if (dx === 1) { ax = x0 + 15; az = z0 + i; bx = ax + 1; bz = az; }
        else if (dx === -1) { ax = x0; az = z0 + i; bx = ax - 1; bz = az; }
        else if (dz === 1) { ax = x0 + i; az = z0 + 15; bx = ax; bz = az + 1; }
        else { ax = x0 + i; az = z0; bx = ax; bz = az - 1; }
        if (this._getLight(ax, y, az, 1) > 1) addQ.push(ax, y, az);
        if (this._getLight(bx, y, bz, 1) > 1) addQ.push(bx, y, bz);
      }
      this._lightAdd(1);
    }
  }

  _lightAdd(channel) {
    const q = this._addQ;
    let head = 0;
    while (head < q.length) {
      const x = q[head++], y = q[head++], z = q[head++];
      const lv = this._getLight(x, y, z, channel);
      if (lv <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        const [op, filter] = this._opacity(nx, ny, nz);
        if (op) continue;
        let t = lv - 1 - filter;
        if (channel === 0 && d === 3 && lv === 15 && filter === 0) t = 15;
        if (t > this._getLight(nx, ny, nz, channel)) {
          this._setLight(nx, ny, nz, channel, t);
          q.push(nx, ny, nz);
        }
      }
    }
    q.length = 0;
  }

  _lightRemove(channel) {
    const q = this._remQ;       // x,y,z,oldLevel
    const addQ = this._addQ;
    let head = 0;
    while (head < q.length) {
      const x = q[head++], y = q[head++], z = q[head++], lv = q[head++];
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        const nl = this._getLight(nx, ny, nz, channel);
        if (nl === 0) continue;
        if (nl < lv || (channel === 0 && d === 3 && lv === 15)) {
          this._setLight(nx, ny, nz, channel, 0);
          q.push(nx, ny, nz, nl);
        } else {
          addQ.push(nx, ny, nz);
        }
      }
    }
    q.length = 0;
  }

  // ---------------- editing ----------------

  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= H) return;
    const cx = x >> 4, cz = z >> 4;
    const c = this.ensureChunk(cx, cz);
    const i = idx(x & 15, y, z & 15);
    const old = c.blocks[i];
    if (old === id) return;
    c.blocks[i] = id;

    if (record) {
      const k = ckey(cx, cz);
      let m = this.edits.get(k);
      if (!m) { m = new Map(); this.edits.set(k, m); }
      m.set(i, id);
    }

    this.markDirty(cx, cz);
    const lx = x & 15, lz = z & 15;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === 15) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === 15) this.markDirty(cx, cz + 1);

    // relight both channels around the change
    const newDef = blockDef(id);
    for (const ch of [0, 1]) {
      if (ch === 0 && this.dim === 'nether') continue;
      const cur = this._getLight(x, y, z, ch);
      this._setLight(x, y, z, ch, 0);
      if (cur > 0) {
        this._remQ.push(x, y, z, cur);
        this._lightRemove(ch);
      }
      if (ch === 1 && newDef.emit > 0) {
        this._setLight(x, y, z, ch, newDef.emit);
        this._addQ.push(x, y, z);
      }
      if (!newDef.opaque) {
        this._addQ.push(x, y, z);
        for (const d of DIRS) this._addQ.push(x + d[0], y + d[1], z + d[2]);
        // re-expose to open sky
        if (ch === 0 && this.getSky(x, y + 1, z) === 15) {
          this._setLight(x, y, z, 0, Math.max(0, 15 - newDef.filter));
          this._addQ.push(x, y, z);
        }
      }
      this._lightAdd(ch);
    }
  }

  // ---------------- queries ----------------

  raycast(ox, oy, oz, dx, dy, dz, maxDist, hitFluid = false) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : Infinity;
    let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : Infinity;
    let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : Infinity;
    let px = x, py = y, pz = z, t = 0;
    for (let n = 0; n < 256; n++) {
      const id = this.getBlock(x, y, z);
      const d = blockDef(id);
      const hit = id !== B.AIR && (d.liquid ? hitFluid : (d.solid || d.model !== 'cube'));
      if (hit) return { x, y, z, px, py, pz, id, dist: t };
      px = x; py = y; pz = z;
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; x += stepX; }
      else if (tMaxY < tMaxZ) { t = tMaxY; tMaxY += tDeltaY; y += stepY; }
      else { t = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; }
      if (t > maxDist) break;
    }
    return null;
  }

  highestSolid(x, z) {
    for (let y = H - 1; y > 0; y--) {
      const d = blockDef(this.getBlock(x, y, z));
      if (d.solid) return y;
    }
    return 0;
  }

  explode(ex, ey, ez, radius) {
    const destroyed = [];
    const r = Math.ceil(radius);
    for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y + z * z > radius * radius) continue;
      const wx = Math.floor(ex) + x, wy = Math.floor(ey) + y, wz = Math.floor(ez) + z;
      const id = this.getBlock(wx, wy, wz);
      if (id === B.AIR) continue;
      const d = blockDef(id);
      if (d.hardness >= 30 || d.hardness === Infinity) continue;
      if (d.liquid) continue;
      destroyed.push({ x: wx, y: wy, z: wz, id });
      this.setBlock(wx, wy, wz, B.AIR);
    }
    return destroyed;
  }

  // ---------------- nether portals ----------------

  // Try to light a portal whose interior contains (x,y,z). Returns true on success.
  // Vegetation (tall grass, flowers...) inside the frame counts as empty.
  ignitePortal(x, y, z) {
    // drop to the bottom of the air pocket
    let by = y;
    while (by > 1 && isReplaceable(this.getBlock(x, by - 1, z))) by--;
    for (const axis of [[1, 0], [0, 1]]) {           // [dx, dz]
      for (let off = -1; off <= 0; off++) {
        const bx = x + axis[0] * off, bz = z + axis[1] * off;
        if (this._checkFrame(bx, by, bz, axis)) {
          for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++)
            this.setBlock(bx + axis[0] * i, by + j, bz + axis[1] * i, B.PORTAL);
          this.portals.push({ x: bx, y: by, z: bz });
          return true;
        }
      }
    }
    return false;
  }

  _checkFrame(bx, by, bz, axis) {
    const [dx, dz] = axis;
    if (by < 1 || by + 3 >= H) return false;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
      const id = this.getBlock(bx + dx * i, by + j, bz + dz * i);
      if (!isReplaceable(id)) return false;
    }
    for (let i = 0; i < 2; i++) {
      if (this.getBlock(bx + dx * i, by - 1, bz + dz * i) !== B.OBSIDIAN) return false;
      if (this.getBlock(bx + dx * i, by + 3, bz + dz * i) !== B.OBSIDIAN) return false;
    }
    for (let j = 0; j < 3; j++) {
      if (this.getBlock(bx - dx, by + j, bz - dz) !== B.OBSIDIAN) return false;
      if (this.getBlock(bx + dx * 2, by + j, bz + dz * 2) !== B.OBSIDIAN) return false;
    }
    return true;
  }

  // Build a fresh portal (frame + interior) near (x,z); returns interior base.
  buildPortal(x, z) {
    this.ensureChunk(x >> 4, z >> 4);
    let y;
    if (this.dim === 'nether') {
      y = 0;
      for (let yy = 40; yy < 100; yy++) {
        if (this.isSolid(x, yy, z) && !this.isSolid(x, yy + 1, z) && !this.isSolid(x, yy + 2, z)) { y = yy + 1; break; }
      }
      if (y === 0) {
        y = 64;
        for (let ddx = -2; ddx <= 3; ddx++) for (let ddz = -2; ddz <= 2; ddz++) {
          this.setBlock(x + ddx, y - 1, z + ddz, B.NETHERRACK);
          for (let dy = 0; dy < 5; dy++) this.setBlock(x + ddx, y + dy, z + ddz, B.AIR);
        }
      }
    } else {
      y = this.highestSolid(x, z) + 1;
    }
    // platform
    for (let i = -1; i <= 2; i++) for (let k = -1; k <= 1; k++)
      if (!this.isSolid(x + i, y - 1, z + k))
        this.setBlock(x + i, y - 1, z + k, this.dim === 'nether' ? B.NETHERRACK : B.STONE);
    // frame along X axis, interior at (x..x+1, y..y+2, z)
    for (let i = -1; i <= 2; i++) {
      this.setBlock(x + i, y - 1, z, B.OBSIDIAN);
      this.setBlock(x + i, y + 3, z, B.OBSIDIAN);
    }
    for (let j = 0; j < 3; j++) {
      this.setBlock(x - 1, y + j, z, B.OBSIDIAN);
      this.setBlock(x + 2, y + j, z, B.OBSIDIAN);
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
      this.setBlock(x + i, y + j, z, B.PORTAL);
      // clear space in front/behind so the player doesn't suffocate
      for (const dz of [-1, 1]) {
        const id = this.getBlock(x + i, y + j, z + dz);
        if (id !== B.AIR && blockDef(id).hardness < 30) this.setBlock(x + i, y + j, z + dz, B.AIR);
      }
    }
    const portal = { x, y, z };
    this.portals.push(portal);
    return portal;
  }

  nearestPortal(x, z, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const p of this.portals) {
      // verify it still exists
      if (this.hasChunk(p.x >> 4, p.z >> 4) && this.getBlock(p.x, p.y, p.z) !== B.PORTAL) continue;
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
