export interface DrillCandidate {
  id:    string;
  front: string;
  back:  string;
}

export interface DrillSpan {
  start: number;
  end:   number;
  id:    string;
  front: string;
  back:  string;
}

/**
 * text 안에서 하위 레벨 카드(candidates)의 자동 드릴다운 매칭 구간을 찾는다.
 * 긴 텍스트 우선(longest-first) · 비중첩(non-overlapping) 그리디 매칭.
 * tokenizeHighlights / annotatedFront / renderGrammarSentence(표시 모드) 세 렌더러가 공유하던
 * 동일 알고리즘의 단일 출처(render.ts 3중 복제 해소).
 */
export function findDrillSpans(text: string, candidates: DrillCandidate[]): DrillSpan[] {
  const sorted  = [...candidates].sort((a, b) => b.front.length - a.front.length);
  const covered = new Set<number>();
  const spans: DrillSpan[] = [];

  for (const c of sorted) {
    let pos = 0;
    while (pos < text.length) {
      const idx = text.indexOf(c.front, pos);
      if (idx === -1) break;
      const end = idx + c.front.length;
      if (![...c.front].some((_, k) => covered.has(idx + k))) {
        spans.push({ start: idx, end, id: c.id, front: c.front, back: c.back });
        for (let k = idx; k < end; k++) covered.add(k);
      }
      pos = idx + 1;
    }
  }

  spans.sort((a, b) => a.start - b.start);
  return spans;
}

/** 구간의 시작 인덱스 → span. (annotatedFront처럼 구간 단위로 건너뛰며 순회할 때 사용) */
export function spansByStart(spans: DrillSpan[]): Map<number, DrillSpan> {
  return new Map(spans.map(s => [s.start, s]));
}

/** 구간에 포함된 모든 글자 인덱스 → span. (renderGrammarSentence처럼 글자 단위 상태 기계에서 사용) */
export function spansByIndex(spans: DrillSpan[]): Map<number, DrillSpan> {
  const map = new Map<number, DrillSpan>();
  for (const s of spans) for (let k = s.start; k < s.end; k++) map.set(k, s);
  return map;
}
