// Mobs: box-model definitions, AI, spawning, plus arrow and item-drop entities.

import { mat4, multiply, translate, rotateX, rotateY, scale, mulberry32 } from './math.js';
import { moveEntity, inLiquid } from './physics.js';
import { B, I, blockDef } from './blocks.js';

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// part: { sz:[w,h,d], piv:[x,y,z], col, anim, down }
// anim: 'legA'|'legB'|'zarm'|'head' — down: extends below pivot (limbs)
export const MOB_TYPES = {
  pig: {
    passive: true, health: 8, speed: 1.4, w: 0.45, h: 0.85, drop: { id: I.PORKCHOP, count: 2 },
    parts: [
      { sz: [0.62, 0.5, 1.0], piv: [0, 0.3, 0], col: '#eda3a2' },
      { sz: [0.5, 0.5, 0.5], piv: [0, 0.42, -0.68], col: '#eda3a2', anim: 'head' },
      { sz: [0.22, 0.14, 0.06], piv: [0, 0.5, -0.96], col: '#d8888f', anim: 'head' },
      { sz: [0.18, 0.32, 0.18], piv: [-0.2, 0.32, -0.32], col: '#d8888f', anim: 'legA', down: true },
      { sz: [0.18, 0.32, 0.18], piv: [0.2, 0.32, -0.32], col: '#d8888f', anim: 'legB', down: true },
      { sz: [0.18, 0.32, 0.18], piv: [-0.2, 0.32, 0.35], col: '#d8888f', anim: 'legB', down: true },
      { sz: [0.18, 0.32, 0.18], piv: [0.2, 0.32, 0.35], col: '#d8888f', anim: 'legA', down: true },
    ],
  },
  cow: {
    passive: true, health: 10, speed: 1.3, w: 0.45, h: 1.3, drop: { id: I.BEEF, count: 2 },
    parts: [
      { sz: [0.65, 0.55, 1.05], piv: [0, 0.62, 0], col: '#5d4434' },
      { sz: [0.45, 0.45, 0.42], piv: [0, 0.85, -0.7], col: '#6d5240', anim: 'head' },
      { sz: [0.28, 0.18, 0.08], piv: [0, 0.88, -0.92], col: '#e8e0d8', anim: 'head' },
      { sz: [0.2, 0.62, 0.2], piv: [-0.22, 0.62, -0.35], col: '#4d3a2c', anim: 'legA', down: true },
      { sz: [0.2, 0.62, 0.2], piv: [0.22, 0.62, -0.35], col: '#4d3a2c', anim: 'legB', down: true },
      { sz: [0.2, 0.62, 0.2], piv: [-0.22, 0.62, 0.38], col: '#4d3a2c', anim: 'legB', down: true },
      { sz: [0.2, 0.62, 0.2], piv: [0.22, 0.62, 0.38], col: '#4d3a2c', anim: 'legA', down: true },
    ],
  },
  sheep: {
    passive: true, health: 8, speed: 1.2, w: 0.45, h: 1.15, drop: { id: I.MUTTON, count: 1, extra: { id: B.WOOL, count: 2 } },
    parts: [
      { sz: [0.7, 0.6, 1.0], piv: [0, 0.5, 0], col: '#e8e8e8' },
      { sz: [0.38, 0.38, 0.42], piv: [0, 0.78, -0.65], col: '#d8c0b0', anim: 'head' },
      { sz: [0.18, 0.5, 0.18], piv: [-0.2, 0.5, -0.32], col: '#cbb', anim: 'legA', down: true },
      { sz: [0.18, 0.5, 0.18], piv: [0.2, 0.5, -0.32], col: '#cbb', anim: 'legB', down: true },
      { sz: [0.18, 0.5, 0.18], piv: [-0.2, 0.5, 0.35], col: '#cbb', anim: 'legB', down: true },
      { sz: [0.18, 0.5, 0.18], piv: [0.2, 0.5, 0.35], col: '#cbb', anim: 'legA', down: true },
    ],
  },
  zombie: {
    hostile: true, health: 20, speed: 1.9, w: 0.3, h: 1.9, damage: 3, burns: true,
    drop: { id: I.GUNPOWDER, count: 0 },
    parts: [
      { sz: [0.24, 0.75, 0.24], piv: [-0.13, 0.75, 0], col: '#3a5a8a', anim: 'legA', down: true },
      { sz: [0.24, 0.75, 0.24], piv: [0.13, 0.75, 0], col: '#3a5a8a', anim: 'legB', down: true },
      { sz: [0.52, 0.7, 0.28], piv: [0, 0.75, 0], col: '#2a8080' },
      { sz: [0.2, 0.7, 0.2], piv: [-0.37, 1.4, 0], col: '#5a9c50', anim: 'zarm', down: true },
      { sz: [0.2, 0.7, 0.2], piv: [0.37, 1.4, 0], col: '#5a9c50', anim: 'zarm', down: true },
      { sz: [0.5, 0.5, 0.5], piv: [0, 1.45, 0], col: '#5a9c50', anim: 'head' },
      { sz: [0.1, 0.08, 0.04], piv: [-0.12, 1.75, -0.26], col: '#1a1a1a', anim: 'head' },
      { sz: [0.1, 0.08, 0.04], piv: [0.12, 1.75, -0.26], col: '#1a1a1a', anim: 'head' },
    ],
  },
  skeleton: {
    hostile: true, health: 20, speed: 1.7, w: 0.3, h: 1.9, ranged: true, burns: true,
    drop: { id: I.ARROW, count: 2, extra: { id: I.BONE, count: 1 } },
    parts: [
      { sz: [0.16, 0.75, 0.16], piv: [-0.12, 0.75, 0], col: '#c8c8c8', anim: 'legA', down: true },
      { sz: [0.16, 0.75, 0.16], piv: [0.12, 0.75, 0], col: '#c8c8c8', anim: 'legB', down: true },
      { sz: [0.44, 0.7, 0.2], piv: [0, 0.75, 0], col: '#9a9a9a' },
      { sz: [0.14, 0.7, 0.14], piv: [-0.32, 1.4, 0], col: '#c8c8c8', anim: 'zarm', down: true },
      { sz: [0.14, 0.7, 0.14], piv: [0.32, 1.4, 0], col: '#c8c8c8', anim: 'zarm', down: true },
      { sz: [0.48, 0.48, 0.48], piv: [0, 1.45, 0], col: '#d8d8d8', anim: 'head' },
      { sz: [0.1, 0.1, 0.04], piv: [-0.12, 1.72, -0.25], col: '#222', anim: 'head' },
      { sz: [0.1, 0.1, 0.04], piv: [0.12, 1.72, -0.25], col: '#222', anim: 'head' },
    ],
  },
  creeper: {
    hostile: true, health: 20, speed: 1.8, w: 0.3, h: 1.6, exploder: true,
    drop: { id: I.GUNPOWDER, count: 2 },
    parts: [
      { sz: [0.24, 0.4, 0.3], piv: [-0.14, 0.4, -0.22], col: '#3e8e3e', anim: 'legA', down: true },
      { sz: [0.24, 0.4, 0.3], piv: [0.14, 0.4, -0.22], col: '#3e8e3e', anim: 'legB', down: true },
      { sz: [0.24, 0.4, 0.3], piv: [-0.14, 0.4, 0.22], col: '#3e8e3e', anim: 'legB', down: true },
      { sz: [0.24, 0.4, 0.3], piv: [0.14, 0.4, 0.22], col: '#3e8e3e', anim: 'legA', down: true },
      { sz: [0.5, 0.75, 0.3], piv: [0, 0.4, 0], col: '#4dad4d' },
      { sz: [0.5, 0.5, 0.5], piv: [0, 1.15, 0], col: '#4dad4d', anim: 'head' },
      { sz: [0.12, 0.12, 0.04], piv: [-0.12, 1.48, -0.26], col: '#111', anim: 'head' },
      { sz: [0.12, 0.12, 0.04], piv: [0.12, 1.48, -0.26], col: '#111', anim: 'head' },
      { sz: [0.1, 0.16, 0.04], piv: [0, 1.32, -0.26], col: '#111', anim: 'head' },
      { sz: [0.06, 0.08, 0.04], piv: [-0.08, 1.28, -0.26], col: '#111', anim: 'head' },
      { sz: [0.06, 0.08, 0.04], piv: [0.08, 1.28, -0.26], col: '#111', anim: 'head' },
    ],
  },
  spider: {
    hostile: true, neutralDay: true, health: 16, speed: 2.2, w: 0.6, h: 0.85, damage: 2,
    climbs: true, drop: { id: I.STRING, count: 2 },
    parts: [
      { sz: [0.8, 0.45, 0.95], piv: [0, 0.25, 0.15], col: '#262626' },
      { sz: [0.45, 0.4, 0.45], piv: [0, 0.25, -0.55], col: '#332b26', anim: 'head' },
      { sz: [0.08, 0.07, 0.03], piv: [-0.12, 0.5, -0.78], col: '#c03030', anim: 'head' },
      { sz: [0.08, 0.07, 0.03], piv: [0.12, 0.5, -0.78], col: '#c03030', anim: 'head' },
      { sz: [1.7, 0.08, 0.14], piv: [0, 0.45, -0.3], col: '#1d1d1d', rotY: 0.5, anim: 'legA' },
      { sz: [1.7, 0.08, 0.14], piv: [0, 0.45, -0.1], col: '#1d1d1d', rotY: 0.2, anim: 'legB' },
      { sz: [1.7, 0.08, 0.14], piv: [0, 0.45, 0.1], col: '#1d1d1d', rotY: -0.2, anim: 'legA' },
      { sz: [1.7, 0.08, 0.14], piv: [0, 0.45, 0.3], col: '#1d1d1d', rotY: -0.5, anim: 'legB' },
    ],
  },
};

