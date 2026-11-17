/**
 * The 12 creatures of Moonpetal, drawn procedurally.
 * Design language: big soft shapes, closed sleepy eyes, blush, one glowing accent.
 * opts.silhouette=true renders the dark journal silhouette.
 */
import { Ctx, glow, orb, petal, sleepyFace, starShape, rgba, lighten, darken, zzz } from './draw';

interface DrawOpts {
  silhouette?: boolean;
  reducedMotion?: boolean;
}

const SIL = 'rgba(16, 12, 36, 0.92)';

export function drawCreature(
  ctx: Ctx,
  art: string,
  x: number,
  y: number,
  s: number,
  t: number,
  pal: { body: string; belly: string; accent: string },
  opts: DrawOpts = {}
): void {
  ctx.save();
  ctx.translate(x, y);
  const bob = opts.reducedMotion ? 0 : Math.sin(t * 1.1) * s * 0.02;
  ctx.translate(0, bob);
  switch (art) {
    case 'moth': moth(ctx, s, t, pal, opts); break;
    case 'owl': owl(ctx, s, t, pal, opts); break;
    case 'hedgehog': hedgehog(ctx, s, t, pal, opts); break;
    case 'rabbit': rabbit(ctx, s, t, pal, opts); break;
    case 'snail': snail(ctx, s, t, pal, opts); break;
    case 'fox': fox(ctx, s, t, pal, opts); break;
    case 'frog': frog(ctx, s, t, pal, opts); break;
    case 'cat': cat(ctx, s, t, pal, opts); break;
    case 'sprite': sprite(ctx, s, t, pal, opts); break;
    case 'deer': deer(ctx, s, t, pal, opts); break;
    case 'whale': whale(ctx, s, t, pal, opts); break;
    case 'tortoise': tortoise(ctx, s, t, pal, opts); break;
    default: owl(ctx, s, t, pal, opts);
  }
  ctx.restore();
}

/* ------------- shared bits ------------- */

function ear(ctx: Ctx, x: number, y: number, w: number, h: number, ang: number, fill: string, inner?: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (inner) {
    ctx.beginPath();
    ctx.ellipse(0, h * 0.15, w * 0.55, h * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = inner;
    ctx.fill();
  }
  ctx.restore();
}

function bodyBlob(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function withSil(ctx: Ctx, opts: DrawOpts, color: string): string {
  return opts.silhouette ? SIL : color;
}

function faceFor(ctx: Ctx, opts: DrawOpts, x: number, y: number, s: number, dark: string, blush: string, t: number): void {
  if (opts.silhouette) return;
  sleepyFace(ctx, x, y, s, dark, blush, t);
}

/* ------------- creatures ------------- */

function moth(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  const flap = opts.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.2);
  // wings (4)
  const wingC = withSil(ctx, opts, rgba(pal.accent, 0.75));
  ctx.save();
  ctx.globalAlpha = opts.silhouette ? 1 : 0.85;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(0, -s * 0.12);
    ctx.scale(side * (0.75 + flap * 0.35), 1);
    ctx.beginPath();
    ctx.ellipse(s * 0.34, -s * 0.1, s * 0.36, s * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = wingC;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.26, s * 0.16, s * 0.22, s * 0.14, 0.4, 0, Math.PI * 2);
    ctx.fillStyle = wingC;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // fuzzy body
  bodyBlob(ctx, 0, 0, s * 0.14, s * 0.3, withSil(ctx, opts, pal.body));
  bodyBlob(ctx, 0, s * 0.2, s * 0.11, s * 0.14, withSil(ctx, opts, pal.belly));
  // antennae
  ctx.strokeStyle = withSil(ctx, opts, pal.body);
  ctx.lineWidth = Math.max(1, s * 0.02);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.04, -s * 0.28);
    ctx.quadraticCurveTo(side * s * 0.14, -s * 0.42, side * s * 0.2, -s * 0.36);
    ctx.stroke();
  }
  faceFor(ctx, opts, 0, -s * 0.08, s * 0.16, 'rgba(60,45,30,0.8)', 'rgba(255,150,150,0.25)', t);
}

