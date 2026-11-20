'use client';

import * as React from 'react';

import { GeoChatRequestError } from '~/core/debates/api';
import type {
  SpaceChannelPostPolicy,
  SpaceChannelReadPolicy,
  SpaceChannelSettings,
  SpaceChatRoom,
} from '~/core/space-chat/api';
import { useSpaceChannelWrites } from '~/core/space-chat/channel-hooks';
import {
  CHANNEL_DESCRIPTION_MAX,
  CHANNEL_POLICY_COPY,
  type LockedChannelSetting,
  canArchiveChannel,
  channelName,
  isValidChannelName,
  lockedChannelSettings,
  normalizeChannelName,
  postPolicy,
  readPolicy,
} from '~/core/space-chat/channels';
import { normId } from '~/core/utils/norm-id';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Input } from '~/design-system/input';
import { Select } from '~/design-system/select';
import { Toggle } from '~/design-system/toggle';

import { ChannelDialog, PeopleField } from './channel-dialog';
import type { ChatViewPerson } from './types';

export const CHANNEL_SETTINGS_COPY = {
  newTitle: 'New channel',
  settingsTitle: (name: string) => `# ${name} settings`,
  description: 'Only editors create and change channels.',
  name: 'Name',
  namePlaceholder: 'defi',
  about: 'Description',
  aboutPlaceholder: 'What it’s for',
  read: 'Who can read',
  post: 'Who can post',
  invitedOnly: 'Only invited people can find, read and post in this channel. Editors can add people later.',
  managePeople: 'Manage people',
  slowMode: 'Slow mode',
  slowModeDetail: 'One message every 10 seconds per person',
  locked: (name: string, all: boolean) =>
    all
      ? `Only the description of # ${name} can change.`
      : `The name and who can read # ${name} can’t change, and it can’t be archived.`,
  archive: 'Archive',
  confirmArchive: (name: string) => `Archive # ${name}? It disappears from the list and no one can post.`,
  restore: 'Restore',
  cancel: 'Cancel',
  create: 'Create channel',
  save: 'Save',
  saving: 'Saving…',
  errors: {
    nameTaken: (name: string) => `There’s already a channel called #${name}.`,
    nameInvalid: 'Use letters, numbers and dashes, starting with a letter or number.',
    limit: 'This space has 50 channels, the most it can have. Archive one first.',
    locked: 'That setting can’t change for this channel.',
    unknownUsers: (names: string) => `These people haven’t used chat yet, so they can’t be added: ${names}.`,
    forbidden: 'Only editors create and change channels.',
    failed: 'Couldn’t save the channel. Try again.',
  },
} as const;

const READ_POLICIES: SpaceChannelReadPolicy[] = ['everyone', 'members_and_editors', 'editors_only', 'invited'];
const POST_POLICIES: SpaceChannelPostPolicy[] = ['members_and_editors', 'editors_only', 'everyone_signed_in'];

type Props = {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edits this channel; a new one when absent. */
  room?: SpaceChatRoom | null;
  /** The space's editors and members, to invite. */
  candidates: ChatViewPerson[];
  /** After a create, a rename, an archive or a restore. */
  onSaved?: (room: SpaceChatRoom) => void;
  /** Opens the people dialog of an invited channel. */
  onManagePeople?: () => void;
};

export function ChannelSettingsDialog({
  spaceId,
  open,
  onOpenChange,
  room = null,
  candidates,
  onSaved,
  onManagePeople,
}: Props) {
  return (
    <ChannelDialog
      open={open}
      onOpenChange={onOpenChange}
      title={room ? CHANNEL_SETTINGS_COPY.settingsTitle(channelName(room)) : CHANNEL_SETTINGS_COPY.newTitle}
      description={CHANNEL_SETTINGS_COPY.description}
    >
      {/* Keyed so each opening starts from the channel as it is now. */}
      {open ? (
        <ChannelSettingsForm
          key={room ? `${room.id}:${room.version ?? 0}` : 'new'}
          spaceId={spaceId}
          room={room}
          candidates={candidates}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
          onManagePeople={onManagePeople}
        />
      ) : null}
    </ChannelDialog>
  );
}

