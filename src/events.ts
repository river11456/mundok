import { S, DOCS, curDoc, resetAnki, resetGrammarView, loadAnki, shuffle, pushNav, popNav, touchLastStudied, saveLastSession, getLastSession, toggleShelf, DRILL_NEXT, DRILL_LEVELS } from './state';
import { homeDocs, refsOf } from './docs';
import { render } from './render';
import { isShortcutHelpOpen, showShortcutHelp, hideShortcutHelp } from './shortcut-help';
import { isOnboardingOpen } from './onboarding';
import { showGroupEdit, hideGroupEdit, isGroupEditOpen } from './group-edit';
import { rate } from './anki';
import { deleteCard } from './addcard';
import { showEditModal } from './editcard';
import type { Mode } from './types';

// ── Navigation ────────────────────────────────────────────
function navHome(): void  { resetGrammarView(); S.navStack = []; S.scr = 'home'; S.mode = null; S.docOverlay = null; render(); }
function navMode(id: string): void  { S.docId = id; S.docOverlay = null; S.scr = 'mode';  render(); }

/** 홈 표지 클릭/숫자키 — 참고문헌이 있으면 상세 오버레이, 없으면 바로 mode 화면. */
function openDoc(id: string): void {
  if (refsOf(id).length > 0) { S.docOverlay = id; render(); }
  else navMode(id);
}

function closeOverlay(): void { S.docOverlay = null; render(); }
function navLevel(m: Mode): void    { S.mode  = m;  S.scr = 'level'; render(); }
function navBack(): void {
  resetGrammarView();   // 드릴다운 복귀 포함 — 카드 이동은 항상 문법 리셋
  if (S.scr === 'study' && popNav()) { render(); return; }
  if      (S.scr === 'mode')  navHome();
  else if (S.scr === 'level') navMode(S.docId!);
  else if (S.scr === 'study') navLevel(S.mode!);
}

function startStudy(lvIdx: number, seqStart = 0): void {
  resetGrammarView();
  S.navStack = [];
  S.lv = curDoc().levels[lvIdx];

  if (S.mode === 'seq') {
    S.seqIdx = Math.min(seqStart, S.lv.cards.length - 1);
    S.seqFlipped = false;
  } else {
    S.allCards = loadAnki(S.lv.cards);
    S.queue    = shuffle([...S.allCards]);
    S.total    = S.queue.length;
    S.side     = 'front';
    S.busy     = false;
  }

  S.scr = 'study';
  saveLastSession();
  render();
}

/** 홈 히어로 "이어하기" — 마지막 학습 위치로 복귀 (A3). */
function resumeStudy(): void {
  const last = getLastSession();
  if (!last) return;
  const doc = DOCS.find(d => d.id === last.docId);
  const lvIdx = doc?.levels.findIndex(l => l.key === last.lvKey) ?? -1;
  if (!doc || lvIdx < 0) return;
  S.docId = doc.id;
  S.mode  = last.mode;
  startStudy(lvIdx, last.mode === 'seq' ? last.idx : 0);
}

function hardReset(): void {
  resetAnki();
  startStudy(curDoc().levels.indexOf(S.lv!));
}

function restartStudy(): void {
  startStudy(curDoc().levels.indexOf(S.lv!));
}

function seqPrev(): void {
  if (S.seqIdx > 0) { S.seqIdx--; S.seqFlipped = false; resetGrammarView(); saveLastSession(); render(); }
}

function seqNext(): void {
  if (S.seqIdx < S.lv!.cards.length - 1) { S.seqIdx++; S.seqFlipped = false; resetGrammarView(); saveLastSession(); render(); }
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
      case 'open-doc':    openDoc(arg!);                break;
      case 'close-overlay': closeOverlay();             break;
      case 'overlay-backdrop':
        if (e.target === btn) closeOverlay();           // 바깥(백드롭 자체) 클릭만 닫기
        break;
      case 'overlay-mode': {
        const id = S.docOverlay;
        if (!id) break;
        S.docId = id;
        S.docOverlay = null;
        navLevel(arg! as Mode);                          // mode 화면 생략 → 바로 단위 선택
        break;
      }
      case 'overlay-ref': navMode(arg!);                break;
      case 'toggle-shelf': toggleShelf(arg!); render(); break;
      case 'resume':      resumeStudy();                break;
      case 'edit-groups': showGroupEdit();              break;
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
        deleteCard(S.docId!, S.lv!.key, card.id, card.front);
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
        resetGrammarView();   // 드릴다운 = 다른 카드로 이동
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
    if (e.key === 'Escape' && isGroupEditOpen()) { hideGroupEdit(); return; }
    const modalOpen = ['ac-overlay', 'ec-overlay', 'ce-overlay', 'ge-overlay'].some(id => {
      const el = document.getElementById(id);   // ge-overlay는 첫 열림 전엔 DOM에 없다 (지연 생성)
      return el !== null && !el.classList.contains('hidden');
    });
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
      if (S.scr === 'home' && S.docOverlay) { closeOverlay(); return; }
      navBack();
      return;
    }

    if (S.scr === 'home') {
      const i = +e.key - 1;
      if (S.docOverlay) {
        const refs = refsOf(S.docOverlay);   // 오버레이 안에서는 참고문헌 숫자 배지 우선
        if (refs[i]) navMode(refs[i].id);
        return;
      }
      const doc = homeDocs()[i];   // 서가 표시 순서(참고문헌 제외)와 일치
      if (doc) openDoc(doc.id);

    } else if (S.scr === 'mode') {
      if (e.key === '1') navLevel('seq');
      else if (e.key === '2') navLevel('anki');

    } else if (S.scr === 'level') {
      const i = +e.key - 1;
      const lvs = curDoc().levels;
      if (i >= 0 && i < lvs.length) startStudy(i);

    } else if (S.scr === 'study') {
      // 문법 표시 토글 (문장 카드) — 하단 文法 필과 동일 동작
      if ((e.key === 'g' || e.key === 'G') && S.lv?.key === 'sentence') {
        S.grammarOn = !S.grammarOn;
        if (!S.grammarOn) S.grammarEditMode = false;
        render();
        return;
      }
      if (S.mode === 'seq') {
        if (e.code === 'Space') {
          e.preventDefault();
          S.seqFlipped = !S.seqFlipped;
          // 뒷면(뜻)을 실제로 확인한 시점을 "학습했다"로 간주 — 안키 모드의 rate() 시점과 대응
          if (S.seqFlipped) touchLastStudied();
          render();
        }
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

