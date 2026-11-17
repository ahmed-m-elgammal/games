import { describe, it, expect } from 'vitest';
import {
  defaultState, serialize, deserialize, migrate, applyOffline, computeEnergy,
  claimDewGift, todayKey, ENERGY_MAX, OVERNIGHT_AFTER_MS
} from '../src/core/save';
import { makeItem } from '../src/game/board';

const HOUR = 3600_000;

describe('save/load', () => {
  it('round-trips a full state through serialize/deserialize', () => {
    const s = defaultState(1000);
    s.serenity = 420;
    s.energy = 77;
    s.energyTs = 5000;
    s.totalMerges = 123;
    s.board.cells[5] = makeItem('moon', 3, 'gold');
    s.garden.plots.push({
      plantId: 'glade-moonpetal', zone: 0, slot: 1,
      plantedAt: 900, growthMs: 8 * 60000, bloomed: false, bloomedAt: null, revealed: true
    });
    s.creatures['luna'] = { visits: 2, chaptersRead: 1, firstSeen: 800 };
    const raw = serialize(s);
    const back = deserialize(raw);
    expect(back.fresh).toBe(false);
    expect(back.state.serenity).toBe(420);
    expect(back.state.board.cells[5]?.variant).toBe('gold');
    expect(back.state.garden.plots[0].plantId).toBe('glade-moonpetal');
    expect(back.state.creatures['luna'].chaptersRead).toBe(1);
    expect(back.state.settings.sessionMin).toBe(15);
  });

  it('falls back to defaults on corrupt JSON', () => {
    const res = deserialize('{not json!!!');
    expect(res.fresh).toBe(true);
    expect(res.state.serenity).toBe(0);
    expect(res.state.board.cells.length).toBe(63);
  });

  it('migrates partial/older saves by filling defaults', () => {
    const migrated = migrate({ serenity: 55, board: { cells: [] }, nonsense: true });
    expect(migrated.serenity).toBe(55);
    expect(migrated.board.cells.length).toBe(63);
    expect(migrated.settings.musicVol).toBe(55);
    expect(migrated.garden.zonesUnlocked).toBe(1);
  });

  it('clamps invalid values during migration', () => {
    const migrated = migrate({ energy: 9999, garden: { zonesUnlocked: 99 }, settings: { sessionMin: 7 } });
    expect(migrated.energy).toBe(ENERGY_MAX);
    expect(migrated.garden.zonesUnlocked).toBe(5);
    expect(migrated.settings.sessionMin).toBe(15);
  });
});

describe('offline simulation', () => {
  it('regenerates energy over time, capped', () => {
    const s = defaultState(0);
    s.energy = 10;
    s.energyTs = 0;
    computeEnergy(s, 60_000); // 60s -> +6
    expect(s.energy).toBe(16);
    computeEnergy(s, 100 * HOUR);
    expect(s.energy).toBe(ENERGY_MAX);
  });

  it('blooms half-grown plants planted before lastSeen (Zeigarnik)', () => {
    const s = defaultState(0);
    s.garden.plots.push({
      plantId: 'glade-glowbloom', zone: 0, slot: 0,
      plantedAt: 1000, growthMs: 5 * 60000, bloomed: false, bloomedAt: null, revealed: true
    });
    s.lastSeen = 2000;
    const now = 2000 + OVERNIGHT_AFTER_MS + 1000;
    const report = applyOffline(s, now);
    expect(report.bloomed.length).toBe(1);
    expect(report.bloomed[0].plantId).toBe('glade-glowbloom');
    expect(s.garden.plots[0].bloomed).toBe(true);
    expect(s.garden.revealQueue.length).toBe(1);
  });

  it('does not bloom plants planted after leaving', () => {
    const s = defaultState(0);
    s.lastSeen = 2000;
    s.garden.plots.push({
      plantId: 'glade-glowbloom', zone: 0, slot: 0,
      plantedAt: 2000 + OVERNIGHT_AFTER_MS + 500, growthMs: 5 * 60000,
      bloomed: false, bloomedAt: null, revealed: true
    });
    const report = applyOffline(s, 2000 + OVERNIGHT_AFTER_MS * 2);
    expect(report.bloomed.length).toBe(0);
  });

  it('grants the dew gift once per local day', () => {
    const s = defaultState(Date.now());
    s.dew.lastGiftDate = null;
    const now = Date.now();
    const r1 = applyOffline(s, now);
    expect(r1.dewGift).toBe(true);
    claimDewGift(s, now);
    expect(s.dew.lastGiftDate).toBe(todayKey(now));
    const r2 = applyOffline(s, now + 1000);
    expect(r2.dewGift).toBe(false);
    expect(s.garden.wildSeeds).toBe(2); // 1 default + 1 gift
  });
});