function initialSettings(room: SpaceChatRoom | null): SpaceChannelSettings {
  return room
    ? {
        name: channelName(room),
        description: room.description ?? '',
        read_policy: readPolicy(room),
        post_policy: postPolicy(room),
        slow_mode: room.slow_mode === true,
      }
    : { name: '', description: '', read_policy: 'everyone', post_policy: 'members_and_editors', slow_mode: false };
}

/** Only the fields that changed, never the locked ones of #general and #editors. */
export function changedSettings(room: SpaceChatRoom, next: SpaceChannelSettings): Partial<SpaceChannelSettings> {
  const before = initialSettings(room);
  const locked = lockedChannelSettings(room);
  const patch: Partial<SpaceChannelSettings> = {};
  if (!locked.has('name') && next.name !== before.name) patch.name = next.name;
  if (next.description !== before.description) patch.description = next.description;
  if (!locked.has('read_policy') && next.read_policy !== before.read_policy) patch.read_policy = next.read_policy;
  if (!locked.has('post_policy') && next.post_policy !== before.post_policy) patch.post_policy = next.post_policy;
  if (!locked.has('slow_mode') && next.slow_mode !== before.slow_mode) patch.slow_mode = next.slow_mode;
  return patch;
}

export function channelSettingsError(error: unknown, name: string, candidates: ChatViewPerson[]): string {
  const copy = CHANNEL_SETTINGS_COPY.errors;
  if (!(error instanceof GeoChatRequestError)) return copy.failed;
  switch (error.code) {
    case 'channel_name_taken':
      return copy.nameTaken(name);
    case 'invalid_channel_name':
      return copy.nameInvalid;
    case 'channel_limit_reached':
      return copy.limit;
    case 'channel_setting_locked':
      return copy.locked;
    case 'forbidden':
      return copy.forbidden;
    case 'unknown_users': {
      const ids = Array.isArray(error.details?.user_ids) ? (error.details.user_ids as unknown[]) : [];
      const names = ids
        .filter((id): id is string => typeof id === 'string')
        .map(id => candidates.find(person => person.id === normId(id))?.name ?? 'someone');
      return copy.unknownUsers(names.join(', ') || 'someone');
    }
    default:
      return copy.failed;
  }
}

