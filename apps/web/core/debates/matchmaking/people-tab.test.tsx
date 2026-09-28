import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render as renderWithoutStore, screen, waitFor, within } from '@testing-library/react';

import type React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import type { DebateChallenge, DebatePerson } from '../api';
import type { ClaimPickerEntity } from '../claim-picker-page';
import type { ParticipantPositionsByClaim } from '../participant-positions';
import type { PersonRecord } from './person-record';
import { debatesHubPeopleSpaceIdsAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  /** Privy's answer; the tab's signed-out paths hang off it. */
  authenticated: true,
  people: [] as DebatePerson[],
  peopleDataAvailable: true,
  peopleLoading: false,
  peopleError: null as Error | null,
  peopleRefetch: vi.fn(),
  challenge: null as DebateChallenge | null,
  outboundRequest: null as unknown,
  activeDebate: null as unknown,
  currentUserId: 'user-me' as string | null,
  personalSpaceId: '019fedae-72b6-7ab2-927a-df044d57c500' as string | null,
  positionsByClaim: new Map() as ParticipantPositionsByClaim,
  positionParticipants: [] as Array<{ profile_space_id: string }>,
  positionsFetching: false,
  positionsPlaceholderData: false,
  claimEntities: [] as ClaimPickerEntity[],
  claimEntitiesLoading: false,
  claimEntitiesError: null as Error | null,
  createChallenge: vi.fn(),
  onTabChange: vi.fn(),
  cancelChallenge: vi.fn(),
  cancelPending: false,
  cancelError: null as Error | null,
  records: new Map<string, PersonRecord>(),
  publishableSpaceIds: null as Set<string> | null,
  publishableSpacesLoading: false,
  peerAvailability: true,
  debugBooking: false,
  propose: {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null as Error | null,
    data: undefined as unknown,
  },
  usePeerSchedule: vi.fn(),
  spaceLabels: new Map<string, { name: string | null; image: string | null }>(),
  /** Every prop set handed to a link this render, so a stray handler is visible. */
  linkProps: [] as Record<string, unknown>[],
  personProfileOpened: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ personProfileOpened: mocks.personProfileOpened }));

// The real one reaches for the sync engine and the router; a plain anchor is what the assertions
// below are about — a real href, and nothing intercepting the click.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    ref,
    ...props
  }: { children: React.ReactNode; ref?: React.Ref<HTMLAnchorElement> } & Record<string, unknown>) => {
    mocks.linkProps.push(props);
    return (
      <a
        ref={ref}
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
  // The set-schedule banner reads the saved calendar; these keep the mock complete rather than
  // exercising it — the schedule itself is covered in core/availability.
  useDebateSchedule: () => ({ blocks: [], isSet: false }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  // Reached only once a row's "See times" opens the modal. A `vi.fn` rather than a bare arrow, so
  // a case can assert which peer the row asked about.
  usePeerSchedule: (peerUserId: string | null) => mocks.usePeerSchedule(peerUserId),
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
  useDebatePeople: () => ({
    data: mocks.peopleDataAvailable ? { people: mocks.people } : undefined,
    isLoading: mocks.peopleLoading,
    error: mocks.peopleError,
    failureReason: mocks.peopleError,
    refetch: mocks.peopleRefetch,
  }),
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
      isLoading: mocks.publishableSpacesLoading,
    }),
  };
});

// Names and thumbnails come from the browse sidebar's cache, which these tests do not mount.
vi.mock('~/core/hooks/use-space-labels', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/hooks/use-space-labels')>();
  return { ...actual, useSpaceLabels: () => ({ labelsById: mocks.spaceLabels, isLoading: false }) };
});

// GEO-2938 is behind a flag that is off by default. These cases are about the row, so the flag is
// on unless a case turns it off.
vi.mock('~/core/state/feature-flags', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/state/feature-flags')>()),
  usePeerAvailabilityEnabled: () => mocks.peerAvailability,
  useDebugDebatesPageEnabled: () => mocks.debugBooking,
}));

