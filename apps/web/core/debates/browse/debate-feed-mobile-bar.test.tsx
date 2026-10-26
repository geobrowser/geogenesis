import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateFeedMobileBar } from './debate-feed-mobile-bar';

const mocks = vi.hoisted(() => ({ isPhone: true }));

vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => mocks.isPhone }));

// The real link prefetches through the sync engine, which this test has no provider for.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
vi.mock('~/partials/navbar/navbar-account-actions', () => ({
  NavbarAccountActions: ({ placement }: { placement: string }) => (
    <div data-testid="account" data-placement={placement} />
  ),
}));

afterEach(() => {
  cleanup();
  mocks.isPhone = true;
});

describe('DebateFeedMobileBar', () => {
  it('links the Geo lockup to Explore', () => {
    render(<DebateFeedMobileBar />);

    expect(screen.getByRole('link', { name: 'Geo' })).toHaveAttribute('href', '/explore');
  });

  // Desktop keeps the app navbar, which the feed sits under there.
  it('shows on phones only', () => {
    render(<DebateFeedMobileBar />);

    expect(screen.getByRole('banner')).toHaveClass('hidden', 'md:flex', 'h-11');
  });

  it('mounts the account controls on phones', async () => {
    render(<DebateFeedMobileBar />);

    expect(await screen.findByTestId('account')).toHaveAttribute('data-placement', 'debate_feed_bar');
  });

  // Hidden by CSS alone, a desktop copy would run beside the app navbar's: a second ⌘E listener, a
  // second edit mode tip.
  it('does not mount them where the bar is hidden', async () => {
    mocks.isPhone = false;
    render(<DebateFeedMobileBar />);

    // Let the client-only chunk resolve, so absence is not just "not loaded yet".
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByTestId('account')).not.toBeInTheDocument();
  });

  it('sets "Geo" in the share video’s face', () => {
    render(<DebateFeedMobileBar />);

    expect(screen.getByText('Geo')).toHaveClass('font-[family-name:var(--font-geist-medium)]');
  });
});
