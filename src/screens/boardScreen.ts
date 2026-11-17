/**
 * Board screen: 7x9 merge board + Moonwell + drag/tap input + flow + rewards FX.
 */
import { App } from './app';
import { el, ring, Ring, setEnergyBar, positionPop, dismissable } from './ui';
import { BoardModel, DropOutcome, multiMergeBonusEnergy } from '../game/board';
import { CHAINS, itemName, isPlantable, maxTier, tierName, ChainId } from '../data/chains';
import { getItemSprite } from '../art/sprites';
import { resolveMood, MOODS } from '../art/background';
import { SPAWN_COST, ENERGY_MAX, gainEnergy, spendEnergy } from '../core/save';
import { onMergeReward, REWARD_LABEL, RewardKind } from '../game/rewards';
import { makePlanting, plantSerenityNow, SOURCE_ITEM, PlantDef } from '../game/garden';
import { looseRng, Rng } from '../core/rng';
import { audio, haptic } from '../audio/audio';
import { Ctx, glow, roundRect, rgba } from '../art/draw';
import { drawCreature } from '../art/creatureArt';
import { creatures } from '../data/creatures';
import { plants } from '../data/plants';

let rng: Rng = new Rng((Date.now() ^ 0xbeef) >>> 0);
export function seedBoardRng(seed: number): void {
  rng = new Rng(seed);
}

interface CellGeom {
  x: number; y: number; size: number;
}

export class BoardScreen {
  private geom: CellGeom = { x: 0, y: 0, size: 48 };
  private dragging: { from: number; x: number; y: number; itemChain: ChainId; itemTier: number; itemVariant: 'normal' | 'gold' | 'silver' } | null = null;
  private downAt = 0;
  private downPos = { x: 0, y: 0 };
  private hoverCell: number | null = null;
  private selected: number | null = null;
  private spawnPops: Array<{ cell: number; t: number }> = [];
  private mergeFlashes: Array<{ cell: number; t: number; color: string }> = [];
  private energyRingEl: HTMLElement | null = null;
  private serenityRing: Ring | null = null;
  private goalEl: HTMLElement | null = null;
  private lastInteract = 0;
  private hinted = false;
  private idleSpawned = 0;
  private cameo: { art: string; palette: any; x: number; t: number } | null = null;

  constructor(private app: App) {}

  get state() {
    return this.app.state;
  }

  /* ---------- HUD ---------- */

  buildHud(): void {
    const hud = document.getElementById('hud')!;
    const s = this.state;
    hud.innerHTML = '';
    const row = el('div', 'hudrow');

    // serenity chip with ring
    const serChip = el('div', 'chip');
    this.serenityRing = ring(34, 4);
    serChip.appendChild(this.serenityRing.root);
    const serText = el('div', '', `<span class="lbl">Serenity</span><br><b id="serval">${s.serenity}</b>`);
    serChip.appendChild(serText);

    // energy chip
    const energyChip = el('div', 'chip');
    const eb = el('div', 'energybar');
    eb.appendChild(el('i'));
    energyChip.appendChild(eb);
    this.energyRingEl = eb;
    const et = el('div', '', `<span class="lbl">Energy</span><br><b id="enval">0</b>`);
    energyChip.appendChild(et);

    // moonwell
    const well = el('button', '') as HTMLButtonElement;
    well.id = 'moonwell';
    well.setAttribute('aria-label', 'Moonwell: spawn a seed (costs 10 energy)');
    well.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.5 4.4 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.6 6-11z" fill="#ffe9c4" opacity=".9"/></svg>
      <span><span class="sub">Moonwell</span>Spawn seed</span>`;
    well.addEventListener('click', () => this.spawnFromWell());

    row.appendChild(serChip);
    row.appendChild(energyChip);
    row.appendChild(well);
    hud.appendChild(row);

    this.goalEl = el('div', 'goal');
    hud.appendChild(this.goalEl);
    this.updateHud();
    this.refreshGoal();
  }

  updateHud(): void {
    const s = this.state;
    const en = document.getElementById('enval');
    if (en) en.textContent = String(s.energy);
    const sv = document.getElementById('serval');
    if (sv) sv.textContent = String(s.serenity);
    setEnergyBar(this.energyRingEl, s.energy, ENERGY_MAX);
    if (this.serenityRing) {
      const nextZone = [300, 800, 1600, 2600][Math.min(3, s.garden.zonesUnlocked - 1)];
      const prev = s.garden.zonesUnlocked <= 1 ? 0 : [0, 300, 800, 1600][s.garden.zonesUnlocked - 1];
      this.serenityRing.setProgress(Math.min(1, (s.serenity - prev) / Math.max(1, nextZone - prev)));
    }
  }

  private refreshGoal(): void {
    if (!this.goalEl) return;
    const s = this.state;
    const maxT = Math.max(1, this.app.board.maxTierOnBoard());
    const next = Math.min(maxTier('moon'), maxT + 1);
    const goalTier = Math.max(2, next);
    this.currentGoalTier = goalTier;
    const planted = s.garden.plots.length;
    this.goalEl.innerHTML = planted < 3
      ? `Tonight's wish: plant something in the <b>Night Garden</b>. Tap a glowing top-tier item to plant it.`
      : `Tonight's wish: grow and plant a <b>${tierName('moon', goalTier)}</b>. Three identical items merging together chime a bonus.`;
  }
  private currentGoalTier = 2;

