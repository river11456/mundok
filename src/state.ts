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
