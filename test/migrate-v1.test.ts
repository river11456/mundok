import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildV3Docs, SCHEMA_VERSION } from '../src/migrate-v1.ts';
import type { CardJSON, DocJSON, UserData } from '../src/types.ts';

const NOW = '2026-07-31T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);

function card(id: string, text: string): CardJSON {
  return { id, text, reading: 'r', meaning: 'm', note: '' };
}

function bakedDoc(): DocJSON {
  return {
    id: 'doc1', title: 't', sub: 's',
    levels: {
      char:     [card('c1', '甲'), card('c2', '乙')],
      sentence: [card('s1', '甲乙丙')],
    },
  };
}

function emptyDelta(): UserData {
  return { additions: [], edits: [], deletions: [], grammar: [], interp: [] };
}

test('베이킹 문헌 → 설치본: source·schemaVersion 스탬프, 카드 id 보존', () => {
  const [d] = buildV3Docs([bakedDoc()], null, [], NOW);
  assert.equal(d.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(d.source, { catalogId: 'doc1', version: 1, installedAt: NOW });
  assert.deepEqual(d.levels.char!.map(c => c.id), ['c1', 'c2']);
  assert.equal(d.levels.char![0].editedAt, undefined);   // 델타 없음 → 스탬프 없음
});

test('deletion — 카드 제거 + source.removed에 id 기록 (업데이트 재도입 방지)', () => {
  const ud = { ...emptyDelta(), deletions: [{ docId: 'doc1', type: 'char' as const, id: 'c1', text: '甲' }] };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  assert.deepEqual(d.levels.char!.map(c => c.text), ['乙']);
  assert.deepEqual(d.source!.removed, ['c1']);
});

test('edit — origText 매칭 카드 갱신, id 유지, editedAt 스탬프', () => {
  const ud = {
    ...emptyDelta(),
    edits: [{ docId: 'doc1', type: 'char' as const, id: '', origText: '甲', text: '甲甲', reading: 'rr', meaning: 'mm', note: 'nn' }],
  };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  const c1 = d.levels.char!.find(c => c.id === 'c1')!;
  assert.equal(c1.text, '甲甲');
  assert.equal(c1.reading, 'rr');
  assert.equal(c1.meaning, 'mm');
  assert.equal(c1.note, 'nn');
  assert.equal(c1.editedAt, NOW_MS);
});

test('addition — v1 합성 id 그대로 부여 (fails 키 연속성), editedAt 스탬프', () => {
  const ud = { ...emptyDelta(), additions: [{ docId: 'doc1', type: 'char' as const, text: '丙', reading: 'r', meaning: 'm', note: '' }] };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  const added = d.levels.char!.find(c => c.text === '丙')!;
  assert.equal(added.id, 'doc1_char_丙');
  assert.equal(added.editedAt, NOW_MS);
});

test('addition — 동일 텍스트 중복은 무시 (v1과 동일)', () => {
  const ud = { ...emptyDelta(), additions: [{ docId: 'doc1', type: 'char' as const, text: '甲', reading: '', meaning: '', note: '' }] };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  assert.equal(d.levels.char!.length, 2);
});

test('addition — 없던 레벨은 새로 생성된다', () => {
  const ud = { ...emptyDelta(), additions: [{ docId: 'doc1', type: 'word' as const, text: '甲乙', reading: '', meaning: '', note: '' }] };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  assert.equal(d.levels.word!.length, 1);
});

test('grammar 델타 — 카드에 내장된다 (편집 후 텍스트로 매칭)', () => {
  const ud = {
    ...emptyDelta(),
    edits:   [{ docId: 'doc1', type: 'sentence' as const, id: '', origText: '甲乙丙', text: '甲乙丁', reading: 'r', meaning: 'm', note: '' }],
    grammar: [{ docId: 'doc1', cardFront: '甲乙丁', annotations: [{ type: 'S' as const, start: 0, end: 1 }] }],
  };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  const s1 = d.levels.sentence!.find(c => c.id === 's1')!;
  assert.deepEqual(s1.grammar, [{ type: 'S', start: 0, end: 1 }]);
});

test('interp 델타 — sentence 카드에 내장된다', () => {
  const ud = { ...emptyDelta(), interp: [{ docId: 'doc1', cardFront: '甲乙丙', chunks: [{ start: 0, end: 1 }, { start: 1, end: 3 }] }] };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  assert.deepEqual(d.levels.sentence![0].interp, [{ start: 0, end: 1 }, { start: 1, end: 3 }]);
});

test('고아 델타 (매칭 실패) — 조용히 버려지고 나머지는 정상 적용', () => {
  const ud = {
    ...emptyDelta(),
    edits:   [{ docId: 'doc1', type: 'char' as const, id: '', origText: '없는텍스트', text: 'x', reading: '', meaning: '', note: '' }],
    grammar: [{ docId: 'doc1', cardFront: '없는문장', annotations: [{ type: 'V' as const, start: 0, end: 1 }] }],
  };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  assert.equal(d.levels.char!.length, 2);
  assert.equal(d.levels.sentence![0].grammar, undefined);
});

test('사용자 문헌 — id(u1) 보존, schemaVersion 스탬프, 내용 불변', () => {
  const u: DocJSON = { id: 'u1', title: '내 문헌', sub: '', updatedAt: '2026-07-01T00:00:00Z', levels: { sentence: [card('s1', '吾等')] } };
  const docs = buildV3Docs([bakedDoc()], null, [u], NOW);
  const mine = docs.find(d => d.id === 'u1')!;
  assert.equal(mine.schemaVersion, SCHEMA_VERSION);
  assert.equal(mine.updatedAt, '2026-07-01T00:00:00Z');
  assert.deepEqual(mine.levels.sentence!.map(c => c.text), ['吾等']);
});

test('id 충돌 시 사용자 문헌이 이긴다 (공리 3)', () => {
  const u: DocJSON = { id: 'doc1', title: '유저판', sub: '', levels: {} };
  const docs = buildV3Docs([bakedDoc()], null, [u], NOW);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, '유저판');
});

test('다른 문헌의 델타는 적용되지 않는다', () => {
  const ud = { ...emptyDelta(), deletions: [{ docId: 'doc2', type: 'char' as const, id: 'c1', text: '甲' }] };
  const [d] = buildV3Docs([bakedDoc()], ud, [], NOW);
  assert.equal(d.levels.char!.length, 2);
});
