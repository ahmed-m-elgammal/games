// ─────────────────────────────────────────────────────────────────────────────
// MODEL / world — the simulation. One edit queue consumed at fixed 20 Hz ticks
// (spec §4). Pure reducer: step(world, interactions) → new world. The same
// function serves browser play and headless re-sim, which is what makes
// replays, share-links and server anti-cheat trivially correct.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG, HULL_MAP, RULE_MAP, feeOf } from "./content";
import type { PartId, Tier, ToolId } from "./schema";
import { rankOf, toolsForRank, chaptersFor } from "./career";
import type { Interaction } from "./interactions";
import { planShift } from "./gen";
import { evaluateAll, rulesForChapters } from "./rules";
import { hashOf } from "./rng";
import type { Career, FactionId, LogEntry, Ship, Verdict, World } from "./schema";

function pushLog(w: World, text: string, tone: LogEntry["tone"]): void {
  w.log.push({ tick: w.tick, text, tone });
  if (w.log.length > 30) w.log.splice(0, w.log.length - 30);
}

function bumpFaction(w: World, f: FactionId, delta: number): void {
  const next = Math.max(-100, Math.min(100, w.career.factions[f] + delta));
  w.career.factions[f] = next;
}

export function createWorld(seed: string, career: Career): World {
  const rank = rankOf(career);
  const chapters = chaptersFor(career);
  const tools = toolsForRank(rank);
  // Daily shifts are identical worldwide (spec §2.9): a fixed baseline plan,
  // no adaptive smuggler (spec §9.5 — daily never uses the miss histogram).
  const isDaily = seed.startsWith("customs-v1:");
  const planCareer: Career = isDaily ? { ...career, missHistogram: {} } : career;
  const planRankDef = isDaily ? { ...CONFIG.ranks[0], forgedTiers: [1, 1] as Tier[] } : CONFIG.ranks[rank];
  const planChapters = isDaily ? 2 : chapters;
  const planTools: ToolId[] = isDaily ? ["magnifier"] : tools;
  const ships = planShift({ seed, career: planCareer, rankDef: planRankDef, chapters: planChapters, tools: planTools });
  return {
    version: 1,
    seed,
    tick: 0,
    shiftTicks: CONFIG.shiftTicks,
    ships,
    feesCents: 0,
    strikes: 0,
    feeMul: 1,
    career: structuredClone(career),
    rank,
    chapters: isDaily ? planChapters : chapters,
    tools,
    status: "running",
    log: [{ tick: 0, text: "The bell tolls. A new shift begins at the Inkline quay.", tone: "info" }],
    firedEvents: [],
    forfeited: false
  };
}

export const currentShip = (w: World): Ship | null =>
  w.ships.find(s => s.arrived && s.resolvedAt === null) ?? null;

export function worldHash(w: World): string {
  return hashOf({
    tick: w.tick,
    feesCents: w.feesCents,
    strikes: w.strikes,
    status: w.status,
    factions: w.career.factions,
    ships: w.ships.map(s => ({
      id: s.id,
      arrived: s.arrived,
      verdict: s.verdict,
      resolvedAt: s.resolvedAt,
      searched: s.searched,
      reagent: s.reagent,
      lamp: s.lamp,
      pins: s.pins,
      result: s.result,
      params: s.params
    }))
  });
}

// ── step ─────────────────────────────────────────────────────────────────────

export function step(world: World, interactions: readonly Interaction[]): World {
  const w: World = structuredClone(world);
  w.tick++;

  // arrivals
  for (const s of w.ships) {
    if (!s.arrived && s.arrivedAt <= w.tick) {
      s.arrived = true;
      pushLog(w, `${s.captain}'s ${HULL_MAP.get(s.params.hull)!.name} docks at the quay.`, "info");
    }
  }

  for (const it of interactions) applyInteraction(w, it);

  if (w.status === "running") {
    if (w.strikes >= CONFIG.strikeMax) endShift(w, "lost");
    else if (w.ships.every(s => s.resolvedAt !== null)) endShift(w, "won");
    else if (w.tick >= w.shiftTicks) endShift(w, "won");
  }
  return w;
}

