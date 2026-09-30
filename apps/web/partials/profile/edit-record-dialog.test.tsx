import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditRecordDialog } from './edit-record-dialog';

const mocks = vi.hoisted(() => ({
  hasPendingChanges: true,
  canEdit: true,
  status: 'idle' as 'idle' | 'publishing' | 'error' | 'published',
  staged: { values: [{ id: 'value-1' }], relations: [{ id: 'relation-1' }] },
  publish: vi.fn(),
  settle: vi.fn(),
  discard: vi.fn(),
  reset: vi.fn(),
  /** Anything written straight to the store, which this dialog must not do. */
  storageWrites: [] as string[],
  /** Anything published through the raw proposal API, likewise. */
  proposals: [] as unknown[],
}));

vi.mock('~/core/hooks/use-profile-history', () => ({
  useProfileHistory: () => ({
    employment: [],
    education: [],
    isUnavailable: false,
    hasPendingChanges: mocks.hasPendingChanges,
    stagePending: () => mocks.staged,
    settle: mocks.settle,
    discard: mocks.discard,
    draftFor: () => undefined,
    addPosition: vi.fn(),
    addEducation: vi.fn(),
    editEntry: vi.fn(),
    removeEntry: vi.fn(),
  }),
}));

vi.mock('~/core/hooks/use-edit-profile', () => ({
  useEditProfile: () => ({
    canEdit: mocks.canEdit,
    current: {
      name: 'Preston Mantel',
      tagline: 'Head of Product at Geo',
      description: 'A bio',
      bannerUrl: null,
      avatarUrl: null,
    },
    publish: mocks.publish,
    status: mocks.status,
    errorMessage: null,
    reset: mocks.reset,
  }),
}));

// Both of these are how the dialog used to save, and neither wrote an edit.
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      values: {
        set: () => mocks.storageWrites.push('value.set'),
        delete: () => mocks.storageWrites.push('value.delete'),
      },
      relations: {
        set: () => mocks.storageWrites.push('relation.set'),
        delete: () => mocks.storageWrites.push('relation.delete'),
      },
    },
  }),
}));

vi.mock('~/core/hooks/use-publish', () => ({
  usePublish: () => ({ makeProposal: (args: unknown) => mocks.proposals.push(args) }),
}));

vi.mock('./history-section', () => ({
  HistorySection: () => <div data-testid="history-section" />,
}));

vi.mock('./add-position-sheet', () => ({ AddPositionSheet: () => <div /> }));
vi.mock('./add-education-sheet', () => ({ AddEducationSheet: () => <div /> }));

const props = {
  entityId: '6caf2067e9a64f3696ff22fb7bc94947',
  spaceId: 'f3dab79cb5a3d9d1759656dd5361d1c6',
};

/**
 * A press from `down` released on `up`. The click lands on their common ancestor,
 * which for any press touching the backdrop is the backdrop itself.
 */
function press(down: Element, up: Element, backdrop: Element) {
  fireEvent.pointerDown(down);
  fireEvent.pointerUp(up);
  fireEvent.click(backdrop);
}

function renderDialog(onOpenChange: (open: boolean) => void = () => {}) {
  return render(<EditRecordDialog kind="employment" onOpenChange={onOpenChange} {...props} />);
}

