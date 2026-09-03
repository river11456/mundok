import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeAddition } from '../src/card-runtime.ts';
import type { Card, Doc, LevelKey } from '../src/types.ts';

function card(id: string, front: string): Card {
  return { id, front, reading: '', back: '', note: '', fail_count: 0 };
}

function doc(levels: Array<[LevelKey, Card[]]>): Doc {
  return {
    id: 'd', title: '文', sub: '문',
    levels: levels.map(([key, cards]) => ({ key, label: key, cards })),
  };
}

test('첫 단어 카드 — 저장 후 새 word 레벨과 카드를 런타임에서 찾는다', () => {
  const before = doc([['sentence', [card('s1', '天地玄黃')]]]);
  const after = doc([
    ['word', [card('w1', '天地')]],
    ['sentence', [card('s1', '天地玄黃')]],
  ]);

  const result = resolveRuntimeAddition(before, after, 'word', 'w1');
  assert.equal(result.targetLevel?.key, 'word');
  assert.equal(result.storedCard?.front, '天地');
  assert.equal(result.isNew, true);
});

test('중복 카드 — 이미 로드된 id는 세션에 다시 넣지 않는다', () => {
  const before = doc([['word', [card('w1', '天地')]]]);
  const after = doc([['word', [card('w1', '天地')]]]);
  assert.equal(resolveRuntimeAddition(before, after, 'word', 'w1').isNew, false);
});
