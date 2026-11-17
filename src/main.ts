/**
 * Moonpetal — a cozy bedtime merge-garden.
 * Boot, screen manager, session wind-down state machine, PWA registration.
 */
import './styles.css';
import { GameState, localStorageLoad, localStorageSave, serialize, applyOffline, newSession, defaultState, migrate } from './core/save';
import { Rng } from './core/rng';
import { BoardModel } from './game/board';
import { Particles } from './art/particles';
import { Background, resolveMood } from './art/background';
import { audio } from './audio/audio';
import { App, ScreenName, SessionPhase } from './screens/app';
import { BoardScreen } from './screens/boardScreen';
import { GardenScreen } from './screens/gardenScreen';
import { JournalScreen } from './screens/journalScreen';
import { SettingsScreen } from './screens/settingsScreen';
import { GoodnightScreen } from './screens/goodnight';
import { buildSplash } from './screens/splash';
import { zones } from './data/plants';
import { checkZoneUnlocks } from './game/garden';
import { creaturesByThreshold } from './data/creatures';
import { Ctx } from './art/draw';

/* ---------- state ---------- */
const loaded = localStorageLoad();
const state: GameState = loaded.state;
const offline = applyOffline(state, Date.now());
const board = new BoardModel(state.board.cells);
state.board.cells = board.cells;

/* ---------- dom ---------- */
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dim = document.getElementById('dim')!;
const nav = document.getElementById('nav')!;
const overlayEl = document.getElementById('overlay')!;
const srEl = document.getElementById('sr')!;
const fader = document.getElementById('fader')!;

const particles = new Particles();
particles.enabled = !state.settings.reducedMotion;
const bg = new Background();

let current: ScreenName = 'splash';
let phase: SessionPhase = 'idle';
let gardenZoneArg = -1;
let toastTimer: number | null = null;
let saveTimer: number | null = null;
let hiddenAt: number | null = null;
let splashHandle: { update: (dt: number, t: number) => void; draw: (ctx: Ctx, w: number, h: number) => void } | null = null;
let hudRefreshAcc = 0;

/* ---------- app facade (screens hold this reference) ---------- */
const appFacade: App = {
  state,
  board,
  particles,
  bg,
  get sessionPhase() {
    return phase;
  },
  set sessionPhase(v: SessionPhase) {
    phase = v;
  },
  goto(name: ScreenName, arg?: number) {
    setScreen(name, arg);
  },
  toast(msg: string) {
    toast(msg);
  },
  sr(msg: string) {
    srEl.textContent = msg;
  },
  requestSave() {
    scheduleSave();
  },
  checkZonesAndCreatures() {
    const newly = checkZoneUnlocks(state, zones);
    for (const name of newly) {
      toast(`A new part of the garden wakes up: ${name}`);
      audio.bloom();
    }
    const next = creaturesByThreshold.find((c) => !(state.creatures[c.id]?.visits > 0) && state.serenity >= c.threshold);
    if (next) {
      toast('The garden feels ready for someone soft. Visit the Garden tab when you like.');
    }
  },
  lureCreatures() {
    state.garden.visitCooldownUntil = 0;
    state.garden.lureUntil = Date.now() + 45000;
  },
  get gardenZone() {
    return gardenZoneArg;
  },
  set gardenZone(v: number) {
    gardenZoneArg = v;
  },
  reducedMotion() {
    return state.settings.reducedMotion;
  },
  applyAutoDim,
  keepPlayingFiveMore,
  enterSleepMode,
  resetProgress
} as App;

const boardScreen = new BoardScreen(appFacade);
const gardenScreen = new GardenScreen(appFacade);
const journalScreen = new JournalScreen(appFacade);
const settingsScreen = new SettingsScreen(appFacade);
const goodnightScreen = new GoodnightScreen(appFacade);

/* ---------- helpers ---------- */
function toast(msg: string): void {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 3400);
}

function scheduleSave(): void {
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    localStorageSave(state);
  }, 2000);
}

function saveNow(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  localStorageSave(state);
}

function applyAutoDim(): void {
  dim.classList.toggle('soft', state.settings.autoDim);
}

/* ---------- screens ---------- */
function setScreen(name: ScreenName, arg?: number): void {
  const first = current;
  current = name;
  overlayEl.classList.remove('show');

  const showNav = name === 'board' || name === 'garden' || name === 'journal' || name === 'settings';
  nav.classList.toggle('hidden', !showNav);
  document.querySelectorAll('.navbtn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-nav') === name);
  });
  dim.classList.remove('warm', 'starsleep');
  if (name !== 'goodnight') applyAutoDim();

  if (first !== name && first !== 'sleep') {
    fader.classList.add('show');
    window.setTimeout(() => {
      switchTo(name, arg);
      fader.classList.remove('show');
    }, 240);
  } else {
    switchTo(name, arg);
  }
}

