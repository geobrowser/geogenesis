import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnScheduleModal } from './own-schedule-modal';

const mocks = vi.hoisted(() => ({
  flagOn: false,
  connectionsEnabled: [] as boolean[],
  busyRanges: [] as unknown[],
  connected: true,
  disabled: false,
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => id === 'googleCalendar' && mocks.flagOn,
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({ blocks: [], isError: false, refetch: vi.fn() }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn() }),
}));

vi.mock('~/core/debates/calendar-hooks', () => ({
  useCalendarConnections: (enabled: boolean) => {
    mocks.connectionsEnabled.push(enabled);
    return {
      google: enabled ? (mocks.connected ? { status: 'ok' } : null) : undefined,
      disabled: mocks.disabled,
    };
  },
  useCalendarBusy: (range: unknown) => {
    mocks.busyRanges.push(range);
    return { intervals: range ? [] : undefined };
  },
}));

vi.mock('./google-calendar-section', () => ({
  GoogleCalendarSection: () => <section aria-label="Google Calendar" />,
}));

vi.mock('./copy-availability-link', () => ({ CopyOwnAvailabilityLinkButton: () => null }));

beforeEach(() => {
  mocks.flagOn = false;
  mocks.connected = true;
  mocks.disabled = false;
  mocks.connectionsEnabled = [];
  mocks.busyRanges = [];
});

afterEach(cleanup);

describe('OwnScheduleModal Google Calendar', () => {
  it('asks for nothing and draws nothing with the flag off', async () => {
    render(<OwnScheduleModal open onOpenChange={() => {}} surface="navbar" />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('region', { name: 'Google Calendar' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Busy on your calendar')).not.toBeInTheDocument();
    expect(mocks.connectionsEnabled).toEqual([]);
    expect(mocks.busyRanges).toEqual([]);
  });

  it('draws the section and the busy legend once connected', async () => {
    mocks.flagOn = true;
    render(<OwnScheduleModal open onOpenChange={() => {}} surface="navbar" />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('region', { name: 'Google Calendar' })).toBeInTheDocument();
    expect(within(dialog).getByText('Busy on your calendar')).toBeInTheDocument();
  });

  it('asks for no busy time while nothing is connected', async () => {
    mocks.flagOn = true;
    mocks.connected = false;
    render(<OwnScheduleModal open onOpenChange={() => {}} surface="navbar" />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('region', { name: 'Google Calendar' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Busy on your calendar')).not.toBeInTheDocument();
    expect(mocks.busyRanges.every(range => range === null)).toBe(true);
  });

  it('hides the section when geo-chat has the feature off', async () => {
    mocks.flagOn = true;
    mocks.disabled = true;
    render(<OwnScheduleModal open onOpenChange={() => {}} surface="navbar" />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('region', { name: 'Google Calendar' })).not.toBeInTheDocument();
  });
});
