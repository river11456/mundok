import './hyeonto-editor.css';
import type { Card, CardJSON } from './types';
import { DOCS, syncUserDocs } from './docs';
import { S } from './state';
import { loadUserDocs, replaceSentenceCards } from './user-docs';
import { isHan } from './reading-align';
import { esc } from './render-shared';
import { storageErrorMessage } from './storage/recovery-ui';
import { getHyeonto, suggestHyeonto, setHyeonto, hyeontoSegments, type HyeontoData } from './sentence-blocks';

interface HyeontoEdit {
  docId: string;
  cardId: string;
  baseline: HyeontoData;
  draft: HyeontoData;
  snapshot: string;
  active: number | null;
  legacy: boolean;
  returnFocus: HTMLElement | null;
}

let edit: HyeontoEdit | null = null;
let shown = true;
let refresh = () => {};
let initialized = false;
let composing = false;
const clone = (value: HyeontoData): HyeontoData => ({ original: value.original, marks: value.marks.map(mark => ({ ...mark })) });
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const dialog = () => $<HTMLDialogElement>('hy-dialog');
const editingRanges = () => S.scr === 'study' && (S.grammarEditMode || S.interpEditMode);

export function isHyeontoShown(): boolean { return shown; }
export function isHyeontoEditorOpen(): boolean { return initialized && dialog().open; }

export function renderHyeontoToggle(): string {
  if (editingRanges()) return '<button type="button" class="hyeonto-tool" disabled title="범위 편집 중에는 현토를 함께 표시합니다">현토 켜짐</button>';
  return `<button type="button" class="hyeonto-tool" data-hyeonto-action="toggle" aria-pressed="${shown}" title="현토 표시 전환">현토 ${shown ? '켜짐' : '꺼짐'}</button>`;
}

export function renderHyeontoControls(cardId: string): string {
  return `${renderHyeontoToggle()}<button type="button" class="hyeonto-tool" data-hyeonto-action="edit" data-card-id="${esc(cardId)}">현토 편집</button>`;
}

export function renderHyeontoText(card: CardJSON): string {
  return hyeontoSegments(card).map(segment => segment.kind === 'hyeonto'
    ? `<span class="hyeonto-token">${esc(segment.text)}</span>` : esc(segment.text)).join('');
}

/** The study renderer uses the composed text's existing codepoint coordinates. */
export function hyeontoIndices(card: Card): Set<number> {
  const stored: CardJSON = { id: card.id, text: card.front, reading: card.reading, meaning: card.back, note: card.note, hyeonto: card.hyeonto };
  const indices = new Set<number>();
  let index = 0;
  for (const segment of hyeontoSegments(stored)) {
    for (const _char of segment.text) {
      if (segment.kind === 'hyeonto') indices.add(index);
      index++;
    }
  }
  return indices;
}

export function openHyeonto(cardId: string): void {
  if (!initialized || !S.docId || dialog().open) return;
  const card = loadUserDocs().find(doc => doc.id === S.docId)?.levels.sentence?.find(item => item.id === cardId);
  if (!card) return;
  const confirmed = getHyeonto(card);
  const suggestion = confirmed ?? suggestHyeonto(card);
  const baseline: HyeontoData = confirmed ?? { ...suggestion, marks: suggestion.marks.map(mark => ({ ...mark, unconfirmed: true })) };
  edit = {
    docId: S.docId, cardId, baseline: clone(baseline), draft: clone(baseline), snapshot: JSON.stringify(card),
    active: null, legacy: baseline.marks.some(mark => mark.unconfirmed),
    returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  };
  composing = false;
  $('hy-error').textContent = '';
  renderEditor();
  dialog().showModal();
}

function renderEditor(): void {
  if (!edit) return;
  const { draft, active, legacy } = edit;
  $('hy-guide').textContent = legacy
    ? '기존 한글을 현토 후보로 표시했습니다. 원문에 속하는 글은 ‘원문에 남기기’를 누르세요. 저장할 때 분리됩니다.'
    : '현토를 붙일 한자를 누르세요. 빈칸으로 저장하면 해당 현토를 지웁니다.';
  const marks = new Map(draft.marks.map(mark => [mark.offset, mark.text]));
  $('hy-line').innerHTML = [...draft.original].map((char, i) => {
    const offset = i + 1;
    const mark = marks.get(offset);
    const original = isHan(char)
      ? `<button type="button" class="hy-anchor${active === offset ? ' on' : ''}" data-hyeonto-offset="${offset}" aria-label="${esc(char)} 뒤 현토" aria-pressed="${active === offset}">${esc(char)}</button>`
      : esc(char);
    const token = active === offset
      ? `<input id="hy-input" class="hyeonto-token hy-input" aria-label="${esc(char)} 뒤 현토 입력" value="${esc(mark ?? '')}" maxlength="40" autocomplete="off" style="width:${Math.max(2, [...(mark ?? '')].length + 1)}em">`
      : mark ? `<button type="button" class="hyeonto-token hy-token-edit" data-hyeonto-offset="${offset}" aria-label="${esc(mark)} 현토 수정">${esc(mark)}</button>` : '';
    return `<span class="hy-unit">${original}${token}</span>`;
  }).join('');
  const keep = $<HTMLButtonElement>('hy-keep');
  const candidate = edit.baseline.marks.find(mark => mark.offset === active && mark.unconfirmed);
  keep.hidden = !legacy || !candidate;
  keep.textContent = candidate ? `‘${candidate.text}’ 원문에 남기기` : '원문에 남기기';
}

function closeEditor(): void {
  const returnFocus = edit?.returnFocus;
  dialog().close();
  edit = null;
  composing = false;
  if (returnFocus?.isConnected) returnFocus.focus();
}

