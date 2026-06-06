import { S, DRILL_NEXT, curDoc } from './state';
import { render } from './render';
import type { Card } from './types';

const TYPE_LABELS: [string, string][] = [
  ['char',      '개별 글자'],
  ['word',      '단어'],
  ['sentence',  '문장'],
  ['paragraph', '단락'],
];

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
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
    (window as any).__hanjaSkipReloads = ((window as any).__hanjaSkipReloads || 0) + 1;
    const res  = await fetch('/api/add-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, type, front, reading, back, note }),
    });
    const data = await res.json() as { ok: boolean; error?: string };
    if (data.ok) {
      const newCard: Card = { id: `${type}_${Date.now()}`, front, reading, back, note, fail_count: 0 };
      const targetLevel = curDoc().levels.find(l => l.key === type);
      if (targetLevel) {
        targetLevel.cards.push(newCard);
        if (S.lv?.key === type) S.allCards.push({ ...newCard });
      }
      hideModal();
      render();
    } else {
      showError(data.error ?? '저장 실패');
      btn.textContent = '저장';
      btn.removeAttribute('disabled');
    }
  } catch {
    showError('server.py가 실행 중인지 확인해 주세요 (한문공부.command 재시작)');
    btn.textContent = '저장';
    btn.removeAttribute('disabled');
  }
}

function showError(msg: string): void {
  const el = $('ac-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

export async function deleteCard(docId: string, type: string, front: string): Promise<void> {
  if (!confirm(`'${front}' 카드를 삭제합니다.\n\n삭제 후 복구가 불가능합니다. 계속하시겠습니까?`)) return;
  try {
    (window as any).__hanjaSkipReloads = ((window as any).__hanjaSkipReloads || 0) + 1;
    const res  = await fetch('/api/delete-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, type, front }),
    });
    const data = await res.json() as { ok: boolean; error?: string };
    if (data.ok) {
      const targetLevel = curDoc().levels.find(l => l.key === type);
      if (targetLevel) targetLevel.cards = targetLevel.cards.filter(c => c.front !== front);
      S.allCards = S.allCards.filter(c => c.front !== front);
      S.queue    = S.queue.filter(c => c.front !== front);
      S.total    = S.allCards.length;
      if (S.mode === 'seq' && S.lv) {
        if (S.lv.cards.length === 0) { S.scr = 'level'; }
        else { S.seqIdx = Math.min(S.seqIdx, S.lv.cards.length - 1); S.seqFlipped = false; }
      } else if (S.mode === 'anki' && S.queue.length === 0) {
        S.side = 'result';
      }
      render();
    } else {
      alert(data.error ?? '삭제 실패');
    }
  } catch {
    alert('서버 연결 실패. 한문공부.command가 실행 중인지 확인해 주세요.');
  }
}

export function initAddCard(): void {
  // ── Modal ──────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'ac-overlay';
  overlay.className = 'fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 hidden';

  const opts = TYPE_LABELS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  overlay.innerHTML = `
    <div id="ac-modal" class="bg-white rounded-2xl shadow-xl px-8 py-8 w-full max-w-sm flex flex-col gap-5 mx-4">
      <div class="text-sm font-bold text-stone-900">카드 추가</div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">타입</label>
        <select id="ac-type"
          class="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 bg-white focus:outline-none focus:border-stone-500">${opts}</select>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">한자</label>
        <div class="flex gap-2">
          <input id="ac-front"
            class="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500" />
          <button id="ac-search"
            class="px-3 py-2 text-xs text-stone-500 border border-stone-200 rounded-lg hover:border-stone-400 hover:text-stone-700 transition-colors whitespace-nowrap">검색</button>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">음</label>
        <input id="ac-reading"
          class="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">설명</label>
        <textarea id="ac-back" rows="2"
          class="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500 resize-none"></textarea>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">메모 (선택)</label>
        <input id="ac-note"
          class="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500" />
      </div>
      <div id="ac-error" class="text-xs text-red-500 hidden"></div>
      <div class="flex gap-3 justify-end pt-1">
        <button id="ac-cancel"
          class="px-4 py-2 text-xs text-stone-500 border border-stone-200 rounded-lg hover:border-stone-400 transition-colors">취소</button>
        <button id="ac-submit"
          class="px-4 py-2 text-xs font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors">저장</button>
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
      class="bg-stone-900 text-white text-xs px-3 py-1.5 rounded-full shadow-lg hover:bg-stone-700 transition-colors whitespace-nowrap">
      + 카드 추가
    </button>`;
  document.body.appendChild(bubble);

  document.getElementById('ac-bubble-btn')!.addEventListener('click', () => {
    showModal(window.getSelection()?.toString().trim() ?? '');
  });

  // ── Drag-to-select detection ───────────────────────────
  document.addEventListener('mouseup', (e) => {
    if (S.scr !== 'study') { hideBubble(); return; }
    if ((e.target as Element).closest('button, [data-action]')) { hideBubble(); return; }
    const sel = window.getSelection();
    // Only Range (drag), not Caret (plain click)
    if (sel?.type !== 'Range') { hideBubble(); return; }
    // Only show bubble when selection is inside the card front area
    const cardFront = document.getElementById('card-front');
    if (!cardFront) { hideBubble(); return; }
    const anchor = sel.anchorNode?.nodeType === Node.TEXT_NODE
      ? sel.anchorNode.parentElement : sel.anchorNode as Element | null;
    if (!anchor || !cardFront.contains(anchor)) { hideBubble(); return; }
    const text = sel.toString().trim();
    if (!text) { hideBubble(); return; }

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const b    = document.getElementById('ac-bubble')!;
    b.style.left = `${rect.left + rect.width / 2}px`;
    b.style.top  = `${Math.max(8, rect.top - 44)}px`;
    b.classList.remove('hidden');
  });

  // Hide bubble on clicks outside it
  document.addEventListener('mousedown', e => {
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
