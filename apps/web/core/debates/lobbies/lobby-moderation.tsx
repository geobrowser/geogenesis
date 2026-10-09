'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { type DebateLobbyPerson, GeoChatRequestError } from '../api';
import { HubPillButton, hubPillClassName } from '../matchmaking/hub-pill-button';
import {
  lobbyErrorMessage,
  lobbyTimeLabel,
  moderationErrorMessage,
  moderationLogLabel,
  moderationNoticeText,
  personName,
  raisedHands,
  sinceLabel,
} from './lobby-format';
import { guestCountLabel } from './lobby-guest';
import { LobbyPersonName } from './lobby-people';
import type { LobbyMemberViewer, MemberLobbyPageView } from './lobby-view';
import {
  useLobbyBans,
  useLobbyHand,
  useLobbyModerationLog,
  useModerateLobbyMember,
  useRemoveLobbyGuests,
} from './moderation-hooks';

const MODERATION_NOTICE_MS = 10_000;

/**
 * What a host just did to the viewer, from `viewer.last_moderation`, for a few seconds. Only an
 * action newer than the first view counts, so an old one is not replayed on opening the page.
 */
export function useModerationNotice(viewer: Pick<LobbyMemberViewer, 'last_moderation'>) {
  const last = viewer.last_moderation ?? null;
  const seenRef = React.useRef<string | null | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    const seen = seenRef.current;
    seenRef.current = last?.at ?? seen ?? null;
    if (seen === undefined || !last) return;
    if (seen !== null && Date.parse(last.at) <= Date.parse(seen)) return;
    const text = moderationNoticeText(last.action);
    if (text) setNotice(text);
  }, [last]);

  React.useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), MODERATION_NOTICE_MS);
    return () => clearTimeout(timeout);
  }, [notice]);

  return notice;
}

/** Raise hand / Lower, for a listener who is in the lobby. */
export function LobbyHandControl({ lobby }: { lobby: Pick<MemberLobbyPageView, 'lobby_id' | 'viewer'> }) {
  const hand = useLobbyHand(lobby.lobby_id);
  const raised = Boolean(lobby.viewer.hand_raised_at);

  return (
    <div className="flex flex-col gap-1" data-testid="lobby-hand-control">
      <div className="flex flex-wrap items-center gap-2">
        {raised ? (
          <>
            <Text as="span" variant="metadata">
              Hand raised
            </Text>
            <HubPillButton
              analyticsLabel="Lobby lower hand"
              pending={hand.isPending}
              onClick={() => hand.mutate(false)}
            >
              Lower
            </HubPillButton>
          </>
        ) : (
          <HubPillButton
            variant="primary"
            analyticsLabel="Lobby raise hand"
            pending={hand.isPending}
            onClick={() => hand.mutate(true)}
          >
            Raise hand
          </HubPillButton>
        )}
      </div>
      <Text as="p" variant="footnote" color={hand.isError ? 'red-01' : 'grey-04'}>
        {hand.isError
          ? handErrorMessage(hand.error)
          : raised
            ? 'Hosts can see your hand.'
            : 'Raise your hand to ask to speak.'}
      </Text>
    </div>
  );
}

function handErrorMessage(error: unknown) {
  if (error instanceof GeoChatRequestError) {
    if (error.code === 'lobby_not_present') return 'Join the lobby to raise your hand.';
    if (error.code === 'lobby_stepped_out') return 'You stepped out. Go back to the room to raise your hand.';
  }
  return lobbyErrorMessage(error, 'Could not change your hand. Try again.');
}

type HostTab = 'hands' | 'banned' | 'log';

/**
 * Raised hands, the banned list and the log, for whoever is hosting now. Once the lobby has ended,
 * a host by role can still read the banned list and the log; nothing can change there.
 */
