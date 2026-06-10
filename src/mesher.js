// Builds chunk geometry. Vertex layout: x,y,z, u,v, sky, block, shade (8 floats).
// Returns { opaque, trans } Float32Arrays (6 verts per quad, no index buffer).

import { B, blockDef, TILE, TILES } from './blocks.js';
import { CX, CZ, H } from './worldgen.js';
import { ATLAS_TILES } from './textures.js';

const TS = 1 / ATLAS_TILES;          // tile span in uv space
const EPS = TS * 0.001;

const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
// face shade per dir (+x,-x,+y,-y,+z,-z)
const SHADE = [0.8, 0.8, 1.0, 0.5, 0.65, 0.65];
// tangent axes (t1 = u axis, t2 = v axis) per dir axis
const TANGENT = [
  [[0, 0, 1], [0, 1, 0]],   // x faces: u along z, v along y
  [[1, 0, 0], [0, 0, 1]],   // y faces: u along x, v along z
  [[1, 0, 0], [0, 1, 0]],   // z faces: u along x, v along y
];

function tileFor(def, dir) {
  const t = def.tiles;
  let name;
  if (t.all) name = t.all;
  else if (dir === 2) name = t.top;
  else if (dir === 3) name = t.bottom;
  else name = t.side;
  return TILE[name];
}

function uvBase(ti) {
  return [(ti % ATLAS_TILES) * TS, ((ti / ATLAS_TILES) | 0) * TS];
}

