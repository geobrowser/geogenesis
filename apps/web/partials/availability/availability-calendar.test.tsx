import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';
import { isoDate, mondayOf } from '~/core/availability/blocks';

import { AvailabilityCalendar } from './availability-calendar';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const thisMonday = () => mondayOf(new Date());

const blocks: AvailabilityBlock[] = [
  { id: 'a', kind: 'recurring', weekday: 1, start: 9 * 60, end: 10 * 60 },
  { id: 'b', kind: 'recurring', weekday: 3, start: 18 * 60, end: 19 * 60 },
];

const deleteButtons = () => screen.queryAllByRole('button', { name: /^Delete /i });

describe('AvailabilityCalendar', () => {
  it('draws a block per entry once mounted', async () => {
    render(<AvailabilityCalendar initialBlocks={blocks} />);
    await waitFor(() => expect(deleteButtons()).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Delete 9am to 10am block' })).toBeInTheDocument();
  });

  // The delete button sits inside the block, which is also the drag handle. Starting a drag on
  // pointerdown captures the pointer, and a captured pointer delivers the click to the grid rather
  // than the button — which left the × doing nothing at all.
  it('deletes a single block when its × is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AvailabilityCalendar initialBlocks={blocks} onChange={onChange} />);
    await waitFor(() => expect(deleteButtons()).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Delete 9am to 10am block' }));

    await waitFor(() => expect(deleteButtons()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Delete 6pm to 7pm block' })).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith([blocks[1]]);
  });

  it('clears every block, including ones in weeks that are not on screen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const nextWeek: AvailabilityBlock = {
      id: 'c',
      kind: 'dated',
      date: isoDate(new Date(thisMonday().getTime() + 8 * 24 * 60 * 60 * 1000)),
      start: 11 * 60,
      end: 12 * 60,
    };
    render(<AvailabilityCalendar initialBlocks={[...blocks, nextWeek]} onChange={onChange} />);
    await waitFor(() => expect(deleteButtons()).toHaveLength(2)); // the third is next week

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(deleteButtons()).toHaveLength(0));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  // The year is noise 51 weeks out of 52, and the one thing you need on the 52nd.
  it('names the year only once the week leaves the current one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 11, 16));
    const user = userEvent.setup(); // a Wednesday, two weeks before new year
    render(<AvailabilityCalendar />);

    await waitFor(() => expect(screen.getByText('Dec 14 – Dec 20')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText('Dec 21 – Dec 27')).toBeInTheDocument();

    // The week that straddles the boundary ends in 2027, so it says so.
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText('Dec 28 – Jan 3, 2027')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText('Jan 4 – Jan 10, 2027')).toBeInTheDocument();
  });

  it('disables Clear all when there is nothing to clear', async () => {
    render(<AvailabilityCalendar />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled());
  });
});
