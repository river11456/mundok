import { S, curDoc } from './state';
import { render } from './render';
import { store } from './storage';
import type { Card, Level, LevelKey } from './types';
import { readingDraftFromText, readingFromDraftCells } from './reading-align';
import { loadHanjaDictionaryResult, type HanjaCandidate } from './hanja-dictionary';
import { planSentenceReadingAutofill } from './sentence-reading-autofill';

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function hideModal(): void {
  $('ec-overlay').classList.add('hidden');
  editModalSession++;
}

let editModalSession = 0;
let readingAutofillRequest = 0;
let readingGridVersion = 0;

function resetReadingAutofillButton(): void {
  const btn = document.getElementById('ec-reading-autofill') as HTMLButtonElement | null;
  if (!btn) return;
  btn.textContent = '독음 자동 입력';
  btn.removeAttribute('disabled');
}

function sentenceEditorActive(): boolean {
  return $('ec-overlay').dataset.cardType === 'sentence';
}

function readingInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('#ec-reading-grid input[data-reading-cell]')];
}

function refreshReadingProgress(overflow = ''): void {
  const inputs = readingInputs();
  const filled = inputs.filter(input => input.value.trim()).length;
  $('ec-reading-progress').textContent = filled === inputs.length
    ? `${filled}자 입력 완료`
    : `${filled} / ${inputs.length}자 입력 중`;
  const overflowEl = $('ec-reading-overflow');
  overflowEl.textContent = overflow ? `남은 독음 ${[...overflow].length}자: ${overflow}` : '';
  overflowEl.classList.toggle('hidden', !overflow);
  inputs.forEach(input => input.closest('.ec-reading-cell')?.classList.toggle('is-filled', !!input.value.trim()));
}

function syncReadingFromCells(): void {
  $<HTMLInputElement>('ec-reading').value = readingFromDraftCells(readingInputs().map(input => input.value));
  refreshReadingProgress();
}

function resetReadingAutofillUi(): void {
  $('ec-reading-autofill-status').textContent = '';
  for (const cell of [...document.querySelectorAll<HTMLElement>('.ec-reading-cell')]) {
    cell.classList.remove('is-suggested', 'needs-review', 'is-unresolved');
    cell.removeAttribute('title');
    const input = cell.querySelector<HTMLInputElement>('input[data-reading-cell]');
    if (input) input.setAttribute('aria-label', `${input.dataset.readingChar ?? ''} 독음`);
  }
  for (const select of [...document.querySelectorAll<HTMLSelectElement>('#ec-reading-grid select[data-reading-candidates]')]) {
    select.remove();
  }
}

function setReadingAutofillStatus(message: string, tone: 'muted' | 'error' = 'muted'): void {
  const el = $('ec-reading-autofill-status');
  el.textContent = message;
  el.classList.toggle('text-[var(--fail)]', tone === 'error');
  el.classList.toggle('t-sub', tone !== 'error');
}

function refreshReadingAutofillSummary(): void {
  const suggested = document.querySelectorAll('#ec-reading-grid .ec-reading-cell.is-suggested').length;
  const review = document.querySelectorAll('#ec-reading-grid .ec-reading-cell.needs-review').length;
  const unresolved = document.querySelectorAll('#ec-reading-grid .ec-reading-cell.is-unresolved').length;
  if (!suggested && !unresolved) {
    setReadingAutofillStatus('');
    return;
  }
  const parts = suggested ? [`${suggested}자 자동 입력`] : [];
  if (review) parts.push(`${review}자 검토 필요`);
  if (unresolved) parts.push(`${unresolved}자 후보 없음`);
  setReadingAutofillStatus(parts.join(' · '));
}

function renderReadingDraft(text: string, reading: string): void {
  readingGridVersion++;
  const grid = $('ec-reading-grid');
  grid.innerHTML = '';
  const draft = readingDraftFromText(text, reading);

  draft.cells.forEach((cell, index) => {
    const label = document.createElement('label');
    label.className = 'ec-reading-cell';
    const han = document.createElement('span');
    han.className = 'ec-reading-han hanja';
    han.textContent = cell.ch;
    const input = document.createElement('input');
    input.className = 'ec-reading-input';
    input.dataset.readingCell = String(index);
    input.value = cell.value;
    input.placeholder = '·';
    input.autocomplete = 'off';
    input.inputMode = 'text';
    input.setAttribute('aria-label', `${cell.ch} 독음`);
    input.dataset.readingChar = cell.ch;
    label.append(han, input);
    grid.appendChild(label);
  });
  refreshReadingProgress(draft.overflow);
  resetReadingAutofillUi();
}