  /* ---------- geometry ---------- */

  layout(w: number, h: number): void {
    // reserve space: HUD ~86px top, nav ~84px bottom
    const topPad = 88;
    const bottomPad = 92;
    const availW = w - 24;
    const availH = Math.max(320, h - topPad - bottomPad);
    let cell = Math.min(availW / 7, availH / 9);
    cell = Math.max(30, Math.min(64, cell));
    const bw = cell * 7;
    const bh = cell * 9;
    this.geom = { x: (w - bw) / 2, y: topPad + Math.max(0, (availH - bh) / 2), size: cell };
  }

  private cellAt(px: number, py: number): number | null {
    const { x, y, size } = this.geom;
    const c = Math.floor((px - x) / size);
    const r = Math.floor((py - y) / size);
    if (c < 0 || c >= 7 || r < 0 || r >= 9) return null;
    return r * 7 + c;
  }

  private cellCenter(i: number): [number, number] {
    const { x, y, size } = this.geom;
    const r = Math.floor(i / 7);
    const c = i % 7;
    return [x + c * size + size / 2, y + r * size + size / 2];
  }

  /* ---------- input ---------- */

  onPointerDown(px: number, py: number): void {
    this.lastInteract = performance.now();
    this.downAt = performance.now();
    this.downPos = { x: px, y: py };
    const cell = this.cellAt(px, py);
    if (cell !== null && this.app.board.cells[cell]) {
      const it = this.app.board.cells[cell]!;
      this.dragging = { from: cell, x: px, y: py, itemChain: it.chain, itemTier: it.tier, itemVariant: it.variant };
      this.hoverCell = cell;
    }
  }

  onPointerMove(px: number, py: number): void {
    if (!this.dragging) return;
    this.dragging.x = px;
    this.dragging.y = py;
    this.hoverCell = this.cellAt(px, py);
  }

  onPointerUp(px: number, py: number): void {
    this.lastInteract = performance.now();
    const dt = performance.now() - this.downAt;
    const moved = Math.hypot(px - this.downPos.x, py - this.downPos.y);
    const drag = this.dragging;
    this.dragging = null;
    if (!drag) return;
    const target = this.cellAt(px, py);

    if (dt < 260 && moved < 12) {
      // tap: select / plantable menu / move
      const it = this.app.board.cells[drag.from];
      if (it && isPlantable(it)) {
        this.openPlantMenu(drag.from);
        return;
      }
      if (this.selected !== null && target !== null && target !== this.selected && !this.app.board.cells[target]) {
        this.app.board.cells[target] = this.app.board.cells[this.selected];
        this.app.board.cells[this.selected] = null;
        audio.tap(1);
        this.selected = null;
        return;
      }
      this.selected = this.selected === drag.from ? null : drag.from;
      if (it) audio.tap(it.tier);
      return;
    }

    if (target !== null) {
      this.applyDrop(drag.from, target);
    }
    this.selected = null;
  }

