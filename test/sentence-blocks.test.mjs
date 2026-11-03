import test from 'node:test';
import assert from 'node:assert/strict';
import { designateRange, insertBlock, mergeBlocks, moveBlock, composeHyeonto, getHyeonto, suggestHyeonto, setHyeonto, hyeontoSegments } from '../src/sentence-blocks.ts';
import { USER_DOCS_KEY, loadUserDocs, userEditCard, userSaveGrammar, userSaveInterp, replaceSentenceCards, mergeCatalogUpdate, installCatalogDoc } from '../src/user-docs.ts';
import { alignReading } from '../src/reading-align.ts';

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
  assert.equal(result[0].id, original.id);
  assert.ok(result.every(c => c.editedAt));
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

test('three-way split puts all notes on the earliest fragment and clips ranged annotations', () => {
  const original = card('a', '學而時習之', '학이시습지', {
    meaning: '배우고 때때로 익힌다', note: '교수님 설명',
    grammar: [{ type: 'V', start: 0, end: 2 }], interp: [{ start: 2, end: 5 }], status: 'draft',
  });
  const result = designateRange([original], { id: 'a', offset: 1 }, { id: 'a', offset: 3 });
  assert.deepEqual(result.map(c => c.text), ['學', '而時', '習之']);
  assert.deepEqual(result.map(c => c.meaning), [original.meaning, '', '']);
  assert.deepEqual(result.map(c => c.note), [original.note, '', '']);
  assert.deepEqual(result[0].grammar, [{ type: 'V', start: 0, end: 1 }]);
  assert.deepEqual(result[1].grammar, [{ type: 'V', start: 0, end: 1 }]);
  assert.deepEqual(result[1].interp, [{ start: 1, end: 2 }]);
  assert.deepEqual(result[2].interp, [{ start: 0, end: 2 }]);
  assert.ok(result.every(c => c.status === 'draft'));
  assert.ok(result.flatMap(c => c.blockReferences).every(ref => !ref.meaning && !ref.note));
});

test('uncertain readings block split and merge without mutation; blank and explicit partial readings remain editable', () => {
  for (const original of [card('a', '甲이乙', '갑이'), card('a', '甲乙', '갑을병')]) {
    const snapshot = JSON.stringify(original);
    assert.throws(() => designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 1 }), /독음.*먼저 확인/);
    assert.throws(() => mergeBlocks([original, card('b', '丙', '병')], ['a', 'b']), /독음.*먼저 확인/);
    assert.equal(JSON.stringify(original), snapshot);
  }
  const partial = designateRange([card('b', '甲乙丙', '갑·병')], { id: 'b', offset: 1 }, { id: 'b', offset: 2 });
  assert.deepEqual(partial.map(c => c.reading), ['갑', '·', '병']);
  const blank = designateRange([card('c', '甲乙')], { id: 'c', offset: 0 }, { id: 'c', offset: 1 });
  assert.deepEqual(blank.map(c => c.text), ['甲', '乙']);
});

test('merge preserves source order, readings and references; rejects non-contiguous choices', () => {
  const cards = [card('a', '學은 ', '학은 ', { meaning: '배움' }), card('b', '習이다.', '습이다.', { note: '반복' }), card('c', '也', '야')];
  const merged = mergeBlocks(cards, ['b', 'a']);
  assert.equal(merged[0].text, '學은 習이다.');
  assert.equal(merged[0].reading, '학은 습이다.');
  assert.equal(merged[0].meaning, '배움');
  assert.deepEqual(merged[0].blockReferences, []);
  assert.ok(merged[0].blockReferences.every(ref => !ref.needsReview));
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
  assert.ok(split.every(c => !c.blockReferences.length));
  const merged = mergeBlocks(split, split.map(c => c.id))[0];
  assert.deepEqual(merged.grammar, original.grammar);
  // Across blocks the new interpretation sequence follows block order.
  assert.deepEqual(merged.interp, [{ start: 0, end: 1 }, { start: 3, end: 5 }]);
});

