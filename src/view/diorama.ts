// ─────────────────────────────────────────────────────────────────────────────
// VIEW / diorama — the quay. Parametric ink ships drawn in code (no assets),
// exact part picking (this IS the inspection mechanic), pan/zoom, and the
// tool verbs: magnifier loupe, brass scale tooltip, lamp reveal.
// Reads only the ViewModel (PortView). Emits pin intents via callbacks.
// ─────────────────────────────────────────────────────────────────────────────

import { PALETTE } from "../model/data/palette";
import type { TradeDef, HullDef } from "../model/content";
import { FLAG_MAP, HULL_MAP, TRADE_MAP } from "../model/content";
import type { BowId, HullId, PatternId } from "../model/schema";
import type { DrawnShip, PortView, ShipView } from "../viewmodel/port-view";
import type { Signal } from "../viewmodel/store";

export interface Camera { x: number; y: number; zoom: number }
export type ToolActive = "magnifier" | "scale" | "none";

export interface PartRect { partId: string; index: number | null; x: number; y: number; w: number; h: number }

interface Env {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  view: PortView;
  cam: Camera;
  tool: ToolActive;
  overlay: boolean;
  tick: number;
  reducedMotion: boolean;
  rects: PartRect[] | null;
  scaleCrate: number | null;
}

// Bow nose variants continue each hull outline from its last point to the
// bow-top (y ≈ 0), then the path closes along the deck rail.
const BOW_NOSE: Record<BowId, [number, number][]> = {
  round: [[0.955, 0.3], [0.995, 0.12], [1.0, 0.0]],
  clipper: [[0.965, 0.22], [1.0, 0.1], [1.0, 0.0]],
  square: [[0.97, 0.45], [0.97, 0.08], [1.0, 0.04], [1.0, 0.0]]
};

const INK = PALETTE.ink;

export function hullPoints(hull: HullId, bow: BowId): [number, number][] {
  return [...HULL_MAP.get(hull)!.outline, ...BOW_NOSE[bow]];
}

function pathHull(env: Env, hull: HullId, bow: BowId, ox: number, oy: number, len: number, railPx: number, dash = false): void {
  const { ctx } = env;
  const pts = hullPoints(hull, bow);
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const x = ox + px * len;
    const y = oy + py * railPx;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  if (dash) ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── patterns: the colour-blind redundancy channel (spec §2.3) ────────────────

function drawPattern(env: Env, pattern: PatternId, x: number, y: number, w: number, h: number, alpha: number): void {
  const { ctx } = env;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = INK;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  switch (pattern) {
    case "wave":
      for (let row = 0; row < 2; row++) {
        const cy = y + h * (0.3 + row * 0.42);
        for (let sx = -1; sx < 3; sx++) {
          ctx.moveTo(x + sx * w * 0.5 + w * 0.1, cy);
          ctx.bezierCurveTo(
            x + sx * w * 0.5 + w * 0.28, cy - h * 0.16,
            x + sx * w * 0.5 + w * 0.42, cy + h * 0.16,
            x + sx * w * 0.5 + w * 0.6, cy
          );
        }
      }
      break;
    case "rings":
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.22, h * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.34, h * 0.4, 0, 0, Math.PI * 2);
      break;
    case "dots": {
      for (let ix = 0; ix < 3; ix++)
        for (let iy = 0; iy < 2; iy++) {
          const dx = x + w * (0.22 + ix * 0.28);
          const dy = y + h * (0.3 + iy * 0.4);
          ctx.moveTo(dx + 1.6, dy);
          ctx.arc(dx, dy, 1.6, 0, Math.PI * 2);
        }
      break;
    }
    case "cross": {
      const cx = x + w / 2, cy = y + h / 2;
      ctx.moveTo(cx - w * 0.24, cy); ctx.lineTo(cx + w * 0.24, cy);
      ctx.moveTo(cx, cy - h * 0.24); ctx.lineTo(cx, cy + h * 0.24);
      break;
    }
    case "diagonal":
      for (let i = -1; i < 3; i++) {
        const sx = x + i * w * 0.34;
        ctx.moveTo(sx, y + h);
        ctx.lineTo(sx + w * 0.4, y);
      }
      break;
    case "chevron": {
      const cy = y + h * 0.5;
      for (let row = -1; row <= 1; row += 2) {
        ctx.moveTo(x + w * 0.24, cy + row * h * 0.16);
        ctx.lineTo(x + w * 0.5, cy);
        ctx.lineTo(x + w * 0.76, cy + row * h * 0.16);
      }
      break;
    }
    case "none":
      break;
  }
  ctx.stroke();
  ctx.restore();
}

