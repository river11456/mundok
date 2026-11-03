import { DOCS, homeDocs } from './docs';
import { loadCollections, saveCollections, deleteShelf, createShelf } from './collections';
import { arrangeDoc, LIBRARY_ORDER_KEY, assertLibraryWritable } from './library-order';
import { withStorageRecovery } from './storage/recovery';

/** undefined means location only; null means insert at end. */
export function moveLibraryDoc(docId: string, destination: string | null, beforeId?: string | null): boolean {
  assertLibraryWritable();
  if (!DOCS.some(d => d.id === docId)) return false;
  const shelves = loadCollections();
  const root = homeDocs(null).map(d => d.id);
  const next = arrangeDoc(shelves, root, docId, destination, beforeId);
  if (JSON.stringify(next) === JSON.stringify({ shelves, root })) return false;
  withStorageRecovery(() => {
    saveCollections(next.shelves);
    localStorage.setItem(LIBRARY_ORDER_KEY, JSON.stringify(next.root));
  });
  return true;
}

/** Preserve the current root order, appending promoted documents in folder order. */
export function deleteLibraryFolder(id: string): boolean {
  assertLibraryWritable();
  const shelves = loadCollections();
  const folder = shelves.find(s => s.id === id);
  if (!folder) return false;
  const root = homeDocs(null).map(d => d.id);
  withStorageRecovery(() => {
    saveCollections(deleteShelf(shelves, id));
    localStorage.setItem(LIBRARY_ORDER_KEY, JSON.stringify([...new Set([...root, ...(!folder.parentId ? folder.docIds : [])])]));
  });
  return true;
}

export function createLibraryFolder(name: string, parentId: string | null, docId: string | null): void {
  assertLibraryWritable();
  const shelves = loadCollections();
  const created = createShelf(shelves, name, parentId);
  if (docId === null) { saveCollections(created.shelves); return; }
  const next = arrangeDoc(created.shelves, homeDocs(null).map(d => d.id), docId, created.id);
  withStorageRecovery(() => {
    saveCollections(next.shelves);
    localStorage.setItem(LIBRARY_ORDER_KEY, JSON.stringify(next.root));
  });
}
