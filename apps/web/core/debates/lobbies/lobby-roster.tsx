'use client';

import type { TrackReference } from '@livekit/components-react';

import * as React from 'react';

import cx from 'classnames';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { type DebateLobbyClaims, type DebateLobbyMember, dashlessId } from '../api';
import { MicrophoneIcon } from '../debate-room-controls';
import { sameId } from '../rooms/room-presence';
import { LobbyDebatePairs } from './lobby-debate-pairs';
import { LobbyDisagreementsTrigger } from './lobby-disagreements';
import {
  type LobbyMemberStatus,
  SHORT_STATUS_LABEL,
  STATUS_LABEL,
  disagreementCount,
  inDebateLabel,
  isHosting,
  memberStatus,
  personName,
  rosterOrder,
} from './lobby-format';
import { LobbyGuestCount } from './lobby-guest';
import { LobbyPersonMenu, personMenuAnalyticsAttributes } from './lobby-person-menu';
import type { LobbyPageView } from './lobby-view';
import { useLobbyVoiceStates } from './lobby-voice';

export const LOBBY_ROSTER_COPY = {
  empty: 'Nobody’s here right now.',
  movedToListeners: 'moved to listeners',
  handRaised: 'hand raised',
} as const;

/** Hosts, the acting host and speakers; they are the ones voice lets publish. */
export function publishes(member: Pick<DebateLobbyMember, 'role' | 'acting_host'>) {
  return isHosting(member) || member.role === 'speaker';
}

/**
 * The People side (GEO-3131): debates in progress, speaker tiles, then who is listening. Anyone in
 * a pair card is left out of the tiles and chips below it.
 */
