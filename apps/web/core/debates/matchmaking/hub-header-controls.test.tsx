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
  saveSurfaces: [] as string[],
  updateAvailability: vi.fn(),
}));

// The pill reads `../hooks`; the schedule editor it opens reads the same module by its alias.
vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({
    data: mocks.loaded ? { is_set: mocks.isSet } : undefined,
    blocks: mocks.loaded ? mocks.blocks : undefined,
    isSet: mocks.isSet,
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
  Object.assign(mocks, {
    isSet: false,
    loaded: true,
    authenticated: true,
    available: false,
    blocks: [],
    saveSurfaces: [],
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
    expect(within(menu).getByText('My availability')).toBeInTheDocument();
    expect(within(menu).getByText(/Mon–Fri 6 – 8pm/)).toBeInTheDocument();

    await user.click(within(menu).getByRole('button', { name: 'Edit' }));
    expect(
      within(await screen.findByRole('dialog', { name: /schedule/i })).getByRole('button', { name: 'Save schedule' })
    ).toBeInTheDocument();
    expect(new Set(mocks.saveSurfaces)).toEqual(new Set(['hub_header']));
  });

  // The panel hands this ref to the set-schedule banner, which sends focus here when it leaves.
  it('attaches a passed ref to the pill', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<HubHeaderControls scheduleButtonRef={ref} />);

    expect(ref.current).toBe(pill());
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
