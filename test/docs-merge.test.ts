import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyUserData, mergeGrammar } from '../src/docs-merge.ts';
import type { Doc, Card, UserData, GrammarEntry } from '../src/types.ts';

function baseCard(id: string, front: string): Card {
  return { id, front, reading: 'r', back: 'b', note: '', fail_count: 0 };
}

function baseDocs(): Doc[] {
  return [
    {
      id: 'doc1', title: 't', sub: 's',
      levels: [
        { key: 'char', label: '글자', cards: [baseCard('c1', '甲'), baseCard('c2', '乙')] },
        { key: 'sentence', label: '문장', cards: [baseCard('s1', '甲乙丙')] },
      ],
    },
  ];
}

function emptyUserData(): UserData {
  return { additions: [], edits: [], deletions: [] };
}

test('deletions — 지정한 text의 카드만 해당 레벨에서 제거된다', () => {
  const docs = baseDocs();
  const ud   = { ...emptyUserData(), deletions: [{ docId: 'doc1', type: 'char' as const, id: 'c1', text: '甲' }] };
  applyUserData(docs, ud);
  const chars = docs[0].levels.find(l => l.key === 'char')!.cards;
  assert.deepEqual(chars.map(c => c.front), ['乙']);
});

test('edits — origText로 매칭된 카드의 필드가 갱신된다', () => {
  const docs = baseDocs();
  const ud   = {
    ...emptyUserData(),
    edits: [{ docId: 'doc1', type: 'char' as const, id: 'c1', origText: '甲', text: '甲甲', reading: 'rr', meaning: 'mm', note: 'nn' }],
  };
  applyUserData(docs, ud);
  const c1 = docs[0].levels.find(l => l.key === 'char')!.cards.find(c => c.id === 'c1')!;
  assert.equal(c1.front, '甲甲');
  assert.equal(c1.reading, 'rr');
  assert.equal(c1.back, 'mm');
  assert.equal(c1.note, 'nn');
});

test('additions — 기존 레벨에 새 카드가 추가된다', () => {
  const docs = baseDocs();
  const ud   = { ...emptyUserData(), additions: [{ docId: 'doc1', type: 'char' as const, text: '丙', reading: 'r', meaning: 'm', note: '' }] };
  applyUserData(docs, ud);
  const chars = docs[0].levels.find(l => l.key === 'char')!.cards;
  assert.deepEqual(chars.map(c => c.front), ['甲', '乙', '丙']);
});

test('additions — 동일 텍스트 중복 추가는 무시된다', () => {
  const docs = baseDocs();
  const ud   = { ...emptyUserData(), additions: [{ docId: 'doc1', type: 'char' as const, text: '甲', reading: '', meaning: '', note: '' }] };
  applyUserData(docs, ud);
  const chars = docs[0].levels.find(l => l.key === 'char')!.cards;
  assert.equal(chars.length, 2);
});

test('additions — 존재하지 않던 레벨은 LEVEL_ORDER 순서를 지켜 새로 생성된다', () => {
  const docs = baseDocs(); // char, sentence만 있고 word 없음
  const ud   = { ...emptyUserData(), additions: [{ docId: 'doc1', type: 'word' as const, text: '甲乙', reading: '', meaning: '', note: '' }] };
  applyUserData(docs, ud);
  assert.deepEqual(docs[0].levels.map(l => l.key), ['char', 'word', 'sentence']);
});

test('mergeGrammar — 같은 (docId, cardFront) 델타가 베이스를 덮어쓴다', () => {
  const base: GrammarEntry[] = [{ docId: 'doc1', cardFront: '甲乙丙', annotations: [{ type: 'S', start: 0, end: 1 }] }];
  const delta: GrammarEntry[] = [{ docId: 'doc1', cardFront: '甲乙丙', annotations: [{ type: 'V', start: 1, end: 2 }] }];
  const merged = mergeGrammar(base, delta);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].annotations, [{ type: 'V', start: 1, end: 2 }]);
});

test('mergeGrammar — 매칭되지 않는 델타는 새 항목으로 추가된다', () => {
  const base: GrammarEntry[] = [];
  const delta: GrammarEntry[] = [{ docId: 'doc1', cardFront: '甲乙丙', annotations: [{ type: 'S', start: 0, end: 1 }] }];
  const merged = mergeGrammar(base, delta);
  assert.equal(merged.length, 1);
});