export function LobbyPeople({
  lobby,
  viewerId,
  ownAvailable,
  disagreements,
}: {
  lobby: LobbyPageView;
  viewerId: string | null;
  /** The viewer's own toggle, ahead of the roster's. */
  ownAvailable: boolean | undefined;
  disagreements: DebateLobbyClaims['disagreements'];
}) {
  const pairs = lobby.debate_pairs ?? [];
  const inPairs = new Set(pairs.flatMap(pair => pair.people.map(person => dashlessId(person.user_id))));
  const roster = rosterOrder(lobby.members).filter(member => !inPairs.has(dashlessId(member.user_id)));
  const speakers = roster.filter(publishes);
  const listeners = roster.filter(member => !publishes(member));
  const guests = lobby.guest_count ?? 0;

  if (lobby.members.length === 0 && guests === 0) {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        {LOBBY_ROSTER_COPY.empty}
      </Text>
    );
  }

  const personProps = (member: DebateLobbyMember) => {
    const isSelf = viewerId !== null && sameId(member.user_id, viewerId);
    return {
      lobby,
      member,
      isSelf,
      viewerId,
      status: memberStatus(member, isSelf ? ownAvailable : undefined),
      disagreements: isSelf ? null : disagreementCount(disagreements, member.user_id),
    };
  };

  return (
    <>
      <LobbyDebatePairs pairs={pairs} members={lobby.members} />
      {speakers.length > 0 ? (
        <section className="flex flex-col gap-2.5 md:gap-2" aria-label="Speakers">
          <SectionHeading>Speakers · {speakers.length}</SectionHeading>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 md:grid-cols-3 md:gap-2">
            {speakers.map(member => (
              <li key={member.user_id} className="min-w-0">
                <SpeakerTile {...personProps(member)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {listeners.length + guests > 0 ? (
        <section className="flex flex-col gap-2.5 md:gap-2" aria-label="Listening">
          <SectionHeading>Listening · {listeners.length + guests}</SectionHeading>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {listeners.map(member => (
              <li key={member.user_id} className="min-w-0">
                <ListenerChip {...personProps(member)} />
              </li>
            ))}
            {guests > 0 ? (
              <li>
                <LobbyGuestCount count={guests} />
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] leading-[22px] font-semibold text-text">{children}</h2>;
}

type PersonProps = {
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  isSelf: boolean;
  viewerId: string | null;
  status: LobbyMemberStatus | null;
  disagreements: number | null;
};

function SpeakerTile({ lobby, member, isSelf, viewerId, status, disagreements }: PersonProps) {
  const phone = useIsPhoneLayout();
  const voice = useLobbyVoiceStates();
  const voiceId = dashlessId(member.user_id);
  const speaking = voice.speaking.has(voiceId);
  // Mic state only means something in a room this tab is connected to.
  const showMic = voice.connected && !member.stepped_out;
  const micOn = voice.micOn.has(voiceId);
  // Someone stepped out is in a debate elsewhere; their lobby camera is gone or about to be.
  const camera = member.stepped_out ? undefined : voice.cameras.get(voiceId);
  const name = personName(member);
  const label = isSelf ? `${name} (you)` : name;

  // The person button stretches over the whole tile, so a press anywhere opens the person menu; the
  // disagreements trigger sits above it, beside the button rather than inside it.
  return (
    <div
      role="group"
      aria-label={label}
      data-testid="lobby-speaker-tile"
      data-speaking={speaking || undefined}
      className={cx(
        'relative flex w-full min-w-0 flex-col items-center gap-2 rounded-xl border bg-white px-3 py-4 text-center transition-colors hover:border-grey-03 has-[[data-person-trigger][data-state=open]]:border-text md:gap-1 md:px-1.5 md:py-2.5',
        speaking ? 'border-green' : 'border-grey-02'
      )}
    >
      <LobbyPersonMenu
        lobby={lobby}
        member={member}
        isSelf={isSelf}
        viewerId={viewerId}
        micOn={showMic ? micOn : undefined}
        disagreements={disagreements}
      >
        <button
          type="button"
          aria-label={label}
          {...personMenuAnalyticsAttributes(lobby, member, isSelf)}
          data-person-trigger
          className="flex w-full min-w-0 flex-col items-center gap-2 after:absolute after:inset-0 after:rounded-xl md:gap-1"
        >
          <span
            className={cx(
              'size-14 shrink-0 overflow-hidden rounded-full md:size-11 [&>svg]:size-full',
              speaking && 'ring-2 ring-successTertiary'
            )}
          >
            {camera ? (
              <TileVideo camera={camera} mirrored={isSelf} />
            ) : (
              <Avatar avatarUrl={member.avatar_cid} value={member.profile_space_id} alt="" size={56} />
            )}
          </span>
          <span className="flex max-w-full min-w-0 items-center gap-1.5 text-[17px] leading-[22px] font-semibold md:gap-1 md:text-[15px] md:leading-[18px] md:font-medium">
            <span className="truncate">{name}</span>
            <PersonTags member={member} />
          </span>
        </button>
      </LobbyPersonMenu>
      <TileStatus
        lobby={lobby}
        member={member}
        status={status}
        speaking={speaking}
        muted={showMic && !micOn}
        disagreements={disagreements}
      />
      {isSelf && !phone ? (
        <Text as="span" variant="footnote" color="grey-04">
          You
        </Text>
      ) : null}
    </div>
  );
}

/** A speaker's camera in their avatar's place. Attached so LiveKit sizes and pauses it with the tile. */
function TileVideo({ camera, mirrored }: { camera: TrackReference; mirrored: boolean }) {
  const ref = React.useRef<HTMLVideoElement | null>(null);
  const track = camera.publication.track;
  React.useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      data-testid="lobby-speaker-video"
      className={cx('size-full object-cover', mirrored && '-scale-x-100')}
      playsInline
      muted
      autoPlay
    />
  );
}

/**
 * Desktop: speaking bars, or the full status with a mic-off mark. Phone: one short line. Either way
 * the line keeps one height, so a tile does not jump when its speaker starts or stops talking.
 */
function TileStatus({
  lobby,
  member,
  status,
  speaking,
  muted,
  disagreements,
}: {
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  status: LobbyMemberStatus | null;
  speaking: boolean;
  muted: boolean;
  disagreements: number | null;
}) {
  const phone = useIsPhoneLayout();
  if (phone) {
    const line = member.stepped_out ? 'Stepped out' : status ? SHORT_STATUS_LABEL[status] : null;
    return (
      <span
        data-testid="lobby-tile-status"
        className="flex h-[13px] max-w-full min-w-0 items-center justify-center text-[11px] leading-[13px]"
      >
        {/* Mounted while they speak too: the trigger owns the sheet, which must not close mid-read. */}
        {disagreements !== null ? (
          <LobbyDisagreementsTrigger
            lobby={lobby}
            member={member}
            count={disagreements}
            variant="line"
            hidden={speaking}
          />
        ) : null}
        {speaking ? (
          <span className="truncate text-[#127A5B]">Speaking</span>
        ) : disagreements === null && line ? (
          <span className="truncate text-grey-04">{line}</span>
        ) : null}
      </span>
    );
  }

  // Plain text: the subject's claim link lives on the pair card instead.
  const full = member.stepped_out
    ? 'Stepped out'
    : member.in_debate
      ? inDebateLabel(member.in_debate_subject)
      : status
        ? STATUS_LABEL[status]
        : null;
  return (
    <>
      <span data-testid="lobby-tile-status" className="flex h-[18px] max-w-full min-w-0 items-center justify-center">
        {speaking ? (
          <SpeakingBars />
        ) : full ? (
          <span className="flex max-w-full min-w-0 items-center gap-1 text-[14px] leading-[18px] text-grey-04">
            {muted ? (
              <span role="img" aria-label="Muted" className="shrink-0 [&>svg]:size-3">
                <MicrophoneIcon muted />
              </span>
            ) : null}
            <span className="truncate">{full}</span>
          </span>
        ) : null}
      </span>
      {disagreements !== null ? (
        <LobbyDisagreementsTrigger lobby={lobby} member={member} count={disagreements} variant="pill" />
      ) : null}
    </>
  );
}

function SpeakingBars() {
  return (
    <span role="img" aria-label="Speaking" className="flex h-[11px] items-end gap-0.5">
      <span className="block h-[5px] w-0.5 bg-green" />
      <span className="block h-[11px] w-0.5 bg-green" />
      <span className="block h-[7px] w-0.5 bg-green" />
    </span>
  );
}

function PersonTags({ member }: { member: DebateLobbyMember }) {
  return (
    <>
      {isHosting(member) ? (
        <span className="shrink-0 rounded bg-grey-02 px-1 pb-px text-[14px] leading-none font-normal md:text-[12px]">
          {member.acting_host ? 'Hosting' : 'Host'}
        </span>
      ) : null}
      {member.newcomer ? (
        <span className="shrink-0 rounded bg-ctaTertiary px-1 pb-px text-[14px] leading-none font-normal text-ctaPrimary md:text-[12px]">
          New
        </span>
      ) : null}
    </>
  );
}

function ListenerChip({ lobby, member, isSelf, viewerId, status, disagreements }: PersonProps) {
  const name = personName(member);
  const moved =
    Boolean(member.moved_to_listeners) ||
    (isSelf && lobby.viewer.kind === 'member' && lobby.viewer.last_moderation?.action === 'move_to_listeners');
  // A raised hand first: for a host, every listener here may carry a move.
  const detail = member.stepped_out
    ? 'stepped out'
    : member.hand_raised_at
      ? LOBBY_ROSTER_COPY.handRaised
      : moved
        ? LOBBY_ROSTER_COPY.movedToListeners
        : null;

  return (
    <LobbyPersonMenu lobby={lobby} member={member} isSelf={isSelf} viewerId={viewerId} disagreements={disagreements}>
      <button
        type="button"
        aria-label={isSelf ? `${name} (you)` : name}
        {...personMenuAnalyticsAttributes(lobby, member, isSelf)}
        data-testid="lobby-listener-chip"
        title={status ? STATUS_LABEL[status] : undefined}
        className="flex max-w-full min-w-0 items-center gap-2 rounded-full pr-1 text-left hover:bg-grey-01 data-[state=open]:bg-grey-01"
      >
        <span className="size-6 shrink-0 overflow-hidden rounded-full [&>svg]:size-full">
          <Avatar avatarUrl={member.avatar_cid} value={member.profile_space_id} alt="" size={24} />
        </span>
        <span className="truncate text-metadataMedium md:text-[15px] md:leading-[18px]">
          {name}
          {isSelf ? ' (you)' : ''}
        </span>
        {member.newcomer ? (
          <span className="shrink-0 rounded bg-ctaTertiary px-1 pb-px text-[12px] leading-none text-ctaPrimary">
            New
          </span>
        ) : null}
        {detail ? (
          <Text as="span" variant="footnote" color="grey-04" className="shrink-0">
            {detail}
          </Text>
        ) : null}
      </button>
    </LobbyPersonMenu>
  );
}
