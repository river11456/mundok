import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newShelfId, seedFromCatalog, createShelf, renameShelf, deleteShelf, moveDoc, shelfOf,
  placeCreatedDoc,
  childShelves, shelfDepth, shelfPath, descendantShelfIds, canMoveShelf, moveShelf,
  canCreateChildFolder,
  normalizeShelves,
} from '../src/collections.ts';
import type { ShelfJSON } from '../src/types.ts';

function sh(id: string, name: string, docIds: string[], parentId?: string | null): ShelfJSON {
  return { id, name, docIds, ...(parentId ? { parentId } : {}) };
}

// ── newShelfId ────────────────────────────────────────────────────────────

test('newShelfId — g-난수6자 형식, 기존 id와 충돌하지 않음', () => {
  for (let i = 0; i < 20; i++) {
    const id = newShelfId(['g1', 'g-aaaaaa']);
    assert.match(id, /^g-[a-z0-9]{6}$/);
    assert.notEqual(id, 'g-aaaaaa');
  }
});

// ── seedFromCatalog — 카탈로그 선반 1회 시드 ──────────────────────────────

test('시드 — 유저 공간에 실존하는 문헌만 남긴다', () => {
  const seeded = seedFromCatalog(
    [sh('g1', '1학기 강독', ['갑', '을', '병'])],
    ['갑', '병', '정'],
  );
  assert.deepEqual(seeded, [sh('g1', '1학기 강독', ['갑', '병'])]);
});

test('시드 — 빈 선반은 버린다 (신규 사용자 = 선반 없음)', () => {
  assert.deepEqual(seedFromCatalog([sh('g1', '강독', ['갑', '을'])], []), []);
});

test('시드 — 중복 배치는 첫 선반이 이긴다', () => {
  const seeded = seedFromCatalog(
    [sh('g1', '가', ['갑']), sh('g2', '나', ['갑', '을'])],
    ['갑', '을'],
  );
  assert.deepEqual(seeded, [sh('g1', '가', ['갑']), sh('g2', '나', ['을'])]);
});

// ── 선반 CRUD ─────────────────────────────────────────────────────────────

test('createShelf — 빈 선반이 뒤에 추가되고 원본은 불변', () => {
  const before = [sh('g1', '가', ['갑'])];
  const { shelves, id } = createShelf(before, '새 선반');
  assert.equal(before.length, 1);
  assert.equal(shelves.length, 2);
  assert.deepEqual(shelves[1], sh(id, '새 선반', []));
});

test('createShelf — parentId로 임의 깊이 폴더를 만들 수 있다', () => {
  const { shelves: one, id: a } = createShelf([], '상위');
  const { shelves: two, id: b } = createShelf(one, '하위', a);
  const { shelves: three, id: c } = createShelf(two, '손자', b);
  assert.deepEqual(shelfPath(three, c).map(s => s.id), [a, b, c]);
  assert.equal(shelfDepth(three, c), 3);
});

test('canCreateChildFolder — 저장은 임의 깊이지만 첫 UI 생성은 2단계에서 막는다', () => {
  const shelves = [sh('g1', '상위', []), sh('g2', '하위', [], 'g1'), sh('g3', '가져온 깊은 폴더', [], 'g2')];
  assert.equal(canCreateChildFolder(shelves, null), true);
  assert.equal(canCreateChildFolder(shelves, 'g1'), true);
  assert.equal(canCreateChildFolder(shelves, 'g2'), false);
  assert.equal(canCreateChildFolder(shelves, 'g3'), false);
  assert.equal(shelfDepth(shelves, 'g3'), 3); // 기존/가져온 깊은 트리는 그대로 탐색 가능
});

test('renameShelf — 이름만 바뀐다', () => {
  const out = renameShelf([sh('g1', '가', ['갑'])], 'g1', '나');
  assert.deepEqual(out, [sh('g1', '나', ['갑'])]);
});

test('deleteShelf — 최상위 폴더를 지우면 문헌은 미분류로 가고 자식은 루트로 승격된다', () => {
  const out = deleteShelf([sh('g1', '가', ['갑']), sh('g2', '나', [], 'g1')], 'g1');
  assert.deepEqual(out, [sh('g2', '나', [])]);
});

test('deleteShelf — 중첩 폴더를 지우면 문헌과 자식 폴더가 부모로 승격된다', () => {
  const out = deleteShelf([sh('g1', '가', ['부모']), sh('g2', '나', ['갑'], 'g1'), sh('g3', '다', [], 'g2')], 'g2');
  assert.deepEqual(out, [sh('g1', '가', ['부모', '갑']), sh('g3', '다', [], 'g1')]);
});

test('deleteShelf — 없는 폴더 삭제은 원본을 그대로 반환한다', () => {
  const before = [sh('g1', '가', ['갑']), sh('g2', '나', [])];
  const out = deleteShelf(before, 'missing');
  assert.equal(out, before);
});

test('deleteShelf — 빈 선반 삭제는 기존처럼 선반만 사라진다', () => {
  const out = deleteShelf([sh('g1', '가', ['갑']), sh('g2', '나', [])], 'g1');
  assert.deepEqual(out, [sh('g2', '나', [])]);
});