export function meshChunk(world, cx, cz) {
  const opaque = [], trans = [];
  const x0 = cx * CX, z0 = cz * CZ;

  const light = (x, y, z) => [world.getSky(x, y, z), world.getBlockLight(x, y, z)];
  const opaqueAt = (x, y, z) => blockDef(world.getBlock(x, y, z)).opaque;

  // emit one quad; corners c00,c10,c11,c01 (each [x,y,z]); per-corner shade; uv corners
  function quad(arr, corners, uv0, uvU, uvV, sky, blk, shades) {
    const v = [];
    const eu = Math.sign(uvU) * EPS, ev = Math.sign(uvV) * EPS;
    for (let i = 0; i < 4; i++) {
      const su = (i === 1 || i === 2) ? 1 : 0;
      const sv = (i === 2 || i === 3) ? 1 : 0;
      v.push([
        corners[i][0], corners[i][1], corners[i][2],
        uv0[0] + eu + (uvU - 2 * eu) * su,
        uv0[1] + ev + (uvV - 2 * ev) * sv,
        sky, blk, shades[i],
      ]);
    }
    // choose split diagonal that matches AO
    const flip = shades[0] + shades[2] < shades[1] + shades[3];
    const order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
    for (const i of order) arr.push(...v[i]);
  }

  for (let y = 0; y < H; y++) for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
    const wx = x0 + x, wz = z0 + z;
    const id = world.getBlock(wx, y, wz);
    if (id === B.AIR) continue;
    const def = blockDef(id);

    if (def.model === 'cross') {
      const ti = tileFor(def, 0);
      const [u, vv] = uvBase(ti);
      const [sk, bl] = light(wx, y, wz);
      const a = 0.146, b = 0.854;
      for (const [x1, z1, x2, z2] of [[a, a, b, b], [a, b, b, a]]) {
        quad(opaque, [
          [wx + x1, y, wz + z1], [wx + x2, y, wz + z2],
          [wx + x2, y + 1, wz + z2], [wx + x1, y + 1, wz + z1],
        ], [u, vv + TS], TS, -TS, sk, bl, [1, 1, 1, 1]);
      }
      continue;
    }

    if (def.model === 'torch') {
      const ti = tileFor(def, 0);
      const [u, vv] = uvBase(ti);
      const [sk, bl] = light(wx, y, wz);
      const l = 7 / 16, r = 9 / 16, h = 10 / 16;
      // 4 sides + top
      const sides = [
        [[wx + l, y, wz + l], [wx + r, y, wz + l], [wx + r, y + h, wz + l], [wx + l, y + h, wz + l]],
        [[wx + l, y, wz + r], [wx + r, y, wz + r], [wx + r, y + h, wz + r], [wx + l, y + h, wz + r]],
        [[wx + l, y, wz + l], [wx + l, y, wz + r], [wx + l, y + h, wz + r], [wx + l, y + h, wz + l]],
        [[wx + r, y, wz + l], [wx + r, y, wz + r], [wx + r, y + h, wz + r], [wx + r, y + h, wz + l]],
      ];
      for (const s of sides) quad(opaque, s, [u, vv + TS], TS, -TS, sk, bl, [1, 1, 1, 1]);
      quad(opaque, [
        [wx + l, y + h, wz + l], [wx + r, y + h, wz + l],
        [wx + r, y + h, wz + r], [wx + l, y + h, wz + r],
      ], [u + TS * 0.4, vv + TS * 0.3], TS * 0.15, TS * 0.15, sk, bl, [1, 1, 1, 1]);
      continue;
    }

    const arr = def.translucent ? trans : opaque;

    for (let d = 0; d < 6; d++) {
      const dir = DIRS[d];
      const nx = wx + dir[0], ny = y + dir[1], nz = wz + dir[2];
      const nId = world.getBlock(nx, ny, nz);
      const nDef = blockDef(nId);
      if (nDef.opaque) continue;
      if (nId === id) continue;                       // cull same-type neighbours
      if (def.liquid && nDef.liquid) continue;        // water/lava interfaces

      const axis = d >> 1;
      const positive = (d & 1) === 0;
      const ti = tileFor(def, d);
      const [u, vv] = uvBase(ti);
      const [sk, bl] = light(nx, ny, nz);

      // liquid surfaces are slightly lowered
      const topY = def.liquid && world.getBlock(wx, y + 1, wz) !== id ? 0.875 : 1;

      const base = [wx, y, wz];
      if (positive) base[axis] += axis === 1 ? topY : 1;
      const [t1, t2] = TANGENT[axis];

      const corners = [];
      const shades = [];
      for (let i = 0; i < 4; i++) {
        const s1 = (i === 1 || i === 2) ? 1 : 0;
        const s2 = (i === 2 || i === 3) ? 1 : 0;
        let cy;
        const cxr = base[0] + t1[0] * s1 + t2[0] * s2;
        cy = base[1] + t1[1] * s1 + t2[1] * s2;
        const czr = base[2] + t1[2] * s1 + t2[2] * s2;
        if (axis !== 1 && topY !== 1 && cy === y + 1) cy = y + topY;
        corners.push([cxr, cy, czr]);

        // ambient occlusion
        let ao = 3;
        if (def.opaque) {
          const e1 = s1 ? 1 : -1, e2 = s2 ? 1 : -1;
          const p1 = [nx + t1[0] * e1, ny + t1[1] * e1, nz + t1[2] * e1];
          const p2 = [nx + t2[0] * e2, ny + t2[1] * e2, nz + t2[2] * e2];
          const pc = [nx + t1[0] * e1 + t2[0] * e2, ny + t1[1] * e1 + t2[1] * e2, nz + t1[2] * e1 + t2[2] * e2];
          const o1 = opaqueAt(p1[0], p1[1], p1[2]) ? 1 : 0;
          const o2 = opaqueAt(p2[0], p2[1], p2[2]) ? 1 : 0;
          const oc = opaqueAt(pc[0], pc[1], pc[2]) ? 1 : 0;
          ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
        }
        shades.push(SHADE[d] * (0.4 + 0.6 * (ao / 3)));
      }

      // texture v flips for vertical faces so textures are upright
      let uv0, uvU, uvV;
      if (axis === 1) { uv0 = [u, vv]; uvU = TS; uvV = TS; }
      else { uv0 = [u, vv + TS]; uvU = TS; uvV = -TS; }
      quad(arr, corners, uv0, uvU, uvV, sk, bl, shades);
    }
  }

  return {
    opaque: new Float32Array(opaque),
    trans: new Float32Array(trans),
  };
}