function distributeReading(start: number, raw: string): void {
  const inputs = readingInputs();
  const syllables = [...raw].filter(ch => /[가-힣]/.test(ch));
  let cursor = start;
  while (cursor < inputs.length && syllables.length) {
    clearReadingCellSuggestion(inputs[cursor]);
    inputs[cursor++].value = syllables.shift()!;
  }
  syncReadingFromCells();
  refreshReadingProgress(syllables.join(''));
  (inputs[Math.min(cursor, inputs.length - 1)] ?? inputs[start])?.focus();
}

function handleReadingCellInput(input: HTMLInputElement, moveNext: boolean): void {
  const index = Number(input.dataset.readingCell);
  const syllables = [...input.value].filter(ch => /[가-힣]/.test(ch));
  if (syllables.length > 1) {
    input.value = '';
    distributeReading(index, syllables.join(''));
    return;
  }
  input.value = syllables[0] ?? '';
  syncReadingFromCells();
  if (moveNext && input.value) readingInputs()[index + 1]?.focus();
}

function candidateOptionLabel(candidate: HanjaCandidate): string {
  return candidate.meaning ? `${candidate.reading} · ${candidate.meaning}` : candidate.reading;
}

function attachReadingCandidateSelect(
  cell: HTMLElement,
  input: HTMLInputElement,
  candidates: HanjaCandidate[],
): void {
  if (candidates.length < 2) return;
  const select = document.createElement('select');
  select.className = 'ec-reading-candidates';
  select.dataset.readingCandidates = 'true';
  select.setAttribute('aria-label', `${input.dataset.readingChar ?? ''} 다른 독음 후보`);
  candidates.forEach(candidate => {
    const option = document.createElement('option');
    option.value = candidate.reading;
    option.textContent = candidateOptionLabel(candidate);
    select.appendChild(option);
  });
  select.value = input.value;
  cell.appendChild(select);
}

function clearReadingCellSuggestion(input: HTMLInputElement): void {
  const cell = input.closest<HTMLElement>('.ec-reading-cell');
  if (!cell) return;
  cell.classList.remove('is-suggested', 'needs-review', 'is-unresolved');
  cell.removeAttribute('title');
  input.setAttribute('aria-label', `${input.dataset.readingChar ?? ''} 독음`);
  cell.querySelector<HTMLSelectElement>('select[data-reading-candidates]')?.remove();
}

function existingCharCards(): Card[] {
  return curDoc().levels.find(level => level.key === 'char')?.cards ?? [];
}

async function autofillSentenceReading(): Promise<void> {
  if (!sentenceEditorActive()) return;
  const session = editModalSession;
  const request = ++readingAutofillRequest;
  const gridVersion = readingGridVersion;
  const text = $<HTMLInputElement>('ec-text').value;
  const inputs = readingInputs();
  if (!inputs.length) return;

  const btn = $<HTMLButtonElement>('ec-reading-autofill');
  btn.textContent = '불러오는 중…';
  btn.setAttribute('disabled', 'true');
  setReadingAutofillStatus('내장 사전과 글자 카드에서 독음을 찾는 중…');

  const result = await loadHanjaDictionaryResult();
  if (
    session !== editModalSession
    || request !== readingAutofillRequest
    || gridVersion !== readingGridVersion
    || text !== $<HTMLInputElement>('ec-text').value
    || !sentenceEditorActive()
  ) {
    if (session === editModalSession && request === readingAutofillRequest) resetReadingAutofillButton();
    return;
  }

  resetReadingAutofillButton();

  resetReadingAutofillUi();
  const currentInputs = readingInputs();
  const plan = planSentenceReadingAutofill(
    text,
    currentInputs.map(input => input.value),
    existingCharCards(),
    result.ok ? result.dictionary.entries : {},
  );

  plan.cells.forEach((cell, index) => {
    const input = currentInputs[index];
    if (!input || input.value.trim()) return;
    if (!cell.suggestion) {
      const wrap = input.closest<HTMLElement>('.ec-reading-cell');
      wrap?.classList.add('is-unresolved');
      wrap?.setAttribute('title', '사전에서 독음 후보를 찾지 못했습니다.');
      input.setAttribute('aria-label', `${cell.char} 독음, 사전 후보 없음`);
      return;
    }
    input.value = cell.suggestion.value;
    const wrap = input.closest<HTMLElement>('.ec-reading-cell');
    wrap?.classList.add('is-suggested');
    if (cell.suggestion.needsReview) {
      wrap?.classList.add('needs-review');
      wrap?.setAttribute('title', '여러 독음 후보가 있어 검토가 필요합니다.');
      if (wrap) attachReadingCandidateSelect(wrap, input, cell.suggestion.candidates);
    }
  });
  syncReadingFromCells();

  if (!plan.filled) {
    if (!result.ok) {
      setReadingAutofillStatus('내장 사전을 불러오지 못했습니다. 기존 입력은 유지했습니다. 다시 시도해 주세요.', 'error');
    } else {
      setReadingAutofillStatus(plan.preserved ? '이미 입력된 독음을 유지했습니다.' : '채울 수 있는 독음 후보가 없습니다.');
    }
    return;
  }
  const parts = [`${plan.filled}자 자동 입력`];
  if (plan.preserved) parts.push(`${plan.preserved}자 유지`);
  if (plan.review) parts.push(`${plan.review}자 검토 필요`);
  if (plan.unresolved) parts.push(`${plan.unresolved}자 후보 없음`);
  if (!result.ok) parts.push('내장 사전 불러오기 실패');
  setReadingAutofillStatus(parts.join(' · '), result.ok ? 'muted' : 'error');
}

