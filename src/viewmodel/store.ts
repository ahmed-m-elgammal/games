// ─────────────────────────────────────────────────────────────────────────────
// VIEWMODEL / store — a tiny reactive binding kit. The ViewModel derives
// PortView from the world per tick and notifies the View; the View subscribes,
// renders, and emits Interactions back. No framework, ~60 lines.
// ─────────────────────────────────────────────────────────────────────────────

export class Signal<T> {
  private subs = new Set<(v: T) => void>();

  constructor(private v: T) {}

  get(): T {
    return this.v;
  }

  set(v: T): void {
    this.v = v;
    for (const fn of this.subs) fn(v);
  }

  update(fn: (v: T) => T): void {
    this.set(fn(this.v));
  }

  subscribe(fn: (v: T) => void): () => void {
    this.subs.add(fn);
    fn(this.v);
    return () => this.subs.delete(fn);
  }
}

/**
 * Re-render helper: `render` runs whenever the signal fires, but only when
 * `signature` changes — keeps 20 Hz ticks from thrashing the DOM.
 */
export function watch<T>(
  sig: Signal<T>,
  el: HTMLElement,
  signature: (v: T) => string,
  render: (v: T, el: HTMLElement) => void
): () => void {
  let last: string | null = null;
  return sig.subscribe(v => {
    const s = signature(v);
    if (s === last) return;
    last = s;
    render(v, el);
  });
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> | null = null,
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on") && typeof v === "string") {
        node.addEventListener(k.slice(2).toLowerCase(), new Function("event", v) as EventListener);
      } else node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

export const clockOf = (ticks: number): string => {
  const totalSec = Math.max(0, Math.floor(ticks / 20));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
