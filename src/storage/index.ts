import type { Store } from './types';
import { LocalStore } from './local';

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
//   과도기(백업 포맷 v2, S3에서 v3로 교체 예정):
//   - 내보내기: 구 hanja-v2/*(Progress·구키) + mundok-v3/*(콘텐츠) 모두 담는다
//   - 가져오기: v3 콘텐츠가 없는 백업(v1 시절)이면 mundok-v3/*를 지워
//     다음 로드에서 재마이그레이션되게 한다 (SPEC 9절 단계 7)

const V1_PREFIX = 'hanja-v2/';
const V3_PREFIX = 'mundok-v3/';
const V1_USERDATA_KEY = 'hanja-v2/userdata';
const BACKUP_VERSION = 2;

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

export function exportUserData(): void {
  const keys: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith(V1_PREFIX) || k.startsWith(V3_PREFIX))) keys[k] = localStorage.getItem(k) ?? '';
  }
  const backup = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), keys };
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

  if (isPlainObject(d) && d.version === BACKUP_VERSION) {
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
