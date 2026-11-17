/**
 * Garden screen: the Night Garden. Zones, plots, growth rings, bloom FX,
 * creature visits (walk in, tap to welcome -> story), overnight bloom ceremony.
 */
import { App } from './app';
import { el, ring, Ring, positionPop, dismissable } from './ui';
import { zones, plants, plantById } from '../data/plants';
import { creatures } from '../data/creatures';
import { SOURCE_ITEM, growthProgress, sweepBlooms, plantSerenityOnBloom, clearRevealQueue, PlantDef, PlantingView } from '../game/garden';
import { welcomeCreature, rollAmbientVisit, CreatureDef } from '../game/creatures';
import { claimDewGift } from '../core/save';
import { getItemSprite } from '../art/sprites';
import { drawCreature } from '../art/creatureArt';
import { audio, haptic } from '../audio/audio';
import { looseRng } from '../core/rng';
import { Ctx, glow, roundRect, rgba, sparkle } from '../art/draw';
import { openStory } from './storyOverlay';

interface PlotGeom {
  x: number;
  y: number;
  r: number;
  zone: number;
  slot: number;
}

interface VisitState {
  def: CreatureDef;
  enteredAt: number;
  x: number;
  dir: 1 | -1;
  phase: 'walkin' | 'stay' | 'leave';
  welcomed: boolean;
}

export class GardenScreen {
  private serenityRing: Ring | null = null;
  private plotsEl: HTMLElement | null = null;
  private plotGeoms: PlotGeom[] = [];
  private visit: VisitState | null = null;
  private openSince = 0;
  private ceremonyShown = false;
  private bloomFx: Array<{ x: number; y: number; t: number }> = [];
  private currentZone = 0;

  constructor(private app: App) {}

  buildHud(zoneArg: number): void {
    const hud = document.getElementById('hud')!;
    const s = this.app.state;
    this.currentZone = zoneArg >= 0 ? Math.min(zoneArg, s.garden.zonesUnlocked - 1) : Math.min(this.currentZone, s.garden.zonesUnlocked - 1);
    hud.innerHTML = '';
    const row = el('div', 'hudrow');
    const chip = el('div', 'chip');
    this.serenityRing = ring(34, 4);
    chip.appendChild(this.serenityRing.root);
    chip.appendChild(el('div', '', `<span class="lbl">Serenity</span><br><b id="gser">${s.serenity}</b>`));
    const seeds = el('div', 'chip', `<span class="lbl">Wild seeds</span><b id="gwild">${s.garden.wildSeeds}</b>`);
    const dewBtn = el('button', 'btn small') as HTMLButtonElement;
    const dewReady = s.dew.lastGiftDate !== dewToday();
    dewBtn.innerHTML = dewReady ? 'Claim dew drop' : 'Dew collected';
    dewBtn.setAttribute('aria-label', 'Daily dew drop gift');
    if (!dewReady) dewBtn.disabled = true;
    dewBtn.addEventListener('click', () => {
      if (this.app.state.dew.lastGiftDate === dewToday()) return;
      claimDewGift(this.app.state, Date.now());
      dewBtn.innerHTML = 'Dew collected';
      dewBtn.disabled = true;
      this.app.toast('Morning dew: +40 energy and a wildflower seed. Gentle days.');
      audio.dew();
      haptic(15);
      this.app.requestSave();
      this.updateHud();
    });
    row.appendChild(chip);
    row.appendChild(seeds);
    row.appendChild(dewBtn);
    hud.appendChild(row);

    // zone tabs
    const tabs = el('div', 'zonetabs');
    tabs.setAttribute('role', 'tablist');
    zones.forEach((z, i) => {
      const unlocked = s.serenity >= z.need;
      const b = el('button', `ztab ${i === this.currentZone ? 'on' : ''} ${unlocked ? '' : 'locked'}`);
      b.setAttribute('role', 'tab');
      b.innerHTML = unlocked ? z.name : `${z.name} <span class="lock">· ${z.need} Serenity</span>`;
      b.addEventListener('click', () => {
        if (!unlocked) {
          this.app.toast(`${z.name} wakes at ${z.need} Serenity. Keep planting.`);
          audio.uiTick();
          return;
        }
        this.currentZone = i;
        audio.uiTick();
        this.buildHud(i);
      });
      tabs.appendChild(b);
    });
    hud.appendChild(tabs);
    this.updateHud();
  }

