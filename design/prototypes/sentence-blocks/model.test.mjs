import test from 'node:test';
import assert from 'node:assert/strict';
import { designateRange, insertBlock, mergeBlocks, moveBlock } from './model.ts';
import { USER_DOCS_KEY, loadUserDocs, userEditCard, userSaveGrammar, userSaveInterp } from '../../../src/user-docs.ts';
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

test('split keeps contained annotations active and retains original notes with crossing annotations', () => {
  const original = card('a', '學而時習之', '학이시습지', {
    meaning: '배우고 때때로 익힌다', note: '교수님 설명',
    grammar: [{ type: 'V', start: 0, end: 1 }], interp: [{ start: 2, end: 5 }], status: 'draft',
  });
  const result = designateRange([original], { id: 'a', offset: 1 }, { id: 'a', offset: 3 });
  assert.deepEqual(result[0].grammar, original.grammar);
  assert.equal(result[1].grammar, undefined);
  for (const c of result) {
    assert.equal(c.meaning, '');
    assert.equal(c.note, '');
    assert.equal(c.interp, undefined);
    assert.equal(c.status, 'draft');
    assert.equal(c.pbReferences.length, 1);
    const reference = c.pbReferences[0];
    assert.equal(reference.text, original.text);
    assert.equal(reference.meaning, original.meaning);
    assert.equal(reference.note, original.note);
    assert.deepEqual(reference.interp, original.interp);
    assert.equal(reference.needsReview, true);
  }
});

test('ambiguous reading retained verbatim in notes and blank slots stay explicit', () => {
  const original = card('a', '甲이乙', '갑이');
  const result = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 1 });
  assert.deepEqual(result.map(c => c.reading), ['·', '이·']);
  assert.ok(result.every(c => c.pbReferences[0].reading === '갑이' && c.pbReferences[0].needsReview));
  const partial = designateRange([card('b', '甲乙丙', '갑·병')], { id: 'b', offset: 1 }, { id: 'b', offset: 2 });
  assert.deepEqual(partial.map(c => c.reading), ['갑', '·', '병']);
});

test('merge preserves source order, readings and references; rejects non-contiguous choices', () => {
  const cards = [card('a', '學은 ', '학은 ', { meaning: '배움' }), card('b', '習이다.', '습이다.', { note: '반복' }), card('c', '也', '야')];
  const merged = mergeBlocks(cards, ['b', 'a']);
  assert.equal(merged[0].text, '學은 習이다.');
  assert.equal(merged[0].reading, '학은 습이다.');
  assert.equal(merged[0].meaning, '배움');
  assert.deepEqual(merged[0].pbReferences.map(ref => ref.sourceId), ['a', 'b']);
  assert.ok(merged[0].pbReferences.every(ref => !ref.needsReview));
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

test('contained grammar and interpretation ranges shift by Unicode codepoints in source order', () => {
  const original = card('a', '𠀀甲乙丙丁', '가갑을병정', {
    grammar: [{ type: 'S', start: 0, end: 1 }, { type: 'V', start: 3, end: 5 }],
    interp: [{ start: 3, end: 5 }, { start: 0, end: 1 }],
  });
  const split = designateRange([original], { id: 'a', offset: 3 }, { id: 'a', offset: 5 });
  assert.deepEqual(split[1].grammar, [{ type: 'V', start: 0, end: 2 }]);
  assert.deepEqual(split[1].interp, [{ start: 0, end: 2 }]);
  assert.ok(split.every(c => !c.pbReferences.length));
  const merged = mergeBlocks(split, split.map(c => c.id))[0];
  assert.deepEqual(merged.grammar, original.grammar);
  // Across blocks the new interpretation sequence follows block order.
  assert.deepEqual(merged.interp, [{ start: 0, end: 1 }, { start: 3, end: 5 }]);
});

test('repeated split and merge keeps one original reference and filters unrelated source spans', () => {
  const original = card('a', '甲乙丙丁', '갑을병정', { meaning: '원래 해석', note: '원래 필기' });
  let blocks = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 2 });
  for (let i = 0; i < 3; i++) {
    const merged = mergeBlocks(blocks, blocks.map(c => c.id))[0];
    assert.equal(merged.pbReferences.length, 1);
    assert.equal(merged.pbReferences[0].note, original.note);
    blocks = designateRange([merged], { id: merged.id, offset: 0 }, { id: merged.id, offset: 2 });
  }
  const other = card('b', '戊己', '무기', { note: '다른 문장' });
  const combined = mergeBlocks([blocks[0], other], [blocks[0].id, other.id])[0];
  const separated = designateRange([combined], { id: combined.id, offset: 0 }, { id: combined.id, offset: 2 });
  assert.deepEqual(separated[0].pbReferences.map(ref => ref.sourceId), ['a']);
  assert.deepEqual(separated[1].pbReferences.map(ref => ref.sourceId), ['b']);
});

