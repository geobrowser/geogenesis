import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EntitySidePanelActiveTabProvider,
  useEntitySidePanelActiveTab,
} from '~/core/state/entity-side-panel-active-tab';

import { ENTITY_COMMENTS_ANCHOR_ID } from '~/partials/comments/entity-comments-anchor';

import { useScrollToCommentsOnOpen } from './use-scroll-to-comments-on-open';

/**
 * jsdom does no layout, so each element reports the offset it is given here: the anchor's `top` is
 * where it sits relative to the container's, before any scrolling.
 */
function placeAnchor(anchor: HTMLElement, container: HTMLElement, offset: () => number) {
  container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  anchor.getBoundingClientRect = () => ({ top: offset() - container.scrollTop }) as DOMRect;
}

function Harness({ request, showSection, offset }: { request: object | null; showSection: boolean; offset: number }) {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  useScrollToCommentsOnOpen(container, request);
  const offsetRef = React.useRef(offset);
  offsetRef.current = offset;

  return (
    <div ref={setContainer} data-testid="scroll">
      <div>
        {showSection ? (
          <div
            id={ENTITY_COMMENTS_ANCHOR_ID}
            ref={el => {
              if (el && container) placeAnchor(el, container, () => offsetRef.current);
            }}
          />
        ) : (
          <p>Loading…</p>
        )}
      </div>
    </div>
  );
}

/**
 * A resize observer the test can drive. The global one in `setupTests.ts` never calls back, which
 * leaves the path for size changes that add no nodes — an image loading, text reflowing — untested.
 */
class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  readonly observed = new Set<Element>();
  constructor(private readonly callback: () => void) {
    ControlledResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.observed.add(target);
  }
  unobserve(target: Element) {
    this.observed.delete(target);
  }
  disconnect() {
    this.observed.clear();
  }
  /** What the browser does when one of the observed elements changes size. */
  fire() {
    if (this.observed.size > 0) this.callback();
  }
}

