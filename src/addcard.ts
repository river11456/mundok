import { S, DRILL_NEXT, curDoc } from './state';
import { render } from './render';
import { store } from './storage';
import { syncUserDocs } from './docs';
import { resolveRuntimeAddition } from './card-runtime';
import type { Card, LevelKey } from './types';
import {
  applyCandidateToValues, codePointLength, createAutofillState, isSingleHanja, markFieldDirty,
  prepareValuesForFrontChange, shouldAcceptDictionaryResponse, type AddCardAutofillState,
} from './addcard-autofill';
import { loadHanjaDictionaryResult, type HanjaCandidate } from './hanja-dictionary';

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
  modalSession++;
}

let modalSession = 0;
let dictionaryRequest = 0;
let autofillState: AddCardAutofillState = createAutofillState({ reading: '', meaning: '' });
let activeCandidates: HanjaCandidate[] = [];
let activeCandidateIndex = -1;
let noteDirty = false;

function currentFieldValues(): { reading: string; meaning: string } {
  return {
    reading: $<HTMLInputElement>('ac-reading').value,
    meaning: $<HTMLTextAreaElement>('ac-back').value,
  };
}

function setFieldValues(values: { reading: string; meaning: string }): void {
  $<HTMLInputElement>('ac-reading').value = values.reading;
  $<HTMLTextAreaElement>('ac-back').value = values.meaning;
}

function findExistingCharCard(text: string): Card | undefined {
  if (!S.docId || !isSingleHanja(text)) return undefined;
  return curDoc().levels.find(l => l.key === 'char')?.cards.find(c => c.front === text);
}

function existingValuesForFront(front: string): { reading?: string; meaning?: string; note?: string } {
  const existing = findExistingCharCard(front);
  return {
    ...(existing?.reading ? { reading: existing.reading } : {}),
    ...(existing?.back ? { meaning: existing.back } : {}),
    ...(existing?.note ? { note: existing.note } : {}),
  };
}

function setDictionaryStatus(message: string, tone: 'muted' | 'error' = 'muted'): void {
  const el = $('ac-dict-status');
  el.textContent = message;
  el.classList.toggle('text-[var(--fail)]', tone === 'error');
  el.classList.toggle('t-sub', tone !== 'error');
}

function renderCandidates(candidates: HanjaCandidate[]): void {
  const list = $('ac-candidates');
  list.innerHTML = '';
  activeCandidates = candidates;
  candidates.forEach((candidate, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ac-candidate-chip';
    btn.setAttribute('aria-pressed', String(index === activeCandidateIndex));
    btn.dataset.index = String(index);
    btn.textContent = `${candidate.reading} · ${candidate.meaning}`;
    list.appendChild(btn);
  });
}

function applyCandidate(index: number): void {
  const candidate = activeCandidates[index];
  if (!candidate) return;
  activeCandidateIndex = index;
  setFieldValues(applyCandidateToValues(autofillState, currentFieldValues(), candidate));
  renderCandidates(activeCandidates);
}

function resetDictionaryUi(): void {
  activeCandidates = [];
  activeCandidateIndex = -1;
  $('ac-candidates').innerHTML = '';
  setDictionaryStatus('');
}

async function refreshDictionarySuggestion(session: number): Promise<void> {
  const front = $<HTMLInputElement>('ac-front').value.trim();
  resetDictionaryUi();
  if (!isSingleHanja(front)) return;

  const request = ++dictionaryRequest;
  const requestedFront = front;
  const daum = $<HTMLAnchorElement>('ac-daum');
  daum.href = `https://dic.daum.net/search.do?dic=hanja&q=${encodeURIComponent(front)}`;
  daum.classList.remove('hidden');
  setDictionaryStatus('사전 후보를 불러오는 중…');

  const result = await loadHanjaDictionaryResult();
  if (!shouldAcceptDictionaryResponse(
    session,
    modalSession,
    request,
    dictionaryRequest,
    requestedFront,
    $<HTMLInputElement>('ac-front').value.trim(),
  )) return;

  if (!result.ok) {
    renderCandidates([]);
    setDictionaryStatus('사전 후보를 불러오지 못했습니다. 직접 입력하거나 Daum에서 확인하세요.', 'error');
    return;
  }

  const candidates = result.dictionary.entries[front] ?? [];
  renderCandidates(candidates);
  if (!candidates.length) {
    setDictionaryStatus('내장 사전에 후보가 없습니다. 직접 입력하거나 Daum에서 확인하세요.');
    return;
  }
  setDictionaryStatus(candidates.length === 1 ? '내장 사전 후보 1개' : `내장 사전 후보 ${candidates.length}개`);
  applyCandidate(0);
}

