import type { CardJSON, GrammarAnnotation, InterpChunk, BlockReference, HyeontoData, HyeontoMark } from './types.ts';
import { alignReading, isHan, resolveReading, readingFromDraftCells } from './reading-align.ts';

export interface BlockPosition { id: string; offset: number }
export type { BlockReference, HyeontoData, HyeontoMark } from './types.ts';
const hangul = /^[\p{Script=Hangul}]+$/u;

/** Offsets count original Unicode codepoints; a mark belongs to the preceding Han. */
function checkedHyeonto(data: HyeontoData): HyeontoData {
  if (!data || typeof data.original !== 'string' || !Array.isArray(data.marks)) throw new Error('현토와 원문을 확인하세요.');
  const original = [...data.original];
  const offsets = new Set<number>();
  const marks = data.marks.map(mark => {
    if (!mark || !Number.isInteger(mark.offset) || mark.offset < 1 || mark.offset > original.length
      || !isHan(original[mark.offset - 1]) || typeof mark.text !== 'string' || !hangul.test(mark.text)
      || (mark.unconfirmed !== undefined && mark.unconfirmed !== true) || offsets.has(mark.offset)) throw new Error('현토는 한자 뒤에 한글로 입력하세요.');
    offsets.add(mark.offset);
    return { offset: mark.offset, text: mark.text, ...(mark.unconfirmed ? { unconfirmed: true as const } : {}) };
  }).sort((a, b) => a.offset - b.offset);
  return { original: data.original, marks };
}

function hyeontoLayout(data: HyeontoData) {
  const normalized = checkedHyeonto(data);
  const marks = new Map(normalized.marks.map(mark => [mark.offset, mark.text]));
  const originals: number[] = [];
  const spans: { offset: number; text: string; start: number; end: number }[] = [];
  let text = '';
  let index = 0;
  [...normalized.original].forEach((ch, i) => {
    originals.push(index++);
    text += ch;
    const mark = marks.get(i + 1);
    if (mark) {
      const start = index;
      index += [...mark].length;
      spans.push({ offset: i + 1, text: mark, start, end: index });
      text += mark;
    }
  });
  return { text, originals, spans };
}

export function composeHyeonto(data: HyeontoData): string { return hyeontoLayout(data).text; }

/** Metadata is active only while it reconstructs the editor's current text exactly. */
export function getHyeonto(card: CardJSON): HyeontoData | null {
  if (!card.hyeonto) return null;
  try {
    const data = checkedHyeonto(card.hyeonto);
    return composeHyeonto(data) === card.text ? data : null;
  } catch { return null; }
}

/** A suggestion only: callers must obtain explicit confirmation before persisting it. */
export function suggestHyeonto(card: CardJSON): HyeontoData {
  const confirmed = getHyeonto(card);
  if (confirmed) return confirmed;
  const chars = [...card.text];
  const original: string[] = [];
  const marks: HyeontoMark[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    original.push(ch);
    if (!isHan(ch) || !hangul.test(chars[i + 1] ?? '')) continue;
    let text = '';
    while (i + 1 < chars.length && hangul.test(chars[i + 1])) text += chars[++i];
    marks.push({ offset: original.length, text });
  }
  return { original: original.join(''), marks };
}

/** Display legacy candidates consistently without confirming or changing stored text. */
export function hyeontoSegments(card: CardJSON): { text: string; kind: 'original' | 'hyeonto' }[] {
  const data = getHyeonto(card) ?? suggestHyeonto(card);
  const layout = hyeontoLayout(data);
  const chars = [...card.text];
  const segments: { text: string; kind: 'original' | 'hyeonto' }[] = [];
  let start = 0;
  for (const span of layout.spans) {
    if (span.start > start) segments.push({ text: chars.slice(start, span.start).join(''), kind: 'original' });
    segments.push({ text: span.text, kind: 'hyeonto' });
    start = span.end;
  }
  if (start < chars.length) segments.push({ text: chars.slice(start).join(''), kind: 'original' });
  return segments;
}

/** Keep conjoining jamo together while retaining the composed text's codepoint offsets. */
export function hyeontoDisplayCells(text: string, indices?: ReadonlySet<number>) {
  const chars = [...text];
  const cells: { text: string; start: number; last: number }[] = [];
  const syllable = /^[\u1100-\u115f\ua960-\ua97c]+[\u1160-\u11a7\ud7b0-\ud7c6]+[\u11a8-\u11ff\ud7cb-\ud7fb]*/u;
  for (let start = 0; start < chars.length;) {
    const char = chars[start];
    let cell = char;
    if (indices?.has(start) && /^[\u1100-\u115f\ua960-\ua97c]$/u.test(char)) {
      let end = start + 1;
      while (end < chars.length && indices.has(end)) end++;
      cell = syllable.exec(chars.slice(start, end).join(''))?.[0] ?? char;
    }
    const last = start + [...cell].length - 1;
    cells.push({ text: cell, start, last });
    start = last + 1;
  }
  return cells;
}