// ── moveDoc — 위치는 1곳 불변식 ──────────────────────────────────────────

test('moveDoc — 다른 선반에서 빠지고 대상 선반 끝에 붙는다', () => {
  const out = moveDoc([sh('g1', '가', ['갑', '을']), sh('g2', '나', ['병'])], '갑', 'g2');
  assert.deepEqual(out, [sh('g1', '가', ['을']), sh('g2', '나', ['병', '갑'])]);
});

test('moveDoc — null이면 모든 선반에서 빠진다 (미분류)', () => {
  const out = moveDoc([sh('g1', '가', ['갑', '을'])], '갑', null);
  assert.deepEqual(out, [sh('g1', '가', ['을'])]);
});

test('moveDoc — 없는 선반 id면 미분류와 같다', () => {
  const out = moveDoc([sh('g1', '가', ['갑'])], '갑', 'g-없음');
  assert.deepEqual(out, [sh('g1', '가', [])]);
});

test('moveDoc — 같은 선반으로 이동하면 맨 뒤로 간다', () => {
  const out = moveDoc([sh('g1', '가', ['갑', '을'])], '갑', 'g1');
  assert.deepEqual(out, [sh('g1', '가', ['을', '갑'])]);
});

test('placeCreatedDoc — 폴더에서 만든 문헌과 신규 설치 문헌은 그 폴더에 배치한다', () => {
  const shelves = [sh('g1', '가', [])];
  assert.deepEqual(placeCreatedDoc(shelves, '새문헌', 'g1'), [sh('g1', '가', ['새문헌'])]);
});

test('placeCreatedDoc — 루트 생성과 카탈로그 업데이트는 기존 배치를 바꾸지 않는다', () => {
  const shelves = [sh('g1', '가', ['기존문헌'])];
  assert.equal(placeCreatedDoc(shelves, '새문헌', null), shelves);
  assert.equal(placeCreatedDoc(shelves, '기존문헌', 'g2', true), shelves);
});

test('shelfOf — 놓인 선반, 미분류면 null', () => {
  const shelves = [sh('g1', '가', ['갑'])];
  assert.equal(shelfOf(shelves, '갑')?.id, 'g1');
  assert.equal(shelfOf(shelves, '을'), null);
});

// ── 폴더 트리 ────────────────────────────────────────────────────────────

test('childShelves — 부모별 직계 폴더만 반환한다', () => {
  const shelves = [sh('g1', '가', []), sh('g2', '나', [], 'g1'), sh('g3', '다', [], 'g2')];
  assert.deepEqual(childShelves(shelves, null).map(s => s.id), ['g1']);
  assert.deepEqual(childShelves(shelves, 'g1').map(s => s.id), ['g2']);
});

test('descendantShelfIds — 모든 하위 폴더 id를 모은다', () => {
  const shelves = [sh('g1', '가', []), sh('g2', '나', [], 'g1'), sh('g3', '다', [], 'g2'), sh('g4', '라', [])];
  assert.deepEqual([...descendantShelfIds(shelves, 'g1')].sort(), ['g2', 'g3']);
});

test('moveShelf — 폴더를 다른 부모 또는 루트로 이동한다', () => {
  const shelves = [sh('g1', '가', []), sh('g2', '나', []), sh('g3', '다', [], 'g1')];
  assert.deepEqual(moveShelf(shelves, 'g3', 'g2'), [sh('g1', '가', []), sh('g2', '나', []), sh('g3', '다', [], 'g2')]);
  assert.deepEqual(moveShelf(moveShelf(shelves, 'g3', 'g2'), 'g3', null), [sh('g1', '가', []), sh('g2', '나', []), sh('g3', '다', [])]);
});

test('moveShelf — 자기 자신·자손·없는 부모로는 이동하지 않는다', () => {
  const shelves = [sh('g1', '가', []), sh('g2', '나', [], 'g1'), sh('g3', '다', [], 'g2')];
  assert.equal(canMoveShelf(shelves, 'g1', 'g1'), false);
  assert.equal(canMoveShelf(shelves, 'g1', 'g3'), false);
  assert.equal(canMoveShelf(shelves, 'g1', 'missing'), false);
  assert.deepEqual(moveShelf(shelves, 'g1', 'g3'), shelves);
});

test('normalizeShelves — 구형 선반 배열은 최상위 폴더로 유지한다', () => {
  const out = normalizeShelves([{ id: 'g1', name: '가', docIds: ['갑'] }]);
  assert.deepEqual(out, [sh('g1', '가', ['갑'])]);
});

test('normalizeShelves — 중복 문헌·없는 부모·사이클을 보수적으로 정리한다', () => {
  const out = normalizeShelves([
    { id: 'g1', name: '가', docIds: ['갑', '을'], parentId: 'missing' },
    { id: 'g2', name: '나', docIds: ['갑'], parentId: 'g3' },
    { id: 'g3', name: '다', docIds: [], parentId: 'g2' },
  ]);
  assert.deepEqual(out, [sh('g1', '가', ['갑', '을']), sh('g2', '나', []), sh('g3', '다', [])]);
});
