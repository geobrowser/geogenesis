import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';

const mocks = vi.hoisted(() => ({
  isSet: false,
  loaded: true,
  authenticated: true,
  available: false,
  blocks: [] as AvailabilityBlock[],
  timezone: undefined as string | undefined,
  browserZone: 'Europe/Vilnius',
  saveSurfaces: [] as string[],
  updateAvailability: vi.fn(),
  canHost: false,
}));

// The schedule editor reads the viewer's calendars; this suite isn't about them, so geo-chat has them off.
vi.mock('~/core/debates/calendar-hooks', () => ({
  useCalendarConnections: () => ({ disabled: true }),
  useCalendarBusy: () => ({ intervals: undefined }),
}));

// The pill reads `../hooks`; the schedule editor it opens reads the same module by its alias.
vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({
    data: mocks.loaded ? { is_set: mocks.isSet } : undefined,
    blocks: mocks.loaded ? mocks.blocks : undefined,
    isSet: mocks.isSet,
    timezone: mocks.timezone,
    isError: false,
    refetch: vi.fn(),
  }),
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated, ready: true, accountKey: 'did:privy:1' }),
  useDebateActivity: () => ({ data: { available_to_debate: mocks.available } }),
  useUpdateDebateAvailability: () => ({ mutate: mocks.updateAvailability, isPending: false }),
  // The editor this opens saves through here.
  useSaveDebateSchedule: ({ surface }: { surface: string }) => {
    mocks.saveSurfaces.push(surface);
    return { mutate: vi.fn(), isPending: false };
  },
}));
// The copy-link row reads the personal space through the wallet stack; it has its own tests.
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));

// Hosting is a feature flag; the dialog it opens has its own suite.
vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (name: string) => (name === 'lobbyHosting' ? mocks.canHost : false),
}));
vi.mock('../lobbies/open-lobby-dialog', () => ({
  OpenLobbyDialog: () => <div role="dialog" aria-label="Open a debate lobby" />,
}));

// The browser's zone, which the machine running the tests would otherwise decide.
vi.mock('~/core/availability/blocks', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/availability/blocks')>()),
  localTimezone: () => mocks.browserZone,
}));

const { HubHeaderControls } = await import('./hub-header-controls');

beforeAll(() => {
  // Radix poppers measure their content; jsdom ships no observer.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.assign(mocks, {
    isSet: false,
    loaded: true,
    authenticated: true,
    available: false,
    blocks: [],
    timezone: undefined,
    browserZone: 'Europe/Vilnius',
    saveSurfaces: [],
    canHost: false,
  });
  mocks.updateAvailability.mockReset();
});

const pill = () => screen.getByRole('button', { name: /^Your availability/ });

