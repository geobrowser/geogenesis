import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';

import { AvailabilityModal } from './availability-modal';

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
});
