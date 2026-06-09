import { S } from './state';
import { getAnnotations, saveAnnotations } from './grammar';
import { render } from './render';
import type { GrammarType } from './types';

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

function currentCardFront(): string {
  if (!S.lv) return '';
  return S.mode === 'seq'
    ? (S.lv.cards[S.seqIdx]?.front ?? '')
    : (S.queue[0]?.front ?? '');
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
  const front = currentCardFront();
  const anns  = getAnnotations(docId, front).filter(
    a => !(a.type === type && a.start < _pendingEnd && a.end > _pendingStart),
  );
  anns.push({ type, start: _pendingStart, end: _pendingEnd });
  hidePicker();
  await saveAnnotations(docId, front, anns);
  render();
}

async function deleteOverlapping(): Promise<void> {
  if (_pendingStart < 0) return;
  const docId = S.docId!;
  const front = currentCardFront();
  const anns  = getAnnotations(docId, front).filter(
    a => !(a.start < _pendingEnd && a.end > _pendingStart),
  );
  hidePicker();
  await saveAnnotations(docId, front, anns);
  render();
}

export function initGrammarEdit(): void {
  // ── Picker popup ──────────────────────────────────────────
  const picker = document.createElement('div');
  picker.id        = 'gp-picker';
  picker.className = 'fixed hidden z-50 bg-white border border-stone-200 rounded-xl shadow-lg p-2 flex flex-col gap-1.5';
  picker.innerHTML = `
    <div class="flex gap-1.5">
      <button data-gp="S"
        class="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
        S&nbsp;주어
      </button>
      <button data-gp="V"
        class="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
        V&nbsp;동사
      </button>
      <button data-gp="O"
        class="px-3 py-1.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
        O&nbsp;목적어
      </button>
    </div>
    <div class="flex gap-1.5">
      <button data-gp="phrase"
        class="flex-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
        구절 묶기
      </button>
      <button id="gp-delete"
        class="flex-1 px-3 py-1.5 text-xs font-medium text-stone-500 border border-stone-200 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
        삭제
      </button>
    </div>`;
  document.body.appendChild(picker);

  picker.addEventListener('mousedown', e => e.stopPropagation());

  picker.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-gp]');
    if (btn) { applyAnnotation(btn.dataset.gp! as GrammarType); return; }
    if ((e.target as Element).closest('#gp-delete')) deleteOverlapping();
  });

  // ── Drag detection ────────────────────────────────────────
  document.addEventListener('mousedown', e => {
    if (!S.grammarEditMode || S.scr !== 'study') return;
    hidePicker();
    const ci = (e.target as Element).closest<HTMLElement>('[data-char-idx]');
    _dragStart      = ci ? parseInt(ci.dataset.charIdx!) : -1;
    _lastHoveredIdx = _dragStart;
  });

  document.addEventListener('mousemove', e => {
    if (!S.grammarEditMode || S.scr !== 'study' || _dragStart < 0) return;
    const ci = (e.target as Element).closest<HTMLElement>('[data-char-idx]');
    if (ci) {
      _lastHoveredIdx = parseInt(ci.dataset.charIdx!);
      updateHighlight(_dragStart, _lastHoveredIdx);
    }
  });

  document.addEventListener('mouseup', e => {
    if (!S.grammarEditMode || S.scr !== 'study') return;
    if ((e.target as Element).closest('#gp-picker')) return;
    if (_dragStart < 0) return;

    // 글자 사이 gap에서 마우스를 떼도 마지막으로 hover한 글자를 사용
    const ci      = (e.target as Element).closest<HTMLElement>('[data-char-idx]');
    const dragEnd = ci ? parseInt(ci.dataset.charIdx!) : _lastHoveredIdx;

    if (dragEnd < 0) { hidePicker(); _dragStart = -1; return; }

    const start = Math.min(_dragStart, dragEnd);
    const end   = Math.max(_dragStart, dragEnd) + 1;
    _dragStart  = -1;
    clearHighlight();
    showPicker(start, end, e.clientX, e.clientY);
  });

  // Close picker when clicking outside (edit mode에서는 drag-start listener가 처리)
  document.addEventListener('mousedown', e => {
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
