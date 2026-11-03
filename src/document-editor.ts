import './document-editor.css';
import { S } from './state';
import { DOCS, syncUserDocs } from './docs';
import { loadUserDocs, replaceSentenceCards } from './user-docs';
import { esc, backBtn, homeBtn } from './render-shared';
import { designateRange, insertBlock, mergeBlocks, moveBlock } from './sentence-blocks';
import { renderHyeontoText, renderHyeontoToggle } from './hyeonto-editor';
import type { CardJSON } from './types';

interface EditorActions { render: () => void; openSentence: (id: string, review?: boolean) => void }
let callbacks: EditorActions;
const app = document.getElementById('app')!;
let lastDocumentId: string | null = null;
let selected = new Set<string>();
let selectedRange: { start: { id: string; offset: number }; end: { id: string; offset: number } } | null = null;
let suppressedClickUntil = 0;
let insertAt = 0;
let statusMessage = '';
let renderedCards = '';
let drag: { id: string; start: number; slot: number; moved: boolean; pointerId: number; handle: HTMLElement } | null = null;
const histories = new Map<string, { before: CardJSON[]; after: string }[]>();
const addDrafts = new Map<string, string>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const current = () => loadUserDocs().find(doc => doc.id === S.docId);
const cards = () => current()?.levels.sentence ?? [];
const modalOpen = () => document.querySelector('dialog[open], #ec-overlay:not(.hidden), #ac-overlay:not(.hidden), #ce-overlay:not(.hidden), #ge-overlay:not(.hidden)') !== null;

function announce(message: string): void {
  statusMessage = message;
  const status = $('de-status');
  if (status) status.textContent = message;
}

function renderOtherLevels(): string {
  const levels = DOCS.find(doc => doc.id === S.docId)?.levels ?? [];
  const other = levels.map((level, index) => ({ level, index })).filter(({ level }) => level.key !== 'sentence');
  return other.length ? `<details class="de-other-levels"><summary>기존 단어·글자 자료</summary><div>${other.map(({ level, index }) => `<button class="de-tool" data-action="start-study" data-arg="${index}">${esc(level.label)} · ${level.cards.length}개</button>`).join('')}</div></details>` : '';
}

function dismissSelection(): void {
  selectedRange = null;
  const popup = $('de-selection');
  if (popup) popup.hidden = true;
  window.getSelection()?.removeAllRanges();
}

function persistCards(next: CardJSON[], record = true): boolean {
  const doc = current();
  if (!doc) return false;
  const before = clone(doc.levels.sentence ?? []);
  if (JSON.stringify(before) !== renderedCards) {
    callbacks.render(); announce('문장이 변경되어 최신 내용을 불러왔습니다. 다시 선택해 주세요.'); return false;
  }
  try { replaceSentenceCards(doc.id, next, JSON.stringify(before)); }
  catch (error) { announce(error instanceof Error ? error.message : '저장하지 못했습니다. 원래 내용을 유지했습니다.'); return false; }
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
    callbacks.render();
    announce(message);
  } catch (error) { announce(error instanceof Error ? error.message : '변경하지 못했습니다.'); }
}

function undo(): void {
  const history = histories.get(S.docId!) ?? [];
  const last = history[history.length - 1];
  if (!last) return;
  if (last.after !== JSON.stringify(cards())) {
    histories.delete(S.docId!);
    callbacks.render();
    announce('문장 편집 내용을 보존하기 위해 이전 블록 작업의 실행 취소를 종료했습니다.');
    return;
  }
  if (persistCards(last.before, false)) {
    history.pop(); selected.clear(); dismissSelection(); callbacks.render(); announce('이전 블록 상태로 되돌렸습니다.');
  }
}

function gap(i: number): string {
  return `<div class="de-gap" data-slot="${i}"><button class="de-insert" data-de="add" data-index="${i}" aria-label="${i + 1}번째 위치에 본문 추가"><span>＋</span><span class="de-insert-label">본문 추가</span></button></div>`;
}

