import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pathname } = vi.hoisted(() => ({ pathname: vi.fn(() => '/en') }));
vi.mock('next/navigation', () => ({ usePathname: pathname }));

import { MotionObserver } from './motion-observer';

class TestIntersectionObserver {
  static instances: TestIntersectionObserver[] = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: IntersectionObserverCallback) {
    TestIntersectionObserver.instances.push(this);
  }

  intersect(target: Element): void {
    this.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

class TestMutationObserver {
  static instances: TestMutationObserver[] = [];
  readonly disconnect = vi.fn();

  constructor(private readonly callback: MutationCallback) {
    TestMutationObserver.instances.push(this);
  }

  observe = vi.fn();

  add(...nodes: Node[]): void {
    this.callback(
      [{ addedNodes: nodes } as unknown as MutationRecord],
      this as unknown as MutationObserver,
    );
  }
}

describe('MotionObserver', () => {
  beforeEach(() => {
    TestIntersectionObserver.instances = [];
    TestMutationObserver.instances = [];
    document.documentElement.dataset.motion = 'ready';
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.motion;
    vi.unstubAllGlobals();
  });

  it('observes elements appended after mount and marks them in view', () => {
    render(<MotionObserver />);
    const element = document.createElement('div');
    element.setAttribute('data-reveal', '');
    document.body.append(element);

    const intersection = TestIntersectionObserver.instances[0]!;
    const mutations = TestMutationObserver.instances[0]!;
    mutations.add(element);
    expect(intersection.observe).toHaveBeenCalledWith(element);

    intersection.intersect(element);
    expect(element).toHaveAttribute('data-inview', 'true');
    expect(intersection.unobserve).toHaveBeenCalledWith(element);
    element.remove();
  });

  it('keeps the mount scan and disconnects both observers on cleanup', () => {
    const existing = document.createElement('p');
    existing.setAttribute('data-write', '');
    document.body.append(existing);
    const view = render(<MotionObserver />);
    const intersection = TestIntersectionObserver.instances[0]!;
    const mutations = TestMutationObserver.instances[0]!;

    expect(intersection.observe).toHaveBeenCalledWith(existing);
    intersection.intersect(existing);
    expect(existing).toHaveAttribute('data-inview', 'true');

    view.unmount();
    expect(mutations.observe).toHaveBeenCalledWith(document.body, {
      childList: true,
      subtree: true,
    });
    expect(mutations.disconnect).toHaveBeenCalledOnce();
    expect(intersection.disconnect).toHaveBeenCalledOnce();
    existing.remove();
  });
});
