// WebCraft — game orchestration: state machine, game loop, input, chunk
// streaming, combat, portals, day/night, saving.

import { B, I, blockDef, ITEMS, itemName } from './blocks.js';
import { buildAtlas, buildIcons } from './textures.js';
import { World, CX, CZ, H } from './world.js';
import { SEA } from './worldgen.js';
import { meshChunk } from './mesher.js';
import { Renderer } from './renderer.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { UI } from './ui.js';
import { playSound, setSoundEnabled } from './sound.js';
import {
  MOB_TYPES, makeMob, makeItemDrop, makeArrow, updateEntity, hurtMob,
  trySpawn, buildEntityDraws,
} from './mobs.js';
import { strSeed, mulberry32, clamp, mat4, translate, scale } from './math.js';

const SETTINGS_KEY = 'webcraft:settings';
const INDEX_KEY = 'webcraft:worlds';
const WORLD_KEY = (n) => 'webcraft:world:' + n;

const defaultSettings = { renderDist: 6, fov: 75, sens: 1, dayLen: 600, sound: true };

function loadSettings() {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...defaultSettings }; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function loadIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); }
  catch { return []; }
}
function saveIndex(idx) { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); }

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    const atlas = buildAtlas();
    const { icons, colors } = buildIcons(atlas);
    this.itemColors = (id) => colors[id] || [0.6, 0.6, 0.6];
    this.renderer = new Renderer(this.canvas, atlas);
    this.ui = new UI(icons);
    this.settings = loadSettings();
    setSoundEnabled(this.settings.sound);

    this.state = 'menu';
    this.input = new Set();
    this.mouse = { left: false, right: false };
    this.meta = null;            // current world meta
    this.worlds = null;          // {over: World, nether: World}
    this.world = null;           // active dimension
    this.player = null;
    this.inv = null;
    this.entities = [];
    this.primedTNT = [];
    this.time = 60;              // world time (seconds)
    this.spawnTimer = 0;
    this.saveTimer = 0;
    this.placeCD = 0;
    this.lastHealth = -1;
    this.fps = 0; this._frames = 0; this._fpsT = 0;
    this.spawnRng = mulberry32(12345);

    this.bindEvents();
    this.showMenu();

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------------- menu / lifecycle ----------------

  showMenu() {
    this.state = 'menu';
    this.ui.showHUD(false);
    const metas = loadIndex().map(n => {
      try { const d = JSON.parse(localStorage.getItem(WORLD_KEY(n))); return d && { name: n, seed: d.seed, mode: d.mode, dim: d.dim }; }
      catch { return null; }
    }).filter(Boolean);
    this.ui.showMenu(metas, {
      onPlay: (w) => this.startWorld(w.name),
      onCreate: (name, seed, mode) => this.createWorld(name, seed, mode),
      onDelete: (w) => {
        localStorage.removeItem(WORLD_KEY(w.name));
        saveIndex(loadIndex().filter(n => n !== w.name));
        this.showMenu();
      },
      onSettings: () => this.openSettings(() => {}),
    });
  }

  openSettings(onClose) {
    this.ui.showSettings(this.settings, (key, v) => {
      if (key === 'sound') setSoundEnabled(v);
      saveSettings(this.settings);
    }, onClose);
  }

  createWorld(name, seedStr, mode) {
    let n = name, i = 2;
    const idx = loadIndex();
    while (idx.includes(n)) n = `${name} (${i++})`;
    const seed = seedStr || String((Math.random() * 1e9) | 0);
    const data = {
      seed, mode, dim: 'over', time: 60,
      player: null, inventory: null,
      dims: { over: { edits: {}, portals: [] }, nether: { edits: {}, portals: [] } },
    };
    localStorage.setItem(WORLD_KEY(n), JSON.stringify(data));
    saveIndex([...idx, n]);
    this.startWorld(n);
  }

  startWorld(name) {
    let data;
    try { data = JSON.parse(localStorage.getItem(WORLD_KEY(name))); } catch { }
    if (!data) return;
    this.ui.hideMenu();
    this.ui.showLoading(true);

    // double-deferred so the loading screen paints before generation blocks
    requestAnimationFrame(() => setTimeout(() => {
      this.meta = { name };
      this.seedStr = data.seed;
      const seedNum = strSeed(data.seed);
      this.worlds = {
        over: new World(seedNum, 'over'),
        nether: new World(seedNum ^ 0x6e657468, 'nether'),
      };
      for (const dim of ['over', 'nether']) {
        const d = data.dims[dim];
        if (d) {
          for (const [k, edits] of Object.entries(d.edits)) {
            const m = new Map();
            for (const [i, id] of Object.entries(edits)) m.set(+i, id);
            this.worlds[dim].edits.set(+k, m);
          }
          this.worlds[dim].portals = d.portals || [];
        }
      }
      this.world = this.worlds[data.dim || 'over'];
      this.time = data.time || 60;
      this.mode = data.mode;
      this.player = new Player(data.mode);
      this.inv = data.inventory ? Inventory.deserialize(data.inventory) : new Inventory();
      this.entities = [];
      this.primedTNT = [];

      if (data.player) {
        this.player.pos = data.player.pos;
        this.player.yaw = data.player.yaw;
        this.player.pitch = data.player.pitch;
        this.player.health = data.player.health;
        this.player.spawn = data.player.spawn;
      } else {
        // find a dry spawn
        const gen = this.worlds.over.gen;
        let sx = 8;
        for (; sx < 4000; sx += 16) if (gen.height(sx, 8) > SEA + 1) break;
        const sy = gen.surfaceY(sx, 8);
        this.player.pos = [sx + 0.5, sy + 0.5, 8.5];
        this.player.spawn = [...this.player.pos];
        if (data.mode === 'survival') {
          this.inv.add(I.WOOD_PICK, 1);
          this.inv.add(I.WOOD_SWORD, 1);
          this.inv.add(B.TORCH, 8);
        }
      }

      // synchronous initial area
      const pcx = Math.floor(this.player.pos[0]) >> 4, pcz = Math.floor(this.player.pos[2]) >> 4;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++)
        this.world.ensureChunk(pcx + dx, pcz + dz);

      this.ui.showLoading(false);
      this.ui.showHUD(true);
      this.ui.updateHotbar(this.inv);
      this.ui.updateHearts(this.player);
      this.state = 'playing';
      this.lockPointer();
      this.ui.hint(data.mode === 'creative'
        ? 'Creative mode — press F to toggle flying, E for items'
        : 'Survival — punch trees, watch out at night!');
    }, 30));
  }

  save() {
    if (!this.meta) return;
    const dims = {};
    for (const dim of ['over', 'nether']) {
      const w = this.worlds[dim];
      const edits = {};
      for (const [k, m] of w.edits) {
        const o = {};
        for (const [i, id] of m) o[i] = id;
        edits[k] = o;
      }
      dims[dim] = { edits, portals: w.portals };
    }
    const data = {
      seed: this.seedStr,
      mode: this.mode, dim: this.world.dim, time: this.time,
      player: {
        pos: this.player.pos, yaw: this.player.yaw, pitch: this.player.pitch,
        health: this.player.health, spawn: this.player.spawn,
      },
      inventory: this.inv.serialize(),
      dims,
    };
    try { localStorage.setItem(WORLD_KEY(this.meta.name), JSON.stringify(data)); }
    catch (e) { console.warn('save failed', e); }
  }

  quitToTitle() {
    this.save();
    document.exitPointerLock && document.exitPointerLock();
    this.ui.hidePause();
    this.ui.hideDeath();
    this.ui.closeInventory();
    this.ui.showHUD(false);
    // free GPU meshes
    for (const key of [...this.renderer.meshes.keys()]) this.renderer.deleteChunk(key);
    this.worlds = null; this.world = null; this.player = null;
    this.entities = [];
    this.showMenu();
  }

  // ---------------- input ----------------

  bindEvents() {
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('beforeunload', () => { if (this.state !== 'menu') this.save(); });

    document.addEventListener('keydown', (e) => {
      if (this.state === 'menu') return;
      this.input.add(e.code);
      if (e.code === 'Escape') {
        if (this.state === 'inventory') this.closeInventory();
        else if (this.state === 'playing') this.pause();
        // guard against the same Esc press that exited pointer lock re-resuming
        else if (this.state === 'paused' && performance.now() - (this._pausedAt || 0) > 300)
          this.resume();
        return;
      }
      if (this.state !== 'playing' && this.state !== 'inventory') return;
      if (e.code === 'KeyE') {
        if (this.state === 'inventory') this.closeInventory();
        else this.openInventory();
      }
      if (this.state !== 'playing') return;
      if (e.code.startsWith('Digit')) {
        const d = +e.code.slice(5);
        if (d >= 1 && d <= 9) { this.inv.selected = d - 1; this.ui.updateHotbar(this.inv); }
      }
      if (e.code === 'KeyF' && this.player.mode === 'creative') {
        this.player.flying = !this.player.flying;
        this.ui.hint(this.player.flying ? 'Flying enabled' : 'Flying disabled', 1000);
      }
      if (e.code === 'F3') { e.preventDefault(); this.ui.toggleDebug(); }
      if (e.code === 'KeyQ') this.dropHeld();
    });
    document.addEventListener('keyup', (e) => this.input.delete(e.code));
    window.addEventListener('blur', () => this.input.clear());

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== this.canvas) { this.lockPointer(); return; }
      if (e.button === 0) { this.mouse.left = true; this.attack(); }
      if (e.button === 2) { this.mouse.right = true; this.useItem(); }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('wheel', (e) => {
      if (this.state !== 'playing') return;
      this.inv.selected = (this.inv.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
      this.ui.updateHotbar(this.inv);
    });
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || document.pointerLockElement !== this.canvas) return;
      const s = 0.0022 * this.settings.sens;
      this.player.yaw -= e.movementX * s;
      this.player.pitch = clamp(this.player.pitch - e.movementY * s, -1.55, 1.55);
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.state === 'playing')
        this.pause();
    });
  }

  lockPointer() {
    if (document.pointerLockElement !== this.canvas)
      this.canvas.requestPointerLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this._pausedAt = performance.now();
    document.exitPointerLock && document.exitPointerLock();
    this.ui.showPause({
      onResume: () => this.resume(),
      onSettings: () => this.openSettings(() => {}),
      onQuit: () => this.quitToTitle(),
    });
  }

  resume() {
    this.ui.hidePause();
    this.state = 'playing';
    this.lockPointer();
  }

  openInventory() {
    this.state = 'inventory';
    document.exitPointerLock && document.exitPointerLock();
    this.ui.openInventory(this.inv, {
      creative: this.player.mode === 'creative',
      nearTable: this.nearCraftingTable(),
      onChange: () => this.ui.updateHotbar(this.inv),
    });
  }

  closeInventory() {
    this.ui.closeInventory();
    this.ui.updateHotbar(this.inv);
    this.state = 'playing';
    this.lockPointer();
  }

  nearCraftingTable() {
    const p = this.player.pos.map(Math.floor);
    for (let y = -2; y <= 2; y++) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++)
      if (this.world.getBlock(p[0] + x, p[1] + y, p[2] + z) === B.CRAFTING) return true;
    return false;
  }

  // ---------------- combat / interaction ----------------

  rayTarget(hitFluid = false) {
    const eye = this.player.eyePos();
    const cp = Math.cos(this.player.pitch), sp = Math.sin(this.player.pitch);
    const sy = Math.sin(this.player.yaw), cy = Math.cos(this.player.yaw);
    const dir = [-sy * cp, sp, -cy * cp];
    const reach = this.player.mode === 'creative' ? 6 : 4.7;
    return { hit: this.world.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], reach, hitFluid), dir, eye };
  }

  mobInCrosshair(maxDist = 3.6) {
    const { dir, eye } = this.rayTarget();
    let best = null, bestT = maxDist;
    for (const e of this.entities) {
      if (e.kind !== 'mob' || e.dead) continue;
      const t = rayAABB(eye, dir, [e.pos[0] - e.w, e.pos[1], e.pos[2] - e.w],
        [e.pos[0] + e.w, e.pos[1] + e.h, e.pos[2] + e.w]);
      if (t !== null && t < bestT) { bestT = t; best = e; }
    }
    // make sure no block is in the way
    if (best) {
      const { hit } = this.rayTarget();
      if (hit && hit.dist < bestT) return null;
    }
    return best;
  }

  attack() {
    if (this.player.dead || this.player.attackCD > 0) return;
    const mob = this.mobInCrosshair();
    if (mob) {
      this.player.attackCD = 0.35;
      hurtMob(mob, this.player.attackDamage(this.inv.heldId()), this.player.pos, this.ctx());
      return;
    }
    // mining is handled continuously in update()
  }

  useItem() {
    if (this.player.dead || this.placeCD > 0) return;
    const held = this.inv.held();
    const heldId = held ? held.id : null;
    const it = heldId != null && heldId >= 100 ? ITEMS[heldId] : null;
    const { hit } = this.rayTarget();

    // food
    if (it && it.type === 'food') {
      if (this.player.mode === 'survival' && this.player.health < this.player.maxHealth) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + it.food);
        this.inv.consumeHeld();
        this.ui.updateHotbar(this.inv);
        playSound('eat');
        this.placeCD = 0.4;
      } else this.ui.hint('Health is already full', 1200);
      return;
    }
    // bow
    if (heldId === I.BOW) {
      if (this.player.mode === 'creative' || this.inv.count(I.ARROW) > 0) {
        if (this.player.mode !== 'creative') { this.inv.remove(I.ARROW, 1); this.ui.updateHotbar(this.inv); }
        const { dir, eye } = this.rayTarget();
        this.entities.push(makeArrow(eye[0], eye[1] - 0.1, eye[2],
          [dir[0] * 30, dir[1] * 30, dir[2] * 30], true));
        playSound('bow');
        this.placeCD = 0.5;
      } else this.ui.hint('No arrows!', 1200);
      return;
    }
    if (!hit) return;

    // crafting table opens crafting
    if (hit.id === B.CRAFTING && !this.input.has('ShiftLeft')) {
      this.openInventory();
      return;
    }
    // flint & steel: portals + TNT
    if (heldId === I.FLINT_STEEL) {
      if (hit.id === B.TNT) {
        this.world.setBlock(hit.x, hit.y, hit.z, B.AIR);
        this.primedTNT.push({ x: hit.x, y: hit.y, z: hit.z, t: 1.5 });
        playSound('fuse');
        this.placeCD = 0.3;
        return;
      }
      if (this.world.ignitePortal(hit.px, hit.py, hit.pz)) {
        playSound('portal');
        this.ui.hint('Portal activated!');
      }
      this.placeCD = 0.3;
      return;
    }
    // block placement
    if (heldId != null && heldId < 100 && blockDef(heldId).placeable) {
      const { px, py, pz } = hit;
      const prev = this.world.getBlock(px, py, pz);
      const prevDef = blockDef(prev);
      if (prev !== B.AIR && !prevDef.liquid && prevDef.model !== 'cross') return;
      // don't place inside entities
      const bb = (e) => px + 1 > e.pos[0] - e.w && px < e.pos[0] + e.w &&
        py + 1 > e.pos[1] && py < e.pos[1] + e.h &&
        pz + 1 > e.pos[2] - e.w && pz < e.pos[2] + e.w;
      if (blockDef(heldId).solid) {
        if (bb(this.player)) return;
        for (const e of this.entities) if (e.kind === 'mob' && bb(e)) return;
      }
      this.world.setBlock(px, py, pz, heldId);
      if (this.player.mode === 'survival') { this.inv.consumeHeld(); this.ui.updateHotbar(this.inv); }
      playSound('place');
      this.placeCD = 0.22;
    }
  }

  dropHeld() {
    const held = this.inv.held();
    if (!held) return;
    const { dir, eye } = this.rayTarget();
    this.entities.push(makeItemDrop(held.id, 1, eye[0] + dir[0], eye[1] - 0.3, eye[2] + dir[2],
      [dir[0] * 6, 2.5, dir[2] * 6]));
    this.inv.consumeHeld();
    this.ui.updateHotbar(this.inv);
  }

  ctx() {
    return {
      player: this.player,
      dayFactor: this.dayFactor(),
      damagePlayer: (n, srcPos) => {
        this.player.damage(n, srcPos, playSound);
        this.ui.damageFlash();
      },
      explode: (x, y, z, r, maxDmg) => this.explosion(x, y, z, r, maxDmg),
      shootArrow: (a) => this.entities.push(a),
      sound: playSound,
      dropItem: (id, count, x, y, z) => this.entities.push(makeItemDrop(id, count, x, y, z)),
    };
  }

  explosion(x, y, z, r, maxDmg) {
    playSound('explode');
    const destroyed = this.world.explode(x, y, z, r);
    // chain-prime TNT
    for (const d of destroyed) {
      if (d.id === B.TNT) this.primedTNT.push({ x: d.x, y: d.y, z: d.z, t: 0.3 + Math.random() * 0.5 });
      else if (Math.random() < 0.3 && this.player.mode === 'survival') {
        const def = blockDef(d.id);
        const dropId = dropOf(def);
        if (dropId != null) this.entities.push(makeItemDrop(dropId, 1, d.x + 0.5, d.y + 0.5, d.z + 0.5));
      }
    }
    // damage entities
    const hurt = (pos) => {
      const dist = Math.hypot(pos[0] - x, pos[1] - y, pos[2] - z);
      return dist < r * 1.8 ? Math.round(maxDmg * (1 - dist / (r * 1.8))) : 0;
    };
    const pd = hurt([this.player.pos[0], this.player.pos[1] + 1, this.player.pos[2]]);
    if (pd > 0) { this.player.damage(pd, [x, y, z], playSound); this.ui.damageFlash(); }
    for (const e of this.entities) {
      if (e.kind !== 'mob' || e.dead) continue;
      const d = hurt(e.pos);
      if (d > 0) hurtMob(e, d, [x, y, z], this.ctx());
    }
  }

  switchDimension() {
    const from = this.world;
    const toDim = from.dim === 'over' ? 'nether' : 'over';
    const to = this.worlds[toDim];
    const scaleF = toDim === 'nether' ? 1 / 8 : 8;
    const tx = Math.floor(this.player.pos[0] * scaleF);
    const tz = Math.floor(this.player.pos[2] * scaleF);

    this.ui.setPortalFade(1);
    playSound('portal');
    setTimeout(() => {
      // pre-generate destination
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        to.ensureChunk((tx >> 4) + dx, (tz >> 4) + dz);
      let portal = to.nearestPortal(tx, tz, 48);
      if (!portal) portal = to.buildPortal(tx, tz);
      this.world = to;
      this.entities = [];
      this.primedTNT = [];
      this.player.pos = [portal.x + 0.5, portal.y + 0.05, portal.z + 0.5];
      this.player.vel = [0, 0, 0];
      this.player.portalCooldown = 4;
      // rebuild meshes for the new dimension
      for (const key of [...this.renderer.meshes.keys()]) this.renderer.deleteChunk(key);
      for (const c of to.chunks.values()) if (c.generated) to.markDirty(c.cx, c.cz);
      this.ui.hint(toDim === 'nether' ? 'Entering the Nether...' : 'Returning to the Overworld...');
      setTimeout(() => this.ui.setPortalFade(0), 400);
      this.save();
    }, 450);
  }

  // ---------------- per-frame ----------------

  dayFactor() {
    if (!this.world || this.world.dim === 'nether') return 0;
    const t = (this.time / this.settings.dayLen) % 1;
    const elev = Math.sin(t * Math.PI * 2);
    return clamp((elev + 0.12) / 0.24, 0, 1);
  }

  sunDir() {
    const t = ((this.time / this.settings.dayLen) % 1) * Math.PI * 2;
    const d = [Math.cos(t), Math.sin(t), 0.25];
    const l = Math.hypot(...d);
    return d.map(v => v / l);
  }

  frame(dt) {
    this._frames++;
    this._fpsT += dt;
    if (this._fpsT > 0.5) { this.fps = Math.round(this._frames / this._fpsT); this._frames = 0; this._fpsT = 0; }

    if (this.state === 'menu' || !this.world) return;

    const simulate = this.state === 'playing' || this.state === 'inventory';
    if (simulate && !this.player.dead) {
      this.time += dt;
      this.update(dt);
    }

    this.streamChunks();
    this.remeshDirty();
    this.renderFrame(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 25) { this.saveTimer = 0; this.save(); }
  }

  update(dt) {
    const p = this.player;
    if (this.placeCD > 0) this.placeCD -= dt;

    if (this.state === 'playing') {
      p.update(this.world, this.input, dt, playSound);
    } else {
      p.update(this.world, new Set(), dt, playSound);
    }

    if (p.dead && this.state !== 'dead') {
      this.state = 'dead';
      playSound('death');
      document.exitPointerLock && document.exitPointerLock();
      this.ui.showDeath({
        onRespawn: () => {
          p.respawn();
          this.world = this.worlds.over;
          this.ui.hideDeath();
          this.ui.updateHearts(p);
          for (const key of [...this.renderer.meshes.keys()]) this.renderer.deleteChunk(key);
          for (const c of this.world.chunks.values())
            if (c.generated) this.world.markDirty(c.cx, c.cz);
          this.state = 'playing';
          this.lockPointer();
        },
        onQuit: () => this.quitToTitle(),
      });
      return;
    }

    // mining
    if (this.state === 'playing' && this.mouse.left && !this.mobInCrosshair()) {
      const { hit } = this.rayTarget();
      if (hit && blockDef(hit.id).hardness !== Infinity) {
        const key = hit.x + ',' + hit.y + ',' + hit.z;
        if (p.breakTarget !== key) { p.breakTarget = key; p.breakProgress = 0; }
        p.breakProgress += dt / p.breakTime(hit.id, this.inv.heldId());
        if (p.breakProgress >= 1) {
          p.breakTarget = null; p.breakProgress = 0;
          this.world.setBlock(hit.x, hit.y, hit.z, B.AIR);
          playSound('break');
          if (p.mode === 'survival' && p.canHarvest(hit.id, this.inv.heldId())) {
            const def = blockDef(hit.id);
            const drops = rollDrops(def);
            for (const { id, count } of drops)
              this.entities.push(makeItemDrop(id, count, hit.x + 0.5, hit.y + 0.3, hit.z + 0.5));
          }
        }
      } else { p.breakTarget = null; p.breakProgress = 0; }
    } else { p.breakTarget = null; p.breakProgress = 0; }

    // hold-to-place
    if (this.state === 'playing' && this.mouse.right && this.placeCD <= 0) this.useItem();

    // portal travel
    const inPortal = this.world.getBlock(
      Math.floor(p.pos[0]), Math.floor(p.pos[1] + 0.5), Math.floor(p.pos[2])) === B.PORTAL;
    if (inPortal && p.portalCooldown <= 0) {
      p.portalT += dt;
      this.ui.setPortalFade(Math.min(0.7, p.portalT));
      if (p.portalT > 0.9) { p.portalT = 0; this.switchDimension(); }
    } else if (!inPortal) {
      if (p.portalT > 0) { p.portalT = 0; this.ui.setPortalFade(0); }
    }

    // TNT
    for (const t of this.primedTNT) {
      t.t -= dt;
      if (t.t <= 0) this.explosion(t.x + 0.5, t.y + 0.5, t.z + 0.5, 4, 24);
    }
    this.primedTNT = this.primedTNT.filter(t => t.t > 0);

    // entities
    const ctx = this.ctx();
    for (const e of this.entities) {
      if (e.dead) continue;
      updateEntity(e, this.world, dt, ctx);
      // player arrows hitting mobs
      if (e.kind === 'arrow' && e.fromPlayer && !e.stuck && !e.dead) {
        for (const m of this.entities) {
          if (m.kind !== 'mob' || m.dead) continue;
          if (Math.abs(e.pos[0] - m.pos[0]) < m.w + 0.2 && Math.abs(e.pos[2] - m.pos[2]) < m.w + 0.2 &&
              e.pos[1] > m.pos[1] - 0.2 && e.pos[1] < m.pos[1] + m.h + 0.2) {
            hurtMob(m, 6, [e.pos[0] - e.vel[0], e.pos[1], e.pos[2] - e.vel[2]], ctx);
            e.dead = true;
            break;
          }
        }
      }
      // item pickup
      if (e.kind === 'item' && e.t > 0.6 && !p.dead) {
        const d = Math.hypot(e.pos[0] - p.pos[0], e.pos[1] - (p.pos[1] + 0.8), e.pos[2] - p.pos[2]);
        if (d < 2.2) {
          // magnet
          e.pos[0] += (p.pos[0] - e.pos[0]) * 10 * dt;
          e.pos[1] += (p.pos[1] + 0.8 - e.pos[1]) * 10 * dt;
          e.pos[2] += (p.pos[2] - e.pos[2]) * 10 * dt;
        }
        if (d < 0.9) {
          const left = this.inv.add(e.item, e.count);
          if (left < e.count) { playSound('pickup'); this.ui.updateHotbar(this.inv); }
          if (left === 0) e.dead = true;
          else e.count = left;
        }
      }
    }
    this.entities = this.entities.filter(e => !e.dead);

    // mob spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      trySpawn(this.world, p, this.entities, this.dayFactor(), this.spawnRng);
    }

    // HUD
    if (p.health !== this.lastHealth) {
      this.lastHealth = p.health;
      this.ui.updateHearts(p);
    }
    this.ui.setFire(p.fireT > 0);
    const headId = this.world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] + p.eye), Math.floor(p.pos[2]));
    this.ui.setUnderwater(headId === B.WATER);
    this.ui.breakProgress(p.breakTarget && p.breakProgress > 0.02 ? Math.min(1, p.breakProgress) : null);
  }

  streamChunks() {
    const p = this.player;
    const pcx = Math.floor(p.pos[0]) >> 4, pcz = Math.floor(p.pos[2]) >> 4;
    const R = this.settings.renderDist;
    // generate nearest missing chunks within a time budget
    const t0 = performance.now();
    outer:
    for (let r = 0; r <= R; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!this.world.hasChunk(pcx + dx, pcz + dz)) {
          this.world.ensureChunk(pcx + dx, pcz + dz);
          if (performance.now() - t0 > 10) break outer;
        }
      }
    }
    // unload far chunks
    if ((this._unloadT = (this._unloadT || 0) + 1) % 120 === 0) {
      for (const [key, c] of this.world.chunks) {
        if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > R + 4) {
          this.world.chunks.delete(key);
          this.world._lastChunk = null;
          this.renderer.deleteChunk(key);
          this.world.dirty.delete(key);
        }
      }
    }
  }

  remeshDirty() {
    const t0 = performance.now();
    for (const key of this.world.dirty) {
      this.world.dirty.delete(key);
      const c = this.world.chunks.get(key);
      if (!c || !c.generated) continue;
      const mesh = meshChunk(this.world, c.cx, c.cz);
      this.renderer.updateChunk(key, c.cx, c.cz, mesh);
      if (performance.now() - t0 > 9) break;
    }
  }

  renderFrame(dt) {
    const p = this.player;
    const day = this.world.dim === 'nether' ? 0 : this.dayFactor();
    const { hit } = this.rayTarget();

    const draws = buildEntityDraws(this.entities, this.world, this.dayFactor(), this.itemColors);
    // primed TNT rendering
    for (const t of this.primedTNT) {
      const m = mat4();
      translate(m, m, t.x + 0.5, t.y, t.z + 0.5);
      scale(m, m, 1, 1, 1);
      const flash = Math.sin(t.t * 25) > 0 ? 0.9 : 0;
      draws.push({ model: m, color: [0.85, 0.2, 0.15], light: 1, flash });
    }

    this.renderer.render({
      camPos: p.eyePos(),
      yaw: p.yaw, pitch: p.pitch,
      fov: this.settings.fov,
      renderDist: this.settings.renderDist,
      dayFactor: clamp(day, 0.03, 1),
      sunDir: this.sunDir(),
      dim: this.world.dim,
      time: this.time,
      selection: this.state === 'playing' && hit ? hit : null,
      entityDraws: draws,
      underwater: this.world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] + p.eye), Math.floor(p.pos[2])) === B.WATER,
    });

    if (!document.getElementById('debug').classList.contains('hidden')) {
      const t = ((this.time / this.settings.dayLen) % 1 * 24) | 0;
      this.ui.setDebug(
        `fps ${this.fps}\n` +
        `xyz ${p.pos.map(v => v.toFixed(1)).join(' / ')}\n` +
        `dim ${this.world.dim}  time ${t}:00\n` +
        `chunks ${this.world.chunks.size}  meshes ${this.renderer.meshes.size}\n` +
        `entities ${this.entities.length}  mode ${p.mode}${p.flying ? ' (flying)' : ''}`
      );
    }
  }
}

function dropOf(def) {
  if (def.drops === null) return def.id;
  if (Array.isArray(def.drops)) {
    if (def.drops.length === 0) return null;
    return def.drops[0].id;
  }
  return def.drops;
}

function rollDrops(def) {
  if (def.drops === null) return [{ id: def.id, count: 1 }];
  if (typeof def.drops === 'number') return [{ id: def.drops, count: 1 }];
  if (Array.isArray(def.drops)) {
    if (def.drops.length === 0) return [];
    // chance table: pick one entry
    let roll = Math.random(), acc = 0;
    for (const d of def.drops) {
      acc += d.chance;
      if (roll < acc) return [{ id: d.id, count: d.count }];
    }
    return [];
  }
  return [];
}

function rayAABB(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

window.game = new Game();