export function renderDocumentEditor(): string {
  const doc = current();
  if (!doc) return '<p>문헌을 찾을 수 없습니다.</p>';
  if (lastDocumentId !== doc.id) { selected.clear(); dismissSelection(); statusMessage = ''; lastDocumentId = doc.id; }
  const history = histories.get(doc.id);
  const last = history?.[history.length - 1];
  if (last && last.after !== JSON.stringify(cards())) histories.delete(doc.id);
  selected.clear();
  dismissSelection();
  const blocks = doc.levels.sentence ?? [];
  renderedCards = JSON.stringify(blocks);

  return `<div class="de-workspace">
    <header class="de-header">${backBtn('서재')}<div class="de-header-tools"><button class="de-tool" data-action="doc-manage">문헌 관리</button>${homeBtn()}</div></header>
    <section class="de-title-row"><div class="de-document-title"><h1 class="hanja">${esc(doc.title)}</h1><p>${esc(doc.sub)}<span>·</span>문장 ${blocks.length}개</p></div><button class="btn-primary de-review" data-de="review" ${blocks.length ? '' : 'disabled'}>문장 복습 <span aria-hidden="true">→</span></button></section>
    <main class="de-sheet" aria-label="문헌 본문"><div class="de-toolbar"><span id="de-selection-label">본문을 드래그해 문장으로 지정하세요</span><div class="de-tools">${renderHyeontoToggle()}<button class="de-tool" data-de="clear" id="de-clear" hidden>선택 해제</button><button class="de-tool de-merge" data-de="merge" id="de-merge" hidden>합치기</button><button class="de-tool de-undo" data-de="undo" ${histories.get(doc.id)?.length ? '' : 'disabled'} aria-label="블록 작업 실행 취소" title="실행 취소 (⌘/Ctrl+Z)">↶</button><button class="de-tool" data-de="add" data-index="${blocks.length}">＋ 본문 추가</button></div></div>
      <div id="de-blocks">${blocks.map((card, i) => `${gap(i)}<article class="de-block" data-block="${esc(card.id)}"><div class="de-block-tools"><input type="checkbox" class="de-check" aria-label="${i + 1}번 블록 선택" ${selected.has(card.id) ? 'checked' : ''}><button class="de-grip" aria-label="${i + 1}번 블록 이동, 방향키로도 이동 가능">⠿</button></div><div class="de-source document-source hanja">${renderHyeontoText(card)}</div><button class="de-hyeonto-open de-tool" data-hyeonto-action="edit" data-card-id="${esc(card.id)}" aria-label="${i + 1}번 문장 현토 편집">현토</button><button class="de-open" data-de="study" data-id="${esc(card.id)}" aria-label="문장 열기" title="문장 열기">↗</button></article>`).join('')}${gap(blocks.length)}</div><div class="de-sheet-end kai">${blocks.length ? '文讀' : '＋ 본문 추가로 첫 문장을 써 보세요'}</div></main><p id="de-status" class="de-status" role="status" aria-live="polite">${esc(statusMessage)}</p>${renderOtherLevels()}
  </div>`;
}

function updateSelectionToolbar(): void {
  if (!$('de-selection-label')) return;
  const positions = cards().map((card, i) => selected.has(card.id) ? i : -1).filter(i => i >= 0);
  const adjacent = positions.length > 1 && positions[positions.length - 1] - positions[0] + 1 === positions.length;
  $('de-selection-label').textContent = positions.length ? `${positions.length}개 블록 선택${positions.length > 1 && !adjacent ? ' · 연속된 블록을 선택하세요' : ''}` : '본문을 드래그해 문장으로 지정하세요';
  $('de-clear').hidden = !positions.length;
  $('de-merge').hidden = positions.length < 2;
  $<HTMLButtonElement>('de-merge').disabled = !adjacent;
  app.querySelectorAll<HTMLElement>('[data-block]').forEach(row => row.classList.toggle('de-selected', selected.has(row.dataset.block!)));
}

function rangeEndpoint(node: Node, offset: number): { id: string; offset: number } | null {
  const source = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element)?.closest<HTMLElement>('.de-source');
  if (!source || !app.contains(source)) return null;
  const range = document.createRange(); range.selectNodeContents(source); range.setEnd(node, offset);
  return { id: source.closest<HTMLElement>('[data-block]')!.dataset.block!, offset: [...range.toString()].length };
}

