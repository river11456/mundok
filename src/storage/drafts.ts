import { isHan } from '../reading-align.ts';
import type { ReadingEditor } from '../reading-editor.ts';
import type { LevelKey } from '../types.ts';

export interface DraftFields {
  text: string;
  reading: string;
  meaning: string;
  note: string;
}

export interface CardDraft {
  version: 1;
  docId: string;
  cardId: string;
  type: LevelKey;
  title: string;
  baseline: DraftFields;
  fields: DraftFields;
  readingEditor: ReadingEditor | null;
  readingCells: string[];
  readingOverflow: string;
  pendingReadingPasteRaw: string | null;
  updatedAt: number;
  revision: string;
  saveIntent?: DraftFields;
}

const PREFIX = 'mundok-drafts/v1/';
const LEVELS: readonly string[] = ['char', 'word', 'sentence', 'paragraph'];
const invalid = () => new Error('임시 저장 내용을 읽을 수 없거나 지원하지 않는 형식입니다. 파일로 보관해 주세요.');

function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && !['__proto__', 'constructor', 'prototype'].some(key => Object.prototype.hasOwnProperty.call(value, key));
}
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && Array.from(value).every(item => typeof item === 'string');
const identity = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function fields(value: unknown): value is DraftFields {
  const keys = ['text', 'reading', 'meaning', 'note'];
  return record(value, keys) && keys.every(key => typeof value[key] === 'string');
}

function editor(value: unknown): value is ReadingEditor {
  if (!record(value, ['text', 'originalText', 'originalReading', 'values', 'overflow', 'dirty',
    'readingDirty', 'status', 'candidates', 'needsReview'])) return false;
  return ['text', 'originalText', 'originalReading', 'overflow'].every(key => typeof value[key] === 'string')
    && ['dirty', 'readingDirty', 'needsReview'].every(key => typeof value[key] === 'boolean')
    && strings(value.values) && ['ready', 'ambiguous', 'unresolved'].includes(value.status as string)
    && Array.isArray(value.candidates) && Array.from(value.candidates).every(candidate =>
      record(candidate, ['label', 'values', 'overflow']) && typeof candidate.label === 'string'
      && strings(candidate.values) && typeof candidate.overflow === 'string');
}

function validate(value: unknown): asserts value is CardDraft {
  if (!record(value, ['version', 'docId', 'cardId', 'type', 'title', 'baseline', 'fields',
    'readingEditor', 'readingCells', 'readingOverflow', 'pendingReadingPasteRaw', 'updatedAt', 'revision'])
    || value.version !== 1 || !identity(value.docId) || !identity(value.cardId)
    || !LEVELS.includes(value.type as string) || typeof value.title !== 'string'
    || !fields(value.baseline) || !fields(value.fields)
    || !(value.readingEditor === null || editor(value.readingEditor)) || !strings(value.readingCells)
    || typeof value.readingOverflow !== 'string'
    || !(value.pendingReadingPasteRaw === null || typeof value.pendingReadingPasteRaw === 'string')
    || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt) || value.updatedAt < 0
    || !identity(value.revision) || (value.saveIntent !== undefined && !fields(value.saveIntent))) throw invalid();
  if (value.type === 'sentence') {
    if (value.readingEditor === null) throw invalid();
    const count = [...value.readingEditor.text].filter(isHan).length;
    if (value.readingCells.length !== count || value.readingEditor.values.length !== count
      || value.readingEditor.candidates.some(candidate => candidate.values.length !== count)) throw invalid();
  } else if (value.readingEditor !== null || value.readingCells.length !== 0
    || value.readingOverflow !== '' || value.pendingReadingPasteRaw !== null) throw invalid();
}

export function keyForDraft(docId: string, type: LevelKey, cardId: string): string {
  if (!identity(docId) || !identity(cardId) || !LEVELS.includes(type)) throw invalid();
  return PREFIX + [docId, type, cardId].map(encodeURIComponent).join('/');
}

function checkKey(key: string): void {
  if (!key.startsWith(PREFIX)) throw invalid();
}

function parseDraft(key: string, raw: string): CardDraft {
  const value: unknown = JSON.parse(raw);
  validate(value);
  if (keyForDraft(value.docId, value.type, value.cardId) !== key) throw invalid();
  return value;
}

export function readDraft(key: string): CardDraft | null {
  checkKey(key);
  const raw = localStorage.getItem(key);
  return raw === null ? null : parseDraft(key, raw);
}

export function writeDraft(draft: CardDraft): void {
  validate(draft);
  const key = keyForDraft(draft.docId, draft.type, draft.cardId);
  const raw = JSON.stringify(draft);
  // Validate the serialized representation too; never replace good data with an invalid payload.
  parseDraft(key, raw);
  localStorage.setItem(key, raw);
}

export function removeDraft(key: string, expectedRevision?: string): boolean {
  checkKey(key);
  const raw = localStorage.getItem(key);
  if (raw === null) return false;
  if (expectedRevision !== undefined && parseDraft(key, raw).revision !== expectedRevision) return false;
  localStorage.removeItem(key);
  return true;
}

export function listDrafts(): Array<{ key: string; draft: CardDraft | null; error?: string }> {
  const entries: Array<{ key: string; draft: CardDraft | null; error?: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    // Access failures must propagate; only individual payload errors become recovery entries.
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try { entries.push({ key, draft: parseDraft(key, raw) }); }
    catch { entries.push({ key, draft: null, error: invalid().message }); }
  }
  return entries;
}

export function draftFieldsEqual(a: DraftFields, b: DraftFields): boolean {
  return a.text === b.text && a.reading === b.reading && a.meaning === b.meaning && a.note === b.note;
}

export function exportDraft(key: string): void {
  checkKey(key);
  const raw = localStorage.getItem(key);
  if (raw === null) throw new Error('보관할 임시 저장 내용을 찾을 수 없습니다.');
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'mundok-draft.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
