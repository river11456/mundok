import { S } from './state';
import { render } from './render';
import type { Card } from './types';

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function hideModal(): void {
  $('ec-overlay').classList.add('hidden');
}

export function showEditModal(card: Card, type: string): void {
  $<HTMLInputElement>('ec-text').value       = card.front;
  $<HTMLInputElement>('ec-reading').value    = card.reading;
  $<HTMLTextAreaElement>('ec-back').value    = card.back;
  $<HTMLInputElement>('ec-note').value       = card.note;
  $('ec-overlay').dataset.origFront         = card.front;
  $('ec-overlay').dataset.cardType          = type;
  $('ec-error').classList.add('hidden');
  const btn = $('ec-submit');
  btn.textContent = '저장';
  btn.removeAttribute('disabled');
  $('ec-overlay').classList.remove('hidden');
  setTimeout(() => $<HTMLInputElement>('ec-reading').focus(), 50);
}

async function submitEdit(): Promise<void> {
  const overlay   = $('ec-overlay');
  const origFront = overlay.dataset.origFront!;
  const type      = overlay.dataset.cardType!;
  const docId     = S.docId!;

  const text    = $<HTMLInputElement>('ec-text').value.trim();
  const reading = $<HTMLInputElement>('ec-reading').value.trim();
  const back    = $<HTMLTextAreaElement>('ec-back').value.trim();
  const note    = $<HTMLInputElement>('ec-note').value.trim();

  if (!text) { showError('한자를 입력해 주세요.'); return; }

  const btn = $('ec-submit');
  btn.textContent = '저장 중…';
  btn.setAttribute('disabled', 'true');
  $('ec-error').classList.add('hidden');

  try {
    (window as any).__hanjaSkipReloads = ((window as any).__hanjaSkipReloads || 0) + 1;
    const res  = await fetch('/api/edit-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, type, origFront, text, reading, back, note }),
    });
    const data = await res.json() as { ok: boolean; error?: string };
    if (data.ok) {
      const patch = (c: Card) => {
        if (c.front === origFront) {
          c.front = text; c.reading = reading; c.back = back; c.note = note;
        }
      };
      S.lv!.cards.forEach(patch);
      S.allCards.forEach(patch);
      hideModal();
      render();
    } else {
      showError(data.error ?? '저장 실패');
      btn.textContent = '저장';
      btn.removeAttribute('disabled');
    }
  } catch {
    showError('서버 연결 실패. 한문공부.command가 실행 중인지 확인해 주세요.');
    btn.textContent = '저장';
    btn.removeAttribute('disabled');
  }
}

function showError(msg: string): void {
  const el = $('ec-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

export function initEditCard(): void {
  const overlay = document.createElement('div');
  overlay.id = 'ec-overlay';
  overlay.className = 'fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 hidden';

  overlay.innerHTML = `
    <div id="ec-modal" class="bg-white rounded-2xl shadow-xl px-8 py-8 w-full max-w-sm flex flex-col gap-5 mx-4">
      <div class="text-sm font-bold text-stone-900">카드 수정</div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">한자</label>
        <input id="ec-text"
          class="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500" />
        <div class="text-xs text-amber-500 leading-relaxed mt-0.5">⚠ 이 항목을 바꾸면 이 글자를 포함하는 문장·단락 카드와의 연결이 끊길 수 있습니다. 수정을 권장하지 않습니다.</div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">음</label>
        <input id="ec-reading"
          class="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">설명</label>
        <textarea id="ec-back" rows="2"
          class="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500 resize-none"></textarea>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-stone-400">메모 (선택)</label>
        <input id="ec-note"
          class="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500" />
      </div>
      <div id="ec-error" class="text-xs text-red-500 hidden"></div>
      <div class="flex gap-3 justify-end pt-1">
        <button id="ec-cancel"
          class="px-4 py-2 text-xs text-stone-500 border border-stone-200 rounded-lg hover:border-stone-400 transition-colors">취소</button>
        <button id="ec-submit"
          class="px-4 py-2 text-xs font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('ec-modal')!.addEventListener('click', e => e.stopPropagation());
  overlay.addEventListener('click', hideModal);
  document.getElementById('ec-cancel')!.addEventListener('click', hideModal);
  document.getElementById('ec-submit')!.addEventListener('click', submitEdit);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('ec-overlay').classList.contains('hidden')) {
      e.stopPropagation();
      hideModal();
    }
  }, true);
}