function switchTo(name: ScreenName, arg?: number): void {
  const hud = document.getElementById('hud')!;
  switch (name) {
    case 'splash': {
      hud.innerHTML = '';
      const returning = state.totalMerges > 0 || state.garden.plots.length > 0;
      splashHandle = buildSplash(state, (dewReady) => {
        audio.init();
        audio.setVolumes(state.settings.masterVol, state.settings.musicVol, state.settings.sfxVol);
        audio.haptics = state.settings.haptics;
        if (dewReady && returning) {
          toast('A fresh dew drop waits in the garden.');
        }
        if (offline.bloomed.length > 0) {
          toast('Overnight, your garden bloomed.');
        }
        if (state.session.startedAt === null) newSession(state, Date.now());
        setScreen('board');
      }, returning);
      break;
    }
    case 'board': {
      splashHandle = null;
      boardScreen.buildHud();
      break;
    }
    case 'garden': {
      splashHandle = null;
      gardenScreen.enter(arg ?? -1);
      break;
    }
    case 'journal': {
      splashHandle = null;
      journalScreen.buildHud();
      journalScreen.render();
      break;
    }
    case 'settings': {
      splashHandle = null;
      settingsScreen.buildHud();
      break;
    }
    case 'goodnight': {
      splashHandle = null;
      phase = 'goodnight';
      state.session.endedAt = Date.now();
      audio.lullaby(true);
      dim.classList.add('warm');
      goodnightScreen.buildHud();
      saveNow();
      break;
    }
    default:
      break;
  }
}

/* ---------- session wind-down machine ---------- */
const WINDOWN_S = 18;
const PEAK_LAST_S = 60;

function sessionTick(): void {
  if (current === 'goodnight' || state.session.startedAt === null) return;
  const len = state.session.lengthMin * 60000;
  const elapsed = Date.now() - state.session.startedAt;
  if (phase === 'idle' && elapsed >= len - PEAK_LAST_S * 1000) {
    phase = 'peak';
    toast('The garden is at its most beautiful right now.');
  }
  if (phase === 'peak' && elapsed >= len) {
    beginWindDown();
  }
}

function beginWindDown(): void {
  phase = 'winddown';
  dim.classList.add('warm');
  audio.lullaby(true);
  audio.goodnight();
  toast('The garden is getting sleepy. Finish your softest thought...');
  state.session.startedAt = null; // stop counting
  window.setTimeout(() => {
    setScreen('goodnight');
  }, WINDOWN_S * 1000);
}

function keepPlayingFiveMore(): void {
  phase = 'idle';
  audio.lullaby(false);
  dim.classList.remove('warm');
  applyAutoDim();
  toast('Five more soft minutes.');
  state.session.startedAt = Date.now() - (state.session.lengthMin - 5) * 60000;
  setScreen('board');
}