export function LobbyHostLists({ lobby }: { lobby: MemberLobbyPageView }) {
  const ended = lobby.access.status === 'closed';
  const [tab, setTab] = React.useState<HostTab>(ended ? 'banned' : 'hands');
  const hands = raisedHands(lobby.members);
  const bans = useLobbyBans(lobby.lobby_id, lobby.viewer.hosting || (ended && lobby.viewer.role === 'host'));
  const banned = bans.data ?? [];

  const tabs: { id: HostTab; label: string }[] = [
    ...(ended ? [] : [{ id: 'hands' as const, label: `Raised hands · ${hands.length}` }]),
    { id: 'banned', label: bans.data ? `Banned · ${banned.length}` : 'Banned' },
    { id: 'log', label: 'Log' },
  ];

  return (
    <section className="flex flex-col gap-2" aria-label="Host lists" data-testid="lobby-host-lists">
      {!ended && lobby.viewer.hosting ? <LobbyRemoveGuests lobby={lobby} /> : null}
      <div role="group" aria-label="Show" className="flex gap-4">
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cx('text-footnoteMedium', tab === item.id ? 'text-text' : 'text-grey-04 hover:text-text')}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-grey-02 bg-white">
        {tab === 'hands' ? (
          <RaisedHands lobby={lobby} hands={hands} />
        ) : tab === 'banned' ? (
          bans.isError ? (
            <EmptyRow>{moderationErrorMessage(bans.error, 'Could not load the banned list.')}</EmptyRow>
          ) : (
            <BannedList lobby={lobby} banned={banned} loading={bans.isPending} />
          )
        ) : (
          <ModerationLog lobbyId={lobby.lobby_id} />
        )}
      </div>
    </section>
  );
}

export const REMOVE_GUESTS_COPY = {
  action: 'Remove guests',
  confirm: (count: number) =>
    `Remove ${count === 1 ? 'the guest' : `all ${count} guests`} without an account? They stop hearing the room and can come back by signing in.`,
  done: 'Guests removed.',
} as const;

/** Removes every guest at once: guests are anonymous, so there is nobody to pick. */
function LobbyRemoveGuests({ lobby }: { lobby: MemberLobbyPageView }) {
  const remove = useRemoveLobbyGuests(lobby.lobby_id);
  const [confirming, setConfirming] = React.useState(false);
  const count = lobby.guest_count ?? 0;
  if (count === 0 && !remove.isSuccess) return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-grey-02 bg-white px-3 py-2"
      data-testid="lobby-remove-guests"
    >
      {confirming ? (
        <>
          <Text as="p" variant="metadata">
            {REMOVE_GUESTS_COPY.confirm(count)}
          </Text>
          <div className="flex flex-wrap gap-2">
            <HubPillButton
              variant="primary"
              analyticsLabel="Lobby remove guests confirm"
              pending={remove.isPending}
              pendingLabel="Removing…"
              onClick={() => remove.mutate(undefined, { onSuccess: () => setConfirming(false) })}
            >
              {REMOVE_GUESTS_COPY.action}
            </HubPillButton>
            <HubPillButton analyticsLabel="Lobby remove guests cancel" onClick={() => setConfirming(false)}>
              Cancel
            </HubPillButton>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <Text as="p" variant="footnote" color="grey-04" className="min-w-0 flex-1">
            {count > 0 ? `${count} ${guestCountLabel(count)}` : REMOVE_GUESTS_COPY.done}
          </Text>
          {count > 0 ? (
            <HubPillButton analyticsLabel="Lobby remove guests" onClick={() => setConfirming(true)}>
              {REMOVE_GUESTS_COPY.action}
            </HubPillButton>
          ) : null}
        </div>
      )}
      {remove.isError ? (
        <Text as="p" variant="footnote" color="red-01">
          {moderationErrorMessage(remove.error)}
        </Text>
      ) : null}
    </div>
  );
}

function RaisedHands({ lobby, hands }: { lobby: MemberLobbyPageView; hands: MemberLobbyPageView['members'] }) {
  const moderate = useModerateLobbyMember(lobby.lobby_id);
  if (hands.length === 0) return <EmptyRow>No hands raised.</EmptyRow>;

  return (
    <>
      <ul className="flex flex-col divide-y divide-grey-02">
        {hands.map(member => (
          <PersonRow
            key={member.user_id}
            person={member}
            detail={`Hand up ${sinceLabel(member.hand_raised_at!) ?? ''}`.trim()}
            action={
              <HubPillButton
                analyticsLabel="Lobby move to speakers from hands"
                pending={moderate.isPending && moderate.variables?.userId === member.user_id}
                disabled={moderate.isPending}
                onClick={() => moderate.mutate({ userId: member.user_id, action: 'move-to-speakers' })}
              >
                Move to speakers
              </HubPillButton>
            }
          />
        ))}
      </ul>
      {moderate.isError ? <ErrorRow>{moderationErrorMessage(moderate.error)}</ErrorRow> : null}
    </>
  );
}

