import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import type { DebatePerson, SchedulablePeopleResponse, ScheduledDebateRequest } from '../api';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  promptSignIn: vi.fn(),
  capture: vi.fn(),
  isPhone: false,
  searchParams: new URLSearchParams(),
  scheduleIsSet: false,
  blocks: [] as unknown[],
  scheduleZone: 'UTC',
  roster: [] as DebatePerson[],
  schedulable: undefined as SchedulablePeopleResponse | undefined,
  schedulableLoading: false,
  schedulableError: null as Error | null,
  schedulableRefetch: vi.fn(),
  schedulableOptions: [] as unknown[],
  scheduled: [] as ScheduledDebateRequest[],
  matchesByProfile: new Map<string, unknown[]>(),
  bookingProps: null as Record<string, unknown> | null,
  openHub: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, personProfileOpened: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.searchParams, usePathname: () => '/' }));
vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => mocks.isPhone }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/hooks/use-space-labels', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/use-space-labels')>()),
  useSpaceLabels: () => ({ labelsById: new Map() }),
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
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
  useDebateActivity: () => ({ data: undefined }),
  useCreateDebateChallenge: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('./hooks', () => ({
  useDebatePeople: () => ({ data: { people: mocks.roster }, isLoading: false }),
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
vi.mock('../rooms/scheduling-hooks', () => ({ useScheduledDebates: () => ({ data: { requests: mocks.scheduled } }) }));
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
  SpaceTopicFilters: ({ leading, trailing }: { leading?: React.ReactNode; trailing?: React.ReactNode }) => (
    <div>
      {leading}
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

const { FindATime } = await import('./find-a-time');

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
    schedulable: response([free('11', 'Elena', [thursdaySix])]),
    schedulableLoading: false,
    schedulableError: null,
    schedulableOptions: [],
    scheduled: [],
    matchesByProfile: new Map(),
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

describe('FindATime', () => {
  it('asks a signed-out viewer to sign in instead of drawing an empty week', () => {
    mocks.authenticated = false;
    render(<FindATime />);

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.promptSignIn).toHaveBeenCalled();
  });

  it("shows everyone's free time to a viewer with no schedule, and nudges without blocking", () => {
    render(<FindATime />);

    expect(mocks.schedulableOptions[0]).toEqual({ calendar: true, spaces: [] });
    expect(cell(/Thursday.*free: Elena/)).toBeInTheDocument();
    expect(screen.getByText(/Set your availability so others can book you too/)).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith('find_a_time_opened', {
      opened_from: 'direct',
      viewer_has_schedule: false,
    });
  });

  it('books the clicked time through the existing modal, with the time picked', () => {
    render(<FindATime />);

    fireEvent.click(within(cell(/Thursday.*free: Elena/)).getByRole('button', { name: /Elena/ }));

    expect(screen.getByRole('dialog', { name: 'Book Elena' })).toBeInTheDocument();
    expect(mocks.bookingProps).toMatchObject({
      userId: '11',
      initialSelectedStart: at(8, 18),
      entry: 'find_a_time_slot',
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
    render(<FindATime />);

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
    expect(mocks.capture).toHaveBeenCalledWith('find_a_time_hour_opened', { people_count: 5 });
  });

  it('opens the hour from anywhere in the cell, including beside the faces', () => {
    render(<FindATime />);

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
    render(<FindATime />);

    fireEvent.click(cell(/Thursday.*free: Elena/));
    const list = screen.getByRole('dialog', { name: /Free Thursday/ });
    expect(within(list).getByRole('button', { name: /6:00 PM, you're both free$/ })).toHaveClass('border-green');
    expect(within(list).getByRole('button', { name: /6:30 PM$/ })).not.toHaveClass('border-green');
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
    render(<FindATime />);

    fireEvent.click(screen.getByRole('button', { name: /Requested · Elena/ }));
    expect(mocks.openHub).toHaveBeenCalledWith('requests');
  });

  it('says when nobody is free this week, and offers the next', () => {
    mocks.schedulable = response([]);
    render(<FindATime />);

    expect(screen.getByText('Nobody has open times this week.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next week'));
    expect(mocks.capture).toHaveBeenCalledWith('find_a_time_week_changed', { direction: 'next' });
  });

  it('tells filters hiding everyone apart from nobody being free', async () => {
    render(<FindATime />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search people' }), { target: { value: 'zz' } });
    // The hub's states cross-fade, so the message lands once the grid has gone.
    expect(await screen.findByText('Nobody who matches those filters is free this week.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('gridcell', { name: /free: Elena/ })).toBeInTheDocument();
  });

  it('offers a retry when the list fails to load', () => {
    mocks.schedulable = undefined;
    mocks.schedulableError = new Error('down');
    render(<FindATime />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.schedulableRefetch).toHaveBeenCalled();
  });

  it('says when the list was capped, and points at the space filter', () => {
    mocks.schedulable = response([free('11', 'Elena', [thursdaySix])], { truncated: true });
    render(<FindATime />);

    expect(screen.getByText(/Narrow by space to see others/)).toBeInTheDocument();
  });

  it('lists the week by day on a phone', () => {
    mocks.isPhone = true;
    render(<FindATime />);

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const thursday = screen.getByRole('region', { name: /Thu/ });
    expect(within(thursday).getByText('Elena')).toBeInTheDocument();
  });

  it('goes back to the page it came from, with the debates panel open', () => {
    mocks.searchParams = new URLSearchParams({ from: '/space/abc/debates' });
    render(<FindATime />);

    expect(screen.getByRole('link', { name: /Back to Debates/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/space\/abc\/debates\?modal=debates/)
    );
    expect(mocks.capture).toHaveBeenCalledWith('find_a_time_opened', expect.objectContaining({ opened_from: 'hub' }));
  });

  it('never goes back off-site', () => {
    mocks.searchParams = new URLSearchParams({ from: '//evil.example' });
    render(<FindATime />);

    expect(screen.getByRole('link', { name: /Back to Debates/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/explore\?/)
    );
  });
});
