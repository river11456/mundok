import '../../../src/style.css';
import './prototype.css';
import { render } from '../../../src/render';
import { DOCS, initDocs, syncUserDocs, homeDocs } from '../../../src/docs';
import { S, resetGrammarView } from '../../../src/state';
import { setupClick, setupKeyboard } from '../../../src/events';
import { initEditCard } from '../../../src/editcard';
import { initAddCard } from '../../../src/addcard';
import { initCellSelect } from '../../../src/cell-select';
import { initGrammarEdit } from '../../../src/grammar-edit';
import { initDocCreate } from '../../../src/doc-create';
import { initShortcutHelp } from '../../../src/shortcut-help';
import { initOnboarding } from '../../../src/onboarding';
import { acquireEditingSession } from '../../../src/storage/editing-session';
import { USER_DOCS_KEY, loadUserDocs } from '../../../src/user-docs';
import { V3_COLLECTIONS_KEY } from '../../../src/collections';
import { V3_PREFS_KEY, V3_SESSION_KEY } from '../../../src/migrate-v1';
import { esc, backBtn, homeBtn } from '../../../src/render-shared';
import type { CardJSON } from '../../../src/types';
import { designateRange, insertBlock, mergeBlocks, moveBlock, migrateLegacyNotes } from './model';
import daeyi from '../../../catalog/대의정성.json';
import sanggo from '../../../catalog/상고천진론.json';
import sagi from '../../../catalog/사기조신대론.json';

// This entry is never imported by src/main.ts or included in the release build.
const MARKER = 'mundok-prototype/sentence-blocks-v1';
const app = document.getElementById('app')!;
let documentId: string | null = null;
let selected = new Set<string>();
let selectedRange: { start: { id: string; offset: number }; end: { id: string; offset: number } } | null = null;
let suppressedClickUntil = 0;
let insertAt = 0;
let drag: { id: string; start: number; slot: number; moved: boolean; pointerId: number; handle: HTMLElement } | null = null;
const histories = new Map<string, { before: CardJSON[]; after: string }[]>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const current = () => loadUserDocs().find(doc => doc.id === documentId)!;
const cards = () => current().levels.sentence ?? [];
const modalOpen = () => document.querySelector('.pb-add-dialog[open], #ec-overlay:not(.hidden), #ac-overlay:not(.hidden), #ce-overlay:not(.hidden), #ge-overlay:not(.hidden)') !== null;

function announce(message: string): void { $('pb-status').textContent = message; }

function guardAndSeed(): void {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    throw new Error('이 목업은 별도의 로컬 주소에서만 실행합니다.');
  }
  const keys = Object.keys(localStorage);
  if (localStorage.getItem(MARKER) !== '1' && keys.some(key => /^(mundok-|hanja-v2\/)/.test(key))) {
    throw new Error('이 주소에 기존 문독 데이터가 있습니다. 다른 로컬 포트에서 목업을 실행하세요. 기존 데이터는 변경하지 않았습니다.');
  }
  if (localStorage.getItem(MARKER) === '1') return;
  const samples = [daeyi, sanggo, sagi].map((raw, i) => ({
    ...clone(raw), id: `preview-${raw.id}`, schemaVersion: 3, order: i,
    color: ['#F8E3D1', '#E3EDD9', '#DCE8F2'][i],
  }));
  localStorage.setItem(MARKER, '1');
  localStorage.setItem(USER_DOCS_KEY, JSON.stringify(samples));
  localStorage.setItem(V3_COLLECTIONS_KEY, '[]');
  localStorage.setItem(V3_PREFS_KEY, JSON.stringify({ shelvesCollapsed: [], onboardingSeen: true }));
  localStorage.setItem(V3_SESSION_KEY, JSON.stringify({ last: null, streak: { lastDate: '', count: 0, todayCards: 0 } }));
}

function dismissSelection(): void {
  selectedRange = null;
  $('pb-selection').hidden = true;
  window.getSelection()?.removeAllRanges();
}

