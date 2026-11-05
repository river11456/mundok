import type { Doc, Level, Screen, ReviewEvent } from './types';
import { DOCS } from './docs';
import { store } from './storage';
import { lastTs } from './review-log';

export { DOCS };

export const S = {
  scr:        'home' as Screen,
  docId:      null   as string | null,
  mode:       null   as 'seq' | null,
  lv:         null   as Level  | null,

  seqIdx:     0,
  seqFlipped: false,

  navStack: [] as Array<{lv: Level; seqIdx: number; seqFlipped: boolean}>,

  grammarOn:       false,
  grammarEditMode: false,   // 문법 보기·편집은 카드 단위 — 카드 이동 시 resetGrammarView()
  grammarMenu:     false,   // 文 아이콘 확장 메뉴 열림 여부
  libraryAddMenu:  false,   // 홈 라이브러리 추가 메뉴 열림 여부
  interpEditMode:  false,   // 해석 순서 편집 (문법 편집과 상호 배타)

  /** 홈 문헌 상세 오버레이 — 열려 있으면 해당 docId */
  docOverlay: null as string | null,
  /** 홈 라이브러리의 현재 폴더. null = 루트. */
  folderId:   null as string | null,
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

/** 순차 모드 첫 플립 — 학습 흔적 기록 (홈 '최근 학습' 표시의 원천). */
export function touchLastStudied(): void {
  const card = S.lv?.cards[S.seqIdx];
  if (!card) return;
  appendLog([{ t: 'seq', card: card.id, lv: S.lv!.key, ts: Date.now() }]);
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

export function getStreak(): StreakView {
  return store().loadSession().streak;
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
    lv: S.lv!,
    seqIdx: S.seqIdx, seqFlipped: S.seqFlipped,
  });
}

export function popNav(): boolean {
  if (S.navStack.length === 0) return false;
  const prev   = S.navStack.pop()!;
  S.lv         = prev.lv;
  S.mode       = 'seq';
  S.seqIdx     = prev.seqIdx;
  S.seqFlipped = prev.seqFlipped;
  return true;
}
