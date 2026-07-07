import type { Store } from './types';
import { ServerStore } from './server';
import { LocalStore, LOCAL_KEY } from './local';

export type { Store } from './types';

let _store: Store | null = null;

/**
 * 로컬 저작 서버(server.py) 존재 여부로 저장소를 선택한다.
 * /api/version 이 응답하면 관리자 저작 모드(ServerStore), 아니면 정적 모드(LocalStore).
 */
export async function initStore(): Promise<Store> {
  if (_store) return _store;
  try {
    const res = await fetch('/api/version', { signal: AbortSignal.timeout(800) });
    if (res.ok) { _store = new ServerStore(); return _store; }
  } catch {
    /* 서버 없음 → 정적 모드 */
  }
  _store = new LocalStore();
  return _store;
}

export function store(): Store {
  if (!_store) throw new Error('store가 초기화되지 않았습니다. initStore()를 먼저 호출하세요.');
  return _store;
}

// ── 백업: 내보내기 / 가져오기 (정적 모드 사용자 데이터 보험) ──────────────
//   카드 편집 델타(userdata)뿐 아니라 안키 오답·최근 학습일·streak 등
//   'hanja-v2/' 접두사 아래 모든 학습 기록을 함께 내보낸다.

const HANJA_PREFIX = 'hanja-v2/';
const BACKUP_VERSION = 2;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** UserData(카드 편집 델타) 형태 검증. 어긋나면 throw. */
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
    if (k && k.startsWith(HANJA_PREFIX)) keys[k] = localStorage.getItem(k) ?? '';
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

/** 백업 파일을 읽어 localStorage에 복원. 형식이 어긋나면 throw. */
export async function importUserData(file: File): Promise<void> {
  const text = await file.text();
  const d    = JSON.parse(text) as unknown;

  if (isPlainObject(d) && d.version === BACKUP_VERSION) {
    const keys = d.keys;
    if (!isPlainObject(keys)) throw new Error('백업 파일 형식이 올바르지 않습니다.');
    for (const [k, v] of Object.entries(keys)) {
      if (!k.startsWith(HANJA_PREFIX) || typeof v !== 'string') {
        throw new Error('백업 파일 형식이 올바르지 않습니다.');
      }
    }
    const userdataRaw = keys[LOCAL_KEY];
    if (typeof userdataRaw === 'string') validateUserData(JSON.parse(userdataRaw));
    for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v as string);
    return;
  }

  // 구 포맷 하위호환: userdata 단일 객체만 담긴 백업 파일
  validateUserData(d);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
}
