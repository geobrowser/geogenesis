import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SharedAvailabilityLauncher, SharedAvailabilityModal } from './shared-availability';

const auth = { ready: true, authenticated: true };
let profile: { isPending: boolean; isError: boolean; data?: unknown } = { isPending: true, isError: false };
const signIn = vi.fn();
const replace = vi.fn();
let search = 'availability=1';

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => auth,
  useDebateProfile: () => profile,
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => signIn }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/space/profile-space',
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));
// The booking modal has its own tests; these are about what gets handed to it.
vi.mock('./peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: ({
    open,
    userId,
    peerName,
    onClose,
    children,
  }: {
    open: boolean;
    userId: string;
    peerName?: string | null;
    onClose: () => void;
    children?: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="booking-modal" data-user-id={userId} data-peer-name={peerName ?? ''}>
        {children ?? <div data-testid="week" />}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

const person = { user_id: 'chat-user-1', profile_space_id: 'profile-space', display_name: 'Ada', avatar_cid: null };

beforeEach(() => {
  auth.ready = true;
  auth.authenticated = true;
  profile = { isPending: true, isError: false };
  search = 'availability=1';
});

afterEach(() => {
  cleanup();
  signIn.mockClear();
  replace.mockClear();
});

const renderModal = () =>
  render(<SharedAvailabilityModal open profileSpaceId="profile-space" fallbackName="Ada L." onClose={() => {}} />);

describe('SharedAvailabilityModal', () => {
  it('asks a signed-out recipient to sign in, naming the person', async () => {
    auth.authenticated = false;
    renderModal();

    expect(screen.getByText(/Sign in to see when Ada L\. is free/)).toBeInTheDocument();
    expect(screen.queryByTestId('week')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('does not flash "sign in" before Privy is ready', () => {
    auth.ready = false;
    auth.authenticated = false;
    renderModal();

    expect(screen.getByText('Loading availability…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('opens the bookable week for the geo-chat user behind the profile', () => {
    profile = { isPending: false, isError: false, data: { user: person, is_self: false } };
    renderModal();

    const modal = screen.getByTestId('booking-modal');
    expect(modal).toHaveAttribute('data-user-id', 'chat-user-1');
    expect(modal).toHaveAttribute('data-peer-name', 'Ada');
    expect(screen.getByTestId('week')).toBeInTheDocument();
  });

  it('tells the owner it is their own link rather than booking themselves', () => {
    profile = { isPending: false, isError: false, data: { user: person, is_self: true } };
    renderModal();

    expect(screen.getByText(/This is your availability link/)).toBeInTheDocument();
    expect(screen.queryByTestId('week')).not.toBeInTheDocument();
  });

  it('says so when the profile cannot be resolved', () => {
    profile = { isPending: false, isError: true };
    renderModal();

    expect(screen.getByText('Couldn’t load their availability.')).toBeInTheDocument();
  });
});

describe('SharedAvailabilityLauncher', () => {
  it('does nothing on a profile reached without the link', () => {
    search = 'tab=claims';
    render(<SharedAvailabilityLauncher profileSpaceId="profile-space" />);

    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
  });

  it('opens from the link and takes the parameter back off on close', async () => {
    search = 'availability=1&tab=claims';
    profile = { isPending: false, isError: false, data: { user: person, is_self: false } };
    render(<SharedAvailabilityLauncher profileSpaceId="profile-space" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/space/profile-space?tab=claims', { scroll: false });
  });
});
