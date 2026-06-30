import { S, persist, recordStudySession } from './state';
import { render } from './render';

export function rate(d: 1 | 2 | 3): void {
  if (S.busy || S.side !== 'back') return;
  S.busy = true;

  const card = S.queue.shift()!;

  if (d === 1) {
    card.fail_count++;
    const hi  = Math.min(3, S.queue.length);
    const pos = hi > 0 ? 1 + Math.floor(Math.random() * hi) : 0;
    S.queue.splice(pos, 0, card);
  } else if (d === 2) {
    S.queue.splice(Math.floor(S.queue.length / 2), 0, card);
  }

  persist();
  S.side = S.queue.length === 0 ? 'result' : 'front';
  if (S.side === 'result') recordStudySession(S.total);   // 학습 완료 시점에 1회만 집계
  S.busy = false;
  render();
}
