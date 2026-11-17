/** Settings: volumes, session length, comfort toggles, mood, reset. */
import { App } from './app';
import { el } from './ui';
import { audio } from '../audio/audio';
import { GameState, SessionMin, MoodPref } from '../core/save';

export class SettingsScreen {
  constructor(private app: App) {}

  buildHud(): void {
    const hud = document.getElementById('hud')!;
    const s = this.app.state;
    hud.innerHTML = '';
    const wrap = el('div');
    wrap.style.cssText = 'margin-top:2px;overflow-y:auto;max-height:58vh;padding:6px 4px;';
    const card = el('div', 'glass');
    card.style.cssText = 'padding:14px 16px;';

    const slider = (label: string, hint: string, value: number, onInput: (v: number) => void) => {
      const row = el('div', 'setrow');
      const lab = el('label', '', `${label}<div class="hint">${hint}</div>`);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(value);
      input.setAttribute('aria-label', label);
      input.addEventListener('input', () => onInput(Number(input.value)));
      row.appendChild(lab);
      row.appendChild(input);
      return row;
    };

    const toggle = (label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => {
      const row = el('div', 'setrow');
      const lab = el('label', '', `${label}<div class="hint">${hint}</div>`);
      const b = el('button', 'toggle') as HTMLButtonElement;
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-checked', String(checked));
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => {
        const next = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(next));
        onChange(next);
        audio.uiTick();
      });
      row.appendChild(lab);
      row.appendChild(b);
      return row;
    };

    const seg = (label: string, values: number[], current: number, onChange: (v: number) => void) => {
      const row = el('div', 'setrow');
      row.appendChild(el('label', '', label));
      const wrapSeg = el('div', 'seg');
      for (const v of values) {
        const b = el('button', v === current ? 'on' : '', String(v)) as HTMLButtonElement;
        b.setAttribute('aria-label', `${label}: ${v} minutes`);
        b.addEventListener('click', () => {
          wrapSeg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          onChange(v);
          audio.uiTick();
        });
        wrapSeg.appendChild(b);
      }
      row.appendChild(wrapSeg);
      return row;
    };

    const moodSeg = (label: string, values: MoodPref[], current: MoodPref, onChange: (v: MoodPref) => void) => {
      const row = el('div', 'setrow');
      row.appendChild(el('label', '', label));
      const wrapSeg = el('div', 'seg');
      for (const v of values) {
        const b = el('button', v === current ? 'on' : '', v === 'auto' ? 'Auto' : v === 'dawn' ? 'Dawn' : v === 'moon' ? 'Moon' : 'Star') as HTMLButtonElement;
        b.addEventListener('click', () => {
          wrapSeg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          onChange(v);
          audio.uiTick();
        });
        wrapSeg.appendChild(b);
      }
      row.appendChild(wrapSeg);
      return row;
    };

    card.appendChild(slider('Master volume', 'Everything, together', s.settings.masterVol, (v) => {
      s.settings.masterVol = v;
      audio.setVolumes(s.settings.masterVol, s.settings.musicVol, s.settings.sfxVol);
      this.app.requestSave();
    }));
    card.appendChild(slider('Music volume', 'Ambient pads, music box, lullaby', s.settings.musicVol, (v) => {
      s.settings.musicVol = v;
      audio.setVolumes(s.settings.masterVol, s.settings.musicVol, s.settings.sfxVol);
      this.app.requestSave();
    }));
    card.appendChild(slider('Effects volume', 'Taps, chimes, soft pops', s.settings.sfxVol, (v) => {
      s.settings.sfxVol = v;
      audio.setVolumes(s.settings.masterVol, s.settings.musicVol, s.settings.sfxVol);
      this.app.requestSave();
    }));
    card.appendChild(toggle('Haptics', 'Gentle vibrations on merges', s.settings.haptics, (v) => {
      s.settings.haptics = v;
      audio.haptics = v;
      this.app.requestSave();
    }));
    card.appendChild(toggle('Reduced motion', 'Calmer movement, fewer particles', s.settings.reducedMotion, (v) => {
      s.settings.reducedMotion = v;
      this.app.particles.enabled = !v;
      this.app.requestSave();
    }));
    card.appendChild(toggle('Shape assist', 'Extra outlines — every item already has a unique shape', s.settings.colorAssist, (v) => {
      s.settings.colorAssist = v;
      this.app.requestSave();
    }));
    card.appendChild(toggle('Auto-dim', 'Warm, blue-light-reduced tint', s.settings.autoDim, (v) => {
      s.settings.autoDim = v;
      this.app.applyAutoDim();
      this.app.requestSave();
    }));
    card.appendChild(seg('Session length', [5, 10, 15, 20], s.settings.sessionMin, (v) => {
      s.settings.sessionMin = v as SessionMin;
      s.session.lengthMin = v as SessionMin;
      this.app.toast(`Sessions will now wind down after about ${v} minutes.`);
      this.app.requestSave();
    }));
    card.appendChild(moodSeg('Board mood', ['auto', 'dawn', 'moon', 'star'], s.settings.mood, (v) => {
      s.settings.mood = v;
      this.app.requestSave();
    }));

    const about = el('p', 'subtle', `Moonpetal v1.0 — a cozy bedtime game. No accounts, no ads, no purchases. Progress lives only on this device. Wind-down happens at the end of every session; the garden blooms overnight. Made to be put down, not to keep you here.`);
    about.style.marginTop = '14px';
    card.appendChild(about);

    const resetBtn = el('button', 'btn small quiet', 'Reset all progress') as HTMLButtonElement;
    resetBtn.style.marginTop = '10px';
    resetBtn.addEventListener('click', () => this.confirmReset());
    card.appendChild(resetBtn);

    wrap.appendChild(card);
    hud.appendChild(wrap);
  }

  private confirmReset(): void {
    const overlay = document.getElementById('overlay')!;
    overlay.innerHTML = '';
    const card = el('div', 'card');
    card.innerHTML = `
      <h2>Start over?</h2>
      <p>This clears the garden, the journal, and every petal. There is no undo.</p>
      <div class="cardrow">
        <button class="btn quiet" id="nokeep">Keep my garden</button>
        <button class="btn" id="yesreset">Reset</button>
      </div>`;
    overlay.appendChild(card);
    overlay.classList.add('show');
    (card.querySelector('#nokeep') as HTMLButtonElement).addEventListener('click', () => {
      overlay.classList.remove('show');
    });
    (card.querySelector('#yesreset') as HTMLButtonElement).addEventListener('click', () => {
      overlay.classList.remove('show');
      this.app.resetProgress();
    });
  }

  update(): void {}
  draw(): void {}
  onPointerDown(): void {}
}

export type { GameState };
