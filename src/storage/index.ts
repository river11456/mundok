import type { Store } from './types';
import { LocalStore } from './local';
import { V3_DOCS_KEY, V3_SESSION_KEY, V3_PREFS_KEY } from '../migrate-v1';

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

const V1_PREFIX = 'hanja-v2/';
const V3_PREFIX = 'mundok-v3/';
const V3_LOG_PREFIX = 'mundok-v3/log/';
const V1_USERDATA_KEY = 'hanja-v2/userdata';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** v1 UserData(카드 편집 델타) 형태 검증. 어긋나면 throw. */
function validateUserData(d: unknown): void {
  if (!isPlainObject(d) || !Array.isArray(d.additions) || !Array.isArray(d.edits) || !Array.isArray(d.deletions)) {
    throw new Error('백업 파일 형식이 올바르지 않습니다.');
  }
  if (d.grammar !== undefined) {
    if (!Array.isArray(d.grammar)) throw new Error('백업 파일 형식이 올바르지 않습니다 (grammar).');
    for (const g of d.grammar) {
      if (!isPlainObject(g) || typeof g.docId !== 'string' || typeof g.cardFront !== 'string' || !Array.isArray(g.annotations)) {
        throw new Error('백업 파일 형식이 올바르지 않습니다 (grammar 항목).');
      }
      for (const a of g.annotations) {
        if (!isPlainObject(a) || typeof a.start !== 'number' || typeof a.end !== 'number' || typeof a.type !== 'string') {
          throw new Error('백업 파일 형식이 올바르지 않습니다 (grammar annotation).');
        }
      }
    }
  }
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
    content:    { docs: readJson(V3_DOCS_KEY) ?? [] },
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

/** mundok-v3/* 전체 제거 — v1 백업 복원 후 재마이그레이션 유도용 */
function clearV3Keys(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(V3_PREFIX)) localStorage.removeItem(k);
  }
}

/** 백업 파일을 읽어 localStorage에 복원. 형식이 어긋나면 throw. */
export async function importUserData(file: File): Promise<void> {
  const text = await file.text();
  const d    = JSON.parse(text) as unknown;

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
    clearV3Keys();
    localStorage.setItem(V3_DOCS_KEY, JSON.stringify(content.docs));
    for (const [docId, ev] of Object.entries(logs)) {
      localStorage.setItem(`${V3_LOG_PREFIX}${docId}`, JSON.stringify(ev));
    }
    // session은 반드시 기록 — 재마이그레이션 가드가 기기 잔재를 되살리지 않게
    localStorage.setItem(V3_SESSION_KEY, JSON.stringify(
      isPlainObject(progress.session) ? progress.session : { last: null, streak: { lastDate: '', count: 0, todayCards: 0 } },
    ));
    localStorage.setItem(V3_PREFS_KEY, JSON.stringify(isPlainObject(d.preference) ? d.preference : {}));
    return;
  }

  // v2 — hanja-v2/* 키 덤프 (v1 시절) → v1 상태 복원 후 재마이그레이션
  if (isPlainObject(d) && d.version === 2) {
    const keys = d.keys;
    if (!isPlainObject(keys)) throw new Error('백업 파일 형식이 올바르지 않습니다.');
    for (const [k, v] of Object.entries(keys)) {
      if (!(k.startsWith(V1_PREFIX) || k.startsWith(V3_PREFIX)) || typeof v !== 'string') {
        throw new Error('백업 파일 형식이 올바르지 않습니다.');
      }
    }
    const userdataRaw = keys[V1_USERDATA_KEY];
    if (typeof userdataRaw === 'string') validateUserData(JSON.parse(userdataRaw));
    clearV3Keys();   // 백업에 없는 v3 잔재 제거 — v1 백업이면 재마이그레이션 경로
    for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v as string);
    return;
  }

  // 구 포맷 하위호환: userdata 단일 객체만 담긴 백업 파일 → v1 상태 복원 + 재마이그레이션
  validateUserData(d);
  clearV3Keys();
  localStorage.setItem(V1_USERDATA_KEY, JSON.stringify(d));
}
