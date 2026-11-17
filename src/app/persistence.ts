// ─────────────────────────────────────────────────────────────────────────────
// APP / persistence — local saves (spec §11, sliced to localStorage). A save is
// a world + fingerprint; unknown futures refuse to load with a readable
// message rather than corrupting. Migrations are a pure chain v(n) → v(n+1).
// ─────────────────────────────────────────────────────────────────────────────

import type { World } from "../model/schema";

const KEY = "inkline-customs-save-v1";
export const FINGERPRINT = "inkline-customs@1";

interface SaveBlob {
  schemaVersion: 1;
  fingerprint: string;
  savedAt: number;
  world: World;
}

export function saveWorld(world: World): void {
  try {
    const blob: SaveBlob = {
      schemaVersion: 1,
      fingerprint: FINGERPRINT,
      savedAt: Date.now(),
      world
    };
    localStorage.setItem(KEY, JSON.stringify(blob));
  } catch {
    /* storage full or unavailable — the desk keeps working without autosave */
  }
}

export function loadWorld(): World | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as SaveBlob;
    if (blob.fingerprint !== FINGERPRINT) {
      console.warn(
        `[inkline] save fingerprint mismatch (expected ${FINGERPRINT}, got ${blob.fingerprint}). ` +
        "Refusing to load — start a fresh career."
      );
      return null;
    }
    if (blob.schemaVersion !== 1) {
      console.warn(`[inkline] unknown save schema v${blob.schemaVersion}, refusing to load.`);
      return null;
    }
    return blob.world;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const lastSaveAge = (): number | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return Date.now() - (JSON.parse(raw) as SaveBlob).savedAt;
  } catch {
    return null;
  }
};