function ChannelSettingsForm({
  spaceId,
  room,
  candidates,
  onClose,
  onSaved,
  onManagePeople,
}: {
  spaceId: string;
  room: SpaceChatRoom | null;
  candidates: ChatViewPerson[];
  onClose: () => void;
  onSaved?: (room: SpaceChatRoom) => void;
  onManagePeople?: () => void;
}) {
  const writes = useSpaceChannelWrites(spaceId);
  const [settings, setSettings] = React.useState(() => initialSettings(room));
  const [invited, setInvited] = React.useState<ChatViewPerson[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const locked = room ? lockedChannelSettings(room) : new Set<LockedChannelSetting>();
  const archived = room?.archived === true;
  const set = <K extends keyof SpaceChannelSettings>(key: K, value: SpaceChannelSettings[K]) =>
    setSettings(current => ({ ...current, [key]: value }));
  const nameValid = isValidChannelName(settings.name);

  const run = async (write: () => Promise<SpaceChatRoom>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await write();
      onSaved?.(saved);
      onClose();
    } catch (cause) {
      setError(channelSettingsError(cause, settings.name, candidates));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!nameValid) return setError(CHANNEL_SETTINGS_COPY.errors.nameInvalid);
    if (!room) {
      return void run(() =>
        writes.create(
          settings,
          invited.map(person => person.id)
        )
      );
    }
    const patch = changedSettings(room, settings);
    if (Object.keys(patch).length === 0) return onClose();
    void run(() => writes.update(room.id, patch));
  };

  const fieldLabel = 'text-footnoteMedium text-grey-04';
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault();
        save();
      }}
    >
      <div className="grid grid-cols-2 gap-3 mobile:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{CHANNEL_SETTINGS_COPY.name}</span>
          <Input
            value={settings.name}
            onChange={event => set('name', normalizeChannelName(event.target.value))}
            placeholder={CHANNEL_SETTINGS_COPY.namePlaceholder}
            disabled={locked.has('name') || archived}
            maxLength={32}
            autoFocus={!room}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{CHANNEL_SETTINGS_COPY.about}</span>
          <Input
            value={settings.description}
            onChange={event => set('description', event.target.value.slice(0, CHANNEL_DESCRIPTION_MAX))}
            placeholder={CHANNEL_SETTINGS_COPY.aboutPlaceholder}
            disabled={archived}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 mobile:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{CHANNEL_SETTINGS_COPY.read}</span>
          <Select
            value={settings.read_policy}
            onChange={value => set('read_policy', value as SpaceChannelReadPolicy)}
            options={READ_POLICIES.map(value => ({ value, label: CHANNEL_POLICY_COPY.read[value] }))}
            disabled={locked.has('read_policy') || archived}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{CHANNEL_SETTINGS_COPY.post}</span>
          <Select
            value={settings.post_policy}
            onChange={value => set('post_policy', value as SpaceChannelPostPolicy)}
            options={POST_POLICIES.map(value => ({ value, label: CHANNEL_POLICY_COPY.post[value] }))}
            disabled={locked.has('post_policy') || archived}
          />
        </div>
      </div>
      {room && locked.size > 0 ? (
        <p className="text-footnote text-grey-04">
          {CHANNEL_SETTINGS_COPY.locked(channelName(room), locked.has('post_policy'))}
        </p>
      ) : null}
      {settings.read_policy === 'invited' ? (
        <div className="flex flex-col gap-2">
          {room ? (
            readPolicy(room) === 'invited' && onManagePeople ? (
              <button
                type="button"
                onClick={onManagePeople}
                className="self-start text-metadataMedium text-text underline"
              >
                {CHANNEL_SETTINGS_COPY.managePeople}
              </button>
            ) : null
          ) : (
            <PeopleField candidates={candidates} picked={invited} onChange={setInvited} />
          )}
          <p className="text-footnote text-grey-04">{CHANNEL_SETTINGS_COPY.invitedOnly}</p>
        </div>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={settings.slow_mode}
        disabled={locked.has('slow_mode') || archived}
        onClick={() => set('slow_mode', !settings.slow_mode)}
        className="flex items-center justify-between gap-4 border-t border-grey-02 pt-3 text-left disabled:opacity-50"
      >
        <span>
          <span className="block text-metadata text-text">{CHANNEL_SETTINGS_COPY.slowMode}</span>
          <span className="block text-footnote text-grey-04">{CHANNEL_SETTINGS_COPY.slowModeDetail}</span>
        </span>
        <Toggle checked={settings.slow_mode} />
      </button>
      {error ? (
        <p className="text-footnote text-red-01" role="alert">
          {error}
        </p>
      ) : null}
      {confirmArchive && room ? (
        <p className="text-footnote text-text">{CHANNEL_SETTINGS_COPY.confirmArchive(channelName(room))}</p>
      ) : null}
      <div className="flex gap-2">
        {room && canArchiveChannel(room) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (archived) return void run(() => writes.update(room.id, { archived: false }));
              if (!confirmArchive) return setConfirmArchive(true);
              void run(() => writes.update(room.id, { archived: true }));
            }}
            className={`${DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME} ${archived ? '' : 'text-red-01!'}`}
          >
            {archived ? CHANNEL_SETTINGS_COPY.restore : CHANNEL_SETTINGS_COPY.archive}
          </button>
        ) : null}
        <button type="button" onClick={onClose} className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}>
          {CHANNEL_SETTINGS_COPY.cancel}
        </button>
        {archived ? null : (
          <button type="submit" disabled={busy || !nameValid} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
            {busy ? CHANNEL_SETTINGS_COPY.saving : room ? CHANNEL_SETTINGS_COPY.save : CHANNEL_SETTINGS_COPY.create}
          </button>
        )}
      </div>
    </form>
  );
}
