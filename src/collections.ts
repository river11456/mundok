// 값 import는 .ts 확장자 명시 — node 테스트(strip-types)가 이 모듈을 직접 import한다
import type { ShelfJSON } from './types.ts';

/**
 * 사용자 선반(컬렉션) 저장소 — localStorage `mundok-v3/collections` (SPEC 3.4 O1, 4.2).
 *
 * 조직화는 사용자 소유다 (구 P8): 카탈로그 선반(_collections.json)은 최초 1회
 * 시드로만 쓰이고, 이후 이 키가 유일한 정본이다. 키 존재(빈 배열 포함) = 시드 완료.
 *
 * 불변식: 문헌의 위치는 1곳 — 어느 폴더에도 없으면 라이브러리 루트(미분류).
 * 데이터 모델은 parentId로 임의 깊이 폴더 트리를 표현한다. UI는 별도 정책으로 깊이를 제한할 수 있다.
 * 폴더 순서 = 배열 순서, 폴더 내 문헌 순서 = docIds 순서.
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

function parentOf(s: ShelfJSON): string | null {
  return s.parentId ?? null;
}

export function childShelves(shelves: ShelfJSON[], parentId: string | null): ShelfJSON[] {
  return shelves.filter(s => parentOf(s) === parentId);
}

export function shelfById(shelves: ShelfJSON[], id: string | null): ShelfJSON | null {
  if (id === null) return null;
  return shelves.find(s => s.id === id) ?? null;
}

export function shelfDepth(shelves: ShelfJSON[], id: string | null): number {
  let cur = shelfById(shelves, id);
  let depth = 0;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) return depth;
    seen.add(cur.id);
    depth += 1;
    cur = shelfById(shelves, parentOf(cur));
  }
  return depth;
}

/** 첫 폴더 UI 정책: 루트 아래 maxDepth 단계까지만 새 폴더를 만든다. 저장 모델 자체 깊이는 제한하지 않는다. */
export function canCreateChildFolder(shelves: ShelfJSON[], parentId: string | null, maxDepth = 2): boolean {
  return shelfDepth(shelves, parentId) < maxDepth;
}

export function shelfPath(shelves: ShelfJSON[], id: string | null): ShelfJSON[] {
  const path: ShelfJSON[] = [];
  let cur = shelfById(shelves, id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    path.unshift(cur);
    seen.add(cur.id);
    cur = shelfById(shelves, parentOf(cur));
  }
  return path;
}

export function descendantShelfIds(shelves: ShelfJSON[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (parentId: string): void => {
    for (const child of childShelves(shelves, parentId)) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

export function canMoveShelf(shelves: ShelfJSON[], id: string, parentId: string | null): boolean {
  if (!shelfById(shelves, id)) return false;
  if (parentId === null) return true;
  if (id === parentId) return false;
  if (!shelfById(shelves, parentId)) return false;
  return !descendantShelfIds(shelves, id).has(parentId);
}

export function createShelf(shelves: ShelfJSON[], name: string, parentId: string | null = null): { shelves: ShelfJSON[]; id: string } {
  const id = newShelfId(shelves.map(s => s.id));
  const validParent = parentId !== null && shelfById(shelves, parentId) ? parentId : null;
  return { shelves: [...shelves, { id, name, docIds: [], ...(validParent ? { parentId: validParent } : {}) }], id };
}

export function renameShelf(shelves: ShelfJSON[], id: string, name: string): ShelfJSON[] {
  return shelves.map(s => (s.id === id ? { ...s, name } : s));
}

/** 폴더 삭제 — 담긴 문헌과 하위 폴더는 삭제 폴더의 부모로 승격된다. 루트 부모면 문헌은 미분류가 된다. */
export function deleteShelf(shelves: ShelfJSON[], id: string): ShelfJSON[] {
  const target = shelfById(shelves, id);
  if (!target) return shelves;
  const parentId = parentOf(target);
  return shelves
    .filter(s => s.id !== id)
    .map(s => {
      if (s.id === parentId) return { ...s, docIds: [...s.docIds, ...target.docIds] };
      if (parentOf(s) === id) {
        if (parentId === null) {
          const { parentId: _oldParent, ...rootShelf } = s;
          return rootShelf;
        }
        return { ...s, parentId };
      }
      return s;
    });
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

/** 새로 생긴 문헌의 배치. 업데이트는 기존 위치를 그대로 보존한다. */
export function placeCreatedDoc(
  shelves: ShelfJSON[], docId: string, folderId: string | null, updating = false,
): ShelfJSON[] {
  if (updating || folderId === null) return shelves;
  return moveDoc(shelves, docId, folderId);
}

export function moveShelf(shelves: ShelfJSON[], id: string, parentId: string | null): ShelfJSON[] {
  if (!canMoveShelf(shelves, id, parentId)) return shelves;
  return shelves.map(s => {
    if (s.id !== id) return s;
    if (parentId === null) {
      const { parentId: _oldParent, ...rootShelf } = s;
      return rootShelf;
    }
    return { ...s, parentId };
  });
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
    && Array.isArray(s.docIds) && s.docIds.every(d => typeof d === 'string')
    && (s.parentId === undefined || s.parentId === null || typeof s.parentId === 'string');
}

export function normalizeShelves(input: unknown): ShelfJSON[] {
  if (!Array.isArray(input)) return [];
  const ids = new Set<string>();
  const placedDocs = new Set<string>();
  const shelves: ShelfJSON[] = [];
  for (const raw of input) {
    if (!isShelf(raw) || ids.has(raw.id)) continue;
    ids.add(raw.id);
    const docIds = raw.docIds.filter(d => !placedDocs.has(d) && (placedDocs.add(d), true));
    shelves.push({
      id: raw.id,
      name: raw.name,
      docIds,
      ...(raw.parentId ? { parentId: raw.parentId } : {}),
      ...(typeof raw.color === 'string' ? { color: raw.color } : {}),
      ...(typeof raw.icon === 'string' ? { icon: raw.icon } : {}),
    });
  }

  const byId = new Map(shelves.map(s => [s.id, s]));
  const hasCycle = (s: ShelfJSON): boolean => {
    const seen = new Set<string>([s.id]);
    let cur = s.parentId ? byId.get(s.parentId) : undefined;
    while (cur) {
      if (seen.has(cur.id)) return true;
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  };

  return shelves.map(s => {
    if (!s.parentId || !byId.has(s.parentId) || hasCycle(s)) {
      const { parentId: _badParent, ...rootShelf } = s;
      return rootShelf;
    }
    return s;
  });
}

export function loadCollections(): ShelfJSON[] {
  try {
    const raw = localStorage.getItem(V3_COLLECTIONS_KEY);
    const arr = raw ? JSON.parse(raw) as unknown : [];
    return normalizeShelves(arr);
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
