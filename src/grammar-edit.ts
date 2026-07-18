import { S } from './state';
import { getAnnotations, saveAnnotations } from './grammar';
import { render } from './render';
import type { Card, GrammarType } from './types';

let _dragStart       = -1;
let _pendingStart    = -1;
let _pendingEnd      = -1;
let _lastHoveredIdx  = -1;

function clearHighlight(): void {
  document.querySelectorAll<HTMLElement>('[data-char-idx]').forEach(el => {
    el.style.backgroundColor = '';
  });
}

function updateHighlight(from: number, to: number): void {
  const start = Math.min(from, to);
  const end   = Math.max(from, to);
  document.querySelectorAll<HTMLElement>('[data-char-idx]').forEach(el => {
    const idx = parseInt(el.dataset.charIdx!);
    el.style.backgroundColor = (idx >= start && idx <= end) ? '#e0e7ff' : '';
  });
}

function hidePicker(): void {
  document.getElementById('gp-picker')?.classList.add('hidden');
  clearHighlight();
  _pendingStart   = -1;
  _pendingEnd     = -1;
  _lastHoveredIdx = -1;
}

function currentCard(): Card | undefined {
  if (!S.lv) return undefined;
  return S.mode === 'seq' ? S.lv.cards[S.seqIdx] : S.queue[0];
}

function currentCardFront(): string {
  return currentCard()?.front ?? '';
}

function showPicker(start: number, end: number, clientX: number, clientY: number): void {
  _pendingStart = start;
  _pendingEnd   = end;

  const front    = currentCardFront();
  const existing = getAnnotations(S.docId!, front).filter(a => a.start < end && a.end > start);

  const delBtn = document.getElementById('gp-delete')!;
  delBtn.style.display = existing.length > 0 ? '' : 'none';

  const picker = document.getElementById('gp-picker')!;
  const x = Math.min(clientX, window.innerWidth - 230);
  const y = Math.max(8, clientY - 64);
  picker.style.left = `${x}px`;
  picker.style.top  = `${y}px`;
  picker.classList.remove('hidden');
}

async function applyAnnotation(type: GrammarType): Promise<void> {
  if (_pendingStart < 0) return;
  const docId = S.docId!;
  const card  = currentCard();
  const front = card?.front ?? '';
  const anns  = getAnnotations(docId, front).filter(
    a => !(a.type === type && a.start < _pendingEnd && a.end > _pendingStart),
  );
  anns.push({ type, start: _pendingStart, end: _pendingEnd });
  hidePicker();
  try {
    await saveAnnotations(docId, card?.id ?? '', front, anns);
  } catch (e) {
    alert(e instanceof Error ? e.message : '문법 주석 저장에 실패했습니다.');
  }
  render();
}

async function deleteOverlapping(): Promise<void> {
  if (_pendingStart < 0) return;
  const docId = S.docId!;
  const card  = currentCard();
  const front = card?.front ?? '';
  const anns  = getAnnotations(docId, front).filter(
    a => !(a.start < _pendingEnd && a.end > _pendingStart),
  );
  hidePicker();
  try {
    await saveAnnotations(docId, card?.id ?? '', front, anns);
  } catch (e) {
    alert(e instanceof Error ? e.message : '문법 주석 삭제에 실패했습니다.');
  }
  render();
}