function owl(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // body
  bodyBlob(ctx, 0, s * 0.06, s * 0.3, s * 0.34, withSil(ctx, opts, pal.body));
  // belly
  bodyBlob(ctx, 0, s * 0.16, s * 0.2, s * 0.22, withSil(ctx, opts, pal.belly));
  // ear tufts
  ear(ctx, -s * 0.16, -s * 0.3, s * 0.08, s * 0.12, -0.4, withSil(ctx, opts, pal.body));
  ear(ctx, s * 0.16, -s * 0.3, s * 0.08, s * 0.12, 0.4, withSil(ctx, opts, pal.body));
  // crescent on belly
  if (!opts.silhouette) {
    ctx.fillStyle = rgba(pal.accent, 0.7);
    ctx.beginPath();
    ctx.arc(0, s * 0.14, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#8a7fb0', 0.9);
    ctx.beginPath();
    ctx.arc(-s * 0.03, s * 0.12, s * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
  // beak
  ctx.fillStyle = withSil(ctx, opts, '#ffb35c');
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.02);
  ctx.lineTo(-s * 0.045, s * 0.05);
  ctx.lineTo(s * 0.045, s * 0.05);
  ctx.closePath();
  ctx.fill();
  // closed eyes
  if (!opts.silhouette) {
    ctx.strokeStyle = 'rgba(30,22,50,0.8)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * s * 0.12, -s * 0.08, s * 0.06, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    zzz(ctx, s * 0.2, -s * 0.34, s * 0.12, t);
  }
}

function hedgehog(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // spines: zigzag dome
  ctx.fillStyle = withSil(ctx, opts, darken(pal.body, 0.28));
  ctx.beginPath();
  const r = s * 0.32;
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI;
    const rr = i % 2 === 0 ? r : r * 1.18;
    const px = Math.cos(a) * rr * -1;
    const py = Math.sin(a) * rr * 0.85;
    if (i === 0) ctx.moveTo(-px, py);
    else ctx.lineTo(-px, py);
  }
  ctx.closePath();
  ctx.fill();
  // face/body
  bodyBlob(ctx, s * 0.14, s * 0.14, s * 0.24, s * 0.2, withSil(ctx, opts, pal.body));
  bodyBlob(ctx, s * 0.2, s * 0.2, s * 0.15, s * 0.12, withSil(ctx, opts, pal.belly));
  // nose
  ctx.fillStyle = withSil(ctx, opts, '#7a4a3a');
  ctx.beginPath();
  ctx.arc(s * 0.36, s * 0.18, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  // heart-lantern glow through spines
  if (!opts.silhouette) {
    glow(ctx, 0, s * 0.08, s * 0.16, pal.accent, 0.5 + 0.2 * Math.sin(t * 1.8));
    starShape(ctx, 0, s * 0.08, s * 0.05, 4, 0.5, rgba('#fff2c8', 0.9));
    faceFor(ctx, opts, s * 0.24, s * 0.12, s * 0.14, 'rgba(50,30,20,0.75)', 'rgba(255,150,150,0.3)', t);
  }
}

function rabbit(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // ears (one bent)
  ear(ctx, -s * 0.12, -s * 0.36, s * 0.06, s * 0.2, -0.15, withSil(ctx, opts, pal.body), withSil(ctx, opts, '#ffd8e0'));
  ctx.save();
  ctx.translate(s * 0.14, -s * 0.32);
  ctx.rotate(0.7);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.06, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = withSil(ctx, opts, pal.body);
  ctx.fill();
  ctx.restore();
  // body
  bodyBlob(ctx, 0, s * 0.12, s * 0.26, s * 0.26, withSil(ctx, opts, pal.body));
  bodyBlob(ctx, 0, s * 0.18, s * 0.17, s * 0.17, withSil(ctx, opts, pal.belly));
  // dew drop held in paws
  if (!opts.silhouette) {
    glow(ctx, 0, s * 0.3, s * 0.14, pal.accent, 0.7);
    ctx.fillStyle = '#cfeaff';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.2);
    ctx.quadraticCurveTo(s * 0.08, s * 0.3, 0, s * 0.4);
    ctx.quadraticCurveTo(-s * 0.08, s * 0.3, 0, s * 0.2);
    ctx.fill();
  }
  faceFor(ctx, opts, 0, s * 0.02, s * 0.16, 'rgba(60,50,80,0.75)', 'rgba(255,150,170,0.3)', t);
}

function snail(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // glitter trail
  if (!opts.silhouette) {
    for (let i = 1; i <= 4; i++) {
      glow(ctx, -s * (0.12 + i * 0.09), s * 0.34, s * 0.03, '#cfeaff', 0.5);
    }
  }
  // body slug
  ctx.fillStyle = withSil(ctx, opts, pal.body);
  ctx.beginPath();
  ctx.ellipse(s * 0.05, s * 0.26, s * 0.3, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // head
  bodyBlob(ctx, s * 0.3, s * 0.18, s * 0.12, s * 0.1, withSil(ctx, opts, pal.body));
  // eyestalks
  ctx.strokeStyle = withSil(ctx, opts, pal.body);
  ctx.lineWidth = Math.max(1, s * 0.02);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.32 + side * s * 0.04, s * 0.12);
    ctx.lineTo(s * 0.34 + side * s * 0.06, s * 0.0);
    ctx.stroke();
  }
  // shell with spiral + lantern glow
  bodyBlob(ctx, -s * 0.08, s * 0.02, s * 0.24, s * 0.22, withSil(ctx, opts, pal.belly));
  if (!opts.silhouette) {
    glow(ctx, -s * 0.08, s * 0.02, s * 0.28, pal.accent, 0.4 + 0.15 * Math.sin(t * 1.4));
    ctx.strokeStyle = rgba('#c98f2e', 0.6);
    ctx.lineWidth = Math.max(1, s * 0.018);
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.3) {
      const rr = s * 0.02 + a * s * 0.02;
      const px = -s * 0.08 + Math.cos(a) * rr;
      const py = s * 0.02 + Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  faceFor(ctx, opts, s * 0.32, s * 0.16, s * 0.11, 'rgba(50,55,90,0.75)', 'rgba(255,150,150,0.3)', t);
}

function fox(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // curled body
  bodyBlob(ctx, 0, s * 0.1, s * 0.32, s * 0.24, withSil(ctx, opts, pal.body));
  // tail wrapping around
  ctx.strokeStyle = withSil(ctx, opts, pal.body);
  ctx.lineWidth = s * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, s * 0.14, s * 0.26, Math.PI * 0.25, Math.PI * 0.95, false);
  ctx.stroke();
  if (!opts.silhouette) {
    // tail tip white
    ctx.strokeStyle = '#faf4e8';
    ctx.lineWidth = s * 0.13;
    ctx.beginPath();
    ctx.arc(0, s * 0.14, s * 0.26, Math.PI * 0.86, Math.PI * 0.95, false);
    ctx.stroke();
    // sparks in tail
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (0.35 + i * 0.2) + Math.sin(t * 1.2 + i) * 0.03;
      glow(ctx, Math.cos(a) * s * 0.26, s * 0.14 + Math.sin(a) * s * 0.26, s * 0.06, pal.accent, 0.7);
    }
  }
  // ears
  ear(ctx, -s * 0.14, -s * 0.14, s * 0.07, s * 0.11, -0.5, withSil(ctx, opts, pal.body));
  ear(ctx, s * 0.16, -s * 0.1, s * 0.06, s * 0.1, 0.5, withSil(ctx, opts, pal.body));
  // nose
  ctx.fillStyle = withSil(ctx, opts, '#5a3a30');
  ctx.beginPath();
  ctx.arc(s * 0.1, s * 0.02, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  faceFor(ctx, opts, s * 0.04, s * 0.0, s * 0.15, 'rgba(50,25,15,0.75)', 'rgba(255,150,150,0.3)', t);
}