function BannedList({
  lobby,
  banned,
  loading,
}: {
  lobby: MemberLobbyPageView;
  banned: NonNullable<ReturnType<typeof useLobbyBans>['data']>;
  loading: boolean;
}) {
  const moderate = useModerateLobbyMember(lobby.lobby_id);
  // Undoing a ban needs a host by role; the acting host only reads the list.
  const canUnban = lobby.viewer.role === 'host' && lobby.access.status === 'admitted';

  if (loading) return <EmptyRow>Loading…</EmptyRow>;

  return (
    <>
      {banned.length === 0 ? (
        <EmptyRow>Nobody is banned.</EmptyRow>
      ) : (
        <ul className="flex flex-col divide-y divide-grey-02">
          {banned.map(ban => (
            <PersonRow
              key={ban.user.user_id}
              person={ban.user}
              detail={[
                ban.banned_by ? `Banned by ${personName(ban.banned_by)}` : 'Banned',
                lobbyTimeLabel(ban.banned_at),
              ]
                .filter(Boolean)
                .join(' · ')}
              action={
                canUnban ? (
                  <HubPillButton
                    analyticsLabel="Lobby unban"
                    pending={moderate.isPending && moderate.variables?.userId === ban.user.user_id}
                    disabled={moderate.isPending}
                    onClick={() => moderate.mutate({ userId: ban.user.user_id, action: 'unban' })}
                  >
                    Unban
                  </HubPillButton>
                ) : null
              }
            />
          ))}
        </ul>
      )}
      {moderate.isError ? <ErrorRow>{moderationErrorMessage(moderate.error)}</ErrorRow> : null}
      <Text as="p" variant="footnote" color="grey-04" className="px-3 py-2">
        Bans apply to this lobby only.
      </Text>
    </>
  );
}

function ModerationLog({ lobbyId }: { lobbyId: string }) {
  const log = useLobbyModerationLog(lobbyId, true);
  if (log.isError) return <EmptyRow>{moderationErrorMessage(log.error, 'Could not load the log.')}</EmptyRow>;
  if (!log.data) return <EmptyRow>Loading…</EmptyRow>;
  if (log.data.length === 0) return <EmptyRow>Nothing yet.</EmptyRow>;

  return (
    <ul className="flex max-h-72 flex-col divide-y divide-grey-02 overflow-y-auto">
      {log.data.map(entry => (
        <li key={entry.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
          <Text as="span" variant="metadata" className="min-w-0">
            {moderationLogLabel(entry)}
          </Text>
          <Text as="span" variant="footnote" color="grey-04" className="shrink-0">
            {lobbyTimeLabel(entry.at)}
          </Text>
        </li>
      ))}
    </ul>
  );
}

function PersonRow({ person, detail, action }: { person: DebateLobbyPerson; detail: string; action: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} alt={personName(person)} size={32} />
      <div className="min-w-0 flex-1">
        <LobbyPersonName person={person} interactionSurface="lobby_host_list">
          <Text as="span" variant="metadataMedium">
            {personName(person)}
          </Text>
        </LobbyPersonName>
        <Text as="p" variant="footnote" color="grey-04">
          {detail}
        </Text>
      </div>
      {action}
    </li>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <Text as="p" variant="footnote" color="grey-04" className="px-3 py-3">
      {children}
    </Text>
  );
}

function ErrorRow({ children }: { children: React.ReactNode }) {
  return (
    <Text as="p" variant="footnote" color="red-01" className="px-3 py-2">
      {children}
    </Text>
  );
}

/** Removed, or unbanned since: say so and let them come back by choice. Never rejoins by itself. */
export function LobbyRemovedNotice({ onRejoin, unbanned = false }: { onRejoin: () => void; unbanned?: boolean }) {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex max-w-md flex-col gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        <Text as="h1" variant="bodySemibold">
          {unbanned ? 'A host lifted your ban' : 'A host removed you from this lobby'}
        </Text>
        <Text as="p" variant="metadata" color="grey-04">
          {unbanned ? 'Rejoin to come back.' : 'You can rejoin, but please follow the hosts’ lead.'}
        </Text>
        <div className="flex flex-wrap gap-2">
          <HubPillButton variant="primary" analyticsLabel="Lobby rejoin after removal" onClick={onRejoin}>
            Rejoin
          </HubPillButton>
          <Link href={NavUtils.toExplore()} className={hubPillClassName('secondary')}>
            Find a debate
          </Link>
        </div>
      </div>
    </div>
  );
}
