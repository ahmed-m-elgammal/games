import plantsJson from './plants.json';
import zonesJson from './zones.json';
import { PlantDef, ZoneDef } from '../game/garden';

export const plants = plantsJson as unknown as PlantDef[];
export const zones = zonesJson as unknown as ZoneDef[];

export function plantById(id: string): PlantDef | undefined {
  return plants.find((p) => p.id === id);
}

export function plantsForZone(zoneIdx: number): PlantDef[] {
  return plants.filter((p) => p.zone === zoneIdx);
}
