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
  isLoading: false,
  status: 'idle' as EditProfileStatus,
  errorMessage: null as string | null,
  current: {
    name: 'Preston Mantel',
    description: 'Working on debates.',
    bannerUrl: undefined as string | undefined,
    avatarUrl: undefined as string | undefined,
  },
}));

vi.mock('~/core/hooks/use-edit-profile', () => ({
  useEditProfile: () => ({
    canEdit: mocks.canEdit,
    isLoading: mocks.isLoading,
    entityId: 'entity',
    spaceId: 'space',
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
  mocks.isLoading = false;
  mocks.status = 'idle';
  mocks.errorMessage = null;
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

  it('blocks save on a blank name — the one required field', async () => {
    renderDialog();

    await userEvent.clear(nameField());
    expect(saveButton()).toBeDisabled();
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

  it('publishes the trimmed draft', async () => {
    renderDialog();

    await userEvent.clear(nameField());
    await userEvent.paste('  Preston  ');
    await userEvent.click(saveButton());

    expect(mocks.publish).toHaveBeenCalledWith({
      name: 'Preston',
      description: 'Working on debates.',
      banner: { kind: 'unchanged' },
      avatar: { kind: 'unchanged' },
    });
  });

  describe('while publishing', () => {
    beforeEach(() => {
      mocks.status = 'publishing';
    });

    it('locks the fields and names the wait rather than closing', () => {
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
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
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
