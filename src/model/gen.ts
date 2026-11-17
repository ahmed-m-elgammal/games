// ─────────────────────────────────────────────────────────────────────────────
// MODEL / gen — parametric generators (spec §9). A ship is parameters; a
// forgery is a perturbation of one parameter; the diff between manifest and
// drawn model IS the evidence. Guaranteed solvable, never ambiguous.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CAPTAINS, CONFIG, HULL_MAP, LAWFUL_FLAGS, RULES, TRADE_MAP, feeOf
} from "./content";
import type { ForgeSet, RankDef, RuleDef } from "./content";
import { assertSolvable, ruleApplicable } from "./rules";
import { pick, randInt, rngFrom, shuffled, type Rng } from "./rng";
import { resolvePath, setPath, withIndex } from "./path";
import type {
  Career, Manifest, Registry, Ship, ShipParams, Tier, ToolId, TradeId
} from "./schema";

// ── 9.1 Lawful ship & documents ──────────────────────────────────────────────

export function lawfulParams(chapters: number, r: Rng): ShipParams {
  const hulls = [...HULL_MAP.values()].filter(h => h.minChapters <= chapters);
  const hullDef = pick(r, hulls);
  const [lo, hi] = hullDef.masts;
  const masts = (lo + randInt(r, hi - lo + 1)) as 1 | 2 | 3;
  const bow = pick(r, hullDef.bows);

  const crateCount = 2 + randInt(r, 4); // 2..5 crates
  const crates = Array.from({ length: crateCount }, () => {
    const trade = pick(r, CONFIG.lawfulTrades) as TradeId;
    const count = 2 + randInt(r, 6); // 2..7 units
    const unit = TRADE_MAP.get(trade)!.unitMassKg;
    const jitter = 1 - CONFIG.massJitterPct / 2 + r() * CONFIG.massJitterPct;
    return {
      trade,
      hiddenTrade: trade,
      count,
      massKg: Math.round(count * unit * jitter),
      tarp: r() < CONFIG.tarpChance
    };
  });

  const authority = pick(r, ["crown", "guild", "church"] as const);
  // lawful invariant: faith cargo travels only under a Church seal (§ rules)
  const hasFaith = crates.some(c => c.trade === "faith");
  const finalAuthority = hasFaith ? ("church" as const) : authority;
  const seal = {
    authority: finalAuthority,
    weight: CONFIG.sealHands[finalAuthority],
    ink: "true" as const
  };
  const flag = pick(r, LAWFUL_FLAGS);

  return { hull: hullDef.id, masts, bow, crates, seal, flag, tideWindow: [0, 0], registryClass: hullDef.id, erasure: null };
}

export function manifestOf(params: ShipParams, arrivalTick: number, r: Rng): Manifest {
  void r;
  const half = CONFIG.tideHalfWidthTicks;
  return {
    hull: params.hull,
    // declared mass is a faithful copy of the lawful drawn mass — the document
    // never jitters, otherwise honest ships would fail the Brass Scale rule
    crates: params.crates.map(c => ({ trade: c.trade, count: c.count, massKg: c.massKg })),
    sealAuthority: params.seal.authority,
    flag: params.flag,
    tideWindow: [arrivalTick - half, arrivalTick + half]
  };
}

export function registryOf(params: ShipParams, r: Rng): Registry {
  const ports = CONFIG.ports;
  return {
    hullClass: params.registryClass,
    masts: params.masts,
    bow: params.bow,
    port: pick(r, ports)
  };
}

export function genShip(seed: string, k: number, chapters: number, r: Rng, arrivalTick: number): Ship {
  const params = lawfulParams(chapters, r);
  const manifest = manifestOf(params, arrivalTick, r);
  const registry = registryOf(params, r);
  const ship: Ship = {
    id: `s${k + 1}`,
    captain: pick(r, CAPTAINS),
    params,
    manifest,
    registry,
    forgery: null,
    arrivedAt: arrivalTick,
    arrived: false,
    verdict: null,
    resolvedAt: null,
    searched: false,
    reagent: false,
    lamp: false,
    pins: [],
    result: null,
    feeCents: 0
  };
  void seed;
  return ship;
}

// ── 9.2 Forgery injector — the heart ─────────────────────────────────────────

function drawSet(set: ForgeSet, root: unknown, i: number | null, r: Rng): { lawful: unknown; drawn: unknown } {
  const path = withIndex(set.path, i);
  const lawful = resolvePath(root, path);
  let drawn: unknown;
  switch (set.op) {
    case "set":
      drawn = set.value;
      break;
    case "pick": {
      const candidates = (set.picks ?? []).filter(v => v !== lawful);
      if (candidates.length === 0) throw new Error(`no pick candidate for ${path} (lawful=${String(lawful)})`);
      drawn = pick(r, candidates);
      break;
    }
    case "adjust":
      drawn = (lawful as number) + (set.delta ?? 0);
      break;
    case "copy":
      drawn = resolvePath(root, withIndex(set.from ?? "", i));
      break;
  }
  setPath(root, path, drawn);
  return { lawful, drawn };
}

