// All DOM UI: main menu, settings, pause, death screen, HUD, inventory.

import { itemName, maxStack, CREATIVE_ITEMS } from './blocks.js';
import { craftableRecipes, craft } from './inventory.js';
import { playSound } from './sound.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(icons) {
    this.icons = icons;
    this.cursor = null;                  // {id, count} held on mouse
    this.cursorEl = $('cursorItem');
    this.invOpen = false;
    this._invCtx = null;
    document.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = (e.clientX - 20) + 'px';
      this.cursorEl.style.top = (e.clientY - 20) + 'px';
    });
  }

  icon(id) { return this.icons[id] || ''; }

  // ---------------- main menu ----------------
  showMenu(worlds, cb) {
    $('menu').classList.remove('hidden');
    const p = $('menuPanel');
    p.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = worlds.length ? 'Your Worlds' : 'Create a world to start playing';
    p.appendChild(h);
    for (const w of worlds) {
      const row = document.createElement('div');
      row.className = 'world-entry';
      const info = document.createElement('div');
      info.className = 'winfo';
      info.innerHTML = `<div class="wname"></div><div class="wmeta"></div>`;
      info.querySelector('.wname').textContent = w.name;
      info.querySelector('.wmeta').textContent =
        `${w.mode} · seed ${w.seed}` + (w.dim === 'nether' ? ' · in the Nether' : '');
      const play = document.createElement('button');
      play.className = 'btn small'; play.textContent = 'Play';
      play.onclick = () => { playSound('click'); cb.onPlay(w); };
      const del = document.createElement('button');
      del.className = 'btn small danger'; del.textContent = 'X';
      del.title = 'Delete world';
      del.onclick = () => {
        if (confirm(`Delete world "${w.name}"? This cannot be undone.`)) cb.onDelete(w);
      };
      row.append(info, play, del);
      p.appendChild(row);
    }
    const h2 = document.createElement('h3');
    h2.textContent = 'New World';
    p.appendChild(h2);
    const name = document.createElement('input');
    name.type = 'text'; name.placeholder = 'World name';
    name.value = 'World ' + (worlds.length + 1);
    const seed = document.createElement('input');
    seed.type = 'text'; seed.placeholder = 'Seed (optional)';
    const mode = document.createElement('select');
    mode.innerHTML = `<option value="survival">Survival</option><option value="creative">Creative</option>`;
    const create = document.createElement('button');
    create.className = 'btn'; create.textContent = 'Create New World';
    create.onclick = () => {
      playSound('click');
      cb.onCreate(name.value.trim() || 'World', seed.value.trim(), mode.value);
    };
    const settings = document.createElement('button');
    settings.className = 'btn'; settings.textContent = 'Settings';
    settings.onclick = () => { playSound('click'); cb.onSettings(); };
    const help = document.createElement('div');
    help.style.cssText = 'font-size:11px;color:#789;margin-top:10px;line-height:1.5';
    help.innerHTML = 'WASD move · Space jump / fly up · Shift sneak / fly down · Ctrl sprint ·' +
      ' E inventory &amp; crafting · Q drop · F or double-Space toggle fly (creative) ·' +
      ' F3 debug · Mouse1 mine / attack · Mouse2 place / use / eat' +
      '<br><span style="color:#a8c">Nether portal: build an upright 4x5 obsidian ring' +
      ' (2x3 opening) and click inside it with Flint &amp; Steel</span>';
    p.append(name, seed, mode, create, settings, help);
  }
  hideMenu() { $('menu').classList.add('hidden'); }

  // ---------------- settings ----------------
  showSettings(settings, onChange, onClose) {
    const m = $('settingsModal');
    m.classList.remove('hidden');
    const p = $('settingsPanel');
    p.innerHTML = '<h3>Settings</h3>';
    const addRange = (label, key, min, max, step, fmt = (v) => v) => {
      const row = document.createElement('div');
      row.className = 'setrow';
      const l = document.createElement('label'); l.textContent = label;
      const r = document.createElement('input');
      r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = settings[key];
      const v = document.createElement('span'); v.className = 'val';
      v.textContent = fmt(settings[key]);
      r.oninput = () => {
        settings[key] = +r.value;
        v.textContent = fmt(+r.value);
        onChange(key, +r.value);
      };
      row.append(l, r, v);
      p.appendChild(row);
    };
    addRange('Render distance', 'renderDist', 2, 12, 1, (v) => v + ' ch');
    addRange('Field of view', 'fov', 50, 110, 1, (v) => v + '°');
    addRange('Mouse sensitivity', 'sens', 0.2, 3, 0.1, (v) => v.toFixed(1));
    addRange('Day length', 'dayLen', 120, 1800, 60, (v) => (v / 60) + ' min');
    const row = document.createElement('div');
    row.className = 'setrow';
    const l = document.createElement('label'); l.textContent = 'Sound';
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = !!settings.sound;
    c.onchange = () => { settings.sound = c.checked; onChange('sound', c.checked); };
    row.append(l, c);
    p.appendChild(row);
    const done = document.createElement('button');
    done.className = 'btn'; done.textContent = 'Done';
    done.onclick = () => { m.classList.add('hidden'); onClose(); };
    p.appendChild(done);
  }

  // ---------------- pause / death ----------------
  showPause(cb) {
    $('pause').classList.remove('hidden');
    const p = $('pausePanel');
    p.innerHTML = '<h3>Game Paused</h3>';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = label;
      b.onclick = () => { playSound('click'); fn(); };
      p.appendChild(b);
    };
    mk('Back to Game', cb.onResume);
    mk('Settings', cb.onSettings);
    mk('Save & Quit to Title', cb.onQuit);
  }
  hidePause() { $('pause').classList.add('hidden'); }

  showDeath(cb) {
    $('death').classList.remove('hidden');
    const p = $('deathPanel');
    p.innerHTML = '';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = label;
      b.onclick = () => { playSound('click'); fn(); };
      p.appendChild(b);
    };
    mk('Respawn', cb.onRespawn);
    mk('Quit to Title', cb.onQuit);
  }
  hideDeath() { $('death').classList.add('hidden'); }

  showHUD(v) { $('hud').classList.toggle('hidden', !v); }
  showLoading(v) { $('loading').classList.toggle('hidden', !v); }

  // ---------------- HUD ----------------
  updateHotbar(inv) {
    const bar = $('hotbar');
    if (bar.children.length !== 9) {
      bar.innerHTML = '';
      for (let i = 0; i < 9; i++) {
        const s = document.createElement('div');
        s.className = 'slot';
        s.innerHTML = '<img alt="" draggable="false"><span class="cnt"></span>';
        bar.appendChild(s);
      }
    }
    for (let i = 0; i < 9; i++) {
      const el = bar.children[i];
      el.classList.toggle('sel', i === inv.selected);
      this._fillSlot(el, inv.slots[i]);
    }
  }

  _fillSlot(el, s) {
    const img = el.querySelector('img');
    const cnt = el.querySelector('.cnt');
    if (s) {
      img.src = this.icon(s.id);
      img.style.display = '';
      cnt.textContent = s.count > 1 ? s.count : '';
      el.title = itemName(s.id);
    } else {
      img.style.display = 'none';
      cnt.textContent = '';
      el.title = '';
    }
  }

  updateHearts(player) {
    const el = $('hearts');
    if (player.mode === 'creative') { el.innerHTML = ''; return; }
    let s = '';
    for (let i = 0; i < 10; i++) {
      const hp = player.health - i * 2;
      const col = hp >= 2 ? '#e02020' : hp >= 1 ? '#e07820' : '#3a3a3a';
      s += `<span style="color:${col}">♥</span>`;
    }
    el.innerHTML = s;
  }

  setDebug(text) { $('debug').textContent = text; }
  toggleDebug() { $('debug').classList.toggle('hidden'); }

  hint(text, ms = 2500) {
    const el = $('hint');
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => el.style.opacity = 0, ms);
  }

  damageFlash() {
    const v = $('vignette');
    v.style.opacity = 1;
    clearTimeout(this._vT);
    this._vT = setTimeout(() => v.style.opacity = 0, 200);
  }
  setFire(v) { $('fireOverlay').style.opacity = v ? 0.8 : 0; }
  setUnderwater(v) { $('waterOverlay').style.opacity = v ? 1 : 0; }
  setPortalFade(v) { $('portalFade').style.opacity = v; }

  breakProgress(p) {
    const bar = $('breakbar');
    if (p == null) bar.classList.add('hidden');
    else {
      bar.classList.remove('hidden');
      bar.firstElementChild.style.width = (p * 100) + '%';
    }
  }

  // ---------------- inventory screen ----------------
  openInventory(inv, ctx) {
    // ctx: {creative, nearTable, onChange()}
    this.invOpen = true;
    this._invCtx = { inv, ...ctx };
    $('inv').classList.remove('hidden');
    this._renderInv();
  }

  closeInventory() {
    if (!this.invOpen) return;
    this.invOpen = false;
    if (this.cursor && this._invCtx) {
      this._invCtx.inv.add(this.cursor.id, this.cursor.count);
      this.cursor = null;
    }
    this._updateCursorEl();
    $('inv').classList.add('hidden');
    this._invCtx = null;
  }

  _updateCursorEl() {
    if (this.cursor) {
      this.cursorEl.style.display = 'block';
      this.cursorEl.querySelector('img').src = this.icon(this.cursor.id);
      this.cursorEl.querySelector('.cnt').textContent = this.cursor.count > 1 ? this.cursor.count : '';
    } else {
      this.cursorEl.style.display = 'none';
    }
  }

  _slotEl(s, onClick) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.innerHTML = '<img alt="" draggable="false"><span class="cnt"></span>';
    this._fillSlot(el, s);
    el.onmousedown = (e) => {
      e.preventDefault();
      onClick(e.shiftKey ? 'shift' : e.button === 2 ? 'right' : 'left', e);
    };
    el.oncontextmenu = (e) => e.preventDefault();
    return el;
  }

  _renderInv() {
    const c = this._invCtx;
    if (!c) return;
    const inv = c.inv;
    const root = $('inv');
    root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'invpanel';
    root.appendChild(panel);
    root.oncontextmenu = (e) => e.preventDefault();

    const left = document.createElement('div');
    panel.appendChild(left);

    const clickSlot = (i) => (type) => {
      const s = inv.slots[i];
      if (type === 'shift') {
        if (s) {
          // move between hotbar and main inventory
          const target = i < 9 ? [9, 36] : [0, 9];
          const tmp = inv.slots[i];
          inv.slots[i] = null;
          let left2 = tmp.count;
          for (let j = target[0]; j < target[1] && left2 > 0; j++) {
            const t = inv.slots[j];
            if (t && t.id === tmp.id && t.count < maxStack(t.id)) {
              const take = Math.min(left2, maxStack(t.id) - t.count);
              t.count += take; left2 -= take;
            }
          }
          for (let j = target[0]; j < target[1] && left2 > 0; j++) {
            if (!inv.slots[j]) { inv.slots[j] = { id: tmp.id, count: left2 }; left2 = 0; }
          }
          if (left2 > 0) inv.slots[i] = { id: tmp.id, count: left2 };
        }
      } else if (type === 'left') {
        if (this.cursor && s && s.id === this.cursor.id) {
          const take = Math.min(this.cursor.count, maxStack(s.id) - s.count);
          s.count += take; this.cursor.count -= take;
          if (this.cursor.count <= 0) this.cursor = null;
        } else {
          inv.slots[i] = this.cursor;
          this.cursor = s || null;
        }
      } else if (type === 'right') {
        if (this.cursor) {
          if (!s) { inv.slots[i] = { id: this.cursor.id, count: 1 }; this.cursor.count--; }
          else if (s.id === this.cursor.id && s.count < maxStack(s.id)) { s.count++; this.cursor.count--; }
          if (this.cursor && this.cursor.count <= 0) this.cursor = null;
        } else if (s && s.count > 1) {
          const half = Math.ceil(s.count / 2);
          this.cursor = { id: s.id, count: s.count - half };
          s.count = half;
        } else if (s) {
          this.cursor = s; inv.slots[i] = null;
        }
      }
      playSound('click');
      this._updateCursorEl();
      this._renderInv();
      c.onChange && c.onChange();
    };

    const mkGrid = (from, to, title) => {
      if (title) {
        const h = document.createElement('h3');
        h.textContent = title;
        left.appendChild(h);
      }
      const g = document.createElement('div');
      g.className = 'grid';
      for (let i = from; i < to; i++) g.appendChild(this._slotEl(inv.slots[i], clickSlot(i)));
      left.appendChild(g);
    };
    mkGrid(9, 36, 'Inventory');
    mkGrid(0, 9, 'Hotbar');

    const right = document.createElement('div');
    panel.appendChild(right);

    if (c.creative) {
      const h = document.createElement('h3');
      h.textContent = 'Creative Items';
      right.appendChild(h);
      const search = document.createElement('input');
      search.id = 'invSearch';
      search.type = 'text';
      search.placeholder = 'Search items... (e.g. flint, egg, wool)';
      right.appendChild(search);
      const g = document.createElement('div');
      g.className = 'grid creative';
      const entries = [];
      for (const id of CREATIVE_ITEMS) {
        const el = this._slotEl({ id, count: 1 }, () => {});
        el.querySelector('.cnt').textContent = '';
        el.onmousedown = (e) => {
          e.preventDefault();
          if (e.button === 2) this.cursor = null;
          else this.cursor = { id, count: e.shiftKey ? 1 : maxStack(id) };
          playSound('click');
          this._updateCursorEl();
        };
        entries.push([itemName(id).toLowerCase(), el]);
        g.appendChild(el);
      }
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        for (const [name, el] of entries)
          el.style.display = !q || name.includes(q) ? '' : 'none';
      };
      right.appendChild(g);
      const tip = document.createElement('div');
      tip.style.cssText = 'font-size:11px;color:#555;margin-top:6px;max-width:420px';
      tip.textContent = 'Click an item to grab a stack (shift for one). Right-click to clear cursor.';
      right.appendChild(tip);
    }

    // crafting list (both modes; creative crafts in a third column)
    const crafting = document.createElement('div');
    panel.appendChild(crafting);
    const h = document.createElement('h3');
    h.textContent = c.nearTable ? 'Crafting (table nearby)' : 'Crafting';
    crafting.appendChild(h);
    const list = document.createElement('div');
    list.id = 'craftlist';
    const rs = craftableRecipes(inv, c.nearTable || c.creative);
    for (const { recipe, ok } of rs) {
      const el = document.createElement('div');
      el.className = 'recipe' + (ok ? '' : ' no');
      const img = document.createElement('img');
      img.src = this.icon(recipe.out);
      const name = document.createElement('span');
      name.className = 'rname';
      name.textContent = `${itemName(recipe.out)}${recipe.count > 1 ? ' x' + recipe.count : ''}`;
      const needs = document.createElement('span');
      needs.className = 'rneeds';
      needs.textContent = recipe.ins.map(([id, n]) => `${n} ${itemName(id)}`).join(', ')
        + (recipe.table && !(c.nearTable || c.creative) ? ' (needs table)' : '');
      el.append(img, name, needs);
      if (ok) el.onmousedown = (e) => {
        e.preventDefault();
        craft(inv, recipe);
        playSound('craft');
        this._renderInv();
        c.onChange && c.onChange();
      };
      list.appendChild(el);
    }
    crafting.appendChild(list);

    // hovered item name bar
    const nameBar = document.createElement('div');
    nameBar.id = 'invNameBar';
    nameBar.textContent = ' ';
    left.appendChild(nameBar);
    panel.addEventListener('mouseover', (e) => {
      const slot = e.target.closest && e.target.closest('.slot');
      nameBar.textContent = (slot && slot.title) || ' ';
    });
  }
}
