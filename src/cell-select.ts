import { S } from './state';
import { SelectGesture, HOLD_MS, type GestureResult, type PointerKind } from './select-gesture';
import { showAddCardModal } from './addcard';

/**
 * 학습 카드 본문 글자 셀(.cc[data-i]) 위 범위 선택 → "+ 카드 추가" 버블 (v1.15.0).
 * 네이티브 텍스트 선택 경로(selectionchange·롱프레스 콜아웃) 전면 대체 —
 * 제스처 판정은 select-gesture.ts, 여기는 포인터 이벤트 배선·하이라이트·버블만.
 * 문법 편집(grammar-edit.ts)과 같은 좌표 기반 셀 탐지(elementFromPoint)를 쓴다.
 */

const g = new SelectGesture();
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let clearTimer: ReturnType<typeof setTimeout> | undefined;
let pointerId = -1;
let range: { start: number; end: number } | null = null;  // 확정 선택 (버블 표시 중)
let suppressClick = false;   // 드래그·해제 탭 직후 따라오는 click(플립/드릴) 무시

const cellAt = (x: number, y: number): HTMLElement | null =>
  document.elementFromPoint(x, y)?.closest<HTMLElement>('.cc[data-i]') ?? null;

function cells(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#card-front .cc[data-i]')];
}

function paint(start: number, end: number): void {
  for (const el of cells()) {
    const i = parseInt(el.dataset.i!);
    el.classList.toggle('sel', i >= start && i <= end);
  }
}

function clearPaint(): void {
  document.querySelectorAll('#card-front .cc.sel').forEach(el => el.classList.remove('sel'));
}

function selectable(): boolean {
  return S.scr === 'study' && !S.grammarEditMode;
}

function frontText(): string {
  const card = S.mode === 'seq' ? S.lv?.cards[S.seqIdx] : S.queue[0];
  return card?.front ?? '';
}

