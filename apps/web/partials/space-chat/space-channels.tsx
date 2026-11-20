'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { useDebateGatewayScope, useSpaceChatRoomRevoked } from '~/core/debates/debate-gateway';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import type { SpaceChatRoom } from '~/core/space-chat/api';
import {
  GENERAL_CHANNEL,
  channelName,
  findChannel,
  isPrivateChannel,
  permissionsLine,
  postPolicy,
  readPolicy,
  sortChannels,
  unreadLabel,
} from '~/core/space-chat/channels';
import { useSpaceChatRooms } from '~/core/space-chat/hooks';
import { useSpaceChatParticipants } from '~/core/space-chat/people';
import { spaceChannelPath } from '~/core/space-chat/routes';

import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { CogSmall } from '~/design-system/icons/cog-small';
import { Lock } from '~/design-system/icons/lock';
import { Plus } from '~/design-system/icons/plus';
import { Menu, MenuItem } from '~/design-system/menu';

import { ChannelPeopleDialog } from './channel-people-dialog';
import { ChannelSettingsDialog } from './channel-settings-dialog';
import { SPACE_CHAT_COPY, SpaceChatPanel } from './space-chat-panel';

export const SPACE_CHANNELS_COPY = {
  channels: 'Channels',
  newChannel: 'New channel',
  settings: 'Settings',
  people: 'People',
  archived: 'Archived',
  loading: 'Loading channels…',
  failed: 'Could not load the channels.',
  retry: 'Try again',
  notFound: (name: string) => `There’s no #${name} channel here, or you can’t see it.`,
  goToGeneral: 'Go to #general',
  lostAccess: (name: string) => `You no longer have access to # ${name}.`,
  left: (name: string) => `You left # ${name}.`,
  dismiss: 'Dismiss',
  unread: (label: string) => `${label} unread`,
} as const;

const NOTICE_MS = 8_000;

/** The route's channel name; #general without one. */
function useRouteChannel() {
  const params = useParams<{ channel?: string | string[] }>();
  const raw = Array.isArray(params?.channel) ? params.channel[0] : params?.channel;
  return raw ? decodeURIComponent(raw).toLowerCase() : GENERAL_CHANNEL;
}

type DialogState = { kind: 'new' } | { kind: 'settings' } | { kind: 'people' } | null;

