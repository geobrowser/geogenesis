import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useContentBelow } from './use-content-below';

let notifyResize: () => void;
let observe: ReturnType<typeof vi.fn>;
let disconnect: ReturnType<typeof vi.fn>;

function Harness({ enabled = true }: { enabled?: boolean }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const hasContentBelow = useContentBelow(scrollRef, contentRef, enabled);
  return (
    <>
      <div ref={scrollRef} data-testid="viewport">
        <div ref={contentRef} data-testid="content" />
      </div>
      <output>{hasContentBelow ? 'More interests below' : 'End of interests'}</output>
    </>
  );
}

function setGeometry(scrollHeight: number, clientHeight: number, scrollTop = 0) {
  const viewport = screen.getByTestId('viewport');
  Object.defineProperties(viewport, {
    scrollHeight: { configurable: true, value: scrollHeight },
    clientHeight: { configurable: true, value: clientHeight },
    scrollTop: { configurable: true, value: scrollTop },
  });
  return viewport;
}

beforeEach(() => {
  observe = vi.fn();
  disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notifyResize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useContentBelow', () => {
  it('does not separate the footer when all interests fit', () => {
    render(<Harness />);
    setGeometry(200, 300);
    act(() => notifyResize());

    expect(screen.getByRole('status').textContent).toBe('End of interests');
    expect(observe.mock.calls.map(([element]) => element)).toEqual([
      screen.getByTestId('viewport'),
      screen.getByTestId('content'),
    ]);
  });

  it('shows the divider for hidden content and removes it at the bottom', () => {
    render(<Harness />);
    const viewport = setGeometry(500, 300);
    act(() => notifyResize());
    expect(screen.getByRole('status').textContent).toBe('More interests below');

    setGeometry(500, 300, 200);
    fireEvent.scroll(viewport);
    expect(screen.getByRole('status').textContent).toBe('End of interests');

    setGeometry(500, 300, 50);
    fireEvent.scroll(viewport);
    expect(screen.getByRole('status').textContent).toBe('More interests below');
  });

  it('updates when the pills rewrap or the viewport changes size', () => {
    render(<Harness />);
    setGeometry(300, 300);
    act(() => notifyResize());
    expect(screen.getByRole('status').textContent).toBe('End of interests');

    setGeometry(450, 300);
    act(() => notifyResize());
    expect(screen.getByRole('status').textContent).toBe('More interests below');

    setGeometry(450, 500);
    act(() => notifyResize());
    expect(screen.getByRole('status').textContent).toBe('End of interests');
  });

  it('measures when loading finishes and hides the divider during another load', () => {
    const { rerender } = render(<Harness enabled={false} />);
    setGeometry(500, 300);
    expect(observe).not.toHaveBeenCalled();

    rerender(<Harness />);
    expect(screen.getByRole('status').textContent).toBe('More interests below');
    rerender(<Harness enabled={false} />);
    expect(screen.getByRole('status').textContent).toBe('End of interests');
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('still measures scrolling and window resizing without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<Harness />);
    const viewport = setGeometry(500, 300);
    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('status').textContent).toBe('More interests below');

    setGeometry(500, 300, 199.5);
    fireEvent.scroll(viewport);
    expect(screen.getByRole('status').textContent).toBe('End of interests');
  });

  it('disconnects the observer and listeners on unmount', () => {
    const { unmount } = render(<Harness />);
    const removeScrollListener = vi.spyOn(screen.getByTestId('viewport'), 'removeEventListener');
    const removeResizeListener = vi.spyOn(window, 'removeEventListener');
    unmount();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeScrollListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(removeResizeListener).toHaveBeenCalledWith('resize', expect.any(Function));
    removeResizeListener.mockRestore();
  });
});
