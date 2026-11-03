import type { LastSession } from './types';

/** Saved IDs follow reordered cards; old backups without IDs retain index semantics. */
export function sessionCardIndex(last: LastSession, cards: readonly { id: string }[]): number {
  if (last.mode !== 'seq' || cards.length === 0) return -1;
  if (last.cardId !== undefined) return cards.findIndex(card => card.id === last.cardId);
  return Math.max(0, Math.min(last.idx, cards.length - 1));
}
