import { render } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SlideUp } from './slide-up';
import { slideUpPopoverContainerAtom } from '~/atoms';

/**
 * Captures what the sheet exempts from its scroll lock, which is the half that makes the popover
 * scrollable. Hoisted, because `vi.mock` factories are lifted above module-level bindings — and the
 * stand-in returns its children rather than wrapping them, so the factory needs no JSX of its own.
 */
const { shardsSeen } = vi.hoisted(() => ({ shardsSeen: [] as unknown[][] }));

vi.mock('react-remove-scroll', () => ({
  RemoveScroll: ({ children, shards }: { children: React.ReactNode; shards?: unknown[] }) => {
    shardsSeen.push(shards ?? []);
    return children;
  },
}));

afterEach(() => {
  document.body.querySelectorAll('[data-slide-up-popover-host]').forEach(node => node.remove());
  shardsSeen.length = 0;
});

function mount(store: ReturnType<typeof createStore>, isOpen: boolean) {
  return render(
    <Provider store={store}>
      <SlideUp isOpen={isOpen} setIsOpen={vi.fn()}>
        <div>sheet</div>
      </SlideUp>
    </Provider>
  );
}

/**
 * A popover opened from inside a sheet portals to the body, which puts it outside the sheet's scroll
 * lock — so raising it above the sheet is only half of what it needs. This container is on the body
 * (where the popover's positioning already works) and is registered as a scroll shard, so what lands
 * in it can be scrolled.
 */
describe('SlideUp popover container', () => {
  it('offers no container while closed', () => {
    const store = createStore();
    mount(store, false);

    expect(store.get(slideUpPopoverContainerAtom)).toBeNull();
    expect(document.body.querySelector('[data-slide-up-popover-host]')).toBeNull();
  });

  it('offers a body-level container while open', () => {
    const store = createStore();
    mount(store, true);

    const container = store.get(slideUpPopoverContainerAtom);
    expect(container).not.toBeNull();
    expect(container?.parentElement).toBe(document.body);
  });

  it('withdraws it when the sheet closes', () => {
    const store = createStore();
    const { rerender } = mount(store, true);
    expect(store.get(slideUpPopoverContainerAtom)).not.toBeNull();

    rerender(
      <Provider store={store}>
        <SlideUp isOpen={false} setIsOpen={vi.fn()}>
          <div>sheet</div>
        </SlideUp>
      </Provider>
    );

    expect(store.get(slideUpPopoverContainerAtom)).toBeNull();
  });

  it('withdraws it when the sheet unmounts', () => {
    const store = createStore();
    const { unmount } = mount(store, true);
    expect(store.get(slideUpPopoverContainerAtom)).not.toBeNull();

    unmount();

    expect(store.get(slideUpPopoverContainerAtom)).toBeNull();
  });

  /**
   * Offering the container is only half of it: unless the sheet exempts it, `RemoveScroll` still
   * suppresses wheel and touch inside whatever lands there — which is the case being fixed, a
   * responder list taller than its own max-height that can be read and not scrolled.
   */
  it('exempts that container from its own scroll lock', () => {
    const store = createStore();
    mount(store, true);

    const container = store.get(slideUpPopoverContainerAtom);
    expect(container).not.toBeNull();
    expect(shardsSeen.at(-1)).toContain(container);
  });
});
