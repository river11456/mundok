import { S, persist, recordStudySession, saveLastSession } from './state';
import { reinsertAfterRating } from './anki-core';
import { render } from './render';

export function rate(d: 1 | 2 | 3): void {
  if (S.busy || S.side !== 'back') return;
  S.busy = true;

  const card = S.queue.shift()!;
  S.queue = reinsertAfterRating(S.queue, card, d);

  persist();
  saveLastSession();
  S.side = S.queue.length === 0 ? 'result' : 'front';
  if (S.side === 'result') recordStudySession(S.total);   // 학습 완료 시점에 1회만 집계
  S.busy = false;
  render();
}