function persistCards(next: CardJSON[], record = true): boolean {
  const docs = loadUserDocs();
  const doc = docs.find(item => item.id === documentId);
  if (!doc) return false;
  const before = clone(doc.levels.sentence ?? []);
  doc.levels.sentence = next;
  doc.updatedAt = new Date().toISOString();
  try { localStorage.setItem(USER_DOCS_KEY, JSON.stringify(docs)); }
  catch { announce('저장하지 못했습니다. 원래 내용을 유지했습니다.'); return false; }
  if (record) {
    const history = histories.get(doc.id) ?? [];
    history.push({ before, after: JSON.stringify(next) });
    if (history.length > 30) history.shift();
    histories.set(doc.id, history);
  }
  syncUserDocs();
  return true;
}

function change(operation: () => CardJSON[], message: string): void {
  try {
    if (!persistCards(operation())) return;
    selected.clear();
    dismissSelection();
    renderDocument();
    announce(message);
  } catch (error) { announce(error instanceof Error ? error.message : '변경하지 못했습니다.'); }
}

function undo(): void {
  const history = histories.get(documentId!) ?? [];
  const last = history[history.length - 1];
  if (!last) return;
  if (last.after !== JSON.stringify(cards())) {
    histories.delete(documentId!);
    renderDocument();
    announce('문장 편집 내용을 보존하기 위해 이전 블록 작업의 실행 취소를 종료했습니다.');
    return;
  }
  if (persistCards(last.before, false)) {
    history.pop(); selected.clear(); dismissSelection(); renderDocument(); announce('이전 블록 상태로 되돌렸습니다.');
  }
}

function library(): void {
  documentId = null; selected.clear(); dismissSelection();
  S.libraryAddMenu = false;
  document.body.classList.remove('pb-document');
  resetGrammarView();
  S.scr = 'home'; S.mode = null; S.docOverlay = null; S.navStack = []; S.folderId = null;
  render();
  history.replaceState(null, '', '#library');
}

function openDocument(id: string): void {
  syncUserDocs();
  if (!DOCS.some(doc => doc.id === id)) { library(); return; }
  documentId = id; selected.clear(); dismissSelection();
  S.libraryAddMenu = false;
  resetGrammarView();
  S.docId = id; S.scr = 'home'; S.mode = null; S.docOverlay = null; S.navStack = [];
  const last = histories.get(id)?.at(-1);
  if (last && last.after !== JSON.stringify(cards())) histories.delete(id);
  renderDocument();
  history.replaceState(null, '', `#document/${encodeURIComponent(id)}`);
  window.scrollTo({ top: 0 });
}

function openSentence(id: string, review = false): void {
  const doc = DOCS.find(doc => doc.id === documentId);
  const level = doc?.levels.find(level => level.key === 'sentence');
  if (!level?.cards.length) return;
  dismissSelection();
  S.libraryAddMenu = false;
  document.body.classList.remove('pb-document');
  resetGrammarView();
  S.docId = doc!.id; S.lv = level; S.mode = 'seq'; S.scr = 'study'; S.navStack = [];
  S.seqIdx = Math.max(0, level.cards.findIndex(card => card.id === id));
  S.seqFlipped = !review;
  render();
  history.replaceState(null, '', `#sentence/${encodeURIComponent(doc!.id)}/${encodeURIComponent(id)}`);
  window.scrollTo({ top: 0 });
}

function gap(i: number): string {
  return `<div class="pb-gap" data-slot="${i}"><button class="pb-insert" data-pb="add" data-index="${i}" aria-label="${i + 1}번째 위치에 본문 추가"><span>＋</span><span class="pb-insert-label">본문 추가</span></button></div>`;
}

