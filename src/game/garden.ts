/**
 * Garden logic: plantings, growth, serenity, zone unlocking. Pure (no canvas).
 * Serenity: 40% awarded when planted, 60% + sparkle when it blooms.
 */
import { GameState, RevealInfo } from '../core/save';

export interface ZoneDef {
  id: string;
  name: string;
  tagline: string;
  need: number;
  plots: number;
  ground: string;
  ground2: string;
  flora: string;
  flora2: string;
}

export interface PlantDef {
  id: string;
  name: string;
  zone: number;
  source: 'moonpetal' | 'glowbloom' | 'startree' | 'wisp' | 'constellation' | 'dewbell' | 'nightgrass';
  variant: 'normal' | 'gold' | 'silver' | 'wild';
  serenity: number;
  growthMin: number;
  palette: { petal: string; core: string; glow: string };
}

/** Source item -> chain/tier on the board. */
export const SOURCE_ITEM: Record<PlantDef['source'], { chain: 'moon' | 'dust'; tier: number } | null> = {
  moonpetal: { chain: 'moon', tier: 4 },
  glowbloom: { chain: 'moon', tier: 5 },
  startree: { chain: 'moon', tier: 6 },
  wisp: { chain: 'dust', tier: 4 },
  constellation: { chain: 'dust', tier: 5 },
  dewbell: null,
  nightgrass: null
};

export function growthProgress(p: { plantedAt: number; growthMs: number }, now: number): number {
  return Math.min(1, Math.max(0, (now - p.plantedAt) / p.growthMs));
}

export function isBloomReady(p: { bloomed: boolean; plantedAt: number; growthMs: number }, now: number): boolean {
  return !p.bloomed && growthProgress(p, now) >= 1;
}

export function makePlanting(def: PlantDef, zone: number, slot: number, now: number) {
  return {
    plantId: def.id,
    zone,
    slot,
    plantedAt: now,
    growthMs: Math.max(1, def.growthMin) * 60_000,
    bloomed: false,
    bloomedAt: null,
    revealed: true
  };
}

export function plantSerenityNow(def: PlantDef): number {
  return Math.round(def.serenity * 0.4);
}
export function plantSerenityOnBloom(def: PlantDef): number {
  return def.serenity - Math.round(def.serenity * 0.4);
}

export function plotTaken(state: GameState, zone: number, slot: number): boolean {
  return state.garden.plots.some((p) => p.zone === zone && p.slot === slot);
}

export function zoneUnlocked(state: GameState, zone: ZoneDef): boolean {
  return state.serenity >= zone.need;
}

/** Returns list of newly unlocked zone names (and bumps zonesUnlocked). */
export function checkZoneUnlocks(state: GameState, zones: ZoneDef[]): string[] {
  const newly: string[] = [];
  let count = 0;
  zones.forEach((z, i) => {
    if (state.serenity >= z.need) {
      count = i + 1;
      if (i + 1 > state.garden.zonesUnlocked) newly.push(z.name);
    }
  });
  if (count > state.garden.zonesUnlocked) state.garden.zonesUnlocked = count;
  return newly;
}

/** In-session bloom sweep: returns plants that just bloomed. */
export function sweepBlooms(state: GameState, now: number): PlantingView[] {
  const out: PlantingView[] = [];
  for (const p of state.garden.plots) {
    if (isBloomReady(p, now)) {
      p.bloomed = true;
      p.bloomedAt = now;
      p.revealed = true;
      out.push(p);
    }
  }
  return out;
}

export type PlantingView = GameState['garden']['plots'][number];

/** Mark overnight reveals as seen (after the ceremony). */
export function clearRevealQueue(state: GameState): RevealInfo[] {
  const q = state.garden.revealQueue;
  state.garden.revealQueue = [];
  for (const p of state.garden.plots) {
    for (const r of q) {
      if (p.zone === r.zone && p.slot === r.slot && p.plantId === r.plantId) p.revealed = true;
    }
  }
  return q;
}
