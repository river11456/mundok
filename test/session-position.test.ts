import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionCardIndex } from '../src/session-position.ts';
import type { LastSession } from '../src/types.ts';

const last: LastSession = { docId: 'doc', lvKey: 'sentence', mode: 'seq', idx: 1, total: 2, ts: 1, cardId: 'B' };
test('resume follows card ID after sentence reorder, insertion and split before it', () => {
  for (const ids of [['A', 'B'], ['B', 'A'], ['X', 'A', 'B'], ['A1', 'A2', 'B']]) {
    const cards = ids.map(id => ({ id }));
    assert.equal(cards[sessionCardIndex(last, cards)].id, 'B');
  }
});
test('removed saved sentence routes to document instead of opening its old index', () => {
  assert.equal(sessionCardIndex(last, [{ id: 'A' }, { id: 'C' }]), -1);
  assert.equal(sessionCardIndex(last, []), -1);
});
test('legacy backups use clamped index and legacy Anki returns to document', () => {
  const { cardId, ...legacy } = last;
  assert.equal(sessionCardIndex(legacy, [{ id: 'A' }, { id: 'B' }]), 1);
  assert.equal(sessionCardIndex(legacy, [{ id: 'A' }]), 0);
  assert.equal(sessionCardIndex({ ...legacy, mode: 'anki' }, [{ id: 'A' }]), -1);
});
