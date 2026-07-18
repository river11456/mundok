import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignReading, isHan } from '../src/reading-align.ts';

test('isHan — 한자만 참', () => {
  assert.equal(isHan('春'), true);
  assert.equal(isHan('은'), false);
  assert.equal(isHan(' '), false);
  assert.equal(isHan('『'), false);
});

test('전체 1:1 — 공백 미러링 포함', () => {
  assert.deepEqual(
    alignReading('春三月 此謂發陳', '춘삼월 차위발진'),
    ['춘', '삼', '월', null, '차', '위', '발', '진'],
  );
});

test('현토 미러링 — 한글 현토는 음 없이 통과', () => {
  assert.deepEqual(
    alignReading('上古之人은 其知道者라', '상고지인은 기지도자라'),
    ['상', '고', '지', '인', null, null, '기', '지', '도', '자', null],
  );
});

test('문장부호 — text에만 있는 따옴표는 건너뛴다', () => {
  assert.deepEqual(
    alignReading('曰 “見肝”', '왈 견간'),
    ['왈', null, null, '견', '간', null],
  );
});

test('독음에 공백이 없어도 정렬된다', () => {
  assert.deepEqual(alignReading('春三月 此謂', '춘삼월차위'), ['춘', '삼', '월', null, '차', '위']);
});

test('라틴 문자 미러링 (與A不若B)', () => {
  assert.deepEqual(alignReading('與A不若B', '여A불약B'), ['여', null, '불', '약', null]);
});

test('훈+음(char 카드) — 정렬 실패', () => {
  assert.equal(alignReading('春', '봄 춘'), null);
});

test('독음 음절 초과 — 정렬 실패', () => {
  assert.equal(alignReading('春三月', '춘삼월 차위'), null);
});

test('한자 수 부족 — 정렬 실패', () => {
  assert.equal(alignReading('春三月', '춘삼'), null);
});

test('빈 독음 — null', () => {
  assert.equal(alignReading('春', ''), null);
});

test('꼬리 공백·부호는 허용', () => {
  assert.deepEqual(alignReading('春三月', '춘삼월 '), ['춘', '삼', '월']);
});

test('BMP 밖 벽자도 1글자로 정렬된다', () => {
  const rare = String.fromCodePoint(0x20000); // 𠀀 (Ext-B)
  assert.deepEqual(alignReading(`${rare}春`, '가춘'), ['가', '춘']);
});