describe('HubHeaderControls', () => {
  it('shows whether you take requests now, in a small pill', () => {
    mocks.available = true;
    const { rerender } = render(<HubHeaderControls />);
    expect(pill()).toHaveTextContent('Available');

    mocks.available = false;
    rerender(<HubHeaderControls />);
    expect(pill()).toHaveTextContent('Not available');
  });

  it('turns live availability on and off from its menu', async () => {
    const user = userEvent.setup();
    render(<HubHeaderControls />);

    await user.click(pill());
    await user.click(await screen.findByRole('switch', { name: 'Available now' }));

    expect(mocks.updateAvailability).toHaveBeenCalledWith(true);
  });

  it('marks the pill until weekly times are saved, but not before the read answers', () => {
    const { rerender } = render(<HubHeaderControls />);
    expect(within(pill()).getByTestId('schedule-unset-dot')).toBeInTheDocument();

    mocks.isSet = true;
    rerender(<HubHeaderControls />);
    expect(screen.queryByTestId('schedule-unset-dot')).not.toBeInTheDocument();

    mocks.isSet = false;
    mocks.loaded = false;
    rerender(<HubHeaderControls />);
    expect(screen.queryByTestId('schedule-unset-dot')).not.toBeInTheDocument();
  });

  it('offers to set your availability when none is saved', async () => {
    const user = userEvent.setup();
    render(<HubHeaderControls />);

    await user.click(pill());
    expect(await screen.findByRole('button', { name: /^Set my times/ })).toBeInTheDocument();
  });

  it('reads My availability back and opens its editor, attributed to the header', async () => {
    mocks.isSet = true;
    mocks.blocks = [0, 1, 2, 3, 4].map(weekday => ({
      id: `r${weekday}`,
      kind: 'recurring' as const,
      weekday,
      start: 18 * 60,
      end: 20 * 60,
    }));
    const user = userEvent.setup();
    render(<HubHeaderControls />);

    await user.click(pill());
    const menu = await screen.findByRole('dialog', { name: 'Your availability' });
    // The whole row is the button, named for what it does.
    const row = within(menu).getByRole('button', { name: /^Edit my times/ });
    expect(row).toHaveTextContent(/Mon–Fri 6 – 8pm/);

    await user.click(row);
    expect(
      within(await screen.findByRole('dialog', { name: /schedule/i })).getByRole('button', { name: 'Save schedule' })
    ).toBeInTheDocument();
    expect(new Set(mocks.saveSurfaces)).toEqual(new Set(['hub_header']));
  });

  // Saved in Los Angeles, read in Vilnius: the row says the hours the editor it opens will draw.
  it('summarises a schedule saved in another zone in the current one (GEO-3582)', async () => {
    // Pinned: Los Angeles and Vilnius are 10 hours apart now, but 9 in the weeks only one of them
    // has changed clocks. Only `Date`, so the popover's own timers still run.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    mocks.isSet = true;
    mocks.timezone = 'America/Los_Angeles';
    mocks.blocks = [{ id: 'r1', kind: 'recurring', weekday: 1, start: 9 * 60, end: 10 * 60 }];
    const user = userEvent.setup();
    render(<HubHeaderControls />);

    await user.click(pill());
    const menu = await screen.findByRole('dialog', { name: 'Your availability' });
    expect(within(menu).getByRole('button', { name: /^Edit my times/ })).toHaveTextContent(/Tue 7 – 8pm/);
  });

  // A laptop that crosses a border: the next render, for whatever reason, says the new zone's hours,
  // as the editor it opens would. Tokyo is 17 hours ahead of Los Angeles.
  it('re-summarises in a new zone on the next render', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    mocks.isSet = true;
    mocks.timezone = 'America/Los_Angeles';
    mocks.blocks = [{ id: 'r1', kind: 'recurring', weekday: 1, start: 9 * 60, end: 10 * 60 }];
    const user = userEvent.setup();
    const { rerender } = render(<HubHeaderControls />);

    mocks.browserZone = 'Asia/Tokyo';
    rerender(<HubHeaderControls />);
    await user.click(pill());
    const menu = await screen.findByRole('dialog', { name: 'Your availability' });
    expect(within(menu).getByRole('button', { name: /^Edit my times/ })).toHaveTextContent(/Wed 2 – 3am/);
  });

  it("labels its clicks as the surface it sits on, the hub's by default", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<HubHeaderControls />);
    expect(pill()).toHaveAttribute('data-geo-analytics-label', 'Debate hub Availability menu');

    rerender(<HubHeaderControls analyticsSurface="calendar" />);
    expect(pill()).toHaveAttribute('data-geo-analytics-label', 'Debate calendar Availability menu');
    await user.click(pill());
    expect(await screen.findByRole('button', { name: /^Set my times/ })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Schedule calendar'
    );
  });

  it('attributes a schedule saved from the calendar to the calendar', async () => {
    const user = userEvent.setup();
    render(<HubHeaderControls analyticsSurface="calendar" />);

    await user.click(pill());
    await user.click(await screen.findByRole('button', { name: /^Set my times/ }));
    await screen.findByRole('dialog', { name: /schedule/i });

    expect(new Set(mocks.saveSurfaces)).toEqual(new Set(['calendar']));
  });

  // The panel hands this ref to the set-schedule banner, which sends focus here when it leaves.
  it('attaches a passed ref to the pill', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<HubHeaderControls scheduleButtonRef={ref} />);

    expect(ref.current).toBe(pill());
  });

  // GEO-3463: Open a lobby left the card above the panel's tabs for this menu, last, under the link.
  it('offers hosts Open a lobby as the last row, which opens the dialog', async () => {
    mocks.canHost = true;
    const user = userEvent.setup();
    render(<HubHeaderControls />);

    await user.click(pill());
    const menu = await screen.findByRole('dialog', { name: 'Your availability' });
    const rows = within(menu).getAllByRole('button');
    expect(rows.at(-1)).toHaveTextContent('Open a lobby');
    expect(rows.at(-1)).toHaveAttribute('data-geo-analytics-label', 'Open a lobby');

    await user.click(rows.at(-1)!);
    expect(await screen.findByRole('dialog', { name: 'Open a debate lobby' })).toBeInTheDocument();
  });

  it('labels Open a lobby with the surface it is clicked on away from the hub', async () => {
    mocks.canHost = true;
    const user = userEvent.setup();
    render(<HubHeaderControls analyticsSurface="calendar" />);

    await user.click(pill());
    const menu = await screen.findByRole('dialog', { name: 'Your availability' });
    expect(within(menu).getByRole('button', { name: 'Open a lobby' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Open a lobby'
    );
  });

  it('offers no Open a lobby inside a lobby', async () => {
    mocks.canHost = true;
    const user = userEvent.setup();
    render(<HubHeaderControls analyticsSurface="lobby" />);

    await user.click(pill());
    const menu = await screen.findByRole('dialog', { name: 'Your availability' });
    expect(within(menu).queryByRole('button', { name: 'Open a lobby' })).not.toBeInTheDocument();
  });

  it('keeps Open a lobby from people who cannot host', async () => {
    const user = userEvent.setup();
    render(<HubHeaderControls />);

    await user.click(pill());
    const menu = await screen.findByRole('dialog', { name: 'Your availability' });
    expect(within(menu).queryByRole('button', { name: 'Open a lobby' })).not.toBeInTheDocument();
  });

  it('draws nothing but its children signed out', () => {
    mocks.authenticated = false;
    render(
      <HubHeaderControls>
        <span>Calendar</span>
      </HubHeaderControls>
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });
});
