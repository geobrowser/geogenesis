import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditProfileStatus } from '~/core/hooks/use-edit-profile';

import { EditProfileDialog } from './edit-profile-dialog';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  reset: vi.fn(),
  canEdit: true,
  entityId: 'entity-a',
  isHydrated: true,
  isLoading: false,
  status: 'idle' as EditProfileStatus,
  errorMessage: null as string | null,
  current: {
    name: 'Preston Mantel',
    description: 'Working on debates.',
    bannerUrl: undefined as string | undefined,
    avatarUrl: undefined as string | undefined,
  },
  hasPendingHistory: false,
  stagedHistory: { values: [], relations: [] } as { values: unknown[]; relations: unknown[] },
}));

// The sections keep their own pending state and their own tests; these are about
// the four header fields and what the sections owe them at Save, so it is stubbed
// to empty except where a test says otherwise.
vi.mock('~/core/hooks/use-profile-history', () => ({
  useProfileHistory: () => ({
    employment: [],
    education: [],
    isLoading: false,
    hasPendingChanges: mocks.hasPendingHistory,
    addPosition: vi.fn(),
    addEducation: vi.fn(),
    removeEntry: vi.fn(),
    editEntry: vi.fn(),
    stagePending: () => mocks.stagedHistory,
    settle: vi.fn(),
    discard: vi.fn(),
  }),
}));

vi.mock('~/core/hooks/use-edit-profile', () => ({
  useEditProfile: () => ({
    canEdit: mocks.canEdit,
    isHydrated: mocks.isHydrated,
    isLoading: mocks.isLoading,
    entityId: mocks.entityId,
    spaceId: 'space-1',
    current: mocks.current,
    status: mocks.status,
    errorMessage: mocks.errorMessage,
    publish: mocks.publish,
    reset: mocks.reset,
  }),
}));

function renderDialog(onOpenChange = vi.fn()) {
  const { rerender } = render(<EditProfileDialog open onOpenChange={onOpenChange} />);
  return { onOpenChange, rerender };
}

const nameField = () => screen.getByPlaceholderText('Your name');
const descriptionField = () => screen.getByPlaceholderText(/A sentence about who you are/);
const saveButton = () => screen.getByRole('button', { name: /Save profile|Publishing|Retry/ });

beforeEach(() => {
  mocks.publish.mockReset();
  mocks.reset.mockReset();
  mocks.canEdit = true;
  mocks.entityId = 'entity-a';
  mocks.isHydrated = true;
  mocks.isLoading = false;
  mocks.status = 'idle';
  mocks.errorMessage = null;
  mocks.hasPendingHistory = false;
  mocks.stagedHistory = { values: [], relations: [] };
  mocks.current = {
    name: 'Preston Mantel',
    description: 'Working on debates.',
    bannerUrl: undefined,
    avatarUrl: undefined,
  };
});

afterEach(cleanup);

