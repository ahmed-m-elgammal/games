// ─────────────────────────────────────────────────────────────────────────────
// APP / main — composition root. Wires Model ⇄ ViewModel ⇄ View:
//   the View emits Interactions into the single edit queue; the loop consumes
//   the queue at fixed 20 Hz ticks through the pure step() reducer; the
//   ViewModel derives PortView and the View re-renders from it.
// ─────────────────────────────────────────────────────────────────────────────

import { dailySeed } from "../model/rng";
import { createWorld, step } from "../model/world";
import { newCareer } from "../model/career";
import { EditQueue } from "../model/interactions";
import type { World } from "../model/schema";
import type { ToolId, Verdict } from "../model/schema";
import { derivePortView } from "../viewmodel/port-view";
import type { PortView } from "../viewmodel/port-view";
import { Signal } from "../viewmodel/store";
import { createDiorama, type Camera, type ToolActive } from "../view/diorama";
import { createDocuments } from "../view/documents";
import { createHud } from "../view/hud";
import { createTools } from "../view/tools";
import { createVerdictBar } from "../view/verdict-bar";
import { showCardDialog } from "../view/card";
import { AudioEngine } from "../view/audio";
import { clearSave, loadWorld, saveWorld } from "./persistence";
import "../styles.css";

// ── boot ─────────────────────────────────────────────────────────────────────

