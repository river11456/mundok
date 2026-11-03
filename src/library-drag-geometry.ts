export interface BookRect { id: string; left: number; right: number; top: number; bottom: number }

/** Slots stay in their original layout order, independent of animated book positions. */
export function reflowAt(slots: BookRect[], sourceId: string, x: number, y: number): { order: string[]; beforeId: string | null } | null {
  if (!slots.some(slot => slot.id === sourceId)) return null;
  const rowDistance = (slot: BookRect) => Math.max(slot.top - y, y - slot.bottom, 0);
  const nearestRow = slots.reduce((a, b) => rowDistance(b) < rowDistance(a) ? b : a);
  const row = slots.filter(slot => Math.abs(slot.top - nearestRow.top) < 5);
  const distance = (slot: BookRect) => Math.abs(x - (slot.left + slot.right) / 2);
  const destination = row.reduce((a, b) => distance(b) < distance(a) ? b : a);
  const index = slots.indexOf(destination);
  const order = slots.map(slot => slot.id).filter(id => id !== sourceId);
  order.splice(index, 0, sourceId);
  return { order, beforeId: order[index + 1] ?? null };
}