// Reaches for a query client this suite does not stand up, and booking has its own coverage.
vi.mock('../rooms/scheduling-hooks', () => ({
  useCreateScheduledDebate: () => mocks.propose,
}));

vi.mock('../use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => mocks.currentUserId,
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isLoading: false }),
}));

vi.mock('../participant-positions', () => ({
  useParticipantPositions: (participants: Array<{ profile_space_id: string }>) => {
    mocks.positionParticipants = participants;
    return {
      byClaim: mocks.positionsByClaim,
      isLoading: false,
      isFetching: mocks.positionsFetching,
      isPlaceholderData: mocks.positionsPlaceholderData,
      error: null,
    };
  },
}));

vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: () => ({
    entities: mocks.claimEntities,
    isLoading: mocks.claimEntitiesLoading,
    error: mocks.claimEntitiesError,
  }),
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

function claimEntity(id: string, name: string): ClaimPickerEntity {
  return { id, name, description: null, spaces: [], values: [], relations: [] };
}

function record(over: Partial<PersonRecord> = {}): PersonRecord {
  const result: PersonRecord = {
    positions: null,
    debatesArgued: null,
    claimsBySpace: new Map(),
    debatesBySpace: new Map(),
    joinedAt: null,
    activeSpaceIds: new Set(),
    ...over,
  };

  if (!over.activeSpaceIds) {
    result.activeSpaceIds = new Set(
      [result.claimsBySpace, result.debatesBySpace]
        .flatMap(counts => [...(counts ?? [])])
        .filter(([, count]) => count > 0)
        .map(([spaceId]) => spaceId)
    );
  }

  return result;
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
  mocks.peerAvailability = true;
  mocks.debugBooking = false;
  mocks.propose = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null, data: undefined };
  mocks.usePeerSchedule.mockReset();
  // Enough of a schedule that the view renders its heading, so a case can see the peer's name.
  mocks.usePeerSchedule.mockReturnValue({
    enabled: true,
    isPending: false,
    isError: false,
    schedule: {
      userId: 'user-them',
      viewerTimezone: 'UTC',
      peerTimezone: 'UTC',
      viewerHasSchedule: true,
      peerHasSchedule: true,
      theirWeekKnown: true,
      slots: [],
    },
  });
  mocks.people = [person('user-them', 'Arturas'), person('user-other', 'Vytautas')];
  mocks.peopleDataAvailable = true;
  mocks.peopleLoading = false;
  mocks.peopleError = null;
  mocks.peopleRefetch.mockReset();
  mocks.challenge = null;
  mocks.outboundRequest = null;
  mocks.activeDebate = null;
  mocks.currentUserId = 'user-me';
  mocks.personalSpaceId = '019fedae-72b6-7ab2-927a-df044d57c500';
  mocks.positionsByClaim = new Map();
  mocks.positionParticipants = [];
  mocks.positionsFetching = false;
  mocks.positionsPlaceholderData = false;
  mocks.claimEntities = [];
  mocks.claimEntitiesLoading = false;
  mocks.claimEntitiesError = null;
  mocks.createChallenge.mockReset();
  mocks.onTabChange.mockReset();
  mocks.cancelChallenge.mockReset();
  mocks.cancelPending = false;
  mocks.cancelError = null;
  mocks.records = new Map();
  mocks.publishableSpaceIds = null;
  mocks.publishableSpacesLoading = false;
  mocks.spaceLabels = new Map();
  mocks.linkProps = [];
  mocks.personProfileOpened.mockReset();
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

