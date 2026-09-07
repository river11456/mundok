import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeReadingSyllable,
  planSentenceReadingAutofill,
} from '../src/sentence-reading-autofill.ts';

test('normalizeReadingSyllable — 훈음 형태는 마지막 음절을 쓴다', () => {
  assert.equal(normalizeReadingSyllable('학'), '학');
  assert.equal(normalizeReadingSyllable('교만할 교'), '교');
  assert.equal(normalizeReadingSyllable('같을 약'), '약');
  assert.equal(normalizeReadingSyllable(''), '');
});

test('planSentenceReadingAutofill — 기존 글자 카드 독음이 내장 사전보다 우선한다', () => {
  const result = planSentenceReadingAutofill(
    '學不',
    ['', ''],
    [{ front: '不', reading: '불' }, { front: '學', reading: '학' }],
    {
      不: [{ reading: '부', meaning: '아닐 부' }],
      學: [{ reading: '학', meaning: '배울 학' }],
    },
  );

  assert.deepEqual(result.cells.map(cell => cell.suggestion?.value), ['학', '불']);
  assert.equal(result.filled, 2);
  assert.equal(result.review, 0);
});

test('planSentenceReadingAutofill — 입력된 칸은 보존하고 빈 칸만 채운다', () => {
  const result = planSentenceReadingAutofill(
    '春三月',
    ['춘', '', ''],
    [],
    {
      春: [{ reading: '춘', meaning: '봄 춘' }],
      三: [{ reading: '삼', meaning: '석 삼' }],
      月: [{ reading: '월', meaning: '달 월' }],
    },
  );

  assert.deepEqual(result.cells.map(cell => cell.current || cell.suggestion?.value), ['춘', '삼', '월']);
  assert.equal(result.filled, 2);
  assert.equal(result.preserved, 1);
});

test('planSentenceReadingAutofill — 여러 사전 후보는 첫 독음을 쓰고 검토 대상으로 남긴다', () => {
  const result = planSentenceReadingAutofill(
    '不',
    [''],
    [],
    {
      不: [
        { reading: '부', meaning: '아닐 부' },
        { reading: '불', meaning: '아닐 불' },
      ],
    },
  );

  assert.equal(result.cells[0].suggestion?.value, '부');
  assert.equal(result.cells[0].suggestion?.needsReview, true);
  assert.deepEqual(result.cells[0].suggestion?.candidates.map(candidate => candidate.reading), ['부', '불']);
  assert.equal(result.review, 1);
});

test('planSentenceReadingAutofill — 후보 없는 한자는 비워 둔다', () => {
  const result = planSentenceReadingAutofill('未知', ['', ''], [], {
    未: [{ reading: '미', meaning: '아닐 미' }],
  });

  assert.deepEqual(result.cells.map(cell => cell.suggestion?.value ?? ''), ['미', '']);
  assert.equal(result.unresolved, 1);
});
