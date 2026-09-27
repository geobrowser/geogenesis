import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Menu } from './menu';

// The placement hook observes the trigger, and JSDOM has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe('Menu triggerRef', () => {
  // Callers opening a dialog from a menu item hand this ref on as the dialog's return target, so
  // it has to reach the rendered trigger. `navbar-actions` mocks `Menu`, and would not notice.
  it('points a caller-supplied ref at the rendered trigger', () => {
    const triggerRef = React.createRef<HTMLButtonElement>();

    render(
      <Menu open={false} onOpenChange={() => {}} triggerRef={triggerRef} trigger={<span>Open</span>}>
        <button type="button">Item</button>
      </Menu>
    );

    expect(triggerRef.current).toBe(screen.getByText('Open').closest('button'));
    expect(triggerRef.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('still renders its trigger when no ref is passed', () => {
    render(
      <Menu open={false} onOpenChange={() => {}} trigger={<span>Open</span>}>
        <button type="button">Item</button>
      </Menu>
    );

    expect(screen.getByText('Open').closest('button')).toBeInTheDocument();
  });

  // A dialog restores focus to this node, so it has to be focusable.
  it('gives a focusable trigger while the menu is open', () => {
    const triggerRef = React.createRef<HTMLButtonElement>();

    render(
      <Menu open onOpenChange={() => {}} triggerRef={triggerRef} trigger={<span>Open</span>}>
        <button type="button">Item</button>
      </Menu>
    );

    triggerRef.current?.focus();
    expect(document.activeElement).toBe(triggerRef.current);
  });
});

describe('Menu viewportRef', () => {
  // The prop is typed as a full React ref, and React 19's callback-ref contract includes returning
  // a cleanup. A caller that does — attaching an observer to the viewport, say — must have that
  // cleanup honoured, not dropped, and must not then be handed `null` it was promised would not
  // come.
  //
  // Both harnesses hold their callback stable. An inline one changes identity every render, and
  // React detaches and reattaches a ref whose identity moved — real, but a different subject, and
  // it would drown the semantics under test in churn.
  it('honours a callback ref that returns a cleanup', () => {
    const calls: (HTMLElement | null)[] = [];
    let cleanupRan = 0;

    function Harness({ open }: { open: boolean }) {
      const viewportRef = React.useCallback((node: HTMLDivElement | null) => {
        calls.push(node);
        return () => {
          cleanupRan += 1;
        };
      }, []);

      return (
        <Menu open={open} onOpenChange={() => {}} viewportRef={viewportRef} trigger={<span>Open</span>}>
          <button type="button">Item</button>
        </Menu>
      );
    }

    const view = render(<Harness open={true} />);
    expect(calls).toEqual([expect.any(HTMLDivElement)]);
    expect(cleanupRan).toBe(0);

    view.rerender(<Harness open={false} />);

    expect(cleanupRan).toBe(1);
    // Not called again with null: the cleanup replaces that call, and a caller written to the
    // cleanup contract may well dereference the node it was given.
    expect(calls).toEqual([expect.any(HTMLDivElement)]);
  });

  it('still clears a plain callback ref that returns nothing', () => {
    const calls: (HTMLElement | null)[] = [];

    function Harness({ open }: { open: boolean }) {
      const viewportRef = React.useCallback((node: HTMLDivElement | null) => {
        calls.push(node);
      }, []);

      return (
        <Menu open={open} onOpenChange={() => {}} viewportRef={viewportRef} trigger={<span>Open</span>}>
          <button type="button">Item</button>
        </Menu>
      );
    }

    const view = render(<Harness open={true} />);
    view.rerender(<Harness open={false} />);

    // The legacy path is untouched: no cleanup returned, so React clears it with null as before.
    expect(calls).toEqual([expect.any(HTMLDivElement), null]);
  });
});

describe('Menu alignment', () => {
  it('honors an explicit trigger-edge alignment', () => {
    render(
      <Menu open onOpenChange={() => {}} align="start" trigger={<span>Open</span>}>
        <button type="button">Item</button>
      </Menu>
    );

    expect(screen.getByText('Item').closest('[data-align]')).toHaveAttribute('data-align', 'start');
  });
});