export function initGrammarEdit(): void {
  // ── Picker popup ──────────────────────────────────────────
  const picker = document.createElement('div');
  picker.id        = 'gp-picker';
  picker.className = 'fixed hidden z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg p-2 flex flex-col gap-1.5';
  picker.innerHTML = `
    <div class="flex gap-1.5">
      <button data-gp="S"
        class="px-3 py-1.5 text-xs font-bold text-[var(--s-fg)] bg-[var(--s-bg)] border border-[rgba(215,0,21,.25)] rounded-lg hover:bg-[rgba(255,59,48,.16)] transition-colors">
        S&nbsp;주어
      </button>
      <button data-gp="V"
        class="px-3 py-1.5 text-xs font-bold text-[var(--v-fg)] bg-[var(--v-bg)] border border-[rgba(0,64,221,.25)] rounded-lg hover:bg-[rgba(0,122,255,.18)] transition-colors">
        V&nbsp;동사
      </button>
      <button data-gp="O"
        class="px-3 py-1.5 text-xs font-bold text-[var(--o-fg)] bg-[var(--o-bg)] border border-[rgba(29,122,51,.28)] rounded-lg hover:bg-[rgba(52,199,89,.2)] transition-colors">
        O&nbsp;목적어
      </button>
    </div>
    <div class="flex gap-1.5">
      <button data-gp="phrase"
        class="flex-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
        구절 묶기
      </button>
      <button id="gp-delete"
        class="flex-1 px-3 py-1.5 text-xs font-medium t-sub border border-[var(--line)] rounded-lg hover:bg-[rgba(215,0,21,.05)] hover:text-[var(--fail)] hover:border-[rgba(215,0,21,.25)] transition-colors">
        삭제
      </button>
    </div>`;
  document.body.appendChild(picker);

  picker.addEventListener('pointerdown', e => e.stopPropagation());

  picker.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-gp]');
    if (btn) { applyAnnotation(btn.dataset.gp! as GrammarType); return; }
    if ((e.target as Element).closest('#gp-delete')) deleteOverlapping();
  });

  // ── Drag detection — pointer events로 마우스·터치·애플펜슬 공통 처리 ──
  //    터치는 pointerdown 대상에 암묵 포인터 캡처가 걸려 move/up의 e.target이
  //    고정되므로, 진행 중 셀 탐지는 좌표 기반 elementFromPoint를 쓴다.
  const cellAt = (x: number, y: number): HTMLElement | null =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-char-idx]') ?? null;

  document.addEventListener('pointerdown', e => {
    if (!S.grammarEditMode || S.scr !== 'study') return;
    hidePicker();
    const ci = (e.target as Element).closest<HTMLElement>('[data-char-idx]');
    _dragStart      = ci ? parseInt(ci.dataset.charIdx!) : -1;
    _lastHoveredIdx = _dragStart;
  });

  document.addEventListener('pointermove', e => {
    if (!S.grammarEditMode || S.scr !== 'study' || _dragStart < 0) return;
    const ci = cellAt(e.clientX, e.clientY);
    if (ci) {
      _lastHoveredIdx = parseInt(ci.dataset.charIdx!);
      updateHighlight(_dragStart, _lastHoveredIdx);
    }
  });

  document.addEventListener('pointerup', e => {
    if (!S.grammarEditMode || S.scr !== 'study') return;
    if ((e.target as Element).closest('#gp-picker')) return;
    if (_dragStart < 0) return;

    // 글자 사이 gap에서 떼도 마지막으로 지나간 글자를 사용
    const ci      = cellAt(e.clientX, e.clientY);
    const dragEnd = ci ? parseInt(ci.dataset.charIdx!) : _lastHoveredIdx;

    if (dragEnd < 0) { hidePicker(); _dragStart = -1; return; }

    const start = Math.min(_dragStart, dragEnd);
    const end   = Math.max(_dragStart, dragEnd) + 1;
    _dragStart  = -1;
    clearHighlight();
    showPicker(start, end, e.clientX, e.clientY);
  });

  // Close picker when pressing outside (edit mode에서는 drag-start listener가 처리)
  document.addEventListener('pointerdown', e => {
    if (S.grammarEditMode && S.scr === 'study') return;
    if (!(e.target as Element).closest('#gp-picker')) hidePicker();
  });

  // Prevent text selection / native DnD while in grammar edit mode
  document.addEventListener('selectstart', e => {
    if (S.grammarEditMode) e.preventDefault();
  });
  document.addEventListener('dragstart', e => {
    if (S.grammarEditMode) e.preventDefault();
  });
}
