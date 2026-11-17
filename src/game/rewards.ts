/**
 * Variable-ratio reward scheduler with a pity timer.
 *
 * Design (non-manipulative):
 * - Rewards may arrive after ANY merge on a variable-ratio schedule.
 * - The true probability is re-drawn every BATCH merges within [P_MIN, P_MAX].
 * - A pity timer guarantees a reward after at most PITY merges without one.
 * - All numbers live in REWARD_TUNING and are documented in the README.
 */
import { Rng } from '../core/rng';

export const REWARD_TUNING = {
  /** re-draw the variable probability every N merges */
  BATCH: 8,
  /** guaranteed reward after at most N merges without one */
  PITY: 22,
  /** variable-ratio probability bounds */
  P_MIN: 0.04,
  P_MAX: 0.1
} as const;

export type RewardKind = 'gold' | 'silver' | 'energy' | 'seed' | 'lure';

export interface RewardState {
  mergesSinceReward: number;
  batchPos: number;
  batchProb: number;
}

export function defaultRewardState(): RewardState {
  return { mergesSinceReward: 0, batchPos: 0, batchProb: 0.06 };
}

export function rollBatch(rs: RewardState, rng: Rng): void {
  if (rs.batchPos >= REWARD_TUNING.BATCH) {
    rs.batchPos = 0;
    rs.batchProb = REWARD_TUNING.P_MIN + rng.next() * (REWARD_TUNING.P_MAX - REWARD_TUNING.P_MIN);
  }
}

const WEIGHTS: Array<[RewardKind, number]> = [
  ['gold', 0.32],
  ['silver', 0.22],
  ['energy', 0.2],
  ['lure', 0.15],
  ['seed', 0.11]
];

export function pickRewardKind(rng: Rng, forced: boolean): RewardKind {
  if (forced && rng.next() < 0.5) return 'gold';
  let roll = rng.next();
  for (const [kind, w] of WEIGHTS) {
    if (roll < w) return kind;
    roll -= w;
  }
  return 'energy';
}

/** Feed one merge. Returns the reward kind granted this merge (or null). */
export function onMergeReward(rs: RewardState, rng: Rng): RewardKind | null {
  rollBatch(rs, rng);
  rs.batchPos++;
  rs.mergesSinceReward++;
  const forced = rs.mergesSinceReward >= REWARD_TUNING.PITY;
  const hit = forced || rng.next() < rs.batchProb;
  if (!hit) return null;
  rs.mergesSinceReward = 0;
  return pickRewardKind(rng, forced);
}

export const REWARD_LABEL: Record<RewardKind, string> = {
  gold: 'A petal turned to gold',
  silver: 'A petal turned to silver',
  energy: 'Moonwell refilled',
  seed: 'A wildflower seed drifted in',
  lure: 'Something soft heard the chime'
};