function applyInteraction(w: World, it: Interaction): void {
  if (it.kind === "verdict") {
    const ship = w.ships.find(s => s.id === it.shipId);
    if (ship && ship.arrived && ship.resolvedAt === null) applyVerdict(w, ship, it.verdict);
  } else if (it.kind === "pinEvidence") {
    const ship = w.ships.find(s => s.id === it.shipId);
    if (ship && ship.arrived && ship.resolvedAt === null) applyPin(w, ship, it.partId, it.index ?? null);
  } else if (it.kind === "tool") {
    const ship = w.ships.find(s => s.id === it.shipId);
    if (ship && ship.arrived && ship.resolvedAt === null) applyTool(w, ship, it.tool);
  }
}

// ── economy: verdict resolution (spec §2.5) ──────────────────────────────────

function applyVerdict(w: World, ship: Ship, verdict: Verdict): void {
  if (verdict === "search") {
    if (ship.searched) return;
    ship.searched = true;
    w.tick += CONFIG.searchCostTicks; // 45s of shift time
    for (const s of w.ships) {
      if (!s.arrived && s.arrivedAt <= w.tick) {
        s.arrived = true;
        pushLog(w, `${s.captain}'s ${HULL_MAP.get(s.params.hull)!.name} docks at the quay.`, "info");
      }
    }
    if (ship.forgery === null) {
      bumpFaction(w, "guild", -2);
      pushLog(w, `Tarps lifted on an honest hold. ${ship.captain} seethes. (Guild −2)`, "bad");
    } else {
      pushLog(w, "Tarps lifted. The hold lies open for inspection.", "info");
    }
    return;
  }

  const fired = evaluateAll(ship, rulesForChapters(w.chapters), {
    tools: w.tools,
    searched: ship.searched,
    reagent: ship.reagent,
    lamp: ship.lamp
  });
  // discovery = the player actually put their finger on the lie: a correct
  // pin. Firing rules alone would credit every correct stamp as "seen".
  const discovered = ship.forgery !== null && ship.pins.some(p => p.correct);
  const base = feeOf(ship.params.crates.length);

  let correct: boolean;
  let gained = 0;
  let ruleId: string | null = null;

  if (ship.forgery === null) {
    correct = verdict === "approve";
    if (correct) {
      gained = Math.round(base * w.feeMul);
      w.feesCents += gained;
      ship.feeCents = gained;
      pushLog(w, `Honest ship approved. +${gained}¢. ${ship.captain} tips their hat.`, "good");
    } else {
      w.strikes++;
      bumpFaction(w, "guild", verdict === "deny" ? -3 : -4);
      pushLog(
        w,
        verdict === "deny"
          ? `Strike — you denied an honest ship. The Guild is furious. (Guild −3)`
          : `Strike — you fined an honest ship. The Guild will remember this. (Guild −4)`,
        "bad"
      );
    }
  } else {
    const rule = RULE_MAP.get(ship.forgery.ruleId)!;
    ruleId = rule.id;
    const fineAllowed = rule.verdicts.fine;
    correct = verdict === "deny" || (verdict === "fine" && fineAllowed);
    if (correct) {
      const mult = verdict === "fine" ? 3 : 2;
      gained = Math.round(base * mult * w.feeMul);
      w.feesCents += gained;
      const pins = uniqueCorrectPins(ship);
      const pinBonus = pins * CONFIG.pinBonusCents;
      gained += pinBonus;
      w.feesCents += pinBonus;
      ship.feeCents = gained;
      bumpFaction(w, "crown", verdict === "fine" ? 1 : 2);
      bumpFaction(w, "smugglers", -1);
      if (discovered) {
        pushLog(w, `Caught. §${rule.chapter}.${rule.tier} — ${rule.statement} (+${gained}¢)`, "good");
      } else {
        pushLog(w, `Correct stamp — the lie was there, though you never looked. +${gained}¢`, "good");
        w.career.missHistogram[rule.id] = (w.career.missHistogram[rule.id] ?? 0) + 1;
      }
    } else {
      w.strikes++;
      if (verdict === "approve") {
        bumpFaction(w, "smugglers", 3);
        bumpFaction(w, "crown", -2);
        pushLog(w, "Strike — you stamped a forgery APPROVED. The port watches. (Smugglers +3, Crown −2)", "bad");
      } else if (verdict === "fine" && !fineAllowed) {
        bumpFaction(w, "guild", -1);
        pushLog(w, "Strike — the rulebook allows no fine for that lie. The Guild objects.", "bad");
      } else {
        pushLog(w, "Strike — the forgery slipped past your stamp.", "bad");
      }
      w.career.missHistogram[rule.id] = (w.career.missHistogram[rule.id] ?? 0) + 1;
    }
  }

  ship.verdict = verdict;
  ship.resolvedAt = w.tick;
  ship.result = { verdict, correct, feeCents: gained, discovered, ruleId };
  checkEvents(w);
}