  private applyDrop(from: number, to: number): void {
    const before = this.app.board.cells.slice();
    const outcome: DropOutcome = this.app.board.drop(from, to);
    const s = this.state;
    switch (outcome.kind) {
      case 'move':
        audio.tap(outcome.item.tier);
        haptic(6);
        break;
      case 'swap':
        audio.tap(1);
        haptic(6);
        break;
      case 'merge': {
        s.totalMerges++;
        const bonus = multiMergeBonusEnergy(outcome.consumed);
        gainEnergy(s, 5 + bonus, Date.now());
        const [cx, cy] = this.cellCenter(outcome.cell);
        const colors = [CHAINS[outcome.chain].tiers[Math.min(outcome.tier - 1, 5)].c, '#fff2c8', CHAINS[outcome.chain].tiers[Math.min(outcome.tier - 1, 5)].g];
        this.app.particles.burst(cx, cy, colors, outcome.consumed >= 3 ? 26 : 14, outcome.consumed >= 3 ? 130 : 90);
        if (outcome.consumed >= 3) this.app.particles.ring(cx, cy, '#ffe9a8', 24);
        this.mergeFlashes.push({ cell: outcome.cell, t: 0, color: colors[0] });
        audio.merge(outcome.tier, Math.max(0, outcome.consumed - 2));
        haptic(outcome.consumed >= 3 ? 26 : 12);
        this.app.sr(`${itemName({ chain: outcome.chain, tier: outcome.tier, variant: outcome.variant })} created${outcome.consumed >= 3 ? ` from ${outcome.consumed} items` : ''}`);
        // cascade FX
        if (outcome.cascades > 0) {
          window.setTimeout(() => {
            const [fx, fy] = this.cellCenter(outcome.cell);
            this.app.particles.ring(fx, fy, '#8ff0d8', 30);
            audio.merge(outcome.tier + 1, 1);
          }, 160);
        }
        // 5+ merge: free seed gift
        if (outcome.consumed >= 5) {
          window.setTimeout(() => this.freeSpawn('A cascade of gratitude — the well adds a free seed.'), 340);
        }
        // goal check
        if (outcome.chain === 'moon' && outcome.tier >= this.currentGoalTier) {
          this.app.toast(`Wish fulfilled: a ${tierName('moon', this.currentGoalTier)} glows on the board`);
          this.app.particles.ring(cx, cy, '#ffd76e', 40);
          this.refreshGoal();
        }
        // variable-ratio reward
        const kind = onMergeReward(s.reward, looseRng);
        if (kind) this.grantReward(kind, outcome.cell);
        this.app.requestSave();
        this.updateHud();
        break;
      }
      default:
        break;
    }
    if (before.length !== this.app.board.cells.length) {
      /* sanity guard, never expected */
    }
  }

