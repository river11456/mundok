import type { Doc, LevelKey, UserData, GrammarEntry, InterpEntry } from './types';

export const LEVEL_ORDER: readonly LevelKey[] = ['char', 'word', 'sentence', 'paragraph'];
export const LEVEL_LABEL: Record<LevelKey, string> = {
  char:      '개별 글자',
  word:      '단어 단위',
  sentence:  '문장 단위',
  paragraph: '단락 단위',
};

/**
 * 사용자 로컬 편집 델타(정적 모드)를 docs 배열에 in-place 적용한다.
 * (텍스트 기반 매칭 — Phase 4에서 카드 id 기반으로 전환 예정)
 */
export function applyUserData(docs: Doc[], ud: UserData): void {
  for (const del of ud.deletions ?? []) {
    const doc = docs.find(d => d.id === del.docId);
    if (!doc) continue;
    for (const lvl of doc.levels) {
      if (lvl.key === del.type) lvl.cards = lvl.cards.filter(c => c.front !== del.text);
    }
  }

  for (const edit of ud.edits ?? []) {
    const doc = docs.find(d => d.id === edit.docId);
    if (!doc) continue;
    for (const lvl of doc.levels) {
      if (lvl.key !== edit.type) continue;
      const card = lvl.cards.find(c => c.front === edit.origText);
      if (card) Object.assign(card, { front: edit.text, reading: edit.reading, back: edit.meaning, note: edit.note });
    }
  }

  for (const add of ud.additions ?? []) {
    const doc = docs.find(d => d.id === add.docId);
    if (!doc) continue;
    if (!LEVEL_ORDER.includes(add.type)) continue;
    let lvl = doc.levels.find(l => l.key === add.type);
    if (!lvl) {
      lvl = { key: add.type, label: LEVEL_LABEL[add.type], cards: [] };
      const idx = LEVEL_ORDER.indexOf(add.type);
      const at  = doc.levels.findIndex(l => LEVEL_ORDER.indexOf(l.key) > idx);
      if (at === -1) doc.levels.push(lvl); else doc.levels.splice(at, 0, lvl);
    }
    if (!lvl.cards.some(c => c.front === add.text)) {
      lvl.cards.push({ id: `${add.docId}_${add.type}_${add.text}`, front: add.text, reading: add.reading, back: add.meaning, note: add.note, fail_count: 0 });
    }
  }
}

/** 베이킹 문법 위에 사용자 델타 문법을 (docId, cardFront) 키로 덮어쓴다. */
export function mergeGrammar(base: GrammarEntry[], delta: GrammarEntry[]): GrammarEntry[] {
  const merged = [...base];
  for (const g of delta) {
    const i = merged.findIndex(e => e.docId === g.docId && e.cardFront === g.cardFront);
    if (i >= 0) merged[i] = g; else merged.push(g);
  }
  return merged;
}

/**
 * 해석 순서 델타(정적 모드) — 베이킹 카드에 사용자 interp 를 덮어쓴다.
 * grammar 델타와 같은 (docId, cardFront) 키. 텍스트가 수정된 카드는 매칭 실패(고아) — 알려진 한계.
 */
export function applyInterpDelta(docs: Doc[], entries: InterpEntry[]): void {
  for (const e of entries) {
    const card = docs.find(d => d.id === e.docId)
      ?.levels.find(l => l.key === 'sentence')
      ?.cards.find(c => c.front === e.cardFront);
    if (!card) continue;
    if (e.chunks.length) card.interp = e.chunks;
    else delete card.interp;
  }
}
