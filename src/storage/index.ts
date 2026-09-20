import type { Store } from './types';
import { LocalStore } from './local';
import { V3_DOCS_KEY, V3_SESSION_KEY, V3_PREFS_KEY } from '../migrate-v1';
import { V3_COLLECTIONS_KEY, normalizeShelves } from '../collections';
import { validateBackup } from './backup-validation';
import { withStorageRecovery, replaceUserData } from './recovery';

export type { Store } from './types';

let _store: Store | null = null;

/**
 * 저장소 초기화 — v2는 LocalStore 단일 (저작 모드 폐지, SPEC 공리 4).
 * BackendStore(계정 동기화) 도입 시 여기서 선택 로직이 부활한다.
 */
export async function initStore(): Promise<Store> {
  if (!_store) _store = new LocalStore();
  return _store;
}

export function store(): Store {
  if (!_store) throw new Error('store가 초기화되지 않았습니다. initStore()를 먼저 호출하세요.');
  return _store;
}

// ── 백업: 내보내기 / 가져오기 (사용자 데이터 보험) ────────────────────────
//   포맷 v3 (SPEC 3.5) — 3계층이 그대로 드러난다:
//     { version: 3, exportedAt, content: { docs }, progress: { logs, session }, preference }
//   가져오기 호환: v3 / v2(hanja-v2 키 덤프 — v1 상태 복원 후 재마이그레이션, SPEC 9절 7단계)
//   / 구 단일 userdata 객체.

const V3_LOG_PREFIX = 'mundok-v3/log/';
const V1_USERDATA_KEY = 'hanja-v2/userdata';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function exportUserData(): void {
  const logs: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(V3_LOG_PREFIX)) logs[k.slice(V3_LOG_PREFIX.length)] = readJson(k) ?? [];
  }
  const backup = {
    version:    3,
    exportedAt: new Date().toISOString(),
    content:    { docs: readJson(V3_DOCS_KEY) ?? [], collections: normalizeShelves(readJson(V3_COLLECTIONS_KEY) ?? []) },
    progress:   { logs, session: readJson(V3_SESSION_KEY) },
    preference: readJson(V3_PREFS_KEY) ?? {},
  };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `문독-백업-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 백업 파일을 읽어 localStorage에 복원. 형식이 어긋나면 throw. */
export async function importUserData(file: File): Promise<void> {
  const text = await file.text();
  const d    = JSON.parse(text) as unknown;
  validateBackup(d);

  // v3 — 3계층 구조 (현행)
  if (isPlainObject(d) && d.version === 3) {
    const content = d.content;
    const progress = isPlainObject(d.progress) ? d.progress : {};
    if (!isPlainObject(content) || !Array.isArray(content.docs)) {
      throw new Error('백업 파일 형식이 올바르지 않습니다 (content.docs).');
    }
    for (const doc of content.docs) {
      if (!isPlainObject(doc) || typeof doc.id !== 'string' || !isPlainObject(doc.levels)) {
        throw new Error('백업 파일 형식이 올바르지 않습니다 (문헌 항목).');
      }
    }
    const logs = isPlainObject(progress.logs) ? progress.logs : {};
    for (const ev of Object.values(logs)) {
      if (!Array.isArray(ev)) throw new Error('백업 파일 형식이 올바르지 않습니다 (리뷰 로그).');
    }
    // 사용자 선반 — 없는 백업(2.1.x 이전)은 키를 남기지 않아 다음 로드에서 재시드된다
    if (content.collections !== undefined && !Array.isArray(content.collections)) {
      throw new Error('백업 파일 형식이 올바르지 않습니다 (content.collections).');
    }
    const keys: Record<string, string> = {
      [V3_DOCS_KEY]: JSON.stringify(content.docs),
      [V3_SESSION_KEY]: JSON.stringify(isPlainObject(progress.session) ? progress.session
        : { last: null, streak: { lastDate: '', count: 0, todayCards: 0 } }),
      [V3_PREFS_KEY]: JSON.stringify(isPlainObject(d.preference) ? d.preference : {}),
    };
    if (Array.isArray(content.collections)) {
      keys[V3_COLLECTIONS_KEY] = JSON.stringify(normalizeShelves(content.collections));
    }
    for (const [docId, ev] of Object.entries(logs)) {
      keys[`${V3_LOG_PREFIX}${docId}`] = JSON.stringify(ev);
    }
    withStorageRecovery(() => replaceUserData(keys));
    return;
  }

  // v2 — hanja-v2/* 키 덤프 (v1 시절) → v1 상태 복원 후 재마이그레이션
  if (isPlainObject(d) && d.version === 2) {
    const keys = d.keys as Record<string, string>;
    withStorageRecovery(() => replaceUserData(keys));
    return;
  }

  // 구 포맷 하위호환: userdata 단일 객체만 담긴 백업 파일 → v1 상태 복원 + 재마이그레이션
  const keys = { [V1_USERDATA_KEY]: JSON.stringify(d) };
  withStorageRecovery(() => replaceUserData(keys));
}