test('repeated split and merge retains notes once without shared note references', () => {
  const original = card('a', '甲乙丙丁', '갑을병정', { meaning: '원래 해석', note: '원래 필기' });
  let blocks = designateRange([original], { id: 'a', offset: 1 }, { id: 'a', offset: 3 });
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(blocks.map(c => c.note), [original.note, '', '']);
    const merged = mergeBlocks(blocks, blocks.map(c => c.id))[0];
    assert.equal(merged.note, original.note);
    assert.equal(merged.meaning, original.meaning);
    assert.equal(merged.blockReferences.length, 0);
    blocks = designateRange([merged], { id: merged.id, offset: 1 }, { id: merged.id, offset: 3 });
  }
});

test('cross-card selection assigns each original note to its earliest surviving fragment', () => {
  const a = card('a', '甲乙', '갑을', { meaning: 'A 해석', note: 'A 필기' });
  const b = card('b', '丙丁', '병정', { meaning: 'B 해석', note: 'B 필기' });
  const c = card('c', '戊己', '무기', { meaning: 'C 해석', note: 'C 필기' });
  const blocks = designateRange([a, b, c], { id: 'a', offset: 1 }, { id: 'c', offset: 1 });
  assert.deepEqual(blocks.map(c => c.text), ['甲', '乙丙丁戊', '己']);
  assert.deepEqual(blocks.map(c => c.meaning), ['A 해석', 'B 해석\n\nC 해석', '']);
  assert.deepEqual(blocks.map(c => c.note), ['A 필기', 'B 필기\n\nC 필기', '']);
});

test('new notes after a split survive on the first fragment of another split', () => {
  const original = card('a', '甲乙丙丁', '갑을병정', { note: '첫 필기' });
  const [part] = designateRange([original], { id: 'a', offset: 0 }, { id: 'a', offset: 3 });
  const edited = JSON.parse(JSON.stringify(part));
  Object.assign(edited, { text: '戊甲乙丙', reading: '무갑을병', meaning: '추가 해석', note: '새 필기' });
  const result = designateRange([edited], { id: edited.id, offset: 0 }, { id: edited.id, offset: 1 });
  assert.deepEqual(result.map(c => c.meaning), ['추가 해석', '']);
  assert.deepEqual(result.map(c => c.note), ['새 필기', '']);
  assert.ok(result.every(c => !c.blockReferences.length));
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
    assert.equal(saved.grammar, undefined);
    assert.ok(saved.blockReferences.some(ref => ref.text === part.text && ref.grammar.length));
    const result = designateRange([saved], { id: saved.id, offset: 0 }, { id: saved.id, offset: 1 });
    for (const block of result) {
      assert.equal(block.grammar, undefined);
      assert.ok(block.blockReferences.some(ref => ref.text === part.text && ref.grammar.length && ref.needsReview));
      assert.ok(block.blockReferences.every(ref => !ref.note && !ref.meaning));
    }
    assert.deepEqual(result.map(c => c.meaning), ['추가 해석', '']);
    assert.deepEqual(result.map(c => c.note), ['수정 메모', '']);
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
  assert.equal(next[0].blockReferences.length, 1);
  assert.equal(next[1].text, '丙丁戊');
  assert.equal(next[1].blockReferences.length, 0);
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
    assert.ok(result.flatMap(c => c.blockReferences).every(ref => !ref.grammar.length && !ref.interp.length));

    saved.blockDerived.text = part.text; // Simulate an older stale baseline.
    delete saved.blockDerived.grammar;
    delete saved.blockDerived.interp;
    const legacy = designateRange([saved], { id: saved.id, offset: 3 }, { id: saved.id, offset: 4 });
    assert.ok(legacy[1].blockReferences.some(ref => ref.text === saved.text && ref.grammar[0]?.start === 3 && ref.needsReview));
    assert.ok(legacy[1].blockReferences.some(ref => ref.text === saved.text && ref.interp[0]?.start === 3 && ref.needsReview));
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
    assert.ok(block.blockReferences.some(ref => ref.text === part.text && ref.needsReview
      && ref.grammar.length === 1 && ref.grammar[0].type === 'S' && ref.grammar[0].start === 0));
    assert.ok(block.blockReferences.some(ref => ref.text === part.text && ref.needsReview
      && ref.interp.length === 1 && ref.interp[0].start === 0));
    assert.ok(block.blockReferences.every(ref => ref.grammar.every(entry => entry.type !== 'V')));
  }
});

