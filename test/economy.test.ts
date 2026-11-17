import { describe, expect, it } from "vitest";
import { createWorld, step } from "../src/model/world";
import { newCareer } from "../src/model/career";
import { feeOf } from "../src/model/content";
import type { Career, World } from "../src/model/schema";
import type { Verdict } from "../src/model/schema";

function markArrived(w: World): World {
  const next: World = structuredClone(w);
  for (const s of next.ships) s.arrived = true;
  return next;
}

function verdictAll(w: World, choice: (forged: boolean, index: number) => Verdict): World {
  let out = markArrived(w);
  const interactions = out.ships.map((s, i) => ({
    kind: "verdict" as const,
    shipId: s.id,
    verdict: choice(s.forgery !== null, i)
  }));
  out = step(out, interactions);
  return out;
}

describe("economy & verdicts (spec §2.5)", () => {
  it("approving honest ships pays the cargo fee", () => {
    let w = createWorld("econ-honest", newCareer());
    const honest = w.ships.filter(s => s.forgery === null).length;
    expect(honest).toBeGreaterThanOrEqual(1);
    w = verdictAll(w, forged => (forged ? "deny" : "approve"));
    const resolved = w.ships.length;
    const expected =
      w.ships.reduce((a, s) => a + feeOf(s.params.crates.length) * (s.forgery !== null ? 2 : 1), 0) +
      50 * resolved; // clean-shift bonus, strikes === 0
    expect(w.feesCents).toBe(expected);
    expect(w.strikes).toBe(0);
  });

  it("denying an honest ship costs a strike and Guild goodwill", () => {
    let w = createWorld("econ-strike", newCareer());
    const firstHonest = w.ships.findIndex(s => s.forgery === null);
    expect(firstHonest).toBeGreaterThanOrEqual(0);
    const before = w.career.factions.guild;
    w = verdictAll(w, () => "deny");
    expect(w.strikes).toBeGreaterThanOrEqual(1);
    expect(w.career.factions.guild).toBeLessThan(before);
  });

  it("denying a forged ship pays fee ×2 and the Crown notices", () => {
    let w = createWorld("econ-forged", newCareer());
    const forgedCount = w.ships.filter(s => s.forgery !== null).length;
    expect(forgedCount).toBeGreaterThanOrEqual(1);
    const before = w.career.factions.crown;
    w = verdictAll(w, forged => (forged ? "deny" : "approve"));
    const expectedForged = w.ships
      .filter(s => s.forgery !== null)
      .reduce((a, s) => a + feeOf(s.params.crates.length) * 2, 0);
    expect(w.feesCents).toBeGreaterThanOrEqual(expectedForged - 40); // honest approvals add on top
    expect(w.career.factions.crown).toBeGreaterThan(before);
  });

  it("fining a forged ship pays fee ×3 only when the rule allows fines", () => {
    let w = createWorld("econ-fine", newCareer());
    const sealForged = w.ships.find(
      s => s.forgery !== null && s.forgery.ruleId.startsWith("seal.")
    );
    if (sealForged) {
      // seal rules forbid fines — fining them must cost a strike
      w = markArrived(w);
      w = step(w, [{ kind: "verdict", shipId: sealForged.id, verdict: "fine" }]);
      const ship = w.ships.find(s => s.id === sealForged.id)!;
      expect(ship.result!.correct).toBe(false);
      expect(w.strikes).toBe(1);
    } else {
      // trade/count rules allow fines
      const tradeForged = w.ships.find(
        s => s.forgery !== null && ["crate.trade.manifest", "crate.count.manifest"].includes(s.forgery.ruleId)
      );
      if (tradeForged) {
        w = markArrived(w);
        w = step(w, [{ kind: "verdict", shipId: tradeForged.id, verdict: "fine" }]);
        const ship = w.ships.find(s => s.id === tradeForged.id)!;
        expect(ship.result!.correct).toBe(true);
        expect(ship.result!.feeCents).toBe(feeOf(ship.params.crates.length) * 3);
      }
    }
  });

  it("Hold & Search on an honest captain costs 45s and Guild −2", () => {
    let w = createWorld("econ-search", newCareer());
    const honest = w.ships.find(s => s.forgery === null)!;
    w = markArrived(w);
    const before = w.career.factions.guild;
    const tickBefore = w.tick;
    w = step(w, [{ kind: "verdict", shipId: honest.id, verdict: "search" }]);
    expect(w.tick - tickBefore).toBe(901); // 1 tick + 900 penalty ticks
    expect(w.career.factions.guild).toBe(before - 2);
    expect(w.ships.find(s => s.id === honest.id)!.searched).toBe(true);
  });

  it("three strikes lose the shift and forfeit fees — but the career continues", () => {
    let w = createWorld("econ-loss", newCareer());
    w = markArrived(w);
    // deny the first three ships; at least the honest ones strike back.
    const honestIds = w.ships.filter(s => s.forgery === null).slice(0, 3).map(s => s.id);
    for (const id of honestIds.slice(0, 3)) {
      w = step(w, [{ kind: "verdict", shipId: id, verdict: "deny" }]);
    }
    if (w.strikes < 3) {
      const forged = w.ships.filter(s => s.forgery !== null).slice(0, 3 - w.strikes);
      for (const s of forged) w = step(w, [{ kind: "verdict", shipId: s.id, verdict: "approve" }]);
    }
    expect(w.strikes).toBe(3);
    expect(w.status).toBe("lost");
    expect(w.forfeited).toBe(true);
    expect(w.feesCents).toBe(0);
    expect(w.career.shiftsCompleted).toBe(1);
    expect(w.career.feesTotalCents).toBe(0);
  });

  it("a clean shift wins with the 50¢ × ships bonus", () => {
    let w = createWorld("econ-clean", newCareer());
    w = verdictAll(w, forged => (forged ? "deny" : "approve"));
    expect(w.status).toBe("won");
    expect(w.strikes).toBe(0);
    const resolved = w.ships.filter(s => s.resolvedAt !== null).length;
    const expected =
      w.ships.reduce((a, s) => a + feeOf(s.params.crates.length) * (s.forgery !== null ? 2 : 1), 0) +
      50 * resolved;
    expect(w.feesCents).toBe(expected);
    const career: Career = w.career;
    expect(career.feesTotalCents).toBe(w.feesCents);
    expect(career.shiftsCompleted).toBe(1);
  });

  it("a missed forgery feeds the adaptive smuggler's histogram", () => {
    let w = createWorld("econ-adaptive", newCareer());
    const forged = w.ships.find(s => s.forgery !== null)!;
    w = markArrived(w);
    w = step(w, [{ kind: "verdict", shipId: forged.id, verdict: "deny" }]);
    const ruleId = forged.forgery!.ruleId;
    expect(w.career.missHistogram[ruleId]).toBeGreaterThanOrEqual(1);
  });
});