export function showEditModal(card: Card, type: string): void {
  editModalSession++;
  readingAutofillRequest++;
  resetReadingAutofillButton();
  $<HTMLInputElement>('ec-text').value       = card.front;
  $<HTMLInputElement>('ec-reading').value    = card.reading;
  $<HTMLTextAreaElement>('ec-back').value    = card.back;
  $<HTMLInputElement>('ec-note').value       = card.note;
  $('ec-overlay').dataset.origFront         = card.front;
  $('ec-overlay').dataset.origId            = card.id;
  $('ec-overlay').dataset.cardType          = type;
  const sentence = type === 'sentence';
  $('ec-modal').classList.toggle('ec-learning-modal', sentence);
  $('ec-modal').classList.toggle('max-w-sm', !sentence);
  $('ec-title').textContent = sentence ? '문장 학습' : '카드 수정';
  $('ec-subtitle').textContent = sentence ? '한자마다 독음을 입력하고 해석을 완성합니다.' : '';
  $('ec-reading-raw-wrap').classList.toggle('hidden', sentence);
  $('ec-reading-grid-wrap').classList.toggle('hidden', !sentence);
  $('ec-reading-label').textContent = '음';
  $('ec-back-label').textContent = sentence ? '해석 · 설명' : '설명';
  $('ec-back').classList.toggle('ec-back-large', sentence);
  if (sentence) renderReadingDraft(card.front, card.reading);
  else resetReadingAutofillUi();
  $('ec-error').classList.add('hidden');
  const btn = $('ec-submit');
  btn.textContent = '저장';
  btn.removeAttribute('disabled');
  $('ec-overlay').classList.remove('hidden');
  setTimeout(() => {
    if (sentence) readingInputs()[0]?.focus();
    else $<HTMLInputElement>('ec-reading').focus();
  }, 50);
}