test('hyeonto suggestions preserve exact mixed text and require explicit confirmation', () => {
  const original = card('h', '설명 𠀀하고 學에 대한 설명.也라', '');
  const data = suggestHyeonto(original);
  assert.deepEqual(data, { original: '설명 𠀀 學 대한 설명.也', marks: [
    { offset: 4, text: '하고' }, { offset: 6, text: '에' }, { offset: 14, text: '라' },
  ] });
  assert.equal(composeHyeonto(data), original.text);
  assert.equal(getHyeonto(original), null);
  assert.equal(hyeontoSegments(original).map(part => part.text).join(''), original.text);
  assert.deepEqual(hyeontoSegments(original).filter(part => part.kind === 'hyeonto').map(part => part.text), ['하고', '에', '라']);
  const confirmed = setHyeonto(original, data);
  assert.equal(confirmed.text, original.text);
  assert.deepEqual(getHyeonto(confirmed), data);
  assert.equal(hyeontoSegments(confirmed).map(part => part.text).join(''), original.text);
  assert.deepEqual(hyeontoSegments(confirmed).filter(part => part.kind === 'hyeonto').map(part => part.text), ['하고', '에', '라']);
  assert.equal(original.hyeonto, undefined);
});

test('hyeonto insertion replacement and removal preserve readings notes and range coordinates', () => {
  const original = card('h', '𠀀乙 丙', '갑을 병', { meaning: '해석', note: '메모',
    grammar: [{ type: 'S', start: 0, end: 1 }, { type: 'V', start: 1, end: 2 }],
    interp: [{ start: 1, end: 4 }],
  });
  const inserted = setHyeonto(original, { original: original.text, marks: [{ offset: 1, text: '하고' }, { offset: 4, text: '이라' }] });
  assert.equal(inserted.text, '𠀀하고乙 丙이라');
  assert.equal(inserted.reading, '갑하고을 병이라');
  assert.deepEqual(inserted.grammar, [{ type: 'S', start: 0, end: 1 }, { type: 'V', start: 3, end: 4 }]);
  assert.deepEqual(inserted.interp, [{ start: 3, end: 6 }]);
  assert.equal(inserted.meaning, '해석');
  assert.equal(inserted.note, '메모');
  const replaced = setHyeonto(inserted, { original: original.text, marks: [{ offset: 1, text: '은' }] });
  assert.equal(replaced.reading, '갑은을 병');
  assert.deepEqual(replaced.grammar, [{ type: 'S', start: 0, end: 1 }, { type: 'V', start: 2, end: 3 }]);
  const removed = setHyeonto(replaced, { original: original.text, marks: [] });
  assert.equal(removed.text, original.text);
  assert.equal(removed.reading, original.reading);
  assert.deepEqual(removed.grammar, original.grammar);
  assert.deepEqual(removed.interp, original.interp);
});

