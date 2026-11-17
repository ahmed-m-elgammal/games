// ─────────────────────────────────────────────────────────────────────────────
// VIEW / documents — the DOM paperwork: Manifest, Registry, Rulebook, Tide
// Table. DOM-based, keyboard navigable, screen-reader friendly (spec §2.2).
// Reads the ViewModel; emits pin intents (seal, tide) and the registry overlay.
// ─────────────────────────────────────────────────────────────────────────────

import { PALETTE } from "../model/data/palette";
import { FLAG_MAP, HULL_MAP } from "../model/content";
import type { PortView } from "../viewmodel/port-view";
import { Signal, el, clockOf } from "../viewmodel/store";
import { hullPoints } from "./diorama";

export type TabId = "manifest" | "registry" | "rulebook" | "tides";
const TABS: { id: TabId; label: string }[] = [
  { id: "manifest", label: "Manifest" },
  { id: "registry", label: "Registry" },
  { id: "rulebook", label: "Rulebook" },
  { id: "tides", label: "Tide Table" }
];

export interface DocumentActions {
  pin: (partId: string, index: number | null) => void;
  setOverlay: (on: boolean) => void;
  onTab: () => void;
}

export function createDocuments(
  tabsEl: HTMLElement,
  panelEl: HTMLElement,
  store: Signal<PortView>,
  actions: DocumentActions
) {
  const active = new Signal<TabId>("manifest");
  let srNotes = "";

  // tabs
  const buttons = TABS.map(t => {
    const b = el("button", { class: "doc-tab", role: "tab", "data-tab": t.id, type: "button" }, t.label);
    b.addEventListener("click", () => {
      active.set(t.id);
      actions.onTab();
    });
    tabsEl.append(b);
    return b;
  });
  const paintTabs = (id: TabId) => {
    buttons.forEach(b => {
      const on = b.dataset.tab === id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
  };

  // ── panels ────────────────────────────────────────────────────────────────

  function sealSvg(pv: PortView): SVGSVGElement {
    const weight = pv.ship!.manifest.sealWeight;
    const heavy = weight === 2;
    const authority = pv.ship!.manifest.sealAuthority;
    const sw = heavy ? 4.2 : 1.6;
    const bleeds = pv.ship!.manifest.sealInkForged && pv.ship!.reagentApplied;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", "84");
    svg.setAttribute("height", "84");
    svg.setAttribute("class", "seal");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Seal of the ${authority}, drawn in the ${heavy ? "heavy" : "light"} hand` +
        (bleeds ? ". The ink bleeds under the reagent - forged." : ".")
    );
    const mk = (tag: string, attrs: Record<string, string>) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      svg.append(n);
      return n;
    };
    if (bleeds) {
      // forged ink blooms: the reagent reveal (spec §2.3, hidden channel)
      const blob = (cx: string, cy: string, r: string) =>
        mk("circle", { cx, cy, r, fill: PALETTE.danger, opacity: "0.4", class: "bleed" });
      blob("42", "38", "7");
      blob("62", "60", "9");
      blob("35", "66", "6");
    }
    mk("circle", { cx: "50", cy: "50", r: "40", fill: "none", stroke: PALETTE.ink, "stroke-width": String(sw) });
    mk("circle", { cx: "50", cy: "50", r: "30", fill: "none", stroke: PALETTE.ink, "stroke-width": String(heavy ? 2.6 : 1) });
    const text = mk("text", {
      x: "50", y: "55", "text-anchor": "middle",
      "font-size": heavy ? "15" : "13", fill: PALETTE.ink,
      "font-family": "Georgia, serif", "letter-spacing": "1"
    });
    text.textContent = authority.toUpperCase().slice(0, 3);
    return svg;
  }

  function renderManifest(pv: PortView): HTMLElement {
    const s = pv.ship!;
    const m = s.manifest;
    const wrap = el("div", { class: "doc manifest" });
    wrap.append(
      el("h3", null, `Manifest ${s.id.toUpperCase()} — ${s.captain}`),
      el("p", { class: "doc-sub" }, `Declared out of ${HULL_MAP.get(m.hull)!.name} class · fee on approval ${s.baseFee}¢`)
    );

    const table = el("table", { class: "doc-table" });
    table.append(el(
      "thead",
      null,
      el("tr", null, el("th", null, "Goods"), el("th", null, "Declared"), el("th", null, "Count"), el("th", null, "Mass (kg)"))
    ));
    const tbody = el("tbody");
    m.crates.forEach(c => {
      tbody.append(el(
        "tr",
        null,
        el("td", null, `${c.trade.charAt(0).toUpperCase() + c.trade.slice(1)} (${c.pattern})`),
        el("td", { class: "swatch-cell" }, swatch(c.trade)),
        el("td", null, String(c.count)),
        el("td", null, String(c.massKg))
      ));
    });
    table.append(tbody);
    wrap.append(table);

    // seal — a drawn visual claim, described for screen readers, clickable to pin
    const sealWrap = el("div", { class: "seal-row" });
    const seal = sealSvg(pv);
    seal.addEventListener("click", () => actions.pin("seal", null));
    seal.classList.add("pinnable");
    sealWrap.append(seal, el("p", { class: "doc-sub" }, "Seal of the customs league — click to pin"));
    wrap.append(sealWrap);

    const flag = FLAG_MAP.get(m.flag)!;
    wrap.append(
      el("p", null, `Flag declared: ${flag.name} (${flag.code})`),
      el(
        "p",
        null,
        `Tide window declared: ${clockOf(m.tideWindow[0])} – ${clockOf(m.tideWindow[1])}`
      )
    );

    if (m.searched) {
      const report = el("div", { class: "search-report" });
      if (m.foundUndeclared.length > 0) {
        report.append(
          el("p", { class: "bad" }, `Hold & Search — undeclared goods found: ${m.foundUndeclared.join(", ")}.`)
        );
      } else {
        report.append(el("p", null, "Hold & Search — tarps lifted. Nothing undeclared."));
      }
      wrap.append(report);
    }
    return wrap;
  }

  function swatch(trade: string): HTMLElement {
    const colors: Record<string, string> = {
      timber: PALETTE.timber, grain: PALETTE.grain, fish: PALETTE.fish,
      cloth: PALETTE.cloth, ore: PALETTE.ore, faith: PALETTE.faith, contraband: PALETTE.contraband
    };
    return el("span", { class: "swatch", style: `background:${colors[trade] ?? "transparent"}` });
  }

  function silhouetteCanvas(hull: string, bow: string, masts: number): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = 260; cv.height = 110;
    cv.className = "silhouette";
    cv.setAttribute("aria-label", `Registered silhouette: ${hull}, ${masts} masts, ${bow} bow`);
    const ctx = cv.getContext("2d")!;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    const pts = hullPoints(hull as never, bow as never);
    const len = 220, railPx = 52, ox = 20, oy = 30;
    ctx.beginPath();
    pts.forEach(([px, py], i) => {
      const x = ox + px * len, y = oy + py * railPx;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    const frac = masts === 1 ? [0.5] : masts === 2 ? [0.34, 0.68] : [0.28, 0.5, 0.72];
    ctx.lineWidth = 1.6;
    frac.forEach(f => {
      ctx.beginPath();
      ctx.moveTo(ox + f * len, oy + 2);
      ctx.lineTo(ox + f * len, oy - 26);
      ctx.stroke();
    });
    return cv;
  }

  function renderRegistry(pv: PortView): HTMLElement {
    const r = pv.ship!.registry;
    const wrap = el("div", { class: "doc registry" });
    wrap.append(
      el("h3", null, `Harbor Registry — ${pv.ship!.id.toUpperCase()}`),
      el("p", { class: "doc-sub" }, `Registered at ${r.port}`),
      silhouetteCanvas(r.hullClass, r.bow, r.masts),
      el("p", null, `Class: ${HULL_MAP.get(r.hullClass)!.name}`),
      el("p", null, `Masts: ${r.masts} · Bow: ${r.bow}`),
      el("p", { class: "doc-sub" }, "The registry prints the lawful silhouette. What docks must match what is written.")
    );
    const btn = el("button", { class: "ghost-btn", type: "button" }, "Overlay silhouette on the view");
    btn.addEventListener("click", () => {
      const on = !btn.classList.contains("on");
      btn.classList.toggle("on", on);
      actions.setOverlay(on);
    });
    wrap.append(btn);
    return wrap;
  }

  function renderRulebook(pv: PortView): HTMLElement {
    const wrap = el("div", { class: "doc rulebook" });
    wrap.append(el("h3", null, "The Rulebook"));
    pv.rulebook.forEach(ch => {
      if (!ch.unlocked) {
        wrap.append(
          el("div", { class: "rule-chapter locked" },
            el("h4", null, `Chapter ${ch.chapter}`),
            el("p", { class: "doc-sub" }, "Sealed by the Harbor Master. It reaches your desk as your career grows.")
          )
        );
        return;
      }
      const box = el("div", { class: "rule-chapter" }, el("h4", null, `Chapter ${ch.chapter}`));
      ch.rules.forEach(r => {
        box.append(el(
          "div",
          { class: "rule-card" },
          el("p", { class: "rule-statement" }, el("strong", null, `${r.label} `), r.statement),
          el("p", { class: "rule-verify" }, r.verify),
          el("p", { class: "rule-chips" }, `T${r.tier} · ${r.channel}`)
        ));
      });
      wrap.append(box);
    });
    return wrap;
  }

  function renderTides(pv: PortView): HTMLElement {
    const wrap = el("div", { class: "doc tides" });
    wrap.append(el("h3", null, "Tide Table — this shift"));
    const table = el("table", { class: "doc-table" });
    table.append(el(
      "thead", null,
      el("tr", null, el("th", null, "Ship"), el("th", null, "Declared window"), el("th", null, "Bell"))
    ));
    const tbody = el("tbody");
    pv.tideRows.forEach(row => {
      const tr = el("tr", { class: row.current ? "current" : "" },
        el("td", null, row.label),
        el("td", null, `${clockOf(row.window[0])} – ${clockOf(row.window[1])}`),
        el("td", null, row.arrived ? clockOf(row.arrivedAt) : "—")
      );
      if (row.current) {
        tr.classList.add("pinnable");
        tr.addEventListener("click", () => actions.pin("tide", null));
        tr.title = "Click to pin the tide as evidence";
      }
      tbody.append(tr);
    });
    table.append(tbody);
    wrap.append(table, el("p", { class: "doc-sub" }, "The arrival bell rings at a known time. Ships must dock inside their declared window."));
    return wrap;
  }

  const renderers: Record<TabId, (pv: PortView) => HTMLElement> = {
    manifest: renderManifest,
    registry: renderRegistry,
    rulebook: renderRulebook,
    tides: renderTides
  };

  let lastSig = "";

  store.subscribe(pv => {
    paintTabs(active.get());
    const tab = active.get();
    const needsShip = tab === "manifest" || tab === "registry";
    const sig = `${tab}|${pv.ship?.id ?? "none"}|${pv.ship?.manifest.searched}|${pv.ship?.reagentApplied}|${
      pv.ship?.manifest.sealWeight ?? ""
    }|${pv.chapters}|${pv.tideRows.map(r => `${r.shipId}${r.arrived ? 1 : 0}`).join("")}`;
    if (sig === lastSig) return;
    lastSig = sig;
    panelEl.replaceChildren();
    if (needsShip && !pv.ship) {
      panelEl.append(
        el("div", { class: "doc empty" },
          el("h3", null, "No ship at the desk"),
          el("p", { class: "doc-sub" }, "The next ship rides in on the tide. The rulebook is always open.")
        )
      );
      return;
    }
    panelEl.append(renderers[tab](pv));
    if (srNotes !== pv.notes) {
      srNotes = pv.notes;
      document.getElementById("sr-live")!.textContent = pv.notes;
    }
  });

  active.subscribe(() => {
    lastSig = "";
    store.set(store.get()); // force panel re-render on tab change
  });

  return {
    cycle(delta: number): void {
      const idx = TABS.findIndex(t => t.id === active.get());
      const next = TABS[(idx + delta + TABS.length) % TABS.length];
      active.set(next.id);
      actions.onTab();
    },
    tab: active
  };
}
