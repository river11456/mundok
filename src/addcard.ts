import { S, DRILL_NEXT, curDoc } from './state';
import { render } from './render';
import { store } from './storage';
import type { Card, LevelKey } from './types';

const TYPE_LABELS: [string, string][] = [
  ['char',      '개별 글자'],
  ['word',      '단어'],
  ['sentence',  '문장'],
  ['paragraph', '단락'],
];

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/**
 * 드래그 선택 문자열 — 음(.cc-rd)·문법 레이블(.cc-svo)은 절대 포함하지 않는다 (R7).
 * user-select:none과 별개로, 선택 범위를 복제해 해당 노드를 제거하고 읽는다
 * (브라우저별 getSelection 동작 차이에 견고).
 */
function selectionText(): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
  const frag = sel.getRangeAt(0).cloneContents();
  frag.querySelectorAll('.cc-rd, .cc-svo').forEach(el => el.remove());
  return (frag.textContent ?? '').trim();
}

export function hideBubble(): void {
  document.getElementById('ac-bubble')?.classList.add('hidden');
}

function hideModal(): void {
  $('ac-overlay').classList.add('hidden');
}

function showModal(text: string): void {
  hideBubble();
  const nextType = text.length === 1 ? 'char' : (S.lv ? (DRILL_NEXT[S.lv.key] ?? 'word') : 'word');
  $<HTMLSelectElement>('ac-type').value   = nextType;
  $<HTMLInputElement>('ac-front').value   = text;
  $<HTMLInputElement>('ac-reading').value = '';
  $<HTMLTextAreaElement>('ac-back').value = '';
  $<HTMLInputElement>('ac-note').value    = '';
  $('ac-error').classList.add('hidden');
  $('ac-submit').textContent = '저장';
  $('ac-submit').removeAttribute('disabled');
  $('ac-overlay').classList.remove('hidden');
  setTimeout(() => $('ac-back').focus(), 50);
}

async function submitCard(): Promise<void> {
  const front   = $<HTMLInputElement>('ac-front').value.trim();
  const reading = $<HTMLInputElement>('ac-reading').value.trim();
  const back    = $<HTMLTextAreaElement>('ac-back').value.trim();
  const note    = $<HTMLInputElement>('ac-note').value.trim();
  const type    = $<HTMLSelectElement>('ac-type').value;
  const docId   = S.docId;

  if (!front) { showError('앞면을 입력해 주세요.'); return; }
  if (!docId) { showError('문서가 선택되지 않았습니다.'); return; }

  const btn = $('ac-submit');
  btn.textContent = '저장 중…';
  btn.setAttribute('disabled', 'true');
  $('ac-error').classList.add('hidden');

  try {
    const id = await store().addCard({ docId, type: type as LevelKey, text: front, reading, meaning: back, note });
    const newCard: Card = { id, front, reading, back, note, fail_count: 0 };
    const targetLevel = curDoc().levels.find(l => l.key === type);
    if (targetLevel) {
      targetLevel.cards.push(newCard);
      if (S.lv?.key === type) {
        // 현재 학습 중인 레벨이면 세션에도 반영. 안키는 같은 객체를 allCards·queue에
        // 함께 넣어(fail_count 공유) 이번 세션에서 학습되게 하고 진행 수를 늘린다.
        const sessionCard: Card = { ...newCard };
        S.allCards.push(sessionCard);
        if (S.mode === 'anki' && S.side !== 'result') {
          S.queue.push(sessionCard);
          S.total++;
        }
      }
    }
    hideModal();
    render();
  } catch (e) {
    showError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    btn.textContent = '저장';
    btn.removeAttribute('disabled');
  }
}