test('hyeonto split snaps before or within a mark to keep it with its preceding Han', () => {
  const original = setHyeonto(card('h', '𠀀하고乙이라', '갑하고을이라', { meaning: '필기' }), {
    original: '𠀀乙', marks: [{ offset: 1, text: '하고' }, { offset: 2, text: '이라' }],
  });
  for (const offset of [1, 2, 3]) {
    const split = designateRange([original], { id: 'h', offset: 0 }, { id: 'h', offset });
    assert.deepEqual(split.map(value => value.text), ['𠀀하고', '乙이라']);
    assert.deepEqual(split.map(value => getHyeonto(value)), [
      { original: '𠀀', marks: [{ offset: 1, text: '하고' }] },
      { original: '乙', marks: [{ offset: 1, text: '이라' }] },
    ]);
    assert.deepEqual(split.map(value => value.meaning), ['필기', '']);
    const merged = mergeBlocks(split, split.map(value => value.id));
    assert.equal(merged[0].text, original.text);
    assert.deepEqual(getHyeonto(merged[0]), getHyeonto(original));
    assert.equal(merged[0].reading, original.reading);
  }
  const rest = designateRange([original], { id: 'h', offset: 1 }, { id: 'h', offset: 6 });
  assert.deepEqual(rest.map(value => value.text), ['𠀀하고', '乙이라']);
  assert.throws(() => designateRange([original], { id: 'h', offset: 1 }, { id: 'h', offset: 2 }));
});

test('merge preserves candidate display without confirming inferred hyeonto', () => {
  const left = card('a', '설명 學은 ');
  const right = setHyeonto(card('b', '𠀀하고乙'), { original: '𠀀乙', marks: [{ offset: 1, text: '하고' }] });
  const result = mergeBlocks([left, right], ['a', 'b'])[0];
  assert.equal(result.text, '설명 學은 𠀀하고乙');
  assert.deepEqual(getHyeonto(result), { original: '설명 學 𠀀乙', marks: [{ offset: 4, text: '은', unconfirmed: true }, { offset: 6, text: '하고' }] });
  assert.deepEqual(hyeontoSegments(result).filter(part => part.kind === 'hyeonto').map(part => part.text), ['은', '하고']);
});

test('hyeonto metadata survives JSON storage but external source editing invalidates its use', () => {
  const original = setHyeonto(card('a', '學而', '학이'), { original: '學而', marks: [{ offset: 1, text: '은' }] });
  const loaded = JSON.parse(JSON.stringify(original));
  assert.deepEqual(getHyeonto(loaded), getHyeonto(original));
  const edited = { ...loaded, text: '學은時習', reading: '학은시습' };
  assert.equal(getHyeonto(edited), null);
  assert.deepEqual(edited.hyeonto, original.hyeonto);
  assert.equal(hyeontoSegments(edited).map(part => part.text).join(''), edited.text);
  assert.deepEqual(hyeontoSegments(edited).filter(part => part.kind === 'hyeonto').map(part => part.text), ['은']);
  const reconfirmed = setHyeonto(edited, suggestHyeonto(edited));
  assert.equal(composeHyeonto(getHyeonto(reconfirmed)), edited.text);
});

test('selective legacy classification uses an exact reviewed baseline while editing marks', () => {
  const original = card('a', '甲은乙설명', '갑은을설명');
  const baseline = { original: '甲乙설명', marks: [{ offset: 1, text: '은' }] };
  const changed = setHyeonto(original, { original: baseline.original, marks: [{ offset: 1, text: '하고' }] }, baseline);
  assert.equal(changed.text, '甲하고乙설명');
  assert.equal(changed.reading, '갑하고을설명');
  assert.equal(getHyeonto(changed).original, '甲乙설명');
  assert.throws(() => setHyeonto(original, { original: '甲乙', marks: [{ offset: 1, text: '하고' }] }, baseline), /원문/);
});

test('hyeonto rejects invalid anchors and uncertain reading changes without mutating the source', () => {
  for (const marks of [[{ offset: 0, text: '은' }], [{ offset: 2, text: '은' }], [{ offset: 1, text: 'x' }], [{ offset: 1, text: '은' }, { offset: 1, text: '이' }]]) {
    assert.throws(() => composeHyeonto({ original: '甲 ', marks }));
  }
  const original = card('a', '甲이乙', '갑이');
  const snapshot = JSON.stringify(original);
  const confirmed = setHyeonto(original, suggestHyeonto(original));
  assert.equal(confirmed.reading, '갑이');
  assert.throws(() => setHyeonto(confirmed, { original: '甲乙', marks: [{ offset: 1, text: '하고' }] }), /독음/);
  assert.equal(JSON.stringify(original), snapshot);
});