export function forge(ship: Ship, rule: RuleDef, r: Rng): Ship {
  const next: Ship = structuredClone(ship);
  let i: number | null = null;
  if (rule.each === "crates") {
    // never hide a non-search lie under a tarp: tarp-closed crates are invisible
    const open = next.params.crates
      .map((c, idx) => ({ c, idx }))
      .filter(e => rule.requires.reveal === "search" || !e.c.tarp)
      .map(e => e.idx);
    if (open.length === 0) throw new Error(`no open crate to forge on ${ship.id}`);
    i = pick(r, open);
  }
  let primary: { lawful: unknown; drawn: unknown } | null = null;
  for (const set of rule.forgery.sets) {
    const res = drawSet(set, next, i, r);
    if (primary === null && set.path === rule.check.part) primary = res;
  }
  if (primary === null) primary = drawSet(rule.forgery.sets[0], next, i, r);
  next.forgery = {
    ruleId: rule.id,
    channel: rule.channel,
    path: withIndex(rule.check.part, i),
    part: rule.part,
    lawful: primary.lawful,
    drawn: primary.drawn,
    index: i
  };
  return next;
}

// ── 9.3/9.5 Forgery selection (adaptive smuggler) + shift plan ───────────────

export function pickForgeryRule(rules: RuleDef[], miss: Record<string, number>, r: Rng): RuleDef {
  // softmax over the player's missed rules — the ring forges where you are loose
  const weights = rules.map(rule => Math.exp((miss[rule.id] ?? 0) / 3));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < rules.length; i++) {
    x -= weights[i];
    if (x <= 0) return rules[i];
  }
  return rules[rules.length - 1];
}

function toolOk(rule: RuleDef, tools: ToolId[]): boolean {
  if (rule.requires.tool && !tools.includes(rule.requires.tool)) return false;
  if (rule.requires.reveal === "reagent" && !tools.includes("reagent")) return false;
  if (rule.requires.reveal === "lamp" && !tools.includes("lamp")) return false;
  return true; // "search" is always available via the Hold & Search stamp
}

export function candidateRules(tier: Tier, chapters: number, tools: ToolId[], ship: Ship): RuleDef[] {
  return RULES.filter(
    rule => rule.tier === tier && rule.chapter <= chapters && toolOk(rule, tools) && ruleApplicable(rule, ship)
  );
}

export interface ShiftPlanInput {
  seed: string;
  career: Career;
  rankDef: RankDef;
  chapters: number;
  tools: ToolId[];
}

export function planShift(input: ShiftPlanInput): Ship[] {
  const { seed, career, rankDef, chapters, tools } = input;
  const r = rngFrom(seed, "ships");
  const n = rankDef.ships;
  const spacing = Math.floor((CONFIG.shiftTicks - 2000) / n);
  const forgedCount = Math.min(rankDef.forgedTiers.length, n);
  const forgedSlots = new Set(shuffled(r, Array.from({ length: n }, (_, i) => i)).slice(0, forgedCount));
  const tierBySlot = new Map<number, Tier>();
  shuffled(r, [...forgedSlots]).forEach((slot, idx) => tierBySlot.set(slot, rankDef.forgedTiers[idx]));

  const ships: Ship[] = [];
  for (let k = 0; k < n; k++) {
    const arrival = k * spacing;
    if (forgedSlots.has(k)) {
      const tier = tierBySlot.get(k)!;
      let forged: Ship | null = null;
      for (let attempt = 0; attempt < 30 && forged === null; attempt++) {
        const ship = genShip(seed, k, chapters, r, arrival);
        const candidates = candidateRules(tier, chapters, tools, ship);
        if (candidates.length === 0) continue;
        const rule = pickForgeryRule(candidates, career.missHistogram, r);
        try {
          const candidate = forge(ship, rule, r);
          assertSolvable(candidate, tools, chapters); // a case that cannot be solved never ships
          forged = candidate;
        } catch {
          // try another ship/rule draw
        }
      }
      ships.push(forged ?? genShip(seed, k, chapters, r, arrival)); // fallback: honest
    } else {
      const ship = genShip(seed, k, chapters, r, arrival);
      assertSolvable(ship, tools, chapters); // honest ships violate nothing
      ships.push(ship);
    }
  }
  return ships;
}