test('new notes after a split survive another split and changed text retains uncertain inherited references', () => {
  const original = card('a', '甲乙丙丁', '갑을병정', { note: '첫 필기' });
  const [part] = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 3 });
  // Mirrors the existing editor: update known fields without replacing the card object.
  const edited = JSON.parse(JSON.stringify(part));
  Object.assign(edited, { text: '戊甲乙丙', reading: '무갑을병', meaning: '추가 해석', note: '새 필기' });
  const result = designateRange([edited], { id: edited.id, offset: 0 }, { id: edited.id, offset: 1 });
  for (const block of result) {
    assert.ok(block.pbReferences.some(ref => ref.note === '첫 필기' && ref.needsReview));
    assert.ok(block.pbReferences.some(ref => ref.note === '새 필기' && ref.meaning === '추가 해석'));
    assert.ok(block.pbReferences.every(ref => ref.spans.every(span => span.start >= 0 && span.end <= [...block.text].length)));
  }
});

test('moving annotated blocks preserves objects and merge retains whole note order', () => {
  const a = card('a', '甲', '갑', { meaning: '첫 해석', note: '첫 필기' });
  const b = card('b', '乙', '을', { meaning: '둘째 해석', note: '둘째 필기' });
  const moved = moveBlock([a, b], 'b', 0);
  assert.equal(moved[0], b);
  assert.equal(moved[1], a);
  const merged = mergeBlocks(moved, ['a', 'b'])[0];
  assert.equal(merged.meaning, '둘째 해석\n\n첫 해석');
  assert.equal(merged.note, '둘째 필기\n\n첫 필기');
});

test('existing editor storage roundtrip preserves references and invalidates changed-text annotation anchors', () => {
  const savedStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  try {
    const original = card('a', '甲乙丙丁', '갑을병정', { note: '원본 설명', grammar: [{ type: 'S', start: 0, end: 1 }] });
    const [part] = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 3 });
    localStorage.setItem(USER_DOCS_KEY, JSON.stringify([{ id: 'doc', title: '문헌', sub: '', levels: { sentence: [part] } }]));
    userEditCard('doc', 'sentence', part.id, { text: '戊甲乙丙', reading: '무갑을병', meaning: '추가 해석', note: '수정 메모' });
    const saved = loadUserDocs()[0].levels.sentence[0];
    assert.deepEqual(saved.pbReferences, part.pbReferences);
    const result = designateRange([saved], { id: saved.id, offset: 0 }, { id: saved.id, offset: 1 });
    for (const block of result) {
      assert.equal(block.grammar, undefined);
      assert.ok(block.pbReferences.some(ref => ref.text === part.text && ref.grammar.length && ref.needsReview));
      assert.ok(block.pbReferences.some(ref => ref.note === '원본 설명'));
      assert.ok(block.pbReferences.some(ref => ref.note === '수정 메모' && ref.meaning === '추가 해석'));
    }
  } finally {
    if (savedStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = savedStorage;
  }
});

