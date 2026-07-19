/**
 * 붙여넣은 원문 → 카드 텍스트 분할 (문헌 추가 마법사).
 * 규칙이 예측 가능해야 사용자가 분할점을 제어할 수 있다:
 *   - 줄바꿈이 있으면 **줄 단위로만** 나눈다 (한 줄 = 한 카드 — 수동 제어 수단)
 *   - 줄바꿈이 없으면 종결 부호(。！？!?) 뒤에서 나누고, 닫는 인용부호는 앞 문장에 붙인다
 */

const ENDERS  = '。！？!?';
const CLOSERS = '」』》〉"\'”’）)]';

export function splitClassical(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  if (text.includes('\n')) {
    return text.split('\n').map(s => s.trim()).filter(Boolean);
  }

  const out: string[] = [];
  const chars = [...text];
  let cur = '';
  for (let i = 0; i < chars.length; i++) {
    cur += chars[i];
    if (ENDERS.includes(chars[i])) {
      while (i + 1 < chars.length && CLOSERS.includes(chars[i + 1])) cur += chars[++i];
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
