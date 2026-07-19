import { S } from './state';
import { render } from './render';
import { store, isServerMode } from './storage';
import { DOCS, COVER_PALETTE, syncUserDocs } from './docs';
import { splitClassical } from './doc-text';
import { appendUserTexts, updateUserDocMeta } from './user-docs';
import { esc } from './render-shared';
import type { LevelKey } from './types';

/**
 * 문헌 추가 마법사 + 사용자 문헌 정보 수정 모달 (dc-overlay).
 *  - create: 제목·부제·표지색 + 본문 붙여넣기(선택) → 분할 미리보기 → 생성.
 *            정적 모드는 user-docs로, 관리자 모드는 server.py가 src/data/*.json 생성.
 *  - append: 기존 사용자 문헌에 본문 추가 (같은 마법사 재사용)
 *  - edit:   사용자 문헌 제목·부제·표지색 수정
 */

type DcMode = 'create' | 'append' | 'edit';

let mode: DcMode = 'create';
let targetId = '';          // append·edit 대상 docId
let chunks: string[] = [];  // 미리보기 단계의 분할 결과
let color = '';             // 선택 표지색 ('' = 자동)

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function hide(): void {
  $('dc-overlay').classList.add('hidden');
}

function showError(id: 'dc-error-a' | 'dc-error-b', msg: string): void {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearErrors(): void {
  $('dc-error-a').classList.add('hidden');
  $('dc-error-b').classList.add('hidden');
}

// ── 단계 전환 ─────────────────────────────────────────────

function toStepA(): void {
  $('dc-step-a').style.display = 'flex';
  $('dc-step-b').style.display = 'none';
}

function toStepB(): void {
  $('dc-count').innerHTML =
    `<b class="num">${chunks.length}</b>장의 ${$<HTMLSelectElement>('dc-type').value === 'paragraph' ? '단락' : '문장'} 카드가 만들어집니다`;
  $('dc-list').innerHTML = chunks.map((c, i) => `
    <div class="dc-item">
      <span class="dc-num num">${i + 1}</span>
      <span class="hanja">${esc(c)}</span>
    </div>`).join('');
  $('dc-step-a').style.display = 'none';
  $('dc-step-b').style.display = 'flex';
}

// ── 색 스와치 ─────────────────────────────────────────────

function renderSwatches(): void {
  $('dc-swatches').innerHTML =
    `<button data-c="" class="dc-swatch dc-auto${color === '' ? ' on' : ''}">자동</button>` +
    COVER_PALETTE.map(c =>
      `<button data-c="${c}" class="dc-swatch${color === c ? ' on' : ''}" style="background:${c}" aria-label="표지색 ${c}"></button>`,
    ).join('');
}

// ── 열기 (모드별) ─────────────────────────────────────────

function open(m: DcMode, docId = ''): void {
  mode = m;
  targetId = docId;
  chunks = [];
  clearErrors();
  toStepA();

  const doc = docId ? DOCS.find(d => d.id === docId) : undefined;
  $('dc-title').textContent =
    m === 'create' ? '새 문헌' : m === 'append' ? `본문 추가 — ${doc?.title ?? ''}` : '문헌 정보';
  $('dc-meta').classList.toggle('hidden', m === 'append');
  $('dc-body-wrap').classList.toggle('hidden', m === 'edit');

  $<HTMLInputElement>('dc-name').value = m === 'edit' ? (doc?.title ?? '') : '';
  $<HTMLInputElement>('dc-sub').value  = m === 'edit' ? (doc?.sub ?? '') : '';
  color = m === 'edit' ? (doc?.color ?? '') : '';
  renderSwatches();
  $<HTMLTextAreaElement>('dc-text').value = '';
  $<HTMLSelectElement>('dc-type').value = 'sentence';
  updateNextLabel();

  $('dc-overlay').classList.remove('hidden');
  setTimeout(() => $(m === 'append' ? 'dc-text' : 'dc-name').focus(), 50);
}

export const showDocCreate = (): void => open('create');
export const showDocAppend = (docId: string): void => open('append', docId);
export const showDocEdit   = (docId: string): void => open('edit', docId);

function updateNextLabel(): void {
  const hasText = $<HTMLTextAreaElement>('dc-text').value.trim().length > 0;
  $('dc-next').textContent = mode === 'edit' ? '저장' : hasText ? '다음 →' : '만들기';
}

// ── 확정 ──────────────────────────────────────────────────

async function finalize(): Promise<void> {
  const btn = $('dc-create');
  btn.setAttribute('disabled', 'true');
  clearErrors();
  const type = $<HTMLSelectElement>('dc-type').value as LevelKey;
  try {
    if (mode === 'append') {
      const n = appendUserTexts(targetId, type, chunks);
      syncUserDocs();
      hide();
      render();
      if (n < chunks.length) alert(`${chunks.length - n}장은 이미 있는 텍스트라 건너뛰었습니다.`);
    } else {
      const id = await store().createDoc({
        title: $<HTMLInputElement>('dc-name').value.trim(),
        sub:   $<HTMLInputElement>('dc-sub').value.trim(),
        color: color || undefined,
        type,
        texts: chunks,
      });
      hide();
      if (isServerMode()) {
        // 재빌드 → 라이브 리로드가 새 문헌을 반영한다 (skipReload 안 함)
      } else {
        syncUserDocs();
        S.docOverlay = id;   // 새 문헌 상세를 바로 열어 다음 행동(본문 추가·학습) 유도
        render();
      }
    }
  } catch (e) {
    // 빈 문헌 생성은 A단계에서 바로 finalize되므로 보이는 단계 쪽에 표시
    const errId = $('dc-step-b').style.display === 'none' ? 'dc-error-a' : 'dc-error-b';
    showError(errId, e instanceof Error ? e.message : '저장에 실패했습니다.');
  } finally {
    btn.removeAttribute('disabled');
  }
}

// ── 초기화 ────────────────────────────────────────────────

export function initDocCreate(): void {
  const overlay = document.createElement('div');
  overlay.id = 'dc-overlay';
  overlay.className = 'modal-backdrop z-50 hidden';
  overlay.innerHTML = `
    <div id="dc-modal" class="modal-surface px-5 py-6 sm:px-8 sm:py-8 w-full max-w-md flex flex-col gap-5 mx-4" role="dialog" aria-modal="true" aria-label="문헌 추가">
      <div id="dc-title" class="text-sm font-bold t-ink">새 문헌</div>

      <div id="dc-step-a" class="flex flex-col gap-5">
        <div id="dc-meta" class="flex flex-col gap-5">
          <div class="flex flex-col gap-1">
            <label class="text-xs t-sub">제목 (한자)</label>
            <input id="dc-name" class="hanja border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs t-sub">부제 (한글)</label>
            <input id="dc-sub" class="border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs t-sub">표지색</label>
            <div id="dc-swatches" class="dc-swatches"></div>
          </div>
        </div>
        <div id="dc-body-wrap" class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs t-sub">본문 (선택)</label>
            <select id="dc-type" class="border border-[var(--line)] rounded-lg px-2 py-1 text-xs t-ink bg-white focus:outline-none focus:border-[var(--accent)]">
              <option value="sentence">문장 단위</option>
              <option value="paragraph">단락 단위</option>
            </select>
          </div>
          <textarea id="dc-text" rows="6" placeholder="원문을 붙여넣으세요"
            class="hanja border border-[var(--line)] rounded-lg px-3 py-2 text-sm t-ink leading-relaxed focus:outline-none focus:border-[var(--accent)] resize-none"></textarea>
          <div class="text-[11px] t-faint leading-relaxed">줄바꿈이 있으면 줄 단위로, 없으면 문장 부호(。！？) 단위로 나눠 카드를 만듭니다. 비워두면 빈 문헌이 됩니다. 독음·해석은 나중에 카드에서 채울 수 있습니다.</div>
        </div>
        <div id="dc-error-a" class="text-xs text-[var(--fail)] hidden"></div>
        <div class="flex gap-3 justify-end pt-1">
          <button id="dc-cancel" class="btn-ghost">취소</button>
          <button id="dc-next" class="btn-primary">만들기</button>
        </div>
      </div>

      <div id="dc-step-b" class="flex-col gap-4" style="display:none">
        <div id="dc-count" class="text-sm t-sub"></div>
        <div id="dc-list" class="dc-list"></div>
        <div id="dc-error-b" class="text-xs text-[var(--fail)] hidden"></div>
        <div class="flex gap-3 justify-end pt-1">
          <button id="dc-back" class="btn-ghost">← 수정</button>
          <button id="dc-create" class="btn-primary">만들기</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  $('dc-modal').addEventListener('click', e => e.stopPropagation());
  overlay.addEventListener('click', hide);
  $('dc-cancel').addEventListener('click', hide);
  $('dc-back').addEventListener('click', toStepA);
  $('dc-text').addEventListener('input', updateNextLabel);

  $('dc-swatches').addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-c]');
    if (!btn) return;
    color = btn.dataset.c!;
    renderSwatches();
  });

  $('dc-next').addEventListener('click', () => {
    clearErrors();
    if (mode !== 'append' && !$<HTMLInputElement>('dc-name').value.trim()) {
      showError('dc-error-a', '제목을 입력해 주세요.');
      return;
    }
    if (mode === 'edit') {
      try {
        updateUserDocMeta(targetId, {
          title: $<HTMLInputElement>('dc-name').value.trim(),
          sub:   $<HTMLInputElement>('dc-sub').value.trim(),
          color: color || undefined,
        });
        syncUserDocs();
        hide();
        render();
      } catch (e) {
        showError('dc-error-a', e instanceof Error ? e.message : '저장에 실패했습니다.');
      }
      return;
    }
    chunks = splitClassical($<HTMLTextAreaElement>('dc-text').value);
    if (mode === 'append' && chunks.length === 0) {
      showError('dc-error-a', '추가할 본문을 입력해 주세요.');
      return;
    }
    if (chunks.length === 0) { finalize(); return; }   // 빈 문헌 생성
    toStepB();
  });

  $('dc-create').addEventListener('click', finalize);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('dc-overlay').classList.contains('hidden')) {
      e.stopPropagation();
      hide();
    }
  }, true);
}
