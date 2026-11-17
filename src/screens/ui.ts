/** Shared DOM/UI helpers for screens. */
import { GameState } from '../core/save';
import { audio } from '../audio/audio';

export function el(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export interface Ring {
  root: SVGSVGElement;
  setProgress: (p: number) => void;
}

export function ring(size: number, stroke: number, fillColor = '#6fe3c1'): Ring {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.classList.add('ring');
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const track = document.createElementNS(ns, 'circle');
  track.setAttribute('cx', String(size / 2));
  track.setAttribute('cy', String(size / 2));
  track.setAttribute('r', String(r));
  track.setAttribute('stroke-width', String(stroke));
  track.classList.add('track');
  const fill = document.createElementNS(ns, 'circle');
  fill.setAttribute('cx', String(size / 2));
  fill.setAttribute('cy', String(size / 2));
  fill.setAttribute('r', String(r));
  fill.setAttribute('stroke-width', String(stroke));
  fill.classList.add('fill');
  fill.setAttribute('stroke', fillColor);
  fill.setAttribute('stroke-dasharray', String(c));
  fill.setAttribute('stroke-dashoffset', String(c));
  svg.appendChild(track);
  svg.appendChild(fill);
  return {
    root: svg,
    setProgress(p: number) {
      // goal-gradient: ease-in — the ring visibly speeds up near completion
      const eased = Math.pow(Math.min(1, Math.max(0, p)), 0.85);
      fill.setAttribute('stroke-dashoffset', String(c * (1 - eased)));
    }
  };
}

export function dewBadge(): HTMLElement {
  return el('span', 'dewbadge');
}

export function setEnergyBar(bar: HTMLElement | null, v: number, max: number): void {
  if (!bar) return;
  const i = bar.querySelector('i') as HTMLElement | null;
  if (i) i.style.width = `${Math.round((v / max) * 100)}%`;
}

export function positionPop(pop: HTMLElement, x: number, y: number, vw: number, vh: number): void {
  const r = pop.getBoundingClientRect();
  let px = Math.min(Math.max(10, x - r.width / 2), vw - r.width - 10);
  let py = Math.min(Math.max(10, y - r.height - 14), vh - r.height - 10);
  if (py < 10) py = y + 16;
  pop.style.left = `${px}px`;
  pop.style.top = `${py}px`;
}

export function dismissable(pop: HTMLElement, onDismiss: () => void): void {
  const close = (ev: Event) => {
    if (!pop.contains(ev.target as Node)) {
      pop.remove();
      document.removeEventListener('pointerdown', close, true);
      onDismiss();
    }
  };
  window.setTimeout(() => document.addEventListener('pointerdown', close, true), 30);
}

export function playTick(): void {
  audio.uiTick();
}