function expectSpaceMetrics(option: HTMLElement, expected: { debates: string; claims: string; matches: string }) {
  const debate = within(option).getByText(expected.debates);
  const claims = within(option).getByText(expected.claims);
  const matches = within(option).getByText(expected.matches);

  expect(option.querySelectorAll('svg')).toHaveLength(2);
  expect(matches.parentElement).toHaveClass('gap-1.5');
  expect(debate.compareDocumentPosition(claims) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(claims.compareDocumentPosition(matches) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
  it('keeps malformed roster IDs out of the shared position query', () => {
    mocks.people = [person('user-them', 'Arturas'), person('user-without-space', 'Nameless')];

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(mocks.positionParticipants).toEqual([
      { profile_space_id: mocks.personalSpaceId },
      { profile_space_id: PROFILE_SPACE_IDS['user-them'] },
    ]);
  });

  it('shows the number of distinct claims where the viewer and a person hold opposite positions', () => {
    const viewer = mocks.personalSpaceId!;
    const arturas = PROFILE_SPACE_IDS['user-them'];
    const vytautas = PROFILE_SPACE_IDS['user-other'];
    const context = {
      spaceId: '019fedae-72b6-7ab2-927a-df044d57c600',
      responseKind: 'stance' as const,
    };
    mocks.positionsByClaim = new Map([
      [
        'claim-1',
        [
          { profileSpaceId: viewer, claimId: 'claim-1', position: true, ...context },
          { profileSpaceId: arturas, claimId: 'claim-1', position: false, ...context },
          { profileSpaceId: vytautas, claimId: 'claim-1', position: true, ...context },
        ],
      ],
      [
        'claim-2',
        [
          { profileSpaceId: viewer, claimId: 'claim-2', position: false, ...context },
          { profileSpaceId: arturas, claimId: 'claim-2', position: true, ...context },
        ],
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('button', { name: 'View 2 matching claims with Arturas' })).toHaveTextContent('2 matches');
    expect(screen.queryByRole('button', { name: /View 0 matching claims/ })).not.toBeInTheDocument();
  });

  it('uses singular copy for one matching claim', () => {
    const viewer = mocks.personalSpaceId!;
    const arturas = PROFILE_SPACE_IDS['user-them'];
    const spaceId = '019fedae-72b6-7ab2-927a-df044d57c600';
    mocks.positionsByClaim = new Map([
      [
        'claim-1',
        [
          { profileSpaceId: viewer, claimId: 'claim-1', spaceId, responseKind: 'stance', position: true },
          { profileSpaceId: arturas, claimId: 'claim-1', spaceId, responseKind: 'stance', position: false },
        ],
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('button', { name: 'View 1 matching claim with Arturas' })).toHaveTextContent('1 match');
  });

  it("does not show a match count on the viewer's own row", () => {
    const viewer = mocks.personalSpaceId!;
    const arturas = PROFILE_SPACE_IDS['user-them'];
    const spaceId = '019fedae-72b6-7ab2-927a-df044d57c600';
    mocks.currentUserId = 'user-them';
    mocks.positionsByClaim = new Map([
      [
        'claim-1',
        [
          { profileSpaceId: viewer, claimId: 'claim-1', spaceId, responseKind: 'stance', position: true },
          { profileSpaceId: arturas, claimId: 'claim-1', spaceId, responseKind: 'stance', position: false },
        ],
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.queryByText(/matches?/)).not.toBeInTheDocument();
  });

  it('sorts the people with the most matches first and preserves roster order for ties', () => {
    const viewer = mocks.personalSpaceId!;
    const arturas = PROFILE_SPACE_IDS['user-them'];
    const vytautas = PROFILE_SPACE_IDS['user-other'];
    const context = {
      spaceId: '019fedae-72b6-7ab2-927a-df044d57c600',
      responseKind: 'stance' as const,
    };
    mocks.positionsByClaim = new Map([
      [
        'claim-1',
        [
          { profileSpaceId: viewer, claimId: 'claim-1', position: true, ...context },
          { profileSpaceId: arturas, claimId: 'claim-1', position: false, ...context },
          { profileSpaceId: vytautas, claimId: 'claim-1', position: false, ...context },
        ],
      ],
      [
        'claim-2',
        [
          { profileSpaceId: viewer, claimId: 'claim-2', position: true, ...context },
          { profileSpaceId: vytautas, claimId: 'claim-2', position: false, ...context },
        ],
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const arturasRow = screen.getByText('Arturas').closest('li')!;
    const vytautasRow = screen.getByText('Vytautas').closest('li')!;
    expect(vytautasRow.compareDocumentPosition(arturasRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the opposing claims from the matches count', async () => {
    const viewer = mocks.personalSpaceId!;
    const arturas = PROFILE_SPACE_IDS['user-them'];
    const spaceId = '019fedae-72b6-7ab2-927a-df044d57c600';
    mocks.positionsByClaim = new Map([
      [
        'claim-1',
        [
          { profileSpaceId: viewer, claimId: 'claim-1', spaceId, responseKind: 'stance', position: true },
          { profileSpaceId: arturas, claimId: 'claim-1', spaceId, responseKind: 'stance', position: false },
        ],
      ],
      [
        'claim-2',
        [
          { profileSpaceId: viewer, claimId: 'claim-2', spaceId, responseKind: 'stance', position: false },
          { profileSpaceId: arturas, claimId: 'claim-2', spaceId, responseKind: 'stance', position: true },
        ],
      ],
    ]);
    mocks.claimEntities = [claimEntity('claim-1', 'Should we build this?'), claimEntity('claim-2', 'Is this true?')];
    mocks.spaceLabels = new Map([[normId(spaceId), { name: 'US Politics', image: null }]]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'View 2 matching claims with Arturas' }));

    const list = await screen.findByRole('list', { name: 'Matching claims with Arturas' });
    expect(list.closest('[role="dialog"]')).toHaveTextContent('2 matches with Arturas');
    const firstMatch = within(list).getByText('Should we build this?').closest('a')!;
    expect(firstMatch).toHaveAttribute('href', NavUtils.toEntity(spaceId, 'claim-1'));
    expect(within(firstMatch).getByText('US Politics')).toBeInTheDocument();
    expect(within(firstMatch).getByText('You:')).toBeInTheDocument();
    expect(within(firstMatch).getByText('Agree')).toBeInTheDocument();
    expect(within(firstMatch).getByText('Arturas:')).toBeInTheDocument();
    expect(within(firstMatch).getByText('Disagree')).toBeInTheDocument();
    expect(firstMatch.querySelectorAll('svg')).toHaveLength(2);

    // The second claim used to be a veracity match and read Dispute/Verify here. Every claim asks
    // the same question now, so the sides are named the same way on both rows — the two matches
    // still differ by side, which is what the row is for.
    const secondMatch = within(list).getByText('Is this true?').closest('a')!;
    expect(within(secondMatch).getByText('You:')).toBeInTheDocument();
    expect(within(secondMatch).getByText('Disagree')).toBeInTheDocument();
    expect(within(secondMatch).getByText('Arturas:')).toBeInTheDocument();
    expect(within(secondMatch).getByText('Agree')).toBeInTheDocument();
  });

  it('distinguishes an untitled claim from unavailable claim metadata', async () => {
    const viewer = mocks.personalSpaceId!;
    const arturas = PROFILE_SPACE_IDS['user-them'];
    const spaceId = '019fedae-72b6-7ab2-927a-df044d57c600';
    const matchingClaim = (claimId: string) => [
      { profileSpaceId: viewer, claimId, spaceId, responseKind: 'stance' as const, position: true },
      { profileSpaceId: arturas, claimId, spaceId, responseKind: 'stance' as const, position: false },
    ];
    mocks.positionsByClaim = new Map([
      ['claim-untitled', matchingClaim('claim-untitled')],
      ['claim-unavailable', matchingClaim('claim-unavailable')],
    ]);
    mocks.claimEntities = [{ ...claimEntity('claim-untitled', ''), name: null }];
    mocks.claimEntitiesError = new Error('Claim metadata unavailable');

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'View 2 matching claims with Arturas' }));

    const list = await screen.findByRole('list', { name: 'Matching claims with Arturas' });
    expect(within(list).getByText('Untitled claim')).toBeInTheDocument();
    expect(within(list).getByText('Claim unavailable')).toBeInTheDocument();
  });

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

  // Every displayed field in the record is public graph data — positions, debates and join date need no
  // viewer identity — so a signed-out visitor gets the full context before being asked to sign in.
  // Only the button is gated.
  it('shows the record signed out, gating only the button', () => {
    mocks.authenticated = false;
    mocks.records = new Map([
      [
        PROFILE_SPACE_IDS['user-them'],
        record({
          positions: 119,
          debatesArgued: 11,
          joinedAt: new Date(Date.UTC(2026, 0, 29)),
        }),
      ],
    ]);
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByText('119 positions')).toBeInTheDocument();
    expect(screen.getByText('11 debates')).toBeInTheDocument();
    expect(screen.queryByText(/^Won /)).not.toBeInTheDocument();
    expect(screen.queryByText('73%')).not.toBeInTheDocument();
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

// GEO-2938. The row is the first way into someone else's availability; until this, the view was
// only reachable from its debug route.
describe('See times', () => {
  it('opens that person availability, named and by user id', async () => {
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'See times for Arturas' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = within(screen.getByRole('dialog'));
    // The id the row asked about, and the name it handed down, rather than the static title.
    expect(mocks.usePeerSchedule).toHaveBeenCalledWith('user-them');
    expect(dialog.getByRole('heading', { name: /Arturas/ })).toBeInTheDocument();
  });

  it('mounts nothing until it is asked for', () => {
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Being unable to debate someone now is when their next free slot matters most.
  it('stays live while the pill is blocked', () => {
    mocks.people = [{ ...person('user-them', 'Arturas'), in_debate: true }];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('button', { name: 'In a debate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'See times for Arturas' })).toBeEnabled();
  });

  // The list is everyone online *now*, so the viewed person can drop off it at any moment. The
  // dialog is mounted at tab level precisely so their row unmounting cannot take it away.
  it('stays open when the person goes offline and leaves the list', async () => {
    mocks.people = [person('user-them', 'Arturas'), person('user-other', 'Vytautas')];
    const store = createStore();
    const { rerender } = render(<PeopleTab onTabChange={mocks.onTabChange} />, store);

    fireEvent.click(screen.getByRole('button', { name: 'See times for Arturas' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    mocks.people = [person('user-other', 'Vytautas')];
    // Re-wrapped, because RTL's rerender takes the bare element and dropping the Provider would
    // remount the tab and lose the state this case is about.
    rerender(
      <Provider store={store}>
        <PeopleTab onTabChange={mocks.onTabChange} />
      </Provider>
    );

    expect(screen.queryByRole('button', { name: 'See times for Arturas' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.usePeerSchedule).toHaveBeenCalledWith('user-them');
  });

  it('gives focus back to the row it was opened from', async () => {
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const opener = screen.getByRole('button', { name: 'See times for Arturas' });
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('is absent while the flag is off, which is the default', () => {
    mocks.peerAvailability = false;
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.queryByRole('button', { name: /See times/ })).not.toBeInTheDocument();
    // The row is otherwise untouched.
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeInTheDocument();
  });

  // Booking a room is reached through the week, so the debug flag has to open it on its own.
  it('opens on the booking flag even with availability off', () => {
    mocks.peerAvailability = false;
    mocks.debugBooking = true;
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('button', { name: 'See times for Arturas' })).toBeInTheDocument();
  });

  it('proposes against the person whose week is open', async () => {
    mocks.debugBooking = true;
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'See times for Arturas' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // The modal owns the week; what this asserts is the wiring it was handed.
    expect(mocks.usePeerSchedule).toHaveBeenCalledWith('user-them');
  });

  it('clears a finished proposal so the next week does not open showing it', async () => {
    mocks.debugBooking = true;
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'See times for Arturas' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(mocks.propose.reset).toHaveBeenCalled());
  });

  it('sends a signed-out viewer to sign in, since the read behind it is viewer-scoped', () => {
    mocks.authenticated = false;
    mocks.people = [person('user-them', 'Arturas')];
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'See times for Arturas' }));

    expect(mocks.promptSignIn).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// GEO-2788 / GEO-2611. The name goes to the person's personal space, and the hub stays open on the
// way. Its click handler only observes analytics, so Next still owns cmd-click and middle click.
describe('the person link', () => {
  it("points the name at the person's space", () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('link', { name: 'Arturas' })).toHaveAttribute(
      'href',
      NavUtils.toSpace(PROFILE_SPACE_IDS['user-them'])
    );
  });

  // Analytics observes the click without replacing navigation, so Next still owns cmd-click,
  // middle-click and the eventual route change.
  it('attributes a profile click without intercepting navigation', () => {
    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const nameLink = mocks.linkProps.find(props => props.href === NavUtils.toSpace(PROFILE_SPACE_IDS['user-them']));
    expect(nameLink).toBeDefined();
    const onClick = nameLink?.onClick as (() => void) | undefined;
    expect(onClick).toBeTypeOf('function');

    onClick?.();

    expect(mocks.personProfileOpened).toHaveBeenCalledWith(PROFILE_SPACE_IDS['user-them'], null, {
      interaction_surface: 'debates_hub_people',
    });
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
        record({
          positions: 1,
          debatesArgued: null,
          claimsBySpace: new Map([['spacea', 1]]),
          debatesBySpace: new Map(),
          joinedAt: null,
        }),
      ],
      [
        PROFILE_OTHER,
        record({
          positions: 1,
          debatesArgued: null,
          claimsBySpace: new Map([['spaceb', 1]]),
          debatesBySpace: new Map(),
          joinedAt: null,
        }),
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
    mocks.records.set(
      PROFILE_OTHER,
      record({
        positions: null,
        debatesArgued: null,
        claimsBySpace: new Map(),
        debatesBySpace: new Map(),
        joinedAt: null,
      })
    );

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    expect(screen.getByRole('button', { name: /Any space/ })).toBeInTheDocument();
    expect(screen.getByText('Arturas')).toBeInTheDocument();
    expect(screen.getByText('Vytautas')).toBeInTheDocument();
    const inactiveRow = screen.getByText('Vytautas').closest('li') as HTMLElement;
    expect(within(inactiveRow).queryByText('Active in')).not.toBeInTheDocument();
  });

  it('never offers or keeps a space where nobody has activity', async () => {
    mocks.spaceLabels.set('spacec', { name: 'Dormant', image: null });
    mocks.records.set(
      PROFILE_THEM,
      record({
        positions: 1,
        debatesArgued: null,
        claimsBySpace: new Map([
          ['spacea', 1],
          ['spacec', 0],
        ]),
        debatesBySpace: new Map([['spacec', 0]]),
        joinedAt: null,
      })
    );
    const store = createStore();
    store.set(debatesHubPeopleSpaceIdsAtom, ['spacec']);

    render(<PeopleTab onTabChange={mocks.onTabChange} />, store);

    await waitFor(() => expect(store.get(debatesHubPeopleSpaceIdsAtom)).toEqual([]));
    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    expect(await screen.findByRole('button', { name: /Crypto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dormant/ })).not.toBeInTheDocument();
  });

  it('does not expose or apply remembered spaces until activity gates settle', async () => {
    mocks.publishableSpacesLoading = true;
    const store = createStore();
    store.set(debatesHubPeopleSpaceIdsAtom, ['spacea']);

    const view = render(<PeopleTab onTabChange={mocks.onTabChange} />, store);

    // The selection survives for reconciliation, but an unverified space cannot narrow the roster,
    // appear on a row, or put itself back into the shared menu through `keepSelectedVisible`.
    expect(store.get(debatesHubPeopleSpaceIdsAtom)).toEqual(['spacea']);
    expect(screen.getByText('Arturas')).toBeInTheDocument();
    expect(screen.getByText('Vytautas')).toBeInTheDocument();
    expect(screen.queryByText('Active in')).not.toBeInTheDocument();
    const spaceFilterTrigger = screen.getByRole('button', { name: /Any space/ });
    fireEvent.click(spaceFilterTrigger);
    expect(screen.queryByRole('button', { name: /Crypto/ })).not.toBeInTheDocument();
    fireEvent.click(spaceFilterTrigger);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    mocks.publishableSpacesLoading = false;
    mocks.publishableSpaceIds = new Set(['spacea']);
    view.rerender(
      <Provider store={store}>
        <PeopleTab onTabChange={mocks.onTabChange} />
      </Provider>
    );

    expect(await screen.findByText('Arturas')).toBeInTheDocument();
    expect(screen.queryByText('Vytautas')).not.toBeInTheDocument();
    expect(screen.getByText('Active in')).toBeInTheDocument();
  });

  it('preserves a remembered space until the current roster has answered', async () => {
    mocks.peopleDataAvailable = false;
    mocks.peopleLoading = true;
    const store = createStore();
    store.set(debatesHubPeopleSpaceIdsAtom, ['spacea']);

    const view = render(<PeopleTab onTabChange={mocks.onTabChange} />, store);

    expect(store.get(debatesHubPeopleSpaceIdsAtom)).toEqual(['spacea']);
    expect(screen.getByRole('button', { name: /Any space/ })).toBeInTheDocument();

    // A failed cold load still has no roster answer, so it must not be allowed to invalidate the
    // selection either. The retry can later produce the evidence needed to keep or remove it.
    mocks.peopleLoading = false;
    mocks.peopleError = new Error('Roster unavailable');
    view.rerender(
      <Provider store={store}>
        <PeopleTab onTabChange={mocks.onTabChange} />
      </Provider>
    );
    expect(store.get(debatesHubPeopleSpaceIdsAtom)).toEqual(['spacea']);

    mocks.peopleDataAvailable = true;
    mocks.peopleError = null;
    view.rerender(
      <Provider store={store}>
        <PeopleTab onTabChange={mocks.onTabChange} />
      </Provider>
    );

    expect(await screen.findByText('Arturas')).toBeInTheDocument();
    expect(screen.queryByText('Vytautas')).not.toBeInTheDocument();
    expect(store.get(debatesHubPeopleSpaceIdsAtom)).toEqual(['spacea']);
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
        record({
          positions: 5,
          debatesArgued: null,
          claimsBySpace: new Map(
            ['spacea', 'spaceb', 'spacec', 'spaced', 'spacee'].map(spaceId => [spaceId, 1] as const)
          ),
          debatesBySpace: new Map(),
          joinedAt: null,
        }),
      ],
      [PROFILE_OTHER, record()],
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
        record({
          positions: null,
          debatesArgued: null,
          claimsBySpace: new Map([
            ['spacea', 1],
            ['spaceb', 1],
          ]),
          debatesBySpace: new Map(),
          joinedAt: new Date(Date.UTC(2026, 0, 29)),
        }),
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const row = screen.getByText('Arturas').closest('li') as HTMLElement;
    expect(row.textContent!.indexOf('Active in')).toBeLessThan(row.textContent!.indexOf('On Geo since Jan 2026'));
    expect(row).not.toHaveTextContent('Active in…');

    const trigger = within(row).getByRole('button', { name: 'View 2 active spaces' });
    fireEvent.click(trigger);

    const list = await screen.findByRole('list', { name: 'Active spaces' });
    expect(list.closest('[role="dialog"]')).toHaveAttribute('aria-label', 'Active in');
    const options = within(list).getAllByTestId('person-space-option');
    await waitFor(() => expect(options[0]).toHaveFocus());
    expect(options[0]).toHaveAttribute('href', NavUtils.toSpace('spacea'));
    expect(options[1]).toHaveAttribute('href', NavUtils.toSpace('spaceb'));

    await closeActiveSpacesPopover(trigger);
  });

  it('does not present an unknown per-space match count as zero while roster data is retained', async () => {
    mocks.people = [person('user-them', 'Arturas')];
    mocks.positionsPlaceholderData = true;

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const row = screen.getByText('Arturas').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'View 1 active space' }));

    const list = await screen.findByRole('list', { name: 'Active spaces' });
    expect(within(list).getByText('1 claim')).toBeInTheDocument();
    expect(within(list).queryByText('0 matches')).not.toBeInTheDocument();
  });

  it('keeps settled match counts visible during a same-key background poll', async () => {
    const viewer = mocks.personalSpaceId!;
    const spaceId = 'spacea';
    mocks.people = [person('user-them', 'Arturas')];
    mocks.positionsFetching = true;
    mocks.positionsByClaim = new Map([
      [
        'claim-1',
        [
          { profileSpaceId: viewer, claimId: 'claim-1', spaceId, responseKind: 'stance', position: true },
          {
            profileSpaceId: PROFILE_THEM,
            claimId: 'claim-1',
            spaceId,
            responseKind: 'stance',
            position: false,
          },
        ],
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const row = screen.getByText('Arturas').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'View 1 active space' }));

    const list = await screen.findByRole('list', { name: 'Active spaces' });
    expect(within(list).getByText('1 match')).toBeInTheDocument();
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
    const viewer = mocks.personalSpaceId!;
    const matchingClaim = (claimId: string, spaceId: string) => [
      { profileSpaceId: viewer, claimId, spaceId, responseKind: 'stance' as const, position: true },
      { profileSpaceId: PROFILE_THEM, claimId, spaceId, responseKind: 'stance' as const, position: false },
    ];
    mocks.positionsByClaim = new Map([
      ['claim-ai-1', matchingClaim('claim-ai-1', ai)],
      ['claim-ai-2', matchingClaim('claim-ai-2', ai)],
      ['claim-unranked-1', matchingClaim('claim-unranked-1', unranked)],
    ]);
    mocks.records = new Map([
      [
        PROFILE_THEM,
        record({
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
          joinedAt: new Date(Date.UTC(2026, 0, 29)),
        }),
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
    expectSpaceMetrics(options[0], { debates: '3 debates', claims: '12 claims', matches: '2 matches' });
    expectSpaceMetrics(options[1], { debates: '1 debate', claims: '0 claims', matches: '1 match' });
    expectSpaceMetrics(options[2], { debates: '0 debates', claims: '2 claims', matches: '0 matches' });
    expectSpaceMetrics(options[3], { debates: '0 debates', claims: '1 claim', matches: '0 matches' });
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

  it('keeps a proven active space when a capped page makes its exact counts incomplete', async () => {
    mocks.people = [person('user-them', 'Arturas')];
    mocks.records = new Map([
      [
        PROFILE_THEM,
        record({
          activeSpaceIds: new Set(['spacea']),
          claimsBySpace: undefined,
          debatesBySpace: undefined,
        }),
      ],
    ]);

    render(<PeopleTab onTabChange={mocks.onTabChange} />);

    const trigger = screen.getByRole('button', { name: 'View 1 active space' });
    fireEvent.click(trigger);
    const list = await screen.findByRole('list', { name: 'Active spaces' });
    expect(within(list).getByText('Crypto')).toBeInTheDocument();
    expect(within(list).queryByText(/claims|debates/)).not.toBeInTheDocument();

    await closeActiveSpacesPopover(trigger);
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
