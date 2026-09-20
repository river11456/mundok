import { recoveryBackup } from './recovery';
import { EditingSessionUnavailable } from './editing-session';

export function storageErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return '저장 공간이 부족합니다. 복구 사본을 보관한 뒤 브라우저의 저장 공간을 확보해 주세요.';
  }
  if (error instanceof Error && error.name === 'SecurityError') {
    return '브라우저가 저장을 허용하지 않습니다. 저장 권한을 확인해 주세요.';
  }
  return error instanceof Error ? error.message : '저장소에 접근하지 못했습니다.';
}

/** Used before event handlers are installed, so partial data cannot be edited. */
export function showStorageError(error: unknown): void {
  const panel = document.createElement('main');
  panel.className = 'max-w-lg mx-auto p-6 space-y-4';
  const title = document.createElement('h1');
  const unavailable = error instanceof EditingSessionUnavailable;
  title.textContent = unavailable ? '문독을 열지 못했습니다' : '저장 데이터를 열지 못했습니다';
  const message = document.createElement('p');
  message.textContent = storageErrorMessage(error);
  const help = document.createElement('p');
  help.textContent = '브라우저 데이터를 삭제하지 마세요. 복구 사본을 보관하고 저장 공간과 권한을 확인한 뒤 다시 시도하세요.';
  const download = document.createElement('button');
  download.className = 'border rounded px-3 py-2';
  download.textContent = '복구 사본 내보내기';
  download.onclick = () => {
    try {
      const blob = new Blob([JSON.stringify(recoveryBackup())], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `문독-복구-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      message.textContent = '복구 사본을 읽지 못했습니다. 기존 백업을 보존하고 브라우저 저장 권한을 확인하세요.';
    }
  };
  const retry = document.createElement('button');
  retry.className = 'border rounded px-3 py-2';
  retry.textContent = '다시 시도';
  retry.onclick = () => location.reload();
  panel.append(title, message);
  if (!unavailable) panel.append(help, download);
  panel.append(retry);
  document.body.replaceChildren(panel);
}
