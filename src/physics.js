// Swept AABB voxel collision shared by the player and all mobs.

import { blockDef } from './blocks.js';
import { B } from './blocks.js';

const EPS = 0.001;

// e: { pos:[x,y,z] (feet center), vel:[x,y,z], w (half width), h (height) }
// Moves entity by vel*dt with per-axis collision. Sets e.onGround / e.hitWall.
export function moveEntity(world, e, dt) {
  e.onGround = false;
  e.hitWall = false;
  const move = [e.vel[0] * dt, e.vel[1] * dt, e.vel[2] * dt];
  // sub-step large movements so fast entities don't tunnel
  const steps = Math.max(1, Math.ceil(Math.max(...move.map(Math.abs)) / 0.45));
  for (let s = 0; s < steps; s++) {
    for (const axis of [1, 0, 2]) {
      const d = move[axis] / steps;
      if (d !== 0) collideAxis(world, e, axis, d);
    }
  }
}

function collideAxis(world, e, axis, d) {
  e.pos[axis] += d;
  const w = e.w, h = e.h;
  const min = [e.pos[0] - w, e.pos[1], e.pos[2] - w];
  const max = [e.pos[0] + w, e.pos[1] + h, e.pos[2] + w];
  const x0 = Math.floor(min[0]), x1 = Math.floor(max[0] - EPS);
  const y0 = Math.floor(min[1]), y1 = Math.floor(max[1] - EPS);
  const z0 = Math.floor(min[2]), z1 = Math.floor(max[2] - EPS);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!world.isSolid(x, y, z)) continue;
    if (axis === 1) {
      if (d < 0) { e.pos[1] = y + 1 + EPS; e.onGround = true; }
      else e.pos[1] = y - h - EPS;
      e.vel[1] = 0;
    } else if (axis === 0) {
      e.pos[0] = d > 0 ? x - w - EPS : x + 1 + w + EPS;
      e.vel[0] = 0;
      e.hitWall = true;
    } else {
      e.pos[2] = d > 0 ? z - w - EPS : z + 1 + w + EPS;
      e.vel[2] = 0;
      e.hitWall = true;
    }
    return;
  }
}

export function inLiquid(world, e, liquidId) {
  const ids = [];
  for (const dy of [0.1, e.h * 0.5, e.h * 0.9]) {
    const id = world.getBlock(Math.floor(e.pos[0]), Math.floor(e.pos[1] + dy), Math.floor(e.pos[2]));
    ids.push(id);
  }
  if (liquidId !== undefined) return ids.some(i => i === liquidId);
  return ids.some(i => blockDef(i).liquid);
}

export function headInBlock(world, e, id) {
  const b = world.getBlock(Math.floor(e.pos[0]), Math.floor(e.pos[1] + e.h * 0.9), Math.floor(e.pos[2]));
  return b === id;
}

export function touchingBlock(world, e, id) {
  const w = e.w;
  const x0 = Math.floor(e.pos[0] - w), x1 = Math.floor(e.pos[0] + w);
  const y0 = Math.floor(e.pos[1]), y1 = Math.floor(e.pos[1] + e.h);
  const z0 = Math.floor(e.pos[2] - w), z1 = Math.floor(e.pos[2] + w);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
    if (world.getBlock(x, y, z) === id) return true;
  return false;
}

export { B };
