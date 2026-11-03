import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeDoc, orderedIds, normalizeOrder } from '../src/library-order.ts';
const shelves = [{ id: 'f', name: 'Folder', docIds: ['a', 'b'] }];
test('root order preserves existing order and appends new IDs, ignoring stale IDs', () => {
  assert.deepEqual(orderedIds(['a','b','c'], ['b','gone','a','b']), ['b','a','c']);
  assert.deepEqual(normalizeOrder(['a', 3, 'a']), ['a']);
});
test('move to folder and root keeps one location', () => {
  const next = arrangeDoc(shelves, ['c'], 'c', 'f');
  assert.deepEqual(next.shelves[0].docIds, ['a','b','c']);
  assert.deepEqual(next.root, []);
  const back = arrangeDoc(next.shelves, [], 'a', null);
  assert.deepEqual(back.root, ['a']);
  assert.deepEqual(back.shelves[0].docIds, ['b','c']);
});
test('reorder before and to end preserves hidden folder entries', () => {
  assert.deepEqual(arrangeDoc(shelves, [], 'b', 'f', 'a').shelves[0].docIds, ['b','a']);
  assert.deepEqual(arrangeDoc(shelves, [], 'a', 'f', null).shelves[0].docIds, ['b','a']);
});
test('same location move and invalid destinations do not mutate', () => {
  for (const [dest, before] of [['f', undefined], ['missing', undefined], ['f','missing'], ['f','a']] as const) {
    assert.equal(arrangeDoc(shelves, ['c'], 'a', dest, before).shelves, shelves);
  }
});

test('position and order writes roll back together when second write fails', async () => {
  const { withStorageRecovery } = await import('../src/storage/recovery.ts');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map([['mundok-v3/collections', JSON.stringify(shelves)], ['mundok-v3/library-order', '["c"]']]);
  const before = new Map(entries);
  let fail = true;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return entries.size; }, key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (k: string) => entries.get(k) ?? null,
    removeItem: (k: string) => entries.delete(k),
    setItem(k: string, v: string) { if (k === 'mundok-v3/library-order' && fail) { fail = false; throw new Error('disk full'); } entries.set(k, v); },
  } });
  try {
    const next = arrangeDoc(shelves, ['c'], 'c', 'f');
    assert.throws(() => withStorageRecovery(() => {
      localStorage.setItem('mundok-v3/collections', JSON.stringify(next.shelves));
      localStorage.setItem('mundok-v3/library-order', JSON.stringify(next.root));
    }), /disk full/);
    assert.deepEqual(entries, before);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('custom root order appends created/catalog documents and forgets deleted IDs', async () => {
  const { createUserDoc, installCatalogDoc, deleteUserDoc } = await import('../src/user-docs.ts');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map([['mundok-v3/library-order', '[]']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return entries.size; }, key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (k: string) => entries.get(k) ?? null, removeItem: (k: string) => entries.delete(k),
    setItem: (k: string, v: string) => entries.set(k, v),
  } });
  try {
    const a = createUserDoc({ title: 'first', sub: '' }, 'sentence', []);
    installCatalogDoc({ id: 'catalog', title: 'second', sub: '', order: -100, levels: {} }, { catalogId: 'catalog', version: 1 });
    assert.deepEqual(JSON.parse(entries.get('mundok-v3/library-order')!), [a.id, 'catalog']);
    deleteUserDoc(a.id);
    assert.deepEqual(JSON.parse(entries.get('mundok-v3/library-order')!), ['catalog']);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('pending recovery blocks document mutations and preserves original journal', async () => {
  const { createUserDoc } = await import('../src/user-docs.ts');
  const { assertLibraryWritable } = await import('../src/library-order.ts');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map([['mundok-backup/restore-journal', '{"version":1,"before":{}}'], ['mundok-v3/docs', '[]']]);
  const before = new Map(entries);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => entries.set(k, v),
  } });
  try {
    assert.throws(() => assertLibraryWritable(), /새로고침/);
    assert.throws(() => createUserDoc({ title: 'blocked', sub: '' }, 'sentence', []), /새로고침/);
    assert.deepEqual(entries, before);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
