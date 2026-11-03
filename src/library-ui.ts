import { render } from './render';
import { moveLibraryDoc } from './library-actions';
import { storageErrorMessage } from './storage/recovery-ui';

let status: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function announce(message: string): void {
  if (!status) {
    status = document.createElement('div');
    status.className = 'library-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    document.body.appendChild(status);
  }
  clearTimeout(hideTimer);
  status.textContent = message;
  status.hidden = false;
  hideTimer = setTimeout(() => { if (status) status.hidden = true; }, 5000);
}

/** Complete drag organization after persistence succeeds. */
export function applyLibraryMove(docId: string, folderId: string | null, beforeId?: string | null): boolean {
  try {
    if (!moveLibraryDoc(docId, folderId, beforeId)) return false;
    render();
    const book = Array.from(document.querySelectorAll<HTMLElement>('[data-library-doc]'))
      .find(element => element.dataset.libraryDoc === docId);
    const focusTarget = book?.querySelector<HTMLElement>('.cover')
      ?? document.querySelector<HTMLElement>('.breadcrumbs [aria-current="page"]');
    focusTarget?.focus({ preventScroll: true });
    announce(beforeId === undefined ? '문헌을 이동했습니다.' : '문헌 순서를 변경했습니다.');
    return true;
  } catch (error) {
    announce(storageErrorMessage(error));
    return false;
  }
}