  private grantReward(kind: RewardKind, nearCell: number): void {
    const s = this.state;
    const [cx, cy] = this.cellCenter(nearCell);
    switch (kind) {
      case 'gold': {
        const candidates = this.app.board.cells
          .map((it, i) => ({ it, i }))
          .filter((c) => c.it && c.it.variant === 'normal' && !isPlantable(c.it));
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(looseRng.next() * candidates.length)];
          pick.it!.variant = 'gold';
          this.app.particles.burst(...this.cellCenter(pick.i), ['#ffd76e', '#ffe9a8', '#fff2c8'], 20, 110);
          this.app.toast('A petal turned to gold. It will glow brighter in the garden.');
        } else {
          gainEnergy(s, 20, Date.now());
          this.app.toast('Golden warmth: Moonwell refilled.');
        }
        break;
      }
      case 'silver': {
        const candidates = this.app.board.cells
          .map((it, i) => ({ it, i }))
          .filter((c) => c.it && c.it.variant === 'normal' && !isPlantable(c.it));
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(looseRng.next() * candidates.length)];
          pick.it!.variant = 'silver';
          this.app.particles.burst(...this.cellCenter(pick.i), ['#e6ecfa', '#dfe8ff', '#ffffff'], 18, 100);
          this.app.toast('A petal turned to silver.');
        } else {
          gainEnergy(s, 15, Date.now());
          this.app.toast('Silver light: Moonwell refilled.');
        }
        break;
      }
      case 'energy':
        gainEnergy(s, 30, Date.now());
        this.app.toast('The Moonwell hums — energy refilled.');
        break;
      case 'seed':
        s.garden.wildSeeds += 1;
        this.app.toast('A wildflower seed drifted into your pockets.');
        break;
      case 'lure':
        this.app.toast('The chime echoed. Something soft is listening...');
        this.app.lureCreatures();
        break;
    }
    this.app.particles.ring(cx, cy, '#ffe9a8', 34);
    audio.dew();
    this.updateHud();
  }

  /* ---------- spawn ---------- */

  spawnFromWell(): void {
    const s = this.state;
    const cost = this.app.sessionPhase === 'winddown' ? Math.ceil(SPAWN_COST / 2) : SPAWN_COST;
    if (this.app.board.emptyCells().length === 0) {
      this.app.toast('The board is full — merge to make room.');
      audio.uiTick();
      return;
    }
    if (!spendEnergy(s, cost, Date.now())) {
      this.app.toast('The well is resting... energy refills with every merge and every minute.');
      audio.uiTick();
      return;
    }
    const res = this.app.board.spawnSeed(rng, 'normal');
    if (res) {
      this.spawnPops.push({ cell: res.cell, t: 0 });
      const [cx, cy] = this.cellCenter(res.cell);
      this.app.particles.burst(cx, cy, [CHAINS[res.item.chain].tiers[0].c, '#fff'], 10, 70);
      audio.tap(1);
      haptic(8);
      this.updateHud();
      this.app.requestSave();
    }
  }

  freeSpawn(msg: string): void {
    const res = this.app.board.spawnSeed(rng, 'normal');
    if (res) {
      this.spawnPops.push({ cell: res.cell, t: 0 });
      this.app.toast(msg);
      audio.dew();
    }
  }

  /* ---------- plant menu ---------- */

  private openPlantMenu(cell: number): void {
    const it = this.app.board.cells[cell];
    if (!it) return;
    const overlay = document.getElementById('overlay')!;
    overlay.innerHTML = '';
    const card = el('div', 'card');
    const name = itemName(it);
    card.innerHTML = `
      <h2>${name}</h2>
      <p class="lead">This one is ready to become part of the Night Garden.</p>
      <p>Planting grows Serenity — and Serenity calls the creatures. It will keep growing, and anything planted before you leave blooms overnight.</p>
      <div class="cardrow">
        <button class="btn quiet" id="pcancel">Not yet</button>
        <button class="btn" id="pplant">Plant it</button>
      </div>`;
    overlay.appendChild(card);
    overlay.classList.add('show');
    (card.querySelector('#pcancel') as HTMLButtonElement).addEventListener('click', () => {
      overlay.classList.remove('show');
    });
    (card.querySelector('#pplant') as HTMLButtonElement).addEventListener('click', () => {
      overlay.classList.remove('show');
      this.plantItem(cell);
    });
  }

  private plantItem(cell: number): void {
    const it = this.app.board.cells[cell];
    if (!it || !isPlantable(it)) return;
    const src = it.chain === 'moon' ? (it.tier === 6 ? 'startree' : it.tier === 5 ? 'glowbloom' : 'moonpetal') : it.tier === 5 ? 'constellation' : 'wisp';
    // find matching plant def in unlocked zones, else first unlocked
    const s = this.state;
    const zoneIdx = Math.min(s.garden.zonesUnlocked, 5) - 1;
    const def = plants.find((p) => p.zone === zoneIdx && p.source === src && p.variant === (it.variant === 'normal' ? 'normal' : it.variant))
      ?? plants.find((p) => p.zone === zoneIdx && p.source === src)!;
    const slotsPerZone = 6;
    let slot = 0;
    while (slot < slotsPerZone && s.garden.plots.some((p) => p.zone === zoneIdx && p.slot === slot)) slot++;
    if (slot >= slotsPerZone) {
      this.app.toast('That zone is full — its beauty already overflows.');
      return;
    }
    this.app.board.removeAt(cell);
    const planting = makePlanting(def as PlantDef, zoneIdx, slot, Date.now());
    s.garden.plots.push(planting);
    s.totalPlants++;
    s.serenity += plantSerenityNow(def as PlantDef);
    const [cx, cy] = this.cellCenter(cell);
    this.app.particles.burst(cx, cy, ['#8ff0d8', '#ffd76e', '#b9a7ff'], 22, 110);
    audio.plant();
    haptic(20);
    this.app.sr(`${def.name} planted. Serenity ${s.serenity}.`);
    this.app.toast(`${def.name} planted — the garden breathes easier.`);
    this.app.checkZonesAndCreatures();
    this.app.requestSave();
    this.updateHud();
    this.refreshGoal();
    window.setTimeout(() => this.app.goto('garden', zoneIdx), 650);
  }

  /* ---------- frame ---------- */

  update(dt: number, _t: number): void {
    for (let i = this.spawnPops.length - 1; i >= 0; i--) {
      this.spawnPops[i].t += dt;
      if (this.spawnPops[i].t > 0.5) this.spawnPops.splice(i, 1);
    }
    for (let i = this.mergeFlashes.length - 1; i >= 0; i--) {
      this.mergeFlashes[i].t += dt;
      if (this.mergeFlashes[i].t > 0.6) this.mergeFlashes.splice(i, 1);
    }
    if (this.cameo) {
      this.cameo.t += dt;
      if (this.cameo.t > 12) this.cameo = null;
    }
    // flow: gentle hints when idle
    const idle = performance.now() - this.lastInteract;
    const well = document.getElementById('moonwell');
    if (well) {
      if (idle > 18000 && !this.hinted) {
        well.classList.add('hint');
        this.hinted = true;
      }
    }
    if (idle > 30000 && this.idleSpawned < 3 && this.state.session.startedAt !== null) {
      this.idleSpawned++;
      this.lastInteract = performance.now();
      this.freeSpawn('A stray seed drifts in from the dark...');
    }
    // peak-end cameo
    if (this.app.sessionPhase === 'peak' && !this.cameo) {
      const discovered = creatures.filter((c) => (this.state.creatures[c.id]?.visits ?? 0) > 0);
      if (discovered.length > 0 && looseRng.chance(dt * 0.05)) {
        const c = discovered[Math.floor(looseRng.next() * discovered.length)];
        this.cameo = { art: c.art, palette: c.palette, x: -40, t: 0 };
      }
    }
  }

  draw(ctx: Ctx, w: number, h: number, time: number): void {
    const { x, y, size } = this.geom;
    const s = this.state;
    const mood = resolveMood(s.settings.mood, Date.now());
    const pal = MOODS[mood];

    // board panel
    const pad = size * 0.16;
    ctx.save();
    roundRect(ctx, x - pad, y - pad, size * 7 + pad * 2, size * 9 + pad * 2, size * 0.4);
    ctx.fillStyle = 'rgba(24, 17, 54, 0.55)';
    ctx.fill();
    ctx.strokeStyle = rgba(pal.moonHalo, 0.16);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // cells
    for (let i = 0; i < 63; i++) {
      const r = Math.floor(i / 7);
      const c = i % 7;
      const cx = x + c * size;
      const cy = y + r * size;
      roundRect(ctx, cx + size * 0.06, cy + size * 0.06, size * 0.88, size * 0.88, size * 0.26);
      ctx.fillStyle = 'rgba(46, 34, 92, 0.5)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(185, 174, 224, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // hover highlight while dragging
    if (this.dragging && this.hoverCell !== null) {
      const [hx, hy] = this.cellCenter(this.hoverCell);
      glow(ctx, hx, hy, size * 0.8, '#ffe9a8', 0.35);
      roundRect(ctx, hx - size * 0.44, hy - size * 0.44, size * 0.88, size * 0.88, size * 0.26);
      ctx.strokeStyle = rgba('#ffd9a0', 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // selected highlight
    if (this.selected !== null) {
      const [sx, sy] = this.cellCenter(this.selected);
      glow(ctx, sx, sy, size * 0.75, '#8ff0d8', 0.4);
    }

    // items
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const spritePx = Math.round(size * 1.4 * dpr);
    for (let i = 0; i < 63; i++) {
      const it = this.app.board.cells[i];
      if (!it) continue;
      if (this.dragging && this.dragging.from === i) continue;
      const [cx, cy] = this.cellCenter(i);
      const bob = s.settings.reducedMotion ? 0 : Math.sin(time * 1.4 + i * 0.7) * size * 0.02;
      const pop = this.spawnPops.find((p) => p.cell === i);
      let scale = 1;
      if (pop) {
        const k = Math.min(1, pop.t / 0.4);
        scale = 0.4 + 0.6 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.18;
      }
      if (it.variant !== 'normal') {
        glow(ctx, cx, cy + bob, size * 0.62, it.variant === 'gold' ? '#ffd76e' : '#dfe8ff', 0.4);
      }
      if (isPlantable(it)) {
        glow(ctx, cx, cy + bob, size * 0.7, '#8ff0d8', 0.3 + 0.12 * Math.sin(time * 2 + i));
      }
      const sprite = getItemSprite(it.chain, it.tier, it.variant, spritePx);
      const dsz = size * 1.3 * scale;
      ctx.drawImage(sprite, cx - dsz / 2, cy - dsz / 2 + bob, dsz, dsz);
      // color-assist glyph overlay
      if (s.settings.colorAssist) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,246,216,0.85)';
        ctx.lineWidth = 1.6;
        roundRect(ctx, cx - size * 0.4, cy - size * 0.4, size * 0.8, size * 0.8, size * 0.2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // merge flash rings
    for (const f of this.mergeFlashes) {
      const [fx, fy] = this.cellCenter(f.cell);
      const k = f.t / 0.6;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx, fy, size * (0.4 + k * 1.1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // drag ghost
    if (this.dragging) {
      const d = this.dragging;
      const sprite = getItemSprite(d.itemChain, d.itemTier, d.itemVariant, spritePx);
      const dsz = size * 1.45;
      glow(ctx, d.x, d.y, size * 0.8, '#ffe9a8', 0.4);
      ctx.drawImage(sprite, d.x - dsz / 2, d.y - dsz / 2, dsz, dsz);
    }

    // cameo creature at board bottom (peak-end)
    if (this.cameo) {
      const cam = this.cameo;
      const speed = 26;
      cam.x = Math.min(cam.x + speed * (1 / 60), w * 0.5);
      const yy = h - size * 0.5;
      drawCreature(ctx, cam.art, cam.x, yy, size * 0.9, time, cam.palette, { reducedMotion: s.settings.reducedMotion });
    }
  }

  onLeave(): void {
    this.selected = null;
    this.dragging = null;
    const well = document.getElementById('moonwell');
    if (well) well.classList.remove('hint');
  }
}
