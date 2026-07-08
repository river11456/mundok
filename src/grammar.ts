import { store } from './storage';
import type { GrammarAnnotation, GrammarEntry } from './types';

let _data: GrammarEntry[] = [];

export function initGrammar(entries: GrammarEntry[]): void {
  _data = entries ?? [];
}

export function getAnnotations(docId: string, cardFront: string): GrammarAnnotation[] {
  return _data.find(e => e.docId === docId && e.cardFront === cardFront)?.annotations ?? [];
}

export async function saveAnnotations(
  docId: string,
  cardId: string,
  cardFront: string,
  annotations: GrammarAnnotation[],
): Promise<void> {
  const idx = _data.findIndex(e => e.docId === docId && e.cardFront === cardFront);
  if (annotations.length === 0) {
    if (idx >= 0) _data.splice(idx, 1);
  } else if (idx >= 0) {
    _data[idx].annotations = annotations;
  } else {
    _data.push({ docId, cardFront, annotations });
  }

  await store().saveGrammar(docId, cardId, cardFront, annotations);
}
