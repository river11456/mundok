import type { Card } from './types';

/**
 * 안키 난이도 평가 후 큐 재배치(순수 함수, 테스트 용이).
 * card는 이미 큐에서 shift 된 상태로 전달한다.
 *   d=1(어려움) → fail_count 증가, 큐 1~3번째 사이 임의 위치 재삽입
 *   d=2(보통)   → 큐 중간 위치 재삽입
 *   d=3(쉬움)   → 재삽입 없음(완료)
 */
export function reinsertAfterRating(
  queue: Card[],
  card: Card,
  d: 1 | 2 | 3,
  rand: () => number = Math.random,
): Card[] {
  const q = [...queue];
  if (d === 1) {
    card.fail_count++;
    const hi  = Math.min(3, q.length);
    const pos = hi > 0 ? 1 + Math.floor(rand() * hi) : 0;
    q.splice(pos, 0, card);
  } else if (d === 2) {
    q.splice(Math.floor(q.length / 2), 0, card);
  }
  return q;
}
