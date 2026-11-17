/**
 * Procedural item sprites, pre-rendered to offscreen canvases for 60fps.
 * Each of the 11 tiers gets a distinct silhouette (colorblind-safe) + sleepy face.
 * Variants (gold/silver) recolor and add shimmer.
 */
import { CHAINS, ChainId, Variant } from '../data/chains';
import { Ctx, glow, orb, petal, sleepyFace, sparkle, starShape, rgba, darken, lighten } from './draw';

const cache = new Map<string, HTMLCanvasElement>();

interface Pal {
  c: string; g: string; d: string;
}

function variantPal(base: Pal, variant: Variant): Pal {
  if (variant === 'gold') return { c: '#ffd76e', g: '#ffb64a', d: '#c98f2e' };
  if (variant === 'silver') return { c: '#e6ecfa', g: '#b9c8e8', d: '#8fa3c8' };
  return base;
}

export function itemSpriteKey(chain: ChainId, tier: number, variant: Variant): string {
  return `${chain}:${tier}:${variant}`;
}

/** Get (and lazily build) the sprite for an item. `px` = rendered size in device px. */
export function getItemSprite(chain: ChainId, tier: number, variant: Variant, px: number): HTMLCanvasElement {
  const size = Math.min(512, Math.round(px));
  const key = `${itemSpriteKey(chain, tier, variant)}@${size}`;
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d')!;
    renderItemSprite(ctx, size, chain, tier, variant);
    cache.set(key, cv);
  }
  return cv;
}

export function clearSpriteCache(): void {
  cache.clear();
}

/** Draw an item into an offscreen ctx of size×size. */
export function renderItemSprite(ctx: Ctx, size: number, chain: ChainId, tier: number, variant: Variant): void {
  const base = CHAINS[chain].tiers[tier - 1];
  const pal = variantPal(base, variant);
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const u = s / 100; // unit

  // ambient halo
  glow(ctx, cx, cy, s * 0.52, pal.g, 0.5);
  if (variant !== 'normal') glow(ctx, cx, cy, s * 0.36, variant === 'gold' ? '#ffe9a8' : '#dfe8ff', 0.5);

  switch (`${chain}${tier}`) {
    case 'moon1': drawSeed(ctx, cx, cy, u, pal); break;
    case 'moon2': drawSprout(ctx, cx, cy, u, pal); break;
    case 'moon3': drawBud(ctx, cx, cy, u, pal); break;
    case 'moon4': drawMoonpetal(ctx, cx, cy, u, pal); break;
    case 'moon5': drawGlowBloom(ctx, cx, cy, u, pal); break;
    case 'moon6': drawStarTree(ctx, cx, cy, u, pal); break;
    case 'dust1': drawDust(ctx, cx, cy, u, pal); break;
    case 'dust2': drawFirefly(ctx, cx, cy, u, pal); break;
    case 'dust3': drawLantern(ctx, cx, cy, u, pal); break;
    case 'dust4': drawWisp(ctx, cx, cy, u, pal); break;
    case 'dust5': drawConstellation(ctx, cx, cy, u, pal); break;
    default: drawSeed(ctx, cx, cy, u, pal);
  }
}

/* ---------------- individual artists ---------------- */

function drawSeed(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  // teardrop seed
  const r = u * 20;
  glow(ctx, cx, cy, r * 2.1, p.g, 0.5);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.3);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
  g.addColorStop(0, lighten(p.c, 0.25));
  g.addColorStop(0.7, p.c);
  g.addColorStop(1, p.d);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.3);
  ctx.quadraticCurveTo(r * 0.95, -r * 0.25, r * 0.72, r * 0.5);
  ctx.quadraticCurveTo(r * 0.4, r * 1.18, 0, r * 1.18);
  ctx.quadraticCurveTo(-r * 0.4, r * 1.18, -r * 0.72, r * 0.5);
  ctx.quadraticCurveTo(-r * 0.95, -r * 0.25, 0, -r * 1.3);
  ctx.fill();
  ctx.restore();
  sleepyFace(ctx, cx, cy + u * 4, u * 22);
  sparkle(ctx, cx - u * 14, cy - u * 14, u * 4, '#fff6d8', 0.85);
}

function drawSprout(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  const h = u * 26;
  // soil mound
  ctx.fillStyle = 'rgba(90,70,130,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + u * 24, u * 20, u * 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // stem
  ctx.strokeStyle = '#4aa88c';
  ctx.lineWidth = u * 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + u * 22);
  ctx.quadraticCurveTo(cx - u * 6, cy + u * 6, cx, cy + u * 2 - h);
  ctx.stroke();
  // leaves
  petal(ctx, cx, cy + u * 2, u * 20, u * 8, -Math.PI * 0.72, p.c, p.d);
  petal(ctx, cx, cy + u * 2, u * 20, u * 8, -Math.PI * 0.28, p.c, p.d);
  // glowing tip orb
  const ty = cy - h + u * 2;
  glow(ctx, cx, ty, u * 12, p.g, 0.75);
  orb(ctx, cx, ty, u * 8, p.c, p.d);
  sleepyFace(ctx, cx, ty, u * 15);
}

