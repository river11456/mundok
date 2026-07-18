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
