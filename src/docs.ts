import type { Doc, Level, GrammarEntry, DocJSON, GroupsJSON } from './types';
import { initGrammar } from './grammar';
import { initStore, store } from './storage';
import { applyUserData, mergeGrammar, LEVEL_ORDER, LEVEL_LABEL } from './docs-merge';
import groupsJson from './data/_groups.json';

// 빌드 타임에 번들로 베이킹되는 문헌별 JSON 콘텐츠 (서버 없이도 표시)
//   각 파일은 DocJSON: 안정적 카드 id + 카드 내장 grammar 를 갖는다.
//   `_`로 시작하는 파일(_groups.json 등)은 문헌이 아니라 메타 — 제외.
const rawJsons = import.meta.glob(['./data/*.json', '!./data/_*.json'], {
  import: 'default',
  eager: true,
}) as Record<string, DocJSON>;

export let DOCS: Doc[] = Object.entries(rawJsons)
  // order 필드 우선(작을수록 앞, 없으면 맨 뒤) → 동률은 파일명 가나다순
  .sort(([pa, a], [pb, b]) => (a.order ?? Infinity) - (b.order ?? Infinity) || pa.localeCompare(pb))
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
    return { id: dj.id, title: dj.title, sub: dj.sub, color: dj.color, levels };
  });

// ── 서가 그룹 (src/data/_groups.json — 선반 + 참고문헌 관계) ──────────────
const GROUPS = groupsJson as GroupsJSON;

export const SHELVES = GROUPS.shelves;
export const REFS    = GROUPS.refs;

/** 참고문헌(자식) 문헌들. 없으면 빈 배열. */
export function refsOf(docId: string): Doc[] {
  const g = REFS.find(r => r.parentId === docId);
  if (!g) return [];
  return g.childIds
    .map(id => DOCS.find(d => d.id === id))
    .filter((d): d is Doc => d !== undefined);
}

/**
 * 홈 화면에 최상위로 노출되는 문헌 목록(참고문헌 자식 제외).
 * 선반 정의 순서대로 나열 + 선반에 없는 문헌은 뒤에(미분류).
 * 홈 렌더(renderHome)와 키보드 단축키(1~9)가 같은 출처를 쓰도록 한다.
 */
export function homeDocs(): Doc[] {
  return shelvesForHome().flatMap(s => s.docs);
}

/** 홈 서가 구성: 선반별 문헌 목록 + 선반 밖 문헌은 "미분류" 선반으로. */
export function shelvesForHome(): { id: string; name: string; docs: Doc[] }[] {
  const childIds = new Set(REFS.flatMap(g => g.childIds));
  const byId     = new Map(DOCS.map(d => [d.id, d]));
  const placed   = new Set<string>();

  const shelves = SHELVES.map(s => ({
    id:   s.id,
    name: s.name,
    docs: s.docIds
      .map(id => byId.get(id))
      .filter((d): d is Doc => d !== undefined && !childIds.has(d.id) && !placed.has(d.id) && (placed.add(d.id), true)),
  }));

  const rest = DOCS.filter(d => !childIds.has(d.id) && !placed.has(d.id));
  if (rest.length) shelves.push({ id: '_unshelved', name: '미분류', docs: rest });
  return shelves.filter(s => s.docs.length > 0);
}

// ── 표지색 — DocJSON.color 우선, 없으면 팔레트 순환 자동 배정 (tokens.md) ──
export const COVER_PALETTE = [
  '#F8E3D1', '#E3EDD9', '#F7ECCF', '#DCE8F2', '#E8E0F0', '#F6DFDD', '#EDEAE3', '#E0EDEA',
];

export function docColor(doc: Doc): string {
  if (doc.color) return doc.color;
  const idx = DOCS.findIndex(d => d.id === doc.id);
  return COVER_PALETTE[(idx >= 0 ? idx : 0) % COVER_PALETTE.length];
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
