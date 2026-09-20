import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateBackup } from '../src/storage/backup-validation.ts';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/backup/${name}.json`, import.meta.url), 'utf8'));
for (const name of ['v3', 'v2', 'legacy-userdata']) {
  test(`validates ${name} without mutating input`, () => {
    const backup = fixture(name);
    const before = structuredClone(backup);
    assert.doesNotThrow(() => validateBackup(backup));
    assert.deepEqual(backup, before);
  });
}
test('accepts every shipped catalog document and per-document card ID scope', () => {
  const root = new URL('../catalog/', import.meta.url);
  const docs = readdirSync(root).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(new URL(f, root)))).filter(d => d.levels);
  validateBackup({ version: 3, content: { docs } });
});
test('older v3 allows absent progress, preferences, collections and metadata', () => {
  validateBackup({ version: 3, content: { docs: [{ id: 'old', title: '구 문헌', sub: '', levels: {} }] } });
  validateBackup({ version: 3, content: { docs: [] }, progress: { session: null }, preference: {} });
});
test('historical v2 Card arrays, timestamps, deltas without IDs and embedded v3 keys remain valid', () => {
  const v3 = fixture('v3');
  const delta = fixture('legacy-userdata');
  delete delta.edits[0].id;
  delete delta.deletions[0].id;
  validateBackup({ version: 2, keys: {
    'hanja-v2/userdata': JSON.stringify(delta),
    'hanja-v2/sample/char': JSON.stringify([{ front: '甲', fail_count: 3 }, { front: '乙' }]),
    'hanja-v2/sample/char_ts': '1788000000000',
    'hanja-v2/onboarding-seen': '1',
    'mundok-v3/docs': JSON.stringify(v3.content.docs),
    'mundok-v3/session': JSON.stringify(v3.progress.session),
    'mundok-v3/prefs': '{}',
    'mundok-v3/log/sample': JSON.stringify(v3.progress.logs.sample),
    'mundok-v3/collections': JSON.stringify(v3.content.collections),
  } });
});
test('collections retain repairable cycles, duplicate placement and absent parent references', () => {
  validateBackup({ version: 3, content: { docs: [], collections: [
    { id: 'a', name: 'A', docIds: ['doc'], parentId: 'b' },
    { id: 'b', name: 'B', docIds: ['doc'], parentId: 'a' },
    { id: 'c', name: 'C', docIds: [], parentId: 'absent' },
  ] } });
});

const malformed = [
  ['card list', b => { b.content.docs[0].levels.char = {}; }],
  ['null card', b => { b.content.docs[0].levels.char = [null]; }],
  ['missing card text', b => { delete b.content.docs[0].levels.char[0].text; }],
  ['duplicate doc ID', b => { b.content.docs.push(structuredClone(b.content.docs[0])); }],
  ['duplicate cross-level card ID', b => { b.content.docs[0].levels.word = [structuredClone(b.content.docs[0].levels.char[0])]; }],
  ['unknown level', b => { b.content.docs[0].levels.unknown = []; }],
  ['grammar discriminant', b => { b.content.docs[0].levels.char[0].grammar = [{ type: 'bad', start: 0, end: 1 }]; }],
  ['interp range', b => { b.content.docs[0].levels.char[0].interp = [{ start: 2, end: 1 }]; }],
  ['interp fractional index', b => { b.content.docs[0].levels.char[0].interp = [{ start: 0.5, end: 1 }]; }],
  ['removed metadata', b => { b.content.docs[0].source.removed = [1]; }],
  ['null log', b => { b.progress.logs.sample = [null]; }],
  ['unknown event', b => { b.progress.logs.sample = [{ t: 'bad', lv: 'char', ts: 1 }]; }],
  ['anki grade', b => { b.progress.logs.sample = [{ t: 'anki', card: 'c1', lv: 'char', ts: 1, grade: 0 }]; }],
  ['seq missing card', b => { b.progress.logs.sample = [{ t: 'seq', lv: 'char', ts: 1 }]; }],
  ['legacy fails', b => { b.progress.logs.sample = [{ t: 'legacy', card: '', lv: 'char', ts: 1, fails: -1 }]; }],
  ['reset level', b => { b.progress.logs.sample = [{ t: 'reset', lv: 'bad', ts: 1 }]; }],
  ['session last', b => { b.progress.session.last = {}; }],
  ['streak count', b => { b.progress.session.streak.count = '1'; }],
  ['preferences list', b => { b.preference.shelvesCollapsed = [null]; }],
  ['preferences flag', b => { b.preference.onboardingSeen = 1; }],
  ['collections member', b => { b.content.collections = [null]; }],
  ['collection docs', b => { b.content.collections[0].docIds = [1]; }],
  ['explicit null progress', b => { b.progress = null; }],
  ['explicit null preferences', b => { b.preference = null; }],
];
for (const [name, mutate] of malformed) {
  test(`rejects damaged v3 ${name}`, () => {
    const backup = fixture('v3'); mutate(backup);
    assert.throws(() => validateBackup(backup), /백업/);
  });
}
for (const [key, value] of [
  ['foreign/key', '{}'], ['hanja-v2/user-docs', '{'], ['mundok-v3/docs', '{}'],
  ['hanja-v2/sample/char/fails', '{"c1":"3"}'], ['hanja-v2/sample/char', '[null]'],
  ['hanja-v2/sample/char_ts', '"oops"'], ['hanja-v2/onboarding-seen', 'true'],
  ['hanja-v2/streak', '{"count":3}'], ['mundok-v3/log/sample', '[{"t":"bad"}]'],
  ['mundok-v3/collections', '[null]'], ['hanja-v2/userdata', '{"additions":[null],"edits":[],"deletions":[]}'],
]) {
  test(`rejects damaged v2 key ${key}`, () => {
    assert.throws(() => validateBackup({ version: 2, keys: { [key]: value } }), /백업/);
  });
}
test('unsupported explicit version cannot fall through to legacy userdata', () => {
  for (const version of [1, 4, '3', null]) assert.throws(() => validateBackup({ ...fixture('legacy-userdata'), version }), /버전/);
});

const invalidRanges = [
  ['unsafe huge end', { start: 0, end: 1e20 }],
  ['safe huge end', { start: 0, end: Number.MAX_SAFE_INTEGER }],
  ['fractional end', { start: 0, end: 1.5 }],
  ['negative start', { start: -1, end: 1 }],
  ['outside text', { start: 0, end: 3 }],
];
for (const kind of ['grammar', 'interp']) {
  for (const [name, range] of invalidRanges) {
    test(`rejects ${kind} ${name} in current and historical backups`, () => {
      const value = kind === 'grammar' ? { ...range, type: 'S' } : range;
      const current = fixture('v3');
      const card = current.content.docs[0].levels.char[0];
      card.text = '𠀀甲'; // Two code points, three UTF-16 code units.
      card[kind] = [value];
      assert.throws(() => validateBackup(current), /백업/);
      const legacy = { additions: [], edits: [], deletions: [], [kind]: [{
        docId: 'sample', cardFront: '𠀀甲', [kind === 'grammar' ? 'annotations' : 'chunks']: [value],
      }] };
      assert.throws(() => validateBackup(legacy), /백업/);
      assert.throws(() => validateBackup({ version: 2, keys: { 'hanja-v2/userdata': JSON.stringify(legacy) } }), /백업/);
      if (kind === 'interp') assert.throws(() => validateBackup({ version: 2, keys: {
        'hanja-v2/sample/char': JSON.stringify([{ front: '𠀀甲', interp: [value] }]),
      } }), /백업/);
    });
  }
}
test('astral Unicode ranges use code points and valid current/legacy annotations survive', () => {
  const backup = fixture('v3');
  const card = backup.content.docs[0].levels.char[0];
  card.text = '𠀀甲';
  card.grammar = [{ type: 'S', start: 0, end: 2 }];
  card.interp = [{ start: 1, end: 2 }, { start: 0, end: 1 }];
  validateBackup(backup);
  validateBackup({ additions: [], edits: [], deletions: [],
    grammar: [{ docId: 'sample', cardFront: card.text, annotations: card.grammar }],
    interp: [{ docId: 'sample', cardFront: card.text, chunks: card.interp }],
  });
  validateBackup({ version: 2, keys: {
    'hanja-v2/sample/char': JSON.stringify([{ front: card.text, interp: card.interp }]),
  } });
});
test('unsafe integer progress counts are rejected', () => {
  const backup = fixture('v3');
  backup.progress.session.streak.count = 1e20;
  assert.throws(() => validateBackup(backup), /백업/);
});
