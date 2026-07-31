import type { InterpChunk } from './types';

// ── 해석 순서(interp) 순수 로직 — 렌더러·편집·lint 공용 ─────────────
//   청크 좌표는 grammar 와 동일하게 text 의 코드포인트 인덱스 [start, end).
//   배열 순서가 곧 해석 순서다. 겹침 금지, 전체 커버는 강제하지 않는다(현토·부호 제외 가능).

/** 청크 배열 검증 — 문제 있으면 메시지, 정상이면 null. */
export function interpError(text: string, chunks: InterpChunk[]): string | null {
  const len = [...text].length;
  for (const c of chunks) {
    const ok = Number.isInteger(c.start) && Number.isInteger(c.end)
      && c.start >= 0 && c.start < c.end && c.end <= len;
    if (!ok) return `인덱스 범위 이상 start=${c.start} end=${c.end} (len=${len})`;
  }
  const sorted = [...chunks].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].end > sorted[i].start) {
      return `청크 겹침 [${sorted[i - 1].start},${sorted[i - 1].end}) ↔ [${sorted[i].start},${sorted[i].end})`;
    }
  }
  return null;
}

/**
 * 편집 토글 — 드래그 범위가 기존 청크와 겹치면 그 청크들을 제거(순번 재압축은
 * 배열 순서가 곧 순번이라 자동), 겹치지 않으면 맨 뒤(다음 순번)에 추가한다.
 */
export function toggleChunk(chunks: InterpChunk[], start: number, end: number): InterpChunk[] {
  const rest = chunks.filter(c => !(c.start < end && c.end > start));
  if (rest.length < chunks.length) return rest;
  return [...chunks, { start, end }];
}
