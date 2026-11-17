// ─────────────────────────────────────────────────────────────────────────────
// MODEL / interactions — the single edit queue contract (spec §4). The UI never
// mutates the world; it enqueues Interactions. The simulation consumes them at
// fixed ticks; the replay recorder records the same queue.
// Camera intents stay view-local in this slice (documented in README).
// ─────────────────────────────────────────────────────────────────────────────

import type { PartId, ToolId, Verdict } from "./schema";

export type Interaction =
  | { kind: "verdict"; shipId: string; verdict: Verdict }
  | { kind: "pinEvidence"; shipId: string; partId: PartId; index?: number }
  | { kind: "tool"; shipId: string; tool: ToolId };

export interface RecordedInteraction {
  tick: number;
  interaction: Interaction;
}

export class EditQueue {
  private pending: Interaction[] = [];
  private record: RecordedInteraction[] = [];

  enqueue(interaction: Interaction, tick: number): void {
    this.pending.push(interaction);
    this.record.push({ tick, interaction });
  }

  /** Drain everything pending; consumed by exactly one sim tick. */
  drain(): Interaction[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Full recorded queue — a replay is { seed, schemaVersion, record }. */
  replay(): RecordedInteraction[] {
    return this.record.slice();
  }

  get size(): number {
    return this.pending.length;
  }
}
