// ─────────────────────────────────────────────────────────────────────────────
// MODEL / rules — the declarative DSL evaluator (spec §10). A pure function
// shared by the generator, the simulation, and (later) the editor validator
// and server re-sim. Adding content = adding JSON, never code.
// ─────────────────────────────────────────────────────────────────────────────

import { RULES } from "./content";
import { resolvePath } from "./path";
import { deepEqual } from "./rng";
import type { Crate, Evidence, RevealKind, Ship, ToolId } from "./schema";
import type { RuleDef } from "./content";

export interface EvalCtx {
  tools: ToolId[];
  searched: boolean;
  reagent: boolean;
  lamp: boolean;
}

const SHIP_ROOT = /^(params|manifest|registry|arrivedAt)\b/;

function whenMatches(rule: RuleDef, ship: Ship, elem: Crate | null): boolean {
  for (const [key, want] of Object.entries(rule.when)) {
    const have = elem && !SHIP_ROOT.test(key) ? (elem as unknown as Record<string, unknown>)[key] : resolvePath(ship, key);
    if (!deepEqual(have, want)) return false;
  }
  return true;
}

function subjectOf(rule: RuleDef, ship: Ship, i: number): unknown {
  const path = rule.each === "crates" ? rule.check.part.replace("[i]", `[${i}]`) : rule.check.part;
  return resolvePath(ship, path);
}

function refOf(ref: string, ship: Ship, i: number): unknown {
  const path = i >= 0 ? ref.replace("[i]", `[${i}]`) : ref;
  // element-relative refs (e.g. "trade") only make sense on each-crates rules
  if (i >= 0 && !SHIP_ROOT.test(path)) {
    return (ship.params.crates[i] as unknown as Record<string, unknown>)[path];
  }
  return resolvePath(ship, path);
}

export function evaluate(rule: RuleDef, ship: Ship, ctx: EvalCtx): Evidence | null {
  if (rule.requires.tool && !ctx.tools.includes(rule.requires.tool)) return null;
  if (!revealSatisfied(rule.requires.reveal, ctx)) return null;

  const indexes = rule.each === "crates" ? ship.params.crates.map((_, i) => i) : [-1];
  for (const i of indexes) {
    const elem = i >= 0 ? ship.params.crates[i] : null;
    if (!whenMatches(rule, ship, elem)) continue;
    const subject = subjectOf(rule, ship, i);
    let violated = false;
    if (rule.check.forbid !== undefined) {
      violated = (rule.check.forbid as unknown[]).some(v => deepEqual(subject, v));
    } else if (rule.check.within !== undefined) {
      const win = refOf(rule.check.within, ship, i) as [number, number];
      violated = !(typeof subject === "number" && Array.isArray(win) && subject >= win[0] && subject <= win[1]);
    } else if (rule.check.expectRef !== undefined) {
      violated = !deepEqual(subject, refOf(rule.check.expectRef, ship, i));
    } else {
      violated = !deepEqual(subject, rule.check.expect);
    }
    if (violated) {
      return {
        ruleId: rule.id,
        channel: rule.channel,
        part: rule.part,
        index: i >= 0 ? i : null,
        minScreenPx: rule.screen?.minPx ?? 0
      };
    }
  }
  return null;
}

function revealSatisfied(reveal: RevealKind | null, ctx: EvalCtx): boolean {
  if (reveal === null) return true;
  if (reveal === "search") return ctx.searched;
  if (reveal === "reagent") return ctx.reagent;
  if (reveal === "lamp") return ctx.lamp;
  return true;
}

export function evaluateAll(ship: Ship, rules: RuleDef[], ctx: EvalCtx): Evidence[] {
  const out: Evidence[] = [];
  for (const rule of rules) {
    const ev = evaluate(rule, ship, ctx);
    if (ev) out.push(ev);
  }
  return out;
}

/** Rulebook visible at the desk: unlocked chapters only. */
export const rulesForChapters = (chapters: number): RuleDef[] =>
  RULES.filter(r => r.chapter <= chapters);

const VISUAL_CHANNELS = new Set(["weight", "trade", "geometry"]);

/**
 * Generator gate (spec §9.2): an injected lie must be the ONLY observable
 * violation, observable with the player's current rulebook + tools, and
 * visual clues must clear the 2.5px screen-space floor.
 */
export function assertSolvable(ship: Ship, tools: ToolId[], chapters: number): void {
  const ctx: EvalCtx = {
    tools,
    searched: true, // assume the player will search when the rulebook says so
    reagent: tools.includes("reagent"),
    lamp: tools.includes("lamp")
  };
  const fired = evaluateAll(ship, RULES, ctx);
  if (ship.forgery === null) {
    if (fired.length !== 0) {
      throw new Error(`honest ship ${ship.id} violates [${fired.map(f => f.ruleId).join(", ")}]`);
    }
    return;
  }
  if (fired.length !== 1 || fired[0].ruleId !== ship.forgery.ruleId) {
    throw new Error(
      `ambiguous or invisible forgery on ${ship.id}: fired=[${fired.map(f => f.ruleId).join(", ")}] ` +
      `expected=${ship.forgery.ruleId}`
    );
  }
  if (VISUAL_CHANNELS.has(ship.forgery.channel) && fired[0].minScreenPx < 2.5) {
    throw new Error(`clue below screen-space floor on ${ship.id} (${fired[0].minScreenPx}px)`);
  }
}

/** Does this rule's `when` clause apply to this (still lawful) ship? */
export function ruleApplicable(rule: RuleDef, ship: Ship): boolean {
  const ctx: EvalCtx = { tools: [], searched: true, reagent: true, lamp: true };
  if (rule.each !== "crates") return whenMatches(rule, ship, null);
  return ship.params.crates.some(c => whenMatches(rule, ship, c));
}
