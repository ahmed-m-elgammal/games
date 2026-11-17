/**
 * Creature Journal: sticker-book with silhouettes for undiscovered creatures,
 * chapter tracking, and a collection progress ring.
 */
import { App } from './app';
import { el, ring, Ring } from './ui';
import { creatures } from '../data/creatures';
import { isDiscovered, discoveredCount, progressOf, welcomeCreature } from '../game/creatures';
import { drawCreature } from '../art/creatureArt';
import { openStory } from './storyOverlay';
import { audio, haptic } from '../audio/audio';

export class JournalScreen {
  private collRing: Ring | null = null;
  constructor(private app: App) {}

  buildHud(): void {
    const hud = document.getElementById('hud')!;
    hud.innerHTML = '';
    const row = el('div', 'hudrow');
    const chip = el('div', 'chip');
    this.collRing = ring(34, 4, '#ffd76e');
    chip.appendChild(this.collRing.root);
    const found = discoveredCount(this.app.state);
    chip.appendChild(el('div', '', `<span class="lbl">Journal</span><br><b>${found} / ${creatures.length}</b>`));
    chip.appendChild(el('div', '', `<span class="lbl">Serenity</span><br><b>${this.app.state.serenity}</b>`));
    row.appendChild(chip);
    hud.appendChild(row);
    this.collRing.setProgress(found / creatures.length);
  }

  render(): void {
    const hud = document.getElementById('hud')!;
    // grid lives in the scrollable middle area of the hud
    const wrap = el('div');
    wrap.style.cssText = 'margin-top:10px;overflow-y:auto;max-height:46vh;padding:2px;';
    const grid = el('div', 'jgrid');
    grid.setAttribute('role', 'list');
    const s = this.app.state;

    const sorted = [...creatures].sort((a, b) => a.threshold - b.threshold);
    for (const c of sorted) {
      const discovered = isDiscovered(s, c.id);
      const card = el('div', `jcard ${discovered ? '' : 'locked'}`);
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', discovered ? `${c.name} the ${c.species}` : `Unknown creature. Reaches the garden at ${c.threshold} Serenity.`);
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 128;
      cv.style.width = '64px';
      cv.style.height = '64px';
      const ctx = cv.getContext('2d')!;
      drawCreature(ctx, c.art, 64, 68, 76, 0, c.palette, { silhouette: !discovered, reducedMotion: true });
      card.appendChild(cv);
      card.appendChild(el('div', 'nm', discovered ? c.name : '???'));
      card.appendChild(el('div', 'ct', discovered ? c.species : `at ${c.threshold} Serenity`));
      if (discovered) {
        const p = progressOf(s, c.id);
        const chapters = el('div', 'chapters');
        for (let i = 0; i < c.chapters.length; i++) {
          chapters.appendChild(el('i', i < p.chaptersRead ? 'read' : ''));
        }
        card.appendChild(chapters);
        if (p.chaptersRead < c.chapters.length && p.visits > 0) {
          card.appendChild(el('span', 'badge-new', 'NEW'));
        }
        card.addEventListener('click', () => this.openDetail(c));
      } else {
        card.addEventListener('click', () => {
          this.app.toast(`${c.species} reaches the garden at ${c.threshold} Serenity. Keep planting.`);
          audio.uiTick();
        });
      }
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    hud.appendChild(wrap);
  }

  private openDetail(def: (typeof creatures)[number]): void {
    haptic(10);
    const s = this.app.state;
    const p = progressOf(s, def.id);
    const overlay = document.getElementById('overlay')!;
    overlay.innerHTML = '';
    const card = el('div', 'card');
    const cv = document.createElement('canvas');
    cv.width = 160;
    cv.height = 160;
    cv.style.cssText = 'width:80px;height:80px;float:right;margin-left:12px;';
    const cctx = cv.getContext('2d')!;
    drawCreature(cctx, def.art, 80, 86, 100, 0, def.palette, { reducedMotion: true });
    card.appendChild(cv);
    card.innerHTML += `
      <div class="chapnum">${def.species}</div>
      <h2>${def.name}</h2>
      <p class="subtle">${def.blurb}</p>
      <p>Visits: <b>${p.visits}</b></p>
      <h3>Story chapters</h3>
      <div id="chapters"></div>
      <div class="cardrow"><button class="btn quiet" id="closej">Close</button></div>`;
    overlay.appendChild(card);
    overlay.classList.add('show');
    const chWrap = card.querySelector('#chapters') as HTMLElement;
    def.chapters.forEach((ch, i) => {
      const read = i < p.chaptersRead;
      const rowEl = el('button', 'btn small quiet', `${read ? ch.title : i === p.chaptersRead ? 'New chapter' : `Chapter ${i + 1}`} ${read ? '' : '· locked'}`) as HTMLButtonElement;
      rowEl.style.cssText = 'width:100%;text-align:left;margin-bottom:6px;';
      rowEl.disabled = !read;
      rowEl.addEventListener('click', () => {
        openStory({
          creature: def,
          chapter: ch,
          chapterIdx: i,
          isNewFriend: false,
          chaptersLeft: 0,
          onClose: () => {
            this.render();
          }
        });
      });
      chWrap.appendChild(rowEl);
    });
    (card.querySelector('#closej') as HTMLButtonElement).addEventListener('click', () => {
      overlay.classList.remove('show');
    });
  }

  update(): void {
    /* journal is DOM-driven */
  }

  draw(): void {
    /* background handled by main */
  }

  onPointerDown(): void {
    /* DOM handles it */
  }

  /** Dev/test helper: welcome a creature programmatically. */
  devWelcome(def: (typeof creatures)[number]): void {
    welcomeCreature(this.app.state, def, Date.now());
  }
}
