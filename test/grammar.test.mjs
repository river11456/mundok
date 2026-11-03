import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { designateRange } from '../src/sentence-blocks.ts';
import { USER_DOCS_KEY, loadUserDocs } from '../src/user-docs.ts';

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { initGrammar, getAnnotations, saveAnnotations } = await import('../src/grammar.ts');
const { initStore } = await import('../src/storage/index.ts');
hooks.deregister();

test('identical split sentence text keeps grammar isolated through edit, delete and failed save', async t => {
  const cards = designateRange([{ id: 's1', text: '甲甲', reading: '갑갑', meaning: '', note: '',
    grammar: [{ type: 'S', start: 0, end: 1 }, { type: 'V', start: 1, end: 2 }] }],
    { id: 's1', offset: 0 }, { id: 's1', offset: 1 });
  assert.deepEqual(cards.map(c => c.text), ['甲', '甲']);
  const values = new Map([[USER_DOCS_KEY, JSON.stringify([{ id: 'doc', title: '문헌', sub: '', levels: { sentence: cards } }])]]);
  let failWrite = false;
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (failWrite) throw new Error('quota'); values.set(key, value); },
  };
  t.after(() => { globalThis.localStorage = previous; initGrammar([]); });
  await initStore();
  initGrammar(cards.map(card => ({ docId: 'doc', cardId: card.id, cardFront: card.text, annotations: card.grammar })));
  assert.deepEqual(getAnnotations('doc', cards[0].id), [{ type: 'S', start: 0, end: 1 }]);
  assert.deepEqual(getAnnotations('doc', cards[1].id), [{ type: 'V', start: 0, end: 1 }]);
  assert.deepEqual(getAnnotations('another-doc', cards[0].id), []);
  const edited = [{ type: 'O', start: 0, end: 1 }];
  await saveAnnotations('doc', cards[1].id, '甲', edited);
  assert.deepEqual(getAnnotations('doc', cards[0].id), cards[0].grammar);
  assert.deepEqual(getAnnotations('doc', cards[1].id), edited);
  assert.deepEqual(loadUserDocs()[0].levels.sentence[1].grammar, edited);
  failWrite = true;
  await assert.rejects(saveAnnotations('doc', cards[1].id, '甲', []), /quota/);
  assert.deepEqual(getAnnotations('doc', cards[1].id), edited);
  failWrite = false;
  await saveAnnotations('doc', cards[0].id, '甲', []);
  assert.deepEqual(getAnnotations('doc', cards[0].id), []);
  assert.deepEqual(getAnnotations('doc', cards[1].id), edited);
  assert.equal(loadUserDocs()[0].levels.sentence[0].grammar, undefined);
});
