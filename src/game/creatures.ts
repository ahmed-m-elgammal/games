/**
 * Creature visit logic. Pure functions over GameState + creature data.
 * Visits are gentle: crossing a Serenity threshold invites a creature on its
 * own time; repeat visits unlock the next story chapter (Zeigarnik-lite: the
 * story is never "finished" in one sitting).
 */
import { GameState, CreatureProgress } from '../core/save';
import { Rng } from '../core/rng';

export interface Chapter {
  title: string;
  text: string;
}

export interface CreatureDef {
  id: string;
  name: string;
  species: string;
  art: string;
  threshold: number;
  zone: number;
  palette: { body: string; belly: string; accent: string };
  blurb: string;
  chapters: Chapter[];
}

export function progressOf(state: GameState, id: string): CreatureProgress {
  if (!state.creatures[id]) {
    state.creatures[id] = { visits: 0, chaptersRead: 0, firstSeen: null };
  }
  return state.creatures[id];
}

export function isDiscovered(state: GameState, id: string): boolean {
  return (state.creatures[id]?.visits ?? 0) > 0;
}

/** First creature whose threshold is still ahead of current Serenity. */
export function nextCreatureDef(serenity: number, defs: CreatureDef[]): CreatureDef | null {
  for (const d of defs) if (serenity < d.threshold) return d;
  return null;
}

export function discoveredCount(state: GameState): number {
  return Object.values(state.creatures).filter((c) => c.visits > 0).length;
}

export interface WelcomeResult {
  firstTime: boolean;
  chapter: number | null;
  chaptersLeft: number;
}

/**
 * A creature was tapped/welcomed. Registers the visit and unlocks the next
 * chapter if any remain. Returns which chapter to read (0-based) or null
 * (all chapters read — re-read last one).
 */
export function welcomeCreature(state: GameState, def: CreatureDef, now: number): WelcomeResult {
  const p = progressOf(state, def.id);
  const firstTime = p.visits === 0;
  p.visits += 1;
  if (p.firstSeen === null) p.firstSeen = now;
  let chapter: number | null = null;
  if (p.chaptersRead < def.chapters.length) {
    chapter = p.chaptersRead;
    p.chaptersRead += 1;
  }
  return { firstTime, chapter, chaptersLeft: def.chapters.length - p.chaptersRead };
}

/** Ambient visit chance while the garden is open (variable, cozy pacing). */
export function ambientVisitChance(openMs: number): number {
  if (openMs < 90_000) return 0; // let the garden settle first
  return 0.006 * (openMs / 1000 / 10); // ~ +0.6% per 10s, checked each second
}

export function rollAmbientVisit(state: GameState, defs: CreatureDef[], rng: Rng, now: number, openMs: number): CreatureDef | null {
  if (now < state.garden.visitCooldownUntil) return null;
  if (!rng.chance(ambientVisitChance(openMs))) return null;
  const candidates = defs.filter((d) => state.serenity >= d.threshold * 0.35);
  if (candidates.length === 0) return null;
  state.garden.visitCooldownUntil = now + 3 * 60_000;
  return candidates[Math.floor(rng.next() * candidates.length)];
}

/** Lure reward: next ambient visit arrives soon (used by 'lure' reward kind). */
export function applyLure(state: GameState, now: number): void {
  state.garden.visitCooldownUntil = 0;
  state.garden.lureUntil = now + 45_000;
}
