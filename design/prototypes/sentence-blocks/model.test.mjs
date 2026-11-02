import test from 'node:test';
import assert from 'node:assert/strict';
import { designateRange, insertBlock, mergeBlocks, moveBlock } from './model.ts';
import { alignReading } from '../../../src/reading-align.ts';

const card = (id, text, reading = '', extra = {}) => ({ id, text, reading, meaning: '', note: '', ...extra });
const textOf = cards => cards.map(card => card.text).join('');

test('splits Korean particles and supplementary Han by codepoint without text or reading loss', () => {
  const original = card('a', '學而時習之면𠀀也라.', '학이시습지면가야라.');
  const result = designateRange([original], { id: 'a', offset: 2 }, { id: 'a', offset: 7 });
  assert.deepEqual(result.map(c => c.text), ['學而', '時習之면𠀀', '也라.']);
  assert.equal(textOf(result), original.text);
  assert.deepEqual(result.map(c => c.reading), ['학이', '시습지면가', '야라.']);
  for (const c of result) assert.notEqual(alignReading(c.text, c.reading), null);
  assert.equal(new Set(result.map(c => c.id)).size, 3);
  assert.ok(result.every(c => c.id !== original.id && c.editedAt));
});

test('cross-block designation preserves all exact whitespace and untouched metadata', () => {
  const before = card('before', '前');
  const after = card('after', '後', '후', { status: 'draft' });
  const cards = [before, card('a', ' 學而 ', ' 학이 '), card('b', '時習之\n', '시습지\n'), after];
  const snapshot = JSON.stringify(cards);
  const result = designateRange(cards, { id: 'a', offset: 2 }, { id: 'b', offset: 2 });
  assert.deepEqual(result.map(c => c.text), ['前', ' 學', '而 時習', '之\n', '後']);
  assert.equal(textOf(result), textOf(cards));
  assert.equal(result[0], before);
  assert.equal(result.at(-1), after);
  assert.equal(JSON.stringify(cards), snapshot);
});

test('split annotations become labelled references, not stale active coordinates', () => {
  const original = card('a', '學而時習之', '학이시습지', {
    meaning: '배우고 때때로 익힌다', note: '교수님 설명',
    grammar: [{ type: 'V', start: 0, end: 1 }], interp: [{ start: 2, end: 5 }], status: 'draft',
  });
  const result = designateRange([original], { id: 'a', offset: 1 }, { id: 'a', offset: 3 });
  for (const c of result) {
    assert.equal(c.meaning, '');
    assert.equal(c.grammar, undefined);
    assert.equal(c.interp, undefined);
    assert.equal(c.status, 'draft');
    assert.match(c.note, /분리 전 참고/);
    assert.ok(c.note.includes(original.meaning));
    assert.ok(c.note.includes(original.note));
    assert.ok(c.note.includes(JSON.stringify(original.grammar)));
    assert.ok(c.note.includes(JSON.stringify(original.interp)));
  }
});

test('ambiguous reading retained verbatim in notes and blank slots stay explicit', () => {
  const original = card('a', '甲이乙', '갑이');
  const result = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 1 });
  assert.deepEqual(result.map(c => c.reading), ['·', '이·']);
  assert.ok(result.every(c => c.note.includes('원래 독음 (배치 확인 필요): 갑이')));
  const partial = designateRange([card('b', '甲乙丙', '갑·병')], { id: 'b', offset: 1 }, { id: 'b', offset: 2 });
  assert.deepEqual(partial.map(c => c.reading), ['갑', '·', '병']);
});

test('merge preserves source order, readings and references; rejects non-contiguous choices', () => {
  const cards = [card('a', '學은 ', '학은 ', { meaning: '배움' }), card('b', '習이다.', '습이다.', { note: '반복' }), card('c', '也', '야')];
  const merged = mergeBlocks(cards, ['b', 'a']);
  assert.equal(merged[0].text, '學은 習이다.');
  assert.equal(merged[0].reading, '학은 습이다.');
  assert.match(merged[0].note, /배움/);
  assert.match(merged[0].note, /반복/);
  assert.equal(merged[1], cards[2]);
  assert.throws(() => mergeBlocks(cards, ['a', 'c']));
  assert.throws(() => mergeBlocks(cards, ['a', 'a']));
  assert.throws(() => mergeBlocks(cards, ['a']));
});

test('move uses original insertion slots; insert preserves text and inputs', () => {
  const cards = ['a', 'b', 'c'].map(id => Object.freeze(card(id, id)));
  Object.freeze(cards);
  assert.deepEqual(moveBlock(cards, 'a', 3).map(c => c.id), ['b', 'c', 'a']);
  assert.deepEqual(moveBlock(cards, 'c', 0).map(c => c.id), ['c', 'a', 'b']);
  assert.deepEqual(moveBlock(cards, 'b', 2), cards);
  const inserted = insertBlock(cards, 1, ' 新文\n');
  assert.equal(inserted[1].text, ' 新文\n');
  assert.equal(inserted[0], cards[0]);
  assert.throws(() => insertBlock(cards, 4, '新'));
  assert.throws(() => insertBlock(cards, 1, ' '));
  assert.throws(() => moveBlock(cards, 'missing', 0));
  assert.throws(() => moveBlock(cards, 'a', -1));
});

test('exact whole-block selection is a no-op; invalid and empty ranges reject', () => {
  const cards = [card('a', '甲乙'), card('b', '丙丁')];
  assert.equal(designateRange(cards, { id: 'a', offset: 0 }, { id: 'a', offset: 2 })[0], cards[0]);
  assert.deepEqual(designateRange(cards, { id: 'a', offset: 2 }, { id: 'b', offset: 2 }), cards);
  for (const [start, end] of [
    [{ id: 'a', offset: 1 }, { id: 'a', offset: 1 }],
    [{ id: 'a', offset: 2 }, { id: 'b', offset: 0 }],
    [{ id: 'b', offset: 1 }, { id: 'a', offset: 1 }],
    [{ id: 'a', offset: -1 }, { id: 'a', offset: 1 }],
    [{ id: 'a', offset: 0 }, { id: 'a', offset: 3 }],
    [{ id: 'a', offset: 0.5 }, { id: 'a', offset: 1 }],
  ]) assert.throws(() => designateRange(cards, start, end));
});
