import type { CardJSON, DocJSON, GrammarAnnotation, LevelKey } from './types';

/**
 * 사용자 생성 문헌 저장소 — localStorage `hanja-v2/user-docs` 에 DocJSON 배열.
 * 베이킹 문헌과 같은 스키마라 로더(docs.ts)·렌더러가 구분 없이 소비하고,
 * 백업(hanja-v2/ 접두사 전체 내보내기)에 자동 포함된다.
 *
 * 베이킹 문헌의 텍스트 키 델타(LocalStore userdata)와 달리 카드 CRUD가
 * 문헌 객체를 **id 기반으로 직접 수정**한다 — 델타 계층의 고아화 문제 원천 차단.
 * 모든 쓰기는 updatedAt을 갱신한다 (미래 동기화 비교 키).
 */

export const USER_DOCS_KEY = 'hanja-v2/user-docs';

const ID_PREFIX: Record<LevelKey, string> = { char: 'c', word: 'w', sentence: 's', paragraph: 'p' };

// ── 순수 로직 (테스트 대상 — localStorage 비의존) ─────────────────────────

/** 다음 사용자 문헌 id — u1, u2, … 단조 증가 (기존 최대치 + 1) */
export function nextUserDocId(existing: string[]): string {
  let mx = 0;
  for (const id of existing) {
    const m = /^u(\d+)$/.exec(id);
    if (m) mx = Math.max(mx, parseInt(m[1]));
  }
  return `u${mx + 1}`;
}

/** 해당 레벨의 다음 안정 카드 id — server.py next_id와 동일 규칙 (예: s12 → s13) */
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

export function isUserDoc(docId: string): boolean {
  return loadUserDocs().some(d => d.id === docId);
}

/** 문헌을 찾아 fn 적용 후 updatedAt 갱신·저장. 없으면 throw. */
function withDoc<T>(docId: string, fn: (d: DocJSON) => T): T {
  const docs = loadUserDocs();
  const doc  = docs.find(d => d.id === docId);
  if (!doc) throw new Error(`사용자 문헌을 찾을 수 없습니다: ${docId}`);
  const r = fn(doc);
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
    id:    nextUserDocId(docs.map(d => d.id)),
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

/** 문헌 삭제 + 딸린 학습기록(hanja-v2/<docId>/…) 정리 */
export function deleteUserDoc(docId: string): void {
  save(loadUserDocs().filter(d => d.id !== docId));
  const prefix = `hanja-v2/${docId}/`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) localStorage.removeItem(k);
  }
}

/** 본문 추가 마법사 — 추가된 카드 수 반환 */
export function appendUserTexts(docId: string, type: LevelKey, texts: string[]): number {
  return withDoc(docId, d => addTexts(d, type, texts).length);
}

/**
 * 카탈로그 문헌 설치·업데이트 — 같은 id가 있으면 통째로 교체.
 * 카탈로그가 카드 id를 유지하므로 교체해도 학습기록(id 기반)은 살아남는다.
 */
export function installCatalogDoc(dj: DocJSON, source: { catalogId: string; version: number }): void {
  const docs = loadUserDocs();
  const doc: DocJSON = { ...dj, source, updatedAt: new Date().toISOString() };
  const idx = docs.findIndex(d => d.id === dj.id);
  if (idx >= 0) docs[idx] = doc;
  else docs.push(doc);
  save(docs);
}

// ── 카드 CRUD (LocalStore가 사용자 문헌일 때 위임) ────────────────────────

export function userAddCard(
  docId: string, type: LevelKey,
  c: { text: string; reading: string; meaning: string; note: string },
): string {
  return withDoc(docId, d => {
    const cards = (d.levels[type] ??= []);
    const existing = cards.find(x => x.text === c.text);
    if (existing) return existing.id;   // server.py add-card와 동일: 중복 텍스트 = 기존 id
    const id = nextCardId(cards, type);
    cards.push({ id, ...c });
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
    // 내장 grammar는 보존 (텍스트 변경에도 끊기지 않음 — server.py와 동일)
    t.text = c.text; t.reading = c.reading; t.meaning = c.meaning; t.note = c.note;
  });
}

export function userDeleteCard(docId: string, type: LevelKey, cardId: string): void {
  withDoc(docId, d => {
    const arr  = d.levels[type] ?? [];
    const kept = arr.filter(x => x.id !== cardId);
    if (kept.length === arr.length) throw new Error('카드를 찾을 수 없습니다');
    d.levels[type] = kept;
  });
}

export function userSaveGrammar(docId: string, cardId: string, annotations: GrammarAnnotation[]): void {
  withDoc(docId, d => {
    const t = d.levels.sentence?.find(x => x.id === cardId);
    if (!t) throw new Error('카드를 찾을 수 없습니다');
    if (annotations.length) t.grammar = annotations;
    else delete t.grammar;
  });
}
