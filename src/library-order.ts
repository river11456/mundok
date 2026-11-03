import { hasPendingRecovery } from './storage/recovery.ts';
import type { ShelfJSON } from './types.ts';
export const LIBRARY_ORDER_KEY = 'mundok-v3/library-order';
export function normalizeOrder(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string'))] : [];
}
export function loadLibraryOrder(): string[] {
  try { return normalizeOrder(JSON.parse(localStorage.getItem(LIBRARY_ORDER_KEY) ?? '[]')); } catch { return []; }
}
export function orderedIds(ids: string[], order: string[]): string[] {
  const present = new Set(ids);
  return [...new Set([...order.filter(id => present.has(id)), ...ids])];
}
export function arrangeDoc(shelves: ShelfJSON[], root: string[], docId: string, destination: string | null, beforeId?: string | null): { shelves: ShelfJSON[]; root: string[] } {
  const original = { shelves, root };
  const current = shelves.find(s => s.docIds.includes(docId))?.id ?? null;
  if (destination !== null && !shelves.some(s => s.id === destination)) return original;
  if (beforeId === docId || (beforeId === undefined && current === destination)) return original;
  const target = destination === null ? root : shelves.find(s => s.id === destination)!.docIds;
  if (beforeId != null && !target.includes(beforeId)) return original;
  const ids = target.filter(id => id !== docId);
  ids.splice(beforeId == null ? ids.length : ids.indexOf(beforeId), 0, docId);
  return {
    shelves: shelves.map(s => ({ ...s, docIds: s.id === destination ? ids : s.docIds.filter(id => id !== docId) })),
    root: destination === null ? ids : root.filter(id => id !== docId),
  };
}

/** Pending recovery requires a reload so runtime documents and storage agree. */
export function assertLibraryWritable(): void {
  if (hasPendingRecovery()) throw new Error('이전 저장 작업의 복구가 필요합니다. 브라우저 데이터를 삭제하지 말고 복구 사본을 보관한 뒤 새로고침해 주세요.');
}
