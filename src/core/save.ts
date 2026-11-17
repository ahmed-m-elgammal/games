/**
 * Save/load + offline simulation. localStorage-backed, versioned, corruption-safe.
 * All "while you were away" math (energy regen, overnight blooms, dew gift) lives
 * here in pure functions so tests can drive it with fake clocks.
 */
import { Item } from '../data/chains';
import { RewardState, defaultRewardState } from '../game/rewards';

export const SAVE_KEY = 'moonpetal-save-v1';
export const SAVE_VERSION = 1;
export const ENERGY_MAX = 100;
export const ENERGY_REGEN_MS = 10_000; // +1 energy per 10s, offline too
export const SPAWN_COST = 10;
export const OVERNIGHT_AFTER_MS = 3.5 * 3600_000; // away >= 3.5h -> garden blooms

export type SessionMin = 5 | 10 | 15 | 20;
export type MoodPref = 'auto' | 'dawn' | 'moon' | 'star';

export interface Planting {
  plantId: string;
  zone: number;
  slot: number;
  plantedAt: number;
  growthMs: number;
  bloomed: boolean;
  bloomedAt: number | null;
  revealed: boolean;
}

export interface CreatureProgress {
  visits: number;
  chaptersRead: number;
  firstSeen: number | null;
}

export interface RevealInfo {
  plantId: string;
  zone: number;
  slot: number;
}

export interface GameState {
  v: number;
  createdAt: number;
  lastSeen: number;
  energy: number;
  energyTs: number;
  serenity: number;
  totalMerges: number;
  totalPlants: number;
  board: { cells: (Item | null)[] };
  garden: {
    plots: Planting[];
    wildSeeds: number;
    zonesUnlocked: number;
    revealQueue: RevealInfo[];
    visitCooldownUntil: number;
    lureUntil?: number;
  };
  creatures: Record<string, CreatureProgress>;
  reward: RewardState;
  session: {
    startedAt: number | null;
    lengthMin: SessionMin;
    extraUsed: boolean;
    endedAt: number | null;
    freeSpawns: number;
  };
  dew: { lastGiftDate: string | null };
  settings: {
    musicVol: number;
    sfxVol: number;
    masterVol: number;
    haptics: boolean;
    reducedMotion: boolean;
    colorAssist: boolean;
    autoDim: boolean;
    sessionMin: SessionMin;
    mood: MoodPref;
  };
}

export function todayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function defaultState(now = Date.now()): GameState {
  return {
    v: SAVE_VERSION,
    createdAt: now,
    lastSeen: now,
    energy: ENERGY_MAX,
    energyTs: now,
    serenity: 0,
    totalMerges: 0,
    totalPlants: 0,
    board: { cells: new Array(63).fill(null) },
    garden: {
      plots: [],
      wildSeeds: 1,
      zonesUnlocked: 1,
      revealQueue: [],
      visitCooldownUntil: 0
    },
    creatures: {},
    reward: defaultRewardState(),
    session: {
      startedAt: null,
      lengthMin: 15,
      extraUsed: false,
      endedAt: null,
      freeSpawns: 0
    },
    dew: { lastGiftDate: null },
    settings: {
      musicVol: 55,
      sfxVol: 70,
      masterVol: 85,
      haptics: true,
      reducedMotion: false,
      colorAssist: false,
      autoDim: true,
      sessionMin: 15,
      mood: 'auto'
    }
  };
}

