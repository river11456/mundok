import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitClassical } from '../src/doc-text.ts';
import { nextUserDocId, nextCardId, addTexts } from '../src/user-docs.ts';
import type { DocJSON } from '../src/types.ts';

// ── splitClassical — 붙여넣기 마법사 분할 규칙 ─────────────────────────────

test('빈 입력 → 빈 배열', () => {
  assert.deepEqual(splitClassical(''), []);
  assert.deepEqual(splitClassical('  \n \n '), []);
});

test('줄바꿈이 있으면 줄 단위로만 분할 (부호 무시 — 수동 제어 수단)', () => {
  assert.deepEqual(
    splitClassical('驕恣不論於理。一不治也\n輕身重財 二不治也\n\n衣食不能適 三不治也'),
    ['驕恣不論於理。一不治也', '輕身重財 二不治也', '衣食不能適 三不治也'],
  );
});

test('CRLF 정규화', () => {
  assert.deepEqual(splitClassical('甲\r\n乙\r丙'), ['甲', '乙', '丙']);
});

test('줄바꿈이 없으면 종결 부호 뒤에서 분할', () => {
  assert.deepEqual(
    splitClassical('上古之人 其知道者 法於陰陽。和於術數 食飮有節。起居有常'),
    ['上古之人 其知道者 法於陰陽。', '和於術數 食飮有節。', '起居有常'],
  );
});

test('닫는 인용부호는 앞 문장에 붙는다', () => {
  assert.deepEqual(
    splitClassical('子曰「學而時習之 不亦說乎。」有朋自遠方來 不亦樂乎。'),
    ['子曰「學而時習之 不亦說乎。」', '有朋自遠方來 不亦樂乎。'],
  );
});

test('종결 부호 없는 단일 텍스트는 통째로 한 장', () => {
  assert.deepEqual(splitClassical('驕恣不論於理'), ['驕恣不論於理']);
});

// ── user-docs 순수 로직 ───────────────────────────────────────────────────

test('nextUserDocId — 단조 증가, 무관한 id 무시', () => {
  assert.equal(nextUserDocId([]), 'u1');
  assert.equal(nextUserDocId(['u1', 'u2']), 'u3');
  assert.equal(nextUserDocId(['u2', 'u9', '편작육불치']), 'u10');
});

test('nextCardId — server.py next_id와 동일 규칙', () => {
  assert.equal(nextCardId([], 'sentence'), 's1');
  assert.equal(
    nextCardId([{ id: 's3', text: '', reading: '', meaning: '', note: '' },
                { id: 's12', text: '', reading: '', meaning: '', note: '' }], 'sentence'),
    's13',
  );
  // char 접두사 c가 sentence 카드에 섞여도 오인하지 않음
  assert.equal(
    nextCardId([{ id: 'c7', text: '', reading: '', meaning: '', note: '' }], 'sentence'),
    's1',
  );
});

test('addTexts — 카드 추가, 빈 문자열·중복 건너뜀, levels 자동 생성', () => {
  const doc: DocJSON = { id: 'u1', title: '試', sub: '시', levels: {} };
  const ids = addTexts(doc, 'sentence', ['甲乙。', ' ', '丙丁。', '甲乙。']);
  assert.deepEqual(ids, ['s1', 's2']);
  assert.equal(doc.levels.sentence!.length, 2);
  assert.deepEqual(doc.levels.sentence!.map(c => c.text), ['甲乙。', '丙丁。']);
  // 이어서 추가하면 id가 이어짐
  assert.deepEqual(addTexts(doc, 'sentence', ['戊己。']), ['s3']);
});
