import { store } from './storage/index.ts';
import type { GrammarAnnotation, GrammarEntry } from './types';

export type CardGrammarEntry = GrammarEntry & { cardId: string };

let _data: CardGrammarEntry[] = [];

export function initGrammar(entries: CardGrammarEntry[]): void {
  _data = entries ?? [];
}

export function getAnnotations(docId: string, cardId: string): GrammarAnnotation[] {
  return _data.find(e => e.docId === docId && e.cardId === cardId)?.annotations ?? [];
}

export async function saveAnnotations(
  docId: string,
  cardId: string,
  cardFront: string,
  annotations: GrammarAnnotation[],
): Promise<void> {
  await store().saveGrammar(docId, cardId, cardFront, annotations);

  const idx = _data.findIndex(e => e.docId === docId && e.cardId === cardId);
  if (annotations.length === 0) {
    if (idx >= 0) _data.splice(idx, 1);
  } else if (idx >= 0) {
    _data[idx].annotations = annotations;
  } else {
    _data.push({ docId, cardId, cardFront, annotations });
  }
}
