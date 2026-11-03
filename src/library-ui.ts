import { homeDocs } from './docs';
import { S } from './state';
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

/** Shared completion for pointer and keyboard organization. Persist before rendering. */
export function applyLibraryMove(docId: string, folderId: string | null, beforeId?: string | null): void {
  try {
    if (!moveLibraryDoc(docId, folderId, beforeId)) return;
    render();
    const book = Array.from(document.querySelectorAll<HTMLElement>('[data-library-doc]'))
      .find(element => element.dataset.libraryDoc === docId);
    const focusTarget = book?.querySelector<HTMLElement>('.cover')
      ?? document.querySelector<HTMLElement>('.breadcrumbs [aria-current="page"]');
    focusTarget?.focus({ preventScroll: true });
    announce(beforeId === undefined ? '문헌을 이동했습니다.' : '문헌 순서를 변경했습니다.');
  } catch (error) {
    announce(storageErrorMessage(error));
  }
}

export function reorderLibraryDoc(docId: string, direction: -1 | 1): void {
  const ids = homeDocs(S.folderId).map(doc => doc.id);
  const index = ids.indexOf(docId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= ids.length) return;
  applyLibraryMove(docId, S.folderId, direction < 0 ? ids[destination] : ids[destination + 1] ?? null);
}
