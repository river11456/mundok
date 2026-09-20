/** A durable undo record, kept outside the namespaces being replaced. */
export const RECOVERY_KEY = 'mundok-backup/restore-journal';
export const isUserDataKey = (key: string): boolean =>
  key.startsWith('mundok-v3/') || key.startsWith('hanja-v2/');

export function snapshotUserData(): Record<string, string> {
  const entries: [string, string][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isUserDataKey(key)) {
      const value = localStorage.getItem(key);
      if (value !== null) entries.push([key, value]);
    }
  }
  return Object.fromEntries(entries);
}

export function replaceUserData(keys: Record<string, string>): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && isUserDataKey(key)) localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(keys)) localStorage.setItem(key, value);
}

function recoverySnapshot(): Record<string, string> | null {
  const raw = localStorage.getItem(RECOVERY_KEY);
  if (raw === null) return null;
  const journal = JSON.parse(raw);
  if (journal?.version !== 1 || !journal.before || typeof journal.before !== 'object'
    || Array.isArray(journal.before)
    || Object.entries(journal.before).some(([key, value]) => !isUserDataKey(key) || typeof value !== 'string')) {
    throw new Error('복구 사본을 읽을 수 없습니다. 브라우저 데이터를 삭제하지 마세요.');
  }
  return journal.before;
}

/** Run before any migration or editing; keep the journal if recovery fails. */
export function recoverInterruptedStorage(): void {
  const before = recoverySnapshot();
  if (!before) return;
  replaceUserData(before);
  localStorage.removeItem(RECOVERY_KEY);
}

/** Synchronous writes only: no app mutation starts until the undo record fits. */
export function withStorageRecovery(write: () => void): void {
  recoverInterruptedStorage();
  const before = snapshotUserData();
  localStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, before }));
  try {
    write();
    localStorage.removeItem(RECOVERY_KEY);
  } catch (error) {
    try {
      recoverInterruptedStorage();
    } catch {
      throw new Error('저장 작업과 원본 복구가 중단됐습니다. 브라우저 데이터를 삭제하지 말고 복구 사본을 보관한 뒤 다시 시도하세요.');
    }
    throw error;
  }
}

/** Supported v2 key dump; also works for a pre-migration v1 snapshot. */
export function recoveryBackup(): object {
  const keys = recoverySnapshot() ?? snapshotUserData();
  return { version: 2, keys };
}

export function hasPendingRecovery(): boolean {
  return localStorage.getItem(RECOVERY_KEY) !== null;
}

/** Import and subsequent migration are separate commits. Migration failure
 * preserves the accepted imported source, including all original v1 keys. */
export function initializeStorage(initialize: () => void): void {
  recoverInterruptedStorage();
  const needsMigration = ['mundok-v3/docs', 'mundok-v3/session', 'mundok-v3/collections']
    .some(key => localStorage.getItem(key) === null)
    || Object.keys(snapshotUserData()).some(key => key.startsWith('hanja-v2/'));
  if (needsMigration) withStorageRecovery(initialize);
  else initialize();
}
