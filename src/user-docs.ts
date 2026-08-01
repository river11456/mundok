// 값 import는 .ts 확장자 명시 — node 테스트(strip-types)가 이 모듈을 직접 import한다
import { LEVEL_ORDER, type CardJSON, type DocJSON, type GrammarAnnotation, type InterpChunk, type LevelKey } from './types.ts';
import { SCHEMA_VERSION, V3_DOCS_KEY } from './migrate-v1.ts';

/**
 * 유저 공간 문헌 저장소 — localStorage `mundok-v3/docs` 에 DocJSON 배열 (SPEC 4.2).
 *
 * v2 공리 3: 직접 생성이든 카탈로그 설치본이든 유저 공간의 문헌은 전부 동등하다.
 * 카드 CRUD는 문헌 객체를 **id 기반으로 직접 수정**하는 단일 경로 — 텍스트 키
 * 델타는 폐지됐다 (구 델타는 migrate-v1이 설치본에 구워 넣음).
 *
 * 모든 쓰기는 updatedAt(문헌)·editedAt(카드)을 갱신한다 — updatedAt은 미래 동기화
 * 비교 키, editedAt은 카탈로그 업데이트 머지(C6)의 보존 판단 기준.
 */

export const USER_DOCS_KEY = V3_DOCS_KEY;

const ID_PREFIX: Record<LevelKey, string> = { char: 'c', word: 'w', sentence: 's', paragraph: 'p' };

// ── 순수 로직 (테스트 대상 — localStorage 비의존) ─────────────────────────