  updateHud(): void {
    const s = this.app.state;
    const gs = document.getElementById('gser');
    if (gs) gs.textContent = String(s.serenity);
    const gw = document.getElementById('gwild');
    if (gw) gw.textContent = String(s.garden.wildSeeds);
    if (this.serenityRing) {
      const z = zones[Math.min(zones.length - 1, s.garden.zonesUnlocked)];
      const prevNeed = zones[Math.max(0, s.garden.zonesUnlocked - 1)].need;
      this.serenityRing.setProgress(Math.min(1, (s.serenity - prevNeed) / Math.max(1, z.need - prevNeed)));
    }
  }

  enter(zoneArg: number): void {
    this.openSince = performance.now();
    this.plotGeoms = [];
    // overnight bloom ceremony
    if (!this.ceremonyShown && this.app.state.garden.revealQueue.length > 0) {
      this.ceremonyShown = true;
      window.setTimeout(() => this.showOvernightCeremony(), 500);
    }
    this.buildHud(zoneArg);
  }

  private showOvernightCeremony(): void {
    const names = this.app.state.garden.revealQueue
      .map((r) => plantById(r.plantId)?.name ?? 'a night flower')
      .filter((n, i, arr) => arr.indexOf(n) === i);
    const overlay = document.getElementById('overlay')!;
    overlay.innerHTML = '';
    const card = el('div', 'card');
    card.innerHTML = `
      <h2>Overnight bloom</h2>
      <p class="lead">While you slept, the garden kept its promise.</p>
      <p>${names.map((n) => `<b style="color:#c8f4e6">${n}</b>`).join(', ')} ${names.length > 1 ? 'have' : 'has'} bloomed in the dark, quiet hours.</p>
      <div class="cardrow"><button class="btn" id="okbloom">See them</button></div>`;
    overlay.appendChild(card);
    overlay.classList.add('show');
    (card.querySelector('#okbloom') as HTMLButtonElement).addEventListener('click', () => {
      overlay.classList.remove('show');
      const queue = clearRevealQueue(this.app.state);
      for (const r of queue) {
        const g = this.plotGeoms.find((p) => p.zone === r.zone && p.slot === r.slot);
        if (g) this.bloomFx.push({ x: g.x, y: g.y, t: 0 });
      }
      audio.bloom();
      haptic(20);
      this.app.requestSave();
    });
  }

  /* ---------- geometry ---------- */

  private computePlots(w: number, h: number): void {
    this.plotGeoms = [];
    const s = this.app.state;
    const top = h * 0.34;
    const groundH = h * 0.52;
    const r = Math.min(w, h) * 0.052;
    const zone = this.currentZone;
    for (let slot = 0; slot < 6; slot++) {
      const col = slot % 3;
      const row = Math.floor(slot / 3);
      const x = w * (0.24 + col * 0.26) + (row % 2 === 0 ? 0 : w * 0.02);
      const y = top + groundH * (0.28 + row * 0.42) + Math.sin(slot * 2.1) * r * 0.3;
      this.plotGeoms.push({ x, y, r, zone, slot });
    }
    void s;
  }

  /* ---------- planting ---------- */

  private tryPlantWild(g: PlotGeom): void {
    const s = this.app.state;
    const pop = el('div', 'pop');
    pop.innerHTML = `<div class="pt">Empty plot</div>`;
    if (s.garden.wildSeeds > 0) {
      const wild = plants.find((p) => p.zone === g.zone && p.variant === 'wild');
      const btn = el('button', 'btn small', `Plant ${wild?.name ?? 'wildflower'} (${s.garden.wildSeeds} seeds)`) as HTMLButtonElement;
      btn.addEventListener('click', () => {
        if (!wild) return;
        if (this.app.state.garden.wildSeeds <= 0) return;
        this.app.state.garden.wildSeeds--;
        this.app.state.garden.plots.push({
          plantId: wild.id,
          zone: g.zone,
          slot: g.slot,
          plantedAt: Date.now(),
          growthMs: wild.growthMin * 60_000,
          bloomed: false,
          bloomedAt: null,
          revealed: true
        });
        this.app.state.serenity += Math.round(wild.serenity * 0.4);
        this.app.state.totalPlants++;
        audio.plant();
        haptic(12);
        this.app.toast(`${wild.name} planted.`);
        this.app.checkZonesAndCreatures();
        this.app.requestSave();
        pop.remove();
        this.updateHud();
      });
      pop.appendChild(btn);
    } else {
      pop.appendChild(el('p', 'subtle', 'Wildflower seeds come with the morning dew. Top-tier items from the board can be planted too — tap them on the Board.'));
    }
    document.body.appendChild(pop);
    positionPop(pop, g.x, g.y - g.r, window.innerWidth, window.innerHeight);
    dismissable(pop, () => {});
  }