const $ = (id: string): HTMLElement => {
  const n = document.getElementById(id);
  if (!n) throw new Error(`missing #${id}`);
  return n;
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const audio = new AudioEngine(m => {
  muted.set(m); // m = audio muted state
  try { localStorage.setItem("inkline-muted", m ? "1" : "0"); } catch { /* ignore */ }
});

const cam = new Signal<Camera>({ x: 0, y: 0, zoom: 1 });
const tool = new Signal<ToolActive>("none");
const overlay = new Signal<boolean>(false);
const scaleCrate = new Signal<number | null>(null);
// muted signal: true = sound muted. Default is sound ON (spec §16).
const muted = new Signal<boolean>((() => { try { return localStorage.getItem("inkline-muted") === "1"; } catch { return false; } })());

let world: World;
let queue = new EditQueue();

const saved = loadWorld();
if (saved) {
  world = saved;
} else {
  world = createWorld(initialSeed(), newCareer());
}

function initialSeed(): string {
  return `career-v1:first-${Math.floor((Date.now() % 1e7))}`;
}

const store = new Signal<PortView>(derivePortView(world));

// ── audio engine state ───────────────────────────────────────────────────────
audio.setMuted(muted.get());

// ── diorama ──────────────────────────────────────────────────────────────────
const diorama = createDiorama($("diorama") as HTMLCanvasElement, {
  cam,
  tool,
  overlay,
  scaleCrate,
  reducedMotion,
  onPin: (partId, index) => {
    const ship = store.get().ship;
    if (!ship) return;
    queue.enqueue({ kind: "pinEvidence", shipId: ship.id, partId: partId as never, index: index ?? undefined }, world.tick);
  }
});

// ── documents ────────────────────────────────────────────────────────────────
const docs = createDocuments($("doc-tabs"), $("doc-panel"), store, {
  pin: (partId, index) => {
    const ship = store.get().ship;
    if (!ship) return;
    queue.enqueue({ kind: "pinEvidence", shipId: ship.id, partId: partId as never, index: index ?? undefined }, world.tick);
  },
  setOverlay: on => overlay.set(on),
  onTab: () => audio.paper()
});

// ── hud ──────────────────────────────────────────────────────────────────────
createHud($("hud"), store, muted, {
  onDaily: () => startShift(dailySeed(new Date().toISOString().slice(0, 10))),
  onSeed: () => openSeedDialog(),
  onReset: () => {
    if (window.confirm("Reset the career? Your desk, fees and faction standing will be erased.")) {
      clearSave();
      world = createWorld(initialSeed(), newCareer());
      afterWorldSwap();
    }
  },
  onMute: () => audio.setMuted(!audio.muted)
});

// ── tools ────────────────────────────────────────────────────────────────────
createTools($("tool-tray"), store, tool, {
  onSelect: id => audio.paper(),
  onApply: id => {
    const ship = store.get().ship;
    if (!ship) return;
    queue.enqueue({ kind: "tool", shipId: ship.id, tool: id as ToolId }, world.tick);
    if (id === "reagent") audio.bleed();
  }
});

// ── verdict bar ──────────────────────────────────────────────────────────────
const bannerEl = (() => {
  const n = document.createElement("div");
  n.id = "result-banner";
  n.hidden = true;
  $("verdict-bar").before(n);
  return n;
})();

const verdicts = createVerdictBar($("verdict-bar"), $("stamp-overlay"), bannerEl, store, {
  onVerdict: v => {
    const ship = store.get().ship;
    if (!ship) return;
    queue.enqueue({ kind: "verdict", shipId: ship.id, verdict: v }, world.tick);
    verdicts.stampAnim(v);
    audio.stamp();
    if (v === "search") audio.paper();
  }
});

// ── shift transitions ────────────────────────────────────────────────────────

function startShift(seed: string): void {
  world = createWorld(seed, world.career);
  afterWorldSwap();
}

function afterWorldSwap(): void {
  queue = new EditQueue();
  cam.set({ x: 0, y: 0, zoom: 1 });
  overlay.set(false);
  tool.set("none");
  scaleCrate.set(null);
  cardShownFor = "";
  store.set(derivePortView(world));
  saveWorld(world);
}

let cardShownFor = "";
store.subscribe(pv => {
  if (pv.status !== "running" && pv.card && cardShownFor !== pv.card.seed) {
    cardShownFor = pv.card.seed;
    audio.bell();
    showCardDialog($("card-dialog") as HTMLDialogElement, pv.card, {
      onDownload: cv => {
        const a = document.createElement("a");
        a.href = cv.toDataURL("image/png");
        a.download = `inkline-verdict-${pv.card!.seed.replace(/[^\w-]/g, "_")}.png`;
        a.click();
      },
      onCopySeed: seed => void navigator.clipboard?.writeText(seed).catch(() => undefined),
      onNextShift: () => startShift(nextSeed())
    });
  }
});

function nextSeed(): string {
  return `career-v1:${world.career.shiftsCompleted}-${Date.now() % 1e7}`;
}

// ── seed dialog ──────────────────────────────────────────────────────────────

function openSeedDialog(): void {
  const dialog = $("seed-dialog") as HTMLDialogElement;
  const input = document.createElement("input");
  input.type = "text";
  input.id = "seed-input";
  input.placeholder = "any words — the same seed draws the same ships";
  input.value = world.seed;
  const start = document.createElement("button");
  start.className = "primary-btn";
  start.type = "button";
  start.textContent = "Start shift from seed";
  start.addEventListener("click", () => {
    const v = input.value.trim();
    dialog.close();
    if (v) startShift(v);
  });
  const cancel = document.createElement("button");
  cancel.className = "ghost-btn";
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => dialog.close());
  const wrap = document.createElement("div");
  wrap.className = "seed-dialog";
  wrap.append(
    Object.assign(document.createElement("h3"), { textContent: "The Ledger of Seeds" }),
    Object.assign(document.createElement("p"), {
      textContent: "A seed is a fate: the same string always draws the same six ships, honest and otherwise.",
      className: "doc-sub"
    }),
    input,
    (() => { const row = document.createElement("div"); row.className = "card-actions"; row.append(start, cancel); return row; })()
  );
  dialog.replaceChildren(wrap);
  if (!dialog.open) dialog.showModal();
  input.focus();
  input.select();
}

// ── toast + audio hooks on state transitions ────────────────────────────────

let lastLogLen = world.log.length;
let lastShipId: string | null = null;
let lastStrikes = world.strikes;
store.subscribe(pv => {
  const toast = $("toast");
  if (pv.log.length !== lastLogLen && pv.log.length > 0) {
    const entry = pv.log[pv.log.length - 1];
    lastLogLen = pv.log.length;
    toast.textContent = entry.text;
    toast.className = `show ${entry.tone}`;
    void toast.offsetWidth;
    window.setTimeout(() => { toast.className = ""; }, 4200);
  }
  const shipId = pv.ship?.id ?? null;
  if (shipId !== lastShipId) {
    if (shipId !== null) audio.bell();
    lastShipId = shipId;
  }
  if (pv.shift.strikes > lastStrikes) audio.strike();
  lastStrikes = pv.shift.strikes;
  const waitNote = $("wait-note");
  waitNote.hidden = pv.ship !== null || pv.status !== "running";
});

