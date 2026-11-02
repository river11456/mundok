import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createReadingEditor } from '../src/reading-editor.ts';
import { replaceUserData } from '../src/storage/recovery.ts';
import { draftFieldsEqual, exportDraft, keyForDraft, listDrafts, readDraft, removeDraft, writeDraft, type CardDraft } from '../src/storage/drafts.ts';

let data: Map<string, string>;
let deny = false;
let quota = false;
beforeEach(() => {
  data = new Map(); deny = false; quota = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { if (deny) throw new Error('denied'); return data.size; },
    key(i: number) { if (deny) throw new Error('denied'); return [...data.keys()][i] ?? null; },
    getItem(key: string) { if (deny) throw new Error('denied'); return data.get(key) ?? null; },
    setItem(key: string, value: string) { if (deny || quota) throw new Error('write failed'); data.set(key, value); },
    removeItem(key: string) { if (deny) throw new Error('denied'); data.delete(key); },
  } });
});
function sample(): CardDraft {
  return {
    version: 1, docId: 'doc/一', cardId: 's1', type: 'sentence', title: '문헌',
    baseline: { text: '天地', reading: '천지', meaning: '', note: '' },
    fields: { text: ' 天地\n', reading: 'ㅊ처', meaning: ' \n 해석  ', note: '\t메모\n' },
    readingEditor: { ...createReadingEditor('天地', '천지'), overflow: '초과', needsReview: true },
    readingCells: ['ㅊ', ''], readingOverflow: 'ㅊ  \n', pendingReadingPasteRaw: '미해결\n  ', updatedAt: 123, revision: 'r1',
  };
}
const key = () => keyForDraft('doc/一', 'sentence', 's1');
test('roundtrip preserves raw whitespace, IME, empty cells, overflow and pending paste', () => {
  const draft = sample(); writeDraft(draft);
  assert.deepEqual(readDraft(key()), draft);
  assert.equal(draftFieldsEqual(draft.fields, { ...draft.fields }), true);
  assert.equal(draftFieldsEqual(draft.fields, { ...draft.fields, note: draft.fields.note.trim() }), false);
});
test('identities cannot collide across encoded separators or levels', () => {
  const a = sample(); const b = { ...sample(), docId: 'doc', cardId: '一/s1', type: 'word' as const,
    readingEditor: null, readingCells: [], readingOverflow: '', pendingReadingPasteRaw: null };
  writeDraft(a); writeDraft(b);
  assert.notEqual(key(), keyForDraft(b.docId, b.type, b.cardId));
  assert.equal(listDrafts().length, 2);
});
test('quota failure preserves previous draft', () => {
  writeDraft(sample()); quota = true;
  assert.throws(() => writeDraft({ ...sample(), revision: 'r2' }));
  assert.equal(readDraft(key())?.revision, 'r1');
});
test('conditional cleanup never deletes a newer revision', () => {
  writeDraft(sample());
  assert.equal(removeDraft(key(), 'r0'), false);
  assert.equal(removeDraft(key(), 'r1'), true);
  assert.equal(readDraft(key()), null);
  assert.equal(removeDraft(key()), false);
});
test('corrupt, unsupported and identity-mismatched records remain exportable/listed', () => {
  for (const raw of ['{', JSON.stringify({ ...sample(), version: 2 }), JSON.stringify({ ...sample(), cardId: 'other' })]) {
    data.set(key(), raw);
    assert.throws(() => readDraft(key()));
    assert.equal(listDrafts()[0].draft, null);
    assert.ok(listDrafts()[0].error);
    assert.equal(data.get(key()), raw);
  }
});
test('rejects invalid fields, candidates, identity, timestamps and inherited properties', () => {
  for (const draft of [
    { ...sample(), docId: '' }, { ...sample(), type: '__proto__' },
    { ...sample(), updatedAt: Infinity }, { ...sample(), fields: { text: '' } },
    { ...sample(), readingEditor: { ...sample().readingEditor, candidates: [{ label: 'x', values: [1], overflow: '' }] } },
    Object.create(sample()),
  ]) assert.throws(() => writeDraft(draft as CardDraft));
  assert.equal(data.size, 0);
});
test('global access errors propagate instead of showing an empty list', () => {
  deny = true;
  assert.throws(() => readDraft(key()), /denied/);
  assert.throws(() => listDrafts(), /denied/);
});
test('replacing user data leaves drafts intact and separate from backup namespace', () => {
  writeDraft(sample()); data.set('mundok-v3/docs', 'old');
  replaceUserData({ 'mundok-v3/docs': 'new' });
  assert.deepEqual(readDraft(key()), sample());
  assert.equal(data.get('mundok-v3/docs'), 'new');
});

