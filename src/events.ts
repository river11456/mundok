import { deleteLibraryFolder } from './library-actions';
import { storageErrorMessage } from './storage/recovery-ui';
import { sessionCardIndex } from './session-position';
import { S, DOCS, curDoc, resetGrammarView, pushNav, popNav, touchLastStudied, saveLastSession, getLastSession, deleteDocProgress, DRILL_NEXT, DRILL_LEVELS } from './state';
import { folderPath, homeDocs, refsOf, syncUserDocs } from './docs';
import { showDocCreate, showDocAppend, showDocEdit } from './doc-create';
import { showCatalog } from './catalog';
import { showShelfCreate, showShelfRename, showShelfPicker } from './shelf-ui';
import { loadCollections, saveCollections, moveDoc } from './collections';
import { store } from './storage';
import { deleteUserDoc, loadUserDocs } from './user-docs';
import { render } from './render';
import { isShortcutHelpOpen, showShortcutHelp, hideShortcutHelp } from './shortcut-help';
import { isOnboardingOpen } from './onboarding';
import { deleteCard } from './addcard';
import { consumeSuppressedClick, dismissCellSelect } from './cell-select';
import { toggleInterpPlay } from './interp-play';
import { resumeCardDraft, showEditModal } from './editcard';
import { discardHomeDraft, exportHomeDraft } from './draft-list';

// ── Navigation ────────────────────────────────────────────
function closeLibraryAddMenu(): void { S.libraryAddMenu = false; }

function closeLibraryAddMenuView(): void {
  closeLibraryAddMenu();
  render();
}

function focusLibraryAddTrigger(): void {
  document.querySelector<HTMLButtonElement>('.library-add-trigger')?.focus();
}

function focusLibraryAddOption(index = 0): void {
  const options = [...document.querySelectorAll<HTMLButtonElement>('.library-add-option:not(:disabled)')];
  options[Math.max(0, Math.min(index, options.length - 1))]?.focus();
}

function navHome(): void  { resetGrammarView(); closeLibraryAddMenu(); S.navStack = []; S.scr = 'home'; S.mode = null; S.docOverlay = null; S.folderId = null; render(); }

/** 문헌은 본문부터 연다. 문헌 관리 오버레이는 별도 보조 동작이다. */
export function openDoc(id: string): void {
  syncUserDocs();
  if (!DOCS.some(doc => doc.id === id)) { navHome(); return; }
  closeLibraryAddMenu();
  resetGrammarView();
  S.navStack = [];
  S.scr = 'document';
  S.mode = null;
  S.lv = null;
  S.docId = id;
  S.docOverlay = null;
  render();
  window.scrollTo({ top: 0 });
}

function closeOverlay(): void { S.docOverlay = null; render(); }

export function openSentence(id: string, review = false): void {
  const levelIndex = curDoc()?.levels.findIndex(level => level.key === 'sentence') ?? -1;
  if (levelIndex < 0) return;
  const index = curDoc().levels[levelIndex].cards.findIndex(card => card.id === id);
  if (index < 0) return;
  startStudy(levelIndex, index, !review);
}

function startDocumentReview(): void {
  const level = curDoc()?.levels.find(item => item.key === 'sentence');
  if (level?.cards[0]) openSentence(level.cards[0].id, true);
  else if (S.docId) openDoc(S.docId);
}

function navBack(): void {
  closeLibraryAddMenu();
  resetGrammarView();   // 드릴다운 복귀 포함 — 카드 이동은 항상 문법 리셋
  if (S.scr === 'study' && popNav()) { render(); return; }
  if (S.scr === 'study' || S.scr === 'level') openDoc(S.docId!);
  else if (S.scr === 'document') { S.scr = 'home'; S.docOverlay = null; S.mode = null; render(); }
  else if (S.scr === 'home' && S.folderId) {
    const path = folderPath(S.folderId);
    S.folderId = path[path.length - 1]?.parentId ?? null;
    render();
  }
}

function openFolder(id: string | null): void {
  closeLibraryAddMenu();
  S.folderId = id;
  S.docOverlay = null;
  S.scr = 'home';
  render();
}

function startStudy(lvIdx: number, seqStart = 0, revealed = false): void {
  const level = curDoc()?.levels[lvIdx];
  if (!level?.cards.length) return;
  resetGrammarView();
  closeLibraryAddMenu();
  S.docOverlay = null;
  S.navStack = [];
  S.lv = level;
  S.mode = 'seq';
  S.seqIdx = Math.max(0, Math.min(seqStart, level.cards.length - 1));
  S.seqFlipped = revealed;
  S.scr = 'study';
  saveLastSession();
  render();
  window.scrollTo({ top: 0 });
}

/** 홈 히어로 "이어하기" — 마지막 학습 위치로 복귀 (A3). */
function resumeStudy(): void {
  const last = getLastSession();
  if (!last) return;
  const doc = DOCS.find(d => d.id === last.docId);
  const lvIdx = doc?.levels.findIndex(l => l.key === last.lvKey) ?? -1;
  if (!doc) return;
  S.docId = doc.id;
  const index = lvIdx < 0 ? -1 : sessionCardIndex(last, doc.levels[lvIdx].cards);
  if (index < 0) { openDoc(doc.id); return; }
  startStudy(lvIdx, index);
}

