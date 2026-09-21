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

  // The ref is focusable, which is the whole point of handing it to a dialog.
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
