// 값 import는 .ts 확장자 명시 — node 테스트(strip-types)가 이 모듈을 직접 import한다
import type { ShelfJSON } from './types.ts';

/**
 * 사용자 선반(컬렉션) 저장소 — localStorage `mundok-v3/collections` (SPEC 3.4 O1, 4.2).
 *
 * 조직화는 사용자 소유다 (구 P8): 카탈로그 선반(_collections.json)은 최초 1회
 * 시드로만 쓰이고, 이후 이 키가 유일한 정본이다. 키 존재(빈 배열 포함) = 시드 완료.
 *
 * 불변식: 문헌의 위치는 1곳 — 어느 선반에도 없으면 미분류. moveDoc이 이를 보장한다.
 * 선반 순서 = 배열 순서, 선반 내 문헌 순서 = docIds 순서.
 */

export const V3_COLLECTIONS_KEY = 'mundok-v3/collections';

// ── 순수 로직 (테스트 대상 — localStorage 비의존) ─────────────────────────

/** 새 선반 id — `g-` + 난수 6자 (카탈로그 시드 g1…과 충돌 없음). */
export function newShelfId(existing: string[]): string {
  const taken = new Set(existing);
  for (;;) {
    const id = `g-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * 카탈로그 선반 → 사용자 선반 시드: 유저 공간에 실존하는 문헌만 남기고(선반은
 * "내가 넣은 것"만 담는다 — 이후 설치 문헌이 소급 배치되지 않게), 빈 선반과
 * 중복 배치(첫 선반 우선)는 버린다.
 */
export function seedFromCatalog(catalogShelves: ShelfJSON[], presentDocIds: string[]): ShelfJSON[] {
  const present = new Set(presentDocIds);
  const placed  = new Set<string>();
  const out: ShelfJSON[] = [];
  for (const s of catalogShelves) {
    const docIds = s.docIds.filter(id => present.has(id) && !placed.has(id) && (placed.add(id), true));
    if (docIds.length) out.push({ id: s.id, name: s.name, docIds });
  }
  return out;
}

export function createShelf(shelves: ShelfJSON[], name: string): { shelves: ShelfJSON[]; id: string } {
  const id = newShelfId(shelves.map(s => s.id));
  return { shelves: [...shelves, { id, name, docIds: [] }], id };
}

export function renameShelf(shelves: ShelfJSON[], id: string, name: string): ShelfJSON[] {
  return shelves.map(s => (s.id === id ? { ...s, name } : s));
}

/** 선반 삭제 — 담겨 있던 문헌은 지워지지 않고 미분류가 된다. */
export function deleteShelf(shelves: ShelfJSON[], id: string): ShelfJSON[] {
  return shelves.filter(s => s.id !== id);
}

/**
 * 문헌 위치 이동 — 모든 선반에서 뺀 뒤 shelfId 선반 끝에 넣는다.
 * shelfId가 null이거나 존재하지 않으면 미분류가 된다.
 */
export function moveDoc(shelves: ShelfJSON[], docId: string, shelfId: string | null): ShelfJSON[] {
  const removed = shelves.map(s =>
    s.docIds.includes(docId) ? { ...s, docIds: s.docIds.filter(d => d !== docId) } : s);
  if (shelfId === null) return removed;
  return removed.map(s => (s.id === shelfId ? { ...s, docIds: [...s.docIds, docId] } : s));
}

/** 문헌이 놓인 선반. 미분류면 null. */
export function shelfOf(shelves: ShelfJSON[], docId: string): ShelfJSON | null {
  return shelves.find(s => s.docIds.includes(docId)) ?? null;
}

// ── localStorage 래퍼 ─────────────────────────────────────────────────────

function isShelf(v: unknown): v is ShelfJSON {
  const s = v as ShelfJSON;
  return typeof v === 'object' && v !== null
    && typeof s.id === 'string' && typeof s.name === 'string'
    && Array.isArray(s.docIds) && s.docIds.every(d => typeof d === 'string');
}

export function loadCollections(): ShelfJSON[] {
  try {
    const raw = localStorage.getItem(V3_COLLECTIONS_KEY);
    const arr = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(arr) ? arr.filter(isShelf) : [];
  } catch {
    return [];
  }
}

export function saveCollections(shelves: ShelfJSON[]): void {
  localStorage.setItem(V3_COLLECTIONS_KEY, JSON.stringify(shelves));
}

/** 최초 1회 시드 — 키가 없을 때만. 백업 복원으로 키가 지워져도 같은 경로로 재시드된다. */
export function seedCollectionsIfNeeded(catalogShelves: ShelfJSON[], presentDocIds: string[]): void {
  if (localStorage.getItem(V3_COLLECTIONS_KEY) !== null) return;
  saveCollections(seedFromCatalog(catalogShelves, presentDocIds));
}
