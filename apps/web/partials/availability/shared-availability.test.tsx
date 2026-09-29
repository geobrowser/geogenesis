import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

import { AvailabilityDeepLink, SharedAvailabilityModal } from './shared-availability';

const auth = { ready: true, authenticated: true };
let profile: { isPending: boolean; isError: boolean; data?: unknown; error?: unknown } = {
  isPending: true,
  isError: false,
};
const signIn = vi.fn();
let signInCallbacks: { onComplete?: () => void; onError?: () => void } = {};
let personalSpaceId: string | null = null;
let search = 'modal=availability';
let pathname = '/space/profile-space';
const personSpace = { type: 'PERSONAL', entity: { name: 'Ada L.', types: [{ id: SystemIds.PERSON_TYPE }] } };
// `undefined` is still loading, `null` a space that does not exist.
let spaceQuery: { space: unknown; isError: boolean } = { space: personSpace, isError: false };
const setToast = vi.fn();
let signInOptions: { redirectTo?: string } | undefined;

const profileCalls: unknown[][] = [];
vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => auth,
  useDebateProfile: (...args: unknown[]) => {
    profileCalls.push(args);
    return profile;
  },
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (onComplete?: () => void, options?: { onError?: () => void; redirectTo?: string }) => {
    signInCallbacks = { onComplete, onError: options?.onError };
    signInOptions = options;
    return signIn;
  },
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId }) }));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => spaceQuery }));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => setToast }));
vi.mock('./own-schedule-modal', () => ({
  OwnScheduleModal: ({ open }: { open: boolean }) => (open ? <div data-testid="own-schedule-modal" /> : null),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));
// The booking modal has its own tests; these are about what gets handed to it.
vi.mock('./peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: ({
    open,
    userId,
    peerName,
    rescheduleRequestId,
    onClose,
    children,
  }: {
    open: boolean;
    userId: string;
    peerName?: string | null;
    rescheduleRequestId?: string | null;
    onClose: () => void;
    children?: React.ReactNode;
  }) =>
    open ? (
      <div
        data-testid="booking-modal"
        data-user-id={userId}
        data-peer-name={peerName ?? ''}
        data-reschedule={rescheduleRequestId ?? ''}
      >
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
  search = 'modal=availability';
  pathname = '/space/profile-space';
  spaceQuery = { space: personSpace, isError: false };
  setToast.mockClear();
  personalSpaceId = null;
  signInOptions = undefined;
  profileCalls.length = 0;
  signInCallbacks = {};
});

afterEach(() => {
  cleanup();
  signIn.mockClear();
  onNotAPerson.mockClear();
  vi.restoreAllMocks();
});

const onNotAPerson = vi.fn();

const renderModal = () =>
  render(
    <SharedAvailabilityModal open profileSpaceId="profile-space" onClose={() => {}} onNotAPerson={onNotAPerson} />
  );

