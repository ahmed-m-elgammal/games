// ─────────────────────────────────────────────────────────────────────────────
// VIEWMODEL / port-view — "everything the desk shows, derived per tick"
// (spec §4 contract, adapted to MVVM). Pure function world → PortView.
// The forgery is NEVER exposed here until the model itself records a result —
// discovery happens only through pins, tools and search in the sim.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG, FLAG_MAP, HULL_MAP, RULE_MAP, TRADE_MAP, feeOf } from "../model/content";
import type { World, Ship } from "../model/schema";
import type {
  BowId, FactionState, FlagId, HullId, LineWeight, PartId, PatternId, Pin, ResultView,
  Tick, Tier, ToolId, TradeId, Channel, Cents
} from "../model/schema";
import { currentShip } from "../model/world";

export interface DrawnCrate {
  visibleTrade: TradeId | null; // null while a tarp is closed
  count: number | null; // tally marks hidden under a closed tarp
  tarpClosed: boolean;
  tarpFolded: boolean;
  massKg: number;
}

export interface DrawnShip {
  hull: HullId;
  masts: 1 | 2 | 3;
  bow: BowId;
  flag: FlagId;
  erasure: "hull" | null;
  crates: DrawnCrate[];
}

export interface ManifestCrateView {
  trade: TradeId;
  pattern: PatternId;
  count: number;
  massKg: number;
}

export interface ShipView {
  id: string;
  captain: string;
  hullName: string;
  baseFee: Cents;
  reagentApplied: boolean;
  lampApplied: boolean;
  drawn: DrawnShip;
  manifest: {
    hull: HullId;
    crates: ManifestCrateView[];
    sealAuthority: "crown" | "guild" | "church";
    sealWeight: LineWeight;
    sealInkForged: boolean; // only meaningful after the reagent has wet the page
    flag: FlagId;
    tideWindow: [Tick, Tick];
    searched: boolean;
    foundUndeclared: TradeId[];
  };
  registry: { hullClass: HullId; masts: 1 | 2 | 3; bow: BowId; port: string };
  pins: Pin[];
  result: ResultView | null;
}

export interface RulebookChapter {
  chapter: number;
  unlocked: boolean;
  rules: { id: string; label: string; statement: string; verify: string; tier: Tier; channel: Channel }[];
}

export interface TideRow {
  shipId: string;
  label: string;
  window: [Tick, Tick];
  current: boolean;
  arrived: boolean;
  arrivedAt: Tick;
}

export interface CardView {
  won: boolean;
  forfeited: boolean;
  fees: Cents;
  resolved: number;
  total: number;
  caught: number;
  discovered: number;
  pinsCorrect: number;
  pinsMade: number;
  seed: string;
  bestCatch: { captain: string; statement: string; part: PartId; drawn: DrawnShip } | null;
}

export interface LastResultView {
  shipId: string;
  captain: string;
  result: ResultView;
  statement: string | null;
  chapter: number | null;
}

export interface PortView {
  status: World["status"];
  forfeited: boolean;
  rankTitle: string;
  chapters: number;
  tools: ToolId[];
  shift: {
    seed: string;
    tick: Tick;
    remainingTicks: Tick;
    feesCents: Cents;
    strikes: number;
    resolved: number;
    total: number;
  };
  factions: FactionState;
  ship: ShipView | null;
  lastResult: LastResultView | null;
  rulebook: RulebookChapter[];
  tideRows: TideRow[];
  log: World["log"];
  card: CardView | null;
  notes: string; // screen-reader description of the drawn state
}

function drawnOf(ship: Ship): DrawnShip {
  return {
    hull: ship.params.hull,
    masts: ship.params.masts,
    bow: ship.params.bow,
    flag: ship.params.flag,
    erasure: ship.params.erasure,
    crates: ship.params.crates.map(c => ({
      visibleTrade: c.tarp && !ship.searched ? null : c.hiddenTrade,
      count: c.tarp && !ship.searched ? null : c.count,
      tarpClosed: c.tarp && !ship.searched,
      tarpFolded: c.tarp && ship.searched,
      massKg: c.massKg
    }))
  };
}

function shipView(ship: Ship): ShipView {
  const undeclared = ship.searched
    ? ship.params.crates.filter(c => c.hiddenTrade !== c.trade).map(c => c.hiddenTrade)
    : [];
  return {
    id: ship.id,
    captain: ship.captain,
    hullName: HULL_MAP.get(ship.params.hull)!.name,
    baseFee: feeOf(ship.params.crates.length),
    reagentApplied: ship.reagent,
    lampApplied: ship.lamp,
    drawn: drawnOf(ship),
    manifest: {
      hull: ship.manifest.hull,
      crates: ship.manifest.crates.map(c => ({
        trade: c.trade,
        pattern: TRADE_MAP.get(c.trade)!.pattern,
        count: c.count,
        massKg: c.massKg
      })),
      sealAuthority: ship.manifest.sealAuthority,
      sealWeight: ship.params.seal.weight,
      sealInkForged: ship.params.seal.ink === "forged",
      flag: ship.manifest.flag,
      tideWindow: ship.manifest.tideWindow,
      searched: ship.searched,
      foundUndeclared: undeclared
    },
    registry: ship.registry,
    pins: ship.pins,
    result: ship.result
  };
}

