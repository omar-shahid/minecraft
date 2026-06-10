// Full-game integration test: boots main.js under jsdom with stubbed canvas
// contexts, creates a world, and drives real DOM events.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace('<script type="module" src="src/main.js"></script>', '');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.confirm = () => true;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;

// ---- canvas 2d stub (same as textures test) ----
class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this._alloc();
    this.fillStyle = '#000';
    this.imageSmoothingEnabled = true;
  }
  _alloc() {
    const n = (this.canvas.width || 300) * (this.canvas.height || 150) * 4;
    if (!this.data || this.data.length !== n) this.data = new Uint8ClampedArray(n);
  }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData(img) { this._alloc(); this.data.set(img.data.subarray(0, this.data.length)); }
  getImageData(x, y, w, h) {
    this._alloc();
    const out = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const so = ((y + j) * this.canvas.width + x + i) * 4, di = (j * w + i) * 4;
      out.set(this.data.subarray(so, so + 4), di);
    }
    return { width: w, height: h, data: out };
  }
  clearRect() { this._alloc(); }
  fillRect(x, y, w, h) {
    this._alloc();
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= this.canvas.width || j >= this.canvas.height) continue;
      const o = (j * this.canvas.width + i) * 4;
      this.data[o + 3] = 255;
    }
  }
  drawImage() { this._alloc(); }
}

// ---- WebGL2 stub: every method is a no-op, with a few real-ish returns ----
function glStub() {
  const consts = {
    COMPILE_STATUS: 1, LINK_STATUS: 2, ACTIVE_UNIFORMS: 3,
  };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'getShaderParameter' || prop === 'getProgramParameter')
        return (o, p) => (p === 3 ? 0 : true);
      if (prop === 'getActiveUniform') return () => ({ name: 'u' });
      if (prop === 'getUniformLocation') return () => ({});
      if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return () => '';
      if (prop in consts) return consts[prop];
      if (typeof prop === 'string' && prop === prop.toUpperCase()) return 1; // GL enums
      return () => ({});
    },
  });
}

const origGetContext = window.HTMLCanvasElement.prototype.getContext;
window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') {
    if (!this._ctx2d) this._ctx2d = new Ctx2D(this);
    return this._ctx2d;
  }
  if (type === 'webgl2') {
    if (!this._gl) this._gl = glStub();
    return this._gl;
  }
  return null;
};
window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,x'; };
window.HTMLCanvasElement.prototype.requestPointerLock = function () { window._locked = this; fire(); };
document.exitPointerLock = function () { window._locked = null; fire(); };
Object.defineProperty(document, 'pointerLockElement', { get: () => window._locked || null });
function fire() { document.dispatchEvent(new window.Event('pointerlockchange')); }