test('removed hyeonto-only annotations remain archived rather than attaching to a different Han', () => {
  const original = setHyeonto(card('a', '甲이乙', '갑이을', { grammar: [{ type: 'phrase', start: 1, end: 2 }] }), suggestHyeonto(card('a', '甲이乙')));
  const changed = setHyeonto(original, { original: '甲乙', marks: [] });
  assert.equal(changed.grammar, undefined);
  assert.deepEqual(changed.blockReferences[0].grammar, original.grammar);
  assert.equal(changed.blockReferences[0].text, original.text);
  assert.equal(changed.blockReferences[0].needsReview, true);
});


test('initial learning keeps blank readings blank and preserves known partial Han readings', () => {
  const data = { original: '學而時習之', marks: [{ offset: 5, text: '면' }] };
  const blank = setHyeonto(card('a', data.original), data);
  assert.equal(blank.reading, '');
  assert.equal(blank.text, '學而時習之면');
  const partial = setHyeonto(card('b', data.original, '학·시'), data);
  assert.equal(partial.reading, '학·시··면');
  const changed = setHyeonto(partial, { ...data, marks: [{ offset: 5, text: '하고' }] });
  assert.equal(changed.reading, '학·시··하고');
});

test('existing sentence storage keeps confirmed metadata and safely invalidates it on raw text edits', () => {
  const savedStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  try {
    const original = setHyeonto(card('a', '學而', '학이'), { original: '學而', marks: [{ offset: 1, text: '은' }] });
    localStorage.setItem(USER_DOCS_KEY, JSON.stringify([{ id: 'doc', title: '문헌', sub: '', levels: { sentence: [original] } }]));
    userEditCard('doc', 'sentence', 'a', { text: original.text, reading: original.reading, meaning: '해석', note: '필기' });
    const saved = loadUserDocs()[0].levels.sentence[0];
    assert.deepEqual(getHyeonto(saved), getHyeonto(original));
    userEditCard('doc', 'sentence', 'a', { text: '學은時習', reading: '학은시습', meaning: '해석', note: '필기' });
    const edited = loadUserDocs()[0].levels.sentence[0];
    assert.equal(getHyeonto(edited), null);
    assert.deepEqual(edited.hyeonto, original.hyeonto);
    assert.equal(edited.meaning, '해석');
    assert.equal(edited.note, '필기');
  } finally {
    if (savedStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = savedStorage;
  }
});


test('hyeonto changes archive stale and newly removed annotations against their own source text', () => {
  const initial = setHyeonto(card('a', '甲乙', '갑을', { grammar: [{ type: 'S', start: 0, end: 1 }] }), {
    original: '甲乙', marks: [{ offset: 1, text: '이' }],
  });
  const edited = { ...initial, text: '丙甲이乙', reading: '병갑이을',
    grammar: [...initial.grammar, { type: 'phrase', start: 2, end: 3 }],
  };
  const confirmed = setHyeonto(edited, suggestHyeonto(edited));
  const changed = setHyeonto(confirmed, { original: '丙甲乙', marks: [] });
  assert.equal(changed.grammar, undefined);
  assert.deepEqual(changed.blockReferences.find(ref => ref.text === initial.text).grammar, initial.grammar);
  assert.deepEqual(changed.blockReferences.find(ref => ref.text === edited.text).grammar, [{ type: 'phrase', start: 2, end: 3 }]);
});


function withStorage(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { return run(storage); } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
}
const installedDoc = sentence => ({ id: 'doc', title: '문헌', sub: '', source: { catalogId: 'doc', version: 1 }, levels: { sentence } });

test('first fragment and merged first block keep stable IDs without duplicating middle-range IDs', () => {
  const originals = [card('s1', '甲乙丙'), card('s2', '丁戊己')];
  const split = designateRange(originals, { id: 's1', offset: 1 }, { id: 's2', offset: 2 });
  assert.equal(split[0].id, 's1');
  assert.equal(new Set(split.map(c => c.id)).size, split.length);
  assert.equal(split[1].text, '乙丙丁戊');
  assert.equal(mergeBlocks(originals, ['s1', 's2'])[0].id, 's1');
});

test('atomic layout save preserves split text and user order through catalog update and undo', () => withStorage(() => {
  const originals = [card('s1', '甲乙', '갑을', { meaning: '원래 필기' }), card('s2', '丙丁', '병정')];
  localStorage.setItem(USER_DOCS_KEY, JSON.stringify([installedDoc(originals)]));
  const split = designateRange(originals, { id: 's1', offset: 0 }, { id: 's1', offset: 1 });
  const reordered = moveBlock(split, 's2', 0);
  replaceSentenceCards('doc', reordered, JSON.stringify(originals));
  const theirs = installedDoc([card('s1', '甲乙 수정'), card('s2', '丙丁 수정'), card('s3', '戊己')]);
  installCatalogDoc(theirs, { catalogId: 'doc', version: 2 });
  const loaded = loadUserDocs()[0];
  assert.equal(loaded.sentenceLayoutEdited, true);
  assert.deepEqual(loaded.levels.sentence.map(c => c.id), [...reordered.map(c => c.id), 's3']);
  assert.equal(loaded.levels.sentence.find(c => c.id === 's1').text, '甲');
  assert.equal(loaded.levels.sentence.find(c => c.id === 's1').meaning, '원래 필기');
  assert.equal(loaded.levels.sentence[0].text, '丙丁 수정');

  const merged = mergeBlocks(loaded.levels.sentence, loaded.levels.sentence.slice(0, 2).map(c => c.id));
  replaceSentenceCards('doc', merged, JSON.stringify(loaded.levels.sentence));
  const afterMerge = loadUserDocs()[0];
  assert.ok(afterMerge.source.removed.includes('s1'));
  const nextUpdate = mergeCatalogUpdate(afterMerge, theirs).doc;
  assert.ok(!nextUpdate.levels.sentence.some(c => c.id === 's1'));
  replaceSentenceCards('doc', loaded.levels.sentence, JSON.stringify(afterMerge.levels.sentence));
  assert.ok(!loadUserDocs()[0].source.removed.includes('s1'));
}));

test('layout save refuses stale input, duplicate IDs, unreadable data and quota failure without replacing persisted data', () => withStorage(storage => {
  const originals = [card('s1', '甲乙')];
  const raw = JSON.stringify([installedDoc(originals)]);
  localStorage.setItem(USER_DOCS_KEY, raw);
  const next = designateRange(originals, { id: 's1', offset: 0 }, { id: 's1', offset: 1 });
  assert.throws(() => replaceSentenceCards('doc', next, '[]'), /변경/);
  assert.equal(localStorage.getItem(USER_DOCS_KEY), raw);
  assert.throws(() => replaceSentenceCards('doc', [originals[0], originals[0]], JSON.stringify(originals)), /중복/);
  assert.equal(localStorage.getItem(USER_DOCS_KEY), raw);
  const write = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => replaceSentenceCards('doc', next, JSON.stringify(originals)), /quota/);
  assert.equal(localStorage.getItem(USER_DOCS_KEY), raw);
  storage.setItem = write;
  localStorage.setItem(USER_DOCS_KEY, '{broken');
  assert.throws(() => replaceSentenceCards('doc', next, JSON.stringify(originals)));
  assert.equal(localStorage.getItem(USER_DOCS_KEY), '{broken');
}));