describe('EditProfileDialog', () => {
  it('seeds the fields from the profile that is already on the entity', () => {
    renderDialog();

    expect(nameField()).toHaveValue('Preston Mantel');
    expect(descriptionField()).toHaveValue('Working on debates.');
  });

  it('keeps save disabled until something actually changes', async () => {
    renderDialog();

    expect(saveButton()).toBeDisabled();

    await userEvent.type(nameField(), '!');
    expect(saveButton()).toBeEnabled();
  });

  it('blocks save on a blank name, and says why', async () => {
    renderDialog();

    await userEvent.clear(nameField());

    expect(saveButton()).toBeDisabled();
    // A disabled button on its own explains nothing, and nothing at all to a
    // screen reader.
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
    expect(nameField()).toBeInvalid();
    expect(nameField()).toBeRequired();
  });

  it('marks the required field before anything is wrong with it', () => {
    renderDialog();

    expect(nameField()).toBeRequired();
    expect(nameField()).toBeValid();
    expect(screen.queryByText('Name is required.')).not.toBeInTheDocument();
  });

  // The graph does not cap description length, so neither does the modal — no
  // counter, and nothing to block save on.
  it('accepts a long description without capping it', async () => {
    renderDialog();

    const long = 'x'.repeat(1000);
    await userEvent.clear(descriptionField());
    await userEvent.paste(long);

    expect(descriptionField()).toHaveValue(long);
    expect(saveButton()).toBeEnabled();
  });

  // Work and education write nothing of their own, so a position added with the
  // four fields left alone is the whole of the edit — and Save has to offer it.
  describe('work and education', () => {
    it('offers to save an edit that is only a position', async () => {
      mocks.hasPendingHistory = true;
      renderDialog();

      expect(saveButton()).toBeEnabled();
    });

    it('publishes those rows in the same edit as the header fields', async () => {
      mocks.hasPendingHistory = true;
      mocks.stagedHistory = { values: [{ id: 'value-1' }], relations: [{ id: 'relation-1' }] };
      renderDialog();

      await userEvent.click(saveButton());

      expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), {
        values: [{ id: 'value-1' }],
        relations: [{ id: 'relation-1' }],
      });
    });
  });

  it('publishes the trimmed draft', async () => {
    renderDialog();

    await userEvent.clear(nameField());
    await userEvent.paste('  Preston  ');
    await userEvent.click(saveButton());

    // Second argument is the work and education rows, which go out in the same
    // edit as the header fields.
    expect(mocks.publish).toHaveBeenCalledWith(
      {
        name: 'Preston',
        description: 'Working on debates.',
        banner: { kind: 'unchanged' },
        avatar: { kind: 'unchanged' },
      },
      { values: [], relations: [] }
    );
  });

  // The status bar carries the upload, the publish and the result, and a failure
  // reopens this modal — so there is no reason to hold the screen for ~10s.
  it('closes on save and lets the status bar carry the publish', async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.type(nameField(), '!');
    await userEvent.click(saveButton());

    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Not a cancel: the staged edit has to survive for the retry path.
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('keeps the draft on screen when a save closes it, in case the publish fails', async () => {
    renderDialog();

    await userEvent.clear(descriptionField());
    await userEvent.paste('Half a thought');
    await userEvent.click(saveButton());

    // Reopening on failure has to find the work still here.
    expect(descriptionField()).toHaveValue('Half a thought');
  });

  // Reachable by reopening the modal from the menu while a save is still running.
  describe('while publishing', () => {
    beforeEach(() => {
      mocks.status = 'publishing';
    });

    it('locks the fields and names the wait rather than offering a second save', () => {
      renderDialog();

      // The wait takes over the footer's one line rather than adding a second.
      expect(screen.getByText('Publishing to your space. This usually takes about 10 seconds.')).toBeInTheDocument();
      expect(screen.queryByText('Saving publishes to your space.')).not.toBeInTheDocument();
      expect(nameField()).toBeDisabled();
      expect(descriptionField()).toBeDisabled();
      expect(saveButton()).toBeDisabled();
    });

    // Closing is a hand-off to the status bar, not a cancel — so the staged edit
    // has to survive it.
    it('closes without discarding the in-flight edit', async () => {
      const { onOpenChange } = renderDialog();

      // The header X and the footer button are both "Close" here, and both hand
      // off rather than cancel. The footer one is the labelled escape hatch.
      const closeButtons = screen.getAllByRole('button', { name: 'Close' });
      expect(closeButtons).toHaveLength(2);
      await userEvent.click(closeButtons[1]);

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mocks.reset).not.toHaveBeenCalled();
    });
  });

  describe('after a failed publish', () => {
    beforeEach(() => {
      mocks.status = 'error';
      mocks.errorMessage = 'Couldn’t publish your profile. Your changes are still here — try again.';
      // A failed save has already written to the local store, so the entity now
      // reads back the edit that never published.
      mocks.current = { ...mocks.current, name: 'Preston' };
    });

    it('keeps the work and offers Retry even though the entity now matches', () => {
      renderDialog();

      expect(screen.getByText(mocks.errorMessage!)).toBeInTheDocument();
      expect(screen.getByText('Nothing was published.')).toBeInTheDocument();

      const retry = screen.getByRole('button', { name: 'Retry' });
      expect(retry).toBeEnabled();
    });

    it('discards the abandoned edit when the user cancels instead', async () => {
      renderDialog();

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mocks.reset).toHaveBeenCalled();
    });
  });

  it('says why rather than showing a Save button that can never work', () => {
    mocks.canEdit = false;
    renderDialog();

    expect(screen.getByText('We couldn’t find your profile to edit. Try reloading the page.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  // The hook outlives the close, so a status left on 'published' would make this
  // effect fire again on the next open and shut the modal instantly.
  it('resets the hook when it closes itself after a success, so it can reopen', () => {
    mocks.status = 'published';
    const { onOpenChange } = renderDialog();

    expect(mocks.reset).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // The publish the user walked away from still lands. Clearing only while open
  // would leave the status on 'published' and shut the modal on the next open.
  it('clears a success that arrives after the user already closed it', () => {
    mocks.status = 'published';
    const onOpenChange = vi.fn();
    render(<EditProfileDialog open={false} onOpenChange={onOpenChange} />);

    expect(mocks.reset).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // The name arrives early from the warm profile query; the description only
  // exists on the entity. One shared pristine flag let a name typed during that
  // gap freeze the description at '' and delete it on save.
  it('still seeds the description after the user has typed a name', async () => {
    mocks.current = { ...mocks.current, description: '' };
    const { rerender } = renderDialog();

    await userEvent.type(nameField(), '!');

    mocks.current = { ...mocks.current, description: 'Arrived with the entity.' };
    rerender(<EditProfileDialog open onOpenChange={vi.fn()} />);

    expect(descriptionField()).toHaveValue('Arrived with the entity.');
  });

  it('holds save until the entity has hydrated', () => {
    mocks.isLoading = true;
    mocks.current = { ...mocks.current, name: 'Changed' };
    renderDialog();

    // The profile fallback can already show an avatar, so a replacement staged
    // now would add a second image edge rather than retarget the existing one.
    expect(saveButton()).toBeDisabled();
  });

  it('closes on a backdrop click', async () => {
    const { onOpenChange } = renderDialog();

    // The dialog content spans the viewport, so Radix's own outside-click never
    // fires and the backdrop is this container itself.
    const backdrop = screen.getByRole('dialog');
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not close on a click inside the card', async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.click(nameField());

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // The empty frame is already an "Add a photo" button; a second one beside it
  // gave two tab stops with the same name and the same action.
  it('offers one way to add a photo when there is none', () => {
    renderDialog();

    expect(screen.getAllByRole('button', { name: 'Add a photo' })).toHaveLength(1);
  });

  it('offers Replace and Remove once a photo is set', () => {
    mocks.current = { ...mocks.current, avatarUrl: 'ipfs://avatar' };
    renderDialog();

    expect(screen.queryByRole('button', { name: 'Add a photo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace profile photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove profile photo' })).toBeInTheDocument();
  });

  // A click's target is the common ancestor of its pointerdown and pointerup, so
  // drag-selecting in a field and releasing past the card edge produced a click on
  // the backdrop — throwing away everything typed, with no confirmation.
  it('does not dismiss when a drag started inside the card and ended on the backdrop', async () => {
    const { onOpenChange } = renderDialog();
    const backdrop = screen.getByRole('dialog');

    await userEvent.clear(nameField());
    await userEvent.paste('Half-typed name');

    // The press begins in the field; only the click lands on the backdrop.
    fireEvent.pointerDown(nameField());
    fireEvent.click(backdrop);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(nameField()).toHaveValue('Half-typed name');
  });

  it('names which image each control acts on', () => {
    mocks.current = { ...mocks.current, avatarUrl: 'ipfs://avatar', bannerUrl: 'ipfs://banner' };
    renderDialog();

    // Both images carry a Replace and a Remove; the visible labels are identical,
    // so the accessible names have to say which one they change.
    expect(screen.getByRole('button', { name: 'Replace banner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove banner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace profile photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove profile photo' })).toBeInTheDocument();
  });

  // A stored value with stray whitespace is not an edit until the user touches the
  // field. Trimming only the draft side marked the form dirty the moment it opened.
  it('is not dirty just because the stored value has whitespace', () => {
    mocks.current = { ...mocks.current, name: 'Preston Mantel ' };
    renderDialog();

    expect(saveButton()).toBeDisabled();
  });

  it('leaves an untouched whitespace value alone when something else changes', async () => {
    mocks.current = { ...mocks.current, name: 'Preston Mantel ' };
    renderDialog();

    await userEvent.clear(descriptionField());
    await userEvent.paste('A new description');
    await userEvent.click(saveButton());

    // The name goes out exactly as stored, not silently re-trimmed.
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ name: 'Preston Mantel ' }), expect.anything());
  });

  it('holds save until hydration actually produced an entity', () => {
    mocks.isHydrated = false;
    mocks.current = { ...mocks.current, name: 'Changed' };
    renderDialog();

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('We couldn’t find your profile to edit. Try reloading the page.')).toBeInTheDocument();
  });

  // The hook abandons a staged edit on an account change; the form it was typed
  // into has to go too, or the previous account's draft sits there ready to be
  // saved into somebody else's space.
  it('clears the form when the account changes underneath it', async () => {
    const { rerender } = renderDialog();

    await userEvent.clear(nameField());
    await userEvent.paste('Half-typed name');

    mocks.entityId = 'entity-b';
    mocks.current = { name: 'Someone Else', description: '', bannerUrl: undefined, avatarUrl: undefined };
    rerender(<EditProfileDialog open onOpenChange={vi.fn()} />);

    // Re-seeded from the new profile rather than holding the old draft.
    expect(nameField()).toHaveValue('Someone Else');
  });

  it('rejects a dropped file the picker’s accept filter would never have allowed', async () => {
    renderDialog();

    const gif = new File([''], 'banner.gif', { type: 'image/gif' });
    const frame = screen.getByTestId('profile-banner-frame');

    await userEvent.upload(screen.getByLabelText('Banner'), gif);
    // jsdom's file input honours `accept`, so drive the drop path directly —
    // which is the path that has no filter of its own.
    frame.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: { files: [gif] } }));

    expect(await screen.findByText('Banners have to be a PNG or JPEG.')).toBeInTheDocument();
  });
});
