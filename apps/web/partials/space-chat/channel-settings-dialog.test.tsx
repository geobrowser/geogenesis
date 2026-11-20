import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';
import type { SpaceChatRoom } from '~/core/space-chat/api';

import {
  CHANNEL_SETTINGS_COPY,
  ChannelSettingsDialog,
  changedSettings,
  channelSettingsError,
} from './channel-settings-dialog';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock('~/core/space-chat/channel-hooks', () => ({
  useSpaceChannelWrites: () => ({ create: mocks.create, update: mocks.update }),
}));

const general: SpaceChatRoom = {
  id: 'g',
  public_dao_space_id: 'p',
  space_id: 's',
  kind: 'member',
  key: 'k',
  name: 'general',
  description: '',
  read_policy: 'everyone',
  post_policy: 'members_and_editors',
  slow_mode: false,
  version: 0,
};
const markets: SpaceChatRoom = { ...general, id: 'm', kind: 'channel', name: 'markets' };
const ann = { id: 'ann', name: 'Ann', avatarUrl: null, avatarSeed: 'ann', profileLink: null };

beforeEach(() => {
  mocks.create.mockReset();
  mocks.update.mockReset();
});
afterEach(cleanup);

describe('changedSettings', () => {
  it('sends only what changed, and never the locked fields of #general and #editors', () => {
    const everything = {
      name: 'renamed',
      description: 'Hi',
      read_policy: 'invited',
      post_policy: 'editors_only',
      slow_mode: true,
    } as const;
    expect(changedSettings(general, everything)).toEqual({ description: 'Hi' });
    expect(changedSettings({ ...general, kind: 'editor', name: 'editors' }, everything)).toEqual({
      description: 'Hi',
      post_policy: 'editors_only',
      slow_mode: true,
    });
    expect(
      changedSettings(markets, {
        name: 'prices',
        description: '',
        read_policy: 'invited',
        post_policy: 'members_and_editors',
        slow_mode: false,
      })
    ).toEqual({ name: 'prices', read_policy: 'invited' });
  });
});

describe('channelSettingsError', () => {
  it('names the people who have not used chat yet', () => {
    const error = new GeoChatRequestError('x', 'unknown_users', 400, null, { user_ids: ['ann'] });
    expect(channelSettingsError(error, 'markets', [ann])).toBe(CHANNEL_SETTINGS_COPY.errors.unknownUsers('Ann'));
    expect(channelSettingsError(new GeoChatRequestError('x', 'channel_name_taken', 409), 'markets', [])).toBe(
      'There’s already a channel called #markets.'
    );
  });
});

describe('ChannelSettingsDialog', () => {
  it('creates a channel from a normalized name', async () => {
    mocks.create.mockResolvedValue({ ...markets, name: 'desk' });
    const onSaved = vi.fn();
    render(<ChannelSettingsDialog spaceId="s" open onOpenChange={() => {}} candidates={[ann]} onSaved={onSaved} />);
    expect(screen.getByText(CHANNEL_SETTINGS_COPY.description)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(CHANNEL_SETTINGS_COPY.namePlaceholder), {
      target: { value: 'Desk Talk' },
    });
    expect(screen.getByPlaceholderText(CHANNEL_SETTINGS_COPY.namePlaceholder)).toHaveValue('desk-talk');
    expect(screen.queryByText(CHANNEL_SETTINGS_COPY.invitedOnly)).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: CHANNEL_SETTINGS_COPY.create }));
    });
    expect(mocks.create).toHaveBeenCalledWith(
      {
        name: 'desk-talk',
        description: '',
        read_policy: 'everyone',
        post_policy: 'members_and_editors',
        slow_mode: false,
      },
      []
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('locks the name and offers no Archive for #general', () => {
    render(<ChannelSettingsDialog spaceId="s" open onOpenChange={() => {}} room={general} candidates={[]} />);
    expect(screen.getByText('# general settings')).toBeInTheDocument();
    expect(screen.getByDisplayValue('general')).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Slow mode/ })).toBeDisabled();
    expect(screen.getByText(CHANNEL_SETTINGS_COPY.locked('general', true))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CHANNEL_SETTINGS_COPY.archive })).not.toBeInTheDocument();
  });

  it('offers no Archive for #editors, and leaves its posting and slow mode open', () => {
    const editors: SpaceChatRoom = { ...general, kind: 'editor', name: 'editors' };
    render(<ChannelSettingsDialog spaceId="s" open onOpenChange={() => {}} room={editors} candidates={[]} />);
    expect(screen.queryByRole('button', { name: CHANNEL_SETTINGS_COPY.archive })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Slow mode/ })).toBeEnabled();
  });

  it('archives another channel after a confirm, and shows a refusal', async () => {
    mocks.update.mockRejectedValue(new GeoChatRequestError('x', 'forbidden', 403));
    render(<ChannelSettingsDialog spaceId="s" open onOpenChange={() => {}} room={markets} candidates={[]} />);
    fireEvent.click(screen.getByRole('button', { name: CHANNEL_SETTINGS_COPY.archive }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByText(CHANNEL_SETTINGS_COPY.confirmArchive('markets'))).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: CHANNEL_SETTINGS_COPY.archive }));
    });
    expect(mocks.update).toHaveBeenCalledWith('m', { archived: true });
    expect(screen.getByRole('alert')).toHaveTextContent(CHANNEL_SETTINGS_COPY.errors.forbidden);
  });

  it('toggles slow mode and saves only that', async () => {
    mocks.update.mockResolvedValue({ ...markets, slow_mode: true });
    render(<ChannelSettingsDialog spaceId="s" open onOpenChange={() => {}} room={markets} candidates={[]} />);
    fireEvent.click(screen.getByRole('switch', { name: /Slow mode/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: CHANNEL_SETTINGS_COPY.save }));
    });
    expect(mocks.update).toHaveBeenCalledWith('m', { slow_mode: true });
  });
});
