/** Shared app context passed to every screen. */
import { GameState } from '../core/save';
import { BoardModel } from '../game/board';
import { Particles } from '../art/particles';
import { Background } from '../art/background';

export type ScreenName = 'splash' | 'board' | 'garden' | 'journal' | 'settings' | 'goodnight' | 'sleep';
export type SessionPhase = 'idle' | 'peak' | 'winddown' | 'goodnight';

export interface App {
  state: GameState;
  board: BoardModel;
  particles: Particles;
  bg: Background;
  sessionPhase: SessionPhase;
  goto(name: ScreenName, arg?: number): void;
  toast(msg: string): void;
  sr(msg: string): void;
  requestSave(): void;
  checkZonesAndCreatures(): void;
  lureCreatures(): void;
  /** index of zone the garden screen should show (or -1 for current) */
  gardenZone: number;
  reducedMotion(): boolean;
  applyAutoDim(): void;
  keepPlayingFiveMore(): void;
  enterSleepMode(): void;
  resetProgress(): void;
}
