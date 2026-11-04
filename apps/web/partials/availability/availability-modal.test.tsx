import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';

import { AvailabilityModal } from './availability-modal';

const mocks = vi.hoisted(() => ({ zone: 'Europe/Vilnius' }));

// The test machine's own zone would otherwise decide what every test here sees.
vi.mock('~/core/availability/blocks', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/availability/blocks')>()),
  localTimezone: () => mocks.zone,
}));

const saved: AvailabilityBlock[] = [{ id: 'block-1', kind: 'recurring', weekday: 1, start: 540, end: 600 }];

afterEach(cleanup);

describe('AvailabilityModal while the schedule is still being read', () => {
  // The grid seeds from `initialBlocks` at mount and never reseeds. Opening on `[]` therefore left
  // it empty after the real schedule landed, and Save wrote that empty week over the stored one.
  it('does not save an empty week over a schedule that arrives after opening', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<AvailabilityModal open onOpenChange={() => {}} blocks={undefined} onSave={onSave} />);

    // Nothing to edit yet, so there is nothing to save yet either.
    expect(screen.getByText('Loading your schedule…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument();

    rerender(<AvailabilityModal open onOpenChange={() => {}} blocks={saved} onSave={onSave} />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Loading your schedule…')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toEqual(saved);
  });

  it('closes from the loading state without saving', async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<AvailabilityModal open onOpenChange={onOpenChange} blocks={undefined} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  // An empty week is a legitimate schedule -- someone clearing theirs -- and must still be editable.
  it('opens straight into the grid when the read answers empty', async () => {
    render(<AvailabilityModal open onOpenChange={() => {}} blocks={[]} onSave={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Loading your schedule…')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save schedule' })).toBeInTheDocument();
  });

  // `blocks` stays undefined when the read fails, so without this the wait never ends.
  it('offers a retry instead of waiting forever when the read fails', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <AvailabilityModal open onOpenChange={() => {}} blocks={undefined} error onRetry={onRetry} onSave={vi.fn()} />
    );

    expect(screen.queryByText('Loading your schedule…')).not.toBeInTheDocument();
    expect(screen.getByText('We couldn’t load your schedule.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('AvailabilityModal across openings', () => {
  // The modal stays mounted between openings, so `draft` outlives a cancelled edit. It is reset by
  // the calendar reporting its seed on remount; this pins that, since nothing else would catch it.
  it('does not save edits that were cancelled in an earlier opening', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<AvailabilityModal open onOpenChange={() => {}} blocks={saved} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    rerender(<AvailabilityModal open={false} onOpenChange={() => {}} blocks={saved} onSave={onSave} />);
    rerender(<AvailabilityModal open onOpenChange={() => {}} blocks={saved} onSave={onSave} />);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toEqual(saved);
  });
});

describe('AvailabilityModal time zone (GEO-3582)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // After both the US and the EU have left daylight saving: Los Angeles is 10 hours behind.
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    mocks.zone = 'Europe/Vilnius';
  });
  afterEach(() => vi.useRealTimers());

  it('says which zone the hours are in', async () => {
    render(<AvailabilityModal open onOpenChange={() => {}} blocks={saved} onSave={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Times are in Eastern European Time (Vilnius).')).toBeInTheDocument();
  });

  it('leaves a schedule saved in the current zone as it is', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <AvailabilityModal open onOpenChange={() => {}} blocks={saved} savedTimezone="Europe/Vilnius" onSave={onSave} />
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Times are in Eastern European Time (Vilnius).')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }));
    expect(onSave.mock.calls[0][0]).toEqual(saved);
  });

  // Saved Tuesday 9–10am in Los Angeles, opened in Vilnius: the same hour is 7–8pm there, and
  // saving without touching anything keeps it at that hour.
  it('draws and saves a schedule from another zone at the same instants', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <AvailabilityModal
        open
        onOpenChange={() => {}}
        blocks={saved}
        savedTimezone="America/Los_Angeles"
        onSave={onSave}
      />
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'Times are in Eastern European Time (Vilnius), converted from Pacific Time (Los Angeles) where you set them.'
      )
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }));
    expect(onSave.mock.calls[0][0]).toEqual([
      expect.objectContaining({ kind: 'recurring', weekday: 1, start: 19 * 60, end: 20 * 60 }),
    ]);
  });

  // Save stamps whatever zone the browser is in at the time, so a grid still holding the old
  // zone's hours would publish them an hour (or a day) off. Tokyo is 17 hours ahead of LA here.
  it('redraws the grid in the new zone if the browser changes zone while it is open', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const props = {
      open: true,
      onOpenChange: () => {},
      blocks: saved,
      savedTimezone: 'America/Los_Angeles',
      onSave,
    };
    const { rerender } = render(<AvailabilityModal {...props} />);
    await screen.findByRole('dialog');

    mocks.zone = 'Asia/Tokyo';
    rerender(<AvailabilityModal {...props} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/^Times are in Japan Standard Time \(Tokyo\)/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }));
    expect(onSave.mock.calls[0][0]).toEqual([
      expect.objectContaining({ kind: 'recurring', weekday: 2, start: 2 * 60, end: 3 * 60 }),
    ]);
  });
});
