import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertionAt } from '../src/library-drag-geometry.ts';
const books = [
  { id: 'a', left: 0, right: 100, top: 0, bottom: 100 },
  { id: 'b', left: 120, right: 220, top: 0, bottom: 100 },
  { id: 'c', left: 0, right: 100, top: 120, bottom: 220 },
];
test('first, between, row end and final insertion', () => {
  assert.equal(insertionAt(books, 0, 40)?.beforeId, 'a');
  assert.equal(insertionAt(books, 110, 40)?.beforeId, 'b');
  assert.equal(insertionAt(books, 230, 40)?.beforeId, 'c');
  assert.equal(insertionAt(books, 10, 160)?.beforeId, 'c');
  assert.equal(insertionAt(books, 230, 160)?.beforeId, null);
});
test('empty grid has no insertion and row gaps select nearest row', () => {
  assert.equal(insertionAt([], 0, 0), null);
  assert.equal(insertionAt(books, 0, 115)?.beforeId, 'c');
});
