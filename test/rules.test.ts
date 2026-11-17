import { describe, expect, it } from "vitest";
import { genShip, forge } from "../src/model/gen";
import { assertSolvable, evaluate, evaluateAll, rulesForChapters, ruleApplicable } from "../src/model/rules";
import { RULES, RULE_MAP } from "../src/model/content";
import { rngFrom } from "../src/model/rng";
import type { Ship, ToolId } from "../src/model/schema";

const ALL_TOOLS: ToolId[] = ["magnifier", "scale", "reagent", "lamp"];
const ctx = { tools: ALL_TOOLS, searched: true, reagent: true, lamp: true };

function makeShip(seed: string, chapters = 6): Ship {
  const r = rngFrom(seed, "test-ships");
  return genShip(seed, 0, chapters, r, 1200);
}

describe("rules DSL evaluator (spec §10)", () => {
  it("seal.crown.weight fires only on light-hand crown seals", () => {
    const rule = RULE_MAP.get("seal.crown.weight")!;
    const ship = makeShip("seal-case");
    ship.params.seal = { authority: "crown", weight: 2, ink: "true" };
    expect(evaluate(rule, ship, ctx)).toBeNull();
    ship.params.seal = { authority: "crown", weight: 1, ink: "true" };
    const ev = evaluate(rule, ship, ctx);
    expect(ev).not.toBeNull();
    expect(ev!.part).toBe("seal");
    expect(ev!.channel).toBe("weight");
  });

  it("when-clauses gate on authority", () => {
    const rule = RULE_MAP.get("seal.crown.weight")!;
    const ship = makeShip("when-case");
    ship.params.seal = { authority: "guild", weight: 1, ink: "true" };
    expect(evaluate(rule, ship, ctx)).toBeNull();
  });

  it("each-crates trade rule reports the violating index", () => {
    const rule = RULE_MAP.get("crate.trade.manifest")!;
    const ship = makeShip("crates-case");
    ship.params.crates[2].trade = "ore";
    ship.manifest.crates[2].trade = "grain";
    const ev = evaluate(rule, ship, ctx);
    expect(ev).not.toBeNull();
    expect(ev!.index).toBe(2);
    expect(ev!.part).toBe("crate");
  });

  it("tide window uses the within check against the manifest", () => {
    const rule = RULE_MAP.get("tide.window")!;
    const ship = makeShip("tide-case");
    ship.manifest.tideWindow = [1000, 1900];
    ship.arrivedAt = 1450;
    expect(evaluate(rule, ship, ctx)).toBeNull();
    ship.arrivedAt = 1950;
    expect(evaluate(rule, ship, ctx)).not.toBeNull();
  });

  it("forbid fires on embargoed flags only", () => {
    const rule = RULE_MAP.get("flag.embargo")!;
    const ship = makeShip("flag-case");
    expect(evaluate(rule, ship, ctx)).toBeNull();
    ship.params.flag = "redwater";
    expect(evaluate(rule, ship, ctx)).not.toBeNull();
  });

  it("tool gates hide the brass-scale rule without the scale", () => {
    const rule = RULE_MAP.get("crate.mass.scale")!;
    const ship = makeShip("scale-case");
    ship.params.crates[0].massKg = ship.manifest.crates[0].massKg + 500;
    const noTool = { ...ctx, tools: ["magnifier" as ToolId] };
    expect(evaluate(rule, ship, noTool)).toBeNull();
    expect(evaluate(rule, ship, ctx)).not.toBeNull();
  });

  it("hidden rules need the hold searched (spec §2.3)", () => {
    const rule = RULE_MAP.get("crate.hidden.search")!;
    const ship = makeShip("hidden-case");
    ship.params.crates[1].hiddenTrade = "contraband";
    const unsearched = { ...ctx, searched: false };
    expect(evaluate(rule, ship, unsearched)).toBeNull();
    expect(evaluate(rule, ship, ctx)).not.toBeNull();
  });

  it("evaluateAll finds exactly one violation on a clean forgery", () => {
    const ship = makeShip("forge-case");
    const rule = RULE_MAP.get("seal.crown.weight")!;
    ship.params.seal = { authority: "crown", weight: 2, ink: "true" };
    const forged = forge(ship, rule, rngFrom("forge-case", "f"));
    const fired = evaluateAll(forged, rulesForChapters(6), ctx);
    expect(fired.length).toBe(1);
    expect(fired[0].ruleId).toBe("seal.crown.weight");
  });

  it("assertSolvable throws on an ambiguous hand-broken ship", () => {
    const ship = makeShip("ambiguous-case");
    ship.forgery = {
      ruleId: "seal.crown.weight",
      channel: "weight",
      path: "params.seal.weight",
      part: "seal",
      lawful: 2,
      drawn: 1,
      index: null
    };
    ship.params.seal = { authority: "crown", weight: 1, ink: "true" }; // rule 1
    ship.params.flag = "redwater"; // rule 2 — two lies at once
    expect(() => assertSolvable(ship, ALL_TOOLS, 6)).toThrow(/ambiguous or invisible/);
  });

  it("assertSolvable passes honest ships", () => {
    const ship = makeShip("honest-case");
    expect(() => assertSolvable(ship, ALL_TOOLS, 6)).not.toThrow();
  });

  it("ruleApplicable matches seal rules to authority", () => {
    const ship = makeShip("applicable-case");
    ship.params.seal = { authority: "church", weight: 2, ink: "true" };
    expect(ruleApplicable(RULE_MAP.get("seal.church.weight")!, ship)).toBe(true);
    expect(ruleApplicable(RULE_MAP.get("seal.crown.weight")!, ship)).toBe(false);
  });

  it("the rulebook ships exactly 15 declarative rules across 6 chapters", () => {
    expect(RULES.length).toBe(15);
    expect(new Set(RULES.map(r => r.chapter)).size).toBe(6);
    for (const r of RULES) {
      expect(r.statement.length).toBeGreaterThan(10);
      expect(["weight", "trade", "geometry", "document", "hidden", "systemic"]).toContain(r.channel);
    }
  });
});
