import type { CardJSON, DocJSON, LevelKey, UserData } from './types';

/**
 * v1 → v3 콘텐츠 마이그레이션 순수 로직 (SPEC 9절).
 *
 * v1 세계: 베이킹 문헌(번들) + 텍스트 키 델타(hanja-v2/userdata) + 사용자 문헌(hanja-v2/user-docs)
 * v3 세계: 유저 공간 단일(mundok-v3/docs) — 베이킹 문헌은 델타를 구워 넣은 설치본이 된다.
 *
 * id 보존 원칙 — 학습기록(fails 키 = 카드 id)이 리맵 없이 이어지도록:
 *   - 베이킹 카드 id(c1/w1/s1/p1)는 그대로 (S0에서 카탈로그에도 동일 고정)
 *   - 사용자 문헌 id(u1…)는 그대로 (신규 생성만 새 규칙)
 *   - 델타 추가 카드는 v1 런타임의 합성 id(`${docId}_${type}_${text}`)를 그대로
 *   (SPEC 2.2의 "합성 id 소멸"은 신규 채번 경로에 적용 — 기존 데이터는 불투명 문자열로 보존)
 *
 * 이 모듈은 localStorage를 모른다 — 읽기·쓰기 배선은 docs.ts 초기화가 담당.
 */

export const SCHEMA_VERSION = 3;
export const V3_DOCS_KEY = 'mundok-v3/docs';

const LEVELS: readonly LevelKey[] = ['char', 'word', 'sentence', 'paragraph'];

/** v1 LocalStore.addCard가 부여하던 합성 카드 id — fails 키 연속성을 위해 보존 */
function syntheticId(docId: string, type: LevelKey, text: string): string {
  return `${docId}_${type}_${text}`;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 전 레벨에서 text가 일치하는 첫 카드 — v1 grammar 델타의 (docId, cardFront) 매칭과 동일 */
function findByText(d: DocJSON, text: string): CardJSON | undefined {
  for (const k of LEVELS) {
    const hit = d.levels[k]?.find(c => c.text === text);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * 델타를 DocJSON에 구워 넣는다 — v1 런타임 적용 순서(deletions → edits → additions →
 * interp → grammar)와 동일. grammar·interp는 편집 후 텍스트로 매칭된다 (v1과 동일).
 * 델타가 손댄 카드에는 editedAt을 스탬프해 카탈로그 업데이트 머지(C6)가 보존하게 한다.
 */
function bakeDelta(d: DocJSON, ud: UserData, editedAt: number): void {
  const removed: string[] = [];

  for (const del of ud.deletions ?? []) {
    if (del.docId !== d.id) continue;
    const arr = d.levels[del.type];
    if (!arr) continue;
    for (const c of arr) if (c.text === del.text) removed.push(c.id);
    d.levels[del.type] = arr.filter(c => c.text !== del.text);
  }

  for (const edit of ud.edits ?? []) {
    if (edit.docId !== d.id) continue;
    const card = d.levels[edit.type]?.find(c => c.text === edit.origText);
    if (!card) continue;   // 고아 델타 (v1 알려진 한계) — 조용히 버림
    card.text    = edit.text;
    card.reading = edit.reading;
    card.meaning = edit.meaning;
    card.note    = edit.note;
    card.editedAt = editedAt;
  }

  for (const add of ud.additions ?? []) {
    if (add.docId !== d.id || !LEVELS.includes(add.type)) continue;
    const cards = (d.levels[add.type] ??= []);
    if (cards.some(c => c.text === add.text)) continue;   // v1과 동일: 중복 텍스트 무시
    cards.push({
      id:      syntheticId(add.docId, add.type, add.text),
      text:    add.text,
      reading: add.reading,
      meaning: add.meaning,
      note:    add.note,
      editedAt,
    });
  }

  for (const e of ud.interp ?? []) {
    if (e.docId !== d.id) continue;
    const card = d.levels.sentence?.find(c => c.text === e.cardFront);
    if (!card) continue;
    if (e.chunks.length) card.interp = e.chunks;
    else delete card.interp;
    card.editedAt = editedAt;
  }

  for (const g of ud.grammar ?? []) {
    if (g.docId !== d.id) continue;
    const card = findByText(d, g.cardFront);
    if (!card) continue;
    if (g.annotations.length) card.grammar = g.annotations;
    else delete card.grammar;
    card.editedAt = editedAt;
  }

  if (removed.length) {
    if (d.source) d.source = { ...d.source, removed };
    else d.source = { catalogId: d.id, version: d.version ?? 1, removed };
  }
}

/**
 * 베이킹 문헌 + v1 델타 + v1 사용자 문헌 → v3 유저 공간 문헌 배열.
 * 베이킹 문헌은 카탈로그 설치본이 된다 (source 스탬프 — 이후 업데이트 경로 연결).
 * 배열 순서: 베이킹(현행 홈 순서 유지를 위해 호출자가 정렬해 전달) → 사용자 문헌.
 */
export function buildV3Docs(
  baked: DocJSON[],
  delta: UserData | null,
  userDocs: DocJSON[],
  nowIso: string,
): DocJSON[] {
  const editedAt = Date.parse(nowIso);
  const userIds  = new Set(userDocs.map(d => d.id));
  const out: DocJSON[] = [];

  for (const b of baked) {
    if (userIds.has(b.id)) continue;   // 만약의 id 충돌 — 유저 것이 이긴다 (공리 3)
    const d = clone(b);
    d.schemaVersion = SCHEMA_VERSION;
    d.source = { catalogId: d.id, version: d.version ?? 1, installedAt: nowIso };
    if (delta) bakeDelta(d, delta, editedAt);
    out.push(d);
  }

  for (const u of userDocs) {
    const d = clone(u);
    d.schemaVersion = SCHEMA_VERSION;
    out.push(d);
  }

  return out;
}
