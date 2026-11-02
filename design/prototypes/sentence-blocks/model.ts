import type { CardJSON, GrammarAnnotation, InterpChunk } from '../../../src/types.ts';
import { alignReading, isHan, resolveReading } from '../../../src/reading-align.ts';

export interface BlockPosition { id: string; offset: number }
export interface BlockReference {
  id: string;
  sourceId: string;
  text: string;
  reading: string;
  meaning: string;
  note: string;
  grammar: GrammarAnnotation[];
  interp: InterpChunk[];
  needsReview: boolean;
  spans: { start: number; end: number }[];
}
export interface PrototypeCard extends CardJSON {
  pbReferences?: BlockReference[];
  pbLegacyNotesMigrated?: boolean;
  // Generated fields are not new user notes; text also anchors local reference spans.
  pbDerived?: { text: string; meaning: string; note: string; grammar?: GrammarAnnotation[]; interp?: InterpChunk[] };
}
/** One-time conversion of the previous prototype's shared note references. */
export function migrateLegacyNotes(cards: PrototypeCard[]): PrototypeCard[] {
  const result = cards.slice();
  const handled = new Set(cards.filter(card => card.pbLegacyNotesMigrated)
    .flatMap(card => (card.pbReferences ?? []).map(reference => reference.id)));
  const contains = (value: string, part: string) => (`\n\n${value}\n\n`).includes(`\n\n${part}\n\n`);
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (card.pbLegacyNotesMigrated || !card.pbReferences?.some(ref => ref.meaning || ref.note)) continue;
    let updated = { ...result[i], pbLegacyNotesMigrated: true };
    for (const reference of card.pbReferences) {
      if (handled.has(reference.id)) continue;
      handled.add(reference.id);
      for (const field of ['meaning', 'note'] as const) {
        const content = reference[field];
        if (!content) continue;
        const alreadyActive = result.some(candidate => candidate.pbReferences?.some(ref => ref.id === reference.id)
          && contains(candidate[field], content));
        if (!alreadyActive) updated = { ...updated, [field]: [updated[field], content].filter(Boolean).join('\n\n') };
      }
      result[i] = updated;
    }
    result[i] = updated;
  }
  return result;
}

interface Piece { card: PrototypeCard; start: number; end: number }
const length = (card: CardJSON) => [...card.text].length;
const whole = (card: CardJSON): Piece => ({ card, start: 0, end: length(card) });

function position(cards: PrototypeCard[], point: BlockPosition): number {
  const index = cards.findIndex(card => card.id === point.id);
  if (index < 0 || !Number.isInteger(point.offset) || point.offset < 0 || point.offset > length(cards[index])) {
    throw new Error('유효하지 않은 문장 범위입니다.');
  }
  return index;
}

/** Sentence-wide notes stay on the first fragment; ranged annotations follow their characters. */
function rebuild(pieces: Piece[]): PrototypeCard {
  const references = new Map<string, BlockReference>();
  const readings: string[] = [];
  const texts: string[] = [];
  const meanings: string[] = [];
  const notes: string[] = [];
  const grammar: GrammarAnnotation[] = [];
  const interp: InterpChunk[] = [];
  let offset = 0;
  const retain = (reference: BlockReference) => {
    const existing = references.get(reference.id);
    if (existing) {
      existing.needsReview ||= reference.needsReview;
      existing.spans.push(...reference.spans);
    } else references.set(reference.id, { ...reference, spans: [...reference.spans] });
  };
  for (const { card, start, end } of pieces) {
    const source = [...card.text];
    const slice = source.slice(start, end);
    texts.push(slice.join(''));
    if (start === 0) {
      if (card.meaning) meanings.push(card.meaning);
      if (card.note) notes.push(card.note);
    }
    const anchorChanged = !!card.pbDerived && card.pbDerived.text !== card.text;
    const alignment = alignReading(card.text, card.reading);
    const resolution = resolveReading(card.text, card.reading);
    const slots = new Map(resolution.cells.map(cell => [cell.textIndex, cell.value]));
    const certain = resolution.status === 'ready' && !resolution.overflow;
    readings.push(slice.map((ch, i) => isHan(ch)
      ? alignment?.[start + i] || (certain ? slots.get(start + i) : '') || '·'
      : ch).join(''));

    let crossing = false;
    const crossingSpans: { start: number; end: number }[] = [];
    const transfer = <T extends { start: number; end: number }>(entries: T[], target: T[]) => {
      for (const entry of entries) {
        if (entry.end <= start || entry.start >= end) continue;
        const clipped = { start: Math.max(entry.start, start) - start + offset, end: Math.min(entry.end, end) - start + offset };
        target.push({ ...entry, ...clipped });
        if (entry.start < start || entry.end > end) {
          crossing = true;
          crossingSpans.push(clipped);
        }
      }
    };
    const partition = <T extends { start: number; end: number }>(entries: T[], baseline: T[] | undefined) => {
      if (!anchorChanged) return { current: entries, uncertain: [] as T[] };
      if (baseline === undefined) return { current: [] as T[], uncertain: entries };
      const key = (entry: T) => JSON.stringify([entry.start, entry.end, 'type' in entry ? entry.type : null]);
      const previous = new Set(baseline.map(key));
      return { current: entries.filter(entry => !previous.has(key(entry))),
        uncertain: entries.filter(entry => previous.has(key(entry))) };
    };
    const grammarParts = partition(card.grammar ?? [], card.pbDerived?.grammar);
    const interpParts = partition(card.interp ?? [], card.pbDerived?.interp);
    transfer(grammarParts.current, grammar);
    transfer(interpParts.current, interp);
    // Older generated cards lack a baseline. Preserve their uncertain ranges against
    // current text rather than pretending a newly authored range used the old text.
    for (const kind of ['grammar', 'interp'] as const) {
      const staleGrammar = kind === 'grammar' ? grammarParts.uncertain : [];
      const staleInterp = kind === 'interp' ? interpParts.uncertain : [];
      if (!staleGrammar.length && !staleInterp.length) continue;
      const snapshot = { sourceId: card.id,
        text: card.pbDerived?.[kind] !== undefined ? card.pbDerived!.text : card.text,
        reading: '', meaning: '', note: '', grammar: staleGrammar, interp: staleInterp };
      retain({ ...snapshot, id: JSON.stringify(snapshot), needsReview: true,
        spans: [{ start: offset, end: offset + slice.length }] });
    }
    for (const reference of card.pbReferences ?? []) {
      const spans = anchorChanged ? [{ start: offset, end: offset + slice.length }]
        : reference.spans.flatMap(span => {
          const left = Math.max(span.start, start);
          const right = Math.min(span.end, end);
          return left < right ? [{ start: left - start + offset, end: right - start + offset }] : [];
        });
      if (spans.length) retain({ ...reference, spans, needsReview: reference.needsReview || anchorChanged || (!!(reference.meaning || reference.note) && reference.spans.some(span => span.start < start || span.end > end)) });
    }
    if (crossing || (!certain && !!card.reading)) {
      const snapshot = {
        sourceId: card.id, text: card.text, reading: card.reading,
        meaning: '', note: '',
        grammar: grammarParts.current, interp: interpParts.current,
      };
      retain({ ...snapshot, id: JSON.stringify(snapshot), needsReview: crossing || (!certain && !!card.reading),
        spans: !certain && !!card.reading
          ? [{ start: offset, end: offset + slice.length }] : crossingSpans });
    }
    offset += slice.length;
  }
  const text = texts.join('');
  const meaning = meanings.join('\n\n');
  const note = notes.join('\n\n');
  return {
    ...pieces[0].card,
    id: `block-${crypto.randomUUID()}`,
    text, reading: readings.join(''), meaning, note,
    grammar: grammar.length ? grammar : undefined,
    interp: interp.length ? interp : undefined,
    pbReferences: [...references.values()],
    pbLegacyNotesMigrated: true,
    pbDerived: { text, meaning, note, grammar: grammar.map(entry => ({ ...entry })), interp: interp.map(entry => ({ ...entry })) },
    editedAt: Date.now(),
  };
}