/** The Chat tab with channels (GEO-3818): a channel list on desktop, a channel menu on phones. */
export function SpaceChannels({ spaceId }: { spaceId: string }) {
  const wanted = useRouteChannel();
  const router = useRouter();
  const { authenticated } = useGeoChatAuth();
  const viewerId = useCurrentGeoChatUserId();
  const rooms = useSpaceChatRooms(spaceId, true, { includeArchived: true });
  // `space.channels_changed` arrives on the signed-in space scope.
  useDebateGatewayScope({ scope: 'space', space_id: spaceId }, authenticated);
  const participants = useSpaceChatParticipants(spaceId, true);

  const all = rooms.data?.rooms;
  const listed = React.useMemo(() => sortChannels((all ?? []).filter(room => !room.archived)), [all]);
  const current = React.useMemo(() => (all ? findChannel(all, wanted) : null), [all, wanted]);
  const canManage = rooms.data?.canManageChannels === true;

  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Losing a channel: geo-chat revokes the subscription, or the re-read list no longer has it.
  const [shown, setShown] = React.useState<{ id: string; name: string } | null>(null);
  React.useEffect(() => {
    if (current) setShown({ id: current.id, name: channelName(current) });
  }, [current]);
  const revoked = useSpaceChatRoomRevoked(current?.id ?? shown?.id ?? null, authenticated);
  // Renamed while open: follow it to its new name.
  const renamed = current === null && shown?.name === wanted ? all?.find(room => room.id === shown.id) : undefined;
  React.useEffect(() => {
    if (renamed) router.replace(spaceChannelPath(spaceId, channelName(renamed)));
  }, [renamed, router, spaceId]);
  const vanished = rooms.isSuccess && !rooms.isFetching && current === null && !renamed && shown?.name === wanted;
  const lost = wanted !== GENERAL_CHANNEL && (revoked || vanished);
  React.useEffect(() => {
    if (!lost) return;
    setNotice(SPACE_CHANNELS_COPY.lostAccess(wanted));
    setShown(null);
    setDialog(null);
    router.replace(spaceChannelPath(spaceId, GENERAL_CHANNEL));
  }, [lost, router, spaceId, wanted]);

  if (rooms.data?.supported === false) {
    return <p className="px-4 py-8 text-center text-metadata text-grey-04">{SPACE_CHAT_COPY.unavailable}</p>;
  }

  const name = current ? channelName(current) : wanted;
  const openNew = () => setDialog({ kind: 'new' });
  const invited = current !== null && readPolicy(current) === 'invited';

  const title = (
    <>
      <span className="inline-flex items-center gap-1.5 mobile:hidden">
        <ChannelTitle room={current} name={name} />
      </span>
      <span className="hidden mobile:inline-flex">
        <ChannelMenu
          spaceId={spaceId}
          channels={listed}
          current={current}
          name={name}
          canManage={canManage}
          onNewChannel={openNew}
        />
      </span>
    </>
  );
  const actions =
    current && (canManage || invited) ? (
      <>
        {invited ? (
          <HeaderButton onClick={() => setDialog({ kind: 'people' })}>{SPACE_CHANNELS_COPY.people}</HeaderButton>
        ) : null}
        {canManage ? (
          <HeaderButton onClick={() => setDialog({ kind: 'settings' })} icon={<CogSmall />}>
            {SPACE_CHANNELS_COPY.settings}
          </HeaderButton>
        ) : null}
      </>
    ) : null;

  return (
    <div className="flex h-[min(70dvh,720px)] min-h-80 flex-col overflow-hidden rounded-lg border border-grey-02 bg-white">
      {notice ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b border-grey-02 bg-grey-01 px-3 py-2 text-footnote text-text"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-grey-04 hover:text-text">
            {SPACE_CHANNELS_COPY.dismiss}
          </button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <ChannelList
          spaceId={spaceId}
          channels={listed}
          current={current}
          canManage={canManage}
          onNewChannel={openNew}
        />
        {current ? (
          <SpaceChatPanel
            // A channel's composer, cooldown and reply start fresh.
            key={current.id}
            spaceId={spaceId}
            channel={current}
            title={title}
            subtitle={permissionsLine(readPolicy(current), postPolicy(current))}
            actions={actions}
            className="min-h-0 min-w-0 flex-1"
          />
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-grey-02 px-3 py-2 text-metadataMedium text-text">{title}</div>
            <ChannelStatus
              loading={!all && !rooms.isError}
              failed={!all && rooms.isError}
              onRetry={() => void rooms.refetch()}
              missing={all !== undefined && !lost ? wanted : null}
              spaceId={spaceId}
            />
          </div>
        )}
      </div>
      <ChannelSettingsDialog
        spaceId={spaceId}
        open={dialog?.kind === 'new' || dialog?.kind === 'settings'}
        onOpenChange={open => !open && setDialog(null)}
        room={dialog?.kind === 'settings' ? current : null}
        candidates={participants}
        onSaved={room => {
          const saved = channelName(room);
          if (!room.archived && saved !== wanted) router.push(spaceChannelPath(spaceId, saved));
          if (room.archived) router.push(spaceChannelPath(spaceId, GENERAL_CHANNEL));
        }}
        onManagePeople={() => setDialog({ kind: 'people' })}
      />
      {current && invited ? (
        <ChannelPeopleDialog
          open={dialog?.kind === 'people'}
          onOpenChange={open => !open && setDialog(null)}
          room={current}
          canManage={canManage}
          viewerId={viewerId}
          candidates={participants}
          onLeft={() => {
            setShown(null);
            setNotice(SPACE_CHANNELS_COPY.left(name));
            router.replace(spaceChannelPath(spaceId, GENERAL_CHANNEL));
          }}
        />
      ) : null}
    </div>
  );
}

function ChannelTitle({ room, name }: { room: SpaceChatRoom | null; name: string }) {
  return (
    <>
      <span className="truncate"># {name}</span>
      {room && isPrivateChannel(room) ? <Lock color="grey-04" /> : null}
      {room?.archived ? (
        <span className="rounded bg-grey-01 px-1.5 py-0.5 text-footnoteMedium text-grey-04">
          {SPACE_CHANNELS_COPY.archived}
        </span>
      ) : null}
    </>
  );
}

function HeaderButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-grey-02 px-2.5 py-1 text-footnoteMedium text-text hover:bg-grey-01"
    >
      {icon}
      {children}
    </button>
  );
}

