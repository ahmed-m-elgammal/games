/**
 * Scene backgrounds: 3 board moods (Dawn Meadow, Moon Pond, Star Grove) +
 * the Night Garden ground. Stars/clouds/hills precomputed; cached gradient sky.
 */
import { Ctx, glow, rgba, sparkle, roundRect } from './draw';
import { looseRng, Rng } from '../core/rng';

export type Mood = 'dawn' | 'moon' | 'star';

export interface MoodPalette {
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  moon: string;
  moonHalo: string;
  hill1: string;
  hill2: string;
  hill3: string;
  ambient: string[];
  stars: number;
}

export const MOODS: Record<Mood, MoodPalette> = {
  dawn: {
    skyTop: '#4a3d7a', skyMid: '#8f6a8c', skyHorizon: '#ff9d6e',
    moon: '#ffe4b8', moonHalo: '#ffc98f',
    hill1: '#4a3470', hill2: '#382a5e', hill3: '#2a204e',
    ambient: ['#ffd9a0', '#ffc9d8', '#ffe9a8'], stars: 30
  },
  moon: {
    skyTop: '#191036', skyMid: '#221649', skyHorizon: '#2c1f5c',
    moon: '#f6edd2', moonHalo: '#ffe9b8',
    hill1: '#2a1f52', hill2: '#241a4d', hill3: '#1c1440',
    ambient: ['#bfe3ff', '#b9a7ff', '#8ff0d8'], stars: 70
  },
  star: {
    skyTop: '#0d0a24', skyMid: '#141032', skyHorizon: '#1c1450',
    moon: '#efe6c8', moonHalo: '#e8d8a8',
    hill1: '#1a1444', hill2: '#140f38', hill3: '#0f0b2c',
    ambient: ['#9fb4ff', '#7cc9e8', '#b9a7ff'], stars: 130
  }
};

interface Star { x: number; y: number; r: number; ph: number; sp: number }

export class Background {
  private stars: Star[] = [];
  private hills: Array<Array<[number, number]>> = [];
  private w = 0;
  private h = 0;
  private skyCanvas: HTMLCanvasElement | null = null;
  private skyKey = '';
  lastMood: Mood = 'moon';

  private build(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const rng = new Rng(0x51ee7);
    this.stars = [];
    for (let i = 0; i < 140; i++) {
      this.stars.push({
        x: rng.next() * w, y: rng.next() * h * 0.72,
        r: rng.range(0.6, 1.9), ph: rng.range(0, Math.PI * 2), sp: rng.range(0.5, 1.6)
      });
    }
    this.hills = [];
    for (let layer = 0; layer < 3; layer++) {
      const pts: Array<[number, number]> = [];
      const baseY = h * (0.55 + layer * 0.14);
      const amp = h * (0.1 - layer * 0.02);
      for (let x = 0; x <= w; x += w / 14) {
        pts.push([x, baseY + Math.sin(x / w * 3 + layer * 1.7) * amp + rng.range(-amp * 0.3, amp * 0.3)]);
      }
      this.hills.push(pts);
    }
    this.skyCanvas = null;
  }

  resize(w: number, h: number, mood: Mood): void {
    const key = `${Math.round(w)}x${Math.round(h)}:${mood}`;
    this.lastMood = mood;
    if (key !== this.skyKey) {
      this.skyKey = key;
      this.build(w, h);
    }
  }

