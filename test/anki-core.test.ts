import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reinsertAfterRating } from '../src/anki-core.ts';
import type { Card } from '../src/types.ts';

function card(id: string): Card {
  return { id, front: id, reading: '', back: '', note: '', fail_count: 0 };
}

test('d=3(쉬움) — 재삽입 없이 큐에서 완전히 제거된다', () => {
  const rest = [card('b'), card('c')];
  const out  = reinsertAfterRating(rest, card('a'), 3);
  assert.deepEqual(out.map(c => c.id), ['b', 'c']);
});

test('d=2(보통) — 남은 큐 중간 위치에 재삽입된다', () => {
  const rest = [card('b'), card('c'), card('d'), card('e')];
  const out  = reinsertAfterRating(rest, card('a'), 2);
  assert.equal(out.length, 5);
  assert.equal(out[Math.floor(rest.length / 2)].id, 'a');
});

test('d=1(어려움) — fail_count가 증가하고 큐 1~3번째 사이에 재삽입된다', () => {
  const c    = card('a');
  const rest = [card('b'), card('c'), card('d'), card('e'), card('f')];
  const out  = reinsertAfterRating(rest, c, 1, () => 0); // rand()=0 → pos = 1
  assert.equal(c.fail_count, 1);
  assert.equal(out.length, 6);
  assert.equal(out[1].id, 'a');
});

test('d=1 — rand()가 최대값에 가까워도 재삽입 위치가 큐 범위를 벗어나지 않는다', () => {
  const rest = [card('b'), card('c'), card('d'), card('e'), card('f')];
  const out  = reinsertAfterRating(rest, card('a'), 1, () => 0.999999);
  // hi = min(3, 5) = 3, pos = 1 + floor(0.999999*3) = 3
  assert.equal(out[3].id, 'a');
  assert.equal(out.length, 6);
});

test('d=1 — 남은 큐가 비어 있으면 맨 앞(0번)에 재삽입된다', () => {
  const out = reinsertAfterRating([], card('a'), 1, () => 0.5);
  assert.deepEqual(out.map(c => c.id), ['a']);
});

test('원본 큐 배열은 변형하지 않는다(불변)', () => {
  const rest = [card('b'), card('c')];
  const snapshot = [...rest];
  reinsertAfterRating(rest, card('a'), 2);
  assert.deepEqual(rest.map(c => c.id), snapshot.map(c => c.id));
});
