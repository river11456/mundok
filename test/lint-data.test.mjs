import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintDoc, collectHanChars, missingHanChars, WORDMARK } from '../scripts/lint-data.mjs';

function doc(levels) {
  return { id: 'doc1', title: 't', sub: 's', levels };
}

test('정상 문헌은 error/warn 모두 0건', () => {
  const dj = doc({
    sentence: [{ id: 's1', text: '甲乙丙', reading: '', meaning: '', note: '' }],
    word:     [{ id: 'w1', text: '甲乙', reading: '', meaning: '', note: '' }],
  });
  const { errors, warns } = lintDoc(dj);
  assert.equal(errors.length, 0);
  assert.equal(warns.length, 0);
});

test('id 중복은 ERROR', () => {
  const dj = doc({
    char: [
      { id: 'c1', text: '甲', reading: '', meaning: '', note: '' },
      { id: 'c1', text: '乙', reading: '', meaning: '', note: '' },
    ],
  });
  const { errors } = lintDoc(dj);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /카드 id 중복/);
});

test('drill 링크가 존재하지 않는 id를 가리키면 ERROR', () => {
  const dj = doc({
    sentence: [{ id: 's1', text: '甲乙丙', reading: '', meaning: '', note: '', drill: ['w999'] }],
  });
  const { errors } = lintDoc(dj);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /drill 링크 깨짐/);
});

test('문법 인덱스가 범위를 벗어나면 ERROR', () => {
  const dj = doc({
    sentence: [{ id: 's1', text: '甲乙', reading: '', meaning: '', note: '', grammar: [{ type: 'S', start: 0, end: 5 }] }],
  });
  const { errors } = lintDoc(dj);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /문법 인덱스 범위 이상/);
});

test('같은 레벨 텍스트 중복은 WARN(ERROR 아님)', () => {
  const dj = doc({
    char: [
      { id: 'c1', text: '甲', reading: '', meaning: '', note: '' },
      { id: 'c2', text: '甲', reading: '', meaning: '', note: '' },
    ],
  });
  const { errors, warns } = lintDoc(dj);
  assert.equal(errors.length, 0);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /중복 텍스트/);
});

test('sentence 드릴다운 매칭 후보 0건은 WARN', () => {
  const dj = doc({
    sentence: [{ id: 's1', text: '甲乙丙', reading: '', meaning: '', note: '' }],
    word:     [{ id: 'w1', text: '丁戊', reading: '', meaning: '', note: '' }], // 매칭 안 됨
  });
  const { warns } = lintDoc(dj);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /드릴다운 매칭 0건/);
});

test('word 레벨은 드릴다운 0건이어도 WARN 대상이 아니다(char 드릴은 선택)', () => {
  const dj = doc({
    word: [{ id: 'w1', text: '甲乙', reading: '', meaning: '', note: '' }],
  });
  const { warns } = lintDoc(dj);
  assert.equal(warns.length, 0);
});

test('collectHanChars: 전 레벨 text+title+워드마크의 한자만 모으고 한글·공백은 제외', () => {
  const dj = { id: 'doc1', title: '扁鵲', sub: '편작', levels: {
    char:     [{ id: 'c1', text: '驕', reading: '교만할 교', meaning: '', note: '' }],
    sentence: [{ id: 's1', text: '驕恣不論 一也', reading: '', meaning: '뜻풀이', note: '' }],
  } };
  const chars = collectHanChars([dj]);
  for (const ch of ['扁', '鵲', '驕', '恣', '不', '論', '一', '也', ...WORDMARK]) assert.ok(chars.has(ch), ch);
  assert.ok(!chars.has('편'));
  assert.ok(!chars.has(' '));
});

test('missingHanChars: 서브셋에 없는 한자만 반환, 커버 완전하면 빈 배열', () => {
  const dj = { id: 'doc1', title: '甲', sub: '', levels: {
    char: [{ id: 'c1', text: '乙', reading: '', meaning: '', note: '' }],
  } };
  assert.deepEqual(missingHanChars([dj], '甲乙' + WORDMARK), []);
  assert.deepEqual(missingHanChars([dj], '甲' + WORDMARK), ['乙']);
});
