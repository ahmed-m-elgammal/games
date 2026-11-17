import { describe, expect, it } from "vitest";
import { cyrb128, sfc32, rngFrom, dailySeed, hashOf, stableStringify, deepEqual, pick } from "../src/model/rng";

describe("cyrb128 → sfc32 (spec §5)", () => {
  it("hashes are deterministic and order-sensitive", () => {
    const a = cyrb128("customs-v1:2026-11-17");
    const b = cyrb128("customs-v1:2026-11-17");
    const c = cyrb128("customs-v1:2026-11-18");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.every(n => Number.isInteger(n) && n >= 0)).toBe(true);
  });

  it("sfc32 streams are reproducible and bounded", () => {
    const [a, b, c, d] = cyrb128("vector");
    const r1 = sfc32(a, b, c, d);
    const seq1 = Array.from({ length: 64 }, () => r1());
    const r2 = sfc32(...cyrb128("vector"));
    const seq2 = Array.from({ length: 64 }, () => r2());
    expect(seq1).toEqual(seq2);
    for (const v of seq1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("one stream per concern never shifts another", () => {
    const ships = rngFrom("seed-x", "ships");
    const forgery = rngFrom("seed-x", "forgery");
    ships(); ships(); ships();
    expect(ships()).not.toEqual(forgery());
    expect(rngFrom("seed-x", "ships")()).toEqual(rngFrom("seed-x", "ships")());
  });

  it("daily seeds are date-derived strings", () => {
    expect(dailySeed("2026-11-17")).toBe("customs-v1:2026-11-17");
  });
});

describe("hashing & equality", () => {
  it("stable stringify ignores key order", () => {
    expect(stableStringify({ a: 1, b: [2, { c: 3 }] })).toBe(stableStringify({ b: [2, { c: 3 }], a: 1 }));
    expect(hashOf({ a: 1, b: 2 })).toBe(hashOf({ b: 2, a: 1 }));
  });

  it("deepEqual handles nested plain data", () => {
    expect(deepEqual({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(1, "1")).toBe(false);
  });

  it("pick stays within bounds", () => {
    const r = rngFrom("bounds", "t");
    const items = ["x", "y", "z"] as const;
    for (let i = 0; i < 200; i++) expect(items).toContain(pick(r, items));
  });
});