test('raw source shortening archives ranges, keeps meaning and leaves valid recoverable metadata', () => withStorage(() => {
  const original = setHyeonto(card('s1', '甲乙', '갑을', { grammar: [{ type: 'V', start: 1, end: 2 }], interp: [{ start: 1, end: 2 }] }), { original: '甲乙', marks: [{ offset: 1, text: '은' }] });
  localStorage.setItem(USER_DOCS_KEY, JSON.stringify([installedDoc([original])]));
  userEditCard('doc', 'sentence', 's1', { text: '甲', reading: '갑', meaning: '현재 해석', note: '필기' });
  const saved = loadUserDocs()[0].levels.sentence[0];
  assert.equal(saved.grammar, undefined);
  assert.equal(saved.interp, undefined);
  assert.equal(getHyeonto(saved), null);
  assert.equal(saved.meaning, '현재 해석');
  assert.ok(saved.blockReferences.some(ref => ref.text === original.text && ref.grammar.length && ref.interp.length));
  replaceSentenceCards('doc', [saved], JSON.stringify([saved])); // shared backup validation accepts the archived state
}));


test('legacy and confirmed hyeonto share display segments while explicit original text stays original', () => {
  const legacy = card('h', '설명 學而時習之면 不亦說乎아', '');
  const snapshot = JSON.stringify(legacy);
  const confirmed = setHyeonto(legacy, suggestHyeonto(legacy));
  assert.deepEqual(hyeontoSegments(legacy), hyeontoSegments(confirmed));
  assert.equal(JSON.stringify(legacy), snapshot);
  assert.equal(getHyeonto(legacy), null);
  const kept = setHyeonto(legacy, {
    original: '설명 學而時習之면 不亦說乎', marks: [{ offset: [...'설명 學而時習之면 不亦說乎'].length, text: '아' }],
  });
  assert.deepEqual(hyeontoSegments(kept).filter(part => part.kind === 'hyeonto').map(part => part.text), ['아']);
  assert.ok(hyeontoSegments(kept).some(part => part.kind === 'original' && part.text.includes('면')));
});


