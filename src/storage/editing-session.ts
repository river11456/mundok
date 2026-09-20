/** A single active application owns writes, including restore and recovery.
 * Holding the lock for the page lifetime also covers synchronous legacy writers. */
export class EditingSessionUnavailable extends Error {}

export async function acquireEditingSession(): Promise<void> {
  if (!navigator.locks) {
    throw new EditingSessionUnavailable('이 브라우저에서는 안전한 저장 잠금을 사용할 수 없습니다. 최신 브라우저에서 다시 열어 주세요.');
  }
  await new Promise<void>((resolve, reject) => {
    navigator.locks.request('mundok-storage-editor', { ifAvailable: true }, async lock => {
      if (!lock) {
        reject(new EditingSessionUnavailable('다른 문독 창이 열려 있습니다. 다른 탭이나 앱 창을 닫고 다시 시도하세요.'));
        return;
      }
      window.addEventListener('pageshow', event => {
        if (event.persisted) location.reload();
      });
      resolve();
      // The browser releases this lock when the document is destroyed. Do not
      // release on pagehide: a cached page still retains writable event handlers.
      await new Promise<void>(() => {});
    }).catch(() => reject(new EditingSessionUnavailable('저장 잠금을 얻지 못했습니다. 브라우저 저장 권한을 확인하고 다시 시도하세요.')));
  });
}
