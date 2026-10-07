import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import type { DebatePerson, SchedulablePeopleResponse, ScheduledDebateRequest } from '../api';

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
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, personProfileOpened: mocks.personProfileOpened }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => '/matchmaking/calendar',
  useRouter: () => ({ replace: mocks.routerReplace }),
}));
vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => mocks.isPhone }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/hooks/use-space-labels', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/use-space-labels')>()),
  useSpaceLabels: () => ({ labelsById: new Map() }),
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    href,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <a
      href={href}
      className={className}
      onClick={event => {
        event.preventDefault();
        onClick?.();
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
  SpaceTopicFilters: ({ leading }: { leading?: React.ReactNode }) => (
    <div>
      {leading}
      <button type="button">Space menu</button>
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
  });
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

    fireEvent.click(within(list).getByRole('link', { name: 'Elena' }));
    expect(mocks.personProfileOpened).toHaveBeenCalledWith(expect.any(String), null, {
      interaction_surface: 'debate_calendar',
    });
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
    render(<DebateCalendar />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search people' }), { target: { value: 'zz' } });
    // The hub's states cross-fade, so the message lands once the grid has gone.
    expect(await screen.findByText('Nobody who matches those filters is free this week.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('gridcell', { name: /free: Elena/ })).toBeInTheDocument();
  });

  it('records Clear filters as one clear, not as a space change too', async () => {
    render(<DebateCalendar />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search people' }), { target: { value: 'zz' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));

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

  it('records a search again when the same words are typed after clearing it', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    render(<DebateCalendar />);
    const search = screen.getByRole('textbox', { name: 'Search people' });
    const searches = () =>
      mocks.capture.mock.calls.filter(
        ([name, props]) => name === 'debate_calendar_filter_changed' && props.filter === 'search'
      );

    fireEvent.change(search, { target: { value: 'el' } });
    act(() => vi.advanceTimersByTime(1_000));
    fireEvent.change(search, { target: { value: '' } });
    act(() => vi.advanceTimersByTime(1_000));
    fireEvent.change(search, { target: { value: 'el' } });
    act(() => vi.advanceTimersByTime(1_000));

    expect(searches()).toHaveLength(2);
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
    expect(screen.getByRole('textbox', { name: 'Search people' })).toBeInTheDocument();
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
