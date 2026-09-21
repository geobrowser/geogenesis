import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Navbar } from './navbar';

vi.mock('~/design-system/client-only', () => ({
  ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./navbar-client-actions', () => ({
  NavbarClientActions: () => <div data-testid="client-actions" />,
}));
// This suite owns the navbar and metadata links in the shrink chain. Focused breadcrumb tests
// render all three real breadcrumb branches so this stand-in cannot conceal an inner break.
vi.mock('./navbar-breadcrumb', () => ({
  NavbarBreadcrumb: () => <div data-testid="breadcrumb-inner" />,
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));
// The metadata reads its space from the route, so the breadcrumb only renders with one present.
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'space-1' }) }));
vi.mock('~/design-system/icons/geo-logo-large', () => ({ GeoLogoLarge: () => <svg /> }));
// Reaches the sync engine through its prefetch behaviour; this suite only needs it to be a link.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

afterEach(cleanup);

describe('Navbar', () => {
  /**
   * The two groups are a fixed-size right and a variable-length left. At the 320px floor, even a
   * zero-width breadcrumb did not leave enough room for the fixed controls until the navbar and
   * both nested action rows adopted a narrower spacing step.
   *
   * Asserted structurally because jsdom has no layout: it reports every width as zero, so an
   * overflow cannot be measured here. What can be pinned is which side is allowed to give.
   */
  it('lets the breadcrumb shrink and compacts the fixed layout at the narrowest width', () => {
    const { getByTestId, container } = render(<Navbar onBrowseClick={vi.fn()} onSearchClick={vi.fn()} />);

    // `parentElement`, not `closest('div')` — both stand-ins are themselves divs, so `closest`
    // returns the stand-in and reports an empty className.
    const left = getByTestId('breadcrumb-inner').parentElement?.parentElement;
    const right = getByTestId('client-actions').parentElement;

    expect(left?.className ?? '').toContain('min-w-0');
    // And the link in between, which is where the chain used to break: `min-w-0` on the outer
    // group lets it shrink, but a child at the default `min-width: auto` still will not, so the
    // breadcrumb's own `truncate` never gets a constrained width and the text paints outside.
    expect(getByTestId('breadcrumb-inner').parentElement?.className ?? '').toContain('min-w-0');
    expect(right?.className ?? '').toContain('shrink-0');
    expect(container.firstElementChild?.className ?? '').toContain('justify-between');
    expect(container.firstElementChild).toHaveClass('max-[359px]:px-2', 'max-[359px]:gap-0');
    expect(left).toHaveClass('max-[359px]:gap-2!');
  });

  it('opens browse navigation from a full-height touch target', async () => {
    const onBrowseClick = vi.fn();
    const user = userEvent.setup();
    const browseButtonRef = React.createRef<HTMLButtonElement>();
    const navbarRef = React.createRef<HTMLElement>();

    render(
      <Navbar
        browseButtonRef={browseButtonRef}
        navbarRef={navbarRef}
        onBrowseClick={onBrowseClick}
        onSearchClick={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Open browse menu' });
    expect(navbarRef.current).toBe(screen.getByRole('navigation'));
    expect(browseButtonRef.current).toBe(button);
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'mobile-browse-drawer');
    expect(button).toHaveClass('h-11', 'w-11', 'mobile:flex');

    await user.click(button);
    expect(onBrowseClick).toHaveBeenCalledOnce();
  });

  it('removes the browse control during fullscreen experiences', () => {
    render(<Navbar onBrowseClick={vi.fn()} onSearchClick={vi.fn()} showBrowseButton={false} />);

    expect(screen.queryByRole('button', { name: 'Open browse menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('link')).not.toHaveClass('mobile:hidden');
  });
});
