import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditProfileStatus } from '~/core/hooks/use-edit-profile';

import { EditProfileDialog } from './edit-profile-dialog';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  discard: vi.fn(),
  canEdit: true,
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
    isLoading: false,
    entityId: 'entity',
    spaceId: 'space',
    current: mocks.current,
    status: mocks.status,
    errorMessage: mocks.errorMessage,
    publish: mocks.publish,
    discard: mocks.discard,
  }),
}));

function renderDialog(onOpenChange = vi.fn()) {
  render(<EditProfileDialog open onOpenChange={onOpenChange} />);
  return { onOpenChange };
}

const nameField = () => screen.getByPlaceholderText('Your name');
const descriptionField = () => screen.getByPlaceholderText(/A sentence about who you are/);
const saveButton = () => screen.getByRole('button', { name: /Save profile|Publishing|Retry/ });

beforeEach(() => {
  mocks.publish.mockReset();
  mocks.discard.mockReset();
  mocks.canEdit = true;
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

      expect(screen.getByText(/This usually takes about 10 seconds/)).toBeInTheDocument();
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
      expect(mocks.discard).not.toHaveBeenCalled();
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

      expect(mocks.discard).toHaveBeenCalled();
    });
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
