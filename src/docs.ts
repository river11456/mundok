import type { Doc, Level, GrammarEntry, DocJSON, GroupsJSON } from './types';
import { LEVEL_ORDER, LEVEL_LABEL } from './types';
import { initGrammar } from './grammar';
import { initStore } from './storage';
import { migrateV1IfNeeded } from './migrate-v1';
import { loadUserDocs } from './user-docs';
import collectionsJson from '../catalog/_collections.json';

// v1 베이킹 8문헌 — 마이그레이션 전용 번들 (S0에서 카탈로그에 동일 사본·카드 id 고정).
// 오프라인(PWA) 첫 로드에서도 마이그레이션이 실패하지 않도록 fetch 대신 번들에 담는다.
// v1 사용자가 전부 이전한 뒤(2.1+) 제거 후보. 순서 = v1 홈 순서(파일명 가나다).
import 대의정성 from '../catalog/대의정성.json';
import 불치이병치미병 from '../catalog/불치이병치미병.json';
import 사기조신대론 from '../catalog/사기조신대론.json';
import 상고천진론 from '../catalog/상고천진론.json';
import 식무구포 from '../catalog/식무구포.json';
import 양성편 from '../catalog/양성편.json';
import 여담론 from '../catalog/여담론.json';
import 편작육불치 from '../catalog/편작육불치.json';

const V1_BAKED = [
  대의정성, 불치이병치미병, 사기조신대론, 상고천진론, 식무구포, 양성편, 여담론, 편작육불치,
] as DocJSON[];

/** DocJSON → 런타임 Doc 변환. userDoc = 직접 생성(source 없음) — '내 문헌' 선반 기준. */
function toDoc(dj: DocJSON): Doc {
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
        ...(c.interp?.length ? { interp: c.interp } : {}),
      })),
    }));
  return {
    id: dj.id, title: dj.title, sub: dj.sub, color: dj.color,
    ...(dj.order !== undefined ? { order: dj.order } : {}),
    ...(dj.source ? {} : { userDoc: true }),
    levels,
  };
}

export let DOCS: Doc[] = [];

/** 유저 공간(mundok-v3/docs) 전체를 DOCS로 재구성 — 생성·수정·삭제·설치 후 호출. */
export function syncUserDocs(): void {
  DOCS = loadUserDocs().map(toDoc);
}

// ── 서가: 카탈로그 컬렉션 (catalog/_collections.json — 선반 + 참고문헌 관계) ──
//   구 src/data/_groups.json 승계 (SPEC 3.4). 사용자 컬렉션 편집 UI는 2.x.
const GROUPS = collectionsJson as GroupsJSON;

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
 * 선반 정의 순서대로 나열 + 선반에 없는 문헌은 뒤에(미분류 → 내 문헌).
 * 홈 렌더(renderHome)와 키보드 단축키(1~9)가 같은 출처를 쓰도록 한다.
 */
export function homeDocs(): Doc[] {
  return shelvesForHome().flatMap(s => s.docs);
}

/** 홈 서가 구성: 컬렉션 선반 → 미분류(설치본, order순) → 내 문헌(직접 생성). */
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

  const rest = DOCS.filter(d => !childIds.has(d.id) && !placed.has(d.id) && !d.userDoc)
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  if (rest.length) shelves.push({ id: '_unshelved', name: '미분류', docs: rest });

  const mine = DOCS.filter(d => !childIds.has(d.id) && !placed.has(d.id) && d.userDoc);
  if (mine.length) shelves.push({ id: '_user', name: '내 문헌', docs: mine });
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

/** 유저 공간 문헌들의 카드 내장 문법 주석을 grammar.ts 형태로 펼친다. */
function collectGrammar(): GrammarEntry[] {
  const out: GrammarEntry[] = [];
  for (const dj of loadUserDocs()) {
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
  migrateV1IfNeeded(V1_BAKED);   // v1 → v3 1회 (신규 사용자는 빈 유저 공간)
  syncUserDocs();
  initGrammar(collectGrammar());
}
