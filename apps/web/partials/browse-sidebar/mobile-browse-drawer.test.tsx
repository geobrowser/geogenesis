import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileBrowseDrawer } from './mobile-browse-drawer';

vi.mock('./browse-sidebar', () => ({
  BrowseSidebar: ({ onClose }: { onClose: () => void }) => (
    <aside>
      <a href="/explore" onClick={event => event.preventDefault()}>
        Explore
      </a>
      <button type="button" onClick={onClose}>
        Close browse menu
      </button>
    </aside>
  ),
}));

describe('MobileBrowseDrawer', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('presents the browse tree as a modal drawer and closes after navigation', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const triggerRef = React.createRef<HTMLButtonElement>();

    render(<MobileBrowseDrawer open onOpenChange={onOpenChange} triggerRef={triggerRef} />);

    expect(screen.getByRole('dialog', { name: 'Browse Geo' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Explore' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers an explicit close control', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const triggerRef = React.createRef<HTMLButtonElement>();

    render(<MobileBrowseDrawer open onOpenChange={onOpenChange} triggerRef={triggerRef} />);

    await user.click(screen.getByRole('button', { name: 'Close browse menu' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('restores focus to the external Browse button after closing', async () => {
    const user = userEvent.setup();

    function DrawerHarness() {
      const [open, setOpen] = React.useState(true);
      const triggerRef = React.useRef<HTMLButtonElement>(null);

      return (
        <>
          <button ref={triggerRef} type="button">
            Open browse menu
          </button>
          <MobileBrowseDrawer open={open} onOpenChange={setOpen} triggerRef={triggerRef} />
        </>
      );
    }

    render(<DrawerHarness />);
    await user.click(screen.getByRole('button', { name: 'Close browse menu' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open browse menu' })).toHaveFocus());
  });

  it('closes when the viewport grows beyond the mobile breakpoint', () => {
    let breakpointListener: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          breakpointListener = listener;
        },
        removeEventListener: vi.fn(),
      }))
    );
    const onOpenChange = vi.fn();
    const triggerRef = React.createRef<HTMLButtonElement>();

    render(<MobileBrowseDrawer open onOpenChange={onOpenChange} triggerRef={triggerRef} />);
    act(() => breakpointListener?.({ matches: false } as MediaQueryListEvent));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
