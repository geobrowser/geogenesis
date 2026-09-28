import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AvailabilityDeepLink, SharedAvailabilityModal } from './shared-availability';

const auth = { ready: true, authenticated: true };
let profile: { isPending: boolean; isError: boolean; data?: unknown } = { isPending: true, isError: false };
const signIn = vi.fn();
let signInCallbacks: { onComplete?: () => void; onError?: () => void } = {};
let personalSpaceId: string | null = null;
let search = 'modal=availability&modalTarget=profile-space';
let signInOptions: { redirectTo?: string } | undefined;

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => auth,
  useDebateProfile: () => profile,
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (onComplete?: () => void, options?: { onError?: () => void; redirectTo?: string }) => {
    signInCallbacks = { onComplete, onError: options?.onError };
    signInOptions = options;
    return signIn;
  },
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId }) }));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: { entity: { name: 'Ada L.' } } }) }));
vi.mock('./own-schedule-modal', () => ({
  OwnScheduleModal: ({ open }: { open: boolean }) => (open ? <div data-testid="own-schedule-modal" /> : null),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/space/profile-space',
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
  search = 'modal=availability&modalTarget=profile-space';
  personalSpaceId = null;
  signInOptions = undefined;
  signInCallbacks = {};
});

afterEach(() => {
  cleanup();
  signIn.mockClear();
  vi.restoreAllMocks();
});

const renderModal = () => render(<SharedAvailabilityModal open profileSpaceId="profile-space" onClose={() => {}} />);

describe('SharedAvailabilityModal', () => {
  it('asks a signed-out recipient to sign in, naming the person', async () => {
    auth.authenticated = false;
    renderModal();

    expect(screen.getByText(/Sign in to see when Ada L\. is free/)).toBeInTheDocument();
    expect(screen.queryByTestId('week')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledOnce();
    // The trigger is gone from the URL by now, so a new account coming back from onboarding needs
    // the link itself to land on the week again.
    expect(signInOptions?.redirectTo).toBe('/space/profile-space?modal=availability&modalTarget=profile-space');
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

  it("opens the owner's schedule editor on their own link, as soon as their space is known", () => {
    personalSpaceId = 'profile-space';
    renderModal();

    expect(screen.getByTestId('own-schedule-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
  });

  it("falls back to geo-chat's is_self for the owner", () => {
    profile = { isPending: false, isError: false, data: { user: person, is_self: true } };
    renderModal();

    expect(screen.getByTestId('own-schedule-modal')).toBeInTheDocument();
  });

  // Privy's login renders outside the dialog, which a Radix modal makes inert.
  it('steps aside while Privy is open and comes back if it is dismissed', async () => {
    auth.authenticated = false;
    renderModal();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();

    act(() => signInCallbacks.onError?.());
    expect(screen.getByTestId('booking-modal')).toBeInTheDocument();
  });

  it('says so when the profile cannot be resolved', () => {
    profile = { isPending: false, isError: true };
    renderModal();

    expect(screen.getByText('Couldn’t load their availability.')).toBeInTheDocument();
  });
});

describe('AvailabilityDeepLink', () => {
  it('does nothing without the link', () => {
    search = 'tab=claims';
    render(<AvailabilityDeepLink />);

    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
  });

  it('opens the named week, clears the trigger on arrival, and closes', async () => {
    search = 'modal=availability&modalTarget=profile-space&tab=claims';
    profile = { isPending: false, isError: false, data: { user: person, is_self: false } };
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<AvailabilityDeepLink />);

    expect(screen.getByTestId('booking-modal')).toHaveAttribute('data-user-id', 'chat-user-1');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/space/profile-space?tab=claims');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
  });

  it('leaves a link that names nobody alone', () => {
    search = 'modal=availability';
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<AvailabilityDeepLink />);

    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