function captureRange(): void {
  if (drag || S.scr !== 'document') return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const start = rangeEndpoint(range.startContainer, range.startOffset);
  const end = rangeEndpoint(range.endContainer, range.endOffset);
  if (!start || !end) { dismissSelection(); return; }
  selectedRange = { start, end };
  suppressedClickUntil = Date.now() + 200;
  const rect = range.getBoundingClientRect();
  const bubble = $('de-selection'); bubble.hidden = false;
  bubble.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - bubble.offsetWidth - 12))}px`;
  bubble.style.top = `${Math.min(innerHeight - bubble.offsetHeight - 12, rect.bottom + 10)}px`;
}

function openAdd(index: number): void {
  dismissSelection(); insertAt = index;
  $<HTMLTextAreaElement>('de-new-text').value = addDrafts.get(S.docId!) ?? '';
  $('de-add-error').textContent = '';
  $<HTMLDialogElement>('de-add').showModal();
  $<HTMLTextAreaElement>('de-new-text').focus();
}

function closeAdd(): void {
  $<HTMLDialogElement>('de-add').close();
  app.querySelector<HTMLButtonElement>(`[data-de="add"][data-index="${insertAt}"]`)?.focus();
}

function endDrag(commit: boolean): void {
  if (!drag) return;
  const value = drag; drag = null;
  if (value.handle.hasPointerCapture(value.pointerId)) value.handle.releasePointerCapture(value.pointerId);
  app.querySelector('.de-drop')?.remove();
  app.querySelector('.de-dragging')?.classList.remove('de-dragging');
  suppressedClickUntil = Date.now() + 200;
  if (commit && value.moved) change(() => moveBlock(cards(), value.id, value.slot), '블록 순서를 변경했습니다.');
}

export function documentEditorBeforeRender(): void {
  if (S.scr !== 'document' || S.docOverlay) { dismissSelection(); selected.clear(); endDrag(false); }
}

export function setupDocumentEditor(actions: EditorActions): void {
  callbacks = actions;
  const container = document.createElement('div');
  container.innerHTML = `<div id="de-selection" class="de-selection" hidden><button class="btn-primary" id="de-designate">문장으로 지정</button><button id="de-cancel-selection" aria-label="선택 취소">×</button></div>
  <dialog id="de-add" class="de-add-dialog" aria-labelledby="de-add-title"><form id="de-add-form"><div class="de-add-head"><h2 id="de-add-title">본문 추가</h2><button type="button" id="de-add-close" aria-label="본문 추가 닫기">×</button></div><label for="de-new-text">새 문장</label><textarea class="hanja" id="de-new-text" rows="4" required placeholder="수업에서 추가로 설명한 원문을 입력하세요"></textarea><p id="de-add-error" role="alert"></p><div class="de-add-foot"><button class="btn-primary" type="submit">이 위치에 추가</button></div></form></dialog>`;
  document.body.append(container);
  app.addEventListener('click', event => {
    if (S.scr !== 'document' || S.docOverlay) return;
    const target = event.target as Element;
    const own = target.closest<HTMLElement>('[data-de]');
    const existing = target.closest<HTMLElement>('[data-action]');
    if (own) {
      event.stopImmediatePropagation();
      switch (own.dataset.de) {

        case 'review': if (cards()[0]) callbacks.openSentence(cards()[0].id, true); break;
        case 'study': callbacks.openSentence(own.dataset.id!); break;
        case 'add': openAdd(Number(own.dataset.index)); break;
        case 'undo': undo(); break;
        case 'clear': selected.clear(); callbacks.render(); break;
        case 'merge': change(() => mergeBlocks(cards(), [...selected]), '선택한 블록을 합쳤습니다.'); break;
      }
      return;
    }
    if (target.closest('[data-hyeonto-action]')) { dismissSelection(); return; }
    if (existing) return;
    if (target.closest('.de-block-tools')) return;
    const source = target.closest<HTMLElement>('.de-source');
    if (source && !window.getSelection()?.toString() && Date.now() >= suppressedClickUntil) {
      dismissSelection();
      event.stopImmediatePropagation(); callbacks.openSentence(source.closest<HTMLElement>('[data-block]')!.dataset.block!);
    }
  }, true);
  app.addEventListener('change', event => {
    const check = event.target as HTMLInputElement;
    if (!check.matches('.de-check')) return;
    const id = check.closest<HTMLElement>('[data-block]')!.dataset.block!;
    if (check.checked) selected.add(id); else selected.delete(id);
    updateSelectionToolbar();
  });
  app.addEventListener('mouseup', captureRange);
  $('de-selection').addEventListener('mousedown', event => event.preventDefault());
  $('de-designate').onclick = () => {
    if (!selectedRange) return;
    const range = selectedRange;
    change(() => designateRange(cards(), range.start, range.end), '선택한 범위를 문장으로 지정했습니다.');
  };
  $('de-cancel-selection').onclick = dismissSelection;
  $('de-add-close').onclick = closeAdd;
  $('de-new-text').addEventListener('input', () => addDrafts.set(S.docId!, $<HTMLTextAreaElement>('de-new-text').value));
  $('de-add-form').onsubmit = event => {
    event.preventDefault();
    const text = $<HTMLTextAreaElement>('de-new-text').value;
    if (!text.trim()) return;
    try {
      const next = insertBlock(cards(), insertAt, text);
      if (!persistCards(next)) { $('de-add-error').textContent = statusMessage; return; }
      addDrafts.delete(S.docId!);
      closeAdd(); selected.clear(); callbacks.render(); announce('새 본문 블록을 추가했습니다.');
    } catch (error) { $('de-add-error').textContent = String(error); }
  };
  app.addEventListener('pointerdown', event => {
    const handle = (event.target as Element).closest<HTMLElement>('.de-grip');
    if (!handle) return;
    event.preventDefault(); dismissSelection();
    const row = handle.closest<HTMLElement>('[data-block]')!;
    drag = { id: row.dataset.block!, start: event.clientY, slot: cards().findIndex(card => card.id === row.dataset.block), moved: false, pointerId: event.pointerId, handle };
    handle.setPointerCapture(event.pointerId); row.classList.add('de-dragging');
  });
  app.addEventListener('pointermove', event => {
    if (!drag) return;
    if (Math.abs(event.clientY - drag.start) > 5) drag.moved = true;
    if (!drag.moved) return;
    const rows = [...app.querySelectorAll<HTMLElement>('[data-block]')];
    let slot = rows.findIndex(row => { const box = row.getBoundingClientRect(); return event.clientY < box.top + box.height / 2; });
    if (slot < 0) slot = rows.length;
    drag.slot = slot;
    app.querySelector('.de-drop')?.remove();
    const marker = document.createElement('div'); marker.className = 'de-drop';
    app.querySelector(`[data-slot="${slot}"]`)?.append(marker);
    if (event.clientY < 90) window.scrollBy(0, -24);
    if (event.clientY > innerHeight - 90) window.scrollBy(0, 24);
  });
  app.addEventListener('pointerup', () => endDrag(true));
  app.addEventListener('pointercancel', () => endDrag(false));
  window.addEventListener('blur', () => endDrag(false));
  window.addEventListener('scroll', () => { if (selectedRange) dismissSelection(); }, { passive: true });
  document.addEventListener('keydown', event => {
    if ($<HTMLDialogElement>('de-add').open) { event.stopImmediatePropagation(); if (event.key === 'Enter' && event.isComposing) event.preventDefault(); return; }
    if (modalOpen() || S.docOverlay) return;
    const target = event.target as HTMLElement;
    if (S.scr === 'document') {
      if (!['Escape', 'ArrowUp', 'ArrowDown'].includes(event.key) && !((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z')) return;
      if (event.key === 'Escape' && !selectedRange && !selected.size && !drag) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { dismissSelection(); endDrag(false); selected.clear(); callbacks.render(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !target.matches('input,textarea')) { event.preventDefault(); undo(); }
      if (target.matches('.de-grip') && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const id = target.closest<HTMLElement>('[data-block]')!.dataset.block!;
        const i = cards().findIndex(card => card.id === id);
        const slot = event.key === 'ArrowUp' ? Math.max(0, i - 1) : Math.min(cards().length, i + 2);
        change(() => moveBlock(cards(), id, slot), '블록 순서를 변경했습니다.');
        app.querySelector<HTMLButtonElement>(`[data-block="${CSS.escape(id)}"] .de-grip`)?.focus();
      }
    }
  }, true);
}
