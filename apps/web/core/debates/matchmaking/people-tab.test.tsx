import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render as renderWithoutStore, screen, waitFor, within } from '@testing-library/react';

import type React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavUtils } from '~/core/utils/utils';

import type { DebateChallenge, DebatePerson } from '../api';
import { debatesHubPeopleSpaceIdsAtom } from '~/atoms';

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
  onTabChange: vi.fn(),
  cancelChallenge: vi.fn(),
  cancelPending: false,
  cancelError: null as Error | null,
  records: new Map<string, unknown>(),
  publishableSpaceIds: null as Set<string> | null,
  spaceLabels: new Map<string, { name: string | null; image: string | null }>(),
  /** Every prop set handed to a link this render, so a stray handler is visible. */
  linkProps: [] as Record<string, unknown>[],
}));

// The real one reaches for the sync engine and the router; a plain anchor is what the assertions
// below are about — a real href, and nothing intercepting the click.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => {
    mocks.linkProps.push(props);
    return (
      <a
        href={props.href as string}
        className={props.className as string | undefined}
        data-testid={props['data-testid'] as string | undefined}
      >
        {children}
      </a>
    );
  },
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

vi.mock('../use-debate-publishable-spaces', async importOriginal => {
  const actual = await importOriginal<typeof import('../use-debate-publishable-spaces')>();
  return {
    ...actual,
    useDebatePublishableSpaces: () => ({
      publishableSpaceIds: mocks.publishableSpaceIds,
      isLoading: false,
    }),
  };
});

// Names and thumbnails come from the browse sidebar's cache, which these tests do not mount.
vi.mock('~/core/hooks/use-space-labels', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/hooks/use-space-labels')>();
  return { ...actual, useSpaceLabels: () => ({ labelsById: mocks.spaceLabels, isLoading: false }) };
});

vi.mock('../use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => mocks.currentUserId,
}));

// `usePrivySignIn` reaches for Privy's context, which these suites do not stand up. The signed-out
// paths assert that it is *called*, so the stub is shared through `mocks.promptSignIn`.
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.promptSignIn,
}));

const { PeopleTab } = await import('./people-tab');
const { PERSON_SPACE_ICON_CAP } = await import('./person-space-icons');

/** A real space id shape. `profile-user-them` is not one, and the profile link is gated on it. */
const PROFILE_SPACE_IDS: Record<string, string> = {
  'user-them': '019fedae-72b6-7ab2-927a-df044d57c566',
  'user-other': '019fedae-72b6-7ab2-927a-df044d57c599',
};

function person(userId: string, name: string): DebatePerson {
  return {
    user_id: userId,
    profile_space_id: PROFILE_SPACE_IDS[userId] ?? `profile-${userId}`,
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
  mocks.onTabChange.mockReset();
  mocks.cancelChallenge.mockReset();
  mocks.cancelPending = false;
  mocks.cancelError = null;
  mocks.records = new Map();
  mocks.publishableSpaceIds = null;
  mocks.spaceLabels = new Map();
  mocks.linkProps = [];
});

/**
 * A fresh jotai store per render, as the claims-tab suite does.
 *
 * The filter selections are atoms since GEO-2850, which makes them module-global by default — so
 * one test picking a space would hand it to every test after it, and the failure would land on
 * whichever test happened to run next rather than on the one that set it.
 */
function render(ui: React.ReactElement, store: ReturnType<typeof createStore> = createStore()) {
  return renderWithoutStore(<Provider store={store}>{ui}</Provider>);
}

/**
 * Radix defers a FocusScope's unmount event by one timer tick. Let it finish inside this test's
 * jsdom window; otherwise the full parallel suite can replace `CustomEvent` before the old popup
 * dispatches its cleanup event and report an unhandled cross-window Event error after every
 * assertion has passed.
 */
