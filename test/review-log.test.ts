import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFails, lastTs, compact } from '../src/review-log.ts';
import type { ReviewEvent } from '../src/types.ts';

test('deriveFails — legacy 합산 + anki grade=1만 +1 (v1 fail_count 의미론)', () => {
  const log: ReviewEvent[] = [
    { t: 'legacy', card: 'c1', lv: 'char', ts: 100, fails: 2 },
    { t: 'anki', card: 'c1', lv: 'char', ts: 200, grade: 1 },
    { t: 'anki', card: 'c1', lv: 'char', ts: 300, grade: 3 },   // 쉬움 — 증가 없음
    { t: 'anki', card: 'c2', lv: 'char', ts: 400, grade: 2 },   // 보통 — 증가 없음
    { t: 'seq',  card: 'c1', lv: 'char', ts: 500 },             // 순차 — 무관
  ];
  assert.deepEqual(deriveFails(log, 'char'), { c1: 3 });
});

test('deriveFails — 레벨이 다르면 무시', () => {
  const log: ReviewEvent[] = [
    { t: 'anki', card: 's1', lv: 'sentence', ts: 100, grade: 1 },
  ];
  assert.deepEqual(deriveFails(log, 'char'), {});
  assert.deepEqual(deriveFails(log, 'sentence'), { s1: 1 });
});

test('deriveFails — reset 이후 이벤트만 유효 (해당 레벨만)', () => {
  const log: ReviewEvent[] = [
    { t: 'anki', card: 'c1', lv: 'char', ts: 100, grade: 1 },
    { t: 'anki', card: 's1', lv: 'sentence', ts: 150, grade: 1 },
    { t: 'reset', lv: 'char', ts: 200 },
    { t: 'anki', card: 'c2', lv: 'char', ts: 300, grade: 1 },
  ];
  assert.deepEqual(deriveFails(log, 'char'), { c2: 1 });
  assert.deepEqual(deriveFails(log, 'sentence'), { s1: 1 });   // 다른 레벨 리셋에 안 지워짐
});

test('deriveFails — 시각 승계 이벤트(card 빈 문자열)는 오답 수에 안 잡힘', () => {
  const log: ReviewEvent[] = [{ t: 'legacy', card: '', lv: 'char', ts: 100, fails: 0 }];
  assert.deepEqual(deriveFails(log, 'char'), {});
  assert.equal(lastTs(log), 100);   // 최근 학습 표시는 잇는다
});

test('lastTs — 빈 로그는 0', () => {
  assert.equal(lastTs([]), 0);
});

test('compact — max 이하면 그대로', () => {
  const log: ReviewEvent[] = [{ t: 'anki', card: 'c1', lv: 'char', ts: 1, grade: 1 }];
  assert.equal(compact(log, 10, 5), log);
});

test('compact — 파생값(오답 수·최근 학습)이 압축 전후 동일', () => {
  const log: ReviewEvent[] = [];
  for (let i = 0; i < 100; i++) {
    log.push({ t: 'anki', card: `c${i % 5}`, lv: 'char', ts: i + 1, grade: i % 3 === 0 ? 1 : 3 });
  }
  const before = deriveFails(log, 'char');
  const after  = compact(log, 50, 20);
  assert.ok(after.length < log.length);
  assert.deepEqual(deriveFails(after, 'char'), before);
  assert.equal(lastTs(after), lastTs(log));
});

test('compact — 압축 후 남은 구간의 reset은 요약도 지운다', () => {
  const log: ReviewEvent[] = [];
  for (let i = 0; i < 30; i++) log.push({ t: 'anki', card: 'c1', lv: 'char', ts: i + 1, grade: 1 });
  log.push({ t: 'reset', lv: 'char', ts: 100 });                        // 최근 구간에 위치하도록
  log.push({ t: 'anki', card: 'c2', lv: 'char', ts: 101, grade: 1 });
  const after = compact(log, 10, 5);
  assert.deepEqual(deriveFails(after, 'char'), deriveFails(log, 'char'));
  assert.deepEqual(deriveFails(after, 'char'), { c2: 1 });
});
