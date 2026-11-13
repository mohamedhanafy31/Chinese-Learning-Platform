'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const SELECTOR = '[data-write], [data-reveal]';

/**
 * Watches write-on and reveal elements and marks them `data-inview` the first
 * time they enter the viewport. It scans after client navigation and observes
 * elements added later by client-side rendering.
 */
export function MotionObserver(): null {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    (window as unknown as { __motionObserver?: boolean }).__motionObserver =
      true;
    if (root.dataset.motion !== 'ready') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.dataset.inview = 'true';
          observer.unobserve(element);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );

    const observeElement = (element: Element): void => {
      if (element.matches(SELECTOR) && !element.hasAttribute('data-inview')) {
        observer.observe(element);
      }
      for (const descendant of element.querySelectorAll<HTMLElement>(
        SELECTOR,
      )) {
        if (!descendant.hasAttribute('data-inview'))
          observer.observe(descendant);
      }
    };

    for (const element of document.querySelectorAll<HTMLElement>(SELECTOR)) {
      if (!element.dataset.inview) observer.observe(element);
    }

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) observeElement(node as Element);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}

/**
 * Runs before first paint: opts the page into motion unless the visitor asked
 * for reduced motion, and backs out if the observer never mounts, so text can
 * never stay hidden.
 */
export const MOTION_BOOT_SCRIPT = `(()=>{try{var d=document.documentElement;if(matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window))return;d.dataset.motion='ready';var start=function(){var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.dataset.inview='true';o.unobserve(e.target)}})},{rootMargin:'0px 0px -12% 0px',threshold:0.15});document.querySelectorAll('${SELECTOR}').forEach(function(el){o.observe(el)});window.__motionObserver=true};if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',start)}else{start()}setTimeout(function(){if(!window.__motionObserver){delete d.dataset.motion}},4000)}catch(e){}})();`;
