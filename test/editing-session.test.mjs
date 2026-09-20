import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireEditingSession } from '../src/storage/editing-session.ts';

test('one page owns all writes until browser destruction; other pages fail closed', async t => {
  let locked = false;
  const handlers = new Map();
  const descriptors = new Map(['navigator', 'window', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const locks = { async request(name, options, callback) {
    assert.equal(name, 'mundok-storage-editor');
    assert.equal(options.ifAvailable, true);
    if (locked) return callback(null);
    locked = true;
    try { return await callback({ name }); }
    finally { locked = false; }
  } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener(name, fn) { handlers.set(name, fn); },
  } });
  let reloads = 0;
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { reload() { reloads++; } } });
  await acquireEditingSession();
  assert.equal(locked, true);
  await assert.rejects(acquireEditingSession(), /다른 문독 창/);
  assert.equal(locked, true);
  assert.equal(handlers.has('pagehide'), false);
  handlers.get('pageshow')({ persisted: true });
  assert.equal(reloads, 1);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async () => { throw new Error('denied'); } } } });
  await assert.rejects(acquireEditingSession(), /저장 잠금을 얻지 못했습니다/);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  await assert.rejects(acquireEditingSession(), /안전한 저장 잠금/);
});
