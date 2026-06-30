import type { Doc, Level, LevelKey, UserData, GrammarEntry, DocJSON } from './types';
import { initGrammar } from './grammar';
import { initStore, store } from './storage';

// 빌드 타임에 번들로 베이킹되는 문헌별 JSON 콘텐츠 (서버 없이도 표시)
//   각 파일은 DocJSON: 안정적 카드 id + 카드 내장 grammar 를 갖는다.
const rawJsons = import.meta.glob('./data/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, DocJSON>;

const LEVEL_ORDER: readonly LevelKey[] = ['char', 'word', 'sentence', 'paragraph'];
const LEVEL_LABEL: Record<LevelKey, string> = {
  char:      '개별 글자',
  word:      '단어 단위',
  sentence:  '문장 단위',
  paragraph: '단락 단위',
};

export let DOCS: Doc[] = Object.entries(rawJsons)
  .sort(([a], [b]) => a.localeCompare(b))   // 파일명 정렬 → 홈 화면 순서 고정
  .map(([, dj]) => {
    const levels: Level[] = LEVEL_ORDER
      .filter(k => dj.levels[k]?.length)
      .map(k => ({
        key:   k,
        label: LEVEL_LABEL[k],
        cards: dj.levels[k]!.map(c => ({
          id:         c.id,
          front:      c.text,
          reading:    c.reading,
          back:       c.meaning,
          note:       c.note,
          fail_count: 0,
        })),
      }));
    return { id: dj.id, title: dj.title, sub: dj.sub, levels };
  });

export const DOC_GROUPS: { parentId: string; childIds: string[] }[] = [
  { parentId: '불치이병치미병', childIds: ['상고천진론', '편작육불치', '사기조신대론'] },
];

/**
 * 홈 화면에 최상위로 노출되는 문헌 목록(참고문헌 자식 제외), 표시 순서 유지.
 * 홈 렌더(renderHome)와 키보드 단축키(1~9)가 같은 출처를 쓰도록 한다.
 */
export function homeDocs(): Doc[] {
  const childIds = new Set(DOC_GROUPS.flatMap(g => g.childIds));
  return DOCS.filter(d => !childIds.has(d.id));
}

/** 카드 내장 문법 주석을 grammar.ts 가 쓰는 GrammarEntry[] 형태로 펼친다. */
function collectGrammar(): GrammarEntry[] {
  const out: GrammarEntry[] = [];
  for (const dj of Object.values(rawJsons)) {
    for (const k of LEVEL_ORDER) {
      for (const c of dj.levels[k] ?? []) {
        if (c.grammar?.length) out.push({ docId: dj.id, cardFront: c.text, annotations: c.grammar });
      }
    }
  }
  return out;
}

/**
 * 사용자 로컬 편집 델타(정적 모드)를 DOCS에 적용한다.
 * 관리자 콘텐츠는 이미 JSON에 베이킹되어 있으므로 여기서는 사용자 델타만 다룬다.
 * (텍스트 기반 매칭 — Phase 4에서 카드 id 기반으로 전환 예정)
 */
function applyUserData(ud: UserData): void {
  for (const del of ud.deletions ?? []) {
    const doc = DOCS.find(d => d.id === del.docId);
    if (!doc) continue;
    for (const lvl of doc.levels) {
      if (lvl.key === del.type) lvl.cards = lvl.cards.filter(c => c.front !== del.text);
    }
  }

  for (const edit of ud.edits ?? []) {
    const doc = DOCS.find(d => d.id === edit.docId);
    if (!doc) continue;
    for (const lvl of doc.levels) {
      if (lvl.key !== edit.type) continue;
      const card = lvl.cards.find(c => c.front === edit.origText);
      if (card) Object.assign(card, { front: edit.text, reading: edit.reading, back: edit.meaning, note: edit.note });
    }
  }

  for (const add of ud.additions ?? []) {
    const doc = DOCS.find(d => d.id === add.docId);
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
function mergeGrammar(base: GrammarEntry[], delta: GrammarEntry[]): GrammarEntry[] {
  const merged = [...base];
  for (const g of delta) {
    const i = merged.findIndex(e => e.docId === g.docId && e.cardFront === g.cardFront);
    if (i >= 0) merged[i] = g; else merged.push(g);
  }
  return merged;
}

export async function initDocs(): Promise<void> {
  await initStore();

  // 사용자 로컬 편집 델타(정적 모드). 서버 모드면 null.
  const delta = await store().loadDelta();
  if (delta) applyUserData(delta);

  initGrammar(mergeGrammar(collectGrammar(), delta?.grammar ?? []));
}