function uniqueCorrectPins(ship: Ship): number {
  const seen = new Set<string>();
  for (const p of ship.pins) if (p.correct) seen.add(`${p.partId}:${p.index}`);
  return seen.size;
}

function applyPin(w: World, ship: Ship, partId: PartId, index: number | null): void {
  const key = `${partId}:${index}`;
  if (ship.pins.some(p => `${p.partId}:${p.index}` === key)) return;
  const correct =
    ship.forgery !== null &&
    ship.forgery.part === partId &&
    (partId !== "crate" || ship.forgery.index === index);
  ship.pins.push({ partId, index, atTick: w.tick, correct });
  if (correct) pushLog(w, "Red ink: that is the lie, pinned to the manifest.", "good");
  else pushLog(w, "Pinned. You find nothing but honest ink there.", "info");
}

function applyTool(w: World, ship: Ship, tool: "reagent" | "lamp" | "scale" | "magnifier"): void {
  if (tool === "reagent" && !ship.reagent) {
    ship.reagent = true;
    pushLog(w, "The Ink Reagent bites into the manifest page.", "info");
  } else if (tool === "lamp" && !ship.lamp) {
    ship.lamp = true;
    pushLog(w, "The Lamp sweeps its beam across the hull lines.", "info");
  }
}

// ── events: the port reacts to standing (spec §2.6) ──────────────────────────

function checkEvents(w: World): void {
  for (const ev of CONFIG.events) {
    if (w.firedEvents.includes(ev.id)) continue;
    const v = w.career.factions[ev.faction];
    const hit = ev.below !== undefined ? v <= ev.below : v >= (ev.above ?? 100);
    if (!hit) continue;
    w.firedEvents.push(ev.id);
    w.feeMul *= ev.feeMul;
    pushLog(w, ev.text, ev.feeMul > 1 ? "good" : ev.feeMul < 1 ? "bad" : "info");
  }
}

// ── shift end ────────────────────────────────────────────────────────────────

function endShift(w: World, kind: "won" | "lost"): void {
  w.status = kind;
  const resolved = w.ships.filter(s => s.resolvedAt !== null).length;
  if (kind === "lost") {
    w.forfeited = true;
    w.feesCents = 0;
    pushLog(w, "Three strikes. The shift is lost — fees forfeit. The port remembers.", "bad");
  } else {
    if (w.strikes === 0 && resolved > 0) {
      const bonus = CONFIG.cleanBonusPerShipCents * resolved;
      w.feesCents += bonus;
      pushLog(w, `Clean shift bonus: +${bonus}¢ (50¢ × ${resolved} ships).`, "good");
    }
    pushLog(w, "The shift ends. Your ledger is inked and filed.", "info");
  }
  w.career.shiftsCompleted++;
  if (!w.forfeited) w.career.feesTotalCents += w.feesCents;
}


