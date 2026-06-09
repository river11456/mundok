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

export function lsKey(): string {
  return `${LS}/${S.docId}/${S.lv!.key}`;
}

export function loadAnki(cards: Card[]): Card[] {
  try {
    const saved = JSON.parse(localStorage.getItem(lsKey()) ?? 'null') as unknown;
    if (Array.isArray(saved) && saved.length === cards.length) return saved as Card[];
  } catch (_) { /* ignore */ }
  return cards.map(c => ({ ...c, fail_count: 0 }));
}

export function persist(): void {
  localStorage.setItem(lsKey(), JSON.stringify(S.allCards));
  localStorage.setItem(lsKey() + '_ts', Date.now().toString());
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

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

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
    count: prev.lastDate === yest.toISOString().slice(0, 10) ? prev.count + 1 : 1,
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