function showError(msg: string): void {
  const el = $('ac-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

export async function deleteCard(docId: string, type: string, id: string, front: string): Promise<void> {
  if (!confirm(`'${front}' 카드를 삭제합니다.\n\n삭제 후 복구가 불가능합니다. 계속하시겠습니까?`)) return;
  try {
    await store().deleteCard({ docId, type: type as LevelKey, id, text: front });
    const targetLevel = curDoc().levels.find(l => l.key === type);
    if (targetLevel) targetLevel.cards = targetLevel.cards.filter(c => c.id !== id);
    S.allCards = S.allCards.filter(c => c.id !== id);
    S.queue    = S.queue.filter(c => c.id !== id);
    S.total    = S.allCards.length;
    if (S.mode === 'seq' && S.lv) {
      if (S.lv.cards.length === 0) { S.scr = 'level'; }
      else { S.seqIdx = Math.min(S.seqIdx, S.lv.cards.length - 1); S.seqFlipped = false; }
    } else if (S.mode === 'anki' && S.queue.length === 0) {
      S.side = 'result';
    }
    render();
  } catch (e) {
    alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
  }
}

export function initAddCard(): void {
  // ── Modal ──────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'ac-overlay';
  overlay.className = 'modal-backdrop z-50 hidden';

  const opts = TYPE_LABELS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  overlay.innerHTML = `
    <div id="ac-modal" class="modal-surface px-5 py-6 sm:px-8 sm:py-8 w-full max-w-sm flex flex-col gap-5 mx-4" role="dialog" aria-modal="true" aria-label="카드 추가">
      <div class="text-sm font-bold t-ink">카드 추가</div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">타입</label>
        <select id="ac-type"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink bg-white focus:outline-none focus:border-[var(--accent)]">${opts}</select>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">한자</label>
        <div class="flex gap-2">
          <input id="ac-front"
            class="flex-1 border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
          <button id="ac-search"
            class="px-3 py-2 text-xs t-sub border border-[var(--line)] rounded-lg hover:border-[rgba(0,0,0,.25)] hover:text-[var(--ink)] transition-colors whitespace-nowrap">검색</button>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">음</label>
        <input id="ac-reading"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">설명</label>
        <textarea id="ac-back" rows="2"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)] resize-none"></textarea>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">메모 (선택)</label>
        <input id="ac-note"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div id="ac-error" class="text-xs text-[var(--fail)] hidden"></div>
      <div class="flex gap-3 justify-end pt-1">
        <button id="ac-cancel"
          class="btn-ghost">취소</button>
        <button id="ac-submit"
          class="btn-primary">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // stop click from propagating through modal to overlay
  document.getElementById('ac-modal')!.addEventListener('click', e => e.stopPropagation());
  overlay.addEventListener('click', hideModal);
  document.getElementById('ac-cancel')!.addEventListener('click', hideModal);
  document.getElementById('ac-submit')!.addEventListener('click', submitCard);
  document.getElementById('ac-search')!.addEventListener('click', () => {
    const q = $<HTMLInputElement>('ac-front').value.trim();
    if (q) window.open(`https://hanja.dict.naver.com/search?query=${encodeURIComponent(q)}`, '_blank');
  });

  // ── Selection bubble ───────────────────────────────────
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

  // 버블이 뜬 시점의 선택 텍스트 보관 — 버블을 누르는 순간 selection이 풀려도 모달에 전달
  let bubbleText = '';

  document.getElementById('ac-bubble-btn')!.addEventListener('click', () => {
    showModal(bubbleText || selectionText());
  });
  // 버블 press가 selection을 지우지 않게 (터치·마우스 공통)
  bubble.addEventListener('pointerdown', e => e.preventDefault());

  // ── 선택 감지 — selectionchange 하나로 마우스 드래그·터치 롱프레스 공통 처리 ──
  //    (mouseup은 터치 선택 핸들 조작에서 오지 않는다 — 아이패드 저작 모드 대응)
  let selTimer: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      if (S.scr !== 'study' || S.grammarEditMode) { hideBubble(); return; }
      const sel = window.getSelection();
      // Only Range (drag), not Caret (plain click)
      if (sel?.type !== 'Range') { hideBubble(); return; }
      // Only show bubble when selection is inside the card front area
      const cardFront = document.getElementById('card-front');
      if (!cardFront) { hideBubble(); return; }
      const anchor = sel.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement : sel.anchorNode as Element | null;
      if (!anchor || !cardFront.contains(anchor)) { hideBubble(); return; }
      const text = selectionText();
      if (!text) { hideBubble(); return; }
      bubbleText = text;

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const b    = document.getElementById('ac-bubble')!;
      b.style.left = `${rect.left + rect.width / 2}px`;
      // 터치는 선택 위에 네이티브 콜아웃(복사 등)이 뜨므로 아래쪽, 마우스는 위쪽 배치
      b.style.top = matchMedia('(pointer: coarse)').matches
        ? `${Math.min(window.innerHeight - 52, rect.bottom + 12)}px`
        : `${Math.max(8, rect.top - 44)}px`;
      b.classList.remove('hidden');
    }, 200);
  });

  // Hide bubble on presses outside it
  document.addEventListener('pointerdown', e => {
    if (!document.getElementById('ac-bubble')?.contains(e.target as Node)) {
      hideBubble();
    }
  });

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('ac-overlay').classList.contains('hidden')) {
      e.stopPropagation();
      hideModal();
    }
  }, true);
}
