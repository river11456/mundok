import type { Doc, Level, LevelKey, UserData } from './types';
import { parseCSV } from './csv';

const rawCsvs = import.meta.glob('./data/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const LEVEL_ORDER: readonly LevelKey[] = ['char', 'word', 'sentence', 'paragraph'];
const LEVEL_LABEL: Record<LevelKey, string> = {
  char:      '개별 글자',
  word:      '단어 단위',
  sentence:  '문장 단위',
  paragraph: '단락 단위',
};

export let DOCS: Doc[] = Object.entries(rawCsvs)
  .map(([path, raw]) => {
    const m = path.match(/\.\/data\/([^/]+)\.csv$/);
    if (!m) return null;
    const docId = m[1];
    const rows  = parseCSV(raw);

    const metaRow = rows.find(r => r['type'] === 'meta');
    if (!metaRow) {
      console.warn(`[docs] meta 행 없음: ${path}`);
      return null;
    }

    const byType = new Map<string, typeof rows>();
    for (const row of rows.filter(r => r['type'] !== 'meta')) {
      if (!byType.has(row['type'])) byType.set(row['type'], []);
      byType.get(row['type'])!.push(row);
    }

    const levels: Level[] = LEVEL_ORDER
      .filter(t => byType.has(t))
      .map(t => ({
        key:   t,
        label: LEVEL_LABEL[t],
        cards: byType.get(t)!
          .filter(r => r['text']?.trim())
          .map((r, i) => ({
            id:         `${t}_${i + 1}`,
            front:      r['text']    ?? '',
            reading:    r['reading'] ?? '',
            back:       r['meaning'] ?? '',
            note:       r['note']    ?? '',
            fail_count: 0,
          })),
      }));

    return levels.length > 0
      ? { id: docId, title: metaRow['text'], sub: metaRow['reading'], levels }
      : null;
  })
  .filter((d): d is Doc => d !== null);

export async function initDocs(): Promise<void> {
  let ud: UserData;
  try {
    const res = await fetch('/userdata.json');
    if (!res.ok) return;
    ud = await res.json() as UserData;
  } catch {
    return;
  }

  for (const del of ud.deletions ?? []) {
    const doc = DOCS.find(d => d.id === del.docId);
    if (!doc) continue;
    for (const lvl of doc.levels) {
      if (lvl.key === del.type) lvl.cards = lvl.cards.filter(c => c.front !== del.text);
    }
  }

  for (const edit of ud.edits ?? []) {
    const doc = DOCS.find(d => d.id === edit.docId);
    if (!doc) continue;
    for (const lvl of doc.levels) {
      if (lvl.key !== edit.type) continue;
      const card = lvl.cards.find(c => c.front === edit.origText);
      if (card) Object.assign(card, { front: edit.text, reading: edit.reading, back: edit.meaning, note: edit.note });
    }
  }

  for (const add of ud.additions ?? []) {
    const doc = DOCS.find(d => d.id === add.docId);
    if (!doc) continue;
    if (!LEVEL_ORDER.includes(add.type)) continue;
    let lvl = doc.levels.find(l => l.key === add.type);
    if (!lvl) {
      lvl = { key: add.type, label: LEVEL_LABEL[add.type], cards: [] };
      const idx = LEVEL_ORDER.indexOf(add.type);
      const at  = doc.levels.findIndex(l => LEVEL_ORDER.indexOf(l.key) > idx);
      if (at === -1) doc.levels.push(lvl); else doc.levels.splice(at, 0, lvl);
    }
    if (!lvl.cards.some(c => c.front === add.text)) {
      lvl.cards.push({ id: `${add.docId}_${add.type}_${add.text}`, front: add.text, reading: add.reading, back: add.meaning, note: add.note, fail_count: 0 });
    }
  }
}
