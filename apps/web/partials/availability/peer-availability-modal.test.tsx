import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PeerAvailabilityModal } from './peer-availability-modal';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// The view has its own tests; these are about the shell.
vi.mock('./peer-availability', () => ({
  PeerAvailability: ({ userId }: { userId: string }) => <div data-testid="peer-availability">{userId}</div>,
}));

afterEach(() => {
  cleanup();
  push.mockClear();
});

const setup = (props: Partial<React.ComponentProps<typeof PeerAvailabilityModal>> = {}) => ({
  user: userEvent.setup(),
  ...render(<PeerAvailabilityModal open userId="user-peer" {...props} />),
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

  it('goes to Explore on close, because a shared link has no history behind it', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(push).toHaveBeenCalledWith('/explore');
  });

  it('lets a caller that does have somewhere to go override that', async () => {
    const onClose = vi.fn();
    const { user } = setup({ onClose });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('opts the content out of the bottom-sheet drag it is portalled inside', () => {
    setup();
    expect(document.querySelector('[data-no-sheet-drag]')).toBeInTheDocument();
  });
});