async function closeActiveSpacesPopover(trigger: HTMLElement) {
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Active spaces' })).not.toBeInTheDocument());
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

// Radix's menu measures its content; jsdom has no observer to measure with.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

afterEach(cleanup);

describe('PeopleTab', () => {
  // Filtered client-side: the endpoint has no search parameter and returns everyone available in
  // one unpaginated list, so there is nothing to page back for.
  it('narrows the list to people matching the search', () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByText('Arturas')).toBeInTheDocument();
    expect(screen.getByText('Vytautas')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'artur' } });

    expect(screen.getByText('Arturas')).toBeInTheDocument();
    expect(screen.queryByText('Vytautas')).not.toBeInTheDocument();
  });

  it('says so when a search matches nobody, and offers a way back', async () => {
    // Distinct from the "nobody is available" state: one is a filter the viewer can undo, the
    // other is the room being empty.
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'nobody-by-this-name' } });

    // The empty state cross-fades in through HubSwap, so it arrives after the list leaves.
    expect(await screen.findByText('Nobody available matches that search.')).toBeInTheDocument();
    expect(screen.queryByText('Nobody is available to debate right now.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('Arturas')).toBeInTheDocument();
  });

  // GEO-2840. The debate-hours line belongs to the nobody-online state only; a list the viewer
  // emptied with their own search is a different problem, and pointing at 9am does not answer it.
  it('adds the debate hours line when nobody is online, but not when a search emptied the list', async () => {
    mocks.people = [];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(await screen.findByText('Nobody is available to debate right now.')).toBeInTheDocument();
    expect(screen.getByText(/Debate hours are every day between|Stay here —/)).toBeInTheDocument();

    cleanup();
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'nobody-by-this-name' } });

    expect(await screen.findByText('Nobody available matches that search.')).toBeInTheDocument();
    expect(screen.queryByText(/Debate hours are every day between|Stay here —/)).not.toBeInTheDocument();
  });

  // GEO-2840. Waiting is the only other thing to do while the room is empty, so the empty state
  // offers somewhere to go instead — the Claims tab, which is full whether or not anyone is online.
  it('offers a way through to Explore when nobody is online', async () => {
    mocks.people = [];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Explore claims' }));

    expect(mocks.onTabChange).toHaveBeenCalledWith('explore');
  });

  // A search the viewer can undo gets the undo instead: there is something to do here, so sending
  // them to another tab would be answering a question they did not ask.
  it('offers the undo rather than claims when a search emptied the list', async () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'nobody-by-this-name' } });

    expect(await screen.findByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Explore claims' })).not.toBeInTheDocument();
  });

  // Both states are reachable with text in the search box, so the box cannot be what tells them
  // apart: search for a name at 3am, or be mid-search when the last person drops off, and the
  // reason the list is empty is that nobody is online — which is the state GEO-2840 is about.
  it('blames nobody being online rather than the search when there is nobody to search', async () => {
    mocks.people = [];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'artur' } });

    expect(await screen.findByText('Nobody is available to debate right now.')).toBeInTheDocument();
    expect(screen.getByText(/Debate hours are every day between|Stay here —/)).toBeInTheDocument();
    // Clearing a search that excluded nobody would put the same empty list back.
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  // People is the one tab a signed-out viewer can reach this note from (GEO-2725), and their list
  // is static: `useMatchmakingScope` gates the gateway on a session. Waiting will not fill it, and
  // they could not be matched from it either, so "stay here and you'll be matched" would promise
  // both. The clock is pinned inside debate hours because that is the only variant that differs.
  it('does not tell a signed-out viewer to wait for a list that cannot update', async () => {
    // Real time still advances, so testing-library's async helpers are not frozen out.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 16:30Z is 09:30 PDT — inside the window, whatever zone this suite runs in.
    vi.setSystemTime(new Date('2026-09-08T16:30:00Z'));
    mocks.authenticated = false;
    mocks.people = [];

    try {
      render(<PeopleTab onTabChange={mocks.onTabChange} />);

      expect(await screen.findByText('Check back in a few minutes to find a debate!')).toBeInTheDocument();
      expect(screen.queryByText(/Stay here/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells a signed-in viewer to stay, because their list does update', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-08T16:30:00Z'));
    mocks.people = [];

    try {
      render(<PeopleTab onTabChange={mocks.onTabChange} />);

      expect(await screen.findByText('Stay here — this list fills in as people come online.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pins search alongside a sent request rather than in a second sticky', () => {
    // Two stickies would both claim top-0 and overlap; the card is conditional, so search could
    // not be offset by a known height either.
    mocks.challenge = challenge('requester');
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const pinned = screen.getByLabelText('Search people').closest('.sticky');
    expect(pinned).not.toBeNull();
    expect(card()?.closest('.sticky')).toBe(pinned);
  });

  it('shows no request card when nothing is outstanding', () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  // Matches the Matches tab: a request you're waiting on gets a card rather than a sentence, and
  // stays in view rather than scrolling away behind people you can no longer ask.
  it('puts a sticky card above the list for a request you sent', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const request = card();
    expect(request).toBeInTheDocument();
    expect(request?.parentElement).toHaveClass('sticky', 'top-0');
    expect(within(request!).getByText('Awaiting response')).toBeInTheDocument();
    expect(screen.queryByText(awaitingText)).not.toBeInTheDocument();
  });

  it('names the person you asked, without a claim or space to show', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const request = card()!;
    expect(within(request).getByText('You')).toBeInTheDocument();
    expect(within(request).getByText('Arturas')).toBeInTheDocument();
    expect(within(request).getByText('VS')).toBeInTheDocument();
  });

  it('still greys out every Request debate button while the request is open', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    for (const button of screen.getAllByRole('button', { name: 'Request debate' })) {
      expect(button).toBeDisabled();
    }
  });

  // `activity.challenge` is whichever challenge involves the viewer. Being challenged is not a
  // request you sent, so it keeps the sentence rather than claiming you're waiting on a reply.
  it('keeps the sentence when the challenge is one you received', () => {
    mocks.challenge = challenge('recipient');
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.getByText(awaitingText)).toBeInTheDocument();
  });

  // Without an id there is no way to tell the two directions apart, and showing a "you sent this"
  // card for a request you received would be worse than showing none.
  it('holds the card back until the viewer is identified', () => {
    mocks.challenge = challenge('requester');
    mocks.currentUserId = null;
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.getByText(awaitingText)).toBeInTheDocument();
  });

  // The clock and what you can do about it lead the card, above the pairing they apply to.
  it('leads with the countdown and the cancel action, before the two people', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

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
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(card()).not.toBeInTheDocument();
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();
  });

  it('re-enables the Request debate buttons once the request has expired', () => {
    mocks.challenge = challenge('requester', -1_000);
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  it('drops an expired incoming challenge too, sentence and all', () => {
    mocks.challenge = challenge('recipient', -1_000);
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.queryByText(awaitingText)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  // The same action the Requests tab offers on this challenge, reachable without leaving People.
  it('cancels the request from the card', () => {
    mocks.challenge = challenge('requester');
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(within(card()!).getByRole('button', { name: 'Cancel request' }));

    expect(mocks.cancelChallenge).toHaveBeenCalledWith('challenge-1');
  });

  it('holds the cancel button while it is in flight', () => {
    mocks.challenge = challenge('requester');
    mocks.cancelPending = true;
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(within(card()!).getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  });

  it('announces a failed cancel rather than only drawing it', () => {
    mocks.challenge = challenge('requester');
    mocks.cancelError = new Error('Challenge already answered.');
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Challenge already answered.');
  });

  it('leaves the other blocked reasons alone', () => {
    mocks.outboundRequest = { id: 'request-1' };
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(card()).not.toBeInTheDocument();
    expect(
      screen.getByText('You already have an open request — withdraw it to challenge someone else.')
    ).toBeInTheDocument();
  });

  // GEO-2725. Signed out the button is the entry to signing in, so it stays live and opens Privy
  // rather than sending a request that could only fail at the token exchange.
  it('sends a signed-out visitor to sign in instead of requesting a debate', () => {
    mocks.authenticated = false;
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

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
        PROFILE_SPACE_IDS['user-them'],
        {
          positions: 119,
          debatesArgued: 11,
          winRate: { percent: 73, wins: 8, of: 11, judged: 11 },
          joinedAt: new Date(Date.UTC(2026, 0, 29)),
        },
      ],
    ]);
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

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
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('button', { name: 'Request debate' })).not.toBeDisabled();
  });

  // `in_debate` is true of the person, not of any viewer, so signing in would not make them
  // available — offering the press would spend a login on an answer that does not change.
  it('still refuses a person already in a debate when signed out', () => {
    mocks.authenticated = false;
    mocks.people = [{ ...person('user-them', 'Arturas'), in_debate: true }];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('button', { name: 'In a debate' })).toBeDisabled();
  });
});