  private showPlantInfo(g: PlotGeom, planting: PlantingView): void {
    const def = plantById(planting.plantId);
    if (!def) return;
    const prog = Math.round(growthProgress(planting, Date.now()) * 100);
    const pop = el('div', 'pop');
    pop.innerHTML = `
      <div class="pt">${def.name}</div>
      <p class="subtle">${planting.bloomed ? 'In full bloom. Serenity settled like snow.' : `Growing... ${prog}%. It blooms when ready — or overnight.`}</p>`;
    document.body.appendChild(pop);
    positionPop(pop, g.x, g.y - g.r, window.innerWidth, window.innerHeight);
    dismissable(pop, () => {});
  }

  /* ---------- creature visits ---------- */

  private maybeSpawnVisit(): void {
    if (this.visit) return;
    const s = this.app.state;
    const openMs = performance.now() - this.openSince;
    const def = rollAmbientVisit(s, creatures, looseRng, Date.now(), openMs);
    if (def) {
      const dir: 1 | -1 = looseRng.chance(0.5) ? 1 : -1;
      this.visit = {
        def,
        enteredAt: Date.now(),
        x: dir === 1 ? -60 : window.innerWidth + 60,
        dir,
        phase: 'walkin',
        welcomed: false
      };
      this.app.toast(`A soft rustle... ${def.species === 'Whale-Cloud' ? 'something drifts overhead' : 'someone is visiting the garden'}`);
      audio.creature();
      haptic(18);
      this.app.sr(`${def.name} the ${def.species} has entered the garden.`);
    }
  }

  private welcomeVisitor(): void {
    if (!this.visit || this.visit.welcomed) return;
    const v = this.visit;
    v.welcomed = true;
    const res = welcomeCreature(this.app.state, v.def, Date.now());
    haptic(24);
    const chIdx = res.chapter ?? Math.max(0, v.def.chapters.length - 1);
    const chapter = v.def.chapters[chIdx];
    openStory({
      creature: v.def,
      chapter,
      chapterIdx: chIdx,
      isNewFriend: res.firstTime,
      chaptersLeft: res.chaptersLeft,
      onClose: () => {
        if (this.visit) this.visit.phase = 'leave';
        this.app.requestSave();
      }
    });
  }

  /** Dev/debug: force a visitor right now. */
  debugVisit(): void {
    if (this.visit) return;
    const s = this.app.state;
    const candidates = creatures.filter((c) => s.serenity >= c.threshold * 0.35);
    const def = candidates[candidates.length - 1] ?? creatures[0];
    const dir: 1 | -1 = 1;
    this.visit = { def, enteredAt: Date.now(), x: -60, dir, phase: 'walkin', welcomed: false };
    this.app.toast(`${def.name} the ${def.species} wanders in...`);
    audio.creature();
  }

  /* ---------- frame ---------- */

