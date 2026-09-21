import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileBrowseDrawer } from './mobile-browse-drawer';

const pathname = { current: '/explore' };
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

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
    pathname.current = '/explore';
    vi.unstubAllGlobals();
  });

  it('presents the browse tree as a modal drawer and closes after navigation', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const triggerRef = React.createRef<HTMLButtonElement>();
    const fallbackFocusRef = React.createRef<HTMLElement>();

    render(
      <MobileBrowseDrawer
        open
        fallbackFocusRef={fallbackFocusRef}
        fullscreenFocusTarget={null}
        onOpenChange={onOpenChange}
        triggerRef={triggerRef}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Browse Geo' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Explore' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers an explicit close control', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const triggerRef = React.createRef<HTMLButtonElement>();
    const fallbackFocusRef = React.createRef<HTMLElement>();

    render(
      <MobileBrowseDrawer
        open
        fallbackFocusRef={fallbackFocusRef}
        fullscreenFocusTarget={null}
        onOpenChange={onOpenChange}
        triggerRef={triggerRef}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Close browse menu' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes when browser navigation changes the route without a drawer click', () => {
    const onOpenChange = vi.fn();
    const triggerRef = React.createRef<HTMLButtonElement>();
    const fallbackFocusRef = React.createRef<HTMLElement>();
    const view = render(
      <MobileBrowseDrawer
        open
        fallbackFocusRef={fallbackFocusRef}
        fullscreenFocusTarget={null}
        onOpenChange={onOpenChange}
        triggerRef={triggerRef}
      />
    );

    pathname.current = '/root';
    view.rerender(
      <MobileBrowseDrawer
        open
        fallbackFocusRef={fallbackFocusRef}
        fullscreenFocusTarget={null}
        onOpenChange={onOpenChange}
        triggerRef={triggerRef}
      />
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('restores focus to the external Browse button after closing', async () => {
    const user = userEvent.setup();

    function DrawerHarness() {
      const [open, setOpen] = React.useState(true);
      const triggerRef = React.useRef<HTMLButtonElement>(null);
      const fallbackFocusRef = React.useRef<HTMLElement>(null);

      return (
        <>
          <nav ref={fallbackFocusRef} tabIndex={-1} aria-label="Fallback navigation" />
          <button ref={triggerRef} type="button">
            Open browse menu
          </button>
          <MobileBrowseDrawer
            open={open}
            fallbackFocusRef={fallbackFocusRef}
            fullscreenFocusTarget={null}
            onOpenChange={setOpen}
            triggerRef={triggerRef}
          />
        </>
      );
    }

    render(<DrawerHarness />);
    await user.click(screen.getByRole('button', { name: 'Close browse menu' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open browse menu' })).toHaveFocus());
  });

  it('closes and focuses the stable fallback when the viewport grows beyond the mobile breakpoint', async () => {
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
    function BreakpointHarness() {
      const [open, setOpen] = React.useState(true);
      const triggerRef = React.useRef<HTMLButtonElement>(null);
      const fallbackFocusRef = React.useRef<HTMLElement>(null);

      return (
        <>
          <nav ref={fallbackFocusRef} tabIndex={-1} aria-label="Fallback navigation" />
          <button ref={triggerRef} type="button" style={{ display: 'none' }}>
            Hidden Browse trigger
          </button>
          <MobileBrowseDrawer
            open={open}
            fallbackFocusRef={fallbackFocusRef}
            fullscreenFocusTarget={null}
            onOpenChange={setOpen}
            triggerRef={triggerRef}
          />
        </>
      );
    }

    render(<BreakpointHarness />);
    act(() => breakpointListener?.({ matches: false } as MediaQueryListEvent));

    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Fallback navigation' })).toHaveFocus());
  });

  it('closes immediately when opened after the viewport is already above the mobile breakpoint', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    const onOpenChange = vi.fn();
    const triggerRef = React.createRef<HTMLButtonElement>();
    const fallbackFocusRef = React.createRef<HTMLElement>();

    render(
      <MobileBrowseDrawer
        open
        fallbackFocusRef={fallbackFocusRef}
        fullscreenFocusTarget={null}
        onOpenChange={onOpenChange}
        triggerRef={triggerRef}
      />
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('focuses the stable fallback when fullscreen unmounts the Browse trigger', async () => {
    const onOpenChange = vi.fn();

    function FullscreenHarness({ fullscreen }: { fullscreen: boolean }) {
      const triggerRef = React.useRef<HTMLButtonElement>(null);
      const fallbackFocusRef = React.useRef<HTMLElement>(null);
      const [fullscreenFocusTarget, setFullscreenFocusTarget] = React.useState<HTMLElement | null>(null);

      return (
        <>
          <main
            ref={setFullscreenFocusTarget}
            tabIndex={-1}
            aria-label="Ranking fullscreen"
            style={{ display: fullscreen ? undefined : 'none' }}
          />
          <nav
            ref={fallbackFocusRef}
            tabIndex={-1}
            aria-label="Hidden fallback navigation"
            style={{ display: fullscreen ? 'none' : undefined }}
          />
          {fullscreen ? null : (
            <button ref={triggerRef} type="button">
              Open browse menu
            </button>
          )}
          <MobileBrowseDrawer
            open={!fullscreen}
            fallbackFocusRef={fallbackFocusRef}
            fullscreenFocusTarget={fullscreen ? fullscreenFocusTarget : null}
            onOpenChange={onOpenChange}
            triggerRef={triggerRef}
          />
        </>
      );
    }

    const { rerender } = render(<FullscreenHarness fullscreen={false} />);
    rerender(<FullscreenHarness fullscreen />);

    await waitFor(() => expect(screen.getByRole('main', { name: 'Ranking fullscreen' })).toHaveFocus());
  });

  it('prefers the visible navbar over the fullscreen surface when the Browse trigger is gone', async () => {
    const user = userEvent.setup();

    function VisibleNavbarHarness() {
      const [open, setOpen] = React.useState(true);
      const triggerRef = React.useRef<HTMLButtonElement>(null);
      const fallbackFocusRef = React.useRef<HTMLElement>(null);
      const [fullscreenFocusTarget, setFullscreenFocusTarget] = React.useState<HTMLElement | null>(null);

      return (
        <>
          <main ref={setFullscreenFocusTarget} tabIndex={-1} aria-label="Ranking fullscreen" />
          <nav ref={fallbackFocusRef} tabIndex={-1} aria-label="Visible fallback navigation" />
          <MobileBrowseDrawer
            open={open}
            fallbackFocusRef={fallbackFocusRef}
            fullscreenFocusTarget={fullscreenFocusTarget}
            onOpenChange={setOpen}
            triggerRef={triggerRef}
          />
        </>
      );
    }

    render(<VisibleNavbarHarness />);
    await user.click(screen.getByRole('button', { name: 'Close browse menu' }));

    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Visible fallback navigation' })).toHaveFocus());
  });
});