// gulls: ambient scheduler, muted-safe
const scheduleGulls = () => {
  window.setTimeout(() => {
    if (!audio.muted) audio.gull();
    scheduleGulls();
  }, 7000 + Math.random() * 13000);
};
scheduleGulls();

// ── scale tooltip (Brass Scale verb) ─────────────────────────────────────────
const tooltip = $("scale-tooltip");
const canvasEl = $("diorama") as HTMLCanvasElement;
canvasEl.addEventListener("pointermove", ev => {
  if (tool.get() !== "scale") { tooltip.hidden = true; return; }
  const pv = store.get();
  const hit = diorama.hitNow(ev.offsetX, ev.offsetY);
  if (!hit || hit.partId !== "crate" || hit.index === null || !pv.ship) { tooltip.hidden = true; return; }
  const drawn = pv.ship.drawn.crates[hit.index];
  const declared = pv.ship.manifest.crates[hit.index];
  if (!drawn || !declared) { tooltip.hidden = true; return; }
  tooltip.hidden = false;
  tooltip.style.left = `${ev.offsetX + 14}px`;
  tooltip.style.top = `${ev.offsetY - 44}px`;
  tooltip.innerHTML = `drawn <strong>${drawn.massKg}</strong> kg · manifest <strong>${declared.massKg}</strong> kg`;
});
canvasEl.addEventListener("pointerleave", () => { tooltip.hidden = true; });

// ── keyboard (spec §2.12) ────────────────────────────────────────────────────
window.addEventListener("keydown", ev => {
  const target = ev.target as HTMLElement;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  const pv = store.get();
  const ship = pv.ship;
  switch (ev.key.toLowerCase()) {
    case "a": case "d": case "f": case "h": {
      const verdict = ev.key.toLowerCase() as Verdict;
      if (ship && pv.status === "running") {
        queue.enqueue({ kind: "verdict", shipId: ship.id, verdict }, world.tick);
        verdicts.stampAnim(verdict);
        audio.stamp();
      }
      break;
    }
    case "tab":
      ev.preventDefault();
      docs.cycle(ev.shiftKey ? -1 : 1);
      break;
    case "arrowleft": cam.update(c => ({ ...c, x: c.x + 40 })); break;
    case "arrowright": cam.update(c => ({ ...c, x: c.x - 40 })); break;
    case "arrowup": cam.update(c => ({ ...c, y: c.y + 30 })); break;
    case "arrowdown": cam.update(c => ({ ...c, y: c.y - 30 })); break;
    case "+": case "=": cam.update(c => ({ ...c, zoom: Math.min(4.5, c.zoom * 1.15) })); break;
    case "-": cam.update(c => ({ ...c, zoom: Math.max(0.5, c.zoom / 1.15) })); break;
    case "m": audio.setMuted(!audio.muted); break;
  }
});

// ── autosave (every 120s + every verdict + unload) ──────────────────────────
let lastResolved = world.ships.filter(s => s.resolvedAt !== null).length;
store.subscribe(pv => {
  if (pv.shift.resolved !== lastResolved) {
    lastResolved = pv.shift.resolved;
    saveWorld(world);
  }
});
window.setInterval(() => saveWorld(world), 120_000);
window.addEventListener("beforeunload", () => saveWorld(world));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveWorld(world);
});

// ── ambience starts on first gesture (autoplay policy) ──────────────────────
window.addEventListener("pointerdown", () => audio.startAmbience(), { once: true });

// ── the fixed 20 Hz loop ─────────────────────────────────────────────────────
const STEP_MS = 50; // 20 Hz (spec §5)
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(now - last, 250);
  last = now;
  acc += dt;
  let stepped = false;
  while (acc >= STEP_MS) {
    const drained = queue.drain();
    world = step(world, drained);
    acc -= STEP_MS;
    stepped = true;
  }
  if (stepped) store.set(derivePortView(world));
  diorama.render(store.get(), world.tick);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── dev/E2E hook (only when ?debug is in the URL) ────────────────────────────
if (new URLSearchParams(location.search).has("debug")) {
  (window as unknown as Record<string, unknown>).__inkline = {
    world: () => world,
    view: () => store.get(),
    advance: (ticks: number) => {
      for (let i = 0; i < ticks; i++) world = step(world, queue.drain());
      store.set(derivePortView(world));
    }
  };
}
