import { render } from './render';
import { esc } from './render-shared';
import {
  loadCollections, saveCollections, createShelf, renameShelf, moveDoc, shelfOf,
  canCreateChildFolder, shelfPath,
} from './collections';

/**
 * 폴더 UI 오버레이 2종 (지연 생성 — catalog.ts 패턴):
 *  - sn-overlay: 폴더 이름 입력 (생성·이름 변경 공용)
 *  - sp-overlay: 폴더 선택 시트 (문헌 상세 "폴더 이동" — 위치 1곳 규칙, 선택 즉시 이동)
 * 피커의 "+ 새 폴더로 이동"은 이름 모달로 이어지고, 만들면 문헌이 곧장 그 폴더에 놓인다.
 */

let nameOverlay: HTMLElement | null = null;
let pickOverlay: HTMLElement | null = null;

let nameMode: 'create' | 'rename' = 'create';
let renameId = '';                     // rename 대상 선반
let moveDocId: string | null = null;   // 생성 직후 이 문헌을 새 선반으로 이동 (피커 경유)
let pickerDocId = '';                  // 피커가 옮기는 문헌
let createParentId: string | null = null;

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// ── 이름 모달 (생성·이름 변경) ────────────────────────────

function hideNameModal(): void {
  nameOverlay?.classList.add('hidden');
}

function submitName(): void {
  const input = $<HTMLInputElement>('sn-name');
  const name  = input.value.trim();
  if (!name) {
    $('sn-error').classList.remove('hidden');
    input.focus();
    return;
  }
  if (nameMode === 'rename') {
    saveCollections(renameShelf(loadCollections(), renameId, name));
  } else {
    const created = createShelf(loadCollections(), name, createParentId);
    saveCollections(moveDocId ? moveDoc(created.shelves, moveDocId, created.id) : created.shelves);
  }
  hideNameModal();
  render();
}

function ensureNameOverlay(): HTMLElement {
  if (nameOverlay) return nameOverlay;
  nameOverlay = document.createElement('div');
  nameOverlay.id = 'sn-overlay';
  nameOverlay.className = 'modal-backdrop z-50 hidden';
  nameOverlay.innerHTML = `
    <div id="sn-modal" class="modal-surface px-5 py-6 sm:px-8 sm:py-8 w-full max-w-sm flex flex-col gap-5 mx-4" role="dialog" aria-modal="true" aria-label="폴더 이름">
      <div id="sn-title" class="text-sm font-bold t-ink">새 폴더</div>
      <div class="flex flex-col gap-1">
        <label class="text-xs t-sub" for="sn-name">폴더 이름</label>
        <input id="sn-name" class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div id="sn-error" class="text-xs text-[var(--fail)] hidden">폴더 이름을 입력해 주세요.</div>
      <div class="flex gap-3 justify-end">
        <button id="sn-cancel" class="btn-ghost">취소</button>
        <button id="sn-save" class="btn-primary">만들기</button>
      </div>
    </div>`;
  document.body.appendChild(nameOverlay);

  $('sn-modal').addEventListener('click', e => e.stopPropagation());
  nameOverlay.addEventListener('click', hideNameModal);
  $('sn-cancel').addEventListener('click', hideNameModal);
  $('sn-save').addEventListener('click', submitName);
  $('sn-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitName();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nameOverlay && !nameOverlay.classList.contains('hidden')) {
      e.stopPropagation();
      hideNameModal();
    }
  }, true);
  return nameOverlay;
}

function openNameModal(mode: 'create' | 'rename', opts: { shelfId?: string; docId?: string; parentId?: string | null } = {}): void {
  ensureNameOverlay();
  nameMode  = mode;
  renameId  = opts.shelfId ?? '';
  moveDocId = opts.docId ?? null;
  createParentId = opts.parentId ?? null;
  const cur = mode === 'rename' ? loadCollections().find(s => s.id === renameId) : undefined;
  $('sn-title').textContent = mode === 'rename' ? '폴더 이름 변경' : '새 폴더';
  $('sn-save').textContent  = mode === 'rename' ? '저장' : '만들기';
  $<HTMLInputElement>('sn-name').value = cur?.name ?? '';
  $('sn-error').classList.add('hidden');
  nameOverlay!.classList.remove('hidden');
  setTimeout(() => $('sn-name').focus(), 50);
}