  update(dt: number, _t: number): void {
    for (let i = this.bloomFx.length - 1; i >= 0; i--) {
      this.bloomFx[i].t += dt;
      if (this.bloomFx[i].t > 1.6) this.bloomFx.splice(i, 1);
    }
    // in-session blooms
    const bloomed = sweepBlooms(this.app.state, Date.now());
    for (const b of bloomed) {
      const def = plantById(b.plantId);
      if (def) {
        this.app.state.serenity += plantSerenityOnBloom(def);
        const g = this.plotGeoms.find((p) => p.zone === b.zone && p.slot === b.slot);
        if (g) this.bloomFx.push({ x: g.x, y: g.y, t: 0 });
        this.app.toast(`${def.name} has bloomed.`);
        audio.bloom();
        this.app.checkZonesAndCreatures();
        this.app.requestSave();
        this.updateHud();
      }
    }
    this.maybeSpawnVisit();
    // visit movement
    if (this.visit) {
      const v = this.visit;
      const speed = v.def.art === 'whale' ? 22 : 60;
      const targetX = v.dir === 1 ? window.innerWidth * 0.5 : window.innerWidth * 0.5;
      if (v.phase === 'walkin') {
        const dist = targetX - v.x;
        if (Math.abs(dist) < 6) v.phase = 'stay';
        else v.x += Math.sign(dist) * Math.min(speed * dt, Math.abs(dist));
      } else if (v.phase === 'stay') {
        if (Date.now() - v.enteredAt > 75000) v.phase = 'leave';
      } else {
        v.x += v.dir * speed * 1.4 * dt;
        if (v.x < -80 || v.x > window.innerWidth + 80) this.visit = null;
      }
    }
  }

  onPointerDown(px: number, py: number): void {
    // creature hit test first
    if (this.visit && this.visit.phase !== 'leave') {
      const v = this.visit;
      const scale = Math.min(window.innerWidth, window.innerHeight) * 0.16;
      const cy = v.def.art === 'whale' ? window.innerHeight * 0.24 : window.innerHeight * 0.62;
      if (Math.abs(px - v.x) < scale && Math.abs(py - cy) < scale) {
        this.welcomeVisitor();
        return;
      }
    }
    const g = this.plotGeoms.find((p) => Math.hypot(px - p.x, py - p.y) < p.r * 1.5);
    if (!g) return;
    const planting = this.app.state.garden.plots.find((p) => p.zone === g.zone && p.slot === g.slot);
    if (planting) this.showPlantInfo(g, planting);
    else this.tryPlantWild(g);
  }

