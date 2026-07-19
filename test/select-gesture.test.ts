import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelectGesture } from '../src/select-gesture.ts';

// 셀 폭 ~30px 가정의 좌표 헬퍼 — 판정은 픽셀 거리 기준이라 값 자체가 중요
const X = (cell: number) => cell * 30;

test('마우스: 무이동 클릭은 tap (플립/드릴 통과)', () => {
  const g = new SelectGesture();
  g.down('mouse', 2, X(2), 100);
  assert.deepEqual(g.up(), { act: 'tap' });
  assert.equal(g.isArmed, false);
});

test('마우스: SLOP 미만 이동은 여전히 tap', () => {
  const g = new SelectGesture();
  g.down('mouse', 2, X(2), 100);
  assert.deepEqual(g.move(2, X(2) + 5, 100), { act: 'none' });
  assert.deepEqual(g.up(), { act: 'tap' });
});

test('마우스: SLOP 이상 드래그 → update → select (역방향 정규화)', () => {
  const g = new SelectGesture();
  g.down('mouse', 5, X(5), 100);
  assert.deepEqual(g.move(4, X(4), 100), { act: 'update', start: 4, end: 5 });
  assert.deepEqual(g.move(2, X(2), 100), { act: 'update', start: 2, end: 5 });
  assert.deepEqual(g.up(), { act: 'select', start: 2, end: 5 });
});

test('마우스: 셀 밖(idx -1) 이동은 마지막 셀 유지', () => {
  const g = new SelectGesture();
  g.down('mouse', 0, X(0), 100);
  g.move(3, X(3), 100);
  assert.deepEqual(g.move(-1, X(3) + 10, 160), { act: 'update', start: 0, end: 3 });
  assert.deepEqual(g.up(), { act: 'select', start: 0, end: 3 });
});

test('터치: 세로 우세 이동은 dismiss (스크롤 양보)', () => {
  const g = new SelectGesture();
  g.down('touch', 2, X(2), 100);
  assert.deepEqual(g.move(2, X(2) + 2, 112), { act: 'dismiss' });
  assert.equal(g.isArmed, false);
  assert.deepEqual(g.up(), { act: 'none' });
});

test('터치: 가로 우세 이동 fast-path로 선택 시작', () => {
  const g = new SelectGesture();
  g.down('touch', 1, X(1), 100);
  assert.deepEqual(g.move(1, X(1) + 14, 103), { act: 'update', start: 1, end: 1 });
  assert.equal(g.isActive, true);
  g.move(4, X(4), 110);   // 활성 후엔 세로 이동 섞여도 유지
  assert.deepEqual(g.up(), { act: 'select', start: 1, end: 4 });
});

test('터치: 홀드 진입 → 그대로 떼면 한 글자 select', () => {
  const g = new SelectGesture();
  g.down('touch', 3, X(3), 100);
  assert.deepEqual(g.holdFired(), { act: 'update', start: 3, end: 3 });
  assert.deepEqual(g.up(), { act: 'select', start: 3, end: 3 });
});

test('터치: 홀드 후 드래그로 범위 확장 (세로 이동에도 해제 안 됨)', () => {
  const g = new SelectGesture();
  g.down('touch', 3, X(3), 100);
  g.holdFired();
  assert.deepEqual(g.move(6, X(6), 140), { act: 'update', start: 3, end: 6 });
  assert.deepEqual(g.up(), { act: 'select', start: 3, end: 6 });
});

test('홀드는 터치 전용 — 마우스·활성 중·비무장 상태에선 none', () => {
  const g = new SelectGesture();
  assert.deepEqual(g.holdFired(), { act: 'none' });
  g.down('mouse', 1, X(1), 100);
  assert.deepEqual(g.holdFired(), { act: 'none' });
  g.up();
  g.down('touch', 1, X(1), 100);
  g.holdFired();
  assert.deepEqual(g.holdFired(), { act: 'none' });   // 이미 활성
});

test('펜: 마우스처럼 SLOP 즉시 선택, armedKind 노출', () => {
  const g = new SelectGesture();
  g.down('pen', 0, X(0), 100);
  assert.equal(g.armedKind, 'pen');
  assert.deepEqual(g.move(2, X(2), 104), { act: 'update', start: 0, end: 2 });
  assert.deepEqual(g.up(), { act: 'select', start: 0, end: 2 });
  assert.equal(g.armedKind, null);
});

test('cancel: 진행 중 제스처를 dismiss로 종료, 이후 이벤트 무시', () => {
  const g = new SelectGesture();
  g.down('touch', 2, X(2), 100);
  g.holdFired();
  assert.deepEqual(g.cancel(), { act: 'dismiss' });
  assert.deepEqual(g.move(5, X(5), 100), { act: 'none' });
  assert.deepEqual(g.up(), { act: 'none' });
  assert.deepEqual(g.cancel(), { act: 'none' });
});
