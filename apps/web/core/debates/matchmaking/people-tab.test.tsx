import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateChallenge, DebatePerson } from '../api';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  /** Privy's answer; the tab's signed-out paths hang off it. */
  authenticated: true,
  people: [] as DebatePerson[],
  challenge: null as DebateChallenge | null,
  outboundRequest: null as unknown,
  activeDebate: null as unknown,
  currentUserId: 'user-me' as string | null,
  createChallenge: vi.fn(),
  cancelChallenge: vi.fn(),
  cancelPending: false,
  cancelError: null as Error | null,
  records: new Map<string, unknown>(),
}));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated, ready: true, accountKey: 'user-a' }),
  useDebateActivity: () => ({
    data: { challenge: mocks.challenge, outbound_request: mocks.outboundRequest, debate: mocks.activeDebate },
  }),
  useCreateDebateChallenge: () => ({ mutate: mocks.createChallenge, isPending: false, error: null }),
  useAcceptDebateChallenge: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useRejectDebateChallenge: () => ({
    mutate: mocks.cancelChallenge,
    isPending: mocks.cancelPending,
    error: mocks.cancelError,
  }),
}));

vi.mock('./hooks', () => ({
  useDebatePeople: () => ({ data: { people: mocks.people }, isLoading: false, error: null }),
  useDebateRequests: () => ({ data: { incoming: [], outbound: null }, isLoading: false, error: null }),
}));

// The record is fetched once for the whole list through react-query; these tests render the tab
// without a client, and the row's own behaviour is what they are about.
vi.mock('./use-person-records', () => ({
  usePersonRecords: () => mocks.records,
}));

vi.mock('../use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => mocks.currentUserId,
}));

// `usePrivySignIn` reaches for Privy's context, which these suites do not stand up. The signed-out
// paths assert that it is *called*, so the stub is shared through `mocks.promptSignIn`.
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.promptSignIn,
}));

const { PeopleTab } = await import('./people-tab');

function person(userId: string, name: string): DebatePerson {
  return {
    user_id: userId,
    profile_space_id: `profile-${userId}`,
    display_name: name,
    avatar_cid: null,
    online: true,
    available_to_debate: true,
    in_debate: false,
    online_since: '2026-08-05T11:00:00.000Z',
    can_challenge: true,
  } as DebatePerson;
}

