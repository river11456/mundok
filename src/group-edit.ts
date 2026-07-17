// 그룹(선반) 편집 모달 — 저작(서버) 모드 전용 (A1).
// _groups.json 의 shelves(이름·소속 문헌·순서)를 편집해 /api/save-groups 로 저장한다.
// 참고문헌 관계(refs)는 콘텐츠 성격이라 여기서 다루지 않고 그대로 보존한다.
// 저장되면 vite build --watch 가 재빌드 → 라이브 리로드로 홈이 갱신된다.
import { DOCS, SHELVES, REFS } from './docs';
import { esc } from './render-shared';

type Shelf = { id: string; name: string; docIds: string[] };

let overlay: HTMLElement | null = null;
let work: Shelf[] = [];

function topDocIds(): string[] {
  const child = new Set(REFS.flatMap(r => r.childIds));
  return DOCS.filter(d => !child.has(d.id)).map(d => d.id);
}

function unshelved(): string[] {
  const placed = new Set(work.flatMap(s => s.docIds));
  return topDocIds().filter(id => !placed.has(id));
}

function subOf(id: string): string {
  return DOCS.find(d => d.id === id)?.sub ?? id;
}

function moveTargets(currentShelfId: string | null): string {
  const opts = [
    `<option value="">이동…</option>`,
    ...work.filter(s => s.id !== currentShelfId).map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`),
  ];
  if (currentShelfId !== null) opts.push(`<option value="_none">미분류로</option>`);
  return opts.join('');
}

function docRow(docId: string, shelfId: string | null, idx: number, len: number): string {
  return `
    <div class="flex items-center gap-1.5 py-0.5">
      ${shelfId !== null ? `
        <button data-ge="up" data-shelf="${esc(shelfId)}" data-idx="${idx}" class="icon-btn ${idx === 0 ? 'opacity-30 pointer-events-none' : ''}" title="위로">↑</button>
        <button data-ge="down" data-shelf="${esc(shelfId)}" data-idx="${idx}" class="icon-btn ${idx === len - 1 ? 'opacity-30 pointer-events-none' : ''}" title="아래로">↓</button>` : ''}
      <span class="text-sm t-ink flex-1">${esc(subOf(docId))}</span>
      <select data-ge="move" data-doc="${esc(docId)}"
        class="text-xs t-sub border border-[rgba(0,0,0,.08)] rounded-lg px-1.5 py-1 bg-white">${moveTargets(shelfId)}</select>
    </div>`;
}

function renderModal(): void {
  if (!overlay) return;
  const panel = overlay.querySelector('#ge-panel')!;
  const shelvesHtml = work.map(s => `
    <div class="border border-[rgba(0,0,0,.08)] rounded-2xl p-4 flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <input data-shelf-name="${esc(s.id)}" value="${esc(s.name)}"
          class="flex-1 text-sm font-bold t-ink bg-transparent border-b border-[rgba(0,0,0,.1)] focus:outline-none focus:border-[color:var(--accent)] py-1" />
        <button data-ge="del-shelf" data-shelf="${esc(s.id)}" class="icon-btn icon-btn-danger text-xs" title="선반 삭제 (문헌은 미분류로)">삭제</button>
      </div>
      <div>${s.docIds.map((id, i) => docRow(id, s.id, i, s.docIds.length)).join('') || `<div class="text-xs t-faint py-1">비어 있음</div>`}</div>
    </div>`).join('');
  const un = unshelved();
  panel.innerHTML = `
    <div class="text-sm font-bold t-ink">그룹(선반) 편집</div>
    <div class="flex flex-col gap-3 overflow-y-auto max-h-[55vh] pr-1">
      ${shelvesHtml}
      ${un.length ? `
      <div class="border border-dashed border-[rgba(0,0,0,.15)] rounded-2xl p-4 flex flex-col gap-2">
        <div class="text-xs font-bold t-faint">미분류 (선반 밖 — 홈 맨 아래 표시)</div>
        <div>${un.map(id => docRow(id, null, 0, 1)).join('')}</div>
      </div>` : ''}
    </div>
    <div class="flex items-center justify-between">
      <button data-ge="add-shelf" class="btn-ghost">+ 선반 추가</button>
      <div class="flex gap-2">
        <button data-ge="cancel" class="btn-ghost">취소</button>
        <button data-ge="save" class="btn-primary">저장</button>
      </div>
    </div>`;
}

/** 입력 중인 선반 이름을 work 에 반영 (리렌더 전 호출). */
function syncNames(): void {
  overlay?.querySelectorAll<HTMLInputElement>('input[data-shelf-name]').forEach(inp => {
    const s = work.find(x => x.id === inp.dataset.shelfName);
    if (s) s.name = inp.value;
  });
}

async function save(btn: HTMLButtonElement): Promise<void> {
  syncNames();
  btn.textContent = '저장 중…';
  btn.disabled = true;
  try {
    const res  = await fetch('/api/save-groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shelves: work.map(s => ({ id: s.id, name: s.name.trim() || '이름 없는 선반', docIds: s.docIds })),
        refs: REFS,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? '저장 실패');
    hideGroupEdit();
    // 저장 성공 → vite build --watch 재빌드 → 라이브 리로드가 홈을 갱신
  } catch (e) {
    alert(e instanceof Error ? e.message : '저장에 실패했습니다.');
    btn.textContent = '저장';
    btn.disabled = false;
  }
}

function ensureOverlay(): void {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'ge-overlay';
  overlay.className = 'modal-backdrop z-50 hidden';
  overlay.innerHTML = `<div id="ge-panel" class="modal-surface px-7 py-6 w-full max-w-md mx-4 flex flex-col gap-4"></div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) { hideGroupEdit(); return; }
    const el = (e.target as Element).closest<HTMLElement>('[data-ge]');
    if (!el || el.tagName === 'SELECT') return;
    const kind = el.dataset.ge;
    if (kind === 'cancel') { hideGroupEdit(); return; }
    if (kind === 'save')   { void save(el as HTMLButtonElement); return; }
    syncNames();
    if (kind === 'add-shelf') {
      const mx = work.reduce((m, s) => { const g = /^g(\d+)$/.exec(s.id); return g ? Math.max(m, +g[1]) : m; }, 0);
      work.push({ id: `g${mx + 1}`, name: '새 선반', docIds: [] });
    } else if (kind === 'del-shelf') {
      work = work.filter(s => s.id !== el.dataset.shelf);
    } else if (kind === 'up' || kind === 'down') {
      const s = work.find(x => x.id === el.dataset.shelf);
      const i = parseInt(el.dataset.idx!);
      const j = kind === 'up' ? i - 1 : i + 1;
      if (s && j >= 0 && j < s.docIds.length) [s.docIds[i], s.docIds[j]] = [s.docIds[j], s.docIds[i]];
    }
    renderModal();
  });

  overlay.addEventListener('change', e => {
    const sel = e.target as HTMLSelectElement;
    if (sel.dataset.ge !== 'move' || !sel.value) return;
    syncNames();
    const docId = sel.dataset.doc!;
    for (const s of work) s.docIds = s.docIds.filter(x => x !== docId);
    if (sel.value !== '_none') work.find(s => s.id === sel.value)?.docIds.push(docId);
    renderModal();
  });
}

export function showGroupEdit(): void {
  ensureOverlay();
  work = SHELVES.map(s => ({ id: s.id, name: s.name, docIds: [...s.docIds] }));
  renderModal();
  overlay!.classList.remove('hidden');
}

export function hideGroupEdit(): void {
  overlay?.classList.add('hidden');
}

export function isGroupEditOpen(): boolean {
  return overlay !== null && !overlay.classList.contains('hidden');
}
