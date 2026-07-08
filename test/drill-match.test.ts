import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDrillSpans, spansByStart, spansByIndex, type DrillCandidate } from '../src/drill-match.ts';

function cand(id: string, front: string, back = ''): DrillCandidate {
  return { id, front, back };
}

test('후보가 없으면 빈 배열을 반환한다', () => {
  assert.deepEqual(findDrillSpans('甲乙丙', []), []);
});

test('단일 매칭 — 시작/끝 위치가 올바르다', () => {
  const spans = findDrillSpans('甲乙丙', [cand('w1', '乙丙')]);
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0], { start: 1, end: 3, id: 'w1', front: '乙丙', back: '' });
});

test('긴 텍스트가 짧은 텍스트보다 우선 매칭된다(비중첩)', () => {
  // '甲乙丙' 전체와 '乙丙' 둘 다 매칭 후보 — 긴 쪽이 이겨야 하고, 짧은 쪽은 겹쳐서 버려진다
  const spans = findDrillSpans('甲乙丙', [cand('short', '乙丙'), cand('long', '甲乙丙')]);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].id, 'long');
});

test('겹치지 않는 여러 매칭은 모두 살아남고 시작 위치 순으로 정렬된다', () => {
  const spans = findDrillSpans('甲乙丙丁', [cand('a', '丙丁'), cand('b', '甲乙')]);
  assert.deepEqual(spans.map(s => s.id), ['b', 'a']);
  assert.deepEqual(spans.map(s => [s.start, s.end]), [[0, 2], [2, 4]]);
});

test('같은 텍스트가 여러 번 등장하면 모두 매칭된다(첫 위치만이 아님)', () => {
  const spans = findDrillSpans('甲乙甲乙', [cand('w1', '甲乙')]);
  assert.equal(spans.length, 2);
  assert.deepEqual(spans.map(s => s.start), [0, 2]);
});

test('BMP 밖 벽자(서로게이트 쌍)도 1글자로 세어 코드포인트 인덱스를 반환한다', () => {
  // 𠀋 = U+2000B (CJK 확장 B, UTF-16으로 2유닛). UTF-16 기준이면 start:2가 되는 함정.
  const spans = findDrillSpans('𠀋乙丙', [cand('w1', '乙丙')]);
  assert.equal(spans.length, 1);
  assert.deepEqual([spans[0].start, spans[0].end], [1, 3]);
});

test('벽자가 포함된 후보도 코드포인트 길이로 매칭된다', () => {
  const spans = findDrillSpans('甲𠀋乙', [cand('w1', '𠀋乙')]);
  assert.equal(spans.length, 1);
  assert.deepEqual([spans[0].start, spans[0].end], [1, 3]);
});

test('spansByStart — 시작 인덱스로만 조회 가능(중간 인덱스는 없음)', () => {
  const spans = findDrillSpans('甲乙丙', [cand('w1', '乙丙')]);
  const map = spansByStart(spans);
  assert.ok(map.has(1));
  assert.ok(!map.has(2)); // '丙'은 span 내부지만 시작점이 아님
});

test('spansByIndex — span에 포함된 모든 글자 인덱스로 조회 가능', () => {
  const spans = findDrillSpans('甲乙丙', [cand('w1', '乙丙')]);
  const map = spansByIndex(spans);
  assert.ok(map.has(1));
  assert.ok(map.has(2));
  assert.equal(map.get(1)!.id, 'w1');
  assert.equal(map.get(2)!.id, 'w1');
  assert.ok(!map.has(0));
});
