import { LIBRARY_ORDER_KEY, loadLibraryOrder, orderedIds, assertLibraryWritable } from './library-order.ts';
import { loadCollections } from './collections.ts';
import { withStorageRecovery } from './storage/recovery.ts';
// 값 import는 .ts 확장자 명시 — node 테스트(strip-types)가 이 모듈을 직접 import한다
import { LEVEL_ORDER, type CardJSON, type DocJSON, type GrammarAnnotation, type InterpChunk, type LevelKey } from './types.ts';
import { validateBackup } from './storage/backup-validation.ts';
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

    if (k === 'sentence' && mine.sentenceLayoutEdited) {
      const upstream = new Map(theirCards.map(card => [card.id, card]));
      for (const mc of mineCards) {
        if (removed.has(mc.id)) continue;
        const tc = upstream.get(mc.id);
        if (mc.editedAt && tc) kept++;
        out.push(mc.editedAt || !tc ? mc : tc);
      }
      for (const tc of theirCards) {
        if (!mineById.has(tc.id) && !removed.has(tc.id)) out.push(tc);
      }
      if (out.length) levels[k] = out;
      continue;
    }
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

  const doc: DocJSON = { ...theirs, levels, ...(mine.sentenceLayoutEdited ? { sentenceLayoutEdited: true } : {}) };
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
  assertLibraryWritable();
  if (localStorage.getItem(LIBRARY_ORDER_KEY) === null) {
    localStorage.setItem(USER_DOCS_KEY, JSON.stringify(docs));
    return;
  }
  const placed = new Set(loadCollections().flatMap(s => s.docIds));
  const ids = docs.filter(d => !placed.has(d.id)).map(d => d.id);
  const next = orderedIds(ids, loadLibraryOrder());
  if (JSON.stringify(next) === JSON.stringify(loadLibraryOrder())) {
    localStorage.setItem(USER_DOCS_KEY, JSON.stringify(docs));
    return;
  }
  withStorageRecovery(() => {
    localStorage.setItem(USER_DOCS_KEY, JSON.stringify(docs));
    localStorage.setItem(LIBRARY_ORDER_KEY, JSON.stringify(next));
  });
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

/** 문헌을 찾아 fn 적용. fn이 changed=false를 반환하면 타임스탬프와 저장을 생략한다. */
function withDocChange<T>(docId: string, fn: (d: DocJSON) => { result: T; changed: boolean }): T {
  const docs = loadUserDocs();
  const doc  = docs.find(d => d.id === docId);
  if (!doc) throw new Error(`문헌을 찾을 수 없습니다: ${docId}`);
  const { result, changed } = fn(doc);
  if (changed) {
    doc.schemaVersion = SCHEMA_VERSION;
    doc.updatedAt = new Date().toISOString();
    save(docs);
  }
  return result;
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

/** Replace one sentence layout with optimistic concurrency and one atomic storage write. */
export function replaceSentenceCards(docId: string, next: CardJSON[], expected: string): void {
  // Unlike the forgiving display loader, writes fail closed on unreadable data.
  const raw = localStorage.getItem(USER_DOCS_KEY);
  const docs = raw === null ? [] : JSON.parse(raw) as DocJSON[];
  if (!Array.isArray(docs)) throw new Error('저장된 문헌을 읽지 못했습니다.');
  const doc = docs.find(item => item.id === docId);
  if (!doc) throw new Error('문헌을 찾을 수 없습니다.');
  const before = doc.levels.sentence ?? [];
  if (JSON.stringify(before) !== expected) throw new Error('문장이 다른 곳에서 변경되었습니다. 새로 확인한 뒤 다시 시도하세요.');
  const nextIds = new Set(next.map(card => card.id));
  const orderChanged = JSON.stringify(before.map(card => card.id)) !== JSON.stringify(next.map(card => card.id));
  if (doc.source) {
    const removed = new Set(doc.source.removed ?? []);
    for (const card of before) if (!nextIds.has(card.id)) removed.add(card.id);
    // Undo can restore original IDs; they must no longer be tombstoned.
    for (const id of nextIds) removed.delete(id);
    doc.source = { ...doc.source, removed: [...removed] };
  }
  doc.levels.sentence = next;
  if (orderChanged) doc.sentenceLayoutEdited = true;
  doc.updatedAt = new Date().toISOString();
  doc.schemaVersion = SCHEMA_VERSION;
  validateBackup({ version: 3, content: { docs: [doc] } });
  save(docs);
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
  return withDocChange(docId, d => {
    const cards = (d.levels[type] ??= []);
    const existing = cards.find(x => x.text === c.text);
    if (existing) {
      let changed = false;
      if (!existing.reading && c.reading) { existing.reading = c.reading; changed = true; }
      if (!existing.meaning && c.meaning) { existing.meaning = c.meaning; changed = true; }
      if (!existing.note && c.note) { existing.note = c.note; changed = true; }
      if (changed) existing.editedAt = Date.now();
      return { result: existing.id, changed };
    }
    const id = nextCardId(cards, type);
    cards.push({ id, ...c, editedAt: Date.now() });
    return { result: id, changed: true };
  });
}

export function userEditCard(
  docId: string, type: LevelKey, cardId: string,
  c: { text: string; reading: string; meaning: string; note: string },
): void {
  withDoc(docId, d => {
    const t = d.levels[type]?.find(x => x.id === cardId);
    if (!t) throw new Error('카드를 찾을 수 없습니다');
    // A raw source edit has no reliable range mapping. Archive annotations instead
    // of silently applying old coordinates to different characters.
    if (t.text !== c.text) {
      const spans = c.text.length ? [{ start: 0, end: [...c.text].length }] : [];
      const references = (t.blockReferences ?? []).map(reference => ({ ...reference, needsReview: true, spans }));
      if (t.grammar?.length || t.interp?.length) {
        const snapshot = { sourceId: t.id, text: t.text, reading: t.reading,
          meaning: '', note: '', grammar: t.grammar ?? [], interp: t.interp ?? [] };
        references.push({ ...snapshot, id: JSON.stringify(snapshot), needsReview: true, spans });
      }
      t.blockReferences = references;
      delete t.grammar;
      delete t.interp;
      t.blockDerived = { text: c.text, meaning: c.meaning, note: c.note, grammar: [], interp: [] };
    }
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