function frog(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // lily pad
  ctx.fillStyle = withSil(ctx, opts, 'rgba(60,140,110,0.9)');
  ctx.beginPath();
  ctx.ellipse(0, s * 0.34, s * 0.42, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  bodyBlob(ctx, 0, s * 0.08, s * 0.26, s * 0.2, withSil(ctx, opts, pal.body));
  bodyBlob(ctx, 0, s * 0.16, s * 0.16, s * 0.1, withSil(ctx, opts, pal.belly));
  // throat bubble (sings)
  if (!opts.silhouette) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    glow(ctx, 0, s * 0.2, s * (0.1 + pulse * 0.05), pal.accent, 0.35 + pulse * 0.25);
  }
  // eyes bumps
  for (const side of [-1, 1]) {
    bodyBlob(ctx, side * s * 0.16, -s * 0.12, s * 0.08, s * 0.08, withSil(ctx, opts, pal.body));
  }
  faceFor(ctx, opts, 0, -s * 0.06, s * 0.16, 'rgba(20,60,50,0.8)', 'rgba(255,170,150,0.3)', t);
}

function cat(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // sitting loaf
  bodyBlob(ctx, 0, s * 0.14, s * 0.26, s * 0.22, withSil(ctx, opts, pal.body));
  // head
  bodyBlob(ctx, 0, -s * 0.12, s * 0.17, s * 0.14, withSil(ctx, opts, pal.body));
  // ears
  ctx.fillStyle = withSil(ctx, opts, pal.body);
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, -s * 0.2);
  ctx.lineTo(-s * 0.08, -s * 0.3);
  ctx.lineTo(-s * 0.04, -s * 0.2);
  ctx.closePath();
  ctx.moveTo(s * 0.14, -s * 0.2);
  ctx.lineTo(s * 0.08, -s * 0.3);
  ctx.lineTo(s * 0.04, -s * 0.2);
  ctx.closePath();
  ctx.fill();
  // tail with star tip
  ctx.strokeStyle = withSil(ctx, opts, pal.body);
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.24, s * 0.2);
  ctx.quadraticCurveTo(s * 0.42, s * 0.14, s * 0.4, -s * 0.12);
  ctx.stroke();
  if (!opts.silhouette) {
    glow(ctx, s * 0.4, -s * 0.14, s * 0.12, pal.accent, 0.8);
    starShape(ctx, s * 0.4, -s * 0.14, s * 0.06, 5, 0.5, '#fff2c8');
    // star freckles
    for (const [dx, dy] of [[-0.12, 0.1], [0.1, 0.18], [0, 0.02]]) {
      starShape(ctx, dx * s, dy * s, s * 0.02, 4, 0.5, rgba('#ffe9a8', 0.8));
    }
  }
  faceFor(ctx, opts, 0, -s * 0.1, s * 0.14, 'rgba(20,14,40,0.85)', 'rgba(255,150,150,0.3)', t);
}

