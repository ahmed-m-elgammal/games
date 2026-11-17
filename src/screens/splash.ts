/** Splash screen: animated logo + welcome (returning players get a gentle hello). */
import { Ctx } from '../art/draw';
import { getItemSprite } from '../art/sprites';
import { GameState } from '../core/save';

export interface SplashHandle {
  update: (dt: number, t: number) => void;
  draw: (ctx: Ctx, w: number, h: number) => void;
  root: HTMLElement;
}

export function buildSplash(state: GameState, onBegin: (claimDew: boolean) => void, returning: boolean): SplashHandle {
  const root = document.createElement('div');
  const dewReady = state.dew.lastGiftDate !== todayKeyLocal();
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;padding:24px;text-align:center">
      <div style="width:120px;height:120px;position:relative"><canvas id="splashlogo" width="240" height="240" style="width:120px;height:120px"></canvas></div>
      <h1 class="splash-title">Moonpetal</h1>
      <div class="splash-sub">${returning ? 'Welcome back. The garden kept growing while you were away.' : 'A cozy bedtime garden. Merge moonlight, plant it, and let the creatures find you.'}</div>
      <div class="subtle" style="color:#b9aee0;font-size:12.5px;max-width:300px">${dewReady ? 'A fresh dew drop is waiting in the garden.' : ''}</div>
      <button id="begin" class="btn" style="margin-top:18px;min-width:220px">${returning ? 'Return to the garden' : 'Tap to begin'}</button>
      <div style="color:#8f84b8;font-size:11px;margin-top:10px">best with sound on, lights low</div>
    </div>`;
  document.getElementById('hud')!.replaceChildren(root);

  // logo canvas
  const cv = root.querySelector('#splashlogo') as HTMLCanvasElement;
  const cctx = cv.getContext('2d')!;
  const sprite = getItemSprite('moon', 4, 'normal', 200);

  const update = (_dt: number, _t: number): void => { /* logo animates in draw */ };

  const draw = (ctx: Ctx, _w: number, _h: number): void => {
    const t = performance.now() / 1000;
    cctx.clearRect(0, 0, 240, 240);
    const pulse = 0.9 + 0.1 * Math.sin(t * 1.6);
    const g = cctx.createRadialGradient(120, 120, 10, 120, 120, 110);
    g.addColorStop(0, `rgba(255,215,140,${0.25 + 0.08 * Math.sin(t * 1.6)})`);
    g.addColorStop(1, 'rgba(255,215,140,0)');
    cctx.fillStyle = g;
    cctx.fillRect(0, 0, 240, 240);
    const s = 170 * pulse;
    cctx.drawImage(sprite, 120 - s / 2, 120 - s / 2, s, s);
  };

  (root.querySelector('#begin') as HTMLButtonElement).addEventListener('click', () => {
    onBegin(dewReady);
  });

  return { update, draw, root };
}

function todayKeyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