/** 선택 셀들의 합집합 사각형 — 버블 배치 기준 */
function rangeRect(start: number, end: number): DOMRect {
  const els = cells().filter(el => {
    const i = parseInt(el.dataset.i!);
    return i >= start && i <= end;
  });
  if (els.length === 0) return new DOMRect(0, 0, 0, 0);
  let { left, top, right, bottom } = els[0].getBoundingClientRect();
  for (const el of els.slice(1)) {
    const b = el.getBoundingClientRect();
    left   = Math.min(left, b.left);
    top    = Math.min(top, b.top);
    right  = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

// ── 버블 ──────────────────────────────────────────────────

export function hideBubble(): void {
  document.getElementById('ac-bubble')?.classList.add('hidden');
}

function showBubble(rect: DOMRect): void {
  const b = document.getElementById('ac-bubble')!;
  b.style.left = `${rect.left + rect.width / 2}px`;
  // 터치는 손가락에 가리지 않게 선택 아래쪽, 마우스는 위쪽 배치
  b.style.top = matchMedia('(pointer: coarse)').matches
    ? `${Math.min(window.innerHeight - 52, rect.bottom + 12)}px`
    : `${Math.max(8, rect.top - 44)}px`;
  b.classList.remove('hidden');
}

// ── 상태 정리 ─────────────────────────────────────────────

function markSuppress(): void {
  suppressClick = true;
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => { suppressClick = false; }, 400);  // click 미발생 대비
}

function dismissRange(): void {
  range = null;
  clearPaint();
  hideBubble();
}

/** 화면 리렌더 시 전체 초기화 — render()가 호출 (구 hideBubble 위치) */
export function resetCellSelect(): void {
  clearTimeout(holdTimer);
  pointerId = -1;
  g.cancel();
  dismissRange();
}

/** events.ts click 위임 첫머리에서 호출 — true면 이 클릭은 선택 제스처의 잔향 */
export function consumeSuppressedClick(): boolean {
  if (!suppressClick) return false;
  suppressClick = false;
  return true;
}

/** Escape 처리용 — 확정 선택이 있으면 해제하고 true */
export function dismissCellSelect(): boolean {
  if (!range && !g.isArmed) return false;
  clearTimeout(holdTimer);
  pointerId = -1;
  g.cancel();
  dismissRange();
  return true;
}

// ── 제스처 결과 적용 ──────────────────────────────────────

function apply(r: GestureResult): void {
  switch (r.act) {
    case 'update':
      paint(r.start, r.end);
      break;
    case 'select': {
      clearTimeout(holdTimer);
      range = { start: r.start, end: r.end };
      markSuppress();
      paint(r.start, r.end);
      showBubble(rangeRect(r.start, r.end));
      break;
    }
    case 'tap':
    case 'dismiss':
      clearTimeout(holdTimer);
      clearPaint();
      break;
  }
}

// ── 배선 ──────────────────────────────────────────────────

export function initCellSelect(): void {
  const bubble = document.createElement('div');
  bubble.id = 'ac-bubble';
  bubble.className = 'fixed hidden z-40';
  bubble.style.transform = 'translateX(-50%)';
  bubble.innerHTML = `
    <button id="ac-bubble-btn"
      class="btn-primary px-3 py-1.5 text-xs shadow-lg whitespace-nowrap">
      + 카드 추가
    </button>`;
  document.body.appendChild(bubble);

  bubble.addEventListener('pointerdown', e => e.preventDefault());
  document.getElementById('ac-bubble-btn')!.addEventListener('click', () => {
    if (!range) return;
    const text = [...frontText()].slice(range.start, range.end + 1).join('');
    dismissRange();
    if (text) showAddCardModal(text);
  });

  document.addEventListener('pointerdown', e => {
    // 확정 선택이 떠 있으면: 버블 밖 누름 = 해제. 본문 안 누름이면 그 탭의
    // 클릭(플립/드릴)도 삼킨다 — 해제 전용 탭. (버튼 등 본문 밖 클릭은 통과)
    if (range) {
      if ((e.target as Element).closest('#ac-bubble')) return;
      const inFront = !!(e.target as Element).closest('#card-front');
      dismissRange();
      if (inFront) markSuppress();
    }
    if (!selectable()) return;
    const cell = (e.target as Element).closest<HTMLElement>('.cc[data-i]');
    if (!cell) return;

    const kind: PointerKind =
      e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
    pointerId = e.pointerId;
    g.down(kind, parseInt(cell.dataset.i!), e.clientX, e.clientY);
    clearTimeout(holdTimer);
    if (kind === 'touch') holdTimer = setTimeout(() => apply(g.holdFired()), HOLD_MS);
  });

  document.addEventListener('pointermove', e => {
    if (e.pointerId !== pointerId || !g.isArmed) return;
    if (!selectable()) { apply(g.cancel()); return; }
    // 터치는 pointerdown 대상에 암묵 캡처가 걸려 e.target이 고정 — 좌표로 셀 탐지
    const cell = cellAt(e.clientX, e.clientY);
    apply(g.move(cell ? parseInt(cell.dataset.i!) : -1, e.clientX, e.clientY));
  });

  document.addEventListener('pointerup', e => {
    if (e.pointerId !== pointerId || !g.isArmed) return;
    pointerId = -1;
    apply(g.up());
  });

  document.addEventListener('pointercancel', e => {
    if (e.pointerId !== pointerId) return;
    pointerId = -1;
    apply(g.cancel());
  });

  // 선택 진행 중 스크롤 차단 — touch-action: pan-y 아래에서도 확실하게.
  // 펜슬은 armed 즉시 차단 (첫 move에서 브라우저 팬에 뺏기지 않게).
  document.addEventListener('touchmove', e => {
    if (g.isActive || g.armedKind === 'pen') e.preventDefault();
  }, { passive: false });
}
