import { describe, expect, it } from 'vitest';

import { moveItem } from './reorder';

describe('moveItem', () => {
  const items = ['a', 'b', 'c'];

  it('moves an item up and down by one', () => {
    expect(moveItem(items, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(items, 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('ignores moves past either end and bad indexes', () => {
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 2, 1)).toEqual(items);
    expect(moveItem(items, 5, -1)).toEqual(items);
    expect(moveItem(items, -1, 1)).toEqual(items);
  });

  it('never mutates its input', () => {
    const copy = [...items];
    moveItem(items, 0, 1);
    expect(items).toEqual(copy);
  });
});
