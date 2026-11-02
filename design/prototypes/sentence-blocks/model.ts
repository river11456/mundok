import type { CardJSON } from '../../../src/types.ts';
import { alignReading, isHan, resolveReading } from '../../../src/reading-align.ts';

export interface BlockPosition { id: string; offset: number }
interface Piece { card: CardJSON; start: number; end: number }
const length = (card: CardJSON) => [...card.text].length;
const whole = (card: CardJSON): Piece => ({ card, start: 0, end: length(card) });

function position(cards: CardJSON[], point: BlockPosition): number {
  const index = cards.findIndex(card => card.id === point.id);
  if (index < 0 || !Number.isInteger(point.offset) || point.offset < 0 || point.offset > length(cards[index])) {
    throw new Error('유효하지 않은 문장 범위입니다.');
  }
  return index;
}

/** Rebuilt text invalidates annotation coordinates; retain originals as explicit references. */
function rebuild(pieces: Piece[]): CardJSON {
  const references: string[] = [];
  const readings: string[] = [];
  const texts: string[] = [];
  for (const { card, start, end } of pieces) {
    const source = [...card.text];
    const slice = source.slice(start, end);
    texts.push(slice.join(''));
    const alignment = alignReading(card.text, card.reading);
    const resolution = resolveReading(card.text, card.reading);
    const slots = new Map(resolution.cells.map(cell => [cell.textIndex, cell.value]));
    const certain = resolution.status === 'ready' && !resolution.overflow;
    readings.push(slice.map((ch, i) => isHan(ch)
      ? alignment?.[start + i] || (certain ? slots.get(start + i) : '') || '·'
      : ch).join(''));
    const reference = [
      card.meaning && `해석: ${card.meaning}`,
      card.note && `메모: ${card.note}`,
      !certain && card.reading && `원래 독음 (배치 확인 필요): ${card.reading}`,
      card.grammar?.length && `문법 주석: ${JSON.stringify(card.grammar)}`,
      card.interp?.length && `해석 순서: ${JSON.stringify(card.interp)}`,
    ].filter(Boolean);
    if (reference.length) {
      const label = start !== 0 || end !== source.length ? '분리 전 참고' : '변경 전 참고';
      references.push(`[${label} · ${card.id}] ${card.text}\n${reference.join('\n')}`);
    }
  }
  const { grammar: _grammar, interp: _interp, ...metadata } = pieces[0].card;
  return {
    ...metadata,
    id: `block-${crypto.randomUUID()}`,
    text: texts.join(''),
    reading: readings.join(''),
    meaning: '',
    note: references.join('\n\n'),
    editedAt: Date.now(),
  };
}

export function mergeBlocks(cards: CardJSON[], ids: string[]): CardJSON[] {
  if (ids.length < 2 || new Set(ids).size !== ids.length) throw new Error('연속된 블록을 두 개 이상 선택하세요.');
  const indices = ids.map(id => position(cards, { id, offset: 0 })).sort((a, b) => a - b);
  if (indices.some((index, i) => index !== indices[0] + i)) throw new Error('연속된 블록만 합칠 수 있습니다.');
  const first = indices[0];
  return [...cards.slice(0, first), rebuild(cards.slice(first, first + ids.length).map(whole)), ...cards.slice(first + ids.length)];
}

/** Offsets count Unicode codepoints, matching the existing reading/interpretation model. */
export function designateRange(cards: CardJSON[], start: BlockPosition, end: BlockPosition): CardJSON[] {
  const first = position(cards, start);
  const last = position(cards, end);
  if (first > last || (first === last && start.offset >= end.offset)) throw new Error('빈 범위 또는 역방향 범위입니다.');
  const selected = cards.slice(first, last + 1).map((card, i, subset) => ({
    card, start: i === 0 ? start.offset : 0, end: i === subset.length - 1 ? end.offset : length(card),
  })).filter(piece => piece.start < piece.end);
  if (!selected.length) throw new Error('빈 범위입니다.');
  const materialize = (pieces: Piece[]) => pieces.length === 1 && pieces[0].start === 0 && pieces[0].end === length(pieces[0].card)
    ? pieces[0].card : rebuild(pieces);
  const replacement: CardJSON[] = [];
  if (start.offset > 0) replacement.push(materialize([{ card: cards[first], start: 0, end: start.offset }]));
  replacement.push(materialize(selected));
  if (end.offset < length(cards[last])) replacement.push(materialize([{ card: cards[last], start: end.offset, end: length(cards[last]) }]));
  return [...cards.slice(0, first), ...replacement, ...cards.slice(last + 1)];
}

/** toIndex is the insertion slot in the original array, before removing the moving block. */
export function moveBlock(cards: CardJSON[], id: string, toIndex: number): CardJSON[] {
  const from = position(cards, { id, offset: 0 });
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex > cards.length) throw new Error('유효하지 않은 이동 위치입니다.');
  const result = cards.slice();
  const [card] = result.splice(from, 1);
  result.splice(toIndex > from ? toIndex - 1 : toIndex, 0, card);
  return result;
}

export function insertBlock(cards: CardJSON[], index: number, text: string): CardJSON[] {
  if (!Number.isInteger(index) || index < 0 || index > cards.length || !text.trim()) throw new Error('본문과 추가 위치를 확인하세요.');
  const card: CardJSON = { id: `block-${crypto.randomUUID()}`, text, reading: '', meaning: '', note: '', editedAt: Date.now() };
  return [...cards.slice(0, index), card, ...cards.slice(index)];
}
