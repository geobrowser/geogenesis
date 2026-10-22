'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateLobbyMember } from '../api';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { inDebateRequestLabel, movedToListenersLabel, personName } from './lobby-format';
import { useIsLobbyGuest } from './lobby-guest-hooks';
import { LobbyMemberActions, hasMemberActions } from './lobby-member-actions';
import { LobbyPersonName } from './lobby-people';
import { LobbyPopup } from './lobby-popup';
import { LobbyRequestDebate, canRequestLobbyMember } from './lobby-request-debate';
import { LobbyScheduleSection } from './lobby-schedule';
import type { LobbyPageView } from './lobby-view';

/**
 * The person trigger's analytics: a host opening someone they can act on keeps the old host
 * controls event; anyone else opens the person menu.
 */
export function personMenuAnalyticsAttributes(
  lobby: Pick<LobbyPageView, 'viewer'>,
  member: Pick<DebateLobbyMember, 'role' | 'creator'>,
  isSelf: boolean
) {
  return hasMemberActions(lobby, member, isSelf)
    ? debateActionAnalyticsAttributes('hub', 'Lobby host controls', 'open_lobby_host_controls')
    : debateActionAnalyticsAttributes('hub', 'Lobby person menu');
}

export function disagreeOnLabel(count: number) {
  return `You disagree on ${count} ${count === 1 ? 'claim' : 'claims'}`;
}

/**
 * Tapping a person (GEO-3131): who they are, Request a debate, and host controls for hosts. A
 * dropdown on desktop, a sheet on a phone. `children` is the trigger: the person's tile or chip.
 */
export function LobbyPersonMenu({
  lobby,
  member,
  isSelf,
  viewerId,
  micOn,
  disagreements,
  children,
  outsideLobby = false,
}: {
  outsideLobby?: boolean;
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  isSelf: boolean;
  viewerId: string | null;
  micOn?: boolean;
  /** Claims the viewer and this person disagree on, when known. */
  disagreements: number | null;
  children: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const name = personName(member);

  return (
    <LobbyPopup open={open} onOpenChange={setOpen} title={name} align="start" trigger={children}>
      <LobbyPersonCard
        lobby={lobby}
        member={member}
        isSelf={isSelf}
        viewerId={viewerId}
        outsideLobby={outsideLobby}
        micOn={micOn}
        disagreements={disagreements}
        onDone={() => setOpen(false)}
      />
    </LobbyPopup>
  );
}

export function LobbyPersonCard({
  lobby,
  member,
  isSelf,
  viewerId,
  micOn,
  disagreements,
  onDone,
  outsideLobby = false,
}: {
  outsideLobby?: boolean;
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  isSelf: boolean;
  viewerId: string | null;
  micOn?: boolean;
  disagreements: number | null;
  onDone: () => void;
}) {
  const name = personName(member);
  // A guest's tap is queued behind sign-up, so a guest has no id to check against.
  const guest = useIsLobbyGuest();
  const requestable = guest ? !member.in_debate && !member.stepped_out : canRequestLobbyMember(member, viewerId);
  const hostControls = !outsideLobby && hasMemberActions(lobby, member, isSelf);

  return (
    <div role="group" aria-label={name} className="flex flex-col gap-1" data-testid="lobby-person-card">
      <div className="flex items-center gap-2.5 px-1.5 py-2">
        <span className="size-8 shrink-0 overflow-hidden rounded-full md:size-10 [&>svg]:size-full">
          <Avatar avatarUrl={member.avatar_cid} value={member.profile_space_id} alt="" size={40} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <LobbyPersonName person={member} interactionSurface="lobby_person_menu">
            <Text as="span" variant="metadataMedium" className="truncate md:text-bodySemibold">
              {name}
              {isSelf ? ' (you)' : ''}
            </Text>
          </LobbyPersonName>
          {disagreements !== null && !isSelf ? (
            <Text as="p" variant="footnote" color="grey-04">
              {disagreeOnLabel(disagreements)}
            </Text>
          ) : null}
          {member.moved_to_listeners ? (
            <Text as="p" variant="footnote" color="grey-04">
              {movedToListenersLabel(member.moved_to_listeners)}
            </Text>
          ) : null}
        </div>
      </div>
      {requestable ? (
        <div className="px-1.5 pb-1.5">
          <LobbyRequestDebate lobbyId={lobby.lobby_id} member={member} />
        </div>
      ) : member.in_debate && !isSelf ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-1.5 pb-1.5">
          {inDebateRequestLabel(member)}
        </Text>
      ) : null}
      {!isSelf && (guest || viewerId !== null) ? (
        <LobbyScheduleSection member={member} disagreements={disagreements} />
      ) : null}
      {hostControls ? (
        <>
          <div aria-hidden className="my-0.5 h-px bg-grey-01" />
          <LobbyMemberActions lobby={lobby} member={member} isSelf={isSelf} micOn={micOn} onDone={onDone} />
        </>
      ) : null}
    </div>
  );
}
