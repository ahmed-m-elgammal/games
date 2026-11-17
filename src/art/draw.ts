/** Low-level drawing helpers for Moonpetal's procedural art. */
export type Ctx = CanvasRenderingContext2D;

export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Soft radial glow blob. */
export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 0.55): void {
  const g = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.42));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Solid orb with top-left highlight — the base of most items/creatures. */
export function orb(ctx: Ctx, x: number, y: number, r: number, color: string, deep?: string): void {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.15, x, y, r);
  g.addColorStop(0, lighten(color, 0.22));
  g.addColorStop(0.65, color);
  g.addColorStop(1, deep ?? darken(color, 0.18));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function lighten(hex: string, amt: number): string {
  return mix(hex, '#ffffff', amt);
}
export function darken(hex: string, amt: number): string {
  return mix(hex, '#0a0820', amt);
}
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16);
  const pb = parseInt(b.replace('#', ''), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** Leaf/petal shape pointing at `ang` (radians), length len, half-width wid. */
export function petal(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, fill: string, stroke?: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, wid * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

export function starShape(ctx: Ctx, x: number, y: number, r: number, points: number, inner: number, fill: string): void {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/** Sleepy closed eyes + tiny mouth + blush. The signature Moonpetal face. */
export function sleepyFace(
  ctx: Ctx, x: number, y: number, s: number,
  color = 'rgba(20,14,40,0.85)',
  blushColor = 'rgba(255,150,150,0.4)',
  t = 0
): void {
  // closed eyes: two downward arcs; occasionally a slow "blink peek" (open) — keep closed for coziness
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.lineCap = 'round';
  const gap = s * 0.34;
  const eyeR = s * 0.17;
  ctx.beginPath();
  ctx.arc(x - gap, y, eyeR, Math.PI * 0.15, Math.PI * 0.85, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + gap, y, eyeR, Math.PI * 0.15, Math.PI * 0.85, false);
  ctx.stroke();
  // tiny mouth (gentle wobble over time)
  const wob = Math.sin(t * 1.6) * s * 0.012;
  ctx.beginPath();
  ctx.arc(x, y + s * 0.16, s * 0.1, Math.PI * 0.1, Math.PI * 0.9, false);
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.stroke();
  // blush
  ctx.fillStyle = blushColor;
  ctx.beginPath();
  ctx.ellipse(x - gap - s * 0.2, y + s * 0.14, s * 0.11, s * 0.07, 0, 0, Math.PI * 2);
  ctx.ellipse(x + gap + s * 0.2, y + s * 0.14, s * 0.11, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Curled sleeping "z" — drawn faintly. */
export function zzz(ctx: Ctx, x: number, y: number, s: number, t: number, color = 'rgba(255,240,210,0.5)'): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.1);
  ctx.lineCap = 'round';
  const phase = (t * 0.5) % 1;
  ctx.globalAlpha = 0.9 - phase * 0.5;
  const yy = y - phase * s * 0.8;
  const zz = s * (0.14 + phase * 0.1);
  drawZ(ctx, x, yy, zz);
  drawZ(ctx, x + zz * 1.5, yy - zz * 1.6, zz * 0.7);
  ctx.restore();
}
function drawZ(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.7, y);
  ctx.lineTo(x + s * 0.7, y);
  ctx.lineTo(x - s * 0.7, y + s);
  ctx.lineTo(x + s * 0.7, y + s);
  ctx.stroke();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Sparkle: 4-point cross star. */
export function sparkle(ctx: Ctx, x: number, y: number, r: number, color = '#fff6d8', alpha = 0.9): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, r * 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
  ctx.stroke();
  ctx.restore();
}
