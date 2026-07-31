import type { CardJSON, DocJSON, LevelKey, PrefsData, ReviewEvent, SessionData, UserData } from './types';

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
export const V3_DOCS_KEY    = 'mundok-v3/docs';
export const V3_SESSION_KEY = 'mundok-v3/session';
export const V3_PREFS_KEY   = 'mundok-v3/prefs';

export function v3LogKey(docId: string): string {
  return `mundok-v3/log/${docId}`;
}

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

// ── localStorage 배선 ─────────────────────────────────────────────────────
//   베이킹 8문헌 JSON import는 docs.ts가 담당한다 (Node 테스트가 이 모듈을
//   import하는데, Node ESM은 순수 JSON import를 지원하지 않아 여기 둘 수 없음).

const V1_PREFIX        = 'hanja-v2/';
const V1_USERDATA_KEY  = 'hanja-v2/userdata';
const V1_USER_DOCS_KEY = 'hanja-v2/user-docs';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function hasV1Keys(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith(V1_PREFIX)) return true;
  }
  return false;
}

/**
 * v1 → v3 1회 마이그레이션 (SPEC 9절). 앱 초기화 최초에 호출.
 * - mundok-v3/docs가 이미 있으면 아무것도 안 함
 * - v1 흔적(hanja-v2/*)이 있으면: 베이킹 8문헌(baked)+델타+user-docs를 유저 공간으로 변환
 * - v1 흔적이 없으면(신규 사용자): 빈 유저 공간 — 콘텐츠는 카탈로그·온보딩 스타터로
 * - 구 hanja-v2/* 키는 보존한다 (검증 기간 후 제거 — 롤백 보험)
 */
export function migrateV1IfNeeded(baked: DocJSON[]): void {
  if (localStorage.getItem(V3_DOCS_KEY) !== null) return;
  const docs = hasV1Keys()
    ? buildV3Docs(
        baked,
        readJson<UserData>(V1_USERDATA_KEY),
        readJson<DocJSON[]>(V1_USER_DOCS_KEY) ?? [],
        new Date().toISOString(),
      )
    : [];
  localStorage.setItem(V3_DOCS_KEY, JSON.stringify(docs));
}

/**
 * v1 Progress·Preference → v3 1회 마이그레이션 (SPEC 9절 단계 4~5).
 * 콘텐츠 마이그레이션(위) 이후, 유저 공간 문헌 목록을 받아 실행한다.
 * - fails 맵 → legacy 이벤트 (카드 id 그대로 — 콘텐츠 쪽 id 보존 원칙과 한 쌍)
 * - 구구 포맷(Card[] 배열, v1 이전) — front 매칭으로 최종 상속 (구 migrateOldAnki 대체)
 * - `<lv>_ts`만 있으면 시각 승계 이벤트(card '')로 '최근 학습' 표시를 잇는다
 * - last-session·streak → session, shelves-collapsed·onboarding-seen → prefs
 * - 가드: mundok-v3/session 존재 여부 (신규 사용자도 기본값 기록 — 가드 겸용)
 */
export function migrateProgressIfNeeded(docs: DocJSON[]): void {
  if (localStorage.getItem(V3_SESSION_KEY) !== null) return;
  const now = Date.now();

  for (const d of docs) {
    const events: ReviewEvent[] = [];
    for (const lv of LEVELS) {
      const tsRaw = localStorage.getItem(`${V1_PREFIX}${d.id}/${lv}_ts`);
      const ts    = (tsRaw ? parseInt(tsRaw) : 0) || now;
      const fails = readJson<Record<string, number>>(`${V1_PREFIX}${d.id}/${lv}/fails`);
      if (fails && typeof fails === 'object' && !Array.isArray(fails)) {
        for (const [card, n] of Object.entries(fails)) {
          if (typeof n === 'number' && n > 0) events.push({ t: 'legacy', card, lv, ts, fails: n });
        }
      } else {
        const old = readJson<{ front?: string; fail_count?: number }[]>(`${V1_PREFIX}${d.id}/${lv}`);
        if (Array.isArray(old)) {
          const idByText = new Map((d.levels[lv] ?? []).map(c => [c.text, c.id]));
          for (const c of old) {
            const id = c?.front ? idByText.get(c.front) : undefined;
            if (id && (c.fail_count ?? 0) > 0) events.push({ t: 'legacy', card: id, lv, ts, fails: c.fail_count! });
          }
        }
      }
      if (tsRaw && !events.some(e => e.lv === lv)) {
        events.push({ t: 'legacy', card: '', lv, ts, fails: 0 });   // 학습 시각만 승계
      }
    }
    if (events.length) localStorage.setItem(v3LogKey(d.id), JSON.stringify(events));
  }

  const last   = readJson<SessionData['last']>(`${V1_PREFIX}last-session`);
  const streak = readJson<SessionData['streak']>(`${V1_PREFIX}streak`);
  const session: SessionData = {
    last:   last ?? null,
    streak: streak && typeof streak.count === 'number' ? streak : { lastDate: '', count: 0, todayCards: 0 },
  };
  localStorage.setItem(V3_SESSION_KEY, JSON.stringify(session));

  const collapsed = readJson<string[]>(`${V1_PREFIX}shelves-collapsed`);
  const prefs: PrefsData = {
    shelvesCollapsed: Array.isArray(collapsed) ? collapsed : [],
    onboardingSeen:   localStorage.getItem(`${V1_PREFIX}onboarding-seen`) === '1',
  };
  localStorage.setItem(V3_PREFS_KEY, JSON.stringify(prefs));
}
