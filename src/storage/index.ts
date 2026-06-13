import type { Store } from './types';
import type { UserData } from '../types';
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

export function exportUserData(): void {
  const raw  = localStorage.getItem(LOCAL_KEY) ?? '{"additions":[],"edits":[],"deletions":[],"grammar":[]}';
  const blob = new Blob([raw], { type: 'application/json' });
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
  const d    = JSON.parse(text) as UserData;
  if (typeof d !== 'object' || d === null || !Array.isArray(d.additions)) {
    throw new Error('백업 파일 형식이 올바르지 않습니다.');
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
}