function resize() {
  act(() => {
    for (const observer of ControlledResizeObserver.instances) observer.fire();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  ControlledResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function flushObservers() {
  // MutationObserver callbacks are microtasks.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useScrollToCommentsOnOpen', () => {
  it('waits for the section to render, then scrolls the container to it', async () => {
    const request = {};
    const { rerender, getByTestId } = render(<Harness request={request} showSection={false} offset={600} />);
    const container = getByTestId('scroll');
    expect(container.scrollTop).toBe(0);

    rerender(<Harness request={request} showSection offset={600} />);
    await flushObservers();

    expect(container.scrollTop).toBe(600);
  });

  it('follows the section down while the content above it fills in', async () => {
    const request = {};
    const { rerender, getByTestId } = render(<Harness request={request} showSection offset={600} />);
    const container = getByTestId('scroll');
    await flushObservers();
    expect(container.scrollTop).toBe(600);

    // The gallery above loads and pushes Activity further down.
    rerender(<Harness request={request} showSection offset={900} />);
    container.appendChild(document.createElement('span'));
    await flushObservers();

    expect(container.scrollTop).toBe(900);
  });

  it('lets go once the reader scrolls themselves', async () => {
    const request = {};
    const { rerender, getByTestId } = render(<Harness request={request} showSection offset={600} />);
    const container = getByTestId('scroll');
    await flushObservers();

    container.dispatchEvent(new Event('wheel'));
    container.scrollTop = 100;
    rerender(<Harness request={request} showSection offset={900} />);
    container.appendChild(document.createElement('span'));
    await flushObservers();

    expect(container.scrollTop).toBe(100);
  });

  it('does nothing when the panel was not opened asking for comments', async () => {
    const { getByTestId } = render(<Harness request={null} showSection offset={600} />);
    await flushObservers();

    expect(getByTestId('scroll').scrollTop).toBe(0);
  });

  it('returns the panel to its overview tab, where the Activity section lives', async () => {
    const probe: { tabs: ReturnType<typeof useEntitySidePanelActiveTab> } = { tabs: null };
    function TabProbe() {
      probe.tabs = useEntitySidePanelActiveTab();
      return null;
    }

    function Panel({ request }: { request: object | null }) {
      return (
        <EntitySidePanelActiveTabProvider entityId="claim-1" spaceId="space-1">
          <TabProbe />
          <Harness request={request} showSection={false} offset={0} />
        </EntitySidePanelActiveTabProvider>
      );
    }

    const { rerender } = render(<Panel request={null} />);
    act(() => probe.tabs?.setActiveSystemTab('debates'));
    expect(probe.tabs?.activeSystemTab).toBe('debates');

    rerender(<Panel request={{}} />);
    await flushObservers();

    expect(probe.tabs?.activeSystemTab).toBeNull();
    expect(probe.tabs?.activeTabId).toBeNull();
  });

  it('follows the section when content above it grows without adding nodes', async () => {
    const request = {};
    const { rerender, getByTestId } = render(<Harness request={request} showSection offset={600} />);
    const container = getByTestId('scroll');
    await flushObservers();
    expect(container.scrollTop).toBe(600);

    // An image above loads: the section moves, and nothing is added to the DOM.
    rerender(<Harness request={request} showSection offset={750} />);
    await flushObservers();
    expect(container.scrollTop).toBe(600);

    resize();
    expect(container.scrollTop).toBe(750);
  });

  it('watches the body that replaces the loading state, not only what was there on open', async () => {
    const request = {};
    const { getByTestId } = render(<Harness request={request} showSection={false} offset={600} />);
    const container = getByTestId('scroll');

    // The panel swaps its loading state for the body — a new direct child of the scroll container.
    const body = document.createElement('div');
    container.replaceChildren(body);
    await flushObservers();

    const observer = ControlledResizeObserver.instances[0];
    expect(observer?.observed.has(body)).toBe(true);
  });

  it('stops holding the position once the content has had time to settle', async () => {
    const request = {};
    const { rerender, getByTestId } = render(<Harness request={request} showSection offset={600} />);
    const container = getByTestId('scroll');
    await flushObservers();

    act(() => vi.advanceTimersByTime(2_000));
    rerender(<Harness request={request} showSection offset={900} />);
    resize();
    container.appendChild(document.createElement('span'));
    await flushObservers();

    expect(container.scrollTop).toBe(600);
  });

  it('gives up if the section never renders', async () => {
    const request = {};
    const { rerender, getByTestId } = render(<Harness request={request} showSection={false} offset={600} />);
    const container = getByTestId('scroll');

    act(() => vi.advanceTimersByTime(10_000));
    rerender(<Harness request={request} showSection offset={600} />);
    await flushObservers();

    // A reader who has been looking at the panel for ten seconds is not jumped down it.
    expect(container.scrollTop).toBe(0);
  });

  it.each(['touchstart', 'pointerdown', 'keydown'])('lets go on %s as well as on the wheel', async type => {
    const request = {};
    const { rerender, getByTestId } = render(<Harness request={request} showSection offset={600} />);
    const container = getByTestId('scroll');
    await flushObservers();

    container.dispatchEvent(new Event(type));
    rerender(<Harness request={request} showSection offset={900} />);
    resize();

    expect(container.scrollTop).toBe(600);
  });

  it('scrolls to the section inside the panel, not the one on the page behind it', async () => {
    // An entity page behind the panel has its own comments section with the same id, earlier in the
    // document than the panel.
    const behind = document.createElement('div');
    behind.id = ENTITY_COMMENTS_ANCHOR_ID;
    behind.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
    document.body.prepend(behind);

    try {
      const { getByTestId } = render(<Harness request={{}} showSection offset={600} />);
      await flushObservers();

      expect(getByTestId('scroll').scrollTop).toBe(600);
    } finally {
      behind.remove();
    }
  });

  it('stops watching when the panel closes', async () => {
    const request = {};
    const { unmount } = render(<Harness request={request} showSection={false} offset={600} />);
    const observer = ControlledResizeObserver.instances[0];
    expect(observer?.observed.size).toBeGreaterThan(0);

    unmount();

    expect(observer?.observed.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves the tab alone once reset, so the reader can still switch tabs', async () => {
    const probe: { tabs: ReturnType<typeof useEntitySidePanelActiveTab> } = { tabs: null };
    function TabProbe() {
      probe.tabs = useEntitySidePanelActiveTab();
      return null;
    }

    const request = {};
    render(
      <EntitySidePanelActiveTabProvider entityId="claim-1" spaceId="space-1">
        <TabProbe />
        <Harness request={request} showSection={false} offset={0} />
      </EntitySidePanelActiveTabProvider>
    );
    await flushObservers();

    act(() => probe.tabs?.setActiveSystemTab('debates'));
    await flushObservers();

    expect(probe.tabs?.activeSystemTab).toBe('debates');
  });
});
