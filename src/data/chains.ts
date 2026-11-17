/**
 * Item chain definitions (data-driven).
 * Two chains at launch:
 *   moon: Seeds -> Sprouts -> Buds -> Moonpetals -> Glow Blooms -> Star Trees (6 tiers)
 *   dust: Dust -> Fireflies -> Lanterns -> Wisps -> Constellations (5 tiers)
 * Every tier has a distinct silhouette (colorblind-safe by shape, not hue alone).
 */
export type ChainId = 'moon' | 'dust';
export type Variant = 'normal' | 'gold' | 'silver';

export interface TierDef {
  name: string;
  /** core color of the item */
  c: string;
  /** glow color */
  g: string;
  /** deep accent */
  d: string;
}

export interface ChainDef {
  id: ChainId;
  name: string;
  tiers: TierDef[];
}

export const CHAINS: Record<ChainId, ChainDef> = {
  moon: {
    id: 'moon',
    name: 'Moonpetal Chain',
    tiers: [
      { name: 'Seed', c: '#ffd98c', g: '#ffb35c', d: '#d98a3e' },
      { name: 'Sprout', c: '#8ff0d8', g: '#6fe3c1', d: '#3aa88c' },
      { name: 'Bud', c: '#cbb2ff', g: '#b9a7ff', d: '#7c66c9' },
      { name: 'Moonpetal', c: '#d9c6ff', g: '#b9a7ff', d: '#8f7bff' },
      { name: 'Glow Bloom', c: '#7feccf', g: '#6fe3c1', d: '#3fae91' },
      { name: 'Star Tree', c: '#ffd76e', g: '#ffcf8f', d: '#c9962e' }
    ]
  },
  dust: {
    id: 'dust',
    name: 'Stardust Chain',
    tiers: [
      { name: 'Dust', c: '#cfd8ff', g: '#9fb4ff', d: '#6a7fd0' },
      { name: 'Firefly', c: '#ffe08a', g: '#ffcf6e', d: '#d0a03e' },
      { name: 'Lantern', c: '#ffb35c', g: '#ff9d5c', d: '#c97a3e' },
      { name: 'Wisp', c: '#dff6ff', g: '#bff0ff', d: '#7cc9e8' },
      { name: 'Constellation', c: '#ffe9a8', g: '#ffd76e', d: '#c9a34e' }
    ]
  }
};

export const VARIANT_PREFIX: Record<Variant, string> = {
  normal: '',
  gold: 'Golden ',
  silver: 'Silver '
};

export interface Item {
  uid: string;
  chain: ChainId;
  tier: number;
  variant: Variant;
}

export function tierName(chain: ChainId, tier: number): string {
  return CHAINS[chain].tiers[tier - 1]?.name ?? '???';
}

export function itemName(item: { chain: ChainId; tier: number; variant: Variant }): string {
  return VARIANT_PREFIX[item.variant] + tierName(item.chain, item.tier);
}

export function maxTier(chain: ChainId): number {
  return CHAINS[chain].tiers.length;
}

/** Top-tier items are plantable in the Night Garden instead of merging. */
export function isPlantable(item: { chain: ChainId; tier: number }): boolean {
  return item.tier >= maxTier(item.chain);
}

/** Gold beats silver when two variants merge. */
export function mergeVariant(a: Variant, b: Variant): Variant {
  if (a === 'gold' || b === 'gold') return 'gold';
  if (a === 'silver' || b === 'silver') return 'silver';
  return 'normal';
}

/** Extra energy granted per bonus item in a 3+ merge. */
export const BONUS_ENERGY_PER_EXTRA = 4;