describe('EditRecordDialog', () => {
  beforeEach(() => {
    mocks.hasPendingChanges = true;
    mocks.canEdit = true;
    mocks.status = 'idle';
    mocks.publish.mockClear();
    mocks.settle.mockClear();
    mocks.discard.mockClear();
    mocks.reset.mockClear();
    mocks.storageWrites = [];
    mocks.proposals = [];
  });

  afterEach(cleanup);

  /**
   * The bug this pins: writing the staged rows to the store and handing the same
   * array to `makeProposal` publishes an *addition* correctly and an *edit* not
   * at all. An edit is a removal plus a rewrite, and the tombstone the publish
   * needs is the one the store made — not the row that was passed in.
   */
  it('publishes through the same path the Edit profile modal uses', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.storageWrites).toEqual([]);
    expect(mocks.proposals).toEqual([]);
  });

  it('sends the staged rows, and leaves the header fields alone', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const [draft, rows] = mocks.publish.mock.calls[0];

    // This dialog edits one section. Passing the current header fields back unchanged is what
    // keeps it from touching them — and `toEqual` treats an absent key and an `undefined` one
    // as the same, so a field dropped from the draft passes here unless the mock supplies it.
    expect(draft).toEqual({
      name: 'Preston Mantel',
      tagline: 'Head of Product at Geo',
      description: 'A bio',
      banner: { kind: 'unchanged' },
      avatar: { kind: 'unchanged' },
    });
    expect(rows).toBe(mocks.staged);
  });

  it('does not clear the queue until the publish lands', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // A failure has to leave the rows where they are, so the dialog can come
    // back with the work intact.
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('clears the queue once it has landed', () => {
    mocks.status = 'published';

    renderDialog();

    expect(mocks.settle).toHaveBeenCalledOnce();
  });

  it('cannot be saved before the viewer’s own space has resolved', () => {
    // `publish` returns without doing anything when `canEdit` is false — a Save
    // that reports nothing and writes nothing is the worst of both.
    mocks.canEdit = false;

    renderDialog();

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('cannot be saved with nothing staged', () => {
    mocks.hasPendingChanges = false;

    renderDialog();

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  describe('closing with rows staged', () => {
    const confirmation = () => screen.queryByText('Exiting without saving will discard edits');

    it.each(['Cancel', 'Close'])('asks before %s throws them away', name => {
      const onOpenChange = vi.fn();
      renderDialog(onOpenChange);

      fireEvent.click(screen.getByRole('button', { name }));

      expect(confirmation()).toBeInTheDocument();
      expect(mocks.discard).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('asks on Escape too', () => {
      const onOpenChange = vi.fn();
      renderDialog(onOpenChange);

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

      expect(confirmation()).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('throws the staged rows away on Discard edits', () => {
      const onOpenChange = vi.fn();
      renderDialog(onOpenChange);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Discard edits' }));

      expect(mocks.discard).toHaveBeenCalledOnce();
      expect(mocks.publish).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('publishes them on Save changes', () => {
      const onOpenChange = vi.fn();
      renderDialog(onOpenChange);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(mocks.publish).toHaveBeenCalledOnce();
      expect(mocks.discard).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('goes back to editing when the question is dismissed', () => {
      const onOpenChange = vi.fn();
      renderDialog(onOpenChange);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.keyDown(screen.getByRole('button', { name: 'Discard edits' }), { key: 'Escape' });

      expect(confirmation()).not.toBeInTheDocument();
      expect(screen.getByText('Edit experience')).toBeInTheDocument();
      expect(mocks.discard).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  it('goes back to editing on a click outside the question', () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const backdrop = screen.getAllByRole('dialog').at(-1)!;
    press(backdrop, backdrop, backdrop);

    expect(screen.queryByText('Exiting without saving will discard edits')).not.toBeInTheDocument();
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('goes back to editing on Keep editing', () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.queryByText('Exiting without saving will discard edits')).not.toBeInTheDocument();
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('starts focus on Keep editing, not on Discard', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('says why Save changes is held while the space is resolving', () => {
    mocks.canEdit = false;
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText('Your space is still loading. Try again in a moment.')).toBeInTheDocument();
  });

  // A click's target is the common ancestor of press and release, so a drag from
  // the card out onto the backdrop lands as a click on the backdrop.
  it('stays up after a drag from the question out onto the backdrop', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const backdrop = screen.getAllByRole('dialog').at(-1)!;
    press(screen.getByText('Exiting without saving will discard edits'), backdrop, backdrop);

    expect(screen.getByText('Exiting without saving will discard edits')).toBeInTheDocument();
  });

  it('stays up after a drag from the backdrop in over the question', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const backdrop = screen.getAllByRole('dialog').at(-1)!;
    press(backdrop, screen.getByText('Exiting without saving will discard edits'), backdrop);

    expect(screen.getByText('Exiting without saving will discard edits')).toBeInTheDocument();
  });

  it('reads out why Save changes is held as part of the question', () => {
    mocks.canEdit = false;
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('dialog', { name: /Exiting without saving/ })).toHaveAccessibleDescription(
      'Your space is still loading. Try again in a moment.'
    );
  });

  it('gives the footer pills a keyboard focus ring', () => {
    renderDialog();

    for (const name of ['Cancel', 'Save']) {
      expect(screen.getByRole('button', { name })).toHaveClass('focus-visible:outline-2', 'focus-visible:outline-text');
    }
  });

  it('closes without asking when nothing is staged', () => {
    mocks.hasPendingChanges = false;
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Exiting without saving will discard edits')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps them through a cancel during a publish', () => {
    // Dismissing never cancels a publish, so throwing the rows away here would
    // strand an edit that is still in flight.
    mocks.status = 'publishing';

    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.discard).not.toHaveBeenCalled();
  });
});
