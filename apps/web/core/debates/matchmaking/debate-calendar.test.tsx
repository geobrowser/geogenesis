import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import type { DebatePerson, SchedulablePeopleResponse, ScheduledDebateRequest } from '../api';
import type { ParticipantPosition } from '../participant-positions';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  promptSignIn: vi.fn(),
  capture: vi.fn(),
  personProfileOpened: vi.fn(),
  activity: undefined as unknown,
  isPhone: false,
  searchParams: new URLSearchParams(),
  scheduleIsSet: false,
  blocks: [] as unknown[],
  scheduleZone: 'UTC',
  roster: [] as DebatePerson[],
  rosterError: null as Error | null,
  rosterRefetch: vi.fn(),
  schedulable: undefined as SchedulablePeopleResponse | undefined,
  schedulableLoading: false,
  schedulableError: null as Error | null,
  schedulableRefetch: vi.fn(),
  schedulableOptions: [] as unknown[],
  scheduled: [] as ScheduledDebateRequest[],
  scheduledError: null as Error | null,
  scheduledRefetch: vi.fn(),
  matchesByProfile: new Map<string, unknown[]>(),
  bookingProps: null as Record<string, unknown> | null,
  openHub: vi.fn(),
  routerReplace: vi.fn(),
  summaries: [] as unknown[],
  admin: {} as Record<string, unknown>,
  timezones: new Map<string, string>(),
  personalSpaceId: null as string | null,
  viewerHasPositions: true as boolean | null,
  positions: [] as ParticipantPosition[],
  positionReads: [] as unknown[][],
  positionsPlaceholder: false,
  positionsError: null as Error | null,
  matchesUnavailable: false,
  claimEntitiesLoading: false,
  profileOpenOptions: [] as unknown[],
  claimNames: new Map<string, string>(),
  openProfile: vi.fn(),
  respond: vi.fn(),
  claimTopics: new Map<string, { id: string; name: string }[]>(),
  paramListeners: new Set<() => void>(),
  // Next lands a replace in useSearchParams a beat later; deferred, writes wait for `flushRouter`.
  routerDeferred: false,
  routerQueue: [] as string[],
  positionsLoading: false,
  matchesLoading: false,
  // The viewer's own in-flight responses, overlaid on whatever the read returned — even nothing.
  positionsOverlay: [] as ParticipantPosition[],
  sidePanelTarget: null as { entityId: string } | null,
  spaceLabels: new Map<string, { name: string; image: string | null }>(),
  labelRequests: [] as string[][],
  sidePanelListeners: new Set<() => void>(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, personProfileOpened: mocks.personProfileOpened }));
function openSidePanel(target: { entityId: string } | null) {
  mocks.sidePanelTarget = target;
  for (const listener of mocks.sidePanelListeners) listener();
}

function setUrl(href: string) {
  mocks.searchParams = new URLSearchParams(href.split('?')[1] ?? '');
  for (const listener of mocks.paramListeners) listener();
}

// The URL is the panel's state (GEO-3220), so a replace has to land the way Next's does: new params,
// and a render that reads them.
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    mocks.paramListeners.add(listener);
    return () => mocks.paramListeners.delete(listener);
  };
  return {
    useSearchParams: () => useSyncExternalStore(subscribe, () => mocks.searchParams),
    usePathname: () => '/matchmaking/calendar',
    useRouter: () => ({
      replace: (href: string, options?: unknown) => {
        mocks.routerReplace(href, options);
        if (mocks.routerDeferred) mocks.routerQueue.push(href);
        else setUrl(href);
      },
    }),
  };
});
vi.mock('~/core/hooks/use-entity-side-panel', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    mocks.sidePanelListeners.add(listener);
    return () => mocks.sidePanelListeners.delete(listener);
  };
  return {
    useEntitySidePanel: () => ({
      sidePanelTarget: useSyncExternalStore(subscribe, () => mocks.sidePanelTarget),
      openSidePanel: vi.fn(),
      closeSidePanel: vi.fn(),
    }),
  };
});
vi.mock('../participant-positions', () => ({
  useParticipantPositions: (participants: unknown[]) => {
    mocks.positionReads.push(participants);
    const byClaim = new Map<string, ParticipantPosition[]>();
    for (const row of mocks.positionsOverlay) byClaim.set(row.claimId, [...(byClaim.get(row.claimId) ?? []), row]);
    // A failed read with nothing held: no rows, and the error.
    if (participants.length > 0 && !mocks.positionsError) {
      for (const row of mocks.positions) byClaim.set(row.claimId, [...(byClaim.get(row.claimId) ?? []), row]);
    }
    return {
      byClaim: mocks.positionsLoading ? new Map() : byClaim,
      isLoading: mocks.positionsLoading,
      isPlaceholderData: mocks.positionsPlaceholder,
      isFetching: mocks.positionsPlaceholder,
      error: mocks.positionsError,
      hasFetchedData: participants.length > 0 && !mocks.positionsError && !mocks.positionsLoading,
    };
  },
}));
vi.mock('../claim-picker-page', async () => {
  const { TOPICS_PROPERTY_ID } = await import('~/core/claims/ontology');
  return {
    useClaimEntitiesByIds: (ids: string[]) => ({
      entities: (mocks.claimEntitiesLoading ? [] : ids).map(id => ({
        id,
        name: mocks.claimNames.get(id) ?? null,
        relations: (mocks.claimTopics.get(id) ?? []).map(topic => ({
          type: { id: TOPICS_PROPERTY_ID },
          toEntity: topic,
          spaceId: null,
        })),
      })),
      isLoading: mocks.claimEntitiesLoading,
      error: null,
    }),
  };
});
// The vote reads the claim's response state; here the viewer's side comes from the positions mock.
vi.mock('../browse/use-debate-claim-response', () => ({
  useDebateClaimResponse: ({ claimId }: { claimId: string }) => ({
    control: {
      viewerPosition:
        mocks.positions.find(row => row.claimId === claimId && row.profileSpaceId === mocks.personalSpaceId)
          ?.position ?? null,
      respond: (position: boolean) => mocks.respond(claimId, position),
      canRespond: true,
      isResponseSubmitting: false,
      actionTitle: () => undefined,
      responseError: null,
    },
  }),
}));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null }) }));
// Resolving a profile reads the space; here it only has to be asked, with whose.
vi.mock('../browse/use-open-debater-profile', () => ({
  useOpenDebaterProfile: (profileSpaceId: string, options?: unknown) => {
    mocks.profileOpenOptions.push(options);
    return (event: { preventDefault: () => void }) => {
      event.preventDefault();
      mocks.openProfile(profileSpaceId);
      // What the real opener ends in: the entity side panel showing their profile.
      openSidePanel({ entityId: profileSpaceId });
    };
  },
}));
vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => mocks.isPhone }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }),
}));
vi.mock('~/core/hooks/use-space-labels', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/use-space-labels')>()),
  useSpaceLabels: (ids: string[]) => {
    mocks.labelRequests.push(ids);
    return { labelsById: mocks.spaceLabels };
  },
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    href,
    className,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    onClick?: (event: React.MouseEvent) => void;
  }) => (
    <a
      {...rest}
      href={href}
      className={className}
      onClick={event => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated, ready: true, accountKey: 'me' }),
  useDebateSchedule: () => ({
    blocks: mocks.blocks,
    isSet: mocks.scheduleIsSet,
    data: { is_set: mocks.scheduleIsSet, schedule: { timezone: mocks.scheduleZone } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn() }),
  useDebateActivity: () => ({ data: mocks.activity }),
  useAcceptDebateChallenge: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectDebateChallenge: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateDebateChallenge: () => ({ mutate: vi.fn(), isPending: false }),
  useDebateClaims: () => ({ data: undefined }),
}));
vi.mock('./hooks', () => ({
  useDebatePeople: () => ({
    data: mocks.rosterError ? undefined : { people: mocks.roster },
    isLoading: false,
    error: mocks.rosterError,
    refetch: mocks.rosterRefetch,
  }),
  useDebateRequests: () => ({ data: undefined }),
  useSchedulablePeople: (_enabled: boolean, options: unknown) => {
    mocks.schedulableOptions.push(options);
    return {
      data: mocks.schedulable,
      isLoading: mocks.schedulableLoading,
      error: mocks.schedulableError,
      isPlaceholderData: false,
      refetch: mocks.schedulableRefetch,
    };
  },
}));
vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => ({
    data: mocks.scheduledError ? undefined : { requests: mocks.scheduled },
    error: mocks.scheduledError,
    refetch: mocks.scheduledRefetch,
  }),
  useAdminScheduledDebates: () => mocks.admin,
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'me' }));
vi.mock('./use-geo-chat-user-summaries', () => ({ useGeoChatUserSummaries: () => mocks.summaries }));
vi.mock('./admin-hooks', () => ({
  useAdminDebaters: () => ({ timezoneByUser: mocks.timezones }),
}));
// The dialog has its own suite; here it only has to open.
vi.mock('./admin-new-match-dialog', () => ({
  AdminNewMatchDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="New match" /> : null),
}));
vi.mock('./use-debates-hub', () => ({ useDebatesHub: () => ({ open: mocks.openHub, close: vi.fn() }) }));
vi.mock('./use-person-facts', () => ({
  usePersonFacts: () => ({
    matchAnalysis: { byProfile: mocks.matchesByProfile, countsByProfileAndSpace: new Map() },
    matchesKnown: true,
    viewerHasPositions: mocks.viewerHasPositions,
    matchesUnavailable: mocks.matchesUnavailable,
    matchesLoading: mocks.matchesLoading,
    matchingSpaceIds: [],
    matchingClaimNamesById: new Map(),
    matchingClaimsLoading: false,
    records: new Map(),
    personRecordsPending: false,
    publishableSpacesPending: false,
    spaceActivityUnavailable: false,
    debateSpacesByPerson: new Map(),
    activeSpaceIds: new Set(),
  }),
}));
// The header's own controls and the filter bar have their own suites; these are about the week.
vi.mock('./hub-header-controls', () => ({
  HubHeaderControls: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./claims-tab', () => ({
  SpaceTopicFilters: ({ trailing }: { trailing?: React.ReactNode }) => (
    <div>
      <button type="button">Space menu</button>
      {trailing}
    </div>
  ),
}));
vi.mock('./space-filter-pills', () => ({
  SpaceFilterPills: ({ onSpaceToggle }: { onSpaceToggle: (spaceId: string) => void }) => (
    <button type="button" onClick={() => onSpaceToggle('space-1')}>
      Pick a space
    </button>
  ),
}));
vi.mock('~/partials/availability/peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: (props: Record<string, unknown>) => {
    mocks.bookingProps = props;
    return props.open ? <div role="dialog" aria-label={`Book ${String(props.peerName)}`} /> : null;
  },
}));
vi.mock('~/partials/availability/availability-modal', () => ({ AvailabilityModal: () => null }));

