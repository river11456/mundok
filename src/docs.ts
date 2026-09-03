import type { Doc, Level, GrammarEntry, DocJSON, GroupsJSON, ShelfJSON } from './types';
import { LEVEL_ORDER, LEVEL_LABEL } from './types';
import { initGrammar } from './grammar';
import { initStore } from './storage';
import { migrateV1IfNeeded, migrateProgressIfNeeded, purgeV1IfMigrated } from './migrate-v1';
import { loadUserDocs, installCatalogDoc } from './user-docs';
import { canCreateChildFolder, loadCollections, seedCollectionsIfNeeded } from './collections';
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

/** DocJSON → 런타임 Doc 변환. */
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
    levels,
  };
}

export let DOCS: Doc[] = [];

/** 유저 공간(mundok-v3/docs) 전체를 DOCS로 재구성 — 생성·수정·삭제·설치 후 호출. */
export function syncUserDocs(): void {
  DOCS = loadUserDocs().map(toDoc);
}

// ── 서가 (SPEC 3.4): 참고문헌 관계(refs)는 카탈로그 소유, 선반은 사용자 소유 ──
//   카탈로그 _collections.json의 선반은 seedCollectionsIfNeeded의 1회 시드로만 쓰인다 (O1).
const GROUPS = collectionsJson as GroupsJSON;

export const REFS = GROUPS.refs;

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
 * 사용자 선반 순서대로 나열 + 선반에 없는 문헌은 뒤에(미분류).
 * 홈 렌더(renderHome)와 키보드 단축키(1~9)가 같은 출처를 쓰도록 한다.
 */
export type FolderShelfJSON = ShelfJSON & {
  parentId?: string | null;
  color?: string;
  icon?: string;
};

export interface HomeFolder {
  id: string;
  name: string;
  parentId: string | null;
  docCount: number;
  folderCount: number;
  depth: number;
  color?: string;
  icon?: string;
}

export interface HomeShelf {
  id: string;
  name: string;
  folderId: string | null;
  parentId: string | null;
  docs: Doc[];
  folders: HomeFolder[];
  ancestors: HomeFolder[];
  canCreateFolder: boolean;
  /** 루트는 시스템 위치라 이름변경·삭제 불가. */
  system?: boolean;
}

function asFolders(shelves = loadCollections()): FolderShelfJSON[] {
  const ids = new Set(shelves.map(s => s.id));
  return shelves.map(s => {
    const f = s as FolderShelfJSON;
    const parentId = typeof f.parentId === 'string' && ids.has(f.parentId) && f.parentId !== f.id
      ? f.parentId
      : null;
    return { ...f, parentId };
  });
}

export function folderDepth(folderId: string | null, shelves = loadCollections()): number {
  if (folderId === null) return 0;
  const byId = new Map(asFolders(shelves).map(s => [s.id, s]));
  let depth = 0;
  let cur = byId.get(folderId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    depth += 1;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return depth;
}

function toHomeFolder(s: FolderShelfJSON, shelves: FolderShelfJSON[]): HomeFolder {
  return {
    id: s.id,
    name: s.name,
    parentId: s.parentId ?? null,
    docCount: s.docIds.length,
    folderCount: shelves.filter(x => (x.parentId ?? null) === s.id).length,
    depth: folderDepth(s.id, shelves),
    ...(s.color ? { color: s.color } : {}),
    ...(s.icon ? { icon: s.icon } : {}),
  };
}

export function folderPath(folderId: string | null, shelves = loadCollections()): HomeFolder[] {
  if (folderId === null) return [];
  const folders = asFolders(shelves);
  const byId = new Map(folders.map(s => [s.id, s]));
  const path: HomeFolder[] = [];
  const seen = new Set<string>();
  let cur = byId.get(folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(toHomeFolder(cur, folders));
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

export function homeDocs(folderId: string | null = null): Doc[] {
  return shelvesForHome(folderId).flatMap(s => s.docs);
}

/** 홈 라이브러리 구성: 현재 폴더의 하위 폴더와 문헌만 노출한다. */
export function shelvesForHome(folderId: string | null = null): HomeShelf[] {
  const childIds = new Set(REFS.flatMap(g => g.childIds));
  const byId     = new Map(DOCS.map(d => [d.id, d]));
  const folders  = asFolders();
  const byFolder = new Map(folders.map(s => [s.id, s]));
  const current  = folderId ? byFolder.get(folderId) : null;
  const currentId = current?.id ?? null;

  const docs = current
    ? current.docIds
      .map(id => byId.get(id))
      .filter((d): d is Doc => d !== undefined)
    : DOCS.filter(d => !folders.some(s => s.docIds.includes(d.id)) && !childIds.has(d.id))
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  const childFolders = folders
    .filter(s => (s.parentId ?? null) === currentId)
    .map(s => toHomeFolder(s, folders));

  return [{
    id: current?.id ?? '_root',
    name: current?.name ?? '라이브러리',
    folderId: currentId,
    parentId: current?.parentId ?? null,
    docs,
    folders: childFolders,
    ancestors: folderPath(currentId, folders),
    canCreateFolder: canCreateChildFolder(folders, currentId),
    system: currentId === null,
  }];
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

/**
 * 온보딩 스타터 (C8) — 뜻·문법·해석 순서가 채워진 대표 문헌을 원클릭 설치.
 * 이미 있으면 아무것도 안 한다. 번들 사본을 쓰므로 오프라인에서도 동작.
 */
export function installStarterDoc(): void {
  const starter = 불치이병치미병 as DocJSON;
  if (loadUserDocs().some(d => d.id === starter.id)) return;
  installCatalogDoc(starter, { catalogId: starter.id, version: starter.version ?? 1 });
  syncUserDocs();
}

export async function initDocs(): Promise<void> {
  await initStore();
  purgeV1IfMigrated();                      // 이전 로드에서 마이그레이션 완료 시 구 hanja-v2/* 제거
  migrateV1IfNeeded(V1_BAKED);              // v1 → v3 콘텐츠 1회 (신규 사용자는 빈 유저 공간)
  migrateProgressIfNeeded(loadUserDocs());  // v1 → v3 학습기록·설정 1회
  seedCollectionsIfNeeded(GROUPS.shelves, loadUserDocs().map(d => d.id));  // 사용자 선반 1회 시드 (SPEC 3.4)
  syncUserDocs();
  initGrammar(collectGrammar());
}
