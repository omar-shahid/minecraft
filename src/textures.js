// Procedural pixel-art texture atlas + item icons. Everything is generated on
// canvases at startup — the game ships zero binary assets.

import { TILES, ITEMS, I, blockDef } from './blocks.js';
import { mulberry32 } from './math.js';

export const ATLAS_TILES = 16;      // tiles per atlas row
export const TILE_PX = 16;

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Each painter receives px(x, y, color, [alpha]) and rng.
function speckle(base, amount, rng, px, alt) {
  const b = hex(base), a = alt ? hex(alt) : b;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const m = 1 - amount + rng() * amount * 2;
      const c = rng() < 0.18 && alt ? a : b;
      px(x, y, [c[0] * m, c[1] * m, c[2] * m]);
    }
}

function oreTile(px, rng, oreColor) {
  speckle('#7d7d7d', 0.12, rng, px);
  const c = hex(oreColor);
  for (let i = 0; i < 5; i++) {
    const ox = 2 + (rng() * 12) | 0, oy = 2 + (rng() * 12) | 0;
    px(ox, oy, c); px(ox + 1, oy, c); px(ox, oy + 1, c);
    if (rng() < 0.5) px(ox + 1, oy + 1, c);
  }
}

const PAINTERS = {
  grass_top: (px, rng) => speckle('#5cab38', 0.15, rng, px, '#4e9930'),
  grass_side: (px, rng) => {
    speckle('#8b6244', 0.13, rng, px, '#79553c');
    for (let x = 0; x < 16; x++) {
      const d = 2 + (rng() * 3) | 0;
      for (let y = 0; y < d; y++) {
        const m = 0.85 + rng() * 0.3;
        px(x, y, [92 * m, 171 * m, 56 * m]);
      }
    }
  },
  dirt: (px, rng) => speckle('#8b6244', 0.15, rng, px, '#79553c'),
  stone: (px, rng) => speckle('#7d7d7d', 0.1, rng, px, '#6e6e6e'),
  cobble: (px, rng) => {
    speckle('#6a6a6a', 0.08, rng, px);
    for (let i = 0; i < 9; i++) {
      const cx = (i % 3) * 5 + 1 + (rng() * 2) | 0, cy = ((i / 3) | 0) * 5 + 1 + (rng() * 2) | 0;
      const m = 0.75 + rng() * 0.5;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        const x = (cx + dx) & 15, y = (cy + dy) & 15;
        const edge = dx === 0 || dy === 0 ? 0.8 : 1;
        px(x, y, [125 * m * edge, 125 * m * edge, 125 * m * edge]);
      }
    }
  },
  planks: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let m = 0.9 + rng() * 0.2;
      if (y % 4 === 3) m *= 0.7;
      if ((y < 4 && x === 11) || (y >= 4 && y < 8 && x === 3) ||
          (y >= 8 && y < 12 && x === 13) || (y >= 12 && x === 6)) m *= 0.7;
      px(x, y, [175 * m, 142 * m, 88 * m]);
    }
  },
  log_side: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let m = 0.85 + rng() * 0.25;
      if (x % 4 === 0) m *= 0.72;
      px(x, y, [106 * m, 82 * m, 48 * m]);
    }
  },
  log_top: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = ((d | 0) % 2 === 0) ? 1 : 0.8;
      const m = (0.9 + rng() * 0.15) * ring;
      if (d > 6.5) px(x, y, [106 * m * 0.8, 82 * m * 0.8, 48 * m * 0.8]);
      else px(x, y, [186 * m, 152 * m, 98 * m]);
    }
  },
  leaves: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (rng() < 0.12) { px(x, y, [0, 0, 0], 0); continue; }
      const m = 0.7 + rng() * 0.5;
      px(x, y, [42 * m, 96 * m, 28 * m]);
    }
  },
  sand: (px, rng) => speckle('#dbd3a0', 0.08, rng, px, '#d1c690'),
  gravel: (px, rng) => speckle('#84807c', 0.22, rng, px, '#6b6661'),
  water: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const m = 0.85 + 0.15 * Math.sin((x + y * 2) * 0.8) + rng() * 0.08;
      px(x, y, [38 * m, 92 * m, 200 * m], 168);
    }
  },
  lava: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = Math.sin(x * 0.9) * Math.cos(y * 0.7) + rng() * 0.7;
      if (n > 0.7) px(x, y, [255, 230, 110]);
      else if (n > 0.2) px(x, y, [250, 150, 30]);
      else px(x, y, [200, 70, 10]);
    }
  },
  bedrock: (px, rng) => speckle('#565656', 0.35, rng, px, '#333333'),
  coal_ore: (px, rng) => oreTile(px, rng, '#2e2e2e'),
  iron_ore: (px, rng) => oreTile(px, rng, '#d8af93'),
  diamond_ore: (px, rng) => oreTile(px, rng, '#4aedd9'),
  quartz_ore: (px, rng) => {
    speckle('#6e3634', 0.15, rng, px);
    for (let i = 0; i < 5; i++) {
      const ox = 2 + (rng() * 12) | 0, oy = 2 + (rng() * 12) | 0;
      px(ox, oy, [240, 235, 226]); px(ox + 1, oy, [240, 235, 226]); px(ox, oy + 1, [220, 210, 200]);
    }
  },
  glass: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (x === 0 || y === 0 || x === 15 || y === 15) px(x, y, [200, 220, 230]);
      else if ((x === 12 - y && y < 8) || (x === 13 - y && y < 8)) px(x, y, [255, 255, 255], 140);
      else px(x, y, [0, 0, 0], 0);
    }
  },
  glowstone: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const m = rng();
      if (m > 0.72) px(x, y, [255, 240, 160]);
      else px(x, y, [160 + m * 60, 120 + m * 50, 60]);
    }
  },
  netherrack: (px, rng) => speckle('#7a3434', 0.25, rng, px, '#5e2222'),
  soul_sand: (px, rng) => {
    speckle('#5b4538', 0.18, rng, px);
    px(4, 5, [30, 22, 18]); px(5, 5, [30, 22, 18]); px(10, 9, [30, 22, 18]);
    px(11, 9, [30, 22, 18]); px(7, 12, [30, 22, 18]);
  },
  obsidian: (px, rng) => {
    speckle('#171123', 0.3, rng, px, '#2b1d4a');
    for (let i = 0; i < 4; i++) px((rng() * 16) | 0, (rng() * 16) | 0, [120, 90, 200]);
  },
  portal: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const s = Math.sin((x * 1.3 + y * 0.9)) * 0.5 + 0.5;
      px(x, y, [120 + s * 80, 30 + s * 40, 200 + s * 55], 200);
    }
  },
  crafting_top: (px, rng) => {
    speckle('#af8e58', 0.1, rng, px);
    for (let i = 0; i < 16; i++) {
      px(i, 0, [120, 95, 55]); px(i, 15, [120, 95, 55]);
      px(0, i, [120, 95, 55]); px(15, i, [120, 95, 55]);
      if (i > 2 && i < 13) { px(i, 7, [90, 70, 40]); px(7, i, [90, 70, 40]); }
    }
  },
  crafting_side: (px, rng) => {
    PAINTERS.planks(px, rng);
    for (let y = 2; y < 9; y++) for (let x = 3; x < 13; x++)
      if (x === 3 || x === 12 || y === 2 || y === 8 || x === 7 || x === 8)
        px(x, y, [90, 70, 40]);
  },
  sandstone: (px, rng) => {
    speckle('#d8cf9e', 0.06, rng, px);
    for (let x = 0; x < 16; x++) { px(x, 0, [200, 190, 140]); px(x, 15, [190, 180, 130]); }
  },
  bricks: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = (y / 4) | 0;
      const off = row % 2 ? 4 : 0;
      const mortarY = y % 4 === 3, mortarX = (x + off) % 8 === 7;
      if (mortarY || mortarX) px(x, y, [150, 140, 135]);
      else { const m = 0.85 + rng() * 0.25; px(x, y, [150 * m, 70 * m, 60 * m]); }
    }
  },
  stonebrick: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const off = ((y / 8) | 0) % 2 ? 8 : 0;
      const m = 0.85 + rng() * 0.2;
      if (y % 8 === 7 || (x + off) % 8 === 7) px(x, y, [60, 60, 60]);
      else px(x, y, [120 * m, 120 * m, 120 * m]);
    }
  },
  wool: (px, rng) => speckle('#e8e8e8', 0.07, rng, px, '#d4d4d4'),
  tnt_side: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const m = 0.85 + rng() * 0.2;
      if (y < 3 || y > 12) px(x, y, [200 * m, 40 * m, 30 * m]);
      else if (y > 5 && y < 10) {
        px(x, y, [240, 240, 240]);
      } else px(x, y, [200 * m, 40 * m, 30 * m]);
    }
    // "TNT" letters
    const letter = [[3, 7], [4, 7], [5, 7], [4, 8], [4, 9], [7, 7], [7, 8], [7, 9], [8, 8], [9, 7], [9, 8], [9, 9], [11, 7], [12, 7], [13, 7], [12, 8], [12, 9]];
    for (const [x, y] of letter) px(x, y, [20, 20, 20]);
  },
  tnt_top: (px, rng) => {
    speckle('#c82820', 0.1, rng, px);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++)
      px(x, y, ((x + y) % 2) ? [240, 230, 200] : [120, 90, 60]);
  },
  torch: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, [0, 0, 0], 0);
    for (let y = 6; y < 16; y++) for (let x = 7; x < 9; x++) {
      const m = 0.85 + rng() * 0.3;
      px(x, y, [140 * m, 110 * m, 60 * m]);
    }
    px(7, 4, [255, 220, 80]); px(8, 4, [255, 220, 80]);
    px(7, 5, [255, 160, 30]); px(8, 5, [255, 160, 30]);
    px(7, 3, [255, 255, 180]); px(8, 3, [255, 255, 180]);
  },
  flower_red: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, [0, 0, 0], 0);
    for (let y = 8; y < 16; y++) px(7 + (y % 2), y, [50, 130, 40]);
    const c = [200, 30, 30];
    for (const [x, y] of [[7, 4], [8, 4], [6, 5], [9, 5], [7, 6], [8, 6], [7, 5], [8, 5]]) px(x, y, c);
    px(7, 5, [255, 220, 60]);
  },
  flower_yellow: (px, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, [0, 0, 0], 0);
    for (let y = 8; y < 16; y++) px(7 + (y % 2), y, [60, 140, 50]);
    for (const [x, y] of [[7, 4], [8, 4], [6, 5], [9, 5], [7, 6], [8, 6]]) px(x, y, [250, 220, 50]);
    px(7, 5, [255, 250, 180]); px(8, 5, [255, 250, 180]);
  },
  snow: (px, rng) => speckle('#f4fbfb', 0.04, rng, px),
};

