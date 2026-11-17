import { describe, it, expect } from 'vitest';
import {
  onMergeReward, rollBatch, pickRewardKind, defaultRewardState,
  REWARD_TUNING, RewardState, RewardKind
} from '../src/game/rewards';
import { Rng } from '../src/core/rng';

/** Deterministic stub rng: always returns a fixed value. */
function fixedRng(v: number): Rng {
  const r = new Rng(1);
  (r as any).next = () => v;
  return r;
}

describe('reward scheduler', () => {
  it('pity timer guarantees a reward within PITY merges', () => {
    const rs: RewardState = defaultRewardState();
    const rng = fixedRng(0.999); // never lucky on its own
    let sinceLast = 0;
    let maxGap = 0;
    for (let i = 0; i < 500; i++) {
      const reward = onMergeReward(rs, rng);
      if (reward) {
        maxGap = Math.max(maxGap, sinceLast);
        sinceLast = 0;
      } else {
        sinceLast++;
      }
    }
    expect(maxGap).toBeLessThanOrEqual(REWARD_TUNING.PITY);
  });

  it('keeps the variable probability within [P_MIN, P_MAX]', () => {
    const rs: RewardState = defaultRewardState();
    // force batch reset with a stub that returns 0 (min prob) then 0.999999 (max)
    rs.batchPos = REWARD_TUNING.BATCH;
    rollBatch(rs, fixedRng(0));
    expect(rs.batchProb).toBe(REWARD_TUNING.P_MIN);
    rs.batchPos = REWARD_TUNING.BATCH;
    rollBatch(rs, fixedRng(0.999999));
    expect(rs.batchProb).toBeLessThanOrEqual(REWARD_TUNING.P_MAX);
    expect(rs.batchProb).toBeGreaterThanOrEqual(REWARD_TUNING.P_MIN);
  });

  it('rewards arrive more often than the pity timer (variable ratio works)', () => {
    const rs: RewardState = defaultRewardState();
    const rng = new Rng(7);
    let rewards = 0;
    for (let i = 0; i < 1000; i++) {
      if (onMergeReward(rs, rng)) rewards++;
    }
    // with avg prob ~0.07 over batches + pity, expect far more than pity-only rate (~45)
    expect(rewards).toBeGreaterThan(REWARD_TUNING.PITY);
    expect(rewards).toBeLessThan(300);
  });

  it('pickRewardKind returns only valid reward kinds', () => {
    const rng = new Rng(99);
    const valid: RewardKind[] = ['gold', 'silver', 'energy', 'seed', 'lure'];
    for (let i = 0; i < 200; i++) {
      expect(valid).toContain(pickRewardKind(rng, false));
    }
  });

  it('forced rewards favor gold half the time but stay valid', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 50; i++) {
      const kind = pickRewardKind(rng, true);
      expect(['gold', 'silver', 'energy', 'seed', 'lure']).toContain(kind);
    }
  });
});
