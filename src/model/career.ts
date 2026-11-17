// ─────────────────────────────────────────────────────────────────────────────
// MODEL / career — rank, tool unlocks and chapter escalation. Escalation is
// additive, never faster: one new chapter per shift, older rules stay in force.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from "./content";
import type { Career, ToolId } from "./schema";

export function rankOf(career: Career): number {
  let rank = 0;
  for (let i = 0; i < CONFIG.ranks.length; i++) {
    if (career.feesTotalCents >= CONFIG.ranks[i].feeThreshold) rank = i;
  }
  return rank;
}

export const toolsForRank = (rank: number): ToolId[] => CONFIG.ranks[rank].tools;

/** At most one new rulebook chapter per completed shift, capped at 6. */
export const chaptersFor = (career: Career): number =>
  Math.min(CONFIG.maxChapters, career.shiftsCompleted + 1);

export function newCareer(): Career {
  return {
    feesTotalCents: 0,
    shiftsCompleted: 0,
    factions: { crown: 0, guild: 0, smugglers: 0, church: 0 },
    missHistogram: {}
  };
}