export const showShelfCreate = (parentId: string | null = null): void => openNameModal('create', { parentId });
export const showShelfRename = (shelfId: string): void => openNameModal('rename', { shelfId });

// ── 선반 선택 시트 (문헌 이동) ────────────────────────────

function hidePicker(): void {
  pickOverlay?.classList.add('hidden');
}

function renderPickerList(): void {
  const shelves = loadCollections();
  const curId   = shelfOf(shelves, pickerDocId)?.id ?? null;
  const canCreateHere = canCreateChildFolder(shelves, curId);
  const check = `<svg class="sp-check" width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const row = (id: string | null, label: string, count: number | null) => `
    <button data-sp="${id ?? ''}" class="sp-row${curId === id ? ' on' : ''}" ${curId === id ? 'aria-current="true"' : ''}>
      <span class="sp-name">${esc(label)}</span>
      ${count === null ? '' : `<span class="cnt num">${count}</span>`}
      ${check}
    </button>`;
  $('sp-body').innerHTML =
    row(null, '라이브러리', null) +
    shelves.map(s => row(s.id, ['라이브러리', ...shelfPath(shelves, s.id).map(x => x.name)].join(' / '), s.docIds.length)).join('') +
    (canCreateHere
      ? `<button id="sp-new" class="sp-row sp-new">＋ 현재 위치에 새 폴더로 이동</button>`
      : `<button class="sp-row sp-new disabled" disabled title="현재 UI에서는 2단계까지만 새 폴더를 만들 수 있습니다.">새 폴더 생성 제한 · 라이브러리나 상위 폴더에서 만들어 주세요</button>`);
}

function ensurePickOverlay(): HTMLElement {
  if (pickOverlay) return pickOverlay;
  pickOverlay = document.createElement('div');
  pickOverlay.id = 'sp-overlay';
  pickOverlay.className = 'modal-backdrop z-50 hidden';
  pickOverlay.innerHTML = `
    <div id="sp-modal" class="modal-surface px-4 py-5 sm:px-6 sm:py-6 w-full max-w-sm flex flex-col gap-3 mx-4" role="dialog" aria-modal="true" aria-label="폴더 이동">
      <div class="flex items-center justify-between px-1">
        <div class="text-sm font-bold t-ink">폴더 이동</div>
        <button id="sp-close" class="icon-btn" title="닫기" aria-label="닫기">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div id="sp-body" class="flex flex-col gap-0.5"></div>
    </div>`;
  document.body.appendChild(pickOverlay);

  $('sp-modal').addEventListener('click', e => e.stopPropagation());
  pickOverlay.addEventListener('click', hidePicker);
  $('sp-close').addEventListener('click', hidePicker);

  $('sp-body').addEventListener('click', e => {
    if ((e.target as Element).closest('#sp-new')) {
      hidePicker();
      const shelves = loadCollections();
      const currentId = shelfOf(shelves, pickerDocId)?.id ?? null;
      if (!canCreateChildFolder(shelves, currentId)) return;
      openNameModal('create', { docId: pickerDocId, parentId: currentId });
      return;
    }
    const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-sp]');
    if (!btn) return;
    const target = btn.dataset.sp === '' ? null : btn.dataset.sp!;
    const curId  = shelfOf(loadCollections(), pickerDocId)?.id ?? null;
    if (target !== curId) saveCollections(moveDoc(loadCollections(), pickerDocId, target));
    hidePicker();
    render();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pickOverlay && !pickOverlay.classList.contains('hidden')) {
      e.stopPropagation();
      hidePicker();
    }
  }, true);
  return pickOverlay;
}

export function showShelfPicker(docId: string): void {
  ensurePickOverlay();
  pickerDocId = docId;
  renderPickerList();
  pickOverlay!.classList.remove('hidden');
}