export function buildAtlas() {
  const size = ATLAS_TILES * TILE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  TILES.forEach((name, i) => {
    const tx = (i % ATLAS_TILES) * TILE_PX, ty = ((i / ATLAS_TILES) | 0) * TILE_PX;
    const rng = mulberry32(1234 + i * 777);
    const px = (x, y, c, a = 255) => {
      const o = ((ty + y) * size + tx + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = a;
    };
    const painter = PAINTERS[name];
    if (painter) painter(px, rng);
    else speckle('#ff00ff', 0, rng, px);
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------- item icons ----------------
// Tool icons: diagonal handle + a head shape, tier-colored.
const TIER_COLORS = ['#9a7b4d', '#8a8a8a', '#d8d8d8', '#4aedd9'];

function drawToolIcon(ctx, kind, tier) {
  const head = TIER_COLORS[tier - 1];
  const handle = '#8a6a3a';
  const p = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  for (let i = 2; i < 12; i++) p(i, 13 - i + 2, handle), p(i + 1, 13 - i + 2, handle);
  if (kind === 'pickaxe') {
    for (const [x, y] of [[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 3], [10, 3], [11, 4], [12, 5], [2, 3], [2, 4], [3, 5], [3, 6], [12, 6], [13, 6], [13, 7]]) p(x + 1, y, head);
  } else if (kind === 'axe') {
    for (let y = 1; y < 7; y++) for (let x = 7; x < 13; x++)
      if (!(x > 10 && y > 4) && !(x < 8 && y < 2)) p(x, y, head);
  } else if (kind === 'shovel') {
    for (let y = 0; y < 5; y++) for (let x = 10; x < 14; x++) p(x, y, head);
  } else if (kind === 'sword') {
    ctx.clearRect(0, 0, 16, 16);
    for (let i = 0; i < 10; i++) { p(13 - i, 2 + i, head); p(12 - i, 2 + i, head); }
    p(4, 10, '#553'); p(5, 11, '#553'); p(3, 11, '#553'); p(2, 13, handle); p(3, 14, handle);
    p(6, 10, '#553'); p(5, 9, '#553');
  }
}

function drawMaterialIcon(ctx, id) {
  const p = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  const blob = (color, edge) => {
    for (let y = 4; y < 13; y++) for (let x = 4; x < 13; x++) {
      const d = Math.hypot(x - 8, y - 8);
      if (d < 4.4) p(x, y, d > 3.4 ? edge : color);
    }
  };
  switch (id) {
    case I.STICK:
      for (let i = 0; i < 10; i++) { p(3 + i, 13 - i, '#8a6a3a'); p(4 + i, 13 - i, '#a07c46'); }
      break;
    case I.COAL: blob('#2e2e2e', '#1a1a1a'); break;
    case I.IRON_INGOT:
      for (let y = 6; y < 11; y++) for (let x = 2 + (10 - y); x < 9 + (10 - y); x++)
        p(x, y, y === 6 ? '#f0f0f0' : '#c8c8c8');
      break;
    case I.DIAMOND:
      for (let y = 4; y < 12; y++) {
        const w = y < 7 ? (y - 1) : (12 - y) + 2;
        for (let x = 8 - w; x <= 8 + w; x++) p(x, y, (x + y) % 3 ? '#4aedd9' : '#aef8ee');
      }
      break;
    case I.FLINT: blob('#3a3a40', '#26262c'); break;
    case I.FLINT_STEEL:
      for (let i = 0; i < 6; i++) { p(3 + i, 5 + ((i % 2)), '#c8c8c8'); }
      for (let y = 8; y < 13; y++) for (let x = 8; x < 13; x++)
        if (Math.hypot(x - 10, y - 10) < 2.5) p(x, y, '#3a3a40');
      break;
    case I.STRING:
      for (let i = 0; i < 12; i++) p(2 + i, 8 + Math.round(Math.sin(i) * 2), '#e8e8e8');
      break;
    case I.GUNPOWDER:
      for (let i = 0; i < 14; i++) p(3 + ((i * 7) % 10), 5 + ((i * 5) % 8), '#555');
      break;
    case I.BONE:
      for (let i = 0; i < 8; i++) p(4 + i, 11 - i, '#f0f0e0');
      p(3, 12, '#fff'); p(4, 13, '#fff'); p(11, 4, '#fff'); p(12, 3, '#fff');
      break;
    case I.BOW:
      for (let i = 0; i < 11; i++) p(4 + Math.round(Math.sin(i / 10 * Math.PI) * 4), 2 + i, '#8a6a3a');
      for (let i = 0; i < 11; i++) p(4, 2 + i, '#ddd');
      break;
    case I.ARROW:
      for (let i = 0; i < 9; i++) p(3 + i, 12 - i, '#8a6a3a');
      p(11, 3, '#ccc'); p(12, 4, '#ccc'); p(12, 3, '#ccc'); p(11, 4, '#ccc');
      p(3, 13, '#eee'); p(4, 13, '#eee'); p(3, 12, '#eee');
      break;
    case I.PORKCHOP: blob('#f0a0a8', '#d88890'); break;
    case I.BEEF: blob('#9a4a30', '#7a3520'); break;
    case I.MUTTON: blob('#c86a50', '#a85540'); break;
    default: blob('#aaa', '#888');
  }
}

// Returns { icons: {id -> dataURL}, colors: {id -> [r,g,b] 0..1} }.
export function buildIcons(atlasCanvas) {
  const icons = {}, colors = {};
  const c = document.createElement('canvas');
  c.width = c.height = TILE_PX;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const finish = (id) => {
    icons[id] = c.toDataURL();
    const d = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    colors[id] = n ? [r / n / 255, g / n / 255, b / n / 255] : [0.6, 0.6, 0.6];
  };

  // block icons: use side (or all) tile
  for (let id = 1; id < 100; id++) {
    const d = blockDef(id);
    if (!d || !d.tiles || d.id === 0) continue;
    const tileName = d.tiles.all || d.tiles.side || d.tiles.top;
    const ti = TILES.indexOf(tileName);
    ctx.clearRect(0, 0, 16, 16);
    ctx.drawImage(atlasCanvas, (ti % ATLAS_TILES) * TILE_PX, ((ti / ATLAS_TILES) | 0) * TILE_PX,
      TILE_PX, TILE_PX, 0, 0, 16, 16);
    finish(id);
  }
  // item icons
  for (const idStr of Object.keys(ITEMS)) {
    const id = +idStr;
    const it = ITEMS[id];
    ctx.clearRect(0, 0, 16, 16);
    if ((it.type === 'tool' || it.type === 'weapon') && it.toolType)
      drawToolIcon(ctx, it.toolType, it.tier || 1);
    else drawMaterialIcon(ctx, id);
    finish(id);
  }
  return { icons, colors };
}