function sprite(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // wing petals
  const flap = opts.reducedMotion ? 0.6 : 0.6 + 0.4 * Math.sin(t * 3);
  ctx.fillStyle = withSil(ctx, opts, rgba('#dff6ff', 0.5));
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(0, -s * 0.05);
    ctx.rotate((i / 4) * Math.PI * 2 + flap * 0.2);
    petal(ctx, 0, 0, s * 0.3, s * 0.1, 0, withSil(ctx, opts, rgba('#e8fbff', 0.45)));
    ctx.restore();
  }
  // glowing body
  if (!opts.silhouette) glow(ctx, 0, 0, s * 0.3, pal.accent, 0.7);
  bodyBlob(ctx, 0, 0, s * 0.14, s * 0.14, withSil(ctx, opts, pal.body));
  faceFor(ctx, opts, 0, 0, s * 0.14, 'rgba(50,70,90,0.7)', 'rgba(255,170,150,0.35)', t);
  if (!opts.silhouette) {
    starShape(ctx, s * 0.16, -s * 0.14, s * 0.03, 4, 0.5, '#fff');
  }
}

function deer(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // legs
  ctx.strokeStyle = withSil(ctx, opts, darken(pal.body, 0.15));
  ctx.lineWidth = s * 0.05;
  ctx.lineCap = 'round';
  for (const [dx, dy] of [[-0.18, 0], [0.14, 0]]) {
    ctx.beginPath();
    ctx.moveTo(dx * s, s * 0.16);
    ctx.lineTo(dx * s, s * 0.38);
    ctx.stroke();
  }
  // body
  bodyBlob(ctx, 0, s * 0.02, s * 0.28, s * 0.16, withSil(ctx, opts, pal.body));
  // neck + head (lowered, grazing)
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.0);
  ctx.quadraticCurveTo(s * 0.3, -s * 0.06, s * 0.34, s * 0.1);
  ctx.lineWidth = s * 0.1;
  ctx.strokeStyle = withSil(ctx, opts, pal.body);
  ctx.stroke();
  bodyBlob(ctx, s * 0.36, s * 0.14, s * 0.09, s * 0.07, withSil(ctx, opts, pal.body));
  // antlers with starlight
  ctx.strokeStyle = withSil(ctx, opts, '#c9a07e');
  ctx.lineWidth = s * 0.022;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.36 + side * s * 0.02, s * 0.08);
    ctx.lineTo(s * 0.34 + side * s * 0.08, -s * 0.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.35 + side * s * 0.05, -s * 0.05);
    ctx.lineTo(s * 0.4 + side * s * 0.08, -s * 0.12);
    ctx.stroke();
  }
  if (!opts.silhouette) {
    for (const [dx, dy] of [[-0.03, -0.16], [0.05, -0.14]]) {
      glow(ctx, s * (0.34 + dx), s * (0.08 + dy), s * 0.05, '#cfeaff', 0.7);
    }
    // glowing spots
    for (const [dx, dy] of [[-0.1, -0.02], [0.02, 0], [0.14, 0.02]]) {
      starShape(ctx, dx * s, dy * s, s * 0.02, 4, 0.5, rgba('#8ff0d8', 0.85));
    }
  }
  faceFor(ctx, opts, s * 0.36, s * 0.13, s * 0.1, 'rgba(60,40,25,0.7)', 'rgba(255,150,150,0.25)', t);
}