export function mergeBlocks(cards: PrototypeCard[], ids: string[]): PrototypeCard[] {
  if (ids.length < 2 || new Set(ids).size !== ids.length) throw new Error('연속된 블록을 두 개 이상 선택하세요.');
  const indices = ids.map(id => position(cards, { id, offset: 0 })).sort((a, b) => a - b);
  if (indices.some((index, i) => index !== indices[0] + i)) throw new Error('연속된 블록만 합칠 수 있습니다.');
  const first = indices[0];
  return [...cards.slice(0, first), rebuild(cards.slice(first, first + ids.length).map(whole)), ...cards.slice(first + ids.length)];
}

/** Offsets count Unicode codepoints, matching the existing reading/interpretation model. */
export function designateRange(cards: PrototypeCard[], start: BlockPosition, end: BlockPosition): PrototypeCard[] {
  const first = position(cards, start);
  const last = position(cards, end);
  if (first > last || (first === last && start.offset >= end.offset)) throw new Error('빈 범위 또는 역방향 범위입니다.');
  const selected = cards.slice(first, last + 1).map((card, i, subset) => ({
    card, start: i === 0 ? start.offset : 0, end: i === subset.length - 1 ? end.offset : length(card),
  })).filter(piece => piece.start < piece.end);
  if (!selected.length) throw new Error('빈 범위입니다.');
  const materialize = (pieces: Piece[]) => pieces.length === 1 && pieces[0].start === 0 && pieces[0].end === length(pieces[0].card)
    ? pieces[0].card : rebuild(pieces);
  const replacement: PrototypeCard[] = [];
  if (start.offset > 0) replacement.push(materialize([{ card: cards[first], start: 0, end: start.offset }]));
  replacement.push(materialize(selected));
  if (end.offset < length(cards[last])) replacement.push(materialize([{ card: cards[last], start: end.offset, end: length(cards[last]) }]));
  return [...cards.slice(0, first), ...replacement, ...cards.slice(last + 1)];
}

/** toIndex is the insertion slot in the original array, before removing the moving block. */
export function moveBlock(cards: PrototypeCard[], id: string, toIndex: number): PrototypeCard[] {
  const from = position(cards, { id, offset: 0 });
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex > cards.length) throw new Error('유효하지 않은 이동 위치입니다.');
  const result = cards.slice();
  const [card] = result.splice(from, 1);
  result.splice(toIndex > from ? toIndex - 1 : toIndex, 0, card);
  return result;
}

export function insertBlock(cards: PrototypeCard[], index: number, text: string): PrototypeCard[] {
  if (!Number.isInteger(index) || index < 0 || index > cards.length || !text.trim()) throw new Error('본문과 추가 위치를 확인하세요.');
  const card: CardJSON = { id: `block-${crypto.randomUUID()}`, text, reading: '', meaning: '', note: '', editedAt: Date.now() };
  return [...cards.slice(0, index), card, ...cards.slice(index)];
}
