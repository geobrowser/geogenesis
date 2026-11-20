'use client';

import * as React from 'react';

import { GeoChatRequestError } from '~/core/debates/api';
import type { SpaceChatRoom } from '~/core/space-chat/api';
import { useSpaceChannelMembers } from '~/core/space-chat/channel-hooks';
import { channelName } from '~/core/space-chat/channels';
import { type ChatPerson, unknownPerson, useChatPeople } from '~/core/space-chat/people';
import { normId } from '~/core/utils/norm-id';

import { Avatar } from '~/design-system/avatar';
import { DIALOG_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';

import { ChannelDialog, PeopleField } from './channel-dialog';
import { channelSettingsError } from './channel-settings-dialog';
import type { ChatViewPerson } from './types';

export const CHANNEL_PEOPLE_COPY = {
  title: (name: string) => `People in # ${name}`,
  description: 'Private channel. Only these people can see it.',
  editors: 'Editors',
  editorsDetail: 'Every editor of the space',
  loading: 'Loading people…',
  failed: 'Couldn’t load the people in this channel.',
  none: 'No one has been added yet.',
  you: '(you)',
  remove: 'Remove',
  leave: 'Leave channel',
  add: 'Add',
  addLabel: 'Add people',
  memberLimit: 'This channel has 500 people, the most it can have.',
  failedChange: 'Couldn’t change who is in the channel. Try again.',
} as const;

/** "People in # name" for an invited channel (GEO-3818): editors add and remove, anyone else may leave. */
export function ChannelPeopleDialog({
  open,
  onOpenChange,
  room,
  canManage,
  viewerId,
  candidates,
  onLeft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: SpaceChatRoom;
  canManage: boolean;
  viewerId: string | null;
  /** The space's editors and members, to add. */
  candidates: ChatPerson[];
  /** After the viewer leaves. */
  onLeft?: () => void;
}) {
  const members = useSpaceChannelMembers(room.id, open);
  const ids = React.useMemo(() => (members.data ?? []).map(member => normId(member.user_id)), [members.data]);
  const people = useChatPeople(ids, candidates);
  const [adding, setAdding] = React.useState<ChatViewPerson[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const self = viewerId ? normId(viewerId) : null;

  const change = async (userIds: string[], added: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await members.change(userIds, added);
      if (added) setAdding([]);
      if (!added && self && userIds.includes(self) && !canManage) {
        onOpenChange(false);
        onLeft?.();
      }
    } catch (cause) {
      setError(
        cause instanceof GeoChatRequestError && cause.code === 'channel_member_limit_reached'
          ? CHANNEL_PEOPLE_COPY.memberLimit
          : cause instanceof GeoChatRequestError && cause.code === 'unknown_users'
            ? channelSettingsError(cause, channelName(room), candidates)
            : CHANNEL_PEOPLE_COPY.failedChange
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChannelDialog
      open={open}
      onOpenChange={onOpenChange}
      title={CHANNEL_PEOPLE_COPY.title(channelName(room))}
      description={CHANNEL_PEOPLE_COPY.description}
    >
      {canManage ? (
        <div className="flex flex-col gap-2">
          <PeopleField
            label={CHANNEL_PEOPLE_COPY.addLabel}
            candidates={candidates}
            picked={adding}
            onChange={setAdding}
            exclude={ids}
          />
          {adding.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void change(
                  adding.map(person => person.id),
                  true
                )
              }
              className={`${DIALOG_ACTION_BUTTON_CLASS_NAME} w-auto! self-end`}
            >
              {CHANNEL_PEOPLE_COPY.add}
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="text-footnote text-red-01" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-grey-02">
        <li className="flex items-center justify-between py-2">
          <span className="text-metadata text-text">{CHANNEL_PEOPLE_COPY.editors}</span>
          <span className="text-footnote text-grey-04">{CHANNEL_PEOPLE_COPY.editorsDetail}</span>
        </li>
        {members.isLoading ? (
          <li className="py-2 text-footnote text-grey-04">{CHANNEL_PEOPLE_COPY.loading}</li>
        ) : members.isError ? (
          <li className="py-2 text-footnote text-grey-04">{CHANNEL_PEOPLE_COPY.failed}</li>
        ) : ids.length === 0 ? (
          <li className="py-2 text-footnote text-grey-04">{CHANNEL_PEOPLE_COPY.none}</li>
        ) : (
          ids.map(id => {
            const person = people.get(id) ?? unknownPerson(id);
            const isSelf = id === self;
            return (
              <li key={id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="block size-6 shrink-0 overflow-hidden rounded-full">
                    <Avatar avatarUrl={person.avatarUrl} value={person.avatarSeed} size={24} />
                  </span>
                  <span className="truncate text-metadata text-text">
                    {person.name} {isSelf ? <span className="text-grey-04">{CHANNEL_PEOPLE_COPY.you}</span> : null}
                  </span>
                </span>
                {canManage || isSelf ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void change([id], false)}
                    className="shrink-0 rounded px-2 py-0.5 text-footnoteMedium text-grey-04 hover:bg-grey-01 hover:text-text disabled:opacity-50"
                  >
                    {isSelf && !canManage ? CHANNEL_PEOPLE_COPY.leave : CHANNEL_PEOPLE_COPY.remove}
                  </button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </ChannelDialog>
  );
}
