/**
 * 독음 정렬 — 한자에만 1:1로 음을 붙인다 (design/char-cell.md R4·R5).
 *
 * text의 비한자 글자(현토·공백·문장부호)는 음 없이 통과하고, reading에 같은
 * 글자가 그대로 있으면(현토·공백 미러링) 함께 소비한다. reading에만 있는
 * 여분 공백·부호는 무시한다. 한자 수와 대응 음절 수가 실제로 다르면 null
 * (데이터 오류 — 렌더러는 카드 아래 한 줄로 폴백, lint가 경고).
 *
 * 렌더러(render.ts)와 lint(scripts/lint-data.mjs)가 같은 구현을 공유한다.
 */

const HAN    = /\p{Script=Han}/u;
const HANGUL = /[가-힣]/;

export const isHan = (ch: string): boolean => HAN.test(ch);

export interface ReadingDraftCell {
  ch: string;
  textIndex: number;
  value: string;
}

export interface ReadingDraft {
  cells: ReadingDraftCell[];
  overflow: string;
}

/**
 * text 각 코드포인트의 독음 음절 배열(비한자는 null)을 반환.
 * 정렬 불가능하면 null.
 */
export function alignReading(text: string, reading: string): (string | null)[] | null {
  if (!reading) return null;
  const T = [...text];
  const R = [...reading];
  const out: (string | null)[] = [];
  let j = 0;

  for (const t of T) {
    if (HAN.test(t)) {
      while (j < R.length && R[j] === ' ') j++;          // 독음 쪽 여분 공백 허용
      if (j < R.length && HANGUL.test(R[j])) { out.push(R[j]); j++; }
      else return null;                                  // 한자에 대응할 음절 없음
    } else {
      if (j < R.length && R[j] === t) j++;               // 현토·공백·부호 미러링 소비
      out.push(null);
    }
  }
  while (j < R.length && !HANGUL.test(R[j])) j++;        // 꼬리 공백·부호 허용
  return j === R.length ? out : null;                    // 남은 음절 = 독음 초과(오류)
}

/**
 * 편집 중 독음을 한자별 칸으로 느슨하게 분배한다.
 * 완성되지 않은 독음도 정상적인 draft로 다루며, text의 현토가 reading에 그대로
 * 들어 있으면 소비한다. 모든 한자 칸 뒤에 남은 한글 음절은 overflow로 돌려준다.
 */
export function readingDraftFromText(text: string, reading: string): ReadingDraft {
  const T = [...text];
  const R = [...reading];
  const cells: ReadingDraftCell[] = [];
  let j = 0;

  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (!HAN.test(t)) {
      while (j < R.length && R[j] === ' ' && t !== ' ') j++;
      if (j < R.length && R[j] === t) j++;
      continue;
    }

    if (j < R.length && R[j] === '·') {
      j++;
      cells.push({ ch: t, textIndex: i, value: '' });
      continue;
    }
    while (j < R.length && !HANGUL.test(R[j])) j++;
    const value = j < R.length ? R[j++] : '';
    cells.push({ ch: t, textIndex: i, value });
  }

  const overflow = R.slice(j).filter(ch => HANGUL.test(ch)).join('');
  return { cells, overflow };
}

/** 한자별 draft를 기존 Card.reading 문자열로 직렬화한다. */
export function readingFromDraftCells(values: string[]): string {
  const normalized = values.map(value => [...value.trim()].find(ch => HANGUL.test(ch)) ?? '');
  let lastFilled = -1;
  for (let i = normalized.length - 1; i >= 0; i--) {
    if (normalized[i]) { lastFilled = i; break; }
  }
  if (lastFilled < 0) return '';
  return normalized.slice(0, lastFilled + 1).map(value => value || '·').join('');
}
