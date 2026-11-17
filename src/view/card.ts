// ─────────────────────────────────────────────────────────────────────────────
// VIEW / card — the shareable verdict card (spec §2.9). Offscreen-rendered in
// the same drawing code, on demand only. "The port remembers."
// ─────────────────────────────────────────────────────────────────────────────

import { PALETTE } from "../model/data/palette";
import { HULL_MAP } from "../model/content";
import type { CardView } from "../viewmodel/port-view";
import { drawMiniShip } from "./diorama";
import { el } from "../viewmodel/store";

const W = 720;
const H = 920;

export function renderCard(card: CardView): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;

  // paper
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(34, 34, W - 68, H - 68);

  const ink = PALETTE.ink;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";

  ctx.font = "700 44px Georgia, serif";
  ctx.fillText("INKLINE CUSTOMS", W / 2, 110);
  ctx.font = "italic 20px Georgia, serif";
  ctx.fillText("Verdict Card", W / 2, 146);

  // verdict stamp
  ctx.save();
  ctx.translate(W / 2, 225);
  ctx.rotate(-0.12);
  const good = card.won;
  ctx.strokeStyle = good ? PALETTE.crown : PALETTE.danger;
  ctx.fillStyle = good ? PALETTE.crown : PALETTE.danger;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "800 30px Georgia, serif";
  ctx.fillText(good ? "SHIFT" : "SHIFT", 0, -30);
  ctx.font = "800 40px Georgia, serif";
  ctx.fillText(good ? "WON" : "LOST", 0, 22);
  ctx.font = "600 16px Georgia, serif";
  ctx.fillText(good ? "the port remembers" : "fees forfeit", 0, 52);
  ctx.restore();

  // stats
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.font = "24px Georgia, serif";
  const rows: [string, string][] = [
    ["Fees", card.forfeited ? `${card.fees}¢ (forfeited)` : `${card.fees}¢`],
    ["Ships resolved", `${card.resolved} / ${card.total}`],
    ["Forgeries caught", `${card.caught}`],
    ["Caught red-handed", `${card.discovered}`],
    ["Evidence pins", `${card.pinsCorrect} / ${card.pinsMade}`]
  ];
  let y = 350;
  ctx.strokeStyle = "rgba(28,26,23,0.4)";
  ctx.lineWidth = 1;
  for (const [k, v] of rows) {
    ctx.fillText(k, 90, y);
    ctx.textAlign = "right";
    ctx.fillText(v, W - 90, y);
    ctx.textAlign = "left";
    ctx.beginPath();
    ctx.moveTo(90, y + 10);
    ctx.lineTo(W - 90, y + 10);
    ctx.stroke();
    y += 42;
  }

  // best catch
  ctx.font = "italic 20px Georgia, serif";
  ctx.textAlign = "center";
  if (card.bestCatch) {
    ctx.fillText("Best catch of the shift", W / 2, 558);
    const shipW = 340, shipX = W / 2 - shipW / 2, shipY = 592;
    drawMiniShip(ctx, card.bestCatch.drawn, shipX, shipY, shipW, 92, true);
    // red ink circle on the lie
    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, 634, 122, 58, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "700 22px Georgia, serif";
    ctx.fillStyle = PALETTE.danger;
    ctx.fillText(`${card.bestCatch.captain}`, W / 2, 714);
    wrapText(ctx, card.bestCatch.statement, W / 2, 742, W - 220, 24, PALETTE.ink, "17px Georgia, serif");
  } else {
    ctx.fillText("No forgeries caught — the tide was honest.", W / 2, 590);
  }

  // footer
  ctx.font = "italic 16px Georgia, serif";
  ctx.fillStyle = "rgba(28,26,23,0.7)";
  ctx.fillText("Every ship lies. The ink tells the truth.", W / 2, 852);
  ctx.font = "14px Georgia, serif";
  ctx.fillText(`seed: ${card.seed}`, W / 2, 882);

  return cv;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lineH: number,
  color: string,
  font: string
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  ctx.textAlign = "center";
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

export function showCardDialog(
  dialog: HTMLDialogElement,
  card: CardView,
  actions: { onDownload: (cv: HTMLCanvasElement) => void; onCopySeed: (seed: string) => void; onNextShift: () => void }
): void {
  const canvas = renderCard(card);
  const wrap = el("div", { class: "card-dialog" });
  const btns = el("div", { class: "card-actions" });
  const dl = el("button", { class: "ghost-btn", type: "button" }, "Download PNG");
  dl.addEventListener("click", () => actions.onDownload(canvas));
  const cp = el("button", { class: "ghost-btn", type: "button" }, "Copy seed");
  cp.addEventListener("click", () => actions.onCopySeed(card.seed));
  const next = el("button", { class: "primary-btn", type: "button" }, "Begin next shift");
  next.addEventListener("click", () => {
    dialog.close();
    actions.onNextShift();
  });
  btns.append(dl, cp, next);
  wrap.append(canvas, btns);
  dialog.replaceChildren(wrap);
  if (!dialog.open) dialog.showModal();
}
