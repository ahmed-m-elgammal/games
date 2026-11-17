// ─────────────────────────────────────────────────────────────────────────────
// VIEW / hud — shift clock, fees, strikes, faction pips, rank, controls.
// Mute toggle is always visible (spec §2.2/§16); default on.
// ─────────────────────────────────────────────────────────────────────────────

import { PALETTE } from "../model/data/palette";
import type { FactionId } from "../model/schema";
import type { PortView } from "../viewmodel/port-view";
import type { Signal } from "../viewmodel/store";
import { el, clockOf } from "../viewmodel/store";

export interface HudActions {
  onDaily: () => void;
  onSeed: () => void;
  onReset: () => void;
  onMute: () => void;
}

const FACTIONS: { id: FactionId; label: string; color: string }[] = [
  { id: "crown", label: "Crown", color: PALETTE.crown },
  { id: "guild", label: "Guild", color: PALETTE.timber },
  { id: "smugglers", label: "Smugglers", color: PALETTE.contraband },
  { id: "church", label: "Church", color: PALETTE.faith }
];

export function createHud(hudEl: HTMLElement, store: Signal<PortView>, muted: Signal<boolean>, actions: HudActions) {
  const rankEl = el("div", { class: "hud-rank" });
  const clockEl = el("div", { class: "hud-clock" }, "--:--");
  const feesEl = el("div", { class: "hud-fees" }, "0¢");
  const strikesEl = el("div", { class: "hud-strikes" });
  const factionEl = el("div", { class: "hud-factions" });
  const mutedBtn = el("button", { class: "hud-btn", type: "button", "aria-pressed": "false", title: "Mute (M)" }, "Sound: on");
  mutedBtn.addEventListener("click", actions.onMute);

  const dailyBtn = el("button", { class: "hud-btn", type: "button", title: "Daily Shift — same seed worldwide" }, "Daily");
  dailyBtn.addEventListener("click", actions.onDaily);
  const seedBtn = el("button", { class: "hud-btn", type: "button", title: "Start a shift from a custom seed" }, "Seed…");
  seedBtn.addEventListener("click", actions.onSeed);
  const resetBtn = el("button", { class: "hud-btn subtle", type: "button", title: "Reset career (erases save)" }, "Reset");
  resetBtn.addEventListener("click", actions.onReset);

  hudEl.append(
    rankEl,
    el("div", { class: "hud-center" }, clockEl, feesEl, strikesEl),
    factionEl,
    el("div", { class: "hud-actions" }, dailyBtn, seedBtn, mutedBtn, resetBtn)
  );

  muted.subscribe(isMuted => {
    mutedBtn.textContent = isMuted ? "Muted" : "Sound: on";
    mutedBtn.setAttribute("aria-pressed", String(isMuted));
  });

  store.subscribe(pv => {
    clockEl.textContent = clockOf(pv.shift.remainingTicks);
    clockEl.classList.toggle("low", pv.shift.remainingTicks < 1200);
    feesEl.textContent = `${pv.shift.feesCents}¢`;
    feesEl.classList.toggle("forfeit", pv.forfeited);
    rankEl.replaceChildren(
      el("strong", null, pv.rankTitle),
      el("span", { class: "doc-sub" }, ` · ch. ${pv.chapters} · ${pv.shift.resolved}/${pv.shift.total} ships`)
    );
    strikesEl.replaceChildren(
      ...[0, 1, 2].map(i => el("span", { class: "blot" + (i < pv.shift.strikes ? " used" : "") }))
    );
    factionEl.replaceChildren(
      ...FACTIONS.map(f =>
        el(
          "span",
          { class: "pip", title: `${f.label}: ${pv.factions[f.id]}` },
          el("span", { class: "pip-dot", style: `background:${f.color}` }),
          String(pv.factions[f.id])
        )
      )
    );
  });
}