test('legacy candidate split snaps the whole mark to preceding Han without confirming it', () => {
  const source = card('legacy', '甲하고乙이라');
  for (const offset of [1, 2, 3]) {
    const pieces = designateRange([source], { id: source.id, offset: 0 }, { id: source.id, offset });
    assert.deepEqual(pieces.map(piece => piece.text), ['甲하고', '乙이라']);
    assert.ok(pieces.every(piece => piece.hyeonto === undefined));
    assert.deepEqual(pieces.map(piece => hyeontoSegments(piece).filter(segment => segment.kind === 'hyeonto').map(segment => segment.text)), [['하고'], ['이라']]);
  }
});

test('mixed candidate metadata survives split and JSON; explicit confirmation clears markers and keeps original exclusions', () => {
  const kept = setHyeonto(card('kept', '甲면乙아'), { original: '甲면乙', marks: [{ offset: 3, text: '아' }] });
  const legacy = card('legacy', '丙하고丁');
  const merged = mergeBlocks([kept, legacy], ['kept', 'legacy'])[0];
  assert.deepEqual(getHyeonto(merged), { original: '甲면乙丙丁', marks: [{ offset: 3, text: '아' }, { offset: 4, text: '하고', unconfirmed: true }] });
  const loaded = JSON.parse(JSON.stringify(merged));
  assert.deepEqual(getHyeonto(loaded), getHyeonto(merged));
  const split = designateRange([loaded], { id: loaded.id, offset: 0 }, { id: loaded.id, offset: 5 });
  assert.deepEqual(split.map(piece => piece.text), ['甲면乙아丙하고', '丁']);
  assert.equal(getHyeonto(split[0]).marks[1].unconfirmed, true);
  assert.ok(hyeontoSegments(split[0]).some(segment => segment.kind === 'original' && segment.text.includes('면')));
  const confirmed = setHyeonto(loaded, getHyeonto(loaded));
  assert.ok(getHyeonto(confirmed).marks.every(mark => mark.unconfirmed === undefined));
  assert.equal(confirmed.text, loaded.text);
});
