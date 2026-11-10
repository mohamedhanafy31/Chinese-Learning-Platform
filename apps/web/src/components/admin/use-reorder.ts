'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { failureKey } from '@/lib/admin-client';
import type { AdminErrorKey } from '@/lib/admin-errors';
import { apiFetch, jsonRequest } from '@/lib/api-client';
import { moveItem } from '@/lib/reorder';

interface UseReorderOptions<T> {
  /** PUT endpoint that takes `{ ids }` (the full new order). */
  url: string;
  /** Reads the authoritative list out of the response, or null if malformed. */
  parse: (data: unknown) => T[] | null;
  onUnauthenticated: () => void;
}

export interface MovedInfo {
  id: string;
  position: number;
}

/**
 * Optimistic reorder: the list moves at once, the full new order is sent, and
 * the previous order is restored when the request fails. One move at a time.
 */
export function useReorder<T extends { id: string }>(
  initial: T[],
  { onUnauthenticated, parse, url }: UseReorderOptions<T>,
) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<AdminErrorKey | null>(null);
  const [moved, setMoved] = useState<MovedInfo | null>(null);
  const focusAfter = useRef<{ id: string; direction: -1 | 1 } | null>(null);

  // Server data wins whenever the page refreshes.
  useEffect(() => {
    setItems(initial);
  }, [initial]);

  // Keyboard users stay on the row they moved, even after the DOM reorders.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const row = document.querySelector<HTMLElement>(
      `[data-reorder-id="${target.id}"]`,
    );
    const wanted = row?.querySelector<HTMLButtonElement>(
      `[data-move="${target.direction === -1 ? 'up' : 'down'}"]`,
    );
    const fallback = row?.querySelector<HTMLButtonElement>(
      `[data-move="${target.direction === -1 ? 'down' : 'up'}"]`,
    );
    (wanted && !wanted.disabled ? wanted : fallback)?.focus();
  }, [items]);

  async function move(index: number, direction: -1 | 1): Promise<void> {
    if (pending) return;
    const previous = items;
    const next = moveItem(previous, index, direction);
    const item = previous[index];
    if (!item || next === previous || next[index] === item) return;

    setItems(next);
    setPending(true);
    setErrorKey(null);
    setMoved(null);
    focusAfter.current = { id: item.id, direction };

    const result = await apiFetch<unknown>(
      url,
      jsonRequest({ ids: next.map((entry) => entry.id) }, { method: 'PUT' }),
    );
    if (!result.ok) {
      const key = await failureKey(result);
      setItems(previous);
      setPending(false);
      if (key === 'unauthenticated') return onUnauthenticated();
      setErrorKey(key);
      return;
    }
    const confirmed = parse(result.data);
    if (confirmed) setItems(confirmed);
    setMoved({ id: item.id, position: index + direction + 1 });
    setPending(false);
    router.refresh();
  }

  return { items, pending, errorKey, moved, move };
}
