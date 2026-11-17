// ─────────────────────────────────────────────────────────────────────────────
// VIEW / verdict-bar — four stamps pinned bottom (spec §2.2). Each stamp
// animates onto the manifest with a thud and ink splatter. Keyboard A/D/H/F.
// ─────────────────────────────────────────────────────────────────────────────

import type { PortView } from "../viewmodel/port-view";
import type { Verdict } from "../model/schema";
import type { Signal } from "../viewmodel/store";
import { el } from "../viewmodel/store";

export interface VerdictActions {
  onVerdict: (v: Verdict) => void;
}

const STAMPS: { verdict: Verdict; key: string; label: string; sub: string; cls: string }[] = [
  { verdict: "approve", key: "A", label: "Approve", sub: "honest paper", cls: "approve" },
  { verdict: "deny", key: "D", label: "Deny", sub: "the lie stands", cls: "deny" },
  { verdict: "search", key: "H", label: "Hold & Search", sub: "−45s", cls: "search" },
  { verdict: "fine", key: "F", label: "Fine", sub: "×3 fee", cls: "fine" }
];

const STAMP_WORDS: Record<Verdict, string> = {
  approve: "APPROVED",
  deny: "DENIED",
  fine: "FINED",
  search: "SEARCHED"
};

export function createVerdictBar(
  barEl: HTMLElement,
  overlayEl: HTMLElement,
  bannerEl: HTMLElement,
  store: Signal<PortView>,
  actions: VerdictActions
) {
  const buttons = STAMPS.map(s => {
    const b = el(
      "button",
      { class: `stamp stamp-${s.cls}`, type: "button", "data-key": s.key, title: `${s.label} (${s.key})` },
      el("span", { class: "stamp-letter" }, s.key),
      el("span", { class: "stamp-label" }, s.label),
      el("span", { class: "stamp-sub" }, s.sub)
    );
    b.addEventListener("click", () => actions.onVerdict(s.verdict));
    barEl.append(b);
    return b;
  });

  store.subscribe(pv => {
    const live = pv.ship !== null && pv.status === "running";
    buttons.forEach(b => (b.disabled = !live));
    if (!live) barEl.classList.add("idle");
    else barEl.classList.remove("idle");
  });

  // stamp overlay animation onto the manifest
  function stampAnim(verdict: Verdict): void {
    overlayEl.hidden = false;
    overlayEl.className = `stamp-overlay show ${STAMPS.find(s => s.verdict === verdict)!.cls}`;
    overlayEl.textContent = STAMP_WORDS[verdict];
    overlayEl.animate(
      [
        { transform: "scale(2.1) rotate(-14deg)", opacity: 0 },
        { transform: "scale(1) rotate(-8deg)", opacity: 1, offset: 0.45 },
        { transform: "scale(1) rotate(-8deg)", opacity: 1, offset: 0.8 },
        { transform: "scale(1) rotate(-8deg)", opacity: 0 }
      ],
      { duration: 900, easing: "cubic-bezier(.2,.8,.2,1)" }
    ).onfinish = () => {
      overlayEl.hidden = true;
      overlayEl.className = "stamp-overlay";
    };
  }

  // result banner driven by the ViewModel's lastResult
  let lastSig = "";
  store.subscribe(pv => {
    const lr = pv.lastResult;
    const sig = lr ? `${lr.shipId}:${lr.result.verdict}:${lr.result.correct}:${pv.shift.strikes}` : "";
    if (sig === lastSig) return;
    lastSig = sig;
    if (!lr) {
      bannerEl.replaceChildren();
      bannerEl.hidden = true;
      return;
    }
    bannerEl.hidden = false;
    const r = lr.result;
    const good = r.correct;
    let text: string;
    if (r.ruleId !== null && good) {
      text = r.discovered
        ? `Caught red-handed — ${lr.statement ?? "the lie"} (+${r.feeCents}¢)`
        : `Correct stamp, never pinned — +${r.feeCents}¢`;
    } else if (good) {
      text = `Honest ship approved (+${r.feeCents}¢)`;
    } else {
      text = `Strike ${pv.shift.strikes}/${3} — ${
        r.ruleId !== null ? "the forgery slipped past your stamp" : "that ship was honest"
      }`;
    }
    bannerEl.replaceChildren(
      el("div", { class: `banner ${good ? "good" : "bad"}` },
        el("strong", null, `${lr.captain} — ${STAMP_WORDS[r.verdict]}`),
        el("p", null, text)
      )
    );
  });

  return { stampAnim };
}
