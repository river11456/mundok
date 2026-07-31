import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitClassical } from '../src/doc-text.ts';
import { newUserDocId, nextCardId, addTexts, mergeCatalogUpdate } from '../src/user-docs.ts';
import type { CardJSON, DocJSON } from '../src/types.ts';

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

test('newUserDocId — u-난수6자 형식, 기존 id와 충돌하지 않음', () => {
  for (let i = 0; i < 20; i++) {
    const id = newUserDocId(['u1', 'u-aaaaaa', '편작육불치']);
    assert.match(id, /^u-[a-z0-9]{6}$/);
    assert.notEqual(id, 'u-aaaaaa');
  }
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

// ── mergeCatalogUpdate (C6) — 카드 id 단위 업데이트 머지 ──────────────────

function mCard(id: string, text: string, extra: Partial<CardJSON> = {}): CardJSON {
  return { id, text, reading: '', meaning: '', note: '', ...extra };
}

function installed(cards: CardJSON[], removed?: string[]): DocJSON {
  return {
    id: 'd', title: '舊', sub: '구', levels: { sentence: cards },
    source: { catalogId: 'd', version: 1, ...(removed ? { removed } : {}) },
  };
}

function upstream(cards: CardJSON[]): DocJSON {
  return { id: 'd', title: '新', sub: '신', levels: { sentence: cards } };
}

test('머지 — 수정 안 한 카드는 상류 개정으로 교체된다', () => {
  const mine   = installed([mCard('s1', '甲')]);
  const theirs = upstream([mCard('s1', '甲改')]);
  const { doc, kept } = mergeCatalogUpdate(mine, theirs);
  assert.equal(doc.levels.sentence![0].text, '甲改');
  assert.equal(kept, 0);
});

test('머지 — editedAt 카드는 유저 것이 보존되고 kept로 집계된다', () => {
  const mine   = installed([mCard('s1', '甲내수정', { editedAt: 123 }), mCard('s2', '乙')]);
  const theirs = upstream([mCard('s1', '甲改'), mCard('s2', '乙改')]);
  const { doc, kept } = mergeCatalogUpdate(mine, theirs);
  assert.deepEqual(doc.levels.sentence!.map(c => c.text), ['甲내수정', '乙改']);
  assert.equal(kept, 1);
});

test('머지 — 유저 삭제 카드(source.removed)는 재도입되지 않는다', () => {
  const mine   = installed([mCard('s2', '乙')], ['s1']);
  const theirs = upstream([mCard('s1', '甲'), mCard('s2', '乙改')]);
  const { doc } = mergeCatalogUpdate(mine, theirs);
  assert.deepEqual(doc.levels.sentence!.map(c => c.id), ['s2']);
});

test('머지 — 유저 추가 카드(상류에 없는 id)는 뒤에 보존된다', () => {
  const mine   = installed([mCard('s1', '甲'), mCard('s9', '내카드', { editedAt: 1 })]);
  const theirs = upstream([mCard('s1', '甲改'), mCard('s2', '乙신규')]);
  const { doc } = mergeCatalogUpdate(mine, theirs);
  assert.deepEqual(doc.levels.sentence!.map(c => c.id), ['s1', 's2', 's9']);
});

test('머지 — 문헌 메타는 상류를 따른다', () => {
  const { doc } = mergeCatalogUpdate(installed([]), upstream([mCard('s1', '甲')]));
  assert.equal(doc.title, '新');
});
