import { describe, expect, it } from "vitest";
import { candidateRules, forge, genShip, pickForgeryRule, planShift } from "../src/model/gen";
import { assertSolvable } from "../src/model/rules";
import { rngFrom } from "../src/model/rng";
import { newCareer } from "../src/model/career";
import { CONFIG } from "../src/model/content";
import type { Tier, ToolId } from "../src/model/schema";

const ALL_TOOLS: ToolId[] = ["magnifier", "scale", "reagent", "lamp"];

/**
 * Property sweep (spec §9.2 + §18): 10,000 generated ships per tier.
 * A case that cannot be solved never ships.
 */
describe("generator solvability — 10k ships per tier", () => {
  for (const tier of [1, 2, 3] as Tier[]) {
    it(`tier ${tier}: honest ships violate nothing, forged ships violate exactly their own rule`, () => {
      const r = rngFrom(`sweep-v1-tier-${tier}`, "sweep");
      const misses = {};
      for (let i = 0; i < 10_000; i++) {
        const seed = `sweep-${tier}-${i}`;
        const ship = genShip(seed, i, 6, r, 300 + i * 7);
        expect(() => assertSolvable(ship, ALL_TOOLS, 6)).not.toThrow();

        const candidates = candidateRules(tier, 6, ALL_TOOLS, ship);
        if (candidates.length === 0) continue;
        const rule = pickForgeryRule(candidates, misses, r);
        let forged: ReturnType<typeof forge>;
        try {
          forged = forge(ship, rule, r); // may legitimately decline (e.g. all crates tarped)
        } catch {
          continue;
        }
        try {
          assertSolvable(forged, ALL_TOOLS, 6);
        } catch (err) {
          throw new Error(`seed=${seed} rule=${rule.id}: ${(err as Error).message}`);
        }
        expect(forged.forgery).not.toBeNull();
        expect(forged.forgery!.ruleId).toBe(rule.id);
        expect(forged.manifest.crates.length).toBe(ship.params.crates.length);
      }
    }, 240_000);
  }

  it("unlocked chapters constrain which rules can be forged (escalation, §2.4)", () => {
    const r = rngFrom("chapter-gate", "t");
    for (let i = 0; i < 400; i++) {
      const ship = genShip(`gate-${i}`, 0, 2, r, 500);
      const candidates = candidateRules(1, 2, ["magnifier"], ship);
      for (const rule of candidates) {
        expect(rule.chapter).toBeLessThanOrEqual(2);
        expect(rule.requires.tool).toBeNull();
      }
    }
  });
});

describe("shift plan (spec §9.3)", () => {
  it("rank 0 plans six ships with at most two forgeries, arrivals spread across the shift", () => {
    const r = rngFrom("plan-rank0", "plan");
    const ships = planShift({
      seed: "plan-seed-1",
      career: newCareer(),
      rankDef: CONFIG.ranks[0],
      chapters: 1,
      tools: ["magnifier"]
    });
    expect(ships.length).toBe(6);
    const forged = ships.filter(s => s.forgery !== null);
    expect(forged.length).toBe(2);
    for (const s of ships) {
      expect(s.arrivedAt).toBeLessThan(CONFIG.shiftTicks);
      expect(() => assertSolvable(s, ["magnifier"], 1)).not.toThrow();
    }
    expect(r()).toBeTypeOf("number");
  });

  it("the same seed draws the same shift bit-for-bit", () => {
    const a = planShift({ seed: "identical", career: newCareer(), rankDef: CONFIG.ranks[0], chapters: 1, tools: ["magnifier"] });
    const b = planShift({ seed: "identical", career: newCareer(), rankDef: CONFIG.ranks[0], chapters: 1, tools: ["magnifier"] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("a different seed draws a different shift", () => {
    const a = planShift({ seed: "one", career: newCareer(), rankDef: CONFIG.ranks[0], chapters: 1, tools: ["magnifier"] });
    const b = planShift({ seed: "two", career: newCareer(), rankDef: CONFIG.ranks[0], chapters: 1, tools: ["magnifier"] });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
