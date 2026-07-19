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

function hideModal(): void {
  $('ac-overlay').classList.add('hidden');
}

/** 카드 추가 모달 — 셀 선택(cell-select.ts)이 확정한 텍스트를 프리필해 연다. */
export function showAddCardModal(text: string): void {
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

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('ac-overlay').classList.contains('hidden')) {
      e.stopPropagation();
      hideModal();
    }
  }, true);
}