function drawBud(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  const r = u * 16;
  // stem + leaf
  ctx.strokeStyle = '#4aa88c';
  ctx.lineWidth = u * 3.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + u * 26);
  ctx.lineTo(cx, cy + u * 8);
  ctx.stroke();
  petal(ctx, cx, cy + u * 12, u * 16, u * 6.5, -Math.PI * 0.6, '#5ec9a8');
  // closed bud = two overlapping petals
  glow(ctx, cx, cy - u * 4, r * 2.2, p.g, 0.55);
  petal(ctx, cx, cy + u * 10, u * 30, u * 13, -Math.PI * 0.62, p.c, p.d);
  petal(ctx, cx, cy + u * 10, u * 30, u * 13, -Math.PI * 0.38, lighten(p.c, 0.12), p.d);
  sleepyFace(ctx, cx, cy + u * 1, u * 14);
  sparkle(ctx, cx + u * 16, cy - u * 12, u * 3.4, '#fff6d8', 0.8);
}

function drawMoonpetal(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  const r = u * 34;
  glow(ctx, cx, cy, r * 1.7, p.g, 0.6);
  // six petals
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    petal(ctx, cx, cy, u * 30, u * 11, a, i % 2 === 0 ? p.c : lighten(p.c, 0.14), rgba(p.d, 0.7));
  }
  // moon core with crescent
  orb(ctx, cx, cy, u * 13, '#fff2c8', '#f2d898');
  ctx.fillStyle = rgba('#f2d898', 0.8);
  ctx.beginPath();
  ctx.arc(cx + u * 4, cy, u * 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff2c8';
  ctx.beginPath();
  ctx.arc(cx + u * 1.4, cy - u * 1.2, u * 9.4, 0, Math.PI * 2);
  ctx.fill();
  sleepyFace(ctx, cx - u * 2, cy + u * 1, u * 12);
}

function drawGlowBloom(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  const r = u * 38;
  glow(ctx, cx, cy, r * 1.8, p.g, 0.65);
  // eight petals, layered
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    petal(ctx, cx, cy, u * 32, u * 12, a, i % 2 === 0 ? p.c : lighten(p.c, 0.1), rgba(p.d, 0.55));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    petal(ctx, cx, cy, u * 22, u * 9, a, lighten(p.c, 0.25));
  }
  orb(ctx, cx, cy, u * 12, '#ffd76e', '#c9962e');
  sleepyFace(ctx, cx, cy, u * 11, 'rgba(60,40,10,0.7)');
  // floating pollen
  for (const [dx, dy] of [[-1.4, -1.2], [1.5, -0.9], [0.9, 1.4], [-1.1, 1.3]]) {
    glow(ctx, cx + dx * u * 10, cy + dy * u * 10, u * 3.4, '#ffe9a8', 0.8);
  }
}

function drawStarTree(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  // trunk
  ctx.strokeStyle = '#7a5c48';
  ctx.lineWidth = u * 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + u * 26);
  ctx.quadraticCurveTo(cx + u * 2, cy + u * 8, cx, cy - u * 4);
  ctx.stroke();
  // canopy: three glow orbs + star fruits
  const orbs: Array<[number, number, number]> = [[-u * 14, -u * 8, u * 15], [u * 13, -u * 6, u * 14], [0, -u * 20, u * 16]];
  for (const [dx, dy, r] of orbs) {
    glow(ctx, cx + dx, cy + dy, r * 2, p.g, 0.4);
    orb(ctx, cx + dx, cy + dy, r, '#3e6e5a', '#2a5244');
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    starShape(ctx, cx + Math.cos(a) * u * 14, cy - u * 10 + Math.sin(a) * u * 10, u * 6.5, 5, 0.5, p.c);
  }
  starShape(ctx, cx, cy - u * 24, u * 8, 5, 0.5, '#fff2c8');
  glow(ctx, cx, cy - u * 24, u * 12, '#ffe9a8', 0.7);
  sleepyFace(ctx, cx, cy + u * 14, u * 13, 'rgba(30,20,10,0.7)');
}

function drawDust(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  // cluster of motes
  glow(ctx, cx, cy, u * 34, p.g, 0.5);
  orb(ctx, cx - u * 6, cy + u * 4, u * 14, p.c, p.d);
  orb(ctx, cx + u * 12, cy - u * 6, u * 10, lighten(p.c, 0.15), p.d);
  orb(ctx, cx + u * 2, cy - u * 18, u * 7, lighten(p.c, 0.25), p.d);
  sleepyFace(ctx, cx - u * 6, cy + u * 4, u * 13);
  sparkle(ctx, cx + u * 20, cy + u * 10, u * 3.2, '#fff', 0.7);
}