function seqPrev(): void {
  if (S.seqIdx > 0) { S.seqIdx--; S.seqFlipped = false; resetGrammarView(); saveLastSession(); render(); }
}

function seqNext(): void {
  if (S.seqIdx < S.lv!.cards.length - 1) { S.seqIdx++; S.seqFlipped = false; resetGrammarView(); saveLastSession(); render(); }
}

/** Space·카드 탭·정답 보기의 공통 동작. */
function flipCard(): void {
  S.seqFlipped = !S.seqFlipped;
  if (S.seqFlipped) touchLastStudied();
  render();
}

// ── Click delegation ──────────────────────────────────────
export function setupClick(): void {
  document.getElementById('app')!.addEventListener('click', e => {
    // 셀 선택 제스처(드래그·해제 탭)의 잔향 클릭 — 플립·드릴 오발동 방지
    if (consumeSuppressedClick()) return;
    const btn = (e.target as Element).closest<HTMLElement>('[data-action]');
    // 文 메뉴 바깥 클릭 → 닫기 (닫은 뒤 클릭된 액션은 계속 처리)
    if (S.grammarMenu && !(e.target as Element).closest('.gram-wrap')) {
      S.grammarMenu = false;
      render();
      if (!btn) return;
    }
    // 라이브러리 추가 메뉴 바깥 클릭 → 닫기 (닫은 뒤 클릭된 액션은 계속 처리)
    if (S.libraryAddMenu && !(e.target as Element).closest('.library-add')) {
      S.libraryAddMenu = false;
      render();
      if (!btn) return;
    }
    if (!btn) {
      // 카드 본문 탭 = 플립 (터치 기본 조작) — 문법 편집 중에는 제외
      // (셀 선택 중 탭은 위 consumeSuppressedClick이 걸러낸다)
      if (S.scr === 'study' && !S.grammarEditMode
          && (e.target as Element).closest('.card-surface')) {
        flipCard();
      }
      return;
    }
    const arg = btn.dataset.arg;

    switch (btn.dataset.action) {
      case 'nav-home':    navHome();                    break;
      case 'nav-back':    navBack();                    break;
      case 'start-study': startStudy(parseInt(arg!));   break;
      case 'open-doc':    openDoc(arg!);                break;
      case 'close-overlay': closeOverlay();             break;
      case 'overlay-backdrop':
        if (e.target === btn) closeOverlay();           // 바깥(백드롭 자체) 클릭만 닫기
        break;
      case 'doc-manage': S.docOverlay = S.docId; render(); break;
      case 'document-review': startDocumentReview(); break;
      case 'overlay-ref':  openDoc(arg!);               break;
      case 'open-folder':  openFolder(arg ? arg : null); break;
      case 'library-add-toggle': {
        const opening = !S.libraryAddMenu;
        S.libraryAddMenu = opening;
        S.grammarMenu = false;
        render();
        if (opening) focusLibraryAddOption(); else focusLibraryAddTrigger();
        break;
      }
      case 'shelf-create': closeLibraryAddMenuView(); showShelfCreate(S.folderId); break;
      case 'shelf-rename': showShelfRename(arg!);       break;
      case 'shelf-delete': {
        const sh = loadCollections().find(s => s.id === arg);
        if (!sh) break;
        if (!confirm(`'${sh.name}' 폴더를 삭제합니다.\n\n담긴 문헌과 하위 폴더는 상위 폴더로 이동합니다. 계속하시겠습니까?`)) break;
        const nextFolderId = sh.parentId ?? null;
        try { deleteLibraryFolder(sh.id); }
        catch (error) { alert(storageErrorMessage(error)); break; }
        const p = store().loadPrefs();   // 접힘 상태 잔재 청소
        store().savePrefs({ ...p, shelvesCollapsed: p.shelvesCollapsed.filter(x => x !== sh.id) });
        if (S.folderId === sh.id) S.folderId = nextFolderId;
        render();
        break;
      }
      case 'doc-move-shelf': if (S.docOverlay) showShelfPicker(S.docOverlay); break;
      case 'resume':      resumeStudy();                break;
      case 'draft-resume': if (arg) resumeCardDraft(arg); break;
      case 'draft-export': if (arg) exportHomeDraft(arg); break;
      case 'draft-discard':
        if (arg && discardHomeDraft(arg, btn.dataset.revision)) render();
        break;
      case 'draft-refresh': render(); break;
      case 'new-doc': {
        const folderId = S.folderId;
        closeLibraryAddMenuView();
        showDocCreate(folderId);
        break;
      }
      case 'open-catalog': {
        const folderId = S.folderId;
        closeLibraryAddMenuView();
        showCatalog(folderId);
        break;
      }
      case 'doc-append':    if (S.docOverlay) showDocAppend(S.docOverlay); break;
      case 'doc-edit-info': if (S.docOverlay) showDocEdit(S.docOverlay);   break;
      case 'doc-export': {
        // C7 — DocJSON 파일 다운로드. 개인 백업 겸 승격(promote.mjs) 입구 (SPEC 5절)
        const dj = S.docOverlay ? loadUserDocs().find(d => d.id === S.docOverlay) : undefined;
        if (!dj) break;
        const blob = new Blob([JSON.stringify(dj, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${dj.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
        break;
      }
      case 'doc-delete': {
        const id  = S.docOverlay;
        const doc = id ? DOCS.find(x => x.id === id) : undefined;
        if (!id || !doc) break;
        if (!confirm(`'${doc.title}' 문헌을 삭제합니다.\n\n카드와 학습 기록이 모두 지워지며 복구할 수 없습니다. 계속하시겠습니까?`)) break;
        deleteUserDoc(id);
        deleteDocProgress(id);
        saveCollections(moveDoc(loadCollections(), id, null));   // 폴더 배치 잔재 청소
        syncUserDocs();
        S.docOverlay = null;
        S.docId = null; S.lv = null; S.mode = null; S.navStack = []; S.scr = 'home';
        render();
        break;
      }
      case 'seq-prev':    seqPrev();                             break;
      case 'seq-next':    seqNext();                             break;
      case 'flip':        flipCard();                            break;
      case 'edit-card': {
        const card = S.lv!.cards[S.seqIdx];
        showEditModal(card, S.lv!.key);
        break;
      }
      case 'delete-card': {
        const card = S.lv!.cards[S.seqIdx];
        deleteCard(S.docId!, S.lv!.key, card.id, card.front);
        break;
      }
      case 'toggle-grammar-menu':
        S.grammarMenu = !S.grammarMenu;
        render();
        break;
      case 'toggle-grammar':
        S.grammarOn = !S.grammarOn;
        if (!S.grammarOn) S.grammarEditMode = false;
        S.grammarMenu = false;
        render();
        break;
      case 'toggle-grammar-edit':
        S.grammarEditMode = !S.grammarEditMode;
        if (S.grammarEditMode) { S.grammarOn = true; S.interpEditMode = false; }
        S.grammarMenu = false;
        render();
        break;
      case 'toggle-interp-edit':
        S.interpEditMode = !S.interpEditMode;
        if (S.interpEditMode) S.grammarEditMode = false;
        S.grammarMenu = false;
        render();
        break;
      case 'interp-play': {
        const card = S.lv!.cards[S.seqIdx];
        toggleInterpPlay(card?.interp);
        break;
      }
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
    const modalOpen = ['ac-overlay', 'ec-overlay', 'ce-overlay', 'ge-overlay', 'dc-overlay', 'ct-overlay', 'sn-overlay', 'sp-overlay'].some(id => {
      const el = document.getElementById(id);   // ge-overlay는 첫 열림 전엔 DOM에 없다 (지연 생성)
      return el !== null && !el.classList.contains('hidden');
    });
    if (modalOpen || document.querySelector('dialog[open]') || isOnboardingOpen()) return;
    if ((e.target as HTMLElement).matches('input,textarea,select,[contenteditable="true"]')) return;

    if (S.libraryAddMenu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const options = [...document.querySelectorAll<HTMLButtonElement>('.library-add-option:not(:disabled)')];
      if (!options.length) return;
      e.preventDefault();
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0
        : e.key === 'End' ? options.length - 1
        : e.key === 'ArrowUp' ? (current <= 0 ? options.length - 1 : current - 1)
        : (current + 1) % options.length;
      focusLibraryAddOption(next);
      return;
    }

    if (e.key === '?') {
      if (isShortcutHelpOpen()) hideShortcutHelp(); else showShortcutHelp();
      return;
    }

    if (e.key === 'Escape') {
      if (isShortcutHelpOpen()) { hideShortcutHelp(); return; }
      if (dismissCellSelect()) return;   // 셀 선택 해제가 뒤로가기보다 우선
      if (S.grammarMenu) { S.grammarMenu = false; render(); return; }
      if (S.libraryAddMenu) { S.libraryAddMenu = false; render(); focusLibraryAddTrigger(); return; }
      if (S.docOverlay) { closeOverlay(); return; }
      navBack();
      return;
    }

    // Let focused controls keep their native Enter/Space activation.
    if ((e.key === 'Enter' || e.code === 'Space')
        && (e.target as HTMLElement).closest('button,a,summary')) return;

    if (S.docOverlay) {
      const i = +e.key - 1;
      const refs = refsOf(S.docOverlay);
      if (refs[i]) openDoc(refs[i].id);
      return;
    }
    if (S.scr === 'home') {
      const i = +e.key - 1;
      const doc = homeDocs(S.folderId);
      if (doc[i]) openDoc(doc[i].id);
    } else if (S.scr === 'document') {
      if (e.key === 'Enter') { e.preventDefault(); startDocumentReview(); }
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
      if (e.code === 'Space') { e.preventDefault(); flipCard(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') seqNext();
      else if (e.key === 'ArrowLeft') seqPrev();
    }
  });
}
