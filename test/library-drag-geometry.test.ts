import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflowAt } from '../src/library-drag-geometry.ts';
const slots = [
  { id: 'a', left: 0, right: 100, top: 0, bottom: 100 },
  { id: 'b', left: 120, right: 220, top: 0, bottom: 100 },
  { id: 'c', left: 0, right: 100, top: 120, bottom: 220 },
  { id: 'd', left: 120, right: 220, top: 120, bottom: 220 },
];
test('moving forward shifts every intervening book across the row boundary', () => {
  assert.deepEqual(reflowAt(slots, 'a', 50, 170), { order: ['b', 'c', 'a', 'd'], beforeId: 'd' });
  assert.deepEqual(reflowAt(slots, 'a', 220, 170), { order: ['b', 'c', 'd', 'a'], beforeId: null });
});
test('moving backward opens the first slot without duplicating the source', () => {
  assert.deepEqual(reflowAt(slots, 'd', 0, 50), { order: ['d', 'a', 'b', 'c'], beforeId: 'a' });
  assert.deepEqual(reflowAt(slots, 'c', 170, 50), { order: ['a', 'c', 'b', 'd'], beforeId: 'b' });
});
test('source slot restores original order; stationary pointer is stable and slots stay immutable', () => {
  const original = structuredClone(slots);
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(reflowAt(slots, 'b', 170, 50), { order: ['a', 'b', 'c', 'd'], beforeId: 'c' });
    assert.deepEqual(reflowAt(slots, 'b', 50, 170), { order: ['a', 'c', 'b', 'd'], beforeId: 'd' });
  }
  assert.deepEqual(slots, original);
});
test('nearest row and slot handle gaps, final row whitespace and page scroll', () => {
  assert.deepEqual(reflowAt(slots, 'a', 0, 115)?.order, ['b', 'c', 'a', 'd']);
  assert.equal(reflowAt(slots, 'a', 999, 170)?.beforeId, null);
  const scrolled = slots.map(slot => ({ ...slot, top: slot.top + 500, bottom: slot.bottom + 500 }));
  assert.deepEqual(reflowAt(scrolled, 'a', 50, 170 + 500), reflowAt(slots, 'a', 50, 170));
});
test('missing source, empty grid and single document', () => {
  assert.equal(reflowAt([], 'a', 0, 0), null);
  assert.equal(reflowAt(slots, 'missing', 0, 0), null);
  assert.deepEqual(reflowAt(slots.slice(0, 1), 'a', 999, 999), { order: ['a'], beforeId: null });
});
