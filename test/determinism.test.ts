import { describe, expect, it } from "vitest";
import { createWorld, step, worldHash, currentShip } from "../src/model/world";
import { newCareer } from "../src/model/career";
import { rngFrom, pick, randInt } from "../src/model/rng";
import type { Interaction } from "../src/model/interactions";
import type { PartId, ToolId, Verdict } from "../src/model/schema";

const PARTS: PartId[] = ["seal", "crate", "hull", "masts", "bow", "flag", "tide"];
const VERDICTS: Verdict[] = ["approve", "deny", "fine", "search"];
const TOOLS: ToolId[] = ["magnifier", "scale", "reagent", "lamp"];

/** Deterministic interaction script — the same in every run. */
function script(seed: string, ticks: number): Map<number, Interaction[]> {
  const r = rngFrom(seed, "script");
  const byTick = new Map<number, Interaction[]>();
  const add = (tick: number, it: Interaction) => {
    const list = byTick.get(tick) ?? [];
    list.push(it);
    byTick.set(tick, list);
  };
  for (let t = 40; t < ticks; t += 137) {
    const roll = randInt(r, 10);
    if (roll < 4) add(t, { kind: "pinEvidence", shipId: "s1", partId: pick(r, PARTS) });
    else if (roll < 6) add(t, { kind: "tool", shipId: "s1", tool: pick(r, TOOLS) });
    else add(t, { kind: "verdict", shipId: "s1", verdict: pick(r, VERDICTS) });
  }
  return byTick;
}

describe("determinism & replay (spec §5)", () => {
  it("the same seed + same interaction script → identical world hash", () => {
    const ticks = 3000;
    const scriptMap = script("replay-seed-7", ticks);
    const run = (): string => {
      let w = createWorld("replay-seed-7", newCareer());
      for (let t = 0; t < ticks; t++) {
        w = step(w, scriptMap.get(t) ?? []);
      }
      return worldHash(w);
    };
    expect(run()).toBe(run());
  });

  it("an empty queue still advances the world deterministically", () => {
    let a = createWorld("quiet-seed", newCareer());
    let b = createWorld("quiet-seed", newCareer());
    for (let t = 0; t < 1200; t++) {
      a = step(a, []);
      b = step(b, []);
    }
    expect(worldHash(a)).toBe(worldHash(b));
    expect(a.tick).toBe(1200);
  });

  it("different seeds draw different worlds", () => {
    let a = createWorld("seed-alpha", newCareer());
    let b = createWorld("seed-beta", newCareer());
    for (let t = 0; t < 600; t++) {
      a = step(a, []);
      b = step(b, []);
    }
    expect(worldHash(a)).not.toBe(worldHash(b));
  });

  it("ships arrive on schedule (the bell rings)", () => {
    let w = createWorld("arrival-seed", newCareer());
    const firstArrival = Math.min(...w.ships.map(s => s.arrivedAt));
    for (let t = 0; t <= firstArrival; t++) w = step(w, []);
    expect(currentShip(w)).not.toBeNull();
  });
});