let nextId = 1;

export function makeMob(type, x, y, z) {
  const def = MOB_TYPES[type];
  return {
    id: nextId++, kind: 'mob', type,
    pos: [x, y, z], vel: [0, 0, 0],
    w: def.w, h: def.h,
    yaw: Math.random() * Math.PI * 2,
    health: def.health, hurtT: 0, attackCD: 0, burnT: 0,
    t: Math.random() * 10, walkT: 0, walking: false, fuse: 0,
    onGround: false, hitWall: false, dead: false,
  };
}

export function makeItemDrop(item, count, x, y, z, vel) {
  return {
    id: nextId++, kind: 'item', item, count,
    pos: [x, y, z],
    vel: vel || [(Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2],
    w: 0.12, h: 0.24, t: 0, onGround: false, dead: false,
  };
}

export function makeArrow(x, y, z, vel, fromPlayer) {
  return {
    id: nextId++, kind: 'arrow',
    pos: [x, y, z], vel, fromPlayer,
    w: 0.05, h: 0.1, t: 0, stuck: false, dead: false, onGround: false,
  };
}

const GRAV = 26;

// ctx: { player, damagePlayer(n, srcPos), explode(x,y,z,r,maxDmg), shootArrow(ent),
//        dayFactor, sound(name), dropItem(...) }
export function updateEntity(e, world, dt, ctx) {
  e.t += dt;
  if (e.kind === 'item') return updateItem(e, world, dt);
  if (e.kind === 'arrow') return updateArrow(e, world, dt, ctx);

  const def = MOB_TYPES[e.type];
  const p = ctx.player;
  const dx = p.pos[0] - e.pos[0], dz = p.pos[2] - e.pos[2];
  const dy = p.pos[1] - e.pos[1];
  const dist = Math.hypot(dx, dy, dz);
  const hDist = Math.hypot(dx, dz);
  if (e.hurtT > 0) e.hurtT -= dt;
  if (e.attackCD > 0) e.attackCD -= dt;

  const swimming = inLiquid(world, e);
  let speed = def.speed;
  let wantJump = false;
  let forward = 0;

  const hostileNow = def.hostile && !p.dead &&
    !(def.neutralDay && ctx.dayFactor > 0.5 && world.getSky(...e.pos.map(Math.floor)) > 10);

  if (hostileNow && dist < 20) {
    e.yaw = Math.atan2(-dx, -dz);
    if (def.ranged) {
      forward = dist > 9 ? 1 : dist < 5 ? -0.6 : 0;
      if (dist < 14 && e.attackCD <= 0) {
        e.attackCD = 2.4;
        const aim = [dx, dy + 1.2 + dist * 0.04, dz];
        const len = Math.hypot(...aim);
        const sp = 16;
        ctx.shootArrow(makeArrow(e.pos[0], e.pos[1] + def.h * 0.8, e.pos[2],
          aim.map(v => v / len * sp + (Math.random() - 0.5) * 1.2), false));
        ctx.sound('bow');
      }
    } else if (def.exploder) {
      if (dist < 3) {
        e.fuse += dt;
        forward = 0;
        if (e.fuse > 1.5) {
          e.dead = true;
          ctx.explode(e.pos[0], e.pos[1] + 0.8, e.pos[2], 4, 22);
          return;
        }
      } else {
        e.fuse = Math.max(0, e.fuse - dt * 2);
        forward = 1;
      }
    } else {
      forward = 1;
      if (dist < 1.7 + e.w && e.attackCD <= 0 && Math.abs(dy) < 2.5) {
        e.attackCD = 1.1;
        ctx.damagePlayer(def.damage || 3, e.pos);
      }
    }
    if (e.hitWall && e.onGround) wantJump = true;
    if (def.climbs && e.hitWall) e.vel[1] = 2.6;
  } else {
    // wander / flee
    e.walkT -= dt;
    if (e.hurtT > 0.5 && def.passive) {
      e.yaw = Math.atan2(dx, dz);   // away from player
      e.walking = true;
      speed *= 1.8;
      forward = 1;
    } else {
      if (e.walkT <= 0) {
        e.walking = Math.random() < 0.5;
        e.walkT = 1.5 + Math.random() * 3;
        if (e.walking) e.yaw = Math.random() * Math.PI * 2;
      }
      forward = e.walking ? 0.7 : 0;
    }
    if (e.hitWall && e.onGround && forward > 0) wantJump = true;
  }

  // daylight burning
  if (def.burns && world.dim === 'over' && ctx.dayFactor > 0.65 &&
      world.getSky(Math.floor(e.pos[0]), Math.floor(e.pos[1] + def.h), Math.floor(e.pos[2])) >= 14) {
    e.burnT += dt;
    if (e.burnT > 1) { e.burnT = 0; hurtMob(e, 2, null, ctx); }
  }

  // movement
  const fx = -Math.sin(e.yaw) * forward * speed;
  const fz = -Math.cos(e.yaw) * forward * speed;
  const accel = e.onGround ? 14 : 4;
  e.vel[0] += (fx - e.vel[0]) * Math.min(1, accel * dt);
  e.vel[2] += (fz - e.vel[2]) * Math.min(1, accel * dt);

  if (swimming) {
    e.vel[1] += (3 - e.vel[1]) * Math.min(1, 5 * dt);
    if (world.getBlock(Math.floor(e.pos[0]), Math.floor(e.pos[1]), Math.floor(e.pos[2])) === B.LAVA)
      if ((e.t % 0.6) < dt) hurtMob(e, 3, null, ctx);
  } else {
    e.vel[1] -= GRAV * dt;
    if (wantJump) e.vel[1] = 8.2;
  }
  if (e.vel[1] < -40) e.vel[1] = -40;

  const before = e.vel[1];
  moveEntity(world, e, dt);
  if (e.onGround && before < -13) hurtMob(e, Math.floor((-before - 13) / 2), null, ctx);
  if (e.pos[1] < -10) e.dead = true;
}

export function hurtMob(e, dmg, fromPos, ctx) {
  if (e.dead) return;
  e.health -= dmg;
  e.hurtT = 0.4;
  if (fromPos) {
    const dx = e.pos[0] - fromPos[0], dz = e.pos[2] - fromPos[2];
    const d = Math.hypot(dx, dz) || 1;
    e.vel[0] += dx / d * 6; e.vel[2] += dz / d * 6; e.vel[1] = 4.5;
  }
  if (ctx) ctx.sound('hit');
  if (e.health <= 0) {
    e.dead = true;
    if (ctx && ctx.dropItem) {
      const def = MOB_TYPES[e.type];
      if (def && def.drop && def.drop.count > 0)
        ctx.dropItem(def.drop.id, 1 + (Math.random() * def.drop.count | 0), e.pos[0], e.pos[1] + 0.5, e.pos[2]);
      if (def && def.drop && def.drop.extra && Math.random() < 0.7)
        ctx.dropItem(def.drop.extra.id, def.drop.extra.count, e.pos[0], e.pos[1] + 0.5, e.pos[2]);
    }
  }
}

function updateItem(e, world, dt) {
  e.vel[1] -= GRAV * 0.7 * dt;
  e.vel[0] *= (1 - Math.min(1, dt * (e.onGround ? 8 : 1)));
  e.vel[2] *= (1 - Math.min(1, dt * (e.onGround ? 8 : 1)));
  if (inLiquid(world, e)) e.vel[1] = Math.max(e.vel[1], 1.5);
  moveEntity(world, e, dt);
  if (world.getBlock(Math.floor(e.pos[0]), Math.floor(e.pos[1]), Math.floor(e.pos[2])) === B.LAVA) e.dead = true;
  if (e.t > 240 || e.pos[1] < -10) e.dead = true;
}

function updateArrow(e, world, dt, ctx) {
  if (e.stuck) {
    if (e.t > 12) e.dead = true;
    return;
  }
  e.vel[1] -= 18 * dt;
  e.pos[0] += e.vel[0] * dt;
  e.pos[1] += e.vel[1] * dt;
  e.pos[2] += e.vel[2] * dt;
  if (world.isSolid(Math.floor(e.pos[0]), Math.floor(e.pos[1]), Math.floor(e.pos[2]))) {
    e.stuck = true;
    return;
  }
  if (!e.fromPlayer && !ctx.player.dead) {
    const p = ctx.player;
    if (Math.abs(e.pos[0] - p.pos[0]) < 0.5 && Math.abs(e.pos[2] - p.pos[2]) < 0.5 &&
        e.pos[1] > p.pos[1] && e.pos[1] < p.pos[1] + 1.9) {
      ctx.damagePlayer(3, [e.pos[0] - e.vel[0], e.pos[1], e.pos[2] - e.vel[2]]);
      e.dead = true;
    }
  }
  if (e.t > 12 || e.pos[1] < -10) e.dead = true;
}

// ---------------- spawning ----------------

export function trySpawn(world, player, entities, dayFactor, rng) {
  let hostiles = 0, passives = 0;
  for (const e of entities) {
    if (e.kind !== 'mob') continue;
    const d = MOB_TYPES[e.type];
    if (d.hostile) hostiles++; else passives++;
  }
  const nether = world.dim === 'nether';
  for (let attempt = 0; attempt < 4; attempt++) {
    const ang = rng() * Math.PI * 2;
    const dist = 24 + rng() * 28;
    const x = Math.floor(player.pos[0] + Math.sin(ang) * dist);
    const z = Math.floor(player.pos[2] + Math.cos(ang) * dist);
    if (!world.hasChunk(x >> 4, z >> 4)) continue;

    // find a stand-able spot
    let y = -1;
    const yBase = Math.floor(player.pos[1]);
    for (let i = 0; i < 8; i++) {
      const yy = Math.max(2, Math.min(120, yBase + ((rng() * 40) | 0) - 20));
      if (world.isSolid(x, yy - 1, z) && !world.isSolid(x, yy, z) && !world.isSolid(x, yy + 1, z)
          && world.getBlock(x, yy, z) === B.AIR) { y = yy; break; }
    }
    if (y < 0) continue;

    const sky = world.getSky(x, y, z);
    const blk = world.getBlockLight(x, y, z);
    const lightLevel = Math.max(sky * dayFactor, blk);

    if (nether || lightLevel < 4) {
      if (hostiles >= 16) continue;
      const pool = nether ? ['zombie', 'skeleton'] : ['zombie', 'skeleton', 'creeper', 'spider'];
      const type = pool[(rng() * pool.length) | 0];
      entities.push(makeMob(type, x + 0.5, y, z + 0.5));
      hostiles++;
    } else if (!nether && passives < 10 && dayFactor > 0.5 &&
               world.getBlock(x, y - 1, z) === B.GRASS) {
      const pool = ['pig', 'cow', 'sheep'];
      entities.push(makeMob(pool[(rng() * pool.length) | 0], x + 0.5, y, z + 0.5));
      passives++;
    }
  }
  // despawn far entities
  for (const e of entities) {
    if (e.kind === 'mob') {
      const d = Math.hypot(e.pos[0] - player.pos[0], e.pos[2] - player.pos[2]);
      if (d > 90) e.dead = true;
    }
  }
}

// ---------------- rendering ----------------

const colorCache = {};
function col(h) { return colorCache[h] || (colorCache[h] = hex(h)); }

// Returns { cubes, sprites } — sprites are item drops drawn as icon billboards.
export function buildEntityDraws(entities, world, dayFactor, iconUV) {
  const draws = [];
  const sprites = [];
  for (const e of entities) {
    if (e.dead) continue;
    const lx = Math.floor(e.pos[0]), ly = Math.floor(e.pos[1] + 0.5), lz = Math.floor(e.pos[2]);
    const sky = world.getSky(lx, ly, lz), blk = world.getBlockLight(lx, ly, lz);
    let light = Math.max(sky / 15 * dayFactor, blk / 15, world.dim === 'nether' ? 0.25 : 0.06);
    light = Math.pow(light, 1.4) * 0.95 + 0.05;

    if (e.kind === 'item') {
      const bob = Math.sin(e.t * 2.5) * 0.06 + 0.1;
      let m = mat4();
      translate(m, m, e.pos[0], e.pos[1] + bob, e.pos[2]);
      rotateY(m, m, e.t * 1.8);
      scale(m, m, 0.45, 0.45, 0.45);
      sprites.push({ model: m, uv: iconUV(e.item), light: Math.max(light, 0.25) });
      continue;
    }
    if (e.kind === 'arrow') {
      const yaw = Math.atan2(-e.vel[0], -e.vel[2]);
      const pitch = e.stuck ? 0 : Math.atan2(e.vel[1], Math.hypot(e.vel[0], e.vel[2]));
      let m = mat4();
      translate(m, m, e.pos[0], e.pos[1], e.pos[2]);
      rotateY(m, m, yaw);
      rotateX(m, m, -pitch);
      scale(m, m, 0.06, 0.06, 0.5);
      draws.push({ model: m, color: col('#caa56a'), light, flash: 0 });
      continue;
    }

    const def = MOB_TYPES[e.type];
    const speed = Math.hypot(e.vel[0], e.vel[2]);
    const swing = Math.sin(e.t * 8) * Math.min(1, speed / def.speed) * 0.7;
    const flash = e.hurtT > 0 ? 0.7 :
      (def.exploder && e.fuse > 0 ? (Math.sin(e.fuse * 20) * 0.5 + 0.5) * Math.min(1, e.fuse) : 0);

    const base = mat4();
    translate(base, base, e.pos[0], e.pos[1], e.pos[2]);
    rotateY(base, base, e.yaw);

    for (const part of def.parts) {
      let m = mat4();
      m.set(base);
      translate(m, m, part.piv[0], part.piv[1], part.piv[2]);
      if (part.rotY) rotateY(m, m, part.rotY);
      if (part.anim === 'legA') rotateX(m, m, swing);
      else if (part.anim === 'legB') rotateX(m, m, -swing);
      else if (part.anim === 'zarm') rotateX(m, m, -Math.PI / 2 + swing * 0.3);
      if (part.down) translate(m, m, 0, -part.sz[1], 0);
      scale(m, m, part.sz[0], part.sz[1], part.sz[2]);
      draws.push({ model: m, color: col(part.col), light, flash });
    }
  }
  return { cubes: draws, sprites };
}
