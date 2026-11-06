import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';

import { OwnScheduleModal } from './own-schedule-modal';

const mocks = vi.hoisted(() => ({
  flagOn: false,
  microsoftFlagOn: false,
  microsoftConnected: false,
  sectionProviders: [] as unknown[],
  connectionsEnabled: [] as boolean[],
  busyRanges: [] as unknown[],
  connected: true,
  disabled: false,
  blocks: [] as AvailabilityBlock[],
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) =>
    (id === 'googleCalendar' && mocks.flagOn) || (id === 'microsoftCalendar' && mocks.microsoftFlagOn),
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({ blocks: mocks.blocks, isError: false, refetch: vi.fn() }),
  useSaveDebateSchedule: () => ({ mutate: mocks.mutate, mutateAsync: mocks.mutateAsync }),
}));

vi.mock('~/core/debates/calendar-hooks', () => ({
  useCalendarConnections: (enabled: boolean) => {
    mocks.connectionsEnabled.push(enabled);
    return {
      google: enabled ? (mocks.connected ? { status: 'ok' } : null) : undefined,
      microsoft: enabled ? (mocks.microsoftConnected ? { status: 'ok' } : null) : undefined,
      disabled: mocks.disabled,
    };
  },
  useCalendarBusy: (range: unknown) => {
    mocks.busyRanges.push(range);
    return { intervals: range ? [] : undefined };
  },
}));

vi.mock('./calendar-section', () => ({
  CalendarSection: ({
    providers,
    unsavedChanges,
    saveDraft,
    returned,
  }: {
    providers: unknown;
    unsavedChanges: boolean;
    saveDraft?: () => Promise<unknown>;
    returned: unknown;
  }) => {
    mocks.sectionProviders.push(providers);
    return (
      <section
        aria-label="Google Calendar"
        data-unsaved={String(unsavedChanges)}
        data-returned={JSON.stringify(returned)}
      >
        <button type="button" onClick={() => void saveDraft?.()}>
          Save draft
        </button>
      </section>
    );
  },
}));

vi.mock('./copy-availability-link', () => ({ CopyOwnAvailabilityLinkButton: () => null }));

beforeEach(() => {
  mocks.flagOn = false;
  mocks.microsoftFlagOn = false;
  mocks.microsoftConnected = false;
  mocks.sectionProviders = [];
  mocks.connected = true;
  mocks.disabled = false;
  mocks.connectionsEnabled = [];
  mocks.busyRanges = [];
  mocks.blocks = [];
  mocks.mutate = vi.fn();
  mocks.mutateAsync = vi.fn(() => Promise.resolve());
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

  it('hands the section a clean draft and the return outcome', async () => {
    mocks.flagOn = true;
    render(
      <OwnScheduleModal
        open
        onOpenChange={() => {}}
        surface="google_calendar"
        calendarReturn={{ provider: 'google', outcome: 'connected', reason: null }}
      />
    );

    const section = within(await screen.findByRole('dialog')).getByRole('region', { name: 'Google Calendar' });
    expect(section).toHaveAttribute('data-unsaved', 'false');
    expect(JSON.parse(section.getAttribute('data-returned')!)).toEqual({
      provider: 'google',
      outcome: 'connected',
      reason: null,
    });
  });

  // A connect awaits this save before leaving the page, so it must be the promise of the save itself
  // (GEO-3595): `mutate` returns nothing, and the browser would leave with the save in flight.
  it('saves the draft for the section by awaiting the save, without closing or reporting a Save', async () => {
    mocks.flagOn = true;
    mocks.blocks = [{ id: 'b1', kind: 'recurring', weekday: 1, start: 9 * 60, end: 10 * 60 }];
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(<OwnScheduleModal open onOpenChange={onOpenChange} onSaved={onSaved} surface="navbar" />);

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith([]);
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('marks the draft unsaved once the grid changes', async () => {
    mocks.flagOn = true;
    mocks.blocks = [{ id: 'b1', kind: 'recurring', weekday: 1, start: 9 * 60, end: 10 * 60 }];
    render(<OwnScheduleModal open onOpenChange={() => {}} surface="navbar" />);

    const dialog = await screen.findByRole('dialog');
    const section = within(dialog).getByRole('region', { name: 'Google Calendar' });
    expect(section).toHaveAttribute('data-unsaved', 'false');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    expect(section).toHaveAttribute('data-unsaved', 'true');
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

  it('offers Google alone with only its flag on', async () => {
    mocks.flagOn = true;
    render(<OwnScheduleModal open onOpenChange={() => {}} surface="navbar" />);

    await screen.findByRole('dialog');
    expect(mocks.sectionProviders.at(-1)).toEqual(['google']);
  });

  it('offers Outlook with only its flag on, shading busy time from an Outlook connection', async () => {
    mocks.microsoftFlagOn = true;
    mocks.connected = false;
    mocks.microsoftConnected = true;
    render(<OwnScheduleModal open onOpenChange={() => {}} surface="navbar" />);

    const dialog = await screen.findByRole('dialog');
    expect(mocks.sectionProviders.at(-1)).toEqual(['microsoft']);
    expect(within(dialog).getByText('Busy on your calendar')).toBeInTheDocument();
  });

  it('offers both with both flags on', async () => {
    mocks.flagOn = true;
    mocks.microsoftFlagOn = true;
    render(<OwnScheduleModal open onOpenChange={() => {}} surface="navbar" />);

    await screen.findByRole('dialog');
    expect(mocks.sectionProviders.at(-1)).toEqual(['google', 'microsoft']);
  });
});