/** The optional baseline is the user-reviewed separation before editing its marks. */
export function setHyeonto(card: CardJSON, input: HyeontoData, baseline?: HyeontoData): CardJSON {
  const checked = checkedHyeonto(input);
  const data: HyeontoData = { original: checked.original, marks: checked.marks.map(({ offset, text }) => ({ offset, text })) };
  const next = hyeontoLayout(data);
  if (next.text === card.text) return { ...card, hyeonto: data, editedAt: Date.now() };
  const oldData = baseline ?? getHyeonto(card)
    ?? (card.text === data.original ? { original: card.text, marks: [] } : suggestHyeonto(card));
  if (oldData.original !== data.original || composeHyeonto(oldData) !== card.text) {
    throw new Error('원문이 달라졌습니다. 현토 편집을 다시 열어 확인하세요.');
  }
  const old = hyeontoLayout(oldData);
  const reading = resolveReading(card.text, card.reading);
  if (reading.status !== 'ready' || reading.overflow) {
    throw new Error('기존 독음의 배치를 먼저 확인한 뒤 현토를 편집하세요.');
  }
  const mapSpan = <T extends { start: number; end: number }>(span: T): T | null => {
    const indices = old.originals.flatMap((index, i) => index >= span.start && index < span.end ? [next.originals[i]] : []);
    for (const mark of old.spans) {
      if (mark.end <= span.start || mark.start >= span.end) continue;
      const replacement = next.spans.find(value => value.offset === mark.offset);
      if (replacement) indices.push(replacement.start, replacement.end - 1);
    }
    return indices.length ? { ...span, start: Math.min(...indices), end: Math.max(...indices) + 1 } : null;
  };
  const anchorChanged = !!card.blockDerived && card.blockDerived.text !== card.text;
  const references = (card.blockReferences ?? []).map(reference => ({ ...reference,
    needsReview: reference.needsReview || anchorChanged || reference.spans.some(span => !mapSpan(span)),
    spans: anchorChanged ? [{ start: 0, end: [...next.text].length }]
      : reference.spans.flatMap(span => { const mapped = mapSpan(span); return mapped ? [mapped] : [{ start: 0, end: [...next.text].length }]; }),
  }));
  const transfer = <T extends { start: number; end: number }>(entries: T[], baselineEntries: T[] | undefined, kind: 'grammar' | 'interp'): T[] => {
    const key = (entry: T) => JSON.stringify([entry.start, entry.end, 'type' in entry ? entry.type : null]);
    const previous = new Set((baselineEntries ?? []).map(key));
    const result: T[] = [];
    const uncertain = new Map<string, T[]>();
    for (const entry of entries) {
      const stale = anchorChanged && (baselineEntries === undefined || previous.has(key(entry)));
      const mapped = stale ? null : mapSpan(entry);
      if (mapped) result.push(mapped);
      else {
        const text = stale && baselineEntries !== undefined ? card.blockDerived!.text : card.text;
        uncertain.set(text, [...(uncertain.get(text) ?? []), entry]);
      }
    }
    for (const [text, archived] of uncertain) {
      const snapshot = { sourceId: card.id, text,
        reading: text === card.text ? card.reading : '', meaning: '', note: '',
        grammar: kind === 'grammar' ? archived as unknown as GrammarAnnotation[] : [],
        interp: kind === 'interp' ? archived : [],
      };
      references.push({ ...snapshot, id: JSON.stringify(snapshot), needsReview: true,
        spans: [{ start: 0, end: [...next.text].length }] });
    }
    return result;
  };
  const grammar = transfer(card.grammar ?? [], card.blockDerived?.grammar, 'grammar');
  const interp = transfer(card.interp ?? [], card.blockDerived?.interp, 'interp');
  return { ...card, text: next.text, hyeonto: data,
    reading: card.reading ? readingFromDraftCells(reading.cells.map(cell => cell.value), next.text) : '',
    grammar: grammar.length ? grammar : undefined, interp: interp.length ? interp : undefined,
    blockReferences: references,
    blockDerived: { text: next.text, meaning: card.meaning, note: card.note, grammar, interp },
    editedAt: Date.now(),
  };
}

