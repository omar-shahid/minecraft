// Exercises atlas + icon generation under a minimal canvas stub.
class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    this.fillStyle = '#000';
    this.imageSmoothingEnabled = true;
  }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData(img) { this.data.set(img.data.subarray(0, this.data.length)); }
  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const so = ((y + j) * this.canvas.width + x + i) * 4, di = (j * w + i) * 4;
      out.set(this.data.subarray(so, so + 4), di);
    }
    return { width: w, height: h, data: out };
  }
  clearRect(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
      this.data.fill(0, (j * this.canvas.width + i) * 4, (j * this.canvas.width + i) * 4 + 4);
  }
  _color() {
    const h = this.fillStyle;
    if (h.startsWith('#')) {
      const s = h.length === 4 ? h.replace(/([0-9a-f])/gi, '$1$1') : h;
      const n = parseInt(s.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return [128, 128, 128];
  }
  fillRect(x, y, w, h) {
    const c = this._color();
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= this.canvas.width || j >= this.canvas.height)
        throw new Error(`fillRect out of bounds ${i},${j}`);
      const o = (j * this.canvas.width + i) * 4;
      this.data[o] = c[0]; this.data[o + 1] = c[1]; this.data[o + 2] = c[2]; this.data[o + 3] = 255;
    }
  }
  drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) {
    const sctx = src._ctx;
    for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
      const so = ((sy + j) * src.width + sx + i) * 4;
      const dofs = ((dy + j) * this.canvas.width + dx + i) * 4;
      this.data.set(sctx.data.subarray(so, so + 4), dofs);
    }
  }
}
class Canvas {
  constructor() { this.width = 0; this.height = 0; this._ctx = null; }
  getContext() { return this._ctx || (this._ctx = new Ctx2D(this)); }
  toDataURL() { return 'data:image/png;base64,stub'; }
}
globalThis.document = { createElement: (t) => { if (t !== 'canvas') throw new Error(t); return new Canvas(); } };

const { buildAtlas, buildIcons } = await import('../src/textures.js');
const { TILES, CREATIVE_ITEMS } = await import('../src/blocks.js');

let failures = 0;
const check = (name, cond) => { if (cond) console.log('  ok', name); else { console.error('  FAIL', name); failures++; } };

const atlas = buildAtlas();
check('atlas is 256x256', atlas.width === 256 && atlas.height === 256);
// every tile painted something
const ctx = atlas.getContext('2d');
for (let i = 0; i < TILES.length; i++) {
  const tx = (i % 16) * 16, ty = ((i / 16) | 0) * 16;
  const d = ctx.getImageData(tx, ty, 16, 16).data;
  let any = false;
  for (let k = 3; k < d.length; k += 4) if (d[k] > 0) { any = true; break; }
  if (!any) { console.error('  FAIL empty tile', TILES[i]); failures++; }
}
console.log('  ok all', TILES.length, 'tiles painted');

const { icons, colors } = buildIcons(atlas);
for (const id of CREATIVE_ITEMS) {
  if (!icons[id]) { console.error('  FAIL missing icon for item', id); failures++; }
  if (!colors[id]) { console.error('  FAIL missing color for item', id); failures++; }
}
check('icons for all creative items', true);
check('grass color greenish', colors[2][1] > colors[2][2]);

console.log(failures === 0 ? '\nTEXTURE TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