/** 새 문헌 id — `u-` + 난수 6자 (SPEC 2.2). 기존 id와 충돌하지 않을 때까지 재시도. */
export function newUserDocId(existing: string[]): string {
  const taken = new Set(existing);
  for (;;) {
    const id = `u-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
    if (!taken.has(id)) return id;
  }
}

/** 해당 레벨의 다음 안정 카드 id — 접두사+순번 단조 증가 (예: s12 → s13) */
export function nextCardId(cards: CardJSON[], type: LevelKey): string {
  const prefix = ID_PREFIX[type];
  let mx = 0;
  for (const c of cards) {
    if (c.id.startsWith(prefix)) {
      const n = parseInt(c.id.slice(prefix.length));
      if (Number.isFinite(n)) mx = Math.max(mx, n);
    }
  }
  return `${prefix}${mx + 1}`;
}

/** 텍스트 목록을 카드로 추가 (빈 문자열·중복 텍스트는 건너뜀). 추가된 id 목록 반환. */
export function addTexts(doc: DocJSON, type: LevelKey, texts: string[]): string[] {
  const cards = (doc.levels[type] ??= []);
  const seen  = new Set(cards.map(c => c.text));
  const ids: string[] = [];
  for (const t of texts) {
    const text = t.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const id = nextCardId(cards, type);
    cards.push({ id, text, reading: '', meaning: '', note: '' });
    ids.push(id);
  }
  return ids;
}

/**
 * 카탈로그 업데이트 머지 (C6) — 카드 id 단위, 카드별 base 스냅샷 없이:
 *   - source.removed에 기록된 카드는 재도입하지 않는다 (유저 삭제 존중)
 *   - editedAt이 찍힌 카드는 유저 것을 보존한다 (kept로 집계 → 요약 알림)
 *   - 나머지는 상류 개정을 적용, 유저가 추가한 카드(상류에 없는 id)는 뒤에 보존
 * 문헌 메타(title·sub·color)는 상류를 따른다.
 */
export function mergeCatalogUpdate(mine: DocJSON, theirs: DocJSON): { doc: DocJSON; kept: number } {
  const removed = new Set(mine.source?.removed ?? []);
  let kept = 0;
  const levels: DocJSON['levels'] = {};

  for (const k of LEVEL_ORDER) {
    const theirCards = theirs.levels[k] ?? [];
    const mineCards  = mine.levels[k] ?? [];
    const mineById   = new Map(mineCards.map(c => [c.id, c]));
    const theirIds   = new Set(theirCards.map(c => c.id));
    const out: CardJSON[] = [];

    for (const tc of theirCards) {
      if (removed.has(tc.id)) continue;
      const mc = mineById.get(tc.id);
      if (mc?.editedAt) { out.push(mc); kept++; }
      else out.push(tc);
    }
    for (const mc of mineCards) {
      if (!theirIds.has(mc.id) && !removed.has(mc.id)) out.push(mc);
    }
    if (out.length) levels[k] = out;
  }

  const doc: DocJSON = { ...theirs, levels };
  return { doc, kept };
}

// ── localStorage 래퍼 ─────────────────────────────────────────────────────

export function loadUserDocs(): DocJSON[] {
  try {
    const raw = localStorage.getItem(USER_DOCS_KEY);
    const arr = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(arr) ? arr as DocJSON[] : [];
  } catch {
    return [];
  }
}

function save(docs: DocJSON[]): void {
  localStorage.setItem(USER_DOCS_KEY, JSON.stringify(docs));
}

/** 문헌을 찾아 fn 적용 후 schemaVersion·updatedAt 갱신·저장. 없으면 throw. */
function withDoc<T>(docId: string, fn: (d: DocJSON) => T): T {
  const docs = loadUserDocs();
  const doc  = docs.find(d => d.id === docId);
  if (!doc) throw new Error(`문헌을 찾을 수 없습니다: ${docId}`);
  const r = fn(doc);
  doc.schemaVersion = SCHEMA_VERSION;
  doc.updatedAt = new Date().toISOString();
  save(docs);
  return r;
}

export function createUserDoc(
  meta: { title: string; sub: string; color?: string },
  type: LevelKey,
  texts: string[],
): DocJSON {
  const docs = loadUserDocs();
  const doc: DocJSON = {
    id:    newUserDocId(docs.map(d => d.id)),
    schemaVersion: SCHEMA_VERSION,
    title: meta.title,
    sub:   meta.sub,
    ...(meta.color ? { color: meta.color } : {}),
    updatedAt: new Date().toISOString(),
    levels: {},
  };
  addTexts(doc, type, texts);
  docs.push(doc);
  save(docs);
  return doc;
}

export function updateUserDocMeta(docId: string, meta: { title: string; sub: string; color?: string }): void {
  withDoc(docId, d => {
    d.title = meta.title;
    d.sub   = meta.sub;
    if (meta.color) d.color = meta.color;
    else delete d.color;
  });
}

/** 문헌 삭제 — 학습기록(mundok-v3/log/*)은 호출측이 deleteDocProgress로 정리 */
export function deleteUserDoc(docId: string): void {
  save(loadUserDocs().filter(d => d.id !== docId));
}

/** 본문 추가 마법사 — 추가된 카드 수 반환 */
export function appendUserTexts(docId: string, type: LevelKey, texts: string[]): number {
  return withDoc(docId, d => addTexts(d, type, texts).length);
}

/**
 * 카탈로그 문헌 설치·업데이트.
 * 신규 설치는 통째, 기설치본 업데이트는 카드 id 머지(mergeCatalogUpdate — C6).
 * 반환: 유저 수정분을 보존한 카드 수 (업데이트 요약 알림용, 신규 설치는 0).
 */
export function installCatalogDoc(dj: DocJSON, source: { catalogId: string; version: number }): number {
  const docs = loadUserDocs();
  const now  = new Date().toISOString();
  const idx  = docs.findIndex(d => d.id === dj.id);
  const prev = idx >= 0 ? docs[idx] : undefined;

  let doc: DocJSON;
  let kept = 0;
  if (prev?.source) {
    const m = mergeCatalogUpdate(prev, dj);
    doc  = m.doc;
    kept = m.kept;
  } else {
    doc = { ...dj };
  }

  doc.schemaVersion = SCHEMA_VERSION;
  doc.updatedAt = now;
  doc.source = {
    catalogId: source.catalogId,
    version:   source.version,
    installedAt: prev?.source?.installedAt ?? now,
    ...(prev?.source?.removed?.length ? { removed: prev.source.removed } : {}),
  };

  if (idx >= 0) docs[idx] = doc;
  else docs.push(doc);
  save(docs);
  return kept;
}

// ── 카드 CRUD — 모든 문헌 공통 단일 경로 (Store가 위임) ────────────────────

export function userAddCard(
  docId: string, type: LevelKey,
  c: { text: string; reading: string; meaning: string; note: string },
): string {
  return withDoc(docId, d => {
    const cards = (d.levels[type] ??= []);
    const existing = cards.find(x => x.text === c.text);
    if (existing) return existing.id;   // 중복 텍스트 = 기존 id (v1과 동일 계약)
    const id = nextCardId(cards, type);
    cards.push({ id, ...c, editedAt: Date.now() });
    return id;
  });
}

export function userEditCard(
  docId: string, type: LevelKey, cardId: string,
  c: { text: string; reading: string; meaning: string; note: string },
): void {
  withDoc(docId, d => {
    const t = d.levels[type]?.find(x => x.id === cardId);
    if (!t) throw new Error('카드를 찾을 수 없습니다');
    // 내장 grammar·interp는 보존 — id가 붙어 있어 텍스트 변경에도 끊기지 않음
    t.text = c.text; t.reading = c.reading; t.meaning = c.meaning; t.note = c.note;
    t.editedAt = Date.now();
  });
}

export function userDeleteCard(docId: string, type: LevelKey, cardId: string): void {
  withDoc(docId, d => {
    const arr  = d.levels[type] ?? [];
    const kept = arr.filter(x => x.id !== cardId);
    if (kept.length === arr.length) throw new Error('카드를 찾을 수 없습니다');
    d.levels[type] = kept;
    // 설치본이면 삭제를 기록 — 카탈로그 업데이트가 재도입하지 않게 (C6)
    if (d.source) {
      const removed = d.source.removed ?? [];
      if (!removed.includes(cardId)) d.source = { ...d.source, removed: [...removed, cardId] };
    }
  });
}

export function userSaveGrammar(docId: string, cardId: string, annotations: GrammarAnnotation[]): void {
  withDoc(docId, d => {
    const t = d.levels.sentence?.find(x => x.id === cardId);
    if (!t) throw new Error('카드를 찾을 수 없습니다');
    if (annotations.length) t.grammar = annotations;
    else delete t.grammar;
    t.editedAt = Date.now();
  });
}

export function userSaveInterp(docId: string, cardId: string, chunks: InterpChunk[]): void {
  withDoc(docId, d => {
    const t = d.levels.sentence?.find(x => x.id === cardId);
    if (!t) throw new Error('카드를 찾을 수 없습니다');
    if (chunks.length) t.interp = chunks;
    else delete t.interp;
    t.editedAt = Date.now();
  });
}