/** Deep-merge saved data onto defaults; tolerant of older/partial saves. */
export function migrate(raw: any): GameState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const s = base;
  try {
    s.createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : base.createdAt;
    s.lastSeen = typeof raw.lastSeen === 'number' ? raw.lastSeen : base.lastSeen;
    s.energy = clampNum(raw.energy, 0, ENERGY_MAX, base.energy);
    s.energyTs = typeof raw.energyTs === 'number' ? raw.energyTs : base.energyTs;
    s.serenity = Math.max(0, raw.serenity | 0);
    s.totalMerges = Math.max(0, raw.totalMerges | 0);
    s.totalPlants = Math.max(0, raw.totalPlants | 0);
    if (raw.board && Array.isArray(raw.board.cells) && raw.board.cells.length === 63) {
      s.board.cells = raw.board.cells.map((c: any) =>
        c && (c.chain === 'moon' || c.chain === 'dust') && Number.isFinite(c.tier)
          ? { uid: String(c.uid ?? 'r'), chain: c.chain, tier: clampNum(c.tier, 1, 6, 1), variant: c.variant === 'gold' || c.variant === 'silver' ? c.variant : 'normal' }
          : null
      );
    }
    if (raw.garden) {
      s.garden.wildSeeds = Math.max(0, raw.garden.wildSeeds | 0);
      s.garden.zonesUnlocked = clampNum(raw.garden.zonesUnlocked, 1, 5, 1);
      if (Array.isArray(raw.garden.plots)) {
        s.garden.plots = raw.garden.plots
          .filter((p: any) => p && typeof p.plantId === 'string')
          .map((p: any) => ({
            plantId: String(p.plantId),
            zone: clampNum(p.zone, 0, 4, 0),
            slot: clampNum(p.slot, 0, 11, 0),
            plantedAt: typeof p.plantedAt === 'number' ? p.plantedAt : Date.now(),
            growthMs: Math.max(60_000, p.growthMs | 0),
            bloomed: !!p.bloomed,
            bloomedAt: typeof p.bloomedAt === 'number' ? p.bloomedAt : null,
            revealed: !!p.revealed
          }));
      }
      if (Array.isArray(raw.garden.revealQueue)) {
        s.garden.revealQueue = raw.garden.revealQueue
          .filter((r: any) => r && typeof r.plantId === 'string')
          .map((r: any) => ({ plantId: String(r.plantId), zone: r.zone | 0, slot: r.slot | 0 }));
      }
    }
    if (raw.creatures && typeof raw.creatures === 'object') {
      for (const [id, cp] of Object.entries(raw.creatures)) {
        const c = cp as any;
        s.creatures[id] = {
          visits: Math.max(0, c.visits | 0),
          chaptersRead: Math.max(0, c.chaptersRead | 0),
          firstSeen: typeof c.firstSeen === 'number' ? c.firstSeen : null
        };
      }
    }
    if (raw.reward) {
      s.reward = {
        mergesSinceReward: Math.max(0, raw.reward.mergesSinceReward | 0),
        batchPos: Math.max(0, raw.reward.batchPos | 0),
        batchProb: clampNum(raw.reward.batchProb, 0.01, 0.5, 0.06)
      };
    }
    if (raw.session) {
      s.session.startedAt = typeof raw.session.startedAt === 'number' ? raw.session.startedAt : null;
      s.session.lengthMin = ([5, 10, 15, 20] as number[]).includes(raw.session.lengthMin)
        ? raw.session.lengthMin
        : base.session.lengthMin;
      s.session.extraUsed = !!raw.session.extraUsed;
      s.session.endedAt = typeof raw.session.endedAt === 'number' ? raw.session.endedAt : null;
    }
    if (raw.dew) s.dew.lastGiftDate = typeof raw.dew.lastGiftDate === 'string' ? raw.dew.lastGiftDate : null;
    if (raw.settings) {
      const st = raw.settings;
      s.settings.musicVol = clampNum(st.musicVol, 0, 100, 55);
      s.settings.sfxVol = clampNum(st.sfxVol, 0, 100, 70);
      s.settings.masterVol = clampNum(st.masterVol, 0, 100, 85);
      s.settings.haptics = st.haptics !== false;
      s.settings.reducedMotion = !!st.reducedMotion;
      s.settings.colorAssist = !!st.colorAssist;
      s.settings.autoDim = st.autoDim !== false;
      s.settings.sessionMin = ([5, 10, 15, 20] as number[]).includes(st.sessionMin) ? st.sessionMin : 15;
      s.settings.mood = ['auto', 'dawn', 'moon', 'star'].includes(st.mood) ? st.mood : 'auto';
    }
  } catch {
    return defaultState(raw.createdAt ?? Date.now());
  }
  s.v = SAVE_VERSION;
  return s;
}

