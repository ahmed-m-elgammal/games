/**
 * Goodnight screen: the peak-end of every session. Calm, warm, rewarding.
 * Shows today's gentle summary + tomorrow's preview, then a sleep glow.
 * "Keep playing" is offered once — never twice, never with guilt.
 */
import { App } from './app';
import { el } from './ui';
import { creaturesByThreshold, creatures } from '../data/creatures';
import { zones } from '../data/plants';
import { audio } from '../audio/audio';

export class GoodnightScreen {
  private keepBtn: HTMLButtonElement | null = null;
  constructor(private app: App) {}

  buildHud(): void {
    const hud = document.getElementById('hud')!;
    const s = this.app.state;
    hud.innerHTML = '';

    const preview = this.tomorrowPreview();
    const minutes = Math.max(1, Math.round((s.session.endedAt ?? Date.now()) - (s.session.startedAt ?? Date.now())) / 60000);
    const card = el('div', 'card');
    card.style.marginTop = '24px';
    card.innerHTML = `
      <div class="chapnum">The garden is asleep</div>
      <h2>Goodnight.</h2>
      <p class="lead">Tonight your garden grew <b style="color:#c8f4e6">${s.serenity} Serenity</b> across ${s.garden.plots.length} planted friend${s.garden.plots.length === 1 ? '' : 's'}, ${s.totalMerges} gentle merge${s.totalMerges === 1 ? '' : 's'}, and about ${minutes.toFixed(0)} soft minute${minutes < 2 ? '' : 's'}.</p>
      <p>Anything half-grown will bloom overnight — the dark hours are when gardens do their quiet work.</p>
      <h3>Tomorrow</h3>
      <p>${preview}</p>
      <div class="cardrow">
        ${!s.session.extraUsed ? '<button class="btn quiet" id="keep">Five more minutes</button>' : ''}
        <button class="btn" id="sleep">Goodnight, garden</button>
      </div>`;
    hud.appendChild(card);

    const keep = card.querySelector('#keep') as HTMLButtonElement | null;
    if (keep) {
      keep.addEventListener('click', () => {
        s.session.extraUsed = true;
        s.session.startedAt = Date.now() - (s.session.lengthMin - 5) * 60000;
        audio.uiTick();
        this.app.keepPlayingFiveMore();
      });
    }
    (card.querySelector('#sleep') as HTMLButtonElement).addEventListener('click', () => {
      audio.goodnight();
      this.app.enterSleepMode();
    });
  }

  /** Non-manipulative preview: nearest creature or zone, no urgency language. */
  private tomorrowPreview(): string {
    const s = this.app.state;
    const nextCreature = creaturesByThreshold.find((c) => s.serenity < c.threshold);
    const nextZone = zones.find((z) => s.serenity < z.need);
    const parts: string[] = [];
    if (nextCreature) {
      parts.push(`Keep an ear out for <b style="color:#ffd9a0">${nextCreature.name} the ${nextCreature.species}</b> — the garden is ${Math.max(1, nextCreature.threshold - s.serenity)} Serenity away from feeling ready for them.`);
    } else {
      parts.push('Every creature of the night has already found you. They will keep coming back to visit their favorite garden.');
    }
    if (nextZone && nextZone.need > (nextCreature?.threshold ?? Infinity)) {
      parts.push(`<b style="color:#c8f4e6">${nextZone.name}</b> stirs closer, at ${nextZone.need}.`);
    }
    return parts.join(' ');
  }

  update(): void {}
  draw(): void {}
  onPointerDown(): void {}
}
