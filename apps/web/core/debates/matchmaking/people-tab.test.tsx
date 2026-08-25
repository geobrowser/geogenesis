import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateChallenge, DebatePerson } from '../api';

const mocks = vi.hoisted(() => ({
  people: [] as DebatePerson[],
  challenge: null as DebateChallenge | null,
  outboundRequest: null as unknown,
  activeDebate: null as unknown,
  currentUserId: 'user-me' as string | null,
  createChallenge: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useDebateActivity: () => ({
    data: { challenge: mocks.challenge, outbound_request: mocks.outboundRequest, debate: mocks.activeDebate },
  }),
  useCreateDebateChallenge: () => ({ mutate: mocks.createChallenge, isPending: false, error: null }),
}));

vi.mock('./hooks', () => ({
  useDebatePeople: () => ({ data: { people: mocks.people }, isLoading: false, error: null }),
  useDebateRequests: () => ({ data: { incoming: [], outbound: null }, isLoading: false, error: null }),
}));

vi.mock('../use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => mocks.currentUserId,
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

function challenge(role: 'requester' | 'recipient'): DebateChallenge {
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
    expires_at: new Date(Date.now() + 25 * 60_000).toISOString(),
  };
}

const awaitingText = 'You have a debate request awaiting a reply.';
const card = () => screen.queryByRole('article');

beforeEach(() => {
  mocks.people = [person('user-them', 'Arturas'), person('user-other', 'Vytautas')];
  mocks.challenge = null;
  mocks.outboundRequest = null;
  mocks.activeDebate = null;
  mocks.currentUserId = 'user-me';
  mocks.createChallenge.mockReset();
});

afterEach(cleanup);

describe('PeopleTab', () => {
  it('shows no request card when nothing is outstanding', () => {
    render(<PeopleTab />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Debate' })[0]).toBeEnabled();
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

  it('still greys out every Debate button while the request is open', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab />);

    for (const button of screen.getAllByRole('button', { name: 'Debate' })) {
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

  it('leaves the other blocked reasons alone', () => {
    mocks.outboundRequest = { id: 'request-1' };
    render(<PeopleTab />);

    expect(card()).not.toBeInTheDocument();
    expect(
      screen.getByText('You already have an open request — withdraw it to challenge someone else.')
    ).toBeInTheDocument();
  });
});