test('boundary-only references follow the affected characters on a later split', () => {
  const original = card('a', '甲乙丙丁戊', '갑을병정무', { grammar: [{ type: 'phrase', start: 0, end: 2 }] });
  const first = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 1 });
  const remainder = first[1];
  const next = designateRange([remainder], { id: remainder.id, offset: 0 }, { id: remainder.id, offset: 1 });
  assert.equal(next[0].text, '乙');
  assert.equal(next[0].pbReferences.length, 1);
  assert.equal(next[1].text, '丙丁戊');
  assert.equal(next[1].pbReferences.length, 0);
});

test('annotations authored after a text edit follow current coordinates, not the generated baseline', () => {
  const savedStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  try {
    const original = card('a', '甲乙丙丁', '갑을병정', { note: '원본 설명' });
    const [part] = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 3 });
    localStorage.setItem(USER_DOCS_KEY, JSON.stringify([{ id: 'doc', title: '문헌', sub: '', levels: { sentence: [part] } }]));
    userEditCard('doc', 'sentence', part.id, { text: '戊甲乙丙', reading: '무갑을병', meaning: '', note: '' });
    userSaveGrammar('doc', part.id, [{ type: 'V', start: 3, end: 4 }]);
    userSaveInterp('doc', part.id, [{ start: 3, end: 4 }]);
    const saved = loadUserDocs()[0].levels.sentence[0];
    const result = designateRange([saved], { id: saved.id, offset: 3 }, { id: saved.id, offset: 4 });
    assert.equal(result[1].text, '丙');
    assert.deepEqual(result[1].grammar, [{ type: 'V', start: 0, end: 1 }]);
    assert.deepEqual(result[1].interp, [{ start: 0, end: 1 }]);
    assert.equal(result[0].grammar, undefined);
    assert.equal(result[0].interp, undefined);
    assert.ok(result.flatMap(c => c.pbReferences).every(ref => !ref.grammar.length && !ref.interp.length));

    delete saved.pbDerived.grammar;
    delete saved.pbDerived.interp;
    const legacy = designateRange([saved], { id: saved.id, offset: 3 }, { id: saved.id, offset: 4 });
    assert.ok(legacy[1].pbReferences.some(ref => ref.text === saved.text && ref.grammar[0]?.start === 3 && ref.needsReview));
    assert.ok(legacy[1].pbReferences.some(ref => ref.text === saved.text && ref.interp[0]?.start === 3 && ref.needsReview));
  } finally {
    if (savedStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = savedStorage;
  }
});

test('adding annotations after a text edit does not promote unchanged old coordinates', () => {
  const original = card('a', '甲乙丙丁', '갑을병정', {
    grammar: [{ type: 'S', start: 0, end: 1 }], interp: [{ start: 0, end: 1 }],
  });
  const [part] = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 3 });
  const edited = { ...part, text: '戊甲乙丙', reading: '무갑을병',
    grammar: [...part.grammar, { type: 'V', start: 3, end: 4 }],
    interp: [...part.interp, { start: 3, end: 4 }],
  };
  const result = designateRange([edited], { id: edited.id, offset: 0 }, { id: edited.id, offset: 1 });
  assert.equal(result[0].text, '戊');
  assert.equal(result[0].grammar, undefined);
  assert.equal(result[0].interp, undefined);
  assert.deepEqual(result[1].grammar, [{ type: 'V', start: 2, end: 3 }]);
  assert.deepEqual(result[1].interp, [{ start: 2, end: 3 }]);
  for (const block of result) {
    assert.ok(block.pbReferences.some(ref => ref.text === part.text && ref.needsReview
      && ref.grammar.length === 1 && ref.grammar[0].type === 'S' && ref.grammar[0].start === 0));
    assert.ok(block.pbReferences.some(ref => ref.text === part.text && ref.needsReview
      && ref.interp.length === 1 && ref.interp[0].start === 0));
    assert.ok(block.pbReferences.every(ref => ref.grammar.every(entry => entry.type !== 'V')));
  }
});