function renderDocument(): void {
  const doc = current();
  if (!doc) { library(); return; }
  const blocks = doc.levels.sentence ?? [];
  document.body.classList.add('pb-document');
  app.innerHTML = `<div class="pb-workspace">
    <header class="pb-header">${backBtn('서재')} ${homeBtn()}</header>
    <section class="pb-title-row"><div class="pb-document-title"><h1 class="hanja">${esc(doc.title)}</h1><p>${esc(doc.sub)}<span>·</span>문장 ${blocks.length}개</p></div><button class="btn-primary pb-review" data-pb="review" ${blocks.length ? '' : 'disabled'}>문장 복습 <span aria-hidden="true">→</span></button></section>
    <main class="pb-sheet" aria-label="문헌 본문"><div class="pb-toolbar"><span id="pb-selection-label">본문을 드래그해 문장으로 지정하세요</span><div class="pb-tools"><button class="pb-tool" data-pb="clear" id="pb-clear" hidden>선택 해제</button><button class="pb-tool pb-merge" data-pb="merge" id="pb-merge" hidden>합치기</button><button class="pb-tool pb-undo" data-pb="undo" ${histories.get(doc.id)?.length ? '' : 'disabled'} aria-label="블록 작업 실행 취소" title="실행 취소 (⌘/Ctrl+Z)">↶</button><button class="pb-tool" data-pb="add" data-index="${blocks.length}">＋ 본문 추가</button></div></div>
      <div id="pb-blocks">${blocks.map((card, i) => `${gap(i)}<article class="pb-block" data-block="${esc(card.id)}"><div class="pb-block-tools"><input type="checkbox" class="pb-check" aria-label="${i + 1}번 블록 선택" ${selected.has(card.id) ? 'checked' : ''}><button class="pb-grip" aria-label="${i + 1}번 블록 이동, 방향키로도 이동 가능">⠿</button></div><div class="pb-source hanja">${esc(card.text)}</div><button class="pb-open" data-pb="study" data-id="${esc(card.id)}" aria-label="문장 열기" title="문장 열기">↗</button></article>`).join('')}${gap(blocks.length)}</div><div class="pb-sheet-end kai">${blocks.length ? '文讀' : '＋ 본문 추가로 첫 문장을 써 보세요'}</div></main>
  </div>`;
  updateSelectionToolbar();
}

function updateSelectionToolbar(): void {
  if (!$('pb-selection-label')) return;
  const positions = cards().map((card, i) => selected.has(card.id) ? i : -1).filter(i => i >= 0);
  const adjacent = positions.length > 1 && positions[positions.length - 1] - positions[0] + 1 === positions.length;
  $('pb-selection-label').textContent = positions.length ? `${positions.length}개 블록 선택${positions.length > 1 && !adjacent ? ' · 연속된 블록을 선택하세요' : ''}` : '본문을 드래그해 문장으로 지정하세요';
  $('pb-clear').hidden = !positions.length;
  $('pb-merge').hidden = positions.length < 2;
  $<HTMLButtonElement>('pb-merge').disabled = !adjacent;
  app.querySelectorAll<HTMLElement>('[data-block]').forEach(row => row.classList.toggle('pb-selected', selected.has(row.dataset.block!)));
}

function rangeEndpoint(node: Node, offset: number): { id: string; offset: number } | null {
  const source = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element)?.closest<HTMLElement>('.pb-source');
  if (!source || !app.contains(source)) return null;
  const range = document.createRange(); range.selectNodeContents(source); range.setEnd(node, offset);
  return { id: source.closest<HTMLElement>('[data-block]')!.dataset.block!, offset: [...range.toString()].length };
}