const { DebateCalendar } = await import('./debate-calendar');

// Wednesday 7 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 7, 10, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

const PROFILE = (id: string) => `019fedae72b67ab2927adf044d57c5${id.padStart(2, '0')}`;

function summary(id: string, name: string) {
  return {
    user_id: id,
    profile_space_id: `019fedae-72b6-7ab2-927a-df044d57c5${id.padStart(2, '0')}`,
    display_name: name,
    avatar_cid: null,
  };
}

function free(id: string, name: string, windows: [string, string][]) {
  return {
    user: summary(id, name),
    online: false,
    slots: [],
    truncated: false,
    their_windows: windows.map(([start, end]) => ({ start, end, viewer_free: false })),
  };
}

function response(people: SchedulablePeopleResponse['people'], over: Partial<SchedulablePeopleResponse> = {}) {
  return { viewer_timezone: 'UTC', viewer_has_schedule: false, people, truncated: false, ...over };
}

const match = (n: number) => ({ claimId: `claim-${n}`, spaceId: 'space-1', responseKind: 'stance' });

const thursdaySix: [string, string] = [at(8, 18), at(8, 19)];

function notAdmin() {
  return { isAdmin: false, isAdminPending: false, data: undefined, error: null, isPending: false, truncated: false };
}

function adminWith(matches: ScheduledDebateRequest[]) {
  return {
    isAdmin: true,
    isAdminPending: false,
    data: { matches },
    error: null,
    failureReason: null,
    isPending: false,
    truncated: false,
    refetch: vi.fn(),
  };
}

function scheduledMatch(over: Partial<ScheduledDebateRequest>): ScheduledDebateRequest {
  return {
    request_id: 'req',
    status: 'pending',
    scheduled_start_at: at(8, 15),
    scheduled_end_at: at(8, 15, 30),
    invited_by_user_id: '11',
    created_by_admin: false,
    proposed_by_user_id: '11',
    reschedule_count: 0,
    room_id: null,
    participants: [
      { user_id: '11', accepted: true },
      { user_id: '12', accepted: null },
    ],
    viewer_must_answer: false,
    ...over,
  };
}

