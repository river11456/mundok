/** Shared reading decoder for the editor, review rendering, and catalog lint. */
const HAN = /\p{Script=Han}/u;
const HANGUL = /^[가-힣]$/;

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

export interface ReadingCandidate {
  label: string;
  values: string[];
  overflow: string;
}

export interface ReadingResolution extends ReadingDraft {
  status: 'ready' | 'ambiguous' | 'unresolved';
  candidates: ReadingCandidate[];
}

/** NFC syllables and explicit blank slots; whitespace and other punctuation separate them. */
export function readingTokens(raw: string): string[] {
  return [...raw.normalize('NFC')].filter(ch => HANGUL.test(ch) || ch === '·');
}

interface MirroredReading {
  values: string[];
  overflow: string;
  complete: boolean;
  valid: boolean;
  matchedLiteral: boolean;
}

/**
 * Parse only the full mirrored convention. A Hangul 토 run is atomic: a partial
 * match never consumes a syllable. EOF can represent omitted trailing slots.
 * There is no per-run choice/backtracking, even for very long sentences.
 */
function mirroredReading(source: string[], tokens: string[], allowOmittedLiterals = false): MirroredReading {
  const values: string[] = [];
  let j = 0;
  let complete = true;
  let matchedLiteral = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (isHan(ch)) {
      if (j < tokens.length) {
        values.push(tokens[j] === '·' ? '' : tokens[j]);
        j++;
      } else {
        values.push('');
        complete = false;
      }
    } else if (HANGUL.test(ch) || ch === '·') {
      const literal = [ch];
      if (HANGUL.test(ch)) {
        while (i + 1 < source.length && HANGUL.test(source[i + 1])) literal.push(source[++i]);
      }
      if (j === tokens.length) {
        complete = false;
        continue;
      }
      if (!literal.every((part, offset) => tokens[j + offset] === part)) {
        if (allowOmittedLiterals) continue;
        return { values, overflow: '', complete: false, valid: false, matchedLiteral };
      }
      j += literal.length;
      matchedLiteral = true;
    }
  }
  return { values, overflow: tokens.slice(j).join(''), complete, valid: true, matchedLiteral };
}

/**
 * Legacy strings can contain only Han readings or include the source's 토 and
 * punctuation. Keep both interpretations when they disagree. An exact complete
 * mirrored form takes precedence over an overflowing pure-slot interpretation;
 * this makes all new source-aware saves round-trip without an added schema field.
 */
export function resolveReading(text: string, reading: string): ReadingResolution {
  const source = [...text];
  const cells: ReadingDraftCell[] = [];
  source.forEach((ch, textIndex) => {
    if (isHan(ch)) cells.push({ ch, textIndex, value: '' });
  });
  const tokens = readingTokens(reading);
  const pure: ReadingCandidate = {
    label: '한자 독음만 입력한 배치',
    values: cells.map((_, i) => tokens[i] === '·' ? '' : tokens[i] ?? ''),
    overflow: tokens.slice(cells.length).join(''),
  };
  const normalizedSource = [...text.normalize('NFC')];
  const mirror = mirroredReading(normalizedSource, tokens);
  const mirrored: ReadingCandidate = {
    label: '원문의 토·부호를 포함한 배치',
    values: mirror.values,
    overflow: mirror.overflow,
  };
  const ready = (candidate: ReadingCandidate): ReadingResolution => ({
    status: 'ready',
    cells: cells.map((cell, i) => ({ ...cell, value: candidate.values[i] ?? '' })),
    overflow: candidate.overflow,
    candidates: [],
  });
  if (!tokens.length) return ready(pure);
  if (mirror.valid && mirror.complete && !mirror.overflow) return ready(mirrored);
  if (mirror.valid && !mirror.overflow && mirror.matchedLiteral) {
    if (pure.values.every((value, i) => value === mirrored.values[i]) && pure.overflow === mirrored.overflow) {
      return ready(pure);
    }
    if (!pure.overflow) return { status: 'ambiguous', cells, overflow: reading, candidates: [pure, mirrored] };
  }
  // A bounded diagnostic pass also detects a later literal after an omitted
  // earlier 토. Its greedy placement is never offered as a valid candidate.
  if (!mirror.valid || mirror.overflow) {
    const mixed = mirroredReading(normalizedSource, tokens, true);
    const samePlacement = pure.overflow === mixed.overflow
      && pure.values.every((value, i) => value === mixed.values[i]);
    if (mixed.matchedLiteral && !samePlacement) {
      return { status: 'unresolved', cells, overflow: reading, candidates: [] };
    }
  }
  return ready(pure);
}

/** Ambiguous drafts retain their raw value in overflow rather than losing it. */
export function readingDraftFromText(text: string, reading: string): ReadingDraft {
  const { cells, overflow } = resolveReading(text, reading);
  return { cells, overflow };
}

/** Partial or uncertain readings use the renderer's existing one-line fallback. */
export function alignReading(text: string, reading: string): (string | null)[] | null {
  if (!reading) return null;
  const result = resolveReading(text, reading);
  if (result.status !== 'ready' || result.overflow || result.cells.some(cell => !cell.value)) return null;
  let slot = 0;
  return [...text].map(ch => isHan(ch) ? result.cells[slot++].value : null);
}

/** Preserve source literals and every slot when the source is supplied. */
export function readingFromDraftCells(values: string[], text?: string): string {
  const normalized = values.map(value => readingTokens(value).find(ch => HANGUL.test(ch)) ?? '');
  if (normalized.every(value => !value)) return '';
  if (text !== undefined) {
    let slot = 0;
    return [...text].map(ch => isHan(ch) ? normalized[slot++] || '·' : ch).join('');
  }
  let end = normalized.length;
  while (end > 0 && !normalized[end - 1]) end--;
  return normalized.slice(0, end).map(value => value || '·').join('');
}