  private buildSky(mood: Mood): HTMLCanvasElement {
    const p = MOODS[mood];
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(0.55, p.skyMid);
    g.addColorStop(1, p.skyHorizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    return cv;
  }

  draw(ctx: Ctx, w: number, h: number, mood: Mood, t: number, reducedMotion: boolean, gardenMode = false): void {
    this.resize(w, h, mood);
    const p = MOODS[mood];
    if (!this.skyCanvas) this.skyCanvas = this.buildSky(mood);
    ctx.drawImage(this.skyCanvas, 0, 0);

    // stars (twinkle)
    const n = mood === 'dawn' ? p.stars : this.stars.length;
    for (let i = 0; i < n; i++) {
      const s = this.stars[i];
      const tw = reducedMotion ? 0.7 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = rgba('#e8ecff', tw * (mood === 'dawn' ? 0.5 : 0.9));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1.5 && !reducedMotion) sparkle(ctx, s.x, s.y, s.r * 2.4, '#fff', tw * 0.35);
    }

    // aurora ribbons in star mood
    if (mood === 'star' && !gardenMode) {
      for (let k = 0; k < 2; k++) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        const col = k === 0 ? '#6fe3c1' : '#b9a7ff';
        const g = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.42);
        g.addColorStop(0, rgba(col, 0.9));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.18);
        for (let x = 0; x <= w; x += 24) {
          const y = h * (0.16 + k * 0.05) + Math.sin(x / w * 4 + t * (0.3 + k * 0.12) + k * 2) * h * 0.045;
          ctx.lineTo(x, y);
        }
        for (let x = w; x >= 0; x -= 24) {
          const y = h * (0.16 + k * 0.05) + Math.sin(x / w * 4 + t * (0.3 + k * 0.12) + k * 2) * h * 0.045 + h * 0.1;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // moon / sun
    const mx = w * 0.76;
    const my = h * (mood === 'dawn' ? 0.16 : 0.13);
    const mr = Math.min(w, h) * 0.11;
    glow(ctx, mx, my, mr * 2.6, p.moonHalo, mood === 'dawn' ? 0.5 : 0.4);
    ctx.fillStyle = p.moon;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    // craters
    ctx.fillStyle = rgba('#c9b890', 0.35);
    ctx.beginPath();
    ctx.arc(mx - mr * 0.3, my - mr * 0.15, mr * 0.16, 0, Math.PI * 2);
    ctx.arc(mx + mr * 0.22, my + mr * 0.3, mr * 0.12, 0, Math.PI * 2);
    ctx.arc(mx + mr * 0.05, my - mr * 0.4, mr * 0.09, 0, Math.PI * 2);
    ctx.fill();
    if (mood !== 'dawn') {
      // crescent shading
      ctx.fillStyle = rgba(p.skyTop, 0.5);
      ctx.beginPath();
      ctx.arc(mx - mr * 0.45, my - mr * 0.1, mr * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    // drifting clouds
    const drift = reducedMotion ? 0 : t * 4;
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 0.42 + drift / w * 0.1) % 1.3 - 0.15) * w;
      const cy = h * (0.2 + i * 0.1);
      const s = w * (0.14 + i * 0.05);
      ctx.fillStyle = rgba(mood === 'dawn' ? '#ffcab0' : '#c3d2f2', 0.1 + i * 0.03);
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.45, cy + s * 0.08, s * 0.38, 0, Math.PI * 2);
      ctx.arc(cx - s * 0.42, cy + s * 0.06, s * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }

    // hills
    for (let l = 0; l < 3; l++) {
      const col = l === 0 ? p.hill1 : l === 1 ? p.hill2 : p.hill3;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (const [x, y] of this.hills[l]) ctx.lineTo(x, y + (gardenMode ? h * 0.12 : 0));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    // moon pond reflection (moon mood only, board mode)
    if (mood === 'moon' && !gardenMode) {
      const py = h * 0.86;
      ctx.fillStyle = rgba('#2a3a72', 0.5);
      ctx.beginPath();
      ctx.ellipse(w * 0.5, py, w * 0.6, h * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const yy = py - h * 0.03 + i * h * 0.016;
        const alpha = 0.16 + 0.12 * (reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(t * 1.4 + i));
        ctx.fillStyle = rgba('#f6edd2', alpha);
        const ww = w * (0.3 - i * 0.04);
        roundRect(ctx, w * 0.5 - ww / 2, yy, ww, 2.4, 2);
        ctx.fill();
      }
    }

    // dawn dew sparkles on hills
    if (mood === 'dawn') {
      for (let i = 0; i < 12; i++) {
        const x = (i * 97) % w;
        const y = h * (0.62 + ((i * 53) % 100) / 100 * 0.3);
        const a = reducedMotion ? 0.5 : 0.3 + 0.4 * Math.sin(t * 1.2 + i * 1.3);
        sparkle(ctx, x, y, 2.6, '#ffe9c8', a);
      }
    }

    // occasional shooting star (star mood)
    if (mood === 'star' && !reducedMotion) {
      const cycle = (t % 11) / 11;
      if (cycle < 0.06) {
        const prog = cycle / 0.06;
        const sx = w * (0.2 + 0.6 * prog);
        const sy = h * (0.08 + 0.14 * prog);
        ctx.save();
        ctx.globalAlpha = 0.8 * (1 - prog);
        ctx.strokeStyle = '#fff2cf';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - w * 0.08, sy - h * 0.04);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /** Firefly ambience positions for garden scenes. */
  ambientFireflies(t: number, w: number, h: number, reducedMotion: boolean): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    if (reducedMotion) return out;
    for (let i = 0; i < 7; i++) {
      const a = t * (0.12 + i * 0.02) + i * 2.4;
      const x = w * (0.5 + 0.42 * Math.cos(a * 0.9 + i));
      const y = h * (0.5 + 0.36 * Math.sin(a * 0.7 + i * 1.3));
      out.push([x, y]);
    }
    return out;
  }
}

/** Pick mood from hour if preference is 'auto'. */
export function resolveMood(pref: 'auto' | Mood, now = Date.now()): Mood {
  if (pref !== 'auto') return pref;
  const h = new Date(now).getHours();
  if (h >= 5 && h < 10) return 'dawn';
  if (h >= 10 && h < 18) return 'moon';
  if (h >= 18 && h < 23) return 'moon';
  return 'star';
}
