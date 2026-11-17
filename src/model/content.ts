// ─────────────────────────────────────────────────────────────────────────────
// MODEL / content — typed loaders for the data-driven content files.
// Adding content = editing JSON, never code (spec §10).
// ─────────────────────────────────────────────────────────────────────────────

import tradesJson from "./data/trades.json";
import hullsJson from "./data/hulls.json";
import flagsJson from "./data/flags.json";
import captainsJson from "./data/captains.json";
import rulesJson from "./data/rules.json";
import configJson from "./data/config.json";
import { PALETTE } from "./data/palette";
import type {
  BowId, Channel, Cents, FactionId, FlagId, HullId, LineWeight, PartId, PatternId,
  RevealKind, Tier, ToolId, TradeId
} from "./schema";

export { PALETTE };

export interface TradeDef {
  id: TradeId;
  name: string;
  color: string;
  pattern: PatternId;
  unitMassKg: number;
}
export const TRADES = tradesJson as unknown as TradeDef[];
export const TRADE_MAP = new Map<TradeId, TradeDef>(TRADES.map(t => [t.id, t]));

export interface HullDef {
  id: HullId;
  name: string;
  masts: [number, number];
  bows: BowId[];
  length: number;
  railHeight: number;
  holdSlots: number;
  minChapters: number;
  sail: "square" | "lateen";
  smoke: boolean;
  outline: [number, number][];
}
export const HULLS = Object.entries(hullsJson as unknown as Record<string, Omit<HullDef, "id">>)
  .map(([id, h]) => ({ ...h, id: id as HullId }) as HullDef);
export const HULL_MAP = new Map<HullId, HullDef>(HULLS.map(h => [h.id, h]));

export interface FlagDef {
  id: FlagId;
  name: string;
  color: string;
  code: string;
  embargoed?: boolean;
}
export const FLAGS = flagsJson as unknown as FlagDef[];
export const FLAG_MAP = new Map<FlagId, FlagDef>(FLAGS.map(f => [f.id, f]));
export const LAWFUL_FLAGS = FLAGS.filter(f => !f.embargoed).map(f => f.id);

export const CAPTAINS = captainsJson as unknown as string[];

export interface ForgeSet {
  path: string;
  op: "set" | "pick" | "adjust" | "copy";
  value?: unknown;
  picks?: unknown[];
  delta?: number;
  from?: string;
}

export interface RuleDef {
  id: string;
  chapter: number;
  tier: Tier;
  channel: Channel;
  part: PartId;
  statement: string;
  verify: string;
  requires: { tool: ToolId | null; reveal: RevealKind | null };
  each?: "crates";
  when: Record<string, unknown>;
  check: {
    part: string;
    expect?: unknown;
    expectRef?: string;
    forbid?: unknown[];
    within?: string;
  };
  forgery: { sets: ForgeSet[] };
  verdicts: { deny: boolean; fine: boolean };
  screen?: { minPx: number };
}
export const RULES = rulesJson as unknown as RuleDef[];
export const RULE_MAP = new Map<string, RuleDef>(RULES.map(r => [r.id, r]));

export interface EventDef {
  id: string;
  faction: FactionId;
  below?: number;
  above?: number;
  text: string;
  feeMul: number;
}

export interface RankDef {
  title: string;
  feeThreshold: Cents;
  tools: ToolId[];
  ships: number;
  forgedTiers: Tier[];
}

export interface ConfigDef {
  shiftTicks: number;
  searchCostTicks: number;
  strikeMax: number;
  feeMin: number;
  feeMax: number;
  pinBonusCents: number;
  cleanBonusPerShipCents: number;
  maxChapters: number;
  lawfulTrades: TradeId[];
  sealHands: Record<"crown" | "guild" | "church", LineWeight>;
  tideHalfWidthTicks: number;
  tideForgeDelayTicks: number;
  massJitterPct: number;
  tarpChance: number;
  ranks: RankDef[];
  events: EventDef[];
  ports: string[];
}
export const CONFIG = configJson as unknown as ConfigDef;

/** Fee a ship would earn on approval, 8-20¢ by cargo (spec §2.5). */
export function feeOf(crateCount: number): Cents {
  return Math.max(CONFIG.feeMin, Math.min(CONFIG.feeMax, CONFIG.feeMin + 2 * crateCount));
}