// ── main render ──────────────────────────────────────────────────────────────

export interface DioramaOpts {
  cam: Signal<Camera>;
  tool: Signal<ToolActive>;
  overlay: Signal<boolean>;
  scaleCrate: Signal<number | null>;
  reducedMotion: boolean;
  onPin: (partId: string, index: number | null) => void;
}

export function createDiorama(canvas: HTMLCanvasElement, opts: DioramaOpts) {
  const state = {
    pointer: { x: 0, y: 0, down: false, dragged: false, lastX: 0, lastY: 0 }
  };
  let lastRects: PartRect[] = [];

  // ── input: pan / zoom / pinch / pick ───────────────────────────────────────
  canvas.addEventListener("pointerdown", ev => {
    canvas.setPointerCapture(ev.pointerId);
    state.pointer = { ...state.pointer, x: ev.offsetX, y: ev.offsetY, down: true, dragged: false, lastX: ev.offsetX, lastY: ev.offsetY };
  });
  canvas.addEventListener("pointermove", ev => {
    const p = state.pointer;
    p.x = ev.offsetX; p.y = ev.offsetY;
    if (!p.down) return;
    const dx = ev.offsetX - p.lastX;
    const dy = ev.offsetY - p.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) p.dragged = true;
    if (!opts.reducedMotion || true) {
      const cam = opts.cam.get();
      opts.cam.set({ ...cam, x: cam.x + dx, y: cam.y + dy });
    }
    p.lastX = ev.offsetX; p.lastY = ev.offsetY;
  });
  canvas.addEventListener("pointerup", ev => {
    const p = state.pointer;
    p.down = false;
    if (!p.dragged) {
      const hit = hitTest(lastRects, ev.offsetX, ev.offsetY);
      if (hit) opts.onPin(hit.partId, hit.index);
    }
  });
  canvas.addEventListener("wheel", ev => {
    ev.preventDefault();
    const cam = opts.cam.get();
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    const zoom = Math.max(0.5, Math.min(4.5, cam.zoom * factor));
    // zoom toward cursor
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height * 0.62;
    const wx = (ev.offsetX - cx - cam.x) / cam.zoom;
    const wy = (ev.offsetY - cy - cam.y) / cam.zoom;
    opts.cam.set({ zoom, x: ev.offsetX - cx - wx * zoom, y: ev.offsetY - cy - wy * zoom });
  }, { passive: false });

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const hitTest = (rects: PartRect[], x: number, y: number): PartRect | null => {
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  };

  const render = (view: PortView, tick: number) => {
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(0, 0, W, H);
    const rects: PartRect[] = [];
    const env: Env = {
      ctx, W, H, view, cam: opts.cam.get(), tool: opts.tool.get(), overlay: opts.overlay.get(),
      tick, reducedMotion: opts.reducedMotion, rects, scaleCrate: opts.scaleCrate.get()
    };
    scene(env, true);
    lastRects = rects;

    // magnifier loupe
    if (env.tool === "magnifier" && state.pointer.down) {
      const R = 78;
      ctx.save();
      ctx.beginPath();
      ctx.arc(state.pointer.x, state.pointer.y, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(state.pointer.x - R, state.pointer.y - R, R * 2, R * 2);
      const cam = env.cam;
      const zoomed: Camera = { x: 0, y: 0, zoom: cam.zoom * 2.2 };
      // center the loupe on the same world point under the pointer
      const cx = W / 2, cy = H * 0.62;
      zoomed.x = state.pointer.x - cx - ((state.pointer.x - cx - cam.x) / cam.zoom) * zoomed.zoom;
      zoomed.y = state.pointer.y - cy - ((state.pointer.y - cy - cam.y) / cam.zoom) * zoomed.zoom;
      const lenv: Env = { ...env, cam: zoomed, rects: null };
      scene(lenv, true);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(state.pointer.x, state.pointer.y, R, 0, Math.PI * 2);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath();
      ctx.arc(state.pointer.x, state.pointer.y, R + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
    }
    return lastRects;
  };

  const hitNow = (x: number, y: number) => hitTest(lastRects, x, y);

  return { render, hitNow, resize, canvas };
}

// ── scene composition ────────────────────────────────────────────────────────

function scene(env: Env, withShip: boolean): void {
  const { ctx, W, H, view, cam, tick, reducedMotion } = env;
  const bob = reducedMotion ? 0 : Math.sin(tick * 0.05) * 2.2;

  water(env, bob);
  quay(env, bob);

  if (withShip && view.ship) {
    drawShip(env, view.ship, bob);
  } else if (withShip) {
    env.ctx.fillStyle = INK;
    env.ctx.globalAlpha = 0.45;
    env.ctx.font = "italic 15px Georgia, serif";
    env.ctx.textAlign = "center";
    env.ctx.fillText("waiting on the tide…", W / 2, H * 0.5);
    env.ctx.globalAlpha = 1;
  }
  gulls(env, tick, reducedMotion);
}

function water(env: Env, bob: number): void {
  const { ctx, W, H } = env;
  const y = H * 0.62;
  ctx.strokeStyle = PALETTE.water;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, y + bob);
  ctx.lineTo(W, y + bob);
  ctx.stroke();
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1;
  for (let row = 1; row <= 4; row++) {
    const ry = y + 12 * row + bob * 0.4;
    ctx.beginPath();
    for (let x = (row % 2) * 18; x < W; x += 46) {
      ctx.moveTo(x, ry);
      ctx.lineTo(x + 22, ry);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function quay(env: Env, bob: number): void {
  const { ctx, W, H } = env;
  const waterY = H * 0.62;
  const edgeX = W * 0.12;
  const topY = waterY - 74 + bob;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, topY);
  ctx.lineTo(edgeX, topY);
  ctx.moveTo(edgeX, topY);
  ctx.lineTo(edgeX, H);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 4; i++) {
    const by = topY + 8 + i * 16;
    ctx.beginPath();
    ctx.moveTo(0, by);
    ctx.lineTo(edgeX - 4, by);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // bollard + mooring rope
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(edgeX - 14, topY);
  ctx.lineTo(edgeX - 14, topY - 16);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(edgeX - 14, topY - 15);
  ctx.quadraticCurveTo(edgeX + 30, topY + 6, edgeX + 70, topY + 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function mastPositions(count: 1 | 2 | 3): number[] {
  if (count === 1) return [0.5];
  if (count === 2) return [0.34, 0.68];
  return [0.28, 0.5, 0.72];
}

function drawShip(env: Env, ship: ShipView, bob: number): void {
  const { ctx, W, H, cam, overlay, rects, tick } = env;
  const hull = HULL_MAP.get(ship.drawn.hull)!;
  const unit = ((W * 0.62) / 170) * cam.zoom;
  const len = hull.length * unit;
  const railPx = hull.railHeight * unit;
  const waterY = H * 0.62;
  const keelY = waterY + railPx * 0.28 + cam.y + bob;
  const topY = keelY - railPx;
  const ox = W / 2 - len / 2 + cam.x + W * 0.06;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // hull fill + contour
  const pts = hullPoints(ship.drawn.hull, ship.drawn.bow);
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const x = ox + px * len;
    const y = topY + py * railPx;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(28,26,23,0.045)";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // planks (light hand)
  ctx.lineWidth = 1.1;
  ctx.globalAlpha = 0.35;
  for (let i = 1; i <= 3; i++) {
    const py = i / 3.6;
    ctx.beginPath();
    ctx.moveTo(ox + 0.06 * len, topY + py * railPx);
    ctx.quadraticCurveTo(ox + len * 0.5, topY + (py + 0.06) * railPx, ox + len * 0.9, topY + py * railPx);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // keel
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ox + len * 0.28, keelY - 1);
  ctx.lineTo(ox + len * 0.7, keelY - 1);
  ctx.stroke();

  // hull + bow part rects (picking — bow checked before the full-hull bbox)
  rects?.push({ partId: "bow", index: null, x: ox + len * 0.86, y: topY - 6, w: len * 0.15, h: railPx + 6 });
  rects?.push({ partId: "hull", index: null, x: ox, y: topY, w: len, h: railPx });

  // erasure ghost (lamp reveals)
  if (ship.drawn.erasure === "hull") {
    const gx = ox + len * 0.4, gy = topY + railPx * 0.55;
    ctx.save();
    ctx.globalAlpha = ship.lampApplied ? 0.62 : 0.07;
    ctx.strokeStyle = ship.lampApplied ? PALETTE.danger : INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      ctx.moveTo(gx + i * 9, gy - 8 + (i % 3) * 6);
      ctx.lineTo(gx + i * 9 + 14, gy - 2 + (i % 2) * 8);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    // faint nothing — lamp sweep shows clean lines
  }

  // warship gun ports
  if (ship.drawn.hull === "warship") {
    ctx.fillStyle = INK;
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.75;
      ctx.fillRect(ox + len * (0.3 + i * 0.13), topY + railPx * 0.52, unit * 3.2, unit * 2.4);
    }
    ctx.globalAlpha = 1;
  }

  // masts + sails
  const mastH = railPx * (1.35 + (ship.drawn.hull === "warship" ? 0.35 : 0.15));
  const positions = mastPositions(ship.drawn.masts);
  let flagRect: PartRect | null = null;
  positions.forEach((f, mi) => {
    const mx = ox + f * len;
    const isLast = mi === positions.length - 1;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(mx, topY + 2);
    ctx.lineTo(mx, topY - mastH);
    ctx.stroke();
    if (hull.sail === "square") {
      ctx.lineWidth = 1.1;
      const yardY = topY - mastH * 0.52;
      ctx.beginPath();
      ctx.moveTo(mx - unit * 11, yardY);
      ctx.lineTo(mx + unit * 11, yardY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - unit * 10, yardY);
      ctx.quadraticCurveTo(mx, yardY + unit * 9, mx + unit * 10, yardY);
      ctx.quadraticCurveTo(mx, yardY + unit * 6, mx - unit * 10, yardY);
      ctx.fillStyle = "rgba(28,26,23,0.05)";
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(mx, topY - mastH * 0.85);
      ctx.lineTo(mx - unit * 12, topY - mastH * 0.1);
      ctx.lineTo(mx + unit * 3, topY - mastH * 0.12);
      ctx.closePath();
      ctx.fillStyle = "rgba(28,26,23,0.05)";
      ctx.fill();
      ctx.stroke();
    }
    rects?.push({ partId: "masts", index: null, x: mx - 7, y: topY - mastH, w: 14 + unit * 20, h: mastH + 4 });

    if (isLast) {
      // pennant flag
      const flag = FLAG_MAP.get(ship.drawn.flag)!;
      const fy = topY - mastH;
      ctx.beginPath();
      ctx.moveTo(mx, fy);
      ctx.lineTo(mx - unit * 8, fy + unit * 2.2);
      ctx.lineTo(mx, fy + unit * 4.4);
      ctx.closePath();
      ctx.fillStyle = flag.color;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      flagRect = { partId: "flag", index: null, x: mx - unit * 9, y: fy - 4, w: unit * 10, h: unit * 7 };
      rects?.push(flagRect);
    }
  });

  // crates
  const slots = Math.max(hull.holdSlots, ship.drawn.crates.length);
  const deckX0 = ox + len * 0.16;
  const deckW = len * 0.7;
  const slotW = deckW / slots;
  const crateH = railPx * 0.42;
  ship.drawn.crates.forEach((c, i) => {
    const cx = deckX0 + i * slotW + slotW * 0.12;
    const cw = slotW * 0.76;
    const cy = topY - crateH;
    let trade: TradeDef | null = null;
    if (c.visibleTrade !== null) trade = TRADE_MAP.get(c.visibleTrade)!;

    if (c.tarpClosed) {
      ctx.beginPath();
      ctx.moveTo(cx - 2, topY);
      ctx.quadraticCurveTo(cx + cw * 0.5, topY - crateH * 1.7, cx + cw + 2, topY);
      ctx.closePath();
      ctx.fillStyle = PALETTE.tarp;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(cx + cw * 0.5, topY - crateH * 1.55);
      ctx.lineTo(cx + cw * 0.5, topY);
      ctx.moveTo(cx + cw * 0.18, topY - crateH * 0.95);
      ctx.lineTo(cx + cw * 0.82, topY - crateH * 0.95);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = trade ? trade.color : "rgba(28,26,23,0.08)";
      ctx.fillRect(cx, cy, cw, crateH);
      if (trade) drawPattern(env, trade.pattern, cx, cy, cw, crateH, 0.55);
      // tally marks = declared-style count on the crate face
      if (c.count !== null) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        const n = Math.min(c.count, 9);
        for (let t = 0; t < n; t++) {
          const tx = cx + 3 + t * (cw - 6) / Math.max(1, n - 1 || 1);
          ctx.moveTo(tx, cy + crateH - 4);
          ctx.lineTo(tx, cy + crateH - 10);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, cw, crateH);
      if (c.tarpFolded) {
        ctx.beginPath();
        ctx.moveTo(cx - 2, topY);
        ctx.lineTo(cx + cw * 0.4, topY - crateH * 0.5);
        ctx.lineTo(cx + cw * 0.5, topY);
        ctx.closePath();
        ctx.fillStyle = PALETTE.tarp;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    rects?.push({ partId: "crate", index: i, x: cx - 3, y: cy - 6, w: cw + 6, h: crateH + 8 });
  });

  // registry silhouette overlay
  if (overlay) {
    ctx.strokeStyle = PALETTE.info;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.85;
    pathHull(env, ship.registry.hullClass, ship.registry.bow, ox, topY, len, railPx, true);
    ctx.globalAlpha = 1;
  }

  // smoke for powered hulls
  if (hull.smoke && !env.reducedMotion) {
    for (let i = 0; i < 3; i++) {
      const t = ((tick * 0.35 + i * 40) % 120) / 120;
      const sx = ox + len * 0.22;
      const sy = topY - railPx * 0.8 - t * 46;
      ctx.globalAlpha = 0.16 * (1 - t);
      ctx.beginPath();
      ctx.arc(sx + t * 10, sy, 3 + t * 7, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // pins: red rough circles
  for (const pin of ship.pins) {
    const key = `${pin.partId}:${pin.index}`;
    const rect = rects?.find(r => `${r.partId}:${r.index}` === key);
    if (!rect) continue;
    roughEllipse(env, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2 + 5, rect.h / 2 + 5, tick);
  }
}

function roughEllipse(env: Env, cx: number, cy: number, rx: number, ry: number, tick: number): void {
  const { ctx } = env;
  const wobble = (i: number) => Math.sin(tick * 0.1 + i * 2.1) * 1.4;
  ctx.strokeStyle = PALETTE.danger;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = cx + Math.cos(a) * (rx + wobble(i));
    const y = cy + Math.sin(a) * (ry + wobble(i + 5));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - rx * 0.7, cy - ry * 0.7, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.danger;
  ctx.fill();
}

function gulls(env: Env, tick: number, reducedMotion: boolean): void {
  const { ctx, W, H } = env;
  const drift = reducedMotion ? 0 : tick * 0.22;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 3; i++) {
    const gx = ((drift + i * 180) % (W + 80)) - 40;
    const gy = H * 0.16 + i * 26 + Math.sin(tick * 0.06 + i) * (reducedMotion ? 0 : 4);
    const flap = Math.sin(tick * 0.12 + i * 1.7) * 3;
    ctx.beginPath();
    ctx.moveTo(gx - 7, gy - 3 + flap);
    ctx.quadraticCurveTo(gx - 2, gy + 2, gx, gy);
    ctx.quadraticCurveTo(gx + 2, gy + 2, gx + 7, gy - 3 + flap);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Shared ship renderer for verdict cards (offscreen, on demand only). */
export function drawMiniShip(ctx: CanvasRenderingContext2D, drawn: DrawnShip, x: number, y: number, w: number, h: number, searched: boolean): void {
  const hull = HULL_MAP.get(drawn.hull)!;
  const len = w;
  const railPx = Math.min(h * 0.62, hull.railHeight * (len / hull.length));
  const topY = y;
  const keelY = topY + railPx;
  const pts = hullPoints(drawn.hull, drawn.bow);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const px2 = x + px * len;
    const py2 = topY + py * railPx;
    if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(28,26,23,0.05)";
  ctx.fill();
  ctx.stroke();
  mastPositions(drawn.masts).forEach((f, mi) => {
    const mx = x + f * len;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, topY + 2);
    ctx.lineTo(mx, topY - h * 0.55);
    ctx.stroke();
    void mi;
  });
  const slots = Math.max(hull.holdSlots, drawn.crates.length);
  const slotW = (len * 0.7) / slots;
  drawn.crates.forEach((c, i) => {
    const cx = x + len * 0.16 + i * slotW + slotW * 0.12;
    const cw = slotW * 0.76;
    const cy = topY - railPx * 0.4;
    if (c.tarpClosed && !searched) {
      ctx.beginPath();
      ctx.moveTo(cx - 2, topY);
      ctx.quadraticCurveTo(cx + cw / 2, topY - railPx * 0.72, cx + cw + 2, topY);
      ctx.closePath();
      ctx.fillStyle = PALETTE.tarp;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.stroke();
      return;
    }
    const trade = c.visibleTrade !== null ? TRADE_MAP.get(c.visibleTrade) : null;
    if (trade) {
      ctx.fillStyle = trade.color;
      ctx.fillRect(cx, cy, cw, railPx * 0.4);
    }
    ctx.lineWidth = 1.8;
    ctx.strokeRect(cx, cy, cw, railPx * 0.4);
  });
}

export type { HullDef };
