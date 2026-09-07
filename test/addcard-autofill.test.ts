import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCandidateToValues,
  createAutofillState,
  isSingleHanja,
  markFieldDirty,
  prepareValuesForFrontChange,
  shouldAcceptDictionaryResponse,
} from '../src/addcard-autofill.ts';

test('isSingleHanja — 코드포인트 기준 단일 한자만 true', () => {
  assert.equal(isSingleHanja('學'), true);
  assert.equal(isSingleHanja(' 學 '), true);
  assert.equal(isSingleHanja('學問'), false);
  assert.equal(isSingleHanja('학'), false);
  assert.equal(isSingleHanja('𠀀'), true);
});

test('applyCandidateToValues — 빈 필드에는 첫 후보를 적용한다', () => {
  const state = createAutofillState({ reading: '', meaning: '' });
  const values = applyCandidateToValues(
    state,
    { reading: '', meaning: '' },
    { reading: '학', meaning: '배울 학' },
  );

  assert.deepEqual(values, { reading: '학', meaning: '배울 학' });
});

test('applyCandidateToValues — 후보 변경은 자동 채움값만 바꾼다', () => {
  const state = createAutofillState({ reading: '', meaning: '' });
  const first = applyCandidateToValues(
    state,
    { reading: '', meaning: '' },
    { reading: '부', meaning: '아닐 부' },
  );
  const second = applyCandidateToValues(
    state,
    first,
    { reading: '불', meaning: '아닐 불' },
  );

  assert.deepEqual(second, { reading: '불', meaning: '아닐 불' });
});

test('applyCandidateToValues — 모달 시작 시 있던 사용자 값과 직접 입력값은 보호한다', () => {
  const state = createAutofillState({ reading: '신', meaning: '' });
  markFieldDirty(state, 'meaning');

  const values = applyCandidateToValues(
    state,
    { reading: '신', meaning: '직접 쓴 뜻' },
    { reading: '심', meaning: '삼갈 심' },
  );

  assert.deepEqual(values, { reading: '신', meaning: '직접 쓴 뜻' });
});

test('prepareValuesForFrontChange — 이전 front protected 값은 새 front existing 값으로 교체한다', () => {
  const state = createAutofillState({ reading: '학', meaning: '배울 학' });

  const prepared = prepareValuesForFrontChange(
    state,
    { reading: '학', meaning: '배울 학' },
    { reading: '부', meaning: '아닐 부' },
  );
  const afterCandidate = applyCandidateToValues(
    prepared.state,
    prepared.values,
    { reading: '불', meaning: '아닐 불' },
  );

  assert.deepEqual(prepared.values, { reading: '부', meaning: '아닐 부' });
  assert.deepEqual(afterCandidate, { reading: '부', meaning: '아닐 부' });
});

test('prepareValuesForFrontChange — 이전 front protected 값은 새 front existing이 없으면 비우고 후보 적용 가능하게 한다', () => {
  const state = createAutofillState({ reading: '학', meaning: '배울 학' });

  const prepared = prepareValuesForFrontChange(
    state,
    { reading: '학', meaning: '배울 학' },
    {},
  );
  const afterCandidate = applyCandidateToValues(
    prepared.state,
    prepared.values,
    { reading: '무', meaning: '없을 무' },
  );

  assert.deepEqual(prepared.values, { reading: '', meaning: '' });
  assert.deepEqual(afterCandidate, { reading: '무', meaning: '없을 무' });
});

test('shouldAcceptDictionaryResponse — 이전 모달/요청의 늦은 응답은 거절한다', () => {
  assert.equal(shouldAcceptDictionaryResponse(2, 2, 4, 4, '學', '學'), true);
  assert.equal(shouldAcceptDictionaryResponse(1, 2, 4, 4, '學', '學'), false);
  assert.equal(shouldAcceptDictionaryResponse(2, 2, 3, 4, '學', '學'), false);
  assert.equal(shouldAcceptDictionaryResponse(2, 2, 4, 4, '學', '學問'), false);
  assert.equal(shouldAcceptDictionaryResponse(2, 2, 4, 4, '學', ''), false);
});

test('prepareValuesForFrontChange — 學 자동값 뒤 不 전환 시 자동값을 새 후보로 교체 가능하게 한다', () => {
  let state = createAutofillState({ reading: '', meaning: '' });
  let values = applyCandidateToValues(
    state,
    { reading: '', meaning: '' },
    { reading: '학', meaning: '배울 학' },
  );

  const prepared = prepareValuesForFrontChange(state, values, {});
  state = prepared.state;
  values = applyCandidateToValues(
    state,
    prepared.values,
    { reading: '부', meaning: '아닐 부' },
  );

  assert.deepEqual(values, { reading: '부', meaning: '아닐 부' });
});

test('prepareValuesForFrontChange — front 전환 중 직접 입력한 값은 이전 protected와 무관하게 유지한다', () => {
  const state = createAutofillState({ reading: '', meaning: '' });
  const values = applyCandidateToValues(
    state,
    { reading: '', meaning: '' },
    { reading: '학', meaning: '배울 학' },
  );
  markFieldDirty(state, 'meaning');
  state.protected.reading = true;

  const prepared = prepareValuesForFrontChange(
    state,
    { ...values, reading: '학', meaning: '직접 해석' },
    {},
  );

  assert.deepEqual(prepared.values, { reading: '', meaning: '직접 해석' });
  assert.equal(prepared.state.dirty.meaning, true);
});

test('prepareValuesForFrontChange — 새 글자의 기존 카드 값은 보호값으로 반영한다', () => {
  const state = createAutofillState({ reading: '', meaning: '' });
  const values = applyCandidateToValues(
    state,
    { reading: '', meaning: '' },
    { reading: '학', meaning: '배울 학' },
  );

  const prepared = prepareValuesForFrontChange(
    state,
    values,
    { reading: '신', meaning: '삼갈 신' },
  );
  const afterCandidate = applyCandidateToValues(
    prepared.state,
    prepared.values,
    { reading: '심', meaning: '다른 뜻' },
  );

  assert.deepEqual(prepared.values, { reading: '신', meaning: '삼갈 신' });
  assert.deepEqual(afterCandidate, { reading: '신', meaning: '삼갈 신' });
});