function rulebookOf(chapters: number): RulebookChapter[] {
  const out: RulebookChapter[] = [];
  const max = CONFIG.maxChapters;
  for (let c = 1; c <= max; c++) {
    out.push({
      chapter: c,
      unlocked: c <= chapters,
      rules: [...RULE_MAP.values()]
        .filter(r => r.chapter === c)
        .map(r => ({
          id: r.id,
          label: `§${r.chapter}.${r.id.split(".").slice(-1)[0] ?? ""}`,
          statement: r.statement,
          verify: r.verify,
          tier: r.tier,
          channel: r.channel
        }))
    });
  }
  return out;
}

function tidesOf(w: World): TideRow[] {
  return w.ships.map(s => ({
    shipId: s.id,
    label: `${s.captain} — ${s.id.toUpperCase()}`,
    window: s.manifest.tideWindow,
    current: s.arrived && s.resolvedAt === null,
    arrived: s.arrived,
    arrivedAt: s.arrivedAt
  }));
}

function notesOf(ship: Ship): string {
  const d = drawnOf(ship);
  const flag = FLAG_MAP.get(d.flag)!.name;
  const crates = d.crates
    .map(c => {
      if (c.tarpClosed) return "one crate hidden under a closed tarp";
      const t = c.visibleTrade !== null ? TRADE_MAP.get(c.visibleTrade)!.name.toLowerCase() : "unmarked";
      const n = c.count ?? 0;
      return `${n} units of ${t}`;
    })
    .join("; ");
  return (
    `The drawn ship: a ${HULL_MAP.get(d.hull)!.name.toLowerCase()}, ${d.masts} mast${d.masts > 1 ? "s" : ""}, ` +
    `${d.bow} bow, flying the ${flag}. Deck cargo: ${crates}.`
  );
}

function cardOf(w: World): CardView {
  const forged = w.ships.filter(s => s.forgery !== null);
  const caught = forged.filter(s => s.result?.correct);
  const discovered = caught.filter(s => s.result?.discovered);
  const pinsMade = w.ships.reduce((a, s) => a + s.pins.length, 0);
  const pinsCorrect = w.ships.reduce((a, s) => a + s.pins.filter(p => p.correct).length, 0);
  let bestCatch: CardView["bestCatch"] = null;
  const pool = discovered.length > 0 ? discovered : caught;
  if (pool.length > 0) {
    const best = pool.slice().sort((a, b) => (b.result!.feeCents) - (a.result!.feeCents))[0];
    const rule = RULE_MAP.get(best.forgery!.ruleId);
    bestCatch = {
      captain: best.captain,
      statement: rule?.statement ?? best.forgery!.path,
      part: best.forgery!.part,
      drawn: drawnOf(best)
    };
  }
  return {
    won: w.status === "won",
    forfeited: w.forfeited,
    fees: w.feesCents,
    resolved: w.ships.filter(s => s.resolvedAt !== null).length,
    total: w.ships.length,
    caught: caught.length,
    discovered: discovered.length,
    pinsCorrect,
    pinsMade,
    seed: w.seed,
    bestCatch
  };
}

export function derivePortView(w: World): PortView {
  const cur = currentShip(w);
  const lastResolved = w.ships
    .filter(s => s.resolvedAt !== null)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))[0];
  let lastResult: LastResultView | null = null;
  if (lastResolved?.result) {
    const rule = lastResolved.result.ruleId ? RULE_MAP.get(lastResolved.result.ruleId) : undefined;
    lastResult = {
      shipId: lastResolved.id,
      captain: lastResolved.captain,
      result: lastResolved.result,
      statement: rule?.statement ?? null,
      chapter: rule?.chapter ?? null
    };
  }
  return {
    status: w.status,
    forfeited: w.forfeited,
    rankTitle: CONFIG.ranks[w.rank].title,
    chapters: w.chapters,
    tools: w.tools,
    shift: {
      seed: w.seed,
      tick: w.tick,
      remainingTicks: Math.max(0, w.shiftTicks - w.tick),
      feesCents: w.feesCents,
      strikes: w.strikes,
      resolved: w.ships.filter(s => s.resolvedAt !== null).length,
      total: w.ships.length
    },
    factions: w.career.factions,
    ship: cur ? shipView(cur) : null,
    lastResult,
    rulebook: rulebookOf(w.chapters),
    tideRows: tidesOf(w),
    log: w.log.slice(-6),
    card: w.status === "running" ? null : cardOf(w),
    notes: cur ? notesOf(cur) : "The quay is empty."
  };
}
