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

/** Two sheets, the second stacked over the first — which is what `slideUpOpenCountAtom` exists for. */
function mountTwo(store: ReturnType<typeof createStore>, secondOpen: boolean) {
  return render(
    <Provider store={store}>
      <SlideUp isOpen setIsOpen={vi.fn()}>
        <div>under</div>
      </SlideUp>
      <SlideUp isOpen={secondOpen} setIsOpen={vi.fn()}>
        <div>over</div>
      </SlideUp>
    </Provider>
  );
}

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

  /**
   * With two sheets open the upper one's container is the right one to portal into — but when it
   * closes, the sheet underneath is still open and still needs its own. Holding a single container
   * meant the upper one's departure left *none*, and popovers over the lower sheet went back to
   * being unscrollable.
   */
  it("hands back the lower sheet's container when the upper one closes", () => {
    const store = createStore();
    const { rerender } = mountTwo(store, true);

    const upper = store.get(slideUpPopoverContainerAtom);
    expect(upper).not.toBeNull();

    rerender(
      <Provider store={store}>
        <SlideUp isOpen setIsOpen={vi.fn()}>
          <div>under</div>
        </SlideUp>
        <SlideUp isOpen={false} setIsOpen={vi.fn()}>
          <div>over</div>
        </SlideUp>
      </Provider>
    );

    const remaining = store.get(slideUpPopoverContainerAtom);
    expect(remaining).not.toBeNull();
    expect(remaining).not.toBe(upper);
    // And it is still exempt from the surviving sheet's lock.
    expect(shardsSeen.at(-1)).toContain(remaining);
  });

  it("offers the topmost sheet's container while both are open", () => {
    const store = createStore();
    mountTwo(store, true);

    const hosts = Array.from(document.body.querySelectorAll('[data-slide-up-popover-host]'));
    expect(hosts).toHaveLength(2);
    // The later sheet is the one a popover is being opened over.
    expect(store.get(slideUpPopoverContainerAtom)).toBe(hosts.at(-1));
  });
});
