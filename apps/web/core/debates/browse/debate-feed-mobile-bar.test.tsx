import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateFeedMobileBar } from './debate-feed-mobile-bar';

const mocks = vi.hoisted(() => ({ isPhone: true, save: vi.fn<() => Promise<void>>() }));

vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => mocks.isPhone }));

// The real link prefetches through the sync engine, which this test has no provider for.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
vi.mock('~/partials/navbar/navbar-account-actions', () => ({
  // The bar owns this subtree's lifetime. Model an open editor and a pending save so remounting
  // cannot pass by rendering a fresh, identical-looking account placeholder.
  NavbarAccountActions: function AccountActions({ placement }: { placement: string }) {
    const [open, setOpen] = React.useState(false);
    const [name, setName] = React.useState('');
    const [status, setStatus] = React.useState('Editing');

    return (
      <div data-testid="account" data-placement={placement}>
        <button onClick={() => setOpen(true)}>Edit profile</button>
        {open ? (
          <>
            <label>
              Profile name
              <input value={name} onChange={event => setName(event.target.value)} />
            </label>
            <button
              onClick={async () => {
                setStatus('Saving');
                await mocks.save();
                setStatus('Saved');
              }}
            >
              Save profile
            </button>
            <span role="status">{status}</span>
          </>
        ) : null}
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
  mocks.isPhone = true;
  mocks.save.mockReset();
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

  it('does not mount account controls on a desktop-only visit', async () => {
    mocks.isPhone = false;
    render(<DebateFeedMobileBar />);

    // Let the client-only chunk resolve, so absence is not just "not loaded yet".
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByTestId('account')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'preserves profile edits and a pending save across resize (starts desktop: %s)',
    async startsDesktop => {
      mocks.isPhone = !startsDesktop;
      const user = userEvent.setup();
      const { rerender } = render(<DebateFeedMobileBar />);
      if (startsDesktop) {
        expect(screen.queryByTestId('account')).not.toBeInTheDocument();
        mocks.isPhone = true;
        rerender(<DebateFeedMobileBar />);
      }

      let finishSave!: () => void;
      const pendingSave = new Promise<void>(resolve => {
        finishSave = resolve;
      });
      mocks.save.mockReturnValue(pendingSave);

      await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
      await user.type(screen.getByRole('textbox', { name: 'Profile name' }), 'Ada');
      await user.click(screen.getByRole('button', { name: 'Save profile' }));
      const account = screen.getByTestId('account');
      expect(screen.getByRole('status')).toHaveTextContent('Saving');

      mocks.isPhone = false;
      rerender(<DebateFeedMobileBar />);

      expect(screen.getByTestId('account')).toBe(account);
      expect(screen.getByRole('textbox', { name: 'Profile name' })).toHaveValue('Ada');
      expect(screen.getByRole('status')).toHaveTextContent('Saving');

      await act(async () => {
        finishSave();
        await pendingSave;
      });
      expect(screen.getByRole('status')).toHaveTextContent('Saved');

      mocks.isPhone = true;
      rerender(<DebateFeedMobileBar />);

      expect(screen.getByTestId('account')).toBe(account);
      expect(screen.getByRole('textbox', { name: 'Profile name' })).toHaveValue('Ada');
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
      expect(mocks.save).toHaveBeenCalledTimes(1);
    }
  );

  it('sets "Geo" in the share video’s face', () => {
    render(<DebateFeedMobileBar />);

    expect(screen.getByText('Geo')).toHaveClass('font-[family-name:var(--font-geist-medium)]');
  });
});