// GEO-2788 / GEO-2611. The name goes to the person's personal space, and the hub stays open on the
// way — which is why this needs no click handler and so keeps cmd-click and middle click working.
describe('the person link', () => {
  it("points the name at the person's space", () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('link', { name: 'Arturas' })).toHaveAttribute(
      'href',
      NavUtils.toSpace(PROFILE_SPACE_IDS['user-them'])
    );
  });

  // The guarantee is that *we* add no handler of our own. `next/link` underneath does intercept a
  // plain left click — that is how client-side routing works, and it already honours cmd-click and
  // middle click. A second handler layered on top is what would break them, which is what GEO-2701
  // restored, so the absence of one is the thing worth pinning.
  //
  // Asserted on the props rather than by dispatching a click: the mock here is a bare anchor, so a
  // `defaultPrevented` check would only describe the mock and would pass whether or not the real
  // component ever received a handler.
  it('adds no click handler of its own to the name', () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const nameLink = mocks.linkProps.find(props => props.href === NavUtils.toSpace(PROFILE_SPACE_IDS['user-them']));
    expect(nameLink).toBeDefined();
    expect(nameLink).not.toHaveProperty('onClick');
  });

  // An anchor to `/space/undefined` looks identical until it is clicked.
  it('leaves the name unlinked when there is no space to point at', () => {
    mocks.people = [person('user-nospace', 'Nameless')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByText('Nameless')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nameless' })).toBeNull();
  });
});