function drawFirefly(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  // trail
  ctx.save();
  ctx.strokeStyle = rgba(p.g, 0.5);
  ctx.lineWidth = u * 3;
  ctx.setLineDash([u * 2, u * 4]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - u * 26, cy + u * 10);
  ctx.quadraticCurveTo(cx - u * 12, cy + u * 16, cx, cy + u * 6);
  ctx.stroke();
  ctx.restore();
  // wings
  ctx.fillStyle = 'rgba(220,240,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - u * 10, cy - u * 8, u * 11, u * 5, -0.6, 0, Math.PI * 2);
  ctx.ellipse(cx + u * 10, cy - u * 8, u * 11, u * 5, 0.6, 0, Math.PI * 2);
  ctx.fill();
  // body
  orb(ctx, cx, cy - u * 2, u * 11, '#5a5470', '#3a3550');
  // glowing abdomen
  glow(ctx, cx, cy + u * 10, u * 14, p.g, 0.85);
  orb(ctx, cx, cy + u * 10, u * 8, p.c, p.d);
  sleepyFace(ctx, cx, cy - u * 2, u * 10);
}

function drawLantern(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  glow(ctx, cx, cy, u * 42, p.g, 0.65);
  // paper lantern body
  const w = u * 30;
  const h = u * 34;
  const g = ctx.createRadialGradient(cx - w * 0.25, cy - h * 0.2, w * 0.1, cx, cy, w);
  g.addColorStop(0, lighten(p.c, 0.3));
  g.addColorStop(0.6, p.c);
  g.addColorStop(1, p.d);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.8, h * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  // ribs
  ctx.strokeStyle = rgba('#8a4a20', 0.35);
  ctx.lineWidth = u * 1.6;
  for (const dx of [-w * 0.42, 0, w * 0.42]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * 0.35, cy, w * 0.32, h * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // caps + tassel
  ctx.fillStyle = '#8a5c34';
  ctx.fillRect(cx - w * 0.22, cy - h * 0.82, w * 0.44, u * 6);
  ctx.fillRect(cx - w * 0.18, cy + h * 0.68, w * 0.36, u * 5);
  ctx.strokeStyle = p.g;
  ctx.lineWidth = u * 2.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy + h * 0.74);
  ctx.lineTo(cx, cy + h * 0.92);
  ctx.stroke();
  sleepyFace(ctx, cx, cy - u * 2, u * 15, 'rgba(80,40,10,0.6)');
}

function drawWisp(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  // trailing ribbons
  ctx.save();
  for (const dy of [-u * 4, u * 6]) {
    ctx.strokeStyle = rgba(p.g, 0.4);
    ctx.lineWidth = u * 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - u * 34, cy + dy + u * 10);
    ctx.quadraticCurveTo(cx - u * 14, cy + dy - u * 8, cx - u * 4, cy + dy);
    ctx.stroke();
  }
  ctx.restore();
  // spirit orb
  glow(ctx, cx, cy, u * 26, p.g, 0.8);
  const g = ctx.createRadialGradient(cx - u * 6, cy - u * 8, u * 2, cx, cy, u * 18);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, p.c);
  g.addColorStop(1, rgba(p.g, 0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, u * 18, 0, Math.PI * 2);
  ctx.fill();
  // wisp tail
  ctx.fillStyle = rgba(p.c, 0.75);
  ctx.beginPath();
  ctx.moveTo(cx - u * 10, cy + u * 6);
  ctx.quadraticCurveTo(cx + u * 2, cy + u * 30, cx + u * 14, cy + u * 12);
  ctx.quadraticCurveTo(cx + u * 4, cy + u * 18, cx + u * 10, cy + u * 6);
  ctx.fill();
  sleepyFace(ctx, cx, cy - u * 2, u * 15, 'rgba(40,60,90,0.6)');
  starShape(ctx, cx + u * 12, cy - u * 12, u * 3.4, 4, 0.45, '#fff');
}

function drawConstellation(ctx: Ctx, cx: number, cy: number, u: number, p: Pal): void {
  // faint connecting lines forming a little chalice
  const pts: Array<[number, number]> = [
    [-u * 22, -u * 18], [u * 18, -u * 22], [u * 8, u * 4], [-u * 6, u * 16], [-u * 26, u * 6]
  ];
  ctx.save();
  ctx.strokeStyle = rgba('#9fb4ff', 0.55);
  ctx.lineWidth = u * 1.4;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] + cx, pts[0][1] + cy);
  for (const [dx, dy] of pts.slice(1)) ctx.lineTo(cx + dx, cy + dy);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // stars
  for (let i = 0; i < pts.length; i++) {
    const [dx, dy] = pts[i];
    const r = i === 0 ? u * 9 : i === 2 ? u * 8 : u * 6;
    glow(ctx, cx + dx, cy + dy, r * 2.2, p.g, 0.6);
    starShape(ctx, cx + dx, cy + dy, r, 5, 0.5, p.c);
  }
  sleepyFace(ctx, cx + pts[0][0], cy + pts[0][1], u * 11);
}
