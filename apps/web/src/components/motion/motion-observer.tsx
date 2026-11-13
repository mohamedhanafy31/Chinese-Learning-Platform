'use client';

import { useEffect } from 'react';

const SELECTOR = '[data-write], [data-reveal]';

/**
 * Watches every write-on and reveal element and marks it `data-inview` the
 * first time it enters the viewport. Mounted once in the locale layout; it
 * also registers content streamed in by later client navigation.
 */
export function MotionObserver(): null {
  useEffect(() => {
    const root = document.documentElement;
    let observer: IntersectionObserver | null = null;
    let mutations: MutationObserver | null = null;
    let idle = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idleWindow = window as Window & {
      requestIdleCallback?: typeof window.requestIdleCallback;
      cancelIdleCallback?: typeof window.cancelIdleCallback;
    };

    const observe = (): void => {
      if (
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        !('IntersectionObserver' in window)
      ) {
        return;
      }

      root.dataset.motion = 'ready';
      (window as unknown as { __motionObserver?: boolean }).__motionObserver =
        true;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const element = entry.target as HTMLElement;
            element.dataset.inview = 'true';
            observer?.unobserve(element);
          }
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
      );

      const register = (node: ParentNode): void => {
        if (node instanceof HTMLElement && node.matches(SELECTOR)) {
          if (!node.dataset.inview) observer?.observe(node);
        }
        for (const element of node.querySelectorAll<HTMLElement>(SELECTOR)) {
          if (!element.dataset.inview) observer?.observe(element);
        }
      };

      register(document);
      // App Router can insert the streamed route after `usePathname` changes.
      // Observe future nodes too so a new lesson can never remain transparent.
      mutations = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement) register(node);
          }
        }
      });
      mutations.observe(document.body, { childList: true, subtree: true });
    };

    const schedule = (): void => {
      // Next can stream nested boundaries after the locale layout hydrates.
      // Only claim React-owned reveal elements once hydration work has yielded
      // to the browser, keeping the static fallback visible until then.
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idle = idleWindow.requestIdleCallback(observe, { timeout: 1200 });
      } else {
        timer = setTimeout(observe, 350);
      }
    };

    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      window.removeEventListener('load', schedule);
      if (idle) idleWindow.cancelIdleCallback?.(idle);
      if (timer) clearTimeout(timer);
      mutations?.disconnect();
      observer?.disconnect();
    };
  }, []);

  return null;
}
