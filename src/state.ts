import type { Card, Doc, Level, Mode, Screen, Side } from './types';
import { DOCS } from './docs';

export { DOCS };

export const S = {
  scr:        'home' as Screen,
  docId:      null   as string | null,
  mode:       null   as Mode   | null,
  lv:         null   as Level  | null,

  seqIdx:     0,
  seqFlipped: false,

  allCards:   [] as Card[],
  queue:      [] as Card[],
  total:      0,
  side:       'front' as Side,
  busy:       false,

  navStack:   [] as Array<{lv: Level; mode: Mode; seqIdx: number; seqFlipped: boolean; queue: Card[]; total: number; side: Side}>,

  grammarOn:       false,
  grammarEditMode: false,

  expandedRefGroups: new Set<string>(),
};

export const DRILL_NEXT: Record<string, string> = {
  paragraph: 'sentence',
  sentence:  'word',
  word:      'char',
};

export const DRILL_LEVELS: Record<string, string[]> = {
  paragraph: ['sentence'],
  sentence:  ['word', 'char'],
  word:      ['char'],
};

const LS = 'hanja-v2';

export function curDoc(): Doc {
  return DOCS.find(d => d.id === S.docId)!;
}

/** 안키 진행 상태의 베이스 키. 접미사를 붙여 파생 키를 만든다. */
export function lsKey(): string {
  return `${LS}/${S.docId}/${S.lv!.key}`;
}

/** 카드 id → fail_count 맵 저장 키. 카드 수·순서 변화에 견고. */
function failKey(): string {
  return `${lsKey()}/fails`;
}

type FailMap = Record<string, number>;

function readFails(): FailMap | null {
  try {
    const raw = JSON.parse(localStorage.getItem(failKey()) ?? 'null') as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as FailMap;
  } catch { /* ignore */ }
  return null;
}

/**
 * 구 포맷(Card[] 배열, `개수 일치` 방식)을 1회 마이그레이션.
 * front 매칭으로 fail_count 를 카드 id 맵으로 옮긴 뒤 구 키를 제거한다.
 */
function migrateOldAnki(cards: Card[]): FailMap {
  const fails: FailMap = {};
  try {
    const old = JSON.parse(localStorage.getItem(lsKey()) ?? 'null') as unknown;
    if (Array.isArray(old)) {
      const byFront = new Map<string, number>();
      for (const c of old as Card[]) if (c?.front && c.fail_count > 0) byFront.set(c.front, c.fail_count);
      for (const c of cards) { const f = byFront.get(c.front); if (f) fails[c.id] = f; }
    }
  } catch { /* ignore */ }
  localStorage.removeItem(lsKey());                       // 구 배열 키 정리
  localStorage.setItem(failKey(), JSON.stringify(fails)); // 이후엔 readFails 가 성공 → 1회만 실행
  return fails;
}

export function loadAnki(cards: Card[]): Card[] {
  const fails = readFails() ?? migrateOldAnki(cards);
  return cards.map(c => ({ ...c, fail_count: fails[c.id] ?? 0 }));
}

export function persist(): void {
  const fails: FailMap = {};
  for (const c of S.allCards) if (c.fail_count > 0) fails[c.id] = c.fail_count;
  localStorage.setItem(failKey(), JSON.stringify(fails));
  localStorage.setItem(lsKey() + '_ts', Date.now().toString());
}

/** 안키 기록 초기화 (Ctrl+Shift+R). */
export function resetAnki(): void {
  localStorage.removeItem(failKey());
}

// ── Per-doc last-studied date ─────────────────────────────
export function getDocLastStudied(docId: string): string | null {
  let latest = 0;
  for (const key of ['char', 'word', 'sentence', 'paragraph']) {
    const ts = parseInt(localStorage.getItem(`${LS}/${docId}/${key}_ts`) ?? '0');
    if (ts > latest) latest = ts;
  }
  if (!latest) return null;
  return new Date(latest).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── Daily streak ──────────────────────────────────────────
const STREAK_KEY = `${LS}/streak`;

interface StreakData { lastDate: string; count: number; todayCards: number; }

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr(): string { return localDateStr(new Date()); }

export function getStreak(): StreakData {
  try {
    const d = JSON.parse(localStorage.getItem(STREAK_KEY) ?? 'null');
    if (d && typeof d.count === 'number') return d as StreakData;
  } catch { /* ignore */ }
  return { lastDate: '', count: 0, todayCards: 0 };
}

export function recordStudySession(cardsCount: number): StreakData {
  const today = todayStr();
  const prev  = getStreak();
  if (prev.lastDate === today) {
    const next = { ...prev, todayCards: prev.todayCards + cardsCount };
    localStorage.setItem(STREAK_KEY, JSON.stringify(next));
    return next;
  }
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const next: StreakData = {
    lastDate: today,
    count: prev.lastDate === localDateStr(yest) ? prev.count + 1 : 1,
    todayCards: cardsCount,
  };
  localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  return next;
}

export function pushNav(): void {
  S.navStack.push({
    lv: S.lv!, mode: S.mode!,
    seqIdx: S.seqIdx, seqFlipped: S.seqFlipped,
    queue: S.queue, total: S.total, side: S.side,
  });
}

export function popNav(): boolean {
  if (S.navStack.length === 0) return false;
  const prev   = S.navStack.pop()!;
  S.lv         = prev.lv;
  S.mode       = prev.mode;
  S.seqIdx     = prev.seqIdx;
  S.seqFlipped = prev.seqFlipped;
  S.queue      = prev.queue;
  S.total      = prev.total;
  S.side       = prev.side;
  return true;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
