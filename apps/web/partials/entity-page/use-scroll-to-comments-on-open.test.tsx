import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMENTS_ANCHOR_ID, useScrollToCommentsOnOpen } from './use-scroll-to-comments-on-open';

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
            id={COMMENTS_ANCHOR_ID}
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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
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
});
