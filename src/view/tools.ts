// ─────────────────────────────────────────────────────────────────────────────
// VIEW / tools — unlockable inspector verbs (spec §2.2). Tools are verbs, not
// stats: magnifier + scale toggle view modes; reagent + lamp are applied to the
// current ship through the edit queue.
// ─────────────────────────────────────────────────────────────────────────────

import type { PortView } from "../viewmodel/port-view";
import type { ToolId } from "../model/schema";
import type { Signal } from "../viewmodel/store";
import { el } from "../viewmodel/store";
import type { ToolActive } from "./diorama";

export interface ToolActions {
  onSelect: (tool: ToolId) => void;
  onApply: (tool: ToolId) => void;
}

const TOOL_META: Record<ToolId, { label: string; hint: string; rank: number }> = {
  magnifier: { label: "Magnifier", hint: "Loupe: press and hold on the drawing (zoom + faint-line reveal)", rank: 0 },
  scale: { label: "Brass Scale", hint: "Hover a crate to weigh it against the manifest", rank: 1 },
  reagent: { label: "Ink Reagent", hint: "Wet the page — forged ink bleeds", rank: 2 },
  lamp: { label: "Lamp", hint: "Night sweep — reveals erased-and-redrawn lines", rank: 3 }
};

export function createTools(
  trayEl: HTMLElement,
  store: Signal<PortView>,
  active: Signal<ToolActive>,
  actions: ToolActions
) {
  const buttons = new Map<ToolId, HTMLButtonElement>();
  (Object.keys(TOOL_META) as ToolId[]).forEach(id => {
    const meta = TOOL_META[id];
    const b = el("button", { class: "tool-btn", type: "button", title: meta.hint, "data-tool": id }, meta.label);
    b.addEventListener("click", () => {
      if (!store.get().tools.includes(id)) return;
      if (id === "magnifier") {
        active.set(active.get() === "magnifier" ? "none" : "magnifier");
        actions.onSelect("magnifier");
      } else if (id === "scale") {
        active.set(active.get() === "scale" ? "none" : "scale");
        actions.onSelect("scale");
      } else {
        actions.onApply(id);
      }
    });
    buttons.set(id, b);
    trayEl.append(b);
  });

  store.subscribe(pv => {
    buttons.forEach((b, id) => {
      const owned = pv.tools.includes(id);
      b.classList.toggle("locked", !owned);
      b.disabled = !owned || pv.ship === null || pv.status !== "running";
      if (!owned) b.title = `${TOOL_META[id].hint} — unlocks with rank`;
    });
  });

  active.subscribe(t => {
    buttons.forEach((b, id) => {
      const on = (id === "magnifier" && t === "magnifier") || (id === "scale" && t === "scale");
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  });
}
