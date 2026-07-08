import type { Doc, Level, GrammarEntry, DocJSON } from './types';
import { initGrammar } from './grammar';
import { initStore, store } from './storage';
import { applyUserData, mergeGrammar, LEVEL_ORDER, LEVEL_LABEL } from './docs-merge';

// 빌드 타임에 번들로 베이킹되는 문헌별 JSON 콘텐츠 (서버 없이도 표시)
//   각 파일은 DocJSON: 안정적 카드 id + 카드 내장 grammar 를 갖는다.
const rawJsons = import.meta.glob('./data/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, DocJSON>;

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

export async function initDocs(): Promise<void> {
  await initStore();

  // 사용자 로컬 편집 델타(정적 모드). 서버 모드면 null.
  const delta = await store().loadDelta();
  if (delta) applyUserData(DOCS, delta);

  initGrammar(mergeGrammar(collectGrammar(), delta?.grammar ?? []));
}
