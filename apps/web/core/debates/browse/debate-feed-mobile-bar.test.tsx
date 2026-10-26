import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileNavbarActions } from '~/partials/navbar/mobile-navbar-actions';

import { DebateFeedMobileBar } from './debate-feed-mobile-bar';

const mocks = vi.hoisted(() => ({ authenticated: false, isPhone: true }));

vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => mocks.isPhone }));

// The real link prefetches through the sync engine, which this test has no provider for.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => ({ authenticated: mocks.authenticated }) }));
vi.mock('~/partials/navbar/navbar-actions', () => ({
  NavbarActions: ({ compact, signInComponent }: { compact?: boolean; signInComponent?: string }) => (
    <div data-testid="account" data-compact={String(compact)} data-sign-in-component={signInComponent} />
  ),
}));
vi.mock('~/core/debates/matchmaking/debates-hub-button', () => ({
  DebatesHubButton: ({ compact }: { compact?: boolean }) => (
    <button type="button" data-compact={String(compact)}>
      Debate
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  mocks.authenticated = false;
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

    expect(await screen.findByTestId('account')).toBeInTheDocument();
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

describe('MobileNavbarActions', () => {
  it('is Log in alone while signed out', () => {
    render(<MobileNavbarActions signInComponent="debate_feed_bar" />);

    expect(screen.getByTestId('account')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByTestId('account')).toHaveAttribute('data-sign-in-component', 'debate_feed_bar');
    expect(screen.queryByRole('button', { name: 'Debate' })).not.toBeInTheDocument();
  });

  it('adds the compact Debate button once signed in', () => {
    mocks.authenticated = true;
    render(<MobileNavbarActions signInComponent="debate_feed_bar" />);

    expect(screen.getByRole('button', { name: 'Debate' })).toHaveAttribute('data-compact', 'true');
    expect(screen.getByTestId('account')).toHaveAttribute('data-compact', 'true');
  });
});