describe('SharedAvailabilityModal', () => {
  it('asks a signed-out recipient to sign in, naming the person', async () => {
    auth.authenticated = false;
    profile = { isPending: false, isError: false, data: { user: person, is_self: false } };
    renderModal();

    expect(screen.getByText(/Sign in to see when Ada is free/)).toBeInTheDocument();
    expect(screen.queryByTestId('week')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledOnce();
    // The trigger is gone from the URL by now, so a new account coming back from onboarding needs
    // the link itself to land on the week again.
    expect(signInOptions?.redirectTo).toBe('/space/profile-space?modal=availability');
  });

  it('does not flash "sign in" before Privy is ready', () => {
    auth.ready = false;
    auth.authenticated = false;
    renderModal();

    // Nothing at all: until Privy knows, it cannot be known whose dialog this is either.
    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
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
    profile = { isPending: false, isError: false, data: { user: person, is_self: false } };
    renderModal();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();

    act(() => signInCallbacks.onError?.());
    expect(screen.getByTestId('booking-modal')).toBeInTheDocument();
  });

  it('holds the sign-in prompt until the space is known to be a person', () => {
    auth.authenticated = false;
    spaceQuery = { space: undefined, isError: false };
    renderModal();

    expect(screen.getByText('Loading availability…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('gives up on a space that is not a person, or does not exist', () => {
    auth.authenticated = false;
    spaceQuery = { space: { type: 'DAO', entity: { name: 'Crypto', types: [] } }, isError: false };
    const { unmount } = renderModal();
    expect(onNotAPerson).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Sign in to see when Crypto/)).not.toBeInTheDocument();
    unmount();

    onNotAPerson.mockClear();
    spaceQuery = { space: null, isError: false };
    renderModal();
    expect(onNotAPerson).toHaveBeenCalledOnce();
  });

  it('does not call a failed space read "not a person"', () => {
    spaceQuery = { space: undefined, isError: true };
    renderModal();

    expect(onNotAPerson).not.toHaveBeenCalled();
    expect(screen.getByText('Couldn’t load their availability.')).toBeInTheDocument();
  });

  it('says so when the profile cannot be resolved', () => {
    profile = { isPending: false, isError: true, error: new GeoChatRequestError('boom', null, 500) };
    renderModal();

    expect(screen.getByText('Couldn’t load their availability.')).toBeInTheDocument();
  });

  // Found out before anyone is sent to sign in for a person who cannot be booked (review, #2604).
  it('tells a signed-out recipient the person has not set up debates, instead of asking them to sign in', () => {
    auth.authenticated = false;
    profile = {
      isPending: false,
      isError: true,
      error: new GeoChatRequestError('user was not found', 'user_not_found', 404),
    };
    renderModal();

    expect(screen.getByText('Ada L. hasn’t set up debates yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    // Asked signed out, which only works because the read opts in to it.
    expect(profileCalls.at(-1)).toEqual(['profile-space', true, { signedOut: true }]);
  });

  it('tells "has not set up debates" apart from a failed read when signed in too', () => {
    profile = {
      isPending: false,
      isError: true,
      error: new GeoChatRequestError('user was not found', 'user_not_found', 404),
    };
    renderModal();

    expect(screen.getByText('Ada L. hasn’t set up debates yet.')).toBeInTheDocument();
    expect(screen.queryByText('Couldn’t load their availability.')).not.toBeInTheDocument();
  });

  // A deployment without the route also answers 404, and that is a failure, not a fact about them.
  it('reads a bare 404 as a failure, not as someone without debates', () => {
    profile = { isPending: false, isError: true, error: new GeoChatRequestError('not found', null, 404) };
    renderModal();

    expect(screen.getByText('Couldn’t load their availability.')).toBeInTheDocument();
    expect(screen.queryByText(/hasn’t set up debates/)).not.toBeInTheDocument();
  });

  // Drawing the week's shell and then swapping it for the owner's editor is the swap this design
  // exists to avoid (review, #2604).
  it('draws no dialog for a signed-in viewer until it knows whether the link is their own', () => {
    profile = { isPending: true, isError: false };
    const { rerender } = renderModal();

    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('own-schedule-modal')).not.toBeInTheDocument();

    profile = { isPending: false, isError: false, data: { user: person, is_self: true } };
    rerender(
      <SharedAvailabilityModal open profileSpaceId="profile-space" onClose={() => {}} onNotAPerson={onNotAPerson} />
    );

    expect(screen.getByTestId('own-schedule-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
  });
});

describe('AvailabilityDeepLink', () => {
  it('does nothing without the link', () => {
    search = 'tab=claims';
    render(<AvailabilityDeepLink />);

    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
  });

  it('opens the named week, clears the trigger on arrival, and closes', async () => {
    search = 'modal=availability&tab=claims';
    profile = { isPending: false, isError: false, data: { user: person, is_self: false } };
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<AvailabilityDeepLink />);

    expect(screen.getByTestId('booking-modal')).toHaveAttribute('data-user-id', 'chat-user-1');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/space/profile-space?tab=claims');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
  });

  it('hands the request to move to the week when the link names one', () => {
    search = 'modal=availability&modalTarget=6676b145-0970-4c1c-bfbc-7497d9721b39';
    profile = { isPending: false, isError: false, data: { user: person, is_self: false } };
    render(<AvailabilityDeepLink />);

    expect(screen.getByTestId('booking-modal')).toHaveAttribute(
      'data-reschedule',
      '6676b145-0970-4c1c-bfbc-7497d9721b39'
    );
  });

  it('opens an ordinary booking week when the link names no request', () => {
    profile = { isPending: false, isError: false, data: { user: person, is_self: false } };
    render(<AvailabilityDeepLink />);

    expect(screen.getByTestId('booking-modal')).toHaveAttribute('data-reschedule', '');
  });

  it('only acts on a profile root, and says so anywhere else', () => {
    pathname = '/space/profile-space/some-entity';
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<AvailabilityDeepLink />);

    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
    expect(setToast).toHaveBeenCalledOnce();
    // Cleared anyway, so a bad link does not keep firing on refresh.
    expect(replaceState).toHaveBeenCalledWith(null, '', '/space/profile-space/some-entity');
  });

  it('closes with a toast when the space turns out not to be a person', () => {
    spaceQuery = { space: { type: 'DAO', entity: { name: 'Crypto', types: [] } }, isError: false };
    render(<AvailabilityDeepLink />);

    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
    expect(setToast).toHaveBeenCalledOnce();
  });
});