function whale(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // cloud body
  ctx.fillStyle = withSil(ctx, opts, pal.body);
  ctx.beginPath();
  ctx.arc(-s * 0.18, s * 0.08, s * 0.16, 0, Math.PI * 2);
  ctx.arc(s * 0.02, s * 0.0, s * 0.2, 0, Math.PI * 2);
  ctx.arc(s * 0.22, s * 0.1, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withSil(ctx, opts, pal.belly);
  ctx.beginPath();
  ctx.ellipse(s * 0.02, s * 0.18, s * 0.28, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // tail fluke
  ctx.save();
  ctx.translate(s * 0.34, -s * 0.1);
  ctx.rotate(Math.sin(t * 1.4) * 0.15 - 0.3);
  ctx.fillStyle = withSil(ctx, opts, pal.body);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.08);
  ctx.quadraticCurveTo(s * 0.12, s * 0.0, s * 0.18, -s * 0.12);
  ctx.quadraticCurveTo(s * 0.06, -s * 0.04, s * 0.04, -s * 0.14);
  ctx.quadraticCurveTo(s * 0.02, -s * 0.02, 0, s * 0.08);
  ctx.fill();
  ctx.restore();
  // stardust spout
  if (!opts.silhouette) {
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.6 + i * 0.25) % 1;
      glow(ctx, s * 0.1, -s * (0.2 + ph * 0.3), s * 0.04, '#cfeaff', 0.6 * (1 - ph));
    }
  }
  faceFor(ctx, opts, s * 0.06, s * 0.08, s * 0.16, 'rgba(60,70,110,0.7)', 'rgba(180,200,255,0.4)', t);
}

function tortoise(ctx: Ctx, s: number, t: number, pal: any, opts: DrawOpts): void {
  // legs
  ctx.fillStyle = withSil(ctx, opts, darken(pal.body, 0.2));
  for (const dx of [-0.16, 0.14]) {
    ctx.beginPath();
    ctx.ellipse(dx * s, s * 0.3, s * 0.06, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // shell dome
  ctx.fillStyle = withSil(ctx, opts, darken(pal.body, 0.1));
  ctx.beginPath();
  ctx.arc(0, s * 0.12, s * 0.24, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // shell rim
  ctx.fillStyle = withSil(ctx, opts, pal.belly);
  ctx.fillRect(-s * 0.24, s * 0.1, s * 0.48, s * 0.05);
  // retired constellations
  if (!opts.silhouette) {
    for (const [dx, dy] of [[-0.1, 0.0], [0.04, -0.08], [0.12, 0.0], [-0.02, -0.02]]) {
      starShape(ctx, dx * s, s * (0.12 + dy), s * 0.022, 4, 0.5, rgba('#cfd8ff', 0.9));
    }
  }
  // head
  bodyBlob(ctx, s * 0.3, s * 0.16, s * 0.09, s * 0.07, withSil(ctx, opts, pal.body));
  faceFor(ctx, opts, s * 0.31, s * 0.15, s * 0.1, 'rgba(30,50,40,0.8)', 'rgba(255,150,150,0.25)', t);
}

/** Small helper: cute paw print trail when a creature walks in. */
export function drawPawTrail(ctx: Ctx, x: number, y: number, s: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(200,190,240,0.5)';
  for (const [dx, dy] of [[0, 0], [-s * 0.5, s * 0.4], [s * 0.5, s * 0.4]]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
