import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newShelfId, seedFromCatalog, createShelf, renameShelf, deleteShelf, moveDoc, shelfOf,
} from '../src/collections.ts';
import type { ShelfJSON } from '../src/types.ts';

function sh(id: string, name: string, docIds: string[]): ShelfJSON {
  return { id, name, docIds };
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

test('renameShelf — 이름만 바뀐다', () => {
  const out = renameShelf([sh('g1', '가', ['갑'])], 'g1', '나');
  assert.deepEqual(out, [sh('g1', '나', ['갑'])]);
});

test('deleteShelf — 선반만 사라진다 (문헌은 미분류로)', () => {
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

test('shelfOf — 놓인 선반, 미분류면 null', () => {
  const shelves = [sh('g1', '가', ['갑'])];
  assert.equal(shelfOf(shelves, '갑')?.id, 'g1');
  assert.equal(shelfOf(shelves, '을'), null);
});