// GEO-2944. The filter bar; the suites above are the rows, the request card and the person link.
describe('PeopleTab filters', () => {
  const PROFILE_THEM = PROFILE_SPACE_IDS['user-them'] ?? 'profile-user-them';
  const PROFILE_OTHER = PROFILE_SPACE_IDS['user-other'] ?? 'profile-user-other';

  beforeEach(() => {
    mocks.spaceLabels = new Map([
      ['spacea', { name: 'Crypto', image: null }],
      ['spaceb', { name: 'Health', image: null }],
    ]);
    mocks.records = new Map([
      [
        PROFILE_THEM,
        {
          positions: 1,
          debatesArgued: null,
          claimsBySpace: new Map([['spacea', 1]]),
          debatesBySpace: new Map(),
          winRate: null,
          joinedAt: null,
        },
      ],
      [
        PROFILE_OTHER,
        {
          positions: 1,
          debatesArgued: null,
          claimsBySpace: new Map([['spaceb', 1]]),
          debatesBySpace: new Map(),
          winRate: null,
          joinedAt: null,
        },
      ],
    ]);
  });

  it('narrows the list to people in a picked space, and counts them on the option', async () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    // One person each, counted over everyone the other filters leave.
    const crypto = await screen.findByRole('button', { name: /Crypto/ });
    expect(crypto).toHaveTextContent('1');

    fireEvent.click(crypto);

    expect(screen.getByText('Arturas')).toBeInTheDocument();
    expect(screen.queryByText('Vytautas')).not.toBeInTheDocument();
  });

  it('defaults to Any space and keeps people with no debate-space activity visible', () => {
    mocks.records.set(PROFILE_OTHER, {
      positions: null,
      debatesArgued: null,
      claimsBySpace: new Map(),
      debatesBySpace: new Map(),
      winRate: null,
      joinedAt: null,
    });

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('button', { name: /Any space/ })).toBeInTheDocument();
    expect(screen.getByText('Arturas')).toBeInTheDocument();
    expect(screen.getByText('Vytautas')).toBeInTheDocument();
    const inactiveRow = screen.getByText('Vytautas').closest('li') as HTMLElement;
    expect(within(inactiveRow).queryByText('Active in')).not.toBeInTheDocument();
  });

  it('never offers or keeps a space where nobody has activity', async () => {
    mocks.spaceLabels.set('spacec', { name: 'Dormant', image: null });
    mocks.records.set(PROFILE_THEM, {
      positions: 1,
      debatesArgued: null,
      claimsBySpace: new Map([
        ['spacea', 1],
        ['spacec', 0],
      ]),
      debatesBySpace: new Map([['spacec', 0]]),
      winRate: null,
      joinedAt: null,
    });
    const store = createStore();
    store.set(debatesHubPeopleSpaceIdsAtom, ['spacec']);

    render(<PeopleTab onTabChange={mocks.onTabChange} />, store);

    await waitFor(() => expect(store.get(debatesHubPeopleSpaceIdsAtom)).toEqual([]));
    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    expect(await screen.findByRole('button', { name: /Crypto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dormant/ })).not.toBeInTheDocument();
  });

  // A space filter alone can never empty the list — a facet only offers spaces somebody is active in — so
  // the case this wording exists for is a space plus something else.
  //
  // The selection is seeded into the store rather than picked through the menu: the menu is covered
  // above, and a multi-select deliberately stays open across ticks, so its dismissable layer would
  // swallow the "Clear filters" press as an outside-click instead of passing it to the button.
  it('blames the filters rather than the search once a space is picked too', async () => {
    const store = createStore();
    store.set(debatesHubPeopleSpaceIdsAtom, ['spacea']);

    render(<PeopleTab onTabChange={mocks.onTabChange} />, store);
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Vytautas' } });

    expect(await screen.findByText('Nobody available matches those filters.')).toBeInTheDocument();
    expect(screen.queryByText('Nobody available matches that search.')).not.toBeInTheDocument();

    // The undo names both things holding the list down, and takes back both.
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    // Both filters are taken back, not just the one named last: the space selection is what the
    // label promises and the search is what the viewer can see in the box.
    expect(store.get(debatesHubPeopleSpaceIdsAtom)).toEqual([]);
    expect((screen.getByLabelText('Search people') as HTMLInputElement).value).toBe('');
  });

  // With nothing but a search, the wording it had stays: a viewer who typed something knows what to
  // take back, and "Clear filters" would name one of two things when there is only one.
  it('still blames the search when the search is the only filter', async () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'nobody' } });

    expect(await screen.findByText('Nobody available matches that search.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('caps the space icons on a row and counts the rest', () => {
    mocks.records = new Map([
      [
        PROFILE_THEM,
        {
          positions: 5,
          debatesArgued: null,
          claimsBySpace: new Map(
            ['spacea', 'spaceb', 'spacec', 'spaced', 'spacee'].map(spaceId => [spaceId, 1] as const)
          ),
          debatesBySpace: new Map(),
          winRate: null,
          joinedAt: null,
        },
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const row = screen.getByText('Arturas').closest('li') as HTMLElement;
    expect(within(row).getAllByTestId('person-space-icon')).toHaveLength(PERSON_SPACE_ICON_CAP);
    expect(within(row).getByTestId('person-space-overflow')).toHaveTextContent('+2');
  });

  it('puts Active in above the join date and opens the complete space list', async () => {
    mocks.people = [person('user-them', 'Arturas')];
    mocks.records = new Map([
      [
        PROFILE_THEM,
        {
          positions: null,
          debatesArgued: null,
          claimsBySpace: new Map([
            ['spacea', 1],
            ['spaceb', 1],
          ]),
          debatesBySpace: new Map(),
          winRate: null,
          joinedAt: new Date(Date.UTC(2026, 0, 29)),
        },
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const row = screen.getByText('Arturas').closest('li') as HTMLElement;
    expect(row.textContent!.indexOf('Active in')).toBeLessThan(row.textContent!.indexOf('On Geo since Jan 2026'));
    expect(row).not.toHaveTextContent('Active in…');

    const trigger = within(row).getByRole('button', { name: 'View 2 active spaces' });
    fireEvent.click(trigger);

    const list = await screen.findByRole('list', { name: 'Active spaces' });
    const options = within(list).getAllByTestId('person-space-option');
    expect(options[0]).toHaveAttribute('href', NavUtils.toSpace('spacea'));
    expect(options[1]).toHaveAttribute('href', NavUtils.toSpace('spaceb'));

    await closeActiveSpacesPopover(trigger);
  });

  it('shows only spaces with activity and orders them by debates, then canonical rank', async () => {
    const root = 'a19c345ab9866679b001d7d2138d88a1';
    const crypto = 'c9f267dcb0d270718c2a3c45a64afd32';
    const ai = '41e851610e13a19441c4d980f2f2ce6b';
    const unranked = 'ffffffffffffffffffffffffffffffff';
    const inactive = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    mocks.people = [person('user-them', 'Arturas')];
    mocks.spaceLabels = new Map([
      [root, { name: 'Root', image: null }],
      [crypto, { name: 'Crypto', image: null }],
      [ai, { name: 'AI', image: null }],
      [unranked, { name: 'Unranked', image: null }],
      [inactive, { name: 'Inactive', image: null }],
    ]);
    mocks.records = new Map([
      [
        PROFILE_THEM,
        {
          positions: 4,
          debatesArgued: 4,
          claimsBySpace: new Map([
            [ai, 12],
            [unranked, 0],
            [root, 2],
            [crypto, 1],
            [inactive, 0],
          ]),
          debatesBySpace: new Map([
            [ai, 3],
            [unranked, 1],
            [inactive, 0],
          ]),
          winRate: null,
          joinedAt: new Date(Date.UTC(2026, 0, 29)),
        },
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const trigger = screen.getByRole('button', { name: 'View 4 active spaces' });
    fireEvent.click(trigger);
    const list = await screen.findByRole('list', { name: 'Active spaces' });
    const options = within(list).getAllByTestId('person-space-option');

    expect(options.map(option => option.getAttribute('href'))).toEqual(
      [ai, unranked, root, crypto].map(NavUtils.toSpace)
    );
    expect(within(options[0]).getByText('12 claims · 3 debates')).toBeInTheDocument();
    expect(within(options[1]).getByText('0 claims · 1 debate')).toBeInTheDocument();
    expect(within(options[2]).getByText('2 claims · 0 debates')).toBeInTheDocument();
    expect(within(options[3]).getByText('1 claim · 0 debates')).toBeInTheDocument();
    expect(within(list).queryByText('Inactive')).not.toBeInTheDocument();

    await closeActiveSpacesPopover(trigger);
  });

  it('draws nothing at all for somebody in no spaces', () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const row = screen.getByText('Vytautas').closest('li') as HTMLElement;
    expect(within(row).getAllByTestId('person-space-icon')).toHaveLength(1);

    mocks.records = new Map();
    cleanup();
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const bare = screen.getByText('Vytautas').closest('li') as HTMLElement;
    expect(within(bare).queryByTestId('person-space-icon')).not.toBeInTheDocument();
    expect(within(bare).queryByTestId('person-space-overflow')).not.toBeInTheDocument();
  });

  it('shows only spaces where debate publishing is enabled', async () => {
    mocks.publishableSpaceIds = new Set(['spacea']);
    const store = createStore();
    // A remembered selection must not smuggle a disabled space back into `keepSelectedVisible`.
    store.set(debatesHubPeopleSpaceIdsAtom, ['spaceb']);

    render(<PeopleTab onTabChange={mocks.onTabChange} />, store);

    await waitFor(() => expect(store.get(debatesHubPeopleSpaceIdsAtom)).toEqual([]));

    const activeRow = (await screen.findByText('Arturas')).closest('li') as HTMLElement;
    const inactiveRow = screen.getByText('Vytautas').closest('li') as HTMLElement;
    expect(within(activeRow).getAllByTestId('person-space-icon')).toHaveLength(1);
    expect(within(inactiveRow).queryByTestId('person-space-icon')).not.toBeInTheDocument();

    const trigger = within(activeRow).getByRole('button', { name: 'View 1 active space' });
    fireEvent.click(trigger);
    const list = await screen.findByRole('list', { name: 'Active spaces' });
    expect(within(list).getByText('Crypto')).toBeInTheDocument();
    expect(within(list).queryByText('Health')).not.toBeInTheDocument();

    await closeActiveSpacesPopover(trigger);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    expect(await screen.findByRole('button', { name: /Crypto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Health/ })).not.toBeInTheDocument();
  });
});