async function submitEdit(): Promise<void> {
  const overlay   = $('ec-overlay');
  const origFront = overlay.dataset.origFront!;
  const origId    = overlay.dataset.origId!;
  const type      = overlay.dataset.cardType!;
  const docId     = S.docId!;

  if (type === 'sentence' && !$('ec-reading-overflow').classList.contains('hidden')) {
    showError('한자 수보다 독음이 많습니다. 남은 독음을 확인해 주세요.');
    return;
  }
  if (type === 'sentence') syncReadingFromCells();
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
    <div id="ec-modal" class="modal-surface px-5 py-6 sm:px-8 sm:py-8 w-full max-w-sm flex flex-col gap-5 mx-4" role="dialog" aria-modal="true" aria-labelledby="ec-title">
      <div class="ec-learning-head">
        <div>
          <div id="ec-title" class="text-sm font-bold t-ink">카드 수정</div>
          <div id="ec-subtitle" class="text-xs t-sub mt-1"></div>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">한자</label>
        <input id="ec-text"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
        <div class="text-xs text-[var(--warn)] leading-relaxed mt-0.5">⚠ 이 항목을 바꾸면 이 글자를 포함하는 문장·단락 카드와의 연결이 끊길 수 있습니다. 수정을 권장하지 않습니다.</div>
      </div>
      <div id="ec-reading-raw-wrap" class="flex flex-col gap-1">
        <label id="ec-reading-label" class="text-xs t-sub">음</label>
        <input id="ec-reading"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <section id="ec-reading-grid-wrap" class="hidden flex flex-col gap-3" aria-labelledby="ec-reading-grid-title">
        <div class="flex items-end justify-between gap-3">
          <div>
            <div id="ec-reading-grid-title" class="text-xs font-bold t-ink">독음</div>
            <div class="text-[11px] t-sub mt-0.5">한자 아래에 입력하세요. 여러 음절을 붙여넣으면 이어서 자동 배치됩니다.</div>
          </div>
          <div class="flex items-center gap-2">
            <button id="ec-reading-autofill" type="button" class="btn-ghost ec-reading-autofill">독음 자동 입력</button>
            <div id="ec-reading-progress" class="text-[11px] t-sub whitespace-nowrap"></div>
          </div>
        </div>
        <div id="ec-reading-grid" class="ec-reading-grid" role="group" aria-label="문장 독음"></div>
        <div id="ec-reading-autofill-status" class="text-[11px] t-sub min-h-[1em]" role="status" aria-live="polite" aria-atomic="true"></div>
        <div id="ec-reading-overflow" class="hidden text-xs text-[var(--warn)]"></div>
      </section>
      <div class="flex flex-col gap-1">
        <label id="ec-back-label" class="text-xs t-sub">설명</label>
        <textarea id="ec-back" rows="2"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)] resize-y"></textarea>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub">메모 (선택)</label>
        <input id="ec-note"
          class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div id="ec-error" class="text-xs text-[var(--fail)] hidden"></div>
      <div id="ec-actions" class="ec-learning-actions flex gap-3 justify-end pt-1">
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
  document.getElementById('ec-reading-autofill')!.addEventListener('click', () => void autofillSentenceReading());
  document.getElementById('ec-text')!.addEventListener('input', () => {
    if (sentenceEditorActive()) renderReadingDraft(
      $<HTMLInputElement>('ec-text').value,
      $<HTMLInputElement>('ec-reading').value,
    );
  });
  document.getElementById('ec-reading')!.addEventListener('input', e => {
    if (!sentenceEditorActive() || (e as InputEvent).isComposing) return;
    renderReadingDraft(
      $<HTMLInputElement>('ec-text').value,
      $<HTMLInputElement>('ec-reading').value,
    );
  });
  document.getElementById('ec-reading-grid')!.addEventListener('compositionstart', e => {
    const input = (e.target as Element).closest<HTMLInputElement>('input[data-reading-cell]');
    if (input) input.dataset.composing = 'true';
  });
  document.getElementById('ec-reading-grid')!.addEventListener('compositionend', e => {
    const input = (e.target as Element).closest<HTMLInputElement>('input[data-reading-cell]');
    if (!input) return;
    delete input.dataset.composing;
    handleReadingCellInput(input, true);
  });
  document.getElementById('ec-reading-grid')!.addEventListener('input', e => {
    const input = (e.target as Element).closest<HTMLInputElement>('input[data-reading-cell]');
    if (!input || input.dataset.composing === 'true' || (e as InputEvent).isComposing) return;
    clearReadingCellSuggestion(input);
    handleReadingCellInput(input, true);
    refreshReadingAutofillSummary();
  });
  document.getElementById('ec-reading-grid')!.addEventListener('paste', e => {
    const input = (e.target as Element).closest<HTMLInputElement>('input[data-reading-cell]');
    if (!input) return;
    e.preventDefault();
    distributeReading(Number(input.dataset.readingCell), (e as ClipboardEvent).clipboardData?.getData('text') ?? '');
    refreshReadingAutofillSummary();
  });
  document.getElementById('ec-reading-grid')!.addEventListener('keydown', e => {
    const input = (e.target as Element).closest<HTMLInputElement>('input[data-reading-cell]');
    if (!input || input.dataset.composing === 'true') return;
    const index = Number(input.dataset.readingCell);
    if (e.key === 'ArrowLeft') { e.preventDefault(); readingInputs()[index - 1]?.focus(); }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); readingInputs()[index + 1]?.focus(); }
  });
  document.getElementById('ec-reading-grid')!.addEventListener('change', e => {
    const select = (e.target as Element).closest<HTMLSelectElement>('select[data-reading-candidates]');
    if (!select) return;
    const input = select.closest('.ec-reading-cell')?.querySelector<HTMLInputElement>('input[data-reading-cell]');
    if (!input) return;
    input.value = select.value;
    const cell = input.closest<HTMLElement>('.ec-reading-cell');
    cell?.classList.remove('needs-review');
    cell?.setAttribute('title', '독음 후보를 선택했습니다.');
    syncReadingFromCells();
    refreshReadingAutofillSummary();
    input.focus();
  });

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