function snapHyeonto(card: CardJSON, offset: number): number {
  const data = getHyeonto(card) ?? suggestHyeonto(card);
  return hyeontoLayout(data).spans.find(span => offset >= span.start && offset < span.end)?.end ?? offset;
}

function pieceHyeonto({ card, start, end }: Piece): HyeontoData {
  const active = getHyeonto(card);
  const suggested = active ?? suggestHyeonto(card);
  const data: HyeontoData = active ?? { ...suggested, marks: suggested.marks.map(mark => ({ ...mark, unconfirmed: true })) };
  const layout = hyeontoLayout(data);
  const source = [...data.original];
  const original: string[] = [];
  const marks: HyeontoMark[] = [];
  layout.originals.forEach((index, i) => {
    if (index < start || index >= end) return;
    original.push(source[i]);
    const mark = layout.spans.find(span => span.offset === i + 1);
    if (mark && mark.start >= start && mark.end <= end) marks.push({ ...data.marks.find(value => value.offset === i + 1)!, offset: original.length });
  });
  return { original: original.join(''), marks };
}

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

/** Sentence-wide notes stay on the first fragment; ranged annotations follow their characters. */
function rebuild(pieces: Piece[]): CardJSON {
  const references = new Map<string, BlockReference>();
  const readings: string[] = [];
  const texts: string[] = [];
  const meanings: string[] = [];
  const notes: string[] = [];
  const grammar: GrammarAnnotation[] = [];
  const interp: InterpChunk[] = [];
  const hyeonto: HyeontoData = { original: '', marks: [] };
  const hasHyeonto = pieces.some(piece => getHyeonto(piece.card));
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
    const separated = pieceHyeonto({ card, start, end });
    const originalOffset = [...hyeonto.original].length;
    hyeonto.original += separated.original;
    hyeonto.marks.push(...separated.marks.map(mark => ({ ...mark, offset: mark.offset + originalOffset })));
    if (start === 0) {
      if (card.meaning) meanings.push(card.meaning);
      if (card.note) notes.push(card.note);
    }
    const anchorChanged = !!card.blockDerived && card.blockDerived.text !== card.text;
    const alignment = alignReading(card.text, card.reading);
    const resolution = resolveReading(card.text, card.reading);
    const slots = new Map(resolution.cells.map(cell => [cell.textIndex, cell.value]));
    const certain = resolution.status === 'ready' && !resolution.overflow;
    if (card.reading.trim() && !certain) {
      throw new Error('기존 독음의 배치를 먼저 확인한 뒤 문장을 나누거나 합치세요.');
    }
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
    const grammarParts = partition(card.grammar ?? [], card.blockDerived?.grammar);
    const interpParts = partition(card.interp ?? [], card.blockDerived?.interp);
    transfer(grammarParts.current, grammar);
    transfer(interpParts.current, interp);
    // Older generated cards lack a baseline. Preserve their uncertain ranges against
    // current text rather than pretending a newly authored range used the old text.
    for (const kind of ['grammar', 'interp'] as const) {
      const staleGrammar = kind === 'grammar' ? grammarParts.uncertain : [];
      const staleInterp = kind === 'interp' ? interpParts.uncertain : [];
      if (!staleGrammar.length && !staleInterp.length) continue;
      const snapshot = { sourceId: card.id,
        text: card.blockDerived?.[kind] !== undefined ? card.blockDerived!.text : card.text,
        reading: '', meaning: '', note: '', grammar: staleGrammar, interp: staleInterp };
      retain({ ...snapshot, id: JSON.stringify(snapshot), needsReview: true,
        spans: [{ start: offset, end: offset + slice.length }] });
    }
    for (const reference of card.blockReferences ?? []) {
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
    id: pieces[0].start === 0 ? pieces[0].card.id : `block-${crypto.randomUUID()}`,
    text, reading: readings.join(''), meaning, note,
    hyeonto: hasHyeonto ? hyeonto : undefined,
    grammar: grammar.length ? grammar : undefined,
    interp: interp.length ? interp : undefined,
    blockReferences: [...references.values()],
    blockDerived: { text, meaning, note, grammar: grammar.map(entry => ({ ...entry })), interp: interp.map(entry => ({ ...entry })) },
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
  start = { ...start, offset: snapHyeonto(cards[first], start.offset) };
  end = { ...end, offset: snapHyeonto(cards[last], end.offset) };
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