  draw(ctx: Ctx, w: number, h: number, time: number): void {
    this.computePlots(w, h);
    const s = this.app.state;
    const zone = zones[this.currentZone];
    const rm = s.settings.reducedMotion;

    // zone ground band
    const top = h * 0.3;
    ctx.fillStyle = zone.ground;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, top + h * 0.14);
    for (let x = 0; x <= w; x += w / 12) {
      ctx.lineTo(x, top + h * 0.14 + Math.sin(x / w * 2.4 + this.currentZone) * h * 0.03);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = zone.ground2;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, top + h * 0.3);
    for (let x = 0; x <= w; x += w / 10) {
      ctx.lineTo(x, top + h * 0.3 + Math.sin(x / w * 3.1 + this.currentZone * 2) * h * 0.035);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // ambient flora dots
    for (let i = 0; i < 16; i++) {
      const fx = ((i * 173) % 100) / 100 * w;
      const fy = top + h * 0.2 + ((i * 97) % 100) / 100 * h * 0.6;
      glow(ctx, fx, fy, 3.2, i % 2 ? zone.flora : zone.flora2, 0.35);
    }
    // fireflies ambience
    const ff = this.app.bg.ambientFireflies(time, w, h, rm);
    for (const [fx, fy] of ff) glow(ctx, fx, fy, 5, '#ffe08a', 0.5);

    // plots + plants
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const spritePx = Math.round(w * 0.14 * dpr);
    for (const g of this.plotGeoms) {
      // plot soil
      glow(ctx, g.x, g.y + g.r * 0.35, g.r * 1.9, zone.flora, 0.22);
      ctx.fillStyle = 'rgba(20, 14, 44, 0.65)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + g.r * 0.4, g.r, g.r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(zone.flora2, 0.3);
      ctx.lineWidth = 1.4;
      ctx.stroke();

      const planting = s.garden.plots.find((p) => p.zone === g.zone && p.slot === g.slot);
      if (planting) {
        const def = plantById(planting.plantId);
        if (!def) continue;
        const prog = growthProgress(planting, Date.now());
        const scale = 0.4 + 0.6 * prog;
        const src = SOURCE_ITEM[def.source];
        if (src) {
          const variant = def.variant === 'gold' ? 'gold' : 'normal';
          const sprite = getItemSprite(src.chain, src.tier, variant, spritePx);
          const dsz = g.r * 2.4 * scale;
          if (planting.bloomed) {
            glow(ctx, g.x, g.y, g.r * 1.7, def.palette.glow, 0.5);
          }
          ctx.drawImage(sprite, g.x - dsz / 2, g.y - dsz * 0.62, dsz, dsz);
        } else {
          this.drawWildPlant(ctx, def, g, scale, time);
        }
        // growth ring (goal-gradient: fills faster near the end)
        if (!planting.bloomed) {
          ctx.save();
          ctx.strokeStyle = rgba('#8ff0d8', 0.85);
          ctx.lineWidth = 2.4;
          ctx.lineCap = 'round';
          const eased = Math.pow(prog, 0.8);
          ctx.beginPath();
          ctx.ellipse(g.x, g.y + g.r * 0.42, g.r * 0.9, g.r * 0.38, 0, -Math.PI / 2, -Math.PI / 2 + eased * Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else {
          if (!rm && looseRng.chance(0.02)) this.app.particles.sparkleAt(g.x + looseRng.range(-g.r, g.r), g.y - g.r * looseRng.range(0, 1.4), '#fff6d8');
        }
      } else {
        // empty plot glimmer
        glow(ctx, g.x, g.y, g.r * 0.6, zone.flora2, 0.18);
      }
    }

    // bloom FX bursts
    for (const f of this.bloomFx) {
      const k = f.t / 1.6;
      glow(ctx, f.x, f.y, Math.min(w, h) * 0.2 * (0.4 + k), '#ffe9a8', 0.5 * (1 - k));
      if (!rm && looseRng.chance(0.4)) this.app.particles.sparkleAt(f.x + looseRng.range(-30, 30), f.y - looseRng.range(0, 40), '#fff2c8');
    }

    // visiting creature
    if (this.visit) {
      const v = this.visit;
      const scale = Math.min(w, h) * (v.def.art === 'whale' ? 0.3 : 0.17);
      const cy = v.def.art === 'whale' ? h * 0.24 : h * 0.62;
      if (!v.welcomed && v.phase !== 'leave') {
        glow(ctx, v.x, cy, scale * 0.9, '#ffe9a8', 0.22 + 0.1 * Math.sin(time * 2));
      }
      drawCreature(ctx, v.def.art, v.x, cy, scale, time, v.def.palette, { reducedMotion: rm });
    }
  }

  private drawWildPlant(ctx: Ctx, def: PlantDef, g: PlotGeom, scale: number, time: number): void {
    const r = g.r * scale;
    if (def.source === 'dewbell') {
      // stem + bell
      ctx.strokeStyle = '#3fae91';
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.quadraticCurveTo(g.x + r * 0.1, g.y - r, g.x, g.y - r * 1.7);
      ctx.stroke();
      glow(ctx, g.x, g.y - r * 1.8, r * 0.9, def.palette.glow, 0.5);
      ctx.fillStyle = def.palette.petal;
      ctx.beginPath();
      ctx.moveTo(g.x - r * 0.35, g.y - r * 1.9);
      ctx.quadraticCurveTo(g.x - r * 0.5, g.y - r * 1.4, g.x - r * 0.3, g.y - r * 1.35);
      ctx.lineTo(g.x + r * 0.3, g.y - r * 1.35);
      ctx.quadraticCurveTo(g.x + r * 0.5, g.y - r * 1.4, g.x + r * 0.35, g.y - r * 1.9);
      ctx.quadraticCurveTo(g.x, g.y - r * 2.15, g.x - r * 0.35, g.y - r * 1.9);
      ctx.fill();
      sparkle(ctx, g.x, g.y - r * 2.1, r * 0.14, '#fff', 0.8);
    } else {
      // nightgrass tuft with dew
      ctx.strokeStyle = def.palette.petal;
      ctx.lineWidth = Math.max(1.4, r * 0.09);
      ctx.lineCap = 'round';
      for (const dx of [-0.5, -0.2, 0.15, 0.45]) {
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.quadraticCurveTo(g.x + dx * r, g.y - r * 0.9, g.x + dx * r * 1.8, g.y - r * (1.4 + Math.abs(dx) * 0.4 + Math.sin(time + dx * 3) * 0.06));
        ctx.stroke();
      }
      glow(ctx, g.x + r * 0.4, g.y - r * 1.1, r * 0.24, def.palette.core, 0.8);
    }
  }
}

function dewToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