function challenge(role: 'requester' | 'recipient', expiresInMs = 25 * 60_000): DebateChallenge {
  const me = { user_id: 'user-me', profile_space_id: 'profile-me', display_name: 'You', avatar_cid: null };
  const them = { user_id: 'user-them', profile_space_id: 'profile-them', display_name: 'Arturas', avatar_cid: null };

  return {
    id: 'challenge-1',
    status: 'pending',
    source_space_id: 'space-1',
    requester: role === 'requester' ? me : them,
    recipient: role === 'requester' ? them : me,
    rematch_session_id: null,
    created_at: '2026-08-05T11:00:00.000Z',
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

const awaitingText = 'You have a debate request awaiting a reply.';
const card = () => screen.queryByRole('article');

beforeEach(() => {
  // Not a mock fn, so `resetAllMocks` does not restore it.
  mocks.authenticated = true;
  mocks.people = [person('user-them', 'Arturas'), person('user-other', 'Vytautas')];
  mocks.challenge = null;
  mocks.outboundRequest = null;
  mocks.activeDebate = null;
  mocks.currentUserId = 'user-me';
  mocks.createChallenge.mockReset();
  mocks.cancelChallenge.mockReset();
  mocks.cancelPending = false;
  mocks.cancelError = null;
  mocks.records = new Map();
});

afterEach(cleanup);

describe('PeopleTab', () => {
  // Filtered client-side: the endpoint has no search parameter and returns everyone available in
  // one unpaginated list, so there is nothing to page back for.
  it('narrows the list to people matching the search', () => {
    render(<PeopleTab />);

    expect(screen.getByText('Arturas')).toBeInTheDocument();
    expect(screen.getByText('Vytautas')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'artur' } });

    expect(screen.getByText('Arturas')).toBeInTheDocument();
    expect(screen.queryByText('Vytautas')).not.toBeInTheDocument();
  });

  it('says so when a search matches nobody, and offers a way back', async () => {
    // Distinct from the "nobody is available" state: one is a filter the viewer can undo, the
    // other is the room being empty.
    render(<PeopleTab />);

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'nobody-by-this-name' } });

    // The empty state cross-fades in through HubSwap, so it arrives after the list leaves.
    expect(await screen.findByText('Nobody available matches that search.')).toBeInTheDocument();
    expect(screen.queryByText('Nobody is available to debate right now.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('Arturas')).toBeInTheDocument();
  });

  it('pins search alongside a sent request rather than in a second sticky', () => {
    // Two stickies would both claim top-0 and overlap; the card is conditional, so search could
    // not be offset by a known height either.
    mocks.challenge = challenge('requester');
    render(<PeopleTab />);

    const pinned = screen.getByLabelText('Search people').closest('.sticky');
    expect(pinned).not.toBeNull();
    expect(card()?.closest('.sticky')).toBe(pinned);
  });

  it('shows no request card when nothing is outstanding', () => {
    render(<PeopleTab />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  // Matches the Matches tab: a request you're waiting on gets a card rather than a sentence, and
  // stays in view rather than scrolling away behind people you can no longer ask.
  it('puts a sticky card above the list for a request you sent', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab />);

    const request = card();
    expect(request).toBeInTheDocument();
    expect(request?.parentElement).toHaveClass('sticky', 'top-0');
    expect(within(request!).getByText('Awaiting response')).toBeInTheDocument();
    expect(screen.queryByText(awaitingText)).not.toBeInTheDocument();
  });

  it('names the person you asked, without a claim or space to show', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab />);

    const request = card()!;
    expect(within(request).getByText('You')).toBeInTheDocument();
    expect(within(request).getByText('Arturas')).toBeInTheDocument();
    expect(within(request).getByText('VS')).toBeInTheDocument();
  });

  it('still greys out every Request debate button while the request is open', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab />);

    for (const button of screen.getAllByRole('button', { name: 'Request debate' })) {
      expect(button).toBeDisabled();
    }
  });

  // `activity.challenge` is whichever challenge involves the viewer. Being challenged is not a
  // request you sent, so it keeps the sentence rather than claiming you're waiting on a reply.
  it('keeps the sentence when the challenge is one you received', () => {
    mocks.challenge = challenge('recipient');
    render(<PeopleTab />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.getByText(awaitingText)).toBeInTheDocument();
  });

  // Without an id there is no way to tell the two directions apart, and showing a "you sent this"
  // card for a request you received would be worse than showing none.
  it('holds the card back until the viewer is identified', () => {
    mocks.challenge = challenge('requester');
    mocks.currentUserId = null;
    render(<PeopleTab />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.getByText(awaitingText)).toBeInTheDocument();
  });

  // The clock and what you can do about it lead the card, above the pairing they apply to.
  it('leads with the countdown and the cancel action, before the two people', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab />);

    const request = card()!;
    const countdown = within(request).getByText(/Expires in/);
    const cancel = within(request).getByRole('button', { name: 'Cancel request' });
    const versus = within(request).getByText('VS');

    expect(countdown.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cancel.compareDocumentPosition(versus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The activity payload keeps reporting a challenge as pending until the server says otherwise,
  // so expiry has to be applied here — the same filter every other request surface uses. Without
  // it the tab sat on an "Expired" card with every Request debate button still dead underneath it.
  it('drops an expired challenge instead of waiting for the server to say so', () => {
    mocks.challenge = challenge('requester', -1_000);
    render(<PeopleTab />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();
  });

  it('re-enables the Request debate buttons once the request has expired', () => {
    mocks.challenge = challenge('requester', -1_000);
    render(<PeopleTab />);

    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  it('drops an expired incoming challenge too, sentence and all', () => {
    mocks.challenge = challenge('recipient', -1_000);
    render(<PeopleTab />);

    expect(screen.queryByText(awaitingText)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  // The same action the Requests tab offers on this challenge, reachable without leaving People.
  it('cancels the request from the card', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab />);

    fireEvent.click(within(card()!).getByRole('button', { name: 'Cancel request' }));

    expect(mocks.cancelChallenge).toHaveBeenCalledWith('challenge-1');
  });

  it('holds the cancel button while it is in flight', () => {
    mocks.challenge = challenge('requester');
    mocks.cancelPending = true;
    render(<PeopleTab />);

    expect(within(card()!).getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  });

  it('announces a failed cancel rather than only drawing it', () => {
    mocks.challenge = challenge('requester');
    mocks.cancelError = new Error('Challenge already answered.');
    render(<PeopleTab />);

    expect(screen.getByRole('alert')).toHaveTextContent('Challenge already answered.');
  });

  it('leaves the other blocked reasons alone', () => {
    mocks.outboundRequest = { id: 'request-1' };
    render(<PeopleTab />);

    expect(card()).not.toBeInTheDocument();
    expect(
      screen.getByText('You already have an open request — withdraw it to challenge someone else.')
    ).toBeInTheDocument();
  });

  // GEO-2725. Signed out the button is the entry to signing in, so it stays live and opens Privy
  // rather than sending a request that could only fail at the token exchange.
  it('sends a signed-out visitor to sign in instead of requesting a debate', () => {
    mocks.authenticated = false;
    render(<PeopleTab />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Request debate' })[0]);

    expect(mocks.promptSignIn).toHaveBeenCalled();
    expect(mocks.createChallenge).not.toHaveBeenCalled();
  });

  // Every field in the record is public graph data — positions, debates, wins and join date need no
  // viewer identity — so a signed-out visitor gets the full context before being asked to sign in.
  // Only the button is gated.
  it('shows the record signed out, gating only the button', () => {
    mocks.authenticated = false;
    mocks.records = new Map([
      [
        'profile-user-them',
        {
          positions: 119,
          debatesArgued: 11,
          winRate: { percent: 73, wins: 8, of: 11 },
          joinedAt: new Date(Date.UTC(2026, 0, 29)),
        },
      ],
    ]);
    render(<PeopleTab />);

    expect(screen.getByText('119 positions')).toBeInTheDocument();
    expect(screen.getByText('Won 8 of 11 debates')).toBeInTheDocument();
    expect(screen.getByText('On Geo since Jan 2026')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  // The row's availability flags describe a pairing with somebody, and signed out there is nobody
  // to pair with — so they are not a reason to refuse the press that starts the sign-in.
  it('keeps the button live signed out when only the viewer-relative flag is off', () => {
    mocks.authenticated = false;
    mocks.people = [{ ...person('user-them', 'Arturas'), can_challenge: false }];
    render(<PeopleTab />);

    expect(screen.getByRole('button', { name: 'Request debate' })).not.toBeDisabled();
  });

  // `in_debate` is true of the person, not of any viewer, so signing in would not make them
  // available — offering the press would spend a login on an answer that does not change.
  it('still refuses a person already in a debate when signed out', () => {
    mocks.authenticated = false;
    mocks.people = [{ ...person('user-them', 'Arturas'), in_debate: true }];
    render(<PeopleTab />);

    expect(screen.getByRole('button', { name: 'In a debate' })).toBeDisabled();
  });
});
