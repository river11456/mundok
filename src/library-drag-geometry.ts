export interface BookRect { id: string; left: number; right: number; top: number; bottom: number }
/** Choose the nearest row, then the first book whose horizontal midpoint is ahead. */
export function insertionAt(books: BookRect[], x: number, y: number): { beforeId: string | null; anchor: BookRect; after: boolean } | null {
  if (!books.length) return null;
  const distance = (b: BookRect) => Math.max(b.top - y, y - b.bottom, 0);
  const nearest = books.reduce((a, b) => distance(b) < distance(a) ? b : a);
  const row = books.filter(b => Math.abs(b.top - nearest.top) < 5);
  const next = row.find(b => x < (b.left + b.right) / 2);
  if (next) return { beforeId: next.id, anchor: next, after: false };
  const last = row[row.length - 1];
  return { beforeId: books[books.indexOf(last) + 1]?.id ?? null, anchor: last, after: true };
}