test('save intent and ambiguous reading candidates roundtrip without normalization', () => {
  const draft = sample();
  draft.saveIntent = { ...draft.fields };
  draft.readingEditor!.status = 'ambiguous';
  draft.readingEditor!.candidates = [{ label: '후보', values: ['', 'ㅊ'], overflow: '  ' }];
  writeDraft(draft);
  assert.deepEqual(readDraft(key()), draft);
});
test('explicit discard can remove a corrupt draft but revision cleanup preserves it', () => {
  data.set(key(), '{broken');
  assert.throws(() => removeDraft(key(), 'r1'));
  assert.equal(data.get(key()), '{broken');
  assert.equal(removeDraft(key()), true);
});
test('export downloads the original corrupt bytes without parsing', async () => {
  const raw = '{corrupt\n  ';
  data.set(key(), raw);
  let blob: Blob | undefined;
  let clicked = false;
  const anchor = { href: '', download: '', click() { clicked = true; } };
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  URL.createObjectURL = value => { blob = value as Blob; return 'blob:draft'; };
  URL.revokeObjectURL = () => {};
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => anchor } });
  try {
    exportDraft(key());
    assert.equal(await blob!.text(), raw);
    assert.equal(anchor.href, 'blob:draft');
    assert.equal(anchor.download, 'mundok-draft.json');
    assert.equal(clicked, true);
    assert.equal(data.get(key()), raw);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('sentence arrays must match Han cells without dropping malformed extra entries', () => {
  for (const draft of [
    { ...sample(), readingEditor: null },
    { ...sample(), readingCells: ['천', '지', 'extra'] },
    { ...sample(), readingCells: ['천'] },
    { ...sample(), readingEditor: { ...sample().readingEditor!, values: ['천', '지', 'extra'] } },
    { ...sample(), readingEditor: { ...sample().readingEditor!, candidates: [{ label: 'x', values: ['천'], overflow: '' }] } },
  ]) {
    assert.throws(() => writeDraft(draft));
    data.set(key(), JSON.stringify(draft));
    assert.throws(() => readDraft(key()));
    assert.equal(listDrafts()[0].draft, null);
  }
});
test('raw composing cells remain valid and editor text can differ from trimmed field text', () => {
  const draft = sample();
  draft.fields.text = '天地';
  draft.readingEditor!.text = ' 天地\n';
  draft.readingEditor!.values = ['ㅊ처', ''];
  draft.readingCells = ['ㅊ처', ''];
  writeDraft(draft);
  assert.deepEqual(readDraft(key()), draft);
});
test('non-sentence drafts carry no sentence editor state', () => {
  const draft: CardDraft = { ...sample(), type: 'word', readingEditor: null,
    readingCells: [], readingOverflow: '', pendingReadingPasteRaw: null };
  writeDraft(draft);
  assert.deepEqual(readDraft(keyForDraft(draft.docId, draft.type, draft.cardId)), draft);
  for (const invalid of [
    { ...draft, readingEditor: sample().readingEditor },
    { ...draft, readingCells: [''] }, { ...draft, readingOverflow: 'ㅊ' },
    { ...draft, pendingReadingPasteRaw: '' },
  ]) assert.throws(() => writeDraft(invalid));
});