/** 카드 추가 모달 — 셀 선택(cell-select.ts)이 확정한 텍스트를 프리필해 연다. */
export function showAddCardModal(text: string): void {
  const session = ++modalSession;
  const singleHanja = isSingleHanja(text);
  const singleCodePoint = codePointLength(text) === 1;
  const existing = existingValuesForFront(text);
  const nextType = singleCodePoint ? 'char' : (S.lv ? (DRILL_NEXT[S.lv.key] ?? 'word') : 'word');
  $<HTMLSelectElement>('ac-type').value   = nextType;
  $<HTMLInputElement>('ac-front').value   = text;
  $<HTMLInputElement>('ac-reading').value = existing.reading ?? '';
  $<HTMLTextAreaElement>('ac-back').value = existing.meaning ?? '';
  $<HTMLInputElement>('ac-note').value    = existing.note ?? '';
  noteDirty = false;
  autofillState = createAutofillState(currentFieldValues());
  resetDictionaryUi();
  $<HTMLAnchorElement>('ac-daum').classList.toggle('hidden', !singleHanja);
  $('ac-error').classList.add('hidden');
  $('ac-submit').textContent = '저장';
  $('ac-submit').removeAttribute('disabled');
  $('ac-overlay').classList.remove('hidden');
  void refreshDictionarySuggestion(session);
  setTimeout(() => (singleHanja ? $('ac-reading') : $('ac-back')).focus(), 50);
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
    const previousDoc = curDoc();
    const id = await store().addCard({ docId, type: type as LevelKey, text: front, reading, meaning: back, note });

    // 저장소를 정본으로 다시 읽어 새 레벨까지 런타임 문헌 구조에 반영한다.
    // 기존에는 word 레벨이 없으면 저장에는 성공해도 DOCS에 레벨이 생기지 않아
    // 문장 → 단어 드릴다운 링크가 렌더되지 않았다.
    syncUserDocs();
    const { targetLevel, storedCard, isNew } = resolveRuntimeAddition(
      previousDoc, curDoc(), type as LevelKey, id,
    );

    if (S.lv?.key === type && targetLevel) {
      S.lv = targetLevel;
      if (isNew && storedCard) {
        // 현재 학습 중인 레벨이면 세션에도 반영한다.
        const sessionCard: Card = { ...storedCard };
        S.allCards.push(sessionCard);
        if (S.mode === 'anki' && S.side !== 'result') {
          S.queue.push(sessionCard);
          S.total++;
        }
      } else if (storedCard) {
        S.allCards = S.allCards.map(c => c.id === storedCard.id ? { ...storedCard } : c);
        S.queue = S.queue.map(c => c.id === storedCard.id ? { ...storedCard } : c);
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
    <div id="ac-modal" class="modal-surface px-5 py-6 sm:px-8 sm:py-8 w-full max-w-md flex flex-col gap-5 mx-4" role="dialog" aria-modal="true" aria-label="카드 추가">
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
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <div id="ac-dict-status" class="text-xs t-sub" aria-live="polite"></div>
          <a id="ac-daum" class="text-xs t-sub underline underline-offset-2 hidden" target="_blank" rel="noopener">Daum 확인</a>
        </div>
        <div id="ac-candidates" class="flex flex-wrap gap-2" aria-label="사전 후보"></div>
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
  document.getElementById('ac-reading')!.addEventListener('input', () => markFieldDirty(autofillState, 'reading'));
  document.getElementById('ac-back')!.addEventListener('input', () => markFieldDirty(autofillState, 'meaning'));
  document.getElementById('ac-front')!.addEventListener('input', () => {
    dictionaryRequest++;
    const session = modalSession;
    const front = $<HTMLInputElement>('ac-front').value.trim();
    const existing = existingValuesForFront(front);
    const prepared = prepareValuesForFrontChange(autofillState, currentFieldValues(), existing);
    autofillState = prepared.state;
    setFieldValues(prepared.values);
    if (!noteDirty) $<HTMLInputElement>('ac-note').value = existing.note ?? '';
    $<HTMLAnchorElement>('ac-daum').classList.add('hidden');
    void refreshDictionarySuggestion(session);
  });
  document.getElementById('ac-note')!.addEventListener('input', () => { noteDirty = true; });
  document.getElementById('ac-candidates')!.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-index]');
    if (!btn) return;
    applyCandidate(Number(btn.dataset.index));
  });
  document.getElementById('ac-search')!.addEventListener('click', () => {
    const q = $<HTMLInputElement>('ac-front').value.trim();
    if (q) window.open(`https://dic.daum.net/search.do?dic=hanja&q=${encodeURIComponent(q)}`, '_blank', 'noopener');
  });

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('ac-overlay').classList.contains('hidden')) {
      e.stopPropagation();
      hideModal();
    }
  }, true);
}
