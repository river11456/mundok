import type { Card, Doc, Level, Mode, Screen, Side, LastSession, ReviewEvent } from './types';
import { DOCS } from './docs';
import { store } from './storage';
import { deriveFails, lastTs } from './review-log';

export { DOCS };
export type { LastSession };

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
  grammarEditMode: false,   // 문법 보기·편집은 카드 단위 — 카드 이동 시 resetGrammarView()
  grammarMenu:     false,   // 文 아이콘 확장 메뉴 열림 여부
  interpEditMode:  false,   // 해석 순서 편집 (문법 편집과 상호 배타)

  /** 홈 문헌 상세 오버레이 — 열려 있으면 해당 docId */
  docOverlay: null as string | null,
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

export function curDoc(): Doc {
  return DOCS.find(d => d.id === S.docId)!;
}

// ── Progress — 리뷰 로그 경유 (SPEC 2.4). localStorage 직접 접근 금지 — Store가 전담. ──

/** 문헌별 최근 학습 시각 캐시 — 홈 렌더마다 로그 전체 파싱을 피한다. append 시 무효화. */
const lastStudiedCache = new Map<string, number>();

function appendLog(events: ReviewEvent[]): void {
  if (!S.docId) return;
  store().appendLog(S.docId, events);
  lastStudiedCache.delete(S.docId);
}

/** 카드 목록에 리뷰 로그에서 파생한 오답 수를 입힌다 (안키 큐 재구성용). */
export function loadAnki(cards: Card[]): Card[] {
  const fails = deriveFails(store().loadLog(S.docId!), S.lv!.key);
  return cards.map(c => ({ ...c, fail_count: fails[c.id] ?? 0 }));
}

/** 안키 난이도 평가 기록 — fail_count 파생의 원천 이벤트. */
export function recordRating(card: Card, grade: 1 | 2 | 3): void {
  appendLog([{ t: 'anki', card: card.id, lv: S.lv!.key, ts: Date.now(), grade }]);
}

/** 순차 모드 첫 플립 — 학습 흔적 기록 (홈 '최근 학습' 표시의 원천). */
export function touchLastStudied(): void {
  const card = S.lv?.cards[S.seqIdx];
  if (!card) return;
  appendLog([{ t: 'seq', card: card.id, lv: S.lv!.key, ts: Date.now() }]);
}

/** 안키 기록 초기화 (Ctrl+Shift+R) — 리셋 이벤트를 남긴다 (append-only). */
export function resetAnki(): void {
  appendLog([{ t: 'reset', lv: S.lv!.key, ts: Date.now() }]);
}

/** 문헌 삭제 시 리뷰 로그 정리 (events.ts doc-delete가 호출). */
export function deleteDocProgress(docId: string): void {
  store().deleteLog(docId);
  lastStudiedCache.delete(docId);
}

// ── Per-doc last-studied date ─────────────────────────────
export function getDocLastStudied(docId: string): string | null {
  let ts = lastStudiedCache.get(docId);
  if (ts === undefined) {
    ts = lastTs(store().loadLog(docId));
    lastStudiedCache.set(docId, ts);
  }
  if (!ts) return null;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── 이어서 학습 — 마지막 학습 위치를 저장해 홈 히어로에서 원터치 복귀 ──

export function saveLastSession(): void {
  if (!S.docId || !S.lv || !S.mode) return;
  const last: LastSession = {
    docId: S.docId,
    lvKey: S.lv.key,
    mode:  S.mode,
    idx:   S.mode === 'seq' ? S.seqIdx : S.total - S.queue.length,
    total: S.mode === 'seq' ? S.lv.cards.length : S.total,
    ts:    Date.now(),
  };
  const s = store().loadSession();
  store().saveSession({ ...s, last });
}

export function getLastSession(): LastSession | null {
  const d = store().loadSession().last;
  if (d && typeof d.docId === 'string' && typeof d.lvKey === 'string'
    && (d.mode === 'seq' || d.mode === 'anki') && typeof d.idx === 'number') return d;
  return null;
}

// ── 선반(그룹) 접기 상태 ─────────────────────────────────
export function collapsedShelves(): Set<string> {
  return new Set(store().loadPrefs().shelvesCollapsed);
}

export function toggleShelf(id: string): void {
  const p = store().loadPrefs();
  const s = new Set(p.shelvesCollapsed);
  if (s.has(id)) s.delete(id); else s.add(id);
  store().savePrefs({ ...p, shelvesCollapsed: [...s] });
}

// ── 온보딩 ────────────────────────────────────────────────
export function isOnboardingSeen(): boolean {
  return store().loadPrefs().onboardingSeen;
}

export function markOnboardingSeen(): void {
  store().savePrefs({ ...store().loadPrefs(), onboardingSeen: true });
}

// ── Daily streak ──────────────────────────────────────────
export interface StreakView { lastDate: string; count: number; todayCards: number; }

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr(): string { return localDateStr(new Date()); }

export function getStreak(): StreakView {
  return store().loadSession().streak;
}

export function recordStudySession(cardsCount: number): StreakView {
  const today = todayStr();
  const s     = store().loadSession();
  const prev  = s.streak;
  let next: StreakView;
  if (prev.lastDate === today) {
    next = { ...prev, todayCards: prev.todayCards + cardsCount };
  } else {
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    next = {
      lastDate: today,
      count: prev.lastDate === localDateStr(yest) ? prev.count + 1 : 1,
      todayCards: cardsCount,
    };
  }
  store().saveSession({ ...s, streak: next });
  return next;
}

/** 문법 보기·편집 리셋 — 카드가 바뀌는 모든 시점에 호출 (카드마다 수동 켜기, 2026-07-18 B안). */
export function resetGrammarView(): void {
  S.grammarOn = false;
  S.grammarEditMode = false;
  S.grammarMenu = false;
  S.interpEditMode = false;
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
