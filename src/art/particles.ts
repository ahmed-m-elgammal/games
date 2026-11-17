/** Particle system: merge bursts, sparkles, ambient drift. Lightweight & capped. */
import { Ctx, glow, sparkle } from './draw';
import { looseRng } from '../core/rng';

interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number;
  color: string; kind: 'dot' | 'star' | 'ring';
  drag: number; grav: number;
}

export class Particles {
  private ps: P[] = [];
  enabled = true;

  burst(x: number, y: number, colors: string[], n = 14, speed = 90): void {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      const a = looseRng.range(0, Math.PI * 2);
      const sp = looseRng.range(speed * 0.3, speed);
      const max = looseRng.range(0.5, 1.1);
      this.ps.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.25,
        life: max, max,
        size: looseRng.range(2.2, 4.6),
        color: colors[i % colors.length],
        kind: looseRng.next() < 0.22 ? 'star' : 'dot',
        drag: 0.94, grav: 34
      });
    }
    this.cap();
  }

  ring(x: number, y: number, color: string, size = 26): void {
    if (!this.enabled) return;
    this.ps.push({ x, y, vx: 0, vy: 0, life: 0.55, max: 0.55, size, color, kind: 'ring', drag: 1, grav: 0 });
    this.cap();
  }

  sparkleAt(x: number, y: number, color = '#fff6d8'): void {
    if (!this.enabled) return;
    const max = looseRng.range(0.6, 1.2);
    this.ps.push({
      x, y, vx: looseRng.range(-8, 8), vy: looseRng.range(-30, -8),
      life: max, max, size: looseRng.range(3, 6),
      color, kind: 'star', drag: 0.98, grav: 6
    });
    this.cap();
  }

  ambient(x: number, y: number, color: string, speed = 6): void {
    if (!this.enabled) return;
    const max = looseRng.range(2.5, 4.5);
    this.ps.push({
      x, y, vx: looseRng.range(-speed, speed), vy: looseRng.range(-speed, speed),
      life: max, max, size: looseRng.range(1.6, 3),
      color, kind: 'dot', drag: 1, grav: 0
    });
    this.cap();
  }

  private cap(): void {
    while (this.ps.length > 140) this.ps.shift();
  }

  update(dt: number): void {
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) { this.ps.splice(i, 1); continue; }
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: Ctx): void {
    for (const p of this.ps) {
      const t = p.life / p.max;
      const a = Math.min(1, t * 1.6);
      if (p.kind === 'ring') {
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a * 0.7;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - t) * 2.4), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'star') {
        sparkle(ctx, p.x, p.y, p.size * (0.6 + t * 0.6), p.color, a);
      } else {
        glow(ctx, p.x, p.y, p.size * 2.6, p.color, a * 0.9);
      }
    }
  }

  get count(): number {
    return this.ps.length;
  }

  clear(): void {
    this.ps = [];
  }
}
