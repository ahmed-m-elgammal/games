// ─────────────────────────────────────────────────────────────────────────────
// MODEL / schema — plain data contracts. Pure: no DOM, no Math.random, no
// Date.now (enforced by scripts/check-layers.mjs). Headless-runnable.
// Adapted from spec §6 (Data Model) for the data-driven MVVM architecture.
// ─────────────────────────────────────────────────────────────────────────────

export type Tick = number; // integer, 20 Hz
export type Cents = number; // integer money
export type LineWeight = 1 | 2; // light hand / heavy hand
export type Tier = 1 | 2 | 3;

export type TradeId = "timber" | "grain" | "fish" | "cloth" | "ore" | "faith" | "contraband";
export type HullId = "cog" | "barque" | "ferry" | "warship" | "hulk" | "freighter";
export type BowId = "round" | "clipper" | "square";
export type FlagId = "crown" | "guild" | "free" | "north" | "south" | "redwater";
export type Verdict = "approve" | "deny" | "fine" | "search";
export type FactionId = "crown" | "guild" | "smugglers" | "church";
export type Channel = "weight" | "trade" | "geometry" | "document" | "hidden" | "systemic";
export type ToolId = "magnifier" | "scale" | "reagent" | "lamp";
export type PartId = "seal" | "crate" | "hull" | "masts" | "bow" | "flag" | "tide";
export type RevealKind = "search" | "reagent" | "lamp";
export type PatternId = "wave" | "rings" | "dots" | "cross" | "diagonal" | "none" | "chevron";

export interface Crate {
  trade: TradeId; // what the crate wears (drawn truth)
  hiddenTrade: TradeId; // what the crate actually holds (== trade on honest ships)
  count: number;
  massKg: number;
  tarp: boolean;
}

export interface Seal {
  authority: "crown" | "guild" | "church";
  weight: LineWeight; // heavy hand = 2, light hand = 1
  ink: "true" | "forged";
}

export interface ShipParams {
  hull: HullId; // the DRAWN hull class (may be the lie)
  masts: 1 | 2 | 3;
  bow: BowId;
  crates: Crate[];
  seal: Seal;
  flag: FlagId;
  tideWindow: [Tick, Tick];
  registryClass: HullId; // what the registry says (lawful)
  erasure: "hull" | null; // erased-and-redrawn lines
}

export interface Manifest {
  hull: HullId;
  crates: { trade: TradeId; count: number; massKg: number }[];
  sealAuthority: Seal["authority"];
  flag: FlagId;
  tideWindow: [Tick, Tick];
}

export interface Registry {
  hullClass: HullId;
  masts: 1 | 2 | 3;
  bow: BowId;
  port: string;
}

/** The diff between lawful and drawn IS the evidence (spec P2). */
export interface Forgery {
  ruleId: string;
  channel: Channel;
  path: string; // e.g. "params.crates[2].trade"
  part: PartId;
  lawful: unknown;
  drawn: unknown;
  index: number | null; // crate index when the lie lives on a crate
}

export interface Pin {
  partId: PartId;
  index: number | null;
  atTick: Tick;
  correct: boolean;
}

export interface ResultView {
  verdict: Verdict;
  correct: boolean;
  feeCents: Cents; // total credited to the shift (fee + pin bonus)
  discovered: boolean; // was the lie actually observed before stamping?
  ruleId: string | null; // forgery rule id (null on honest ships)
}

export interface Ship {
  id: string;
  captain: string;
  params: ShipParams;
  manifest: Manifest;
  registry: Registry;
  forgery: Forgery | null; // null = honest ship
  arrivedAt: Tick;
  arrived: boolean;
  verdict: Verdict | null;
  resolvedAt: Tick | null;
  searched: boolean;
  reagent: boolean;
  lamp: boolean;
  pins: Pin[];
  result: ResultView | null;
  feeCents: Cents; // cents actually credited to this ship at resolution
}

export interface Evidence {
  ruleId: string;
  channel: Channel;
  part: PartId;
  index: number | null;
  minScreenPx: number;
}

export interface FactionState {
  crown: number;
  guild: number;
  smugglers: number;
  church: number;
}

export interface Career {
  feesTotalCents: Cents;
  shiftsCompleted: number;
  factions: FactionState;
  missHistogram: Record<string, number>; // RuleId → times missed (feeds the adaptive smuggler)
}

export interface LogEntry {
  tick: Tick;
  text: string;
  tone: "info" | "good" | "bad";
}

export interface World {
  version: 1;
  seed: string;
  tick: Tick;
  shiftTicks: Tick;
  ships: Ship[];
  feesCents: Cents;
  strikes: number;
  feeMul: number; // event modifier on fees for this shift
  career: Career; // snapshot entering this shift
  rank: number;
  chapters: number; // unlocked rulebook chapters this shift
  tools: ToolId[];
  status: "running" | "won" | "lost";
  log: LogEntry[];
  firedEvents: string[];
  forfeited: boolean;
}