function captureRange(): void {
  if (drag || !document.body.classList.contains('pb-document')) return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const start = rangeEndpoint(range.startContainer, range.startOffset);
  const end = rangeEndpoint(range.endContainer, range.endOffset);
  if (!start || !end) { dismissSelection(); return; }
  selectedRange = { start, end };
  suppressedClickUntil = Date.now() + 200;
  const rect = range.getBoundingClientRect();
  const bubble = $('pb-selection'); bubble.hidden = false;
  bubble.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - bubble.offsetWidth - 12))}px`;
  bubble.style.top = `${Math.min(innerHeight - bubble.offsetHeight - 12, rect.bottom + 10)}px`;
}

function openAdd(index: number): void {
  dismissSelection(); insertAt = index;
  $<HTMLTextAreaElement>('pb-new-text').value = '';
  $<HTMLDialogElement>('pb-add').showModal();
  $<HTMLTextAreaElement>('pb-new-text').focus();
}

function closeAdd(): void {
  $<HTMLDialogElement>('pb-add').close();
  app.querySelector<HTMLButtonElement>(`[data-pb="add"][data-index="${insertAt}"]`)?.focus();
}

function endDrag(commit: boolean): void {
  if (!drag) return;
  const value = drag; drag = null;
  if (value.handle.hasPointerCapture(value.pointerId)) value.handle.releasePointerCapture(value.pointerId);
  app.querySelector('.pb-drop')?.remove();
  app.querySelector('.pb-dragging')?.classList.remove('pb-dragging');
  suppressedClickUntil = Date.now() + 200;
  if (commit && value.moved) change(() => moveBlock(cards(), value.id, value.slot), '블록 순서를 변경했습니다.');
}

function setupPrototype(): void {
  // Reused creation/deletion flows render through the production renderer.
  // Redirect their terminal navigation without changing production modules.
  new MutationObserver(() => {
    if (S.docOverlay) openDocument(S.docOverlay);
    else if (S.scr === 'level' && S.docId) openDocument(S.docId);
  }).observe(app, { childList: true });
  // Capture only navigation owned by this prototype; existing study actions use real handlers.
  app.addEventListener('click', event => {
    const target = event.target as Element;
    const own = target.closest<HTMLElement>('[data-pb]');
    const existing = target.closest<HTMLElement>('[data-action]');
    if (own) {
      event.stopImmediatePropagation();
      switch (own.dataset.pb) {
        case 'library': library(); break;
        case 'review': if (cards()[0]) openSentence(cards()[0].id, true); break;
        case 'study': openSentence(own.dataset.id!); break;
        case 'add': openAdd(Number(own.dataset.index)); break;
        case 'undo': undo(); break;
        case 'clear': selected.clear(); renderDocument(); break;
        case 'merge': change(() => mergeBlocks(cards(), [...selected]), '선택한 블록을 합쳤습니다.'); break;
      }
      return;
    }
    if (existing) {
      const action = existing.dataset.action;
      if (action === 'open-doc' || action === 'overlay-ref') { event.stopImmediatePropagation(); openDocument(existing.dataset.arg!); }
      else if (action === 'nav-back' && document.body.classList.contains('pb-document')) { event.stopImmediatePropagation(); library(); }
      else if (action === 'nav-home') { event.stopImmediatePropagation(); library(); }
      else if (action === 'nav-back' && S.scr === 'study' && !S.navStack.length) { event.stopImmediatePropagation(); openDocument(S.docId!); }
      else if (action === 'resume') { event.stopImmediatePropagation(); openDocument(S.docId ?? DOCS[0].id); }
      return;
    }
    if (target.closest('.pb-block-tools')) return;
    const source = target.closest<HTMLElement>('.pb-source');
    if (source && !window.getSelection()?.toString() && Date.now() >= suppressedClickUntil) {
      event.stopImmediatePropagation(); openSentence(source.closest<HTMLElement>('[data-block]')!.dataset.block!);
    }
  }, true);
  app.addEventListener('change', event => {
    const check = event.target as HTMLInputElement;
    if (!check.matches('.pb-check')) return;
    const id = check.closest<HTMLElement>('[data-block]')!.dataset.block!;
    if (check.checked) selected.add(id); else selected.delete(id);
    updateSelectionToolbar();
  });
  app.addEventListener('mouseup', captureRange);
  $('pb-selection').addEventListener('mousedown', event => event.preventDefault());
  $('pb-designate').onclick = () => {
    if (!selectedRange) return;
    const range = selectedRange;
    change(() => designateRange(cards(), range.start, range.end), '선택한 범위를 문장으로 지정했습니다.');
  };
  $('pb-cancel-selection').onclick = dismissSelection;
  $('pb-add-close').onclick = closeAdd;
  $('pb-add-form').onsubmit = event => {
    event.preventDefault();
    const text = $<HTMLTextAreaElement>('pb-new-text').value;
    if (!text.trim()) return;
    try {
      const next = insertBlock(cards(), insertAt, text);
      if (!persistCards(next)) return;
      closeAdd(); selected.clear(); renderDocument(); announce('새 본문 블록을 추가했습니다.');
    } catch (error) { announce(String(error)); }
  };
  app.addEventListener('pointerdown', event => {
    const handle = (event.target as Element).closest<HTMLElement>('.pb-grip');
    if (!handle) return;
    event.preventDefault(); dismissSelection();
    const row = handle.closest<HTMLElement>('[data-block]')!;
    drag = { id: row.dataset.block!, start: event.clientY, slot: cards().findIndex(card => card.id === row.dataset.block), moved: false, pointerId: event.pointerId, handle };
    handle.setPointerCapture(event.pointerId); row.classList.add('pb-dragging');
  });
  app.addEventListener('pointermove', event => {
    if (!drag) return;
    if (Math.abs(event.clientY - drag.start) > 5) drag.moved = true;
    if (!drag.moved) return;
    const rows = [...app.querySelectorAll<HTMLElement>('[data-block]')];
    let slot = rows.findIndex(row => { const box = row.getBoundingClientRect(); return event.clientY < box.top + box.height / 2; });
    if (slot < 0) slot = rows.length;
    drag.slot = slot;
    app.querySelector('.pb-drop')?.remove();
    const marker = document.createElement('div'); marker.className = 'pb-drop';
    app.querySelector(`[data-slot="${slot}"]`)?.append(marker);
    if (event.clientY < 90) window.scrollBy(0, -24);
    if (event.clientY > innerHeight - 90) window.scrollBy(0, 24);
  });
  app.addEventListener('pointerup', () => endDrag(true));
  app.addEventListener('pointercancel', () => endDrag(false));
  window.addEventListener('blur', () => endDrag(false));
  window.addEventListener('scroll', () => { if (selectedRange) dismissSelection(); }, { passive: true });
  document.addEventListener('keydown', event => {
    if ($<HTMLDialogElement>('pb-add').open) { event.stopImmediatePropagation(); return; }
    if (modalOpen()) return;
    const target = event.target as HTMLElement;
    if (document.body.classList.contains('pb-document')) {
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { dismissSelection(); endDrag(false); selected.clear(); renderDocument(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !target.matches('input,textarea')) { event.preventDefault(); undo(); }
      if (target.matches('.pb-grip') && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const id = target.closest<HTMLElement>('[data-block]')!.dataset.block!;
        const i = cards().findIndex(card => card.id === id);
        const slot = event.key === 'ArrowUp' ? Math.max(0, i - 1) : Math.min(cards().length, i + 2);
        change(() => moveBlock(cards(), id, slot), '블록 순서를 변경했습니다.');
        app.querySelector<HTMLButtonElement>(`[data-block="${id}"] .pb-grip`)?.focus();
      }
    } else if (S.scr === 'study' && event.key === 'Escape' && !S.navStack.length && !S.grammarMenu) {
      event.stopImmediatePropagation(); openDocument(S.docId!);
    } else if (S.scr === 'home' && /^[1-9]$/.test(event.key) && !target.matches('input,textarea')) {
      const doc = homeDocs(S.folderId)[Number(event.key) - 1];
      if (doc) { event.stopImmediatePropagation(); openDocument(doc.id); }
    }
  }, true);
}

async function init(): Promise<void> {
  guardAndSeed();
  await acquireEditingSession();
  // Materialize notes from the previous prototype once; keep current user edits.
  const docs = loadUserDocs();
  const upgraded = docs.map(doc => ({ ...doc, levels: { ...doc.levels,
    ...(doc.levels.sentence ? { sentence: migrateLegacyNotes(doc.levels.sentence) } : {}),
  } }));
  if (JSON.stringify(docs) !== JSON.stringify(upgraded)) localStorage.setItem(USER_DOCS_KEY, JSON.stringify(upgraded));
  await initDocs();
  initAddCard(); initCellSelect(); initDocCreate(); initEditCard(); initGrammarEdit(); initShortcutHelp(); initOnboarding();
  setupPrototype(); setupClick(); setupKeyboard();
  const route = location.hash.split('/');
  if (route[0] === '#library') library();
  else {
    const id = route[1] ? decodeURIComponent(route[1]) : DOCS[0].id;
    openDocument(id);
    if (route[0] === '#sentence' && route[2]) openSentence(decodeURIComponent(route[2]));
  }
}

init().catch(error => {
  app.innerHTML = `<main class="pb-error"><h1>목업을 시작하지 못했습니다</h1><p>${esc(error instanceof Error ? error.message : String(error))}</p></main>`;
});