function ChannelList({
  spaceId,
  channels,
  current,
  canManage,
  onNewChannel,
}: {
  spaceId: string;
  channels: SpaceChatRoom[];
  current: SpaceChatRoom | null;
  canManage: boolean;
  onNewChannel: () => void;
}) {
  return (
    <nav
      aria-label={SPACE_CHANNELS_COPY.channels}
      className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-grey-02 p-2 mobile:hidden"
    >
      <div className="flex items-center justify-between px-2 pt-1 pb-2">
        <span className="text-footnoteMedium text-grey-04">{SPACE_CHANNELS_COPY.channels}</span>
        {canManage ? (
          <button
            type="button"
            onClick={onNewChannel}
            aria-label={SPACE_CHANNELS_COPY.newChannel}
            title={SPACE_CHANNELS_COPY.newChannel}
            className="flex size-6 items-center justify-center rounded text-grey-04 hover:bg-grey-01 hover:text-text [&_svg]:size-2.5"
          >
            <Plus />
          </button>
        ) : null}
      </div>
      {channels.map(room => {
        const selected = current !== null && current.id === room.id;
        const unread = selected ? null : unreadLabel(room.unread_count);
        return (
          <Link
            key={room.id}
            href={spaceChannelPath(spaceId, channelName(room))}
            aria-current={selected ? 'page' : undefined}
            className={cx(
              'flex items-center justify-between gap-2 rounded px-2 py-1.5 text-metadata',
              selected ? 'bg-grey-01 text-text' : 'text-grey-04 hover:bg-grey-01 hover:text-text',
              unread && 'text-text'
            )}
          >
            <span className="min-w-0">
              <span className={cx('block truncate', unread && 'font-medium')}># {channelName(room)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {isPrivateChannel(room) ? <Lock color="grey-04" /> : null}
              {unread ? (
                <span
                  aria-label={SPACE_CHANNELS_COPY.unread(unread)}
                  className="min-w-5 rounded-full bg-text px-1.5 text-center text-footnoteMedium text-white"
                >
                  {unread}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function ChannelMenu({
  spaceId,
  channels,
  current,
  name,
  canManage,
  onNewChannel,
}: {
  spaceId: string;
  channels: SpaceChatRoom[];
  current: SpaceChatRoom | null;
  name: string;
  canManage: boolean;
  onNewChannel: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      align="start"
      asChild
      trigger={
        <button
          type="button"
          aria-label={`${SPACE_CHANNELS_COPY.channels}: # ${name}`}
          className="flex items-center gap-1.5 text-metadataMedium text-text"
        >
          <ChannelTitle room={current} name={name} />
          <ChevronDownSmall color="grey-04" />
        </button>
      }
    >
      <div className="px-3 pt-2 pb-1 text-footnoteMedium text-grey-04">{SPACE_CHANNELS_COPY.channels}</div>
      {channels.map(room => {
        const selected = current !== null && current.id === room.id;
        const unread = selected ? null : unreadLabel(room.unread_count);
        return (
          <MenuItem
            key={room.id}
            href={spaceChannelPath(spaceId, channelName(room))}
            active={selected}
            onClick={() => setOpen(false)}
          >
            <span className="min-w-0 flex-1 truncate"># {channelName(room)}</span>
            {isPrivateChannel(room) ? <Lock color="grey-04" /> : null}
            {unread ? (
              <span className="rounded-full bg-text px-1.5 text-footnoteMedium text-white">{unread}</span>
            ) : null}
            {selected ? <Check /> : null}
          </MenuItem>
        );
      })}
      {canManage ? (
        <>
          <div className="my-1 h-px bg-grey-02" />
          <MenuItem
            onClick={() => {
              setOpen(false);
              onNewChannel();
            }}
          >
            <span className="flex size-4 items-center justify-center [&_svg]:size-2.5">
              <Plus />
            </span>
            {SPACE_CHANNELS_COPY.newChannel}
          </MenuItem>
        </>
      ) : null}
    </Menu>
  );
}

function ChannelStatus({
  loading,
  failed,
  onRetry,
  missing,
  spaceId,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  missing: string | null;
  spaceId: string;
}) {
  return (
    <div className="flex min-h-24 flex-1 items-center justify-center px-4 text-center text-metadata text-grey-04">
      {loading ? (
        <p>{SPACE_CHANNELS_COPY.loading}</p>
      ) : failed ? (
        <p>
          {SPACE_CHANNELS_COPY.failed}
          <button type="button" onClick={onRetry} className="ml-2 text-text underline">
            {SPACE_CHANNELS_COPY.retry}
          </button>
        </p>
      ) : missing ? (
        <p>
          {SPACE_CHANNELS_COPY.notFound(missing)}{' '}
          <Link href={spaceChannelPath(spaceId, GENERAL_CHANNEL)} className="text-text underline">
            {SPACE_CHANNELS_COPY.goToGeneral}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
