/**
 * BoardModel — the pure 7x9 merge logic. No DOM/canvas here so tests can run it.
 *
 * Rules:
 * - Drop item A onto identical item B (same chain+tier) -> merge into tier+1 at B's cell.
 *   Any identical items 4-adjacent to B join the merge (multi-merge bonus).
 *   After the merge, if identical (new-tier) items sit adjacent, they cascade upward
 *   (max 3 cascades, max 6 consumed items total per drop).
 * - Drop onto empty cell -> move. Drop onto different item -> gentle swap.
 * - Top-tier items cannot merge (they are plantable in the garden).
 */
import { CHAINS, ChainId, Item, Variant, maxTier, mergeVariant } from '../data/chains';
import { Rng } from '../core/rng';

export const BOARD_W = 7;
export const BOARD_H = 9;
export const MAX_CONSUMED = 6;
export const MAX_CASCADES = 3;

export type DropOutcome =
  | { kind: 'none' }
  | { kind: 'move'; to: number; item: Item }
  | { kind: 'swap'; a: number; b: number }
  | {
      kind: 'merge';
      cell: number;
      chain: ChainId;
      tier: number;
      variant: Variant;
      /** how many items went in (2 = normal pair, 3+ = bonus) */
      consumed: number;
      cascades: number;
    };

let uidCounter = 0;
export function makeItem(chain: ChainId, tier: number, variant: Variant = 'normal'): Item {
  uidCounter = (uidCounter + 1) % 1_000_000;
  return { uid: `i${uidCounter}_${(uidCounter * 2654435761) % 9973}`, chain, tier, variant };
}

export class BoardModel {
  readonly w = BOARD_W;
  readonly h = BOARD_H;
  cells: (Item | null)[] = new Array(BOARD_W * BOARD_H).fill(null);

  constructor(cells?: (Item | null)[]) {
    if (cells && cells.length === this.cells.length) {
      this.cells = cells.map((c) => (c ? { ...c } : null));
    }
  }

  idx(r: number, c: number): number {
    return r * this.w + c;
  }
  rc(i: number): [number, number] {
    return [Math.floor(i / this.w), i % this.w];
  }
  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.h && c >= 0 && c < this.w;
  }

  neighbors(i: number): number[] {
    const [r, c] = this.rc(i);
    const out: number[] = [];
    const d = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
    for (const [dr, dc] of d) {
      const nr = r + dr;
      const nc = c + dc;
      if (this.inBounds(nr, nc)) out.push(this.idx(nr, nc));
    }
    return out;
  }

  emptyCells(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (!this.cells[i]) out.push(i);
    return out;
  }

  firstEmpty(): number | null {
    return this.emptyCells()[0] ?? null;
  }

  randomEmpty(rng: Rng): number | null {
    const e = this.emptyCells();
    if (e.length === 0) return null;
    return e[Math.floor(rng.next() * e.length)];
  }

  /** Spawn one tier-1 item (moon chain weighted slightly above dust chain). */
  spawnSeed(rng: Rng, variant: Variant = 'normal'): { cell: number; item: Item } | null {
    const cell = this.randomEmpty(rng);
    if (cell === null) return null;
    const chain: ChainId = rng.next() < 0.62 ? 'moon' : 'dust';
    const item = makeItem(chain, 1, variant);
    this.cells[cell] = item;
    return { cell, item };
  }

  sameKind(a: Item, b: Item): boolean {
    return a.chain === b.chain && a.tier === b.tier;
  }

  /** Classify a drag drop, mutating the board. Pure logic + mutation. */
  drop(from: number, to: number): DropOutcome {
    if (from === to || from < 0 || to < 0 || from >= this.cells.length || to >= this.cells.length) {
      return { kind: 'none' };
    }
    const a = this.cells[from];
    const b = this.cells[to];
    if (a && !b) {
      this.cells[to] = a;
      this.cells[from] = null;
      return { kind: 'move', to, item: a };
    }
    if (!a) return { kind: 'none' };
    if (!b) return { kind: 'none' };

    if (a.chain !== b.chain || a.tier !== b.tier) {
      // gentle swap
      this.cells[from] = b;
      this.cells[to] = a;
      return { kind: 'swap', a: from, b: to };
    }

    // identical items -> merge (unless top tier: plantable, not mergeable)
    if (a.tier >= maxTier(a.chain)) return { kind: 'none' };

    const variant = mergeVariant(a.variant, b.variant);
    const chain = a.chain;
    let consumed = 2;
    this.cells[from] = null;
    for (const n of this.neighbors(to)) {
      if (consumed >= MAX_CONSUMED) break;
      const it = this.cells[n];
      if (it && it.chain === chain && it.tier === a.tier) {
        this.cells[n] = null;
        consumed++;
      }
    }

    let tier = a.tier + 1;
    let cascades = 0;
    this.cells[to] = makeItem(chain, tier, variant);

    while (cascades < MAX_CASCADES && tier < maxTier(chain)) {
      const more: number[] = this.neighbors(to).filter((n) => {
        const it = this.cells[n];
        return !!it && it.chain === chain && it.tier === tier && consumed < MAX_CONSUMED;
      });
      if (more.length === 0) break;
      for (const n of more) {
        if (consumed >= MAX_CONSUMED) break;
        this.cells[n] = null;
        consumed++;
      }
      cascades++;
      tier++;
      this.cells[to] = makeItem(chain, tier, variant);
    }

    return { kind: 'merge', cell: to, chain, tier, variant, consumed, cascades };
  }

  /** Highest tier present on the board (for the dynamic goal). */
  maxTierOnBoard(): number {
    let m = 0;
    for (const it of this.cells) if (it && it.chain === 'moon') m = Math.max(m, it.tier);
    return m;
  }

  countPlantable(): number {
    let n = 0;
    for (const it of this.cells) if (it && this.isPlantableItem(it)) n++;
    return n;
  }

  isPlantableItem(it: Item): boolean {
    return it.tier >= maxTier(it.chain);
  }

  removeAt(cell: number): Item | null {
    const it = this.cells[cell];
    this.cells[cell] = null;
    return it;
  }
}

/** Energy bonus for a multi-merge: +BONUS_ENERGY_PER_EXTRA per extra item. */
export function multiMergeBonusEnergy(consumed: number): number {
  return Math.max(0, consumed - 2) * 4;
}
