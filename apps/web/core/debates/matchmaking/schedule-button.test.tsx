import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';

import { ScheduleButton } from './schedule-button';

const mocks = vi.hoisted(() => ({
  isSet: false,
  loaded: true,
  authenticated: true,
  blocks: [] as AvailabilityBlock[],
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({
    data: mocks.loaded ? { is_set: mocks.isSet } : undefined,
    blocks: mocks.loaded ? mocks.blocks : undefined,
    isSet: mocks.isSet,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated, ready: true, accountKey: 'did:privy:1' }),
}));

afterEach(() => {
  cleanup();
  mocks.isSet = false;
  mocks.loaded = true;
  mocks.authenticated = true;
  mocks.blocks = [];
});

describe('ScheduleButton', () => {
  it('asks to set a schedule, with a dot, when none is saved', () => {
    render(<ScheduleButton />);

    const button = screen.getByRole('button', { name: 'Set your debate schedule' });
    expect(button).toHaveAttribute('data-geo-analytics-label', 'Debate hub Schedule calendar');
    expect(within(button).getByTestId('schedule-unset-dot')).toBeInTheDocument();
  });

  it('drops the dot and offers to edit once a schedule is saved', () => {
    mocks.isSet = true;
    render(<ScheduleButton />);

    expect(screen.getByRole('button', { name: 'Edit your debate schedule' })).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-unset-dot')).not.toBeInTheDocument();
  });

  // The dot before the read answers would flash at everyone who already has a schedule.
  it('holds the dot until the schedule read answers', () => {
    mocks.loaded = false;
    render(<ScheduleButton />);

    expect(screen.queryByTestId('schedule-unset-dot')).not.toBeInTheDocument();
  });

  it('reads the week back in its tooltip', async () => {
    mocks.isSet = true;
    mocks.blocks = [0, 1, 2, 3, 4].map(weekday => ({
      id: `r${weekday}`,
      kind: 'recurring' as const,
      weekday,
      start: 18 * 60,
      end: 20 * 60,
    }));
    const user = userEvent.setup();
    render(<ScheduleButton />);

    // The tooltip is a Radix popper, which measures its content; jsdom ships no observer.
    window.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    await user.hover(screen.getByRole('button', { name: 'Edit your debate schedule' }));
    expect((await screen.findAllByText('Mon–Fri 6 – 8pm')).length).toBeGreaterThan(0);
  });

  it('opens the schedule editor', async () => {
    const user = userEvent.setup();
    render(<ScheduleButton />);

    await user.click(screen.getByRole('button', { name: 'Set your debate schedule' }));

    expect(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save schedule' })
    ).toBeInTheDocument();
  });

  it('does not render signed out', () => {
    mocks.authenticated = false;
    render(<ScheduleButton />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
