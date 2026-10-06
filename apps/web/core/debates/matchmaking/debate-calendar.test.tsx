import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, personProfileOpened: mocks.personProfileOpened }));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.searchParams, usePathname: () => '/' }));
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
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'me' }));
vi.mock('./use-geo-chat-user-summaries', () => ({ useGeoChatUserSummaries: () => [] }));
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
vi.mock('./hub-header-controls', () => ({ HubHeaderControls: () => null }));
vi.mock('./claims-tab', () => ({
  SpaceTopicFilters: ({
    leading,
    trailing,
    onSpaceToggle,
  }: {
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    onSpaceToggle: (spaceId: string) => void;
  }) => (
    <div>
      {leading}
      <button type="button" onClick={() => onSpaceToggle('space-1')}>
        Pick a space
      </button>
      {trailing}
    </div>
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
  });
  mocks.capture.mockReset();
  mocks.promptSignIn.mockReset();
  mocks.openHub.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const cell = (name: RegExp) => screen.getByRole('gridcell', { name });

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

  it('books the clicked time through the existing modal, with the time picked', () => {
    render(<DebateCalendar />);

    fireEvent.click(within(cell(/Thursday.*free: Elena/)).getByRole('button', { name: /Elena/ }));

    expect(screen.getByRole('dialog', { name: 'Book Elena' })).toBeInTheDocument();
    expect(mocks.bookingProps).toMatchObject({
      userId: '11',
      initialSelectedStart: at(8, 18),
      entry: 'calendar_slot',
    });
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
    expect(within(crowded).getByRole('button', { name: /Everyone free then: 5 people/ })).toHaveTextContent('+2');

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

    const face = within(cell(/Thursday.*free: Elena/)).getByRole('button', { name: /Elena/ });
    fireEvent.pointerEnter(face, { pointerType: 'mouse' });

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith('debate_calendar_person_viewed', { peer_user_id: '11' })
    );
    expect(mocks.capture.mock.calls.filter(([name]) => name === 'debate_calendar_person_viewed')).toHaveLength(1);
  });

  it('opens the hour from anywhere in the cell, including beside the faces', () => {
    render(<DebateCalendar />);

    const thursday = cell(/Thursday.*free: Elena/);
    // The strip the faces sit in, not the cell itself: where most clicks land.
    fireEvent.click(within(thursday).getByRole('button', { name: /Elena/ }).parentElement!);
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

  it('records one hour opened when +N opens it', () => {
    mocks.schedulable = response(['11', '12', '13', '14', '15'].map(id => free(id, `Person ${id}`, [thursdaySix])));
    render(<DebateCalendar />);

    fireEvent.click(screen.getByRole('button', { name: /Everyone free then: 5 people/ }));

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

  it('lists the week by day on a phone', () => {
    mocks.isPhone = true;
    render(<DebateCalendar />);

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const thursday = screen.getByRole('region', { name: /Thu/ });
    expect(within(thursday).getByText('Elena')).toBeInTheDocument();
  });

  it('goes back to the page it came from, with the debates panel open', () => {
    mocks.searchParams = new URLSearchParams({ from: '/space/abc/debates' });
    render(<DebateCalendar />);

    expect(screen.getByRole('link', { name: /Back to Debates/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/space\/abc\/debates\?modal=debates/)
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_calendar_opened',
      expect.objectContaining({ opened_from: 'hub' })
    );
  });

  it("restores the page's own query and fragment on the way back", () => {
    mocks.searchParams = new URLSearchParams({ from: '/space/abc?proposal=1#votes' });
    render(<DebateCalendar />);

    expect(screen.getByRole('link', { name: /Back to Debates/ })).toHaveAttribute(
      'href',
      '/space/abc?proposal=1&modal=debates#votes'
    );
  });

  it('never goes back off-site', () => {
    mocks.searchParams = new URLSearchParams({ from: '//evil.example' });
    render(<DebateCalendar />);

    expect(screen.getByRole('link', { name: /Back to Debates/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/explore\?/)
    );
  });
});
