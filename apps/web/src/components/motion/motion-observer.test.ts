import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MotionObserver } from '@/components/motion/motion-observer';

describe('MotionObserver', () => {
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.motion;
    delete (window as unknown as { __motionObserver?: boolean })
      .__motionObserver;
    vi.unstubAllGlobals();
  });

  it('waits for idle hydration work before touching reveal elements', () => {
    let start: IdleRequestCallback | undefined;
    let onMutations: MutationCallback | undefined;
    const observe = vi.fn();
    class Observer {
      observe = observe;
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: MutationCallback) {
          onMutations = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        takeRecords = vi.fn(() => []);
      },
    );
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
      start = callback;
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    document.body.innerHTML = '<span data-write="word">Hello</span>';

    render(createElement(MotionObserver));
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(observe).not.toHaveBeenCalled();

    act(() => start?.({ didTimeout: false, timeRemaining: () => 10 }));
    expect(document.documentElement.dataset.motion).toBe('ready');
    expect(observe).toHaveBeenCalledOnce();

    const streamed = document.createElement('section');
    streamed.innerHTML = '<p data-reveal="">Late lesson content</p>';
    document.body.append(streamed);
    act(() =>
      onMutations?.(
        [{ addedNodes: [streamed] } as unknown as MutationRecord],
        {} as MutationObserver,
      ),
    );
    expect(observe).toHaveBeenCalledWith(streamed.firstElementChild);
  });
});