function clampNum(v: any, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(raw: string | null): { state: GameState; fresh: boolean; error?: string } {
  if (!raw) return { state: defaultState(), fresh: true };
  try {
    const parsed = JSON.parse(raw);
    return { state: migrate(parsed), fresh: false };
  } catch (e) {
    return { state: defaultState(), fresh: true, error: String(e) };
  }
}

/** Energy regen computed against a fake/real clock. Mutates state to now. */
export function computeEnergy(s: GameState, now: number): number {
  const elapsed = Math.max(0, now - s.energyTs);
  const gain = Math.floor(elapsed / ENERGY_REGEN_MS);
  if (gain > 0) {
    s.energy = Math.min(ENERGY_MAX, s.energy + gain);
    s.energyTs = s.energyTs + gain * ENERGY_REGEN_MS;
    if (s.energy >= ENERGY_MAX) s.energyTs = now;
  }
  return s.energy;
}

export function spendEnergy(s: GameState, n: number, now: number): boolean {
  computeEnergy(s, now);
  if (s.energy < n) return false;
  s.energy -= n;
  return true;
}

export function gainEnergy(s: GameState, n: number, now: number): void {
  computeEnergy(s, now);
  s.energy = Math.min(ENERGY_MAX, s.energy + n);
}

export interface OfflineReport {
  awayMs: number;
  energyGain: number;
  bloomed: RevealInfo[];
  dewGift: boolean;
  newDate: boolean;
}

/**
 * Apply "while you were away": energy regen, overnight blooms (Zeigarnik hook),
 * and the daily dew-drop gift. Non-blocking, never punishing.
 */
export function applyOffline(s: GameState, now: number): OfflineReport {
  const prevEnergy = s.energy;
  computeEnergy(s, now);
  const energyGain = s.energy - prevEnergy;
  const awayMs = Math.max(0, now - s.lastSeen);
  const report: OfflineReport = { awayMs, energyGain, bloomed: [], dewGift: false, newDate: false };

  // Overnight bloom: anything planted before we left and not yet bloomed -> blooms.
  if (awayMs >= OVERNIGHT_AFTER_MS) {
    for (const p of s.garden.plots) {
      if (!p.bloomed && p.plantedAt <= s.lastSeen) {
        p.bloomed = true;
        p.bloomedAt = now;
        p.revealed = false;
        report.bloomed.push({ plantId: p.plantId, zone: p.zone, slot: p.slot });
        s.garden.revealQueue.push({ plantId: p.plantId, zone: p.zone, slot: p.slot });
      }
    }
  }

  const today = todayKey(now);
  report.newDate = s.dew.lastGiftDate !== today;
  report.dewGift = report.newDate;
  s.lastSeen = now;
  return report;
}

/** Dew gift claim: +40 energy and a wildflower seed. No streaks, no guilt. */
export function claimDewGift(s: GameState, now: number): void {
  s.dew.lastGiftDate = todayKey(now);
  gainEnergy(s, 40, now);
  s.garden.wildSeeds += 1;
}

export function newSession(s: GameState, now: number): void {
  s.session.startedAt = now;
  s.session.extraUsed = false;
  s.session.endedAt = null;
  s.session.freeSpawns = 0;
}

export function localStorageSave(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s));
  } catch {
    /* storage full or blocked — play on */
  }
}

export function localStorageLoad(): { state: GameState; fresh: boolean; error?: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    raw = null;
  }
  return deserialize(raw);
}