function keepOriginal(): void {
  if (!edit || edit.active === null) return;
  const offset = edit.active;
  const mark = edit.baseline.marks.find(item => item.offset === offset && item.unconfirmed);
  if (!mark) return;
  const fold = (data: HyeontoData): HyeontoData => {
    const chars = [...data.original];
    chars.splice(offset, 0, mark.text);
    return {
      original: chars.join(''),
      marks: data.marks.filter(item => item.offset !== offset).map(item => ({
        ...item, offset: item.offset > offset ? item.offset + [...mark.text].length : item.offset,
      })),
    };
  };
  edit.baseline = fold(edit.baseline);
  edit.draft = fold(edit.draft);
  edit.active = null;
  renderEditor();
}

function saveEditor(): void {
  if (!edit || composing) return;
  const { docId, cardId, draft, baseline, snapshot } = edit;
  const cards = loadUserDocs().find(doc => doc.id === docId)?.levels.sentence;
  const card = cards?.find(item => item.id === cardId);
  if (!cards || !card || JSON.stringify(card) !== snapshot) {
    $('hy-error').textContent = '문장이 변경되었습니다. 입력 내용을 복사해 두고 다시 열어 주세요.';
    return;
  }
  try {
    const updated = setHyeonto(card, draft, baseline);
    replaceSentenceCards(docId, cards.map(item => item.id === cardId ? updated : item), JSON.stringify(cards));
    syncUserDocs();
    if (S.docId === docId && S.lv?.key === 'sentence') {
      S.lv = DOCS.find(doc => doc.id === docId)?.levels.find(level => level.key === 'sentence') ?? S.lv;
    }
    closeEditor();
    refresh();
    $('hy-status').textContent = '현토를 저장했습니다.';
    document.querySelector<HTMLElement>(`[data-hyeonto-action="edit"][data-card-id="${CSS.escape(cardId)}"]`)?.focus();
  } catch (error) {
    $('hy-error').textContent = `${storageErrorMessage(error)} 입력 내용은 유지했습니다.`;
  }
}

export function initHyeontoEditor(callbacks: { render: () => void }): void {
  refresh = callbacks.render;
  if (initialized) return;
  initialized = true;
  const modal = document.createElement('dialog');
  modal.id = 'hy-dialog';
  modal.className = 'hy-dialog';
  modal.setAttribute('aria-labelledby', 'hy-title');
  modal.innerHTML = `<form id="hy-form">
    <div class="hy-head"><h2 id="hy-title">현토 편집</h2><button type="button" id="hy-close" aria-label="현토 편집 닫기">×</button></div>
    <p id="hy-guide" class="hy-guide"></p>
    <div id="hy-line" class="hanja hy-line"></div>
    <button type="button" id="hy-keep" class="hyeonto-tool" hidden>원문에 남기기</button>
    <p id="hy-error" class="hy-error" role="alert"></p>
    <div class="hy-foot"><button type="button" id="hy-cancel" class="hyeonto-tool">취소</button><button class="btn-primary" type="submit">저장</button></div>
  </form>`;
  document.body.append(modal);
  const status = document.createElement('div');
  status.id = 'hy-status';
  status.className = 'hy-status';
  status.setAttribute('role', 'status');
  document.body.append(status);
  document.body.classList.toggle('hide-hyeonto', !shown);

  document.getElementById('app')!.addEventListener('click', event => {
    const control = (event.target as Element).closest<HTMLElement>('[data-hyeonto-action]');
    if (!control) return;
    event.stopImmediatePropagation();
    if (control.dataset.hyeontoAction === 'edit') openHyeonto(control.dataset.cardId!);
    else if (control.dataset.hyeontoAction === 'toggle' && !editingRanges()) {
      shown = !shown;
      document.body.classList.toggle('hide-hyeonto', !shown);
      window.getSelection()?.removeAllRanges();
      control.textContent = `현토 ${shown ? '켜짐' : '꺼짐'}`;
      control.setAttribute('aria-pressed', String(shown));
    }
  }, true);
  $('hy-close').onclick = closeEditor;
  $('hy-cancel').onclick = closeEditor;
  $('hy-keep').onclick = keepOriginal;
  modal.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
  $('hy-line').addEventListener('click', event => {
    const anchor = (event.target as Element).closest<HTMLElement>('[data-hyeonto-offset]');
    if (!anchor || !edit || composing) return;
    edit.active = Number(anchor.dataset.hyeontoOffset);
    renderEditor();
    $<HTMLInputElement>('hy-input').focus();
  });
  $('hy-line').addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== 'hy-input' || !edit || edit.active === null) return;
    const offset = edit.active;
    edit.draft.marks = edit.draft.marks.filter(mark => mark.offset !== offset);
    if (input.value) edit.draft.marks.push({ offset, text: input.value });
    edit.draft.marks.sort((a, b) => a.offset - b.offset);
    input.style.width = `${Math.max(2, [...input.value].length + 1)}em`;
  });
  modal.addEventListener('compositionstart', () => { composing = true; });
  modal.addEventListener('compositionend', () => { composing = false; });
  $('hy-form').onsubmit = event => { event.preventDefault(); saveEditor(); };
  document.addEventListener('keydown', event => {
    if (!modal.open) return;
    event.stopImmediatePropagation();
    if (event.key === 'Enter' && (event.isComposing || composing || event.keyCode === 229)) event.preventDefault();
  }, true);
  window.addEventListener('beforeunload', event => {
    if (edit && JSON.stringify(edit.draft) !== JSON.stringify(edit.baseline)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
