import { isHan } from './reading-align.ts';
import type { Card } from './types';
import type { HanjaCandidate } from './hanja-dictionary.ts';

export type SentenceReadingSource = 'card' | 'dictionary';

export interface SentenceReadingSuggestion {
  char: string;
  value: string;
  source: SentenceReadingSource;
  candidates: HanjaCandidate[];
  needsReview: boolean;
}

export interface SentenceReadingAutofillCell {
  char: string;
  current: string;
  suggestion: SentenceReadingSuggestion | null;
}

export interface SentenceReadingAutofillResult {
  cells: SentenceReadingAutofillCell[];
  filled: number;
  preserved: number;
  review: number;
  unresolved: number;
}

export function normalizeReadingSyllable(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const syllables = [...trimmed].filter(ch => /[가-힣]/.test(ch));
  if (!syllables.length) return '';
  return /\s/.test(trimmed) ? syllables[syllables.length - 1] : syllables[0];
}

function charCardsByFront(cards: readonly Pick<Card, 'front' | 'reading'>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const card of cards) {
    const chars = [...card.front];
    if (chars.length !== 1 || !isHan(chars[0])) continue;
    const reading = normalizeReadingSyllable(card.reading);
    if (reading && !map.has(chars[0])) map.set(chars[0], reading);
  }
  return map;
}

export function planSentenceReadingAutofill(
  text: string,
  currentCells: readonly string[],
  charCards: readonly Pick<Card, 'front' | 'reading'>[],
  dictionaryEntries: Record<string, readonly HanjaCandidate[]>,
): SentenceReadingAutofillResult {
  const knownReadings = charCardsByFront(charCards);
  const chars = [...text].filter(isHan);
  const cells = chars.map<SentenceReadingAutofillCell>((char, index) => {
    const current = currentCells[index]?.trim() ?? '';
    if (current) return { char, current, suggestion: null };

    const cardReading = knownReadings.get(char);
    if (cardReading) {
      return {
        char,
        current,
        suggestion: {
          char,
          value: cardReading,
          source: 'card',
          candidates: [],
          needsReview: false,
        },
      };
    }

    const candidates = (dictionaryEntries[char] ?? [])
      .map(candidate => ({ ...candidate, reading: normalizeReadingSyllable(candidate.reading) }))
      .filter(candidate => candidate.reading);
    const first = candidates[0];
    if (!first) return { char, current, suggestion: null };
    return {
      char,
      current,
      suggestion: {
        char,
        value: first.reading,
        source: 'dictionary',
        candidates,
        needsReview: candidates.length > 1,
      },
    };
  });

  return {
    cells,
    filled: cells.filter(cell => !cell.current && cell.suggestion).length,
    preserved: cells.filter(cell => cell.current).length,
    review: cells.filter(cell => cell.suggestion?.needsReview).length,
    unresolved: cells.filter(cell => !cell.current && !cell.suggestion).length,
  };
}