const ADMIN_MATCHES = [
  scheduledMatch({
    request_id: 'confirmed',
    status: 'accepted',
    scheduled_start_at: at(8, 18),
    scheduled_end_at: at(8, 18, 30),
    participants: [
      { user_id: '11', accepted: true },
      { user_id: '12', accepted: true },
    ],
  }),
  scheduledMatch({ request_id: 'waiting' }),
  scheduledMatch({
    request_id: 'admin-match',
    scheduled_start_at: at(9, 12),
    scheduled_end_at: at(9, 12, 30),
    invited_by_user_id: null,
    proposed_by_user_id: null,
    created_by_admin: true,
    outside_availability: true,
    participants: [
      { user_id: '12', accepted: null },
      { user_id: '13', accepted: null },
    ],
  }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(mocks, {
    authenticated: true,
    isPhone: false,
    searchParams: new URLSearchParams(),
    scheduleIsSet: false,
    blocks: [],
    scheduleZone: 'UTC',
    roster: [],
    rosterError: null,
    schedulable: response([free('11', 'Elena', [thursdaySix])]),
    schedulableLoading: false,
    schedulableError: null,
    schedulableOptions: [],
    scheduled: [],
    scheduledError: null,
    matchesByProfile: new Map(),
    activity: undefined,
    bookingProps: null,
    summaries: [],
    admin: notAdmin(),
    personalSpaceId: null,
    viewerHasPositions: true,
    positions: [],
    positionReads: [],
    positionsPlaceholder: false,
    positionsError: null,
    matchesUnavailable: false,
    claimEntitiesLoading: false,
    profileOpenOptions: [],
    routerDeferred: false,
    routerQueue: [],
    positionsLoading: false,
    matchesLoading: false,
    positionsOverlay: [],
    sidePanelTarget: null,
    spaceLabels: new Map(),
    labelRequests: [],
    claimNames: new Map(),
    claimTopics: new Map(),
  });
  mocks.openProfile.mockReset();
  mocks.respond.mockReset();
  mocks.paramListeners.clear();
  mocks.sidePanelListeners.clear();
  mocks.routerReplace.mockReset();
  mocks.capture.mockReset();
  mocks.promptSignIn.mockReset();
  mocks.openHub.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const cell = (name: RegExp) => screen.getByRole('gridcell', { name });
const firstFace = (gridcell: HTMLElement) => within(gridcell).getAllByTestId('calendar-face')[0];

describe('DebateCalendar', () => {
  it('asks a signed-out viewer to sign in instead of drawing an empty week', () => {
    mocks.authenticated = false;
    render(<DebateCalendar />);

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.promptSignIn).toHaveBeenCalled();
  });

  it("shows everyone's free time to a viewer with no schedule, and nudges without blocking", () => {
    render(<DebateCalendar />);

    expect(mocks.schedulableOptions[0]).toEqual({ calendar: true, spaces: [] });
    expect(cell(/Thursday.*free: Elena/)).toBeInTheDocument();
    expect(screen.getByText(/Set your availability so others can book you too/)).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith('debate_calendar_opened', {
      opened_from: 'direct',
      viewer_has_schedule: false,
    });
  });

  it('runs Sunday to Saturday, with a line at the current time in today', () => {
    render(<DebateCalendar />);

    const headers = screen.getAllByRole('columnheader').slice(1);
    expect(headers[0]).toHaveTextContent(/Sun\s*4/);
    expect(headers[6]).toHaveTextContent(/Sat\s*10/);
    // Wednesday 10:00 sharp: the top of Wednesday's 10 o'clock row.
    const line = screen.getByTestId('calendar-now-line');
    expect(line.closest('[role="gridcell"]')).toHaveAccessibleName(/^Wednesday, October 7, 10:00 AM/);
    expect(line).toHaveStyle({ top: '0%' });
  });

  it('opens this week on the current time, and other weeks on their first busy hour', () => {
    // jsdom lays nothing out: give each hour row 64px, stacked in order, in a 384px viewport.
    const ROW = 64;
    const hourIndex = (element: HTMLElement) =>
      element.getAttribute('role') === 'row' && element.parentElement?.getAttribute('role') === 'rowgroup'
        ? Array.from(element.parentElement.children).indexOf(element)
        : 0;
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return hourIndex(this) * ROW;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ROW);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(384);
    vi.setSystemTime(new Date(2026, 9, 7, 10, 30));
    mocks.schedulable = response([free('11', 'Elena', [thursdaySix, [at(15, 18), at(15, 19)]])]);
    render(<DebateCalendar />);
    const grid = screen.getAllByRole('rowgroup')[0];

    // 10:30 is 672px down; a third of the viewport above it leaves 544px.
    expect(grid.scrollTop).toBe(10 * ROW + ROW / 2 - 384 / 3);

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getAllByRole('rowgroup')[0].scrollTop).toBe(18 * ROW - 8);
  });

  it('draws faces as pictures, not buttons, so the cell is the only target', () => {
    render(<DebateCalendar />);

    expect(within(cell(/Thursday.*free: Elena/)).queryAllByRole('button')).toHaveLength(0);
  });

  it('collapses a crowded hour and lists everyone in it, most matches first', () => {
    mocks.schedulable = response([
      free('11', 'Ana', [thursdaySix]),
      free('12', 'Ben', [thursdaySix]),
      free('13', 'Cy', [thursdaySix]),
      free('14', 'Dee', [thursdaySix]),
      free('15', 'Eli', [thursdaySix]),
    ]);
    mocks.matchesByProfile = new Map([
      [normId(summary('15', 'Eli').profile_space_id), [match(1), match(2), match(3)]],
      [normId(summary('13', 'Cy').profile_space_id), [match(4)]],
    ]);
    render(<DebateCalendar />);

    const crowded = cell(/Thursday.*free: Eli, Cy, Ana and 2 more/);
    expect(crowded).toHaveTextContent('+2');

    fireEvent.click(crowded);
    const list = screen.getByRole('dialog', { name: /Free Thursday/ });
    // The rows themselves, not the lists nested inside a row's match and space popovers.
    const rows = [...list.querySelectorAll(':scope > ul > li')];
    expect(rows.map(row => row.textContent?.match(/Ana|Ben|Cy|Dee|Eli/)?.[0])).toEqual([
      'Eli',
      'Cy',
      'Ana',
      'Ben',
      'Dee',
    ]);
    expect(mocks.capture).toHaveBeenCalledWith('debate_calendar_hour_opened', { people_count: 5 });
  });

  it('records whose card opened, once, when a face is hovered', async () => {
    render(<DebateCalendar />);

    fireEvent.pointerEnter(firstFace(cell(/Thursday.*free: Elena/)), { pointerType: 'mouse' });

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith('debate_calendar_person_viewed', { peer_user_id: '11' })
    );
    expect(mocks.capture.mock.calls.filter(([name]) => name === 'debate_calendar_person_viewed')).toHaveLength(1);
  });

  it('opens the hour, not a booking, when a face itself is clicked', () => {
    render(<DebateCalendar />);

    fireEvent.click(firstFace(cell(/Thursday.*free: Elena/)));
    expect(screen.getByRole('dialog', { name: /Free Thursday/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Book Elena' })).not.toBeInTheDocument();
  });

  it("opens a name in the hour's list as their profile in the side panel", () => {
    render(<DebateCalendar />);

    fireEvent.click(firstFace(cell(/Thursday.*free: Elena/)));
    fireEvent.click(within(screen.getByRole('dialog', { name: /Free Thursday/ })).getByRole('link', { name: 'Elena' }));

    expect(mocks.openProfile).toHaveBeenCalledWith(summary('11', '').profile_space_id);
  });

  it('marks the chips for times the viewer is free too, as the booking modal does', () => {
    mocks.scheduleIsSet = true;
    // Thursday 18:00-18:30 only, saved in the browser's own zone so it means 18:00 here.
    mocks.blocks = [{ id: 'r', kind: 'recurring', weekday: 3, start: 18 * 60, end: 18 * 60 + 30 }];
    mocks.scheduleZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    mocks.schedulable = response([free('11', 'Elena', [thursdaySix])], { viewer_has_schedule: true });
    render(<DebateCalendar />);

    fireEvent.click(cell(/Thursday.*free: Elena/));
    const list = screen.getByRole('dialog', { name: /Free Thursday/ });
    expect(within(list).getByRole('button', { name: /6:00 PM, you're both free$/ })).toHaveClass('border-green');
    expect(within(list).getByRole('button', { name: /6:30 PM$/ })).not.toHaveClass('border-green');
  });

  it('records one hour opened when +N is clicked', () => {
    mocks.schedulable = response(['11', '12', '13', '14', '15'].map(id => free(id, `Person ${id}`, [thursdaySix])));
    render(<DebateCalendar />);

    fireEvent.click(screen.getByText('+2'));

    expect(screen.getByRole('dialog', { name: /Free Thursday/ })).toBeInTheDocument();
    const opened = mocks.capture.mock.calls.filter(([name]) => name === 'debate_calendar_hour_opened');
    expect(opened).toEqual([['debate_calendar_hour_opened', { people_count: 5 }]]);
  });

  it('does not carry an open hour over to another week', () => {
    // Free at the same hour both weeks, so the grid stays up and only the week under it changes.
    mocks.schedulable = response([free('11', 'Elena', [thursdaySix, [at(15, 18), at(15, 19)]])]);
    render(<DebateCalendar />);

    fireEvent.click(cell(/Thursday.*free: Elena/));
    expect(screen.getByRole('dialog', { name: /Free Thursday/ })).toBeInTheDocument();

    // A press that skips the pointer-down Radix closes popovers on, the way a programmatic change would.
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));

    expect(screen.queryByRole('dialog', { name: /Free Thursday/ })).not.toBeInTheDocument();
  });

  it("labels the rows' clicks as the calendar's, not the hub's", () => {
    render(<DebateCalendar />);

    fireEvent.click(cell(/Thursday.*free: Elena/));
    const list = screen.getByRole('dialog', { name: /Free Thursday/ });
    expect(within(list).getByRole('button', { name: /^Schedule a debate with Elena$/ })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Schedule debate'
    );
    expect(within(list).getAllByRole('button', { name: /^Schedule a debate with Elena .+/ })[0]).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Free time'
    );

    // The name opens the profile in the side panel, whose opener records it (GEO-3220).
    const name = within(list).getByRole('link', { name: 'Elena' });
    expect(name).toHaveAttribute('data-geo-analytics-label', 'Debate calendar Person profile');
    fireEvent.click(name);
    expect(mocks.openProfile).toHaveBeenCalledWith(summary('11', '').profile_space_id);
  });

  it("labels the set-availability prompt and a pending request's cancel as the calendar's", () => {
    mocks.activity = {
      challenge: {
        id: 'c1',
        status: 'pending',
        source_space_id: 'space-1',
        requester: { user_id: 'me', profile_space_id: 'profile-me', display_name: 'You', avatar_cid: null },
        recipient: summary('11', 'Elena'),
        rematch_session_id: null,
        created_at: new Date(NOW.getTime() - 60_000).toISOString(),
        expires_at: new Date(NOW.getTime() + 25 * 60_000).toISOString(),
      },
    };
    render(<DebateCalendar />);

    expect(screen.getByRole('button', { name: 'Set availability' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Set availability'
    );
    expect(screen.getByRole('button', { name: 'Cancel request' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Cancel request'
    );
  });

  it("draws the viewer's own requests and booked debates on the week", () => {
    mocks.scheduled = [
      {
        request_id: 'r1',
        status: 'pending',
        scheduled_start_at: at(9, 15),
        scheduled_end_at: at(9, 15, 30),
        invited_by_user_id: 'me',
        created_by_admin: false,
        proposed_by_user_id: 'me',
        reschedule_count: 0,
        room_id: null,
        participants: [
          { user_id: 'me', accepted: true },
          { user_id: '11', accepted: null },
        ],
        viewer_must_answer: false,
      },
    ];
    render(<DebateCalendar />);

    fireEvent.click(screen.getByRole('button', { name: /Requested · Elena/ }));
    expect(mocks.openHub).toHaveBeenCalledWith('requests');
  });

  it('says when nobody is free this week, and offers the next', () => {
    mocks.schedulable = response([]);
    render(<DebateCalendar />);

    expect(screen.getByText('Nobody has open times this week.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next week'));
    expect(mocks.capture).toHaveBeenCalledWith('debate_calendar_week_changed', { direction: 'next' });
  });

  it('tells filters hiding everyone apart from nobody being free', async () => {
    // Somebody picked who is not on the calendar this week.
    mocks.searchParams = new URLSearchParams({ people: PROFILE('99') });
    render(<DebateCalendar />);

    // The hub's states cross-fade, so the message lands once the grid has gone.
    expect(await screen.findByText('Nobody who matches those filters is free this week.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(await screen.findByRole('gridcell', { name: /free: Elena/ })).toBeInTheDocument();
    expect(mocks.searchParams.toString()).toBe('');
  });

  it('records Clear filters as one clear, not as a space change too', async () => {
    mocks.searchParams = new URLSearchParams({ people: PROFILE('99') });
    render(<DebateCalendar />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Clear filters' }))[0]);

    const filters = mocks.capture.mock.calls.filter(([name]) => name === 'debate_calendar_filter_changed');
    expect(filters).toEqual([['debate_calendar_filter_changed', { filter: 'clear' }]]);
  });

  it("records the viewer's own space pick", () => {
    render(<DebateCalendar />);

    fireEvent.click(screen.getByRole('button', { name: 'Pick a space' }));

    expect(mocks.capture).toHaveBeenCalledWith('debate_calendar_filter_changed', { filter: 'space' });
  });

  it('says nobody is free when the only free person is one the calendar never shows', () => {
    // On the People tab's exclusion list: hidden from every list, so it cannot be a filter's doing.
    mocks.schedulable = response([
      {
        ...free('11', 'Hidden', [thursdaySix]),
        user: { ...summary('11', 'Hidden'), profile_space_id: '879dc356d44f41ffbefae156d1db31c2' },
      },
    ]);
    render(<DebateCalendar />);

    expect(screen.getByText('Nobody has open times this week.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it("keeps the week up when who's online fails to load, and says so with a retry", () => {
    mocks.rosterError = new Error('down');
    render(<DebateCalendar />);

    expect(cell(/Thursday.*free: Elena/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn’t load who’s online/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.rosterRefetch).toHaveBeenCalled();
  });

  it("keeps the week up when the viewer's own debates fail to load, and says so with a retry", () => {
    mocks.scheduledError = new Error('down');
    render(<DebateCalendar />);

    expect(cell(/Thursday.*free: Elena/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn’t load your own debates/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.scheduledRefetch).toHaveBeenCalled();
  });

  it('offers a retry when the list fails to load', () => {
    mocks.schedulable = undefined;
    mocks.schedulableError = new Error('down');
    render(<DebateCalendar />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.schedulableRefetch).toHaveBeenCalled();
  });

  it('says when the list was capped, and points at the space filter', () => {
    mocks.schedulable = response([free('11', 'Elena', [thursdaySix])], { truncated: true });
    render(<DebateCalendar />);

    expect(screen.getByText(/Narrow by space to see others/)).toBeInTheDocument();
  });

  it('filters by space with pills on a desktop and the menu on a phone', () => {
    const { unmount } = render(<DebateCalendar />);
    expect(screen.getByRole('button', { name: 'Pick a space' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Space menu' })).toBeNull();
    unmount();

    mocks.isPhone = true;
    render(<DebateCalendar />);
    expect(screen.getByRole('button', { name: 'Space menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pick a space' })).toBeNull();
    // The people search box went with the People and Claims panel (GEO-3220): the pills open it.
    expect(screen.queryByRole('textbox', { name: 'Search people' })).toBeNull();
    expect(screen.getByRole('button', { name: 'People' })).toBeInTheDocument();
  });

  it('lists the week by day on a phone', () => {
    mocks.isPhone = true;
    render(<DebateCalendar />);

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const thursday = screen.getByRole('region', { name: /Thu/ });
    expect(within(thursday).getByText('Elena')).toBeInTheDocument();
  });

  it('reports an open from the hub when it carries where it came from', () => {
    mocks.searchParams = new URLSearchParams({ from: '/space/abc/debates' });
    render(<DebateCalendar />);

    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_calendar_opened',
      expect.objectContaining({ opened_from: 'hub' })
    );
  });

  it('heads the page with its title and no back link', () => {
    render(<DebateCalendar />);

    expect(screen.getByRole('heading', { level: 1, name: 'Debate calendar' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Back to Debates/ })).toBeNull();
  });
});

describe('DebateCalendar, admin view (GEO-2943)', () => {
  beforeEach(() => {
    mocks.summaries = [summary('11', 'Ana Ruiz'), summary('12', 'Raj Mehta'), summary('13', 'Mia Chen')];
    mocks.timezones = new Map([
      ['11', 'Europe/Madrid'],
      ['12', 'Asia/Kolkata'],
    ]);
  });

  it('offers no view switch to a viewer the admin list refused', () => {
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    render(<DebateCalendar />);

    expect(screen.queryByRole('radiogroup', { name: 'Calendar view' })).not.toBeInTheDocument();
    // A link to the admin view falls back to availability rather than an empty page.
    expect(cell(/Thursday.*free: Elena/)).toBeInTheDocument();
  });

  it('waits on the admin check before opening a link to the admin view', () => {
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    mocks.admin = { ...notAdmin(), isAdminPending: true, isPending: true };
    render(<DebateCalendar />);

    expect(screen.queryByRole('gridcell')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Calendar view' })).not.toBeInTheDocument();
  });

  it('gives an admin the switch, and puts the view in the URL', () => {
    mocks.admin = adminWith(ADMIN_MATCHES);
    mocks.searchParams = new URLSearchParams({ from: '/debates' });
    render(<DebateCalendar />);

    expect(screen.getByRole('radio', { name: 'Availability' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Admin' }));
    expect(mocks.routerReplace).toHaveBeenCalledWith('/matchmaking/calendar?from=%2Fdebates&view=debates', {
      scroll: false,
    });
  });

  it('labels every block by its state, and names who a waiting match is waiting on', () => {
    mocks.admin = adminWith(ADMIN_MATCHES);
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    render(<DebateCalendar />);

    expect(screen.getByRole('button', { name: /Ana vs Raj, Confirmed$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ana vs Raj, Waiting on Raj$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Raj vs Mia, No replies, outside availability$/ })).toBeInTheDocument();
  });

  it('opens a card with the sentence, each debater’s answer, and their own time', async () => {
    mocks.admin = adminWith(ADMIN_MATCHES);
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    render(<DebateCalendar />);

    fireEvent.click(screen.getByRole('button', { name: /Waiting on Raj$/ }));
    const card = await screen.findByRole('dialog');
    expect(card).toHaveTextContent('Ana sent the invite. Waiting on Raj to reply.');
    const rows = within(card).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/Ana Ruiz.*Sent the invite.*in Madrid.*Sent invite/);
    expect(rows[1]).toHaveTextContent(/Raj Mehta.*Was invited.*in Kolkata.*No reply yet/);
    // An image avatar fills its parent: the box around it is what keeps it 28px.
    expect(rows[0].querySelector('.h-7.w-7.overflow-hidden')).not.toBeNull();
  });

  it('counts each state in the legend, hides closed debates until asked, and filters by state', () => {
    mocks.admin = adminWith([
      ...ADMIN_MATCHES,
      scheduledMatch({
        request_id: 'gone',
        status: 'expired',
        scheduled_start_at: at(9, 9),
        scheduled_end_at: at(9, 9, 30),
      }),
    ]);
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    render(<DebateCalendar />);

    const closed = screen.getByRole('button', { name: /^Closed\s*1$/ });
    expect(closed).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /Expired$/ })).not.toBeInTheDocument();

    fireEvent.click(closed);
    expect(screen.getByRole('button', { name: /Ana vs Raj, Expired$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Confirmed\s*1$/ }));
    expect(screen.queryByRole('button', { name: /Confirmed$/ })).not.toBeInTheDocument();
  });

  it('draws a busy hour as compact one-line blocks, and lists the rest behind +N more', async () => {
    const atTen = (id: string, minute: number, participants: [string, string]) =>
      scheduledMatch({
        request_id: id,
        scheduled_start_at: at(8, 10, minute),
        scheduled_end_at: at(8, 10, minute + 30),
        invited_by_user_id: participants[0],
        participants: [
          { user_id: participants[0], accepted: true },
          { user_id: participants[1], accepted: null },
        ],
      });
    mocks.admin = adminWith([
      atTen('one', 0, ['11', '12']),
      atTen('two', 0, ['12', '13']),
      atTen('three', 30, ['13', '11']),
      atTen('four', 30, ['11', '13']),
    ]);
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    render(<DebateCalendar />);

    // Two compact blocks: the state is in the name and the hover title, not a line of its own.
    const compact = screen.getByRole('button', { name: /Ana vs Raj, Waiting on Raj$/ });
    expect(compact).toHaveAttribute('title', 'Ana vs Raj · Waiting on Raj');
    expect(compact).not.toHaveTextContent('Waiting on Raj');
    expect(screen.getByRole('button', { name: /Raj vs Mia, Waiting on Mia$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mia vs Ana/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^All 4 debates at Thursday/ }));
    const list = await screen.findByRole('dialog');
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);

    fireEvent.click(within(list).getByRole('button', { name: /Mia vs Ana, Waiting on Ana$/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Mia sent the invite. Waiting on Ana to reply.');
    fireEvent.click(screen.getByRole('button', { name: /All at 10/ }));
    expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(4);
  });

  it('keeps a lone debate in an hour as the full block', () => {
    mocks.admin = adminWith(ADMIN_MATCHES);
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    render(<DebateCalendar />);

    expect(screen.getByRole('button', { name: /Ana vs Raj, Waiting on Raj$/ })).toHaveTextContent('Waiting on Raj');
  });

  it('opens New match from the week bar', () => {
    mocks.admin = adminWith(ADMIN_MATCHES);
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    render(<DebateCalendar />);

    fireEvent.click(screen.getByRole('button', { name: 'New match' }));
    expect(screen.getByRole('dialog', { name: 'New match' })).toBeInTheDocument();
  });

  it('lists the admin view by day on a phone, each card inline', () => {
    mocks.admin = adminWith(ADMIN_MATCHES);
    mocks.searchParams = new URLSearchParams({ view: 'debates' });
    mocks.isPhone = true;
    render(<DebateCalendar />);

    expect(screen.getByRole('region', { name: 'Thu 8' })).toHaveTextContent(/Waiting on Raj/);
    expect(screen.getByRole('region', { name: 'Fri 9' })).toHaveTextContent(/Booked outside at least one debater/);
  });
});

describe('DebateCalendar, People and Claims panel (GEO-3220)', () => {
  const VIEWER = '019fedae-72b6-7ab2-927a-df044d57c590';
  const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const CLAIM_ONE = 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1';
  const CLAIM_TWO = 'c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2';
  const position = (profileSpaceId: string, claimId: string, agrees: boolean): ParticipantPosition => ({
    profileSpaceId,
    claimId,
    spaceId: SPACE,
    responseKind: 'stance',
    position: agrees,
  });

  beforeEach(() => {
    // The topic menu measures its list; jsdom has no layout to measure.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    mocks.personalSpaceId = VIEWER;
    // Elena and Marco are free Thursday at six, Ana on Friday.
    mocks.schedulable = response([
      free('11', 'Elena', [thursdaySix]),
      free('12', 'Marco', [thursdaySix]),
      free('13', 'Ana', [[at(9, 12), at(9, 13)]]),
    ]);
    // On claim one the viewer agrees, Elena disagrees and Marco agrees. Only Ana answered claim two.
    mocks.positions = [
      position(VIEWER, CLAIM_ONE, true),
      position(summary('11', '').profile_space_id, CLAIM_ONE, false),
      position(summary('12', '').profile_space_id, CLAIM_ONE, true),
      position(summary('13', '').profile_space_id, CLAIM_TWO, true),
    ];
    mocks.claimNames = new Map([
      [CLAIM_ONE, 'Phones should be banned in schools'],
      [CLAIM_TWO, 'Homework does more harm than good'],
    ]);
    mocks.matchesByProfile = new Map([[PROFILE('11'), [match(1)]]]);
  });

  const thursday = () => cell(/Thursday.*free:/);
  const panel = () => screen.getByRole('complementary', { name: 'Narrow the calendar' });
  const filterEvents = () =>
    mocks.capture.mock.calls.filter(([name]) => name === 'debate_calendar_filter_changed').map(([, props]) => props);

  it("looks as it did with nothing picked, and reads everyone's positions only once the panel opens", () => {
    render(<DebateCalendar />);

    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Narrow the calendar' })).not.toBeInTheDocument();
    expect(mocks.positionReads.every(participants => participants.length === 0)).toBe(true);
    expect(thursday()).toHaveAccessibleName(/Elena/);
    expect(thursday()).toHaveAccessibleName(/Marco/);

    fireEvent.click(screen.getByRole('button', { name: 'People' }));

    expect(panel()).toBeInTheDocument();
    expect(mocks.positionReads.at(-1)).toHaveLength(4);
  });

  it('counts what is picked on each pill, and steps the pills aside while the panel is open', () => {
    render(<DebateCalendar />);

    expect(screen.getByRole('button', { name: 'People' })).toHaveTextContent(/^People$/);
    expect(screen.getByRole('button', { name: 'Claims' })).toHaveTextContent(/^Claims$/);

    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));
    // The panel's tabs are the switch now; the pills would only repeat them.
    expect(screen.queryByRole('button', { name: 'Claims' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'People' })).not.toBeInTheDocument();

    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Phones should be banned in schools' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close panel' }));

    expect(screen.getByRole('button', { name: 'Claims, 1 picked' })).toHaveTextContent(/^Claims · 1$/);
    expect(screen.getByRole('button', { name: 'People' })).toHaveTextContent(/^People$/);
  });

  it('moves to next week when the person picked is free only then, and offers the way back', async () => {
    mocks.schedulable = response([
      free('11', 'Elena', [thursdaySix]),
      // Lena's only time is next Thursday.
      free('14', 'Lena', [[at(15, 18), at(15, 19)]]),
    ]);
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));

    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Lena' }));

    expect(await screen.findByRole('gridcell', { name: /Thursday.*free: Lena/ })).toBeInTheDocument();
    // Next week: the only way back is enabled.
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeEnabled();

    // Back on this week by hand, it stays put, and says where Lena is.
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(
      await screen.findByText('Nobody who matches those filters is free this week, but 1 is next week.')
    ).toBeInTheDocument();
    expect(screen.getByText(/Lena is free next week, not this week\./)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Show next week' })[0]);
    expect(await screen.findByRole('gridcell', { name: /Thursday.*free: Lena/ })).toBeInTheDocument();
  });

  it("puts the pills on the week's row and the legend under the grid, on a desktop", () => {
    render(<DebateCalendar />);

    const nextWeek = screen.getByRole('button', { name: 'Next week' });
    const pills = screen.getByRole('button', { name: 'People' });
    const grid = screen.getByRole('grid');
    const legend = screen.getByRole('list', { name: 'Legend' });
    // Document order: the week's controls, then the pills beside them, then the grid, then the legend.
    expect(nextWeek.compareDocumentPosition(pills) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pills.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("votes from a claim's side pills", () => {
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));

    const claims = within(panel()).getByRole('list', { name: 'Claims' });
    // The viewer agrees on claim one, so that pill says so and is pressed.
    expect(within(claims).getByRole('button', { name: 'Agree: Phones should be banned in schools' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const disagree = within(claims).getByRole('button', { name: 'Disagree: Homework does more harm than good' });
    expect(disagree).toHaveAttribute('data-geo-analytics-label', 'Debate calendar Disagree');

    fireEvent.click(disagree);

    expect(mocks.respond).toHaveBeenCalledWith(CLAIM_TWO, false);
    expect(mocks.searchParams.get('claims')).toBeNull();
  });

  it('narrows the week to the people picked, and keeps them in the URL', () => {
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));

    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Elena' }));

    expect(mocks.searchParams.get('people')).toBe(PROFILE('11'));
    expect(thursday()).toHaveAccessibleName(/Elena/);
    expect(thursday()).not.toHaveAccessibleName(/Marco/);
    expect(screen.getByText(/Showing the person you picked\./)).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close panel' }));
    expect(screen.getByRole('button', { name: 'People, 1 picked' })).toBeInTheDocument();
    expect(filterEvents()).toEqual([{ filter: 'person' }]);
  });

  it('shows everyone holding a picked claim, and with Matches only, just those on the other side', () => {
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));

    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Phones should be banned in schools' }));

    expect(mocks.searchParams.get('claims')).toBe(`${SPACE}:${CLAIM_ONE}`);
    expect(thursday()).toHaveAccessibleName(/Elena/);
    expect(thursday()).toHaveAccessibleName(/Marco/);
    expect(screen.queryByRole('gridcell', { name: /Friday.*Ana/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 2 people with a position on the claim you picked\./)).toBeInTheDocument();

    fireEvent.click(within(panel()).getByRole('switch', { name: 'Matches only' }));

    expect(mocks.searchParams.get('matches')).toBe('1');
    expect(thursday()).toHaveAccessibleName(/Elena/);
    expect(thursday()).not.toHaveAccessibleName(/Marco/);
    expect(screen.getByText(/Showing 1 person who disagrees with you on the claim you picked\./)).toBeInTheDocument();
    expect(filterEvents()).toEqual([{ filter: 'claim' }, { filter: 'matches_only' }]);
  });

  it('shows a picked person with a picked claim only if they hold it, and says why they are missing', async () => {
    mocks.searchParams = new URLSearchParams({ people: PROFILE('13'), claims: `${SPACE}:${CLAIM_ONE}` });
    render(<DebateCalendar />);

    expect(await screen.findByText('Nobody who matches those filters is free this week.')).toBeInTheDocument();
    expect(
      screen.getByText(/Ana doesn’t match your other filters\.|Ana doesn't match your other filters\./)
    ).toBeInTheDocument();

    // Still in its list, ticked, so it can be unticked.
    fireEvent.click(screen.getByRole('button', { name: 'People, 1 picked' }));
    const ana = within(panel()).getByRole('checkbox', { name: /Ana \(hidden by your other filters\)/ });
    expect(ana).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(ana);
    expect(mocks.searchParams.get('people')).toBeNull();
  });

  it('counts who disagrees on each claim, and books one of their times from the count', async () => {
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));

    fireEvent.click(
      within(panel()).getByRole('button', {
        name: '1 person disagrees with you on Phones should be banned in schools',
      })
    );
    const popover = await screen.findByLabelText('People who disagree with you on Phones should be banned in schools');
    expect(within(popover).getByText('Elena')).toBeInTheDocument();
    expect(within(popover).queryByText('Marco')).not.toBeInTheDocument();

    // By label: jsdom has no layout, so Radix marks the popover detached and hides it from roles.
    fireEvent.click(within(popover).getByLabelText('Schedule a debate with Elena Tomorrow 6:00 PM'));

    expect(screen.getByRole('dialog', { name: 'Book Elena' })).toBeInTheDocument();
    expect(mocks.bookingProps).toMatchObject({
      entry: 'calendar_claim_match',
      initialSelectedStart: new Date(at(8, 18)).toISOString(),
    });
  });

  it("draws People rows as the hub's People tab does, and opens a name in the side panel", () => {
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));

    const people = within(panel()).getByRole('list', { name: 'People' });
    // The People tab's own row: its booking pill, beside the checkbox.
    expect(within(people).getByRole('button', { name: 'Schedule a debate with Elena' })).toBeInTheDocument();
    fireEvent.click(within(people).getByRole('link', { name: 'Elena' }));

    expect(mocks.openProfile).toHaveBeenCalledWith(summary('11', '').profile_space_id);
    expect(mocks.searchParams.get('people')).toBeNull();
    // Beside the docked panel on a desktop, so the panel stays.
    expect(panel()).toBeInTheDocument();
  });

  it('narrows the Claims list by topic, and People to those holding a claim in it', async () => {
    mocks.claimTopics = new Map([
      [CLAIM_ONE, [{ id: 'dddddddddddddddddddddddddddddd01', name: 'Education' }]],
      [CLAIM_TWO, [{ id: 'dddddddddddddddddddddddddddddd02', name: 'Health' }]],
    ]);
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));

    fireEvent.click(within(panel()).getByRole('button', { name: 'Any topic' }));
    fireEvent.click((await within(panel()).findByText('Health')).closest('button')!);

    const claims = within(panel()).getByRole('list', { name: 'Claims' });
    expect(within(claims).getByText('Homework does more harm than good')).toBeInTheDocument();
    expect(within(claims).queryByText('Phones should be banned in schools')).not.toBeInTheDocument();
    // A list filter, not a pick: the week is untouched.
    expect(thursday()).toHaveAccessibleName(/Marco/);

    fireEvent.click(within(panel()).getByRole('tab', { name: /People/ }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Any topic' }));
    fireEvent.click((await within(panel()).findByText('Education')).closest('button')!);

    const people = within(panel()).getByRole('list', { name: 'People' });
    expect(within(people).getByRole('checkbox', { name: 'Elena' })).toBeInTheDocument();
    expect(within(people).getByRole('checkbox', { name: 'Marco' })).toBeInTheDocument();
    expect(within(people).queryByRole('checkbox', { name: 'Ana' })).not.toBeInTheDocument();
  });

  it('keeps the week up while the roster changes under a picked claim', async () => {
    mocks.searchParams = new URLSearchParams({ claims: `${SPACE}:${CLAIM_ONE}` });
    const { rerender } = render(<DebateCalendar />);
    expect(thursday()).toHaveAccessibleName(/Elena/);

    // Someone comes online: the positions read moves to a new key and holds the last answer while
    // it refetches. That held answer is drawn, not a skeleton.
    mocks.roster = [{ ...summary('15', 'Zed'), online: true } as DebatePerson];
    mocks.positionsPlaceholder = true;
    rerender(<DebateCalendar />);
    // Past the states' cross-fade, which only mounts a skeleton once the week has faded out.
    await act(() => new Promise(resolve => setTimeout(resolve, 600)));

    expect(screen.queryByLabelText('Loading who is free')).not.toBeInTheDocument();
    expect(thursday()).toHaveAccessibleName(/Elena/);
  });

  it('narrows to who holds a claim for a viewer with no personal space yet, rather than waiting forever', async () => {
    mocks.personalSpaceId = null;
    mocks.viewerHasPositions = false;
    mocks.searchParams = new URLSearchParams({ claims: `${SPACE}:${CLAIM_ONE}` });
    render(<DebateCalendar />);

    // Elena and Marco hold claim one; Ana does not.
    expect(await screen.findByRole('gridcell', { name: /Thursday.*free:/ })).toHaveAccessibleName(/Elena/);
    expect(thursday()).toHaveAccessibleName(/Marco/);
    expect(screen.queryByRole('gridcell', { name: /Friday.*Ana/ })).not.toBeInTheDocument();
  });

  it("leaves a claim pick unjudged, and says so, when everyone's positions fail to load", () => {
    mocks.positionsError = new Error('graph down');
    mocks.searchParams = new URLSearchParams({ claims: `${SPACE}:${CLAIM_ONE}` });
    render(<DebateCalendar />);

    // Not an empty week: a failed read is not an answer of "nobody holds it".
    expect(screen.queryByText(/Nobody who matches those filters/)).not.toBeInTheDocument();
    expect(cell(/Friday.*free: Ana/)).toBeInTheDocument();
    expect(
      screen.getByText(/Couldn’t load everyone’s positions, so claims can’t narrow the week yet\./)
    ).toBeInTheDocument();
    // The pick itself survives, ticked, for when the read comes back.
    expect(screen.getByRole('button', { name: 'Claims, 1 picked' })).toBeInTheDocument();
  });

  it('leaves Matches only unjudged, and says so, when your matches fail to load', () => {
    mocks.matchesUnavailable = true;
    mocks.searchParams = new URLSearchParams({ matches: '1' });
    render(<DebateCalendar />);

    expect(thursday()).toHaveAccessibleName(/Marco/);
    expect(
      screen.getByText(/Couldn’t load your matches, so Matches only can’t narrow the week yet\./)
    ).toBeInTheDocument();
  });

  it('says a claim is loading rather than calling it untitled', () => {
    mocks.claimEntitiesLoading = true;
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));

    expect(within(panel()).getAllByText('Loading claim…').length).toBeGreaterThan(0);
    expect(within(panel()).queryByText('Untitled claim')).not.toBeInTheDocument();
  });

  it('reads profiles lazily, on the first click rather than for every row it mounts', () => {
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));

    expect(mocks.profileOpenOptions.length).toBeGreaterThan(0);
    expect(mocks.profileOpenOptions.every(options => (options as { lazy?: boolean })?.lazy === true)).toBe(true);
  });

  it('keeps every pick made faster than the URL can update', () => {
    mocks.routerDeferred = true;
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));

    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Elena' }));
    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Marco' }));
    // Both ticked before either write has landed.
    expect(within(panel()).getByRole('checkbox', { name: 'Elena' })).toHaveAttribute('aria-checked', 'true');
    expect(within(panel()).getByRole('checkbox', { name: 'Marco' })).toHaveAttribute('aria-checked', 'true');

    // The writes land one at a time. The first is an echo of a write already superseded: adopting
    // it would untick Marco.
    const [first, second] = mocks.routerQueue.splice(0);
    act(() => setUrl(first));
    expect(within(panel()).getByRole('checkbox', { name: 'Marco' })).toHaveAttribute('aria-checked', 'true');
    act(() => setUrl(second));
    expect(mocks.searchParams.get('people')).toBe(`${PROFILE('11')},${PROFILE('12')}`);
    expect(within(panel()).getByRole('checkbox', { name: 'Elena' })).toHaveAttribute('aria-checked', 'true');
    expect(within(panel()).getByRole('checkbox', { name: 'Marco' })).toHaveAttribute('aria-checked', 'true');
  });

  it('follows the URL when it changes from outside, as on Back', () => {
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Elena' }));

    act(() => setUrl(`/matchmaking/calendar?people=${PROFILE('12')}`));

    expect(within(panel()).getByRole('checkbox', { name: 'Elena' })).toHaveAttribute('aria-checked', 'false');
    expect(within(panel()).getByRole('checkbox', { name: 'Marco' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps People loading, not empty, while a picked claim waits on everyone’s positions', () => {
    mocks.positionsLoading = true;
    mocks.searchParams = new URLSearchParams({ claims: `${SPACE}:${CLAIM_ONE}` });
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));

    expect(within(panel()).getByLabelText('Loading')).toBeInTheDocument();
    expect(within(panel()).queryByText(/Nobody on the calendar/)).not.toBeInTheDocument();
  });

  it('lists everyone, and says why on Claims, when everyone’s positions fail to load', () => {
    mocks.positionsError = new Error('graph down');
    mocks.searchParams = new URLSearchParams({ claims: `${SPACE}:${CLAIM_ONE}` });
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));

    // The People list judges picks as the week does: the failed claim pick hides nobody.
    expect(within(panel()).getByRole('checkbox', { name: 'Ana' })).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole('tab', { name: /Claims/ }));
    expect(within(panel()).getByText(/Couldn’t load everyone’s positions\. Trying again/)).toBeInTheDocument();
  });

  it('does not count a phone draft as 0 while Matches only waits on your matches', () => {
    mocks.isPhone = true;
    mocks.matchesLoading = true;
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    const sheet = screen.getByRole('dialog', { name: 'Narrow the calendar' });

    fireEvent.click(within(sheet).getByRole('switch', { name: 'Matches only' }));

    expect(within(sheet).getByRole('button', { name: 'Show people' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Show 0 people/ })).not.toBeInTheDocument();
  });

  it("leaves a claim pick unjudged when the read failed, even with the viewer's own vote in flight", () => {
    mocks.positionsError = new Error('graph down');
    // The overlay is all there is: the viewer's pending response, not anything the graph answered.
    mocks.positionsOverlay = [position(VIEWER, CLAIM_ONE, true)];
    mocks.searchParams = new URLSearchParams({ claims: `${SPACE}:${CLAIM_ONE}` });
    render(<DebateCalendar />);

    expect(cell(/Friday.*free: Ana/)).toBeInTheDocument();
    expect(
      screen.getByText(/Couldn’t load everyone’s positions, so claims can’t narrow the week yet\./)
    ).toBeInTheDocument();
  });

  it('steps the phone sheet aside once a name has opened the profile beside it', () => {
    mocks.isPhone = true;
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    const sheet = screen.getByRole('dialog', { name: 'Narrow the calendar' });

    fireEvent.click(within(sheet).getByRole('link', { name: 'Elena' }));

    expect(mocks.openProfile).toHaveBeenCalledWith(summary('11', '').profile_space_id);
    expect(screen.queryByRole('dialog', { name: 'Narrow the calendar' })).not.toBeInTheDocument();
  });

  it('keeps a picked person who drops off the calendar, named, with a row to untick', () => {
    const { rerender } = render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Ana' }));

    // Ana goes offline with her last open time gone: off the roster entirely.
    mocks.schedulable = response([free('11', 'Elena', [thursdaySix]), free('12', 'Marco', [thursdaySix])]);
    rerender(<DebateCalendar />);

    const ana = within(panel()).getByRole('checkbox', { name: 'Ana (hidden by your other filters)' });
    expect(ana).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Ana isn't on the calendar in the next two weeks\./)).toBeInTheDocument();
    fireEvent.click(ana);
    expect(mocks.searchParams.get('people')).toBeNull();
  });

  it('names a picked person the calendar has never listed from their personal space', () => {
    const stranger = PROFILE('77');
    mocks.spaceLabels = new Map([[stranger, { name: 'Zed', image: null }]]);
    mocks.searchParams = new URLSearchParams({ people: stranger });
    render(<DebateCalendar />);

    expect(mocks.labelRequests.at(-1)).toContain(stranger);
    expect(screen.getByText(/Zed isn't on the calendar in the next two weeks\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'People, 1 picked' }));
    expect(within(panel()).getByRole('checkbox', { name: 'Zed (hidden by your other filters)' })).toBeInTheDocument();
  });

  it('keeps picks from the URL on a reload', () => {
    mocks.searchParams = new URLSearchParams({ claims: `${SPACE}:${CLAIM_ONE}`, matches: '1' });
    render(<DebateCalendar />);

    expect(thursday()).toHaveAccessibleName(/Elena/);
    expect(thursday()).not.toHaveAccessibleName(/Marco/);
    fireEvent.click(screen.getByRole('button', { name: 'Claims, 1 picked' }));
    expect(within(panel()).getByRole('checkbox', { name: 'Phones should be banned in schools' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(within(panel()).getByRole('switch', { name: 'Matches only' })).toHaveAttribute('aria-checked', 'true');
  });

  it('turns Matches only off, with a hint, for a viewer who holds no position', () => {
    mocks.viewerHasPositions = false;
    mocks.searchParams = new URLSearchParams({ matches: '1' });
    render(<DebateCalendar />);

    // The URL asked for it, but there is nothing to match on: the week is not narrowed.
    expect(thursday()).toHaveAccessibleName(/Marco/);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    const toggle = within(panel()).getByRole('switch', { name: 'Matches only' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(within(panel()).getByText('Take a position on a claim to see matches')).toBeInTheDocument();
  });

  it('labels every panel control as the calendar’s, apart from the hub’s', () => {
    render(<DebateCalendar />);
    expect(screen.getByRole('button', { name: 'Claims' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Claims filter'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));

    const labels = [
      within(panel()).getByRole('tab', { name: /People/ }),
      within(panel()).getByRole('button', { name: 'Close panel' }),
      within(panel()).getByRole('switch', { name: 'Matches only' }),
      within(panel()).getByRole('checkbox', { name: 'Phones should be banned in schools' }),
    ].map(control => control.getAttribute('data-geo-analytics-label'));
    expect(labels).toEqual([
      'Debate calendar Panel People tab',
      'Debate calendar Close panel',
      'Debate calendar Matches only',
      'Debate calendar Claim pick',
    ]);
  });

  it('opens as a bottom sheet on a phone, and applies picks only when confirmed', () => {
    mocks.isPhone = true;
    render(<DebateCalendar />);
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));

    const sheet = screen.getByRole('dialog', { name: 'Narrow the calendar' });
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Phones should be banned in schools' }));
    expect(mocks.searchParams.get('claims')).toBeNull();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Show 2 people' }));

    expect(mocks.searchParams.get('claims')).toBe(`${SPACE}:${CLAIM_ONE}`);
    expect(screen.queryByRole('dialog', { name: 'Narrow the calendar' })).not.toBeInTheDocument();
  });
});
