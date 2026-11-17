import creaturesJson from './creatures.json';
import { CreatureDef } from '../game/creatures';

export const creatures = creaturesJson as unknown as CreatureDef[];

/** Sorted by Serenity threshold ascending. */
export const creaturesByThreshold = [...creatures].sort((a, b) => a.threshold - b.threshold);
