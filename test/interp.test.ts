import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpError, toggleChunk } from '../src/interp.ts';

const TEXT = '與其救療於有疾之後론 不若攝養於無疾之先이니';   // 코드포인트 22자

test('interpError — 정상 청크(부분 커버·비순차 순서)', () => {
  assert.equal(interpError(TEXT, [
    { start: 5, end: 7 }, { start: 0, end: 2 }, { start: 11, end: 13 },
  ]), null);
  assert.equal(interpError(TEXT, []), null);
});

test('interpError — 범위 이상', () => {
  assert.match(interpError(TEXT, [{ start: -1, end: 2 }])!, /범위 이상/);
  assert.match(interpError(TEXT, [{ start: 0, end: 23 }])!, /범위 이상/);
  assert.match(interpError(TEXT, [{ start: 3, end: 3 }])!, /범위 이상/);
  assert.match(interpError(TEXT, [{ start: 1.5, end: 3 }])!, /범위 이상/);
});

test('interpError — 겹침 (경계 접촉은 허용)', () => {
  assert.match(interpError(TEXT, [{ start: 0, end: 3 }, { start: 2, end: 5 }])!, /겹침/);
  assert.equal(interpError(TEXT, [{ start: 0, end: 3 }, { start: 3, end: 5 }]), null);
});

test('interpError — 벽자(서러게이트 쌍)도 코드포인트 기준', () => {
  const rare = '𠀀𠀁봄';   // 코드포인트 3자 (UTF-16 5)
  assert.equal(interpError(rare, [{ start: 0, end: 3 }]), null);
  assert.match(interpError(rare, [{ start: 0, end: 4 }])!, /범위 이상/);
});

test('toggleChunk — 겹치지 않으면 맨 뒤(다음 순번)에 추가', () => {
  const out = toggleChunk([{ start: 0, end: 2 }], 5, 7);
  assert.deepEqual(out, [{ start: 0, end: 2 }, { start: 5, end: 7 }]);
});

test('toggleChunk — 겹치는 청크는 제거, 나머지 순번 유지', () => {
  const base = [{ start: 5, end: 7 }, { start: 0, end: 2 }, { start: 11, end: 13 }];
  assert.deepEqual(toggleChunk(base, 6, 8), [{ start: 0, end: 2 }, { start: 11, end: 13 }]);
  // 넓게 그으면 겹친 청크 전부 제거
  assert.deepEqual(toggleChunk(base, 0, 12), []);
});

test('toggleChunk — 원본 배열은 불변', () => {
  const base = [{ start: 0, end: 2 }];
  toggleChunk(base, 5, 7);
  toggleChunk(base, 0, 2);
  assert.deepEqual(base, [{ start: 0, end: 2 }]);
});
