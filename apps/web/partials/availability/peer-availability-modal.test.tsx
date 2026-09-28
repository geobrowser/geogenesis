import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PeerAvailabilityModal } from './peer-availability-modal';

// The view has its own tests; these are about the shell.
vi.mock('./peer-availability', () => ({
  PeerAvailability: ({ userId }: { userId: string }) => <div data-testid="peer-availability">{userId}</div>,
}));

const onClose = vi.fn();

afterEach(() => {
  cleanup();
  onClose.mockClear();
});

const setup = (props: Partial<React.ComponentProps<typeof PeerAvailabilityModal>> = {}) => ({
  user: userEvent.setup(),
  ...render(<PeerAvailabilityModal open userId="user-peer" onClose={onClose} {...props} />),
});

describe('PeerAvailabilityModal', () => {
  it('renders the view for the given user', () => {
    setup();
    expect(screen.getByTestId('peer-availability')).toHaveTextContent('user-peer');
  });

  it('mounts nothing while closed, so reopening asks again', () => {
    setup({ open: false });
    expect(screen.queryByTestId('peer-availability')).not.toBeInTheDocument();
  });

  // Where closing goes is the caller's to decide -- a hub row returns to the hub, and the eventual
  // shared-link route will send Explore. The dialog needs no router of its own, which is also what
  // lets it mount anywhere without one.
  it('hands closing back to whoever opened it', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('opts the content out of the bottom-sheet drag it is portalled inside', () => {
    setup();
    expect(document.querySelector('[data-no-sheet-drag]')).toBeInTheDocument();
  });
});
