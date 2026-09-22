import { isHan, readingFromDraftCells, readingTokens, resolveReading } from './reading-align.ts';

export interface ReadingEditor {
  text: string;
  originalText: string;
  originalReading: string;
  values: string[];
  overflow: string;
  dirty: boolean;
  readingDirty: boolean;
  status: 'ready' | 'ambiguous' | 'unresolved';
  candidates: ReturnType<typeof resolveReading>['candidates'];
  needsReview: boolean;
}

export function createReadingEditor(text: string, reading: string): ReadingEditor {
  const parsed = resolveReading(text, reading);
  return {
    text, originalText: text, originalReading: reading,
    values: parsed.cells.map(cell => cell.value), overflow: parsed.overflow,
    dirty: false, readingDirty: false, status: parsed.status, candidates: parsed.candidates, needsReview: false,
  };
}

export function chooseReading(editor: ReadingEditor, values: string[], overflow = ''): void {
  editor.values = [...editor.text].filter(isHan).map((_, i) => values[i] ?? '');
  editor.overflow = overflow;
  editor.status = 'ready';
  editor.candidates = [];
  editor.dirty = true;
  editor.readingDirty = true;
}

/** A cell edit never consumes or dismisses input that did not fit. */
export function editReadingCell(editor: ReadingEditor, index: number, value: string): void {
  if (editor.status !== 'ready' || index < 0 || index >= editor.values.length) return;
  editor.values[index] = readingTokens(value)[0]?.replace('·', '') ?? '';
  editor.dirty = true;
  editor.readingDirty = true;
}

export function distributeReadingTokens(editor: ReadingEditor, start: number, tokens: string[]): number {
  if (editor.status !== 'ready') return start;
  let cursor = start;
  for (const token of tokens) {
    if (cursor < editor.values.length) editor.values[cursor++] = token === '·' ? '' : token;
    else editor.overflow += token;
  }
  if (tokens.length) editor.dirty = editor.readingDirty = true;
  return cursor;
}

export function changeReadingText(editor: ReadingEditor, text: string): void {
  if (editor.text === text) return;
  if (text === editor.originalText && !editor.readingDirty) {
    Object.assign(editor, createReadingEditor(editor.originalText, editor.originalReading));
    return;
  }
  const before = [...editor.text].filter(isHan).join('');
  const after = [...text].filter(isHan).join('');
  editor.text = text;
  if (before !== after) {
    if (editor.values.length > [...after].length) {
      editor.overflow += editor.values.slice([...after].length).map(v => v || '·').join('');
    }
    editor.values = [...after].map((_, i) => editor.values[i] ?? '');
    editor.needsReview = true;
  }
  // An unresolved legacy value must be resolved against its original source first.
  if (editor.status !== 'ready') editor.candidates = [];
  editor.dirty = true;
}

export function readingForSave(editor: ReadingEditor): string {
  if (!editor.dirty && editor.text === editor.originalText) return editor.originalReading;
  if (editor.status !== 'ready') throw new Error('기존 독음의 배치를 선택하거나 직접 입력해 주세요.');
  if (editor.overflow) throw new Error('남은 독음을 배치하거나 지운 뒤 저장해 주세요.');
  if (editor.needsReview) throw new Error('원문이 바뀌었습니다. 한자별 독음 배치를 확인해 주세요.');
  return readingFromDraftCells(editor.values, editor.text);
}

/** Linked edits cannot confirm a new hanja-to-reading correspondence on the user's behalf. */
export function readingForTextChange(text: string, next: string, reading: string): string | null {
  if (!reading || text === next) return reading;
  if ([...text].filter(isHan).join('') !== [...next].filter(isHan).join('')) return null;
  const editor = createReadingEditor(text, reading);
  if (editor.status !== 'ready' || editor.overflow) return null;
  changeReadingText(editor, next);
  return readingForSave(editor);
}