let failures = 0;
const check = (name, cond) => { if (cond) console.log('  ok', name); else { console.error('  FAIL', name); failures++; } };
const key = (code, type = 'keydown') =>
  document.dispatchEvent(new window.KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import('../src/main.js');
const game = window.game;
check('game booted to menu', game.state === 'menu');

// create a creative world via the menu UI
const create = [...document.querySelectorAll('#menuPanel .btn')]
  .find(b => b.textContent === 'Create New World');
document.querySelectorAll('#menuPanel input[type=text]')[1].value = 'testseed';
document.querySelector('#menuPanel select').value = 'creative';
create.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(300);   // rAF + setTimeout(30) + generation
check('world started (state=playing)', game.state === 'playing');
check('creative player flying', game.player.flying === true);

// run some frames
await sleep(200);

// --- E opens inventory with crafting/creative panel ---
key('KeyE');
check('E -> state inventory', game.state === 'inventory');
const invEl = document.getElementById('inv');
check('inventory visible', !invEl.classList.contains('hidden'));
check('creative item grid present', invEl.querySelectorAll('.grid.creative .slot').length > 20);
key('KeyE', 'keyup');
key('KeyE');
check('E again closes', game.state === 'playing');
key('KeyE', 'keyup');

// --- shift descends while flying ---
const hx = Math.floor(game.player.pos[0]), hz = Math.floor(game.player.pos[2]);
game.player.pos = [game.player.pos[0],
  Math.min(120, game.world.highestSolid(hx, hz) + 15), game.player.pos[2]];
game.player.vel = [0, 0, 0];
const y0 = game.player.pos[1];
key('ShiftLeft');
await sleep(400);
key('ShiftLeft', 'keyup');
check(`shift descends while flying (${y0.toFixed(1)} -> ${game.player.pos[1].toFixed(1)})`,
  game.player.pos[1] < y0 - 0.5);

// --- creative inventory shows BOTH item grid and crafting list ---
key('ShiftLeft', 'keyup');
key('KeyE');
check('creative shows crafting list', document.querySelectorAll('#inv .recipe').length > 30);
check('creative item grid has spawn eggs',
  document.querySelectorAll('#inv .grid.creative .slot').length > 70);
key('KeyE', 'keyup'); key('KeyE'); key('KeyE', 'keyup');   // close

// --- double-tap space toggles flying ---
check('flying before double-tap', game.player.flying === true);
key('Space'); key('Space', 'keyup');
key('Space'); key('Space', 'keyup');
check('double-tap space toggles flying off', game.player.flying === false);
key('Space'); key('Space', 'keyup');
await sleep(350);
key('Space'); key('Space', 'keyup');
key('Space'); key('Space', 'keyup');
check('double-tap space toggles flying back on', game.player.flying === true);

// --- spawn egg spawns a mob ---
const { I, B } = await import('../src/blocks.js');
const { blockDef } = await import('../src/blocks.js');
game.inv.slots[0] = { id: I.EGG_CREEPER, count: 1 };
game.inv.selected = 0;
const gx = Math.floor(game.player.pos[0]), gz = Math.floor(game.player.pos[2]);
game.player.pos[1] = game.world.highestSolid(gx, gz) + 1.2;
game.player.pitch = -1.2;  // look down at the ground
game.placeCD = 0;
const before = game.entities.filter(e => e.kind === 'mob').length;
game.useItem();
const after = game.entities.filter(e => e.kind === 'mob').length;
check('spawn egg spawns a creeper', after === before + 1 &&
  game.entities.some(e => e.type === 'creeper'));

// --- mining a flower drops a flower (not dirt) ---
game.entities.length = 0;                       // remove the creeper from the crosshair
const p = game.player.pos.map(Math.floor);
game.world.setBlock(p[0], p[1], p[2] - 2, B.GRASS, false);
game.world.setBlock(p[0], p[1] + 1, p[2] - 2, B.FLOWER_RED, false);
game.world.setBlock(p[0], p[1] + 1, p[2] - 1, B.AIR, false);  // clear line of sight
game.world.setBlock(p[0], p[1] + 2, p[2] - 1, B.AIR, false);
game.player.pos = [p[0] + 0.5, p[1] + 0.2, p[2] + 0.5];
// aim at the flower cell centre from the eye
const eyeY = p[1] + 0.2 + 1.62;
game.player.pitch = Math.atan2((p[1] + 1.5) - eyeY, 1.5);
game.player.yaw = 0;       // facing -z toward the flower
game.player.mode = 'survival';
game.mouse.left = true;
await sleep(300);
game.mouse.left = false;
game.player.mode = 'creative';
const drops = game.entities.filter(e => e.kind === 'item');
check('flower mined within hold window', game.world.getBlock(p[0], p[1] + 1, p[2] - 2) === B.AIR);
check('flower drops a rose item', drops.some(d => d.item === B.FLOWER_RED));
check('no dirt dropped', !drops.some(d => d.item === B.DIRT));

// --- item drops render as sprites ---
const { buildEntityDraws } = await import('../src/mobs.js');
const { cubes, sprites } = buildEntityDraws(game.entities, game.world, 1, game.iconUV);
check('item drops are sprites with uv coords', sprites.length > 0 &&
  Array.isArray(sprites[0].uv) && sprites[0].uv.length === 2);

// --- pause via escape ---
window._locked = null; fire();
check('pointer unlock pauses', game.state === 'paused');

console.log(failures ? `\n${failures} FAILURES` : '\nINTEGRATION TESTS PASSED');
process.exit(failures ? 1 : 0);
