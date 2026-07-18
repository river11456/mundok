import { S, curDoc } from './state';
import { render } from './render';
import { store } from './storage';
import type { Card, Level, LevelKey } from './types';

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
  $('ec-overlay').dataset.origId            = card.id;
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
  const origId    = overlay.dataset.origId!;
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
    // 텍스트가 실제로 바뀌면, 옛 텍스트를 품은 다른 카드(연결 카드) 후보를 미리 수집
    const textChanged = text !== origFront;
    const coTargets   = textChanged ? findCoEditTargets(origFront, type) : [];

    await store().editCard({ docId, type: type as LevelKey, id: origId, origText: origFront, text, reading, meaning: back, note });
    const patch = (c: Card) => {
      if (c.id === origId) {
        c.front = text; c.reading = reading; c.back = back; c.note = note;
      }
    };
    S.lv!.cards.forEach(patch);
    S.allCards.forEach(patch);
    hideModal();
    render();

    // 연결 카드 일괄 수정 프롬프트 (후보가 있을 때만)
    if (coTargets.length > 0) showCoEditModal(origFront, text, coTargets);
  } catch (e) {
    showError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    btn.textContent = '저장';
    btn.removeAttribute('disabled');
  }
}

function showError(msg: string): void {
  const el = $('ec-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── 연결 카드 일괄 수정 (텍스트 변경 전파) ─────────────────────────
const CE_LEVEL_LABEL: Record<string, string> = {
  char: '글자', word: '단어', sentence: '문장', paragraph: '단락',
};

interface CoTarget { level: Level; card: Card; }

let coEdit: { origText: string; newText: string; targets: CoTarget[] } | null = null;

/** 같은 문헌에서 origText를 부분문자열로 품은 카드(편집한 카드 자신·동일레벨 동일텍스트 제외). */
function findCoEditTargets(origText: string, editedType: string): CoTarget[] {
  const out: CoTarget[] = [];
  for (const level of curDoc().levels) {
    for (const card of level.cards) {
      if (level.key === editedType && card.front === origText) continue; // 자신/중복
      if (card.front.includes(origText)) out.push({ level, card });
    }
  }
  return out;
}

function ecEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** text 안의 needle 출현부를 강조 span으로 감싸 HTML 반환. (split/join — 정규식 아님) */
function ceHighlight(text: string, needle: string, cls: string): string {
  if (!needle) return ecEsc(text);
  return text.split(needle).map(ecEsc).join(`<span class="${cls}">${ecEsc(needle)}</span>`);
}

function ceOccur(haystack: string, needle: string): number {
  return needle ? haystack.split(needle).length - 1 : 0;
}

function ceCheckedCount(): number {
  if (!coEdit) return 0;
  return coEdit.targets.filter((_, i) => $<HTMLInputElement>(`ce-chk-${i}`)?.checked).length;
}

function hideCoEditModal(): void {
  coEdit = null;
  $('ce-overlay').classList.add('hidden');
}

function showCoEditModal(origText: string, newText: string, targets: CoTarget[]): void {
  coEdit = { origText, newText, targets };

  $('ce-sub').innerHTML =
    `'<span class="hanja">${ecEsc(origText)}</span>' → '<span class="hanja">${ecEsc(newText)}</span>' 치환을 아래 카드에도 적용할까요?`;

  $('ce-list').innerHTML = targets.map((t, i) => {
    const after = t.card.front.split(origText).join(newText);
    const n     = ceOccur(t.card.front, origText);
    return `
      <label class="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-[rgba(0,0,0,.03)] cursor-pointer">
        <input type="checkbox" id="ce-chk-${i}" checked class="mt-1 accent-[var(--accent)]" />
        <div class="flex flex-col gap-1 min-w-0 flex-1">
          <div class="text-[11px] t-faint">${CE_LEVEL_LABEL[t.level.key] ?? t.level.key} · ${ecEsc(t.card.id)} · ${n}곳</div>
          <div class="hanja text-sm t-ink leading-relaxed break-words">${ceHighlight(after, newText, 'bg-[var(--o-bg)] text-[var(--o-fg)] rounded px-0.5')}</div>
        </div>
      </label>`;
  }).join('');

  const btn = $('ce-apply');
  btn.textContent = `적용 ${targets.length}개`;
  btn.removeAttribute('disabled');
  $('ce-error').classList.add('hidden');
  $('ce-overlay').classList.remove('hidden');
}

async function applyCoEdit(): Promise<void> {
  if (!coEdit) { hideCoEditModal(); return; }
  const { origText, newText, targets } = coEdit;
  const docId  = S.docId!;
  const chosen = targets.filter((_, i) => $<HTMLInputElement>(`ce-chk-${i}`)?.checked);
  if (chosen.length === 0) { hideCoEditModal(); return; }

  const btn = $('ce-apply');
  btn.textContent = '적용 중…';
  btn.setAttribute('disabled', 'true');
  $('ce-error').classList.add('hidden');

  try {
    for (const t of chosen) {
      const origFront = t.card.front;
      const newFront  = origFront.split(origText).join(newText);
      if (newFront === origFront) continue;
      await store().editCard({
        docId, type: t.level.key, id: t.card.id, origText: origFront, text: newFront,
        reading: t.card.reading, meaning: t.card.back, note: t.card.note,
      });
      t.card.front = newFront;                                                  // DOCS(및 동일레벨 S.lv.cards) 갱신
      const inAll = S.allCards.find(c => c.id === t.card.id); if (inAll) inAll.front = newFront;
      const inQ   = S.queue.find(c => c.id === t.card.id);    if (inQ)   inQ.front   = newFront;
    }
    hideCoEditModal();
    render();
  } catch (e) {
    const el = $('ce-error');
    el.textContent = e instanceof Error ? e.message : '일괄 수정에 실패했습니다.';
    el.classList.remove('hidden');
    btn.textContent = `적용 ${chosen.length}개`;
    btn.removeAttribute('disabled');
  }
}

export function initEditCard(): void {
  const overlay = document.createElement('div');
  overlay.id = 'ec-overlay';
  overlay.className = 'modal-backdrop z-50 hidden';

  overlay.innerHTML = `
    <div id="ec-modal" class="modal-surface px-5 py-6 sm:px-8 sm:py-8 w-full max-w-sm flex flex-col gap-5 mx-4" role="dialog" aria-modal="true" aria-label="카드 수정">
      <div class="text-sm font-bold t-ink">카드 수정</div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">한자</label>
        <input id="ec-text"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
        <div class="text-xs text-[var(--warn)] leading-relaxed mt-0.5">⚠ 이 항목을 바꾸면 이 글자를 포함하는 문장·단락 카드와의 연결이 끊길 수 있습니다. 수정을 권장하지 않습니다.</div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">음</label>
        <input id="ec-reading"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">설명</label>
        <textarea id="ec-back" rows="2"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)] resize-none"></textarea>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">메모 (선택)</label>
        <input id="ec-note"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div id="ec-error" class="text-xs text-[var(--fail)] hidden"></div>
      <div class="flex gap-3 justify-end pt-1">
        <button id="ec-cancel"
          class="btn-ghost">취소</button>
        <button id="ec-submit"
          class="btn-primary">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('ec-modal')!.addEventListener('click', e => e.stopPropagation());
  overlay.addEventListener('click', hideModal);
  document.getElementById('ec-cancel')!.addEventListener('click', hideModal);
  document.getElementById('ec-submit')!.addEventListener('click', submitEdit);

  // ── 연결 카드 일괄 수정 모달 ──────────────────────────────
  const ce = document.createElement('div');
  ce.id = 'ce-overlay';
  ce.className = 'modal-backdrop z-[60] hidden';
  ce.innerHTML = `
    <div id="ce-modal" class="modal-surface px-5 py-6 sm:px-7 sm:py-7 w-full max-w-md flex flex-col gap-4 mx-4 max-h-[85vh]" role="dialog" aria-modal="true" aria-label="연결된 카드 함께 수정">
      <div class="text-sm font-bold t-ink">연결된 카드도 함께 수정</div>
      <div id="ce-sub" class="text-xs t-sub leading-relaxed"></div>
      <div class="text-[11px] text-[var(--warn)] bg-[rgba(178,80,0,.06)] rounded-lg px-3 py-2 leading-relaxed">
        ⚠ 독음은 자동으로 맞춰지지 않으니 적용 후 확인하세요. 길이가 다른 치환은 문법 주석 위치가 밀릴 수 있습니다.
      </div>
      <div id="ce-list" class="flex flex-col gap-0.5 overflow-y-auto -mx-1 px-1" style="max-height:42vh"></div>
      <div id="ce-error" class="text-xs text-[var(--fail)] hidden"></div>
      <div class="flex gap-3 justify-end pt-1">
        <button id="ce-skip"
          class="btn-ghost">건너뛰기</button>
        <button id="ce-apply"
          class="btn-primary">적용</button>
      </div>
    </div>`;
  document.body.appendChild(ce);

  document.getElementById('ce-modal')!.addEventListener('click', e => e.stopPropagation());
  ce.addEventListener('click', hideCoEditModal);
  document.getElementById('ce-skip')!.addEventListener('click', hideCoEditModal);
  document.getElementById('ce-apply')!.addEventListener('click', applyCoEdit);
  document.getElementById('ce-list')!.addEventListener('change', () => {
    const n   = ceCheckedCount();
    const btn = $('ce-apply');
    btn.textContent = `적용 ${n}개`;
    if (n === 0) btn.setAttribute('disabled', 'true'); else btn.removeAttribute('disabled');
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('ce-overlay').classList.contains('hidden')) { e.stopPropagation(); hideCoEditModal(); return; }
    if (!$('ec-overlay').classList.contains('hidden')) { e.stopPropagation(); hideModal(); }
  }, true);
}
