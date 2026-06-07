import type { Doc, Level, LevelKey } from './types';
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

export const DOCS: Doc[] = Object.entries(rawCsvs)
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
