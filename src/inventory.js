// Inventory model (hotbar = slots 0-8, main = 9-35) and crafting.

import { maxStack, RECIPES } from './blocks.js';

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null);   // {id, count} | null
    this.selected = 0;
  }

  held() { return this.slots[this.selected]; }
  heldId() { const s = this.held(); return s ? s.id : null; }

  // returns count that did NOT fit
  add(id, count) {
    // top up existing stacks first
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < maxStack(id)) {
        const take = Math.min(count, maxStack(id) - s.count);
        s.count += take; count -= take;
      }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(count, maxStack(id));
        this.slots[i] = { id, count: take };
        count -= take;
      }
    }
    return count;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  remove(id, count) {
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(count, s.count);
        s.count -= take; count -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return count === 0;
  }

  consumeHeld(n = 1) {
    const s = this.held();
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
  }

  serialize() { return this.slots.map(s => s ? [s.id, s.count] : 0); }
  static deserialize(data) {
    const inv = new Inventory();
    if (Array.isArray(data))
      data.forEach((s, i) => { if (s && i < 36) inv.slots[i] = { id: s[0], count: s[1] }; });
    return inv;
  }
}

export function craftableRecipes(inv, nearTable) {
  return RECIPES.map(r => ({
    recipe: r,
    ok: (!r.table || nearTable) && r.ins.every(([id, n]) => inv.count(id) >= n),
  }));
}

export function craft(inv, recipe) {
  if (!recipe.ins.every(([id, n]) => inv.count(id) >= n)) return false;
  for (const [id, n] of recipe.ins) inv.remove(id, n);
  const left = inv.add(recipe.out, recipe.count);
  if (left > 0) {
    // no space: refund what we can
    inv.add(recipe.out, 0);
    return { left };
  }
  return true;
}
