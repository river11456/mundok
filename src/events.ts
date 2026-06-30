import { S, curDoc, resetAnki, loadAnki, shuffle, pushNav, popNav, DRILL_NEXT, DRILL_LEVELS } from './state';
import { homeDocs } from './docs';
import { render, isShortcutHelpOpen, showShortcutHelp, hideShortcutHelp, isOnboardingOpen } from './render';
import { rate } from './anki';
import { deleteCard } from './addcard';
import { showEditModal } from './editcard';
import type { Mode } from './types';

// ── Navigation ────────────────────────────────────────────
function navHome(): void  { S.grammarEditMode = false; S.navStack = []; S.scr = 'home'; S.mode = null; render(); }
function navMode(id: string): void  { S.docId = id; S.scr = 'mode';  render(); }
function navLevel(m: Mode): void    { S.mode  = m;  S.scr = 'level'; render(); }
function navBack(): void {
  S.grammarEditMode = false;
  if (S.scr === 'study' && popNav()) { render(); return; }
  if      (S.scr === 'mode')  navHome();
  else if (S.scr === 'level') navMode(S.docId!);
  else if (S.scr === 'study') navLevel(S.mode!);
}

function startStudy(lvIdx: number): void {
  S.navStack = [];
  S.lv = curDoc().levels[lvIdx];

  if (S.mode === 'seq') {
    S.seqIdx = 0;
    S.seqFlipped = false;
  } else {
    S.allCards = loadAnki(S.lv.cards);
    S.queue    = shuffle([...S.allCards]);
    S.total    = S.queue.length;
    S.side     = 'front';
    S.busy     = false;
  }

  S.scr = 'study';
  render();
}

function hardReset(): void {
  resetAnki();
  startStudy(curDoc().levels.indexOf(S.lv!));
}

function restartStudy(): void {
  startStudy(curDoc().levels.indexOf(S.lv!));
}

function seqPrev(): void {
  if (S.seqIdx > 0) { S.seqIdx--; S.seqFlipped = false; render(); }
}

function seqNext(): void {
  if (S.seqIdx < S.lv!.cards.length - 1) { S.seqIdx++; S.seqFlipped = false; render(); }
}

// ── Click delegation ──────────────────────────────────────
export function setupClick(): void {
  document.getElementById('app')!.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const arg = btn.dataset.arg;

    switch (btn.dataset.action) {
      case 'nav-home':    navHome();                    break;
      case 'nav-back':    navBack();                    break;
      case 'nav-mode':    navMode(arg!);                break;
      case 'nav-level':   navLevel(arg! as Mode);       break;
      case 'start-study': startStudy(parseInt(arg!));   break;
      case 'seq-prev':    seqPrev();                             break;
      case 'seq-next':    seqNext();                             break;
      case 'restart':     restartStudy();                        break;
      case 'anki-rate':   rate(parseInt(arg!) as 1|2|3);        break;
      case 'edit-card': {
        const card = S.mode === 'seq' ? S.lv!.cards[S.seqIdx] : S.queue[0];
        showEditModal(card, S.lv!.key);
        break;
      }
      case 'delete-card': {
        const card = S.mode === 'seq' ? S.lv!.cards[S.seqIdx] : S.queue[0];
        deleteCard(S.docId!, S.lv!.key, card.front);
        break;
      }
      case 'toggle-refs': {
        const isExpanded = S.expandedRefGroups.has(arg!);
        if (isExpanded) S.expandedRefGroups.delete(arg!);
        else S.expandedRefGroups.add(arg!);
        const container = document.getElementById(`ref-group-${arg!}`);
        const chevron   = btn.querySelector<HTMLElement>('span');
        if (container) container.classList.toggle('hidden');
        if (chevron)   chevron.style.transform = `rotate(${isExpanded ? 0 : 90}deg)`;
        break;
      }
      case 'toggle-grammar':
        S.grammarOn = !S.grammarOn;
        if (!S.grammarOn) S.grammarEditMode = false;
        render();
        break;
      case 'toggle-grammar-edit':
        S.grammarEditMode = !S.grammarEditMode;
        if (S.grammarEditMode) S.grammarOn = true;
        render();
        break;
      case 'drill-down': {
        const keys = DRILL_LEVELS[S.lv!.key] ?? [DRILL_NEXT[S.lv!.key]].filter(Boolean);
        let nextLevel = undefined as ReturnType<typeof curDoc>['levels'][number] | undefined;
        let cardIdx   = -1;
        for (const key of keys) {
          const lv = curDoc().levels.find(l => l.key === key);
          if (!lv) continue;
          const idx = lv.cards.findIndex(c => c.id === arg);
          if (idx >= 0) { nextLevel = lv; cardIdx = idx; break; }
        }
        if (!nextLevel || cardIdx < 0) break;
        pushNav();
        S.lv         = nextLevel;
        S.mode       = 'seq';
        S.seqIdx     = cardIdx;
        S.seqFlipped = false;
        render();
        break;
      }
    }
  });
}

// ── Keyboard ──────────────────────────────────────────────
export function setupKeyboard(): void {
  document.addEventListener('keydown', e => {
    const modalOpen = ['ac-overlay', 'ec-overlay', 'ce-overlay'].some(
      id => !document.getElementById(id)?.classList.contains('hidden')
    );
    if (modalOpen || isOnboardingOpen()) return;

    // Hard reset (anki only)
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      if (S.scr === 'study' && S.mode === 'anki') hardReset();
      return;
    }

    if (e.key === '?') {
      if (isShortcutHelpOpen()) hideShortcutHelp(); else showShortcutHelp();
      return;
    }

    if (e.key === 'Escape') {
      if (isShortcutHelpOpen()) { hideShortcutHelp(); return; }
      navBack();
      return;
    }

    if (S.scr === 'home') {
      const i = +e.key - 1;
      const doc = homeDocs()[i];   // 화면 표시 순서(참고문헌 제외)와 일치
      if (doc) navMode(doc.id);

    } else if (S.scr === 'mode') {
      if (e.key === '1') navLevel('seq');
      else if (e.key === '2') navLevel('anki');

    } else if (S.scr === 'level') {
      const i = +e.key - 1;
      const lvs = curDoc().levels;
      if (i >= 0 && i < lvs.length) startStudy(i);

    } else if (S.scr === 'study') {
      if (S.mode === 'seq') {
        if (e.code === 'Space')        { e.preventDefault(); S.seqFlipped = !S.seqFlipped; render(); }
        else if (e.key === 'ArrowRight' || e.key === 'Enter') seqNext();
        else if (e.key === 'ArrowLeft') seqPrev();
      } else {
        if (S.side === 'front' && e.code === 'Space') { e.preventDefault(); S.side = 'back'; render(); }
        else if (S.side === 'back') {
          if (e.key === '1') rate(1);
          else if (e.key === '2') rate(2);
          else if (e.key === '3') rate(3);
        } else if (S.side === 'result' && (e.key === 'r' || e.key === 'R')) {
          restartStudy();
        }
      }
    }
  });
}