function enterSleepMode(): void {
  audio.lullaby(false);
  saveNow();
  setScreen('sleep');
  dim.classList.add('starsleep');
  const hud = document.getElementById('hud')!;
  hud.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:52vh;gap:12px">
    <div style="width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #fff7dd, #f2dfa8 60%, #d8bf80);box-shadow:0 0 40px rgba(255,230,170,.5)"></div>
    <div style="color:#d8ccf0;font-size:15px">Shhh. Tap anywhere to wake the garden.</div>
  </div>`;
  nav.classList.add('hidden');
  const wake = () => {
    window.removeEventListener('pointerdown', wake);
    window.location.reload(); // boot re-runs offline math: overnight blooms, dew, energy
  };
  window.setTimeout(() => window.addEventListener('pointerdown', wake), 600);
}

function resetProgress(): void {
  const fresh = defaultState(Date.now());
  const migrated = migrate(JSON.parse(serialize(fresh)));
  Object.assign(state, migrated);
  board.cells = state.board.cells;
  saveNow();
  window.location.reload();
}

/* ---------- nav ---------- */
document.querySelectorAll('.navbtn').forEach((b) => {
  b.addEventListener('click', () => {
    const target = b.getAttribute('data-nav') as ScreenName;
    if (target === current) return;
    audio.uiTick();
    setScreen(target);
  });
});

/* ---------- pointer routing ---------- */
function canvasPos(ev: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [ev.clientX - r.left, ev.clientY - r.top];
}
canvas.addEventListener('pointerdown', (ev) => {
  audio.resume();
  const [x, y] = canvasPos(ev);
  if (current === 'board') boardScreen.onPointerDown(x, y);
  else if (current === 'garden') gardenScreen.onPointerDown(x, y);
});
canvas.addEventListener('pointermove', (ev) => {
  const [x, y] = canvasPos(ev);
  if (current === 'board') boardScreen.onPointerMove(x, y);
});
canvas.addEventListener('pointerup', (ev) => {
  const [x, y] = canvasPos(ev);
  if (current === 'board') boardScreen.onPointerUp(x, y);
});

/* ---------- visibility ---------- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    saveNow();
    audio.suspend();
  } else {
    if (hiddenAt !== null && state.session.startedAt !== null) {
      state.session.startedAt += Date.now() - hiddenAt;
    }
    hiddenAt = null;
    audio.resume();
  }
});

/* ---------- resize ---------- */
let vw = window.innerWidth;
let vh = window.innerHeight;
function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  vw = window.innerWidth;
  vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  boardScreen.layout(vw, vh);
  bg.resize(vw, vh, resolveMood(state.settings.mood, Date.now()));
}
window.addEventListener('resize', resize);
resize();

/* ---------- main loop ---------- */
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  sessionTick();
  particles.update(dt);

  const mood = resolveMood(state.settings.mood, Date.now());
  const gardenMode = current === 'garden';
  bg.draw(ctx, vw, vh, mood, t, state.settings.reducedMotion, gardenMode);
  particles.draw(ctx);

  if (current === 'splash' && splashHandle) {
    splashHandle.draw(ctx, vw, vh);
  } else if (current === 'board') {
    boardScreen.update(dt, t);
    boardScreen.draw(ctx, vw, vh, t);
    hudRefreshAcc += dt;
    if (hudRefreshAcc > 0.5) {
      hudRefreshAcc = 0;
      boardScreen.updateHud();
    }
  } else if (current === 'garden') {
    gardenScreen.update(dt, t);
    gardenScreen.draw(ctx, vw, vh, t);
  }

  window.requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
applyAutoDim();
setScreen('splash');
window.requestAnimationFrame(frame);
setInterval(() => saveNow(), 20000);
window.addEventListener('pagehide', saveNow);

/* PWA */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

/* ---------- debug API (#debug) ---------- */
if (location.hash.includes('debug')) {
  const dbgRng = () => new Rng((Date.now() ^ 0x5eed) >>> 0);
  (window as any).__mp = {
    state,
    board,
    save: saveNow,
    spawn(n = 5) {
      const r = dbgRng();
      for (let i = 0; i < n; i++) board.spawnSeed(r, 'normal');
      boardScreen.buildHud();
    },
    fill() {
      const r = dbgRng();
      for (let i = 0; i < 45; i++) board.spawnSeed(r, 'normal');
      boardScreen.buildHud();
    },
    autoMerge(n = 10) {
      let done = 0;
      for (let k = 0; k < n * 40 && done < n; k++) {
        const map = new Map<string, number[]>();
        board.cells.forEach((it, i) => {
          if (it) {
            const cap = it.chain === 'moon' ? 6 : 5;
            if (it.tier < cap) {
              const key = `${it.chain}${it.tier}`;
              if (!map.has(key)) map.set(key, []);
              map.get(key)!.push(i);
            }
          }
        });
        let merged = false;
        for (const [, list] of map) {
          if (list.length >= 2) {
            board.drop(list[0], list[1]);
            state.totalMerges++;
            done++;
            merged = true;
            break;
          }
        }
        if (!merged) break;
      }
      boardScreen.buildHud();
      return done;
    },
    serenity(n: number) {
      state.serenity = n;
      appFacade.checkZonesAndCreatures();
      saveNow();
    },
    forceVisit() {
      setScreen('garden');
      window.setTimeout(() => gardenScreen.debugVisit(), 900);
    },
    winddown() {
      beginWindDown();
    },
    goodnight() {
      setScreen('goodnight');
    },
    setLastSeenAgo(hours: number) {
      state.lastSeen = Date.now() - hours * 3600000;
      saveNow();
    },
    bloomAll() {
      for (const p of state.garden.plots) {
        if (!p.bloomed) {
          p.bloomed = true;
          p.bloomedAt = Date.now();
          p.revealed = false;
          state.garden.revealQueue.push({ plantId: p.plantId, zone: p.zone, slot: p.slot });
        }
      }
      saveNow();
    }
  };
  console.log('[moonpetal] debug API ready: window.__mp');
}
