import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// Test-only resolution for the browser modules' extensionless TypeScript imports.
// No source rewriting or substitute implementation: exercise the production functions.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { importUserData, exportUserData, initStore } = await import('../src/storage/index.ts');
const { migrateV1IfNeeded, migrateProgressIfNeeded, purgeV1IfMigrated } = await import('../src/migrate-v1.ts');
const { seedCollectionsIfNeeded } = await import('../src/collections.ts');
const { loadUserDocs } = await import('../src/user-docs.ts');
const { deriveFails } = await import('../src/review-log.ts');
hooks.deregister();

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/backup/${name}.json`, import.meta.url), 'utf8'));
const file = value => new File([JSON.stringify(value)], 'backup.json', { type: 'application/json' });
const catalogShelves = [{ id: 'g1', name: '기본 폴더', docIds: ['sample', 'absent'] }];
let storage;
let originalStorage;

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map();
  storage = {
    get length() { return entries.size; },
    key: i => [...entries.keys()][i] ?? null,
    getItem: k => entries.get(k) ?? null,
    setItem: (k, v) => { entries.set(k, String(v)); },
    removeItem: k => { entries.delete(k); },
    clear: () => entries.clear(),
    snapshot: () => Object.fromEntries(entries),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

// Same storage migration order as initDocs; catalog/DOM rendering is outside this test.
function startAppStorage() {
  purgeV1IfMigrated();
  migrateV1IfNeeded(fixture('catalog'));
  migrateProgressIfNeeded(loadUserDocs());
  seedCollectionsIfNeeded(catalogShelves, loadUserDocs().map(d => d.id));
}

async function exported(t) {
  let blob;
  let clicks = 0;
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const anchor = { click() { clicks++; } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement(tag) {
    assert.equal(tag, 'a');
    return anchor;
  } } });
  const create = t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:test-backup'; });
  const revoke = t.mock.method(URL, 'revokeObjectURL', url => assert.equal(url, 'blob:test-backup'));
  try {
    exportUserData();
    assert.equal(clicks, 1);
    assert.equal(anchor.href, 'blob:test-backup');
    assert.match(anchor.download, /^문독-백업-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(blob.type, 'application/json');
    assert.equal(revoke.mock.callCount(), 1);
    const result = JSON.parse(await blob.text());
    assert.ok(Number.isFinite(Date.parse(result.exportedAt)));
    return result;
  } finally {
    create.mock.restore();
    revoke.mock.restore();
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
  }
}

function withoutExportTime(backup) {
  const { exportedAt, ...data } = backup;
  return data;
}

test('new user starts empty and repeated storage initialization preserves saved state', async () => {
  startAppStorage();
  const store = await initStore();
  assert.deepEqual(loadUserDocs(), []);
  assert.deepEqual(store.loadSession(), { last: null, streak: { lastDate: '', count: 0, todayCards: 0 } });
  assert.deepEqual(store.loadPrefs(), { shelvesCollapsed: [], onboardingSeen: false });
  const before = storage.snapshot();
  startAppStorage();
  assert.deepEqual(storage.snapshot(), before);
});

async function assertRoundtrip(t, expected) {
  const backup = await exported(t);
  assert.deepEqual(withoutExportTime(backup), withoutExportTime(expected));
  storage.clear();
  await importUserData(file(backup));
  startAppStorage();
  assert.deepEqual(withoutExportTime(await exported(t)), withoutExportTime(backup));
}

test('v3 restores IDs, user edits, deleted-card markers, grammar/interp, nested folders, logs, session and prefs across restart/export/reimport', async t => {
  const expected = fixture('v3');
  storage.setItem('unrelated/key', 'keep');
  storage.setItem('mundok-v3/log/stale', '[]');
  storage.setItem('hanja-v2/streak', '{"count":999}');
  await importUserData(file(expected));
  startAppStorage();
  const store = await initStore();
  assert.deepEqual(loadUserDocs(), expected.content.docs);
  assert.deepEqual(store.loadCollections(), expected.content.collections);
  assert.deepEqual(store.loadLog('sample'), expected.progress.logs.sample);
  assert.deepEqual(store.loadSession(), expected.progress.session);
  assert.deepEqual(store.loadPrefs(), expected.preference);
  assert.equal(storage.getItem('mundok-v3/log/stale'), null);
  assert.equal(storage.getItem('hanja-v2/streak'), null);
  assert.equal(storage.getItem('unrelated/key'), 'keep');
  await assertRoundtrip(t, expected);
});

test('older v3 without collections reseeds only present catalog docs; explicit empty collections stay empty', async () => {
  const backup = fixture('v3');
  delete backup.content.collections;
  storage.setItem('mundok-v3/collections', '[{"id":"stale"}]');
  await importUserData(file(backup));
  assert.equal(storage.getItem('mundok-v3/collections'), null);
  startAppStorage();
  assert.deepEqual((await initStore()).loadCollections(), [{ id: 'g1', name: '기본 폴더', docIds: ['sample'] }]);
  backup.content.collections = [];
  await importUserData(file(backup));
  startAppStorage();
  assert.deepEqual((await initStore()).loadCollections(), []);
});

test('v2 key dump migrates edits and stable IDs with fails/session/prefs, keeps one-load rollback keys, purges on restart and roundtrips v3', async t => {
  storage.setItem('mundok-v3/docs', '[]');
  storage.setItem('mundok-v3/log/stale', '[]');
  await importUserData(file(fixture('v2')));
  assert.equal(storage.getItem('mundok-v3/docs'), null);
  startAppStorage();
  assert.notEqual(storage.getItem('hanja-v2/userdata'), null);
  const docs = loadUserDocs();
  assert.deepEqual(docs.map(d => d.id), ['sample', 'u1']);
  assert.deepEqual(docs[0].levels.char.map(c => c.id), ['c1', 'sample_char_丙']);
  assert.equal(docs[0].levels.char[0].meaning, '사용자 수정');
  assert.ok(docs[0].levels.char[0].editedAt > 0);
  assert.deepEqual(docs[0].source.removed, ['c2']);
  assert.deepEqual(docs[0].levels.sentence[0].grammar, fixture('legacy-userdata').grammar[0].annotations);
  assert.deepEqual(docs[0].levels.sentence[0].interp, fixture('legacy-userdata').interp[0].chunks);
  const store = await initStore();
  assert.deepEqual(deriveFails(store.loadLog('sample'), 'char'), { c1: 2, 'sample_char_丙': 3 });
  assert.equal(store.loadLog('sample')[0].ts, 1788000000000);
  assert.deepEqual(store.loadSession(), fixture('v3').progress.session);
  assert.deepEqual(store.loadPrefs(), fixture('v3').preference);
  const beforeRestart = await exported(t);
  startAppStorage();
  assert.ok(Object.keys(storage.snapshot()).every(k => !k.startsWith('hanja-v2/')));
  await assertRoundtrip(t, beforeRestart);
});

test('single legacy userdata backup migrates content then exports/restores v3', async t => {
  await importUserData(file(fixture('legacy-userdata')));
  startAppStorage();
  assert.deepEqual(loadUserDocs()[0].levels.char.map(c => c.id), ['c1', 'sample_char_丙']);
  assert.equal(loadUserDocs()[0].levels.char[0].text, '甲甲');
  assert.equal((await initStore()).loadSession().last, null);
  await assertRoundtrip(t, await exported(t));
});

const invalidBackups = [
  ['invalid JSON', '{'],
  ['missing docs', { version: 3, content: {} }],
  ['invalid document', { version: 3, content: { docs: [null] } }],
  ['invalid logs', { version: 3, content: { docs: [] }, progress: { logs: { sample: {} } } }],
  ['invalid collections', { version: 3, content: { docs: [], collections: {} } }],
  ['foreign v2 key', { version: 2, keys: { 'unrelated/key': 'bad' } }],
  ['non-string v2 value', { version: 2, keys: { 'hanja-v2/userdata': {} } }],
  ['invalid nested v2 JSON', { version: 2, keys: { 'hanja-v2/userdata': '{' } }],
  ['invalid legacy arrays', { additions: {}, edits: [], deletions: [] }],
  ['invalid legacy grammar', { additions: [], edits: [], deletions: [], grammar: [{ docId: 'sample', cardFront: '甲', annotations: [null] }] }],
];
for (const [name, data] of invalidBackups) {
  test(`rejected backup preserves all existing storage: ${name}`, async () => {
    await importUserData(file(fixture('v3')));
    storage.setItem('hanja-v2/old', 'old');
    storage.setItem('unrelated/key', 'keep');
    const before = storage.snapshot();
    await assert.rejects(importUserData(typeof data === 'string' ? new File([data], 'bad.json') : file(data)));
    assert.deepEqual(storage.snapshot(), before);
  });
}

// Characterization only: these passing tests document unsafe existing behavior,
// not a guarantee of safety. Replace with preservation/rejection tests when fixed.
// Tracked separately in #16 (write failure), #17 (validation), #18 (legacy residue).
test('KNOWN DEFECT: quota failure after clearing v3 keys loses original data and leaves partial restore', async () => {
  await importUserData(file(fixture('v3')));
  const before = storage.snapshot();
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'mundok-v3/collections') throw new DOMException('Injected quota failure', 'QuotaExceededError');
    write(key, value);
  };
  await assert.rejects(importUserData(file(fixture('v3'))), { name: 'QuotaExceededError' });
  assert.notDeepEqual(storage.snapshot(), before);
  assert.notEqual(storage.getItem('mundok-v3/docs'), null);
  assert.equal(storage.getItem('mundok-v3/log/sample'), null);
  assert.equal(storage.getItem('mundok-v3/session'), null);
});

test('recovery drill: an external pre-failure export restores data after storage becomes writable again', async t => {
  await importUserData(file(fixture('v3')));
  const safetyBackup = await exported(t);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'mundok-v3/collections') throw new DOMException('Injected quota failure', 'QuotaExceededError');
    write(key, value);
  };
  try {
    await assert.rejects(importUserData(file(fixture('v3'))), { name: 'QuotaExceededError' });
  } finally {
    storage.setItem = write;
  }
  await importUserData(file(safetyBackup));
  startAppStorage();
  await assertRoundtrip(t, safetyBackup);
});

test('KNOWN DEFECT: malformed card arrays and log events pass v3 validation and replace valid data', async () => {
  await importUserData(file(fixture('v3')));
  const malformed = { version: 3, content: { docs: [{ id: 'broken', levels: { char: 'not-an-array' } }] }, progress: { logs: { broken: [null] } } };
  await importUserData(file(malformed));
  assert.deepEqual(loadUserDocs(), malformed.content.docs);
  assert.throws(() => loadUserDocs()[0].levels.char.map(c => c.id), TypeError);
  assert.throws(() => deriveFails((JSON.parse(storage.getItem('mundok-v3/log/broken'))), 'char'), TypeError);
});

for (const format of ['legacy-userdata', 'v2']) {
  test(`KNOWN DEFECT: ${format} restore retains old v1 keys absent from backup`, async () => {
    storage.setItem('hanja-v2/user-docs', JSON.stringify([{ id: 'stale-user', title: '백업에 없는 문헌', sub: '', levels: {} }]));
    storage.setItem('hanja-v2/streak', JSON.stringify({ lastDate: '2020-01-01', count: 999, todayCards: 99 }));
    const backup = fixture(format);
    if (format === 'v2') {
      delete backup.keys['hanja-v2/user-docs'];
      delete backup.keys['hanja-v2/streak'];
    }
    await importUserData(file(backup));
    startAppStorage();
    assert.ok(loadUserDocs().some(d => d.id === 'stale-user'));
    assert.equal((await initStore()).loadSession().streak.count, 999);
  });
}
