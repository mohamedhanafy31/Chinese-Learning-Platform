/** Returns a new array with the item at `index` moved one step. */
export function moveItem<T>(
  items: readonly T[],
  index: number,
  direction: -1 | 1,
): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
}
