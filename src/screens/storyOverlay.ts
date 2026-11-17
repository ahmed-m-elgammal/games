/** Shared read-along story overlay: gentle line-by-line reveal with soft chimes. */
import { el } from './ui';
import { audio } from '../audio/audio';
import { CreatureDef, Chapter } from '../game/creatures';

export function openStory(opts: {
  creature: CreatureDef;
  chapter: Chapter;
  chapterIdx: number;
  isNewFriend: boolean;
  chaptersLeft: number;
  onClose: () => void;
}): void {
  const overlay = document.getElementById('overlay')!;
  overlay.innerHTML = '';
  const card = el('div', 'card');
  card.innerHTML = `
    <div class="chapnum">${opts.isNewFriend ? 'New friend' : 'Returns'} · ${opts.creature.species}</div>
    <h2>${opts.creature.name}</h2>
    <p class="subtle">${opts.creature.blurb}</p>
    <div class="chapnum" style="margin-top:10px">Chapter ${opts.chapterIdx + 1} · ${opts.chapter.title}</div>
    <div id="storylines" class="story" style="margin-top:6px"></div>
    <p class="subtle" style="margin-top:8px">${opts.chaptersLeft > 0 ? `${opts.chaptersLeft} more chapter${opts.chaptersLeft > 1 ? 's' : ''} will arrive with future visits.` : 'Every chapter of their story has been shared with you.'}</p>
    <div class="cardrow"><button class="btn" id="bye">Goodnight, ${opts.creature.name}</button></div>`;
  overlay.appendChild(card);
  overlay.classList.add('show');

  const linesEl = card.querySelector('#storylines') as HTMLElement;
  const lines = opts.chapter.text.match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g) ?? [opts.chapter.text];
  let idx = 0;
  const showNext = () => {
    if (idx >= lines.length) return;
    const line = el('p', 'line', lines[idx].trim());
    linesEl.appendChild(line);
    window.requestAnimationFrame(() => line.classList.add('on'));
    audio.storyLine();
    idx++;
  };
  showNext();
  const timer = window.setInterval(showNext, 2100);
  card.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).id !== 'bye') showNext();
  });
  (card.querySelector('#bye') as HTMLButtonElement).addEventListener('click', () => {
    window.clearInterval(timer);
    overlay.classList.remove('show');
    opts.onClose();
  });
}
