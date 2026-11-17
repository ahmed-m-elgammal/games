import { describe, it, expect } from 'vitest';
import { BoardModel, makeItem, multiMergeBonusEnergy, MAX_CONSUMED } from '../src/game/board';
import { Rng } from '../src/core/rng';

function seed(board: BoardModel, cells: Array<[number, 'moon' | 'dust', number]>) {
  for (const [cell, chain, tier] of cells) {
    board.cells[cell] = makeItem(chain, tier);
  }
}

describe('BoardModel merge logic', () => {
  it('merges two identical items into the next tier at the target cell', () => {
    const b = new BoardModel();
    seed(b, [[10, 'moon', 1], [11, 'moon', 1]]);
    const out = b.drop(10, 11);
    expect(out.kind).toBe('merge');
    if (out.kind === 'merge') {
      expect(out.tier).toBe(2);
      expect(out.chain).toBe('moon');
      expect(out.consumed).toBe(2);
      expect(b.cells[10]).toBeNull();
      expect(b.cells[11]?.tier).toBe(2);
    }
  });

  it('moves an item to an empty cell', () => {
    const b = new BoardModel();
    seed(b, [[0, 'moon', 1]]);
    const out = b.drop(0, 20);
    expect(out.kind).toBe('move');
    expect(b.cells[0]).toBeNull();
    expect(b.cells[20]?.tier).toBe(1);
  });

  it('swaps two different items', () => {
    const b = new BoardModel();
    seed(b, [[0, 'moon', 1], [1, 'dust', 2]]);
    const out = b.drop(0, 1);
    expect(out.kind).toBe('swap');
    expect(b.cells[0]?.chain).toBe('dust');
    expect(b.cells[1]?.chain).toBe('moon');
  });

  it('collects adjacent identical items into a 3+ merge (bonus)', () => {
    const b = new BoardModel();
    // target at 24 (r3c3), source at 25 (r3c4), extra adjacent at 31 (r4c3)
    seed(b, [[24, 'moon', 1], [25, 'moon', 1], [31, 'moon', 1]]);
    const out = b.drop(25, 24);
    expect(out.kind).toBe('merge');
    if (out.kind === 'merge') {
      expect(out.consumed).toBe(3);
      expect(out.tier).toBe(2);
      expect(multiMergeBonusEnergy(3)).toBe(4);
    }
  });

  it('caps consumed items at MAX_CONSUMED', () => {
    const b = new BoardModel();
    // target 24, source 25, extras 23,31,32 (up to 6)
    seed(b, [
      [24, 'moon', 1], [25, 'moon', 1], [23, 'moon', 1],
      [31, 'moon', 1], [32, 'moon', 1], [17, 'moon', 1]
    ]);
    const out = b.drop(25, 24);
    if (out.kind === 'merge') {
      expect(out.consumed).toBeLessThanOrEqual(MAX_CONSUMED);
    } else {
      expect.fail('expected merge');
    }
  });

  it('cascades upward when merged items touch same-tier items', () => {
    const b = new BoardModel();
    // pair: 10, 11 -> tier2 at 11. Adjacent tier2 at 12 -> cascade to tier3 at 11.
    seed(b, [[10, 'moon', 1], [11, 'moon', 1], [12, 'moon', 2]]);
    const out = b.drop(10, 11);
    expect(out.kind).toBe('merge');
    if (out.kind === 'merge') {
      expect(out.tier).toBe(3);
      expect(out.cascades).toBe(1);
      expect(b.cells[11]?.tier).toBe(3);
      expect(b.cells[12]).toBeNull();
    }
  });

  it('refuses to merge top-tier items (they are plantable)', () => {
    const b = new BoardModel();
    seed(b, [[0, 'moon', 6], [1, 'moon', 6]]);
    const out = b.drop(0, 1);
    expect(out.kind).toBe('none');
    expect(b.cells[0]?.tier).toBe(6);
    expect(b.cells[1]?.tier).toBe(6);
  });

  it('respects board bounds and null drops', () => {
    const b = new BoardModel();
    expect(b.drop(-1, 0).kind).toBe('none');
    expect(b.drop(0, 999).kind).toBe('none');
    expect(b.drop(0, 1).kind).toBe('none'); // empty source
  });

  it('spawns seeds into empty cells only', () => {
    const b = new BoardModel();
    const rng = new Rng(42);
    const res = b.spawnSeed(rng);
    expect(res).not.toBeNull();
    expect(res!.item.tier).toBe(1);
    const occupied = b.firstEmpty();
    for (let i = 0; i < 63; i++) if (b.cells[i] === null) b.cells[i] = makeItem('moon', 1);
    expect(b.spawnSeed(rng)).toBeNull();
    void occupied;
  });

  it('preserves gold variant over silver on merge', () => {
    const b = new BoardModel();
    b.cells[0] = makeItem('moon', 1, 'silver');
    b.cells[1] = makeItem('moon', 1, 'gold');
    const out = b.drop(0, 1);
    if (out.kind === 'merge') expect(out.variant).toBe('gold');
    else expect.fail('expected merge');
  });
});
