import { esc } from './render-shared';
import { exportDraft, listDrafts, removeDraft } from './storage/drafts';

/** Read once per home render; typing in the editor never renders this list. */
export function draftListHtml(): string {
  let entries: ReturnType<typeof listDrafts>;
  try {
    entries = listDrafts();
  } catch {
    return `<section class="my-5 text-sm t-sub" aria-label="작성 중인 내용">
      <p role="status">작성 중인 내용을 읽지 못했습니다. 브라우저 저장 권한을 확인한 뒤 다시 시도해 주세요.</p>
      <button type="button" data-action="draft-refresh" class="nav-btn mt-2">다시 시도</button>
    </section>`;
  }
  if (!entries.length) return '';
  entries.sort((a, b) => (b.draft?.updatedAt ?? 0) - (a.draft?.updatedAt ?? 0));

  const rows = entries.map(({ key, draft }) => {
    const arg = esc(key);
    const revision = draft ? ` data-revision="${esc(draft.revision)}"` : '';
    const title = draft ? esc(draft.title || '제목 없는 문헌') : '확인이 필요한 초안';
    const updated = draft ? new Date(draft.updatedAt).toLocaleString('ko-KR') : '';
    const description = draft
      ? `<p class="text-sm t-sub break-words">${esc(draft.fields.text.slice(0, 100))}</p>
         <p class="text-xs t-sub mt-1">${esc(updated)} 수정</p>`
      : '<p class="text-sm t-sub">형식을 읽을 수 없습니다. 파일로 보관해 내용을 확인할 수 있습니다.</p>';
    return `<li class="py-3 border-b border-[var(--line)] flex flex-wrap items-center gap-3">
      <div class="flex-1 min-w-0 basis-full sm:basis-0">
        <h3 class="text-sm font-semibold t-ink break-words">${title}</h3>
        ${description}
      </div>
      <div class="flex flex-wrap gap-2">
        ${draft ? `<button type="button" data-action="draft-resume" data-arg="${arg}" class="nav-btn">이어쓰기</button>` : ''}
        <button type="button" data-action="draft-export" data-arg="${arg}" class="nav-btn">파일로 보관</button>
        <button type="button" data-action="draft-discard" data-arg="${arg}"${revision} class="nav-btn">초안 버리기</button>
      </div>
    </li>`;
  }).join('');

  return `<section class="my-5" aria-labelledby="draft-list-title">
    <h2 id="draft-list-title" class="text-base font-semibold t-ink">작성 중인 내용 <span class="num">${entries.length}</span></h2>
    <p class="text-xs t-sub mt-1">이 기기·브라우저에만 보관되며 전체 백업에는 포함되지 않습니다. 필요한 초안은 별도로 파일로 보관해 주세요.</p>
    <ul class="mt-2">${rows}</ul>
  </section>`;
}

export function exportHomeDraft(key: string): void {
  try {
    exportDraft(key);
  } catch {
    alert('초안을 파일로 보관하지 못했습니다. 초안을 버리지 말고 저장 권한을 확인한 뒤 다시 시도해 주세요.');
  }
}

/** False also covers cancellation/failure, so the caller preserves focus and UI. */
export function discardHomeDraft(key: string, revision?: string): boolean {
  if (!confirm('이 초안을 버리시겠습니까?\n\n작성 중인 내용은 복구할 수 없습니다. 기존에 저장한 카드는 유지됩니다.')) return false;
  try {
    if (removeDraft(key, revision)) return true;
    alert('초안이 변경되어 버리지 않았습니다. 목록을 새로 확인해 주세요.');
  } catch {
    alert('초안을 버리지 못했습니다. 브라우저 저장 권한을 확인한 뒤 다시 시도해 주세요.');
  }
  return false;
}
