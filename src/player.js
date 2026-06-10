// Player: movement physics, modes, health, mining/attack state.

import { moveEntity, inLiquid, headInBlock } from './physics.js';
import { B, I, blockDef, ITEMS, TIER_SPEED } from './blocks.js';
import { clamp } from './math.js';

const GRAV = 28, JUMP = 8.6, WALK = 4.3, SPRINT = 5.8, FLY = 11, SWIM = 3.2;

export class Player {
  constructor(mode) {
    this.pos = [0, 80, 0];
    this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = 0;
    this.w = 0.3; this.h = 1.8;
    this.eye = 1.62;
    this.mode = mode;                 // 'creative' | 'survival'
    this.flying = mode === 'creative';
    this.health = 20; this.maxHealth = 20;
    this.dead = false;
    this.onGround = false;
    this.hurtT = 0; this.regenT = 0;
    this.burnT = 0; this.fireT = 0;
    this.breakTarget = null; this.breakProgress = 0;
    this.portalT = 0; this.portalCooldown = 0;
    this.attackCD = 0;
    this.spawn = [0, 80, 0];
  }

  eyePos() { return [this.pos[0], this.pos[1] + this.eye, this.pos[2]]; }

  update(world, input, dt, sound) {
    if (this.dead) return;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.attackCD > 0) this.attackCD -= dt;
    if (this.portalCooldown > 0) this.portalCooldown -= dt;

    const swimming = inLiquid(world, this);
    const inLava = this._touchLava(world);

    // input direction in local space
    let ix = 0, iz = 0;
    if (input.has('KeyW')) iz -= 1;
    if (input.has('KeyS')) iz += 1;
    if (input.has('KeyA')) ix -= 1;
    if (input.has('KeyD')) ix += 1;
    const len = Math.hypot(ix, iz) || 1;
    ix /= len; iz /= len;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sy,-cy), right = (cy,-sy); iz is -1 when moving forward
    const wx = sy * iz + cy * ix;
    const wz = cy * iz + (-sy) * ix;

    const sprint = input.has('ControlLeft') || input.has('ControlRight');
    const sneak = input.has('ShiftLeft') || input.has('ShiftRight');

    if (this.flying) {
      const sp = FLY * (sprint ? 2 : 1);
      const ty = (input.has('Space') ? 1 : 0) - (sneak ? 1 : 0);
      this.vel[0] += (wx * sp - this.vel[0]) * Math.min(1, 10 * dt);
      this.vel[2] += (wz * sp - this.vel[2]) * Math.min(1, 10 * dt);
      this.vel[1] += (ty * sp - this.vel[1]) * Math.min(1, 10 * dt);
    } else if (swimming) {
      const sp = SWIM;
      this.vel[0] += (wx * sp - this.vel[0]) * Math.min(1, 6 * dt);
      this.vel[2] += (wz * sp - this.vel[2]) * Math.min(1, 6 * dt);
      this.vel[1] -= GRAV * 0.25 * dt;
      this.vel[1] *= (1 - Math.min(1, 2.5 * dt));
      if (input.has('Space')) this.vel[1] += 14 * dt;
      this.vel[1] = clamp(this.vel[1], -4, 4);
    } else {
      let sp = (sprint ? SPRINT : WALK) * (sneak ? 0.35 : 1);
      if (world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] - 0.5), Math.floor(this.pos[2])) === B.SOUL_SAND)
        sp *= 0.45;
      const accel = this.onGround ? 12 : 3;
      this.vel[0] += (wx * sp - this.vel[0]) * Math.min(1, accel * dt);
      this.vel[2] += (wz * sp - this.vel[2]) * Math.min(1, accel * dt);
      this.vel[1] -= GRAV * dt;
      if (input.has('Space') && this.onGround) {
        this.vel[1] = JUMP;
        if (sprint) { this.vel[0] *= 1.15; this.vel[2] *= 1.15; }
      }
    }
    this.vel[1] = Math.max(this.vel[1], -50);

    const fallSpeed = this.vel[1];
    moveEntity(world, this, dt);

    // fall damage
    if (this.onGround && fallSpeed < 0 && !swimming && this.mode === 'survival' && !this.flying) {
      const impact = -fallSpeed;
      if (impact > 13) this.damage(Math.floor((impact - 13) / 1.6), null, sound);
    }

    // lava / fire
    if (this.mode === 'survival') {
      if (inLava) {
        this.fireT = 3;
        this.burnT += dt;
        if (this.burnT > 0.5) { this.burnT = 0; this.damage(4, null, sound); }
      } else if (this.fireT > 0) {
        this.fireT -= dt;
        this.burnT += dt;
        if (this.burnT > 1) { this.burnT = 0; this.damage(1, null, sound); }
        if (swimming) this.fireT = 0;
      }
      // suffocation
      if (headInBlockSolid(world, this)) {
        this.burnT += dt;
        if (this.burnT > 1) { this.burnT = 0; this.damage(1, null, sound); }
      }
      // void
      if (this.pos[1] < -8) this.damage(4, null, sound);
      // slow regen
      if (this.health < this.maxHealth && this.hurtT <= 0) {
        this.regenT += dt;
        if (this.regenT > 4) { this.regenT = 0; this.health = Math.min(this.maxHealth, this.health + 1); }
      }
    }
  }

  _touchLava(world) {
    return inLiquid(world, this, B.LAVA);
  }

  damage(n, fromPos, sound) {
    if (this.mode === 'creative' || this.dead || n <= 0) return;
    this.health -= n;
    this.hurtT = 0.6;
    this.regenT = 0;
    if (fromPos) {
      const dx = this.pos[0] - fromPos[0], dz = this.pos[2] - fromPos[2];
      const d = Math.hypot(dx, dz) || 1;
      this.vel[0] += dx / d * 7; this.vel[2] += dz / d * 7; this.vel[1] = 5;
    }
    if (sound) sound('hurt');
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  respawn() {
    this.pos = [...this.spawn];
    this.vel = [0, 0, 0];
    this.health = this.maxHealth;
    this.dead = false;
    this.fireT = 0; this.burnT = 0;
    this.flying = this.mode === 'creative';
  }

  // seconds to break a block with the held item
  breakTime(blockId, heldItem) {
    const def = blockDef(blockId);
    if (def.hardness === Infinity) return Infinity;
    if (this.mode === 'creative') return 0.05;
    let mult = 1;
    const it = heldItem != null ? ITEMS[heldItem] : null;
    if (it && it.toolType && it.toolType === def.tool) mult = TIER_SPEED[it.tier];
    let t = def.hardness * 1.5 / mult;
    if (def.minTier > 0 && (!it || it.toolType !== def.tool || it.tier < def.minTier)) t = def.hardness * 5;
    return Math.max(0.05, t);
  }

  canHarvest(blockId, heldItem) {
    const def = blockDef(blockId);
    if (def.minTier === 0) return true;
    const it = heldItem != null ? ITEMS[heldItem] : null;
    return !!(it && it.toolType === def.tool && it.tier >= def.minTier);
  }

  attackDamage(heldItem) {
    const it = heldItem != null ? ITEMS[heldItem] : null;
    return it && it.damage ? it.damage : 1;
  }
}

function headInBlockSolid(world, p) {
  const id = world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] + p.eye), Math.floor(p.pos[2]));
  const d = blockDef(id);
  return d.opaque && d.solid;
}
