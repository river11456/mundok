import type { LevelKey, ReviewEvent } from './types.ts';

/**
 * 리뷰 로그 파생·압축 (순수 함수 — SPEC 2.4).
 *
 * 오답 수 재현 규칙 (v1 fail_count 의미론과 동일):
 *   - legacy(fails n) 합산 + anki grade=1 마다 +1. 감소 없음.
 *   - reset(lv) 이후의 이벤트만 유효 — v1의 '안키 기록 초기화(키 삭제)' 대체.
 */

/** 해당 레벨의 카드별 누적 오답 수. */
export function deriveFails(events: ReviewEvent[], lv: LevelKey): Record<string, number> {
  let fails: Record<string, number> = {};
  for (const e of events) {
    if (e.lv !== lv) continue;
    if (e.t === 'reset') { fails = {}; continue; }
    if (e.t === 'legacy' && e.card && e.fails > 0) fails[e.card] = (fails[e.card] ?? 0) + e.fails;
    else if (e.t === 'anki' && e.grade === 1) fails[e.card] = (fails[e.card] ?? 0) + 1;
  }
  return fails;
}

/** 로그의 마지막 학습 시각 (없으면 0). append-only라 마지막 이벤트가 최신이지만 안전하게 max. */
export function lastTs(events: ReviewEvent[]): number {
  let mx = 0;
  for (const e of events) if (e.ts > mx) mx = e.ts;
  return mx;
}

const LEVELS: readonly LevelKey[] = ['char', 'word', 'sentence', 'paragraph'];

/**
 * 로그 압축 — max를 넘으면 오래된 구간을 레벨·카드별 legacy 요약으로 접는다.
 * 파생값(deriveFails·lastTs)은 압축 전후 동일하다 (테스트로 보장).
 */
export function compact(events: ReviewEvent[], max = 4000, keep = 2000): ReviewEvent[] {
  if (events.length <= max) return events;
  const head = events.slice(0, events.length - keep);
  const tail = events.slice(events.length - keep);
  const headTs = lastTs(head);
  const summaries: ReviewEvent[] = [];
  for (const lv of LEVELS) {
    const fails = deriveFails(head, lv);
    // head 안의 reset은 파생에 반영됐고, tail의 reset은 요약 이후에 그대로 적용된다
    for (const [card, n] of Object.entries(fails)) {
      if (n > 0) summaries.push({ t: 'legacy', card, lv, ts: headTs, fails: n });
    }
  }
  return [...summaries, ...tail];
}
