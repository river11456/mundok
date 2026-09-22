import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReadingEditor, chooseReading, editReadingCell, distributeReadingTokens,
  changeReadingText, readingForSave, readingForTextChange,
} from '../src/reading-editor.ts';
import { readingTokens, readingDraftFromText } from '../src/reading-align.ts';

test('overflow survives cell edits and subsequent pastes until explicitly handled', () => {
  const e = createReadingEditor('人而學', '');
  distributeReadingTokens(e, 0, readingTokens('인이학천'));
  assert.equal(e.overflow, '천');
  editReadingCell(e, 0, '인');
  assert.equal(e.overflow, '천');
  assert.throws(() => readingForSave(e), /남은 독음/);
  distributeReadingTokens(e, 2, readingTokens('학·지'));
  assert.equal(e.overflow, '천·지');
  assert.throws(() => readingForSave(e), /남은 독음/);
  e.overflow = '';
  assert.equal(readingForSave(e), '인이학');
});

test('pasted blank tokens clear occupied cells without shifting later syllables', () => {
  const e = createReadingEditor('人而學', '인이학');
  distributeReadingTokens(e, 0, readingTokens('인 · 학'));
  assert.deepEqual(e.values, ['인', '', '학']);
  assert.equal(readingForSave(e), '인·학');
  distributeReadingTokens(e, 1, readingTokens('·천'));
  assert.deepEqual(e.values, ['인', '', '천']);
});

test('unmodified legacy values are preserved even when ambiguous', () => {
  const e = createReadingEditor('人이 而學', '인이');
  assert.equal(e.status, 'ambiguous');
  assert.equal(readingForSave(e), '인이');
  chooseReading(e, ['인', '이', '']);
  const saved = readingForSave(e);
  assert.deepEqual(readingDraftFromText(e.text, saved).cells.map(c => c.value), e.values);
});

test('tor and punctuation changes retain slots; hanja changes require review and retain removed input', () => {
  const e = createReadingEditor('人이고 而學', '인이고 이학');
  changeReadingText(e, '人은·而學');
  assert.deepEqual(e.values, ['인', '이', '학']);
  assert.equal(readingForSave(e), '인은·이학');
  changeReadingText(e, '人學');
  assert.equal(e.overflow, '학');
  assert.equal(e.needsReview, true);
  assert.throws(() => readingForSave(e));
  e.overflow = '';
  assert.throws(() => readingForSave(e), /배치/);
  editReadingCell(e, 1, '학');
  e.needsReview = false;
  assert.equal(readingForSave(e), '인학');
});

test('unresolved source changes cannot silently overwrite the legacy reading', () => {
  const e = createReadingEditor('人이 而學', '인이');
  changeReadingText(e, '人이고 而學');
  assert.throws(() => readingForSave(e), /기존 독음/);
  assert.equal(e.originalReading, '인이');
});

test('undoing source edits restores untouched legacy candidates and original save value', () => {
  const e = createReadingEditor('人이 而學', '인이');
  const before = structuredClone(e);
  changeReadingText(e, '人이고 而學');
  assert.equal(e.candidates.length, 0);
  changeReadingText(e, e.originalText);
  assert.deepEqual(e, before);
  assert.equal(readingForSave(e), '인이');
});

test('undoing source edits restores dropped slots only if readings were not edited', () => {
  const e = createReadingEditor('人而學', '인이학');
  changeReadingText(e, '人學');
  changeReadingText(e, e.originalText);
  assert.deepEqual(e.values, ['인', '이', '학']);
  assert.equal(e.overflow, '');
  changeReadingText(e, '人學');
  editReadingCell(e, 0, '천');
  changeReadingText(e, e.originalText);
  assert.equal(e.values[0], '천');
  assert.equal(e.overflow, '학');
  assert.throws(() => readingForSave(e), /남은 독음/);
});

test('linked text edits preserve tor-independent slots and reject changed hanja with readings', () => {
  assert.equal(readingForTextChange('人이 而學', '人이고 而學', '인이 이학'), '인이고 이학');
  assert.equal(readingForTextChange('人而學', '人天而學', '인이학'), null);
  assert.equal(readingForTextChange('人이 而學', '人이고 而學', '인이'), null);
  assert.equal(readingForTextChange('人而學', '人天而學', ''), '');
});

test('a save failure does not consume pending input or mutate editor state', () => {
  const e = createReadingEditor('人이고 而學', '');
  distributeReadingTokens(e, 0, readingTokens('인이학천'));
  const before = JSON.stringify(e);
  assert.throws(() => readingForSave(e));
  assert.equal(JSON.stringify(e), before);
});
