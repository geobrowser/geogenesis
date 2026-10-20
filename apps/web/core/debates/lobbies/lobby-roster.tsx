'use client';

import * as React from 'react';

import cx from 'classnames';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { type DebateLobbyClaims, type DebateLobbyMember, dashlessId } from '../api';
import { CameraIcon, MicrophoneIcon } from '../debate-room-controls';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { sameId } from '../rooms/room-presence';
import { TrackVideo } from '../track-video';
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
import { LobbyShowPeopleContext, LobbySlot } from './lobby-slots';
import {
  EMPTY_VIDEO_GRID,
  LOBBY_VIDEO_GRID_CAP,
  type VideoGridSpeaker,
  nextVideoGrid,
  sameVideoGrid,
  videoGridColumns,
} from './lobby-video-grid';
import type { LobbyPageView } from './lobby-view';
import { type LobbyVoiceStates, useLobbyVoiceStates } from './lobby-voice';

export const LOBBY_ROSTER_COPY = {
  empty: 'Nobody’s here right now.',
  movedToListeners: 'moved to listeners',
  handRaised: 'hand raised',
  moreSpeakers: (count: number) => `More speakers · ${count}`,
  cameraOn: 'Camera on',
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
  // GEO-3399: with lobby video on, speakers become a video grid. Off, the tiles stay as they were.
  const video = useFeatureFlag('debateVideo');
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

  const personProps = (member: DebateLobbyMember): PersonProps => {
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
      {speakers.length > 0 && video ? (
        <SpeakerVideoGrid speakers={speakers} personProps={personProps} />
      ) : speakers.length > 0 ? (
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
              <TrackVideo track={camera.publication.track} mirrored={isSelf} data-testid="lobby-speaker-video" />
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

/**
 * Desktop: speaking bars, or the full status with a mic-off mark. Phone: one short line. Either way
 * the line keeps one height, so a tile does not jump when its speaker starts or stops talking.
 *
 * Video tiles (GEO-3399) left-align it under the picture, and the compact 4-across desktop tiles
 * take the phone's one line, where "Disagrees on N" is text rather than a pill.
 */
function TileStatus({
  lobby,
  member,
  status,
  speaking,
  muted,
  disagreements,
  line: oneLine = false,
  align = 'center',
}: {
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  status: LobbyMemberStatus | null;
  speaking: boolean;
  muted: boolean;
  disagreements: number | null;
  /** The phone's one short line, wherever the tile is. */
  line?: boolean;
  align?: 'center' | 'start';
}) {
  const phone = useIsPhoneLayout();
  const justify = align === 'start' ? 'justify-start' : 'justify-center';
  if (phone || oneLine) {
    const line = member.stepped_out ? 'Stepped out' : status ? SHORT_STATUS_LABEL[status] : null;
    return (
      <span
        data-testid="lobby-tile-status"
        className={cx('flex h-[13px] max-w-full min-w-0 items-center text-[11px] leading-[13px]', justify)}
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
      <span data-testid="lobby-tile-status" className={cx('flex h-[18px] max-w-full min-w-0 items-center', justify)}>
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

function PersonTags({ member, small = false }: { member: DebateLobbyMember; small?: boolean }) {
  // The phone size everywhere when the name beside it is at the phone size (compact video tiles).
  const size = small ? 'text-[12px]' : 'text-[14px] md:text-[12px]';
  return (
    <>
      {isHosting(member) ? (
        <span className={cx('shrink-0 rounded bg-grey-02 px-1 pb-px leading-none font-normal', size)}>
          {member.acting_host ? 'Hosting' : 'Host'}
        </span>
      ) : null}
      {member.newcomer ? (
        <span
          className={cx('shrink-0 rounded bg-ctaTertiary px-1 pb-px leading-none font-normal text-ctaPrimary', size)}
        >
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

/** What the video grid reads from voice for one speaker. */
type SpeakerVoice = {
  voiceId: string;
  speaking: boolean;
  micShown: boolean;
  micOn: boolean;
  camera: ReturnType<LobbyVoiceStates['cameras']['get']>;
};

function speakerVoice(voice: LobbyVoiceStates, member: DebateLobbyMember): SpeakerVoice {
  const voiceId = dashlessId(member.user_id);
  return {
    voiceId,
    speaking: voice.speaking.has(voiceId),
    // Mic state only means something in a room this tab is connected to.
    micShown: voice.connected && !member.stepped_out,
    micOn: voice.micOn.has(voiceId),
    // Someone stepped out is in a debate elsewhere; their lobby camera is gone or about to be.
    camera: member.stepped_out ? undefined : voice.cameras.get(voiceId),
  };
}

/** Desktop column counts, as ceilings: a narrow column drops to fewer before tiles get too small. */
const DESKTOP_GRID_CLASS = {
  2: 'grid-cols-1 gap-3 @[28rem]/speakers:grid-cols-2',
  3: 'grid-cols-1 gap-3 @[28rem]/speakers:grid-cols-2 @[38rem]/speakers:grid-cols-3',
  4: 'grid-cols-1 gap-2 @[28rem]/speakers:grid-cols-2 @[38rem]/speakers:grid-cols-3 @[44rem]/speakers:grid-cols-4',
} as const;

/**
 * Speakers as video (GEO-3399, behind `debateVideo`): a tile per speaker up to the cap, the rest in
 * a "More speakers" row, and on a phone a thumbnail strip drawn into the Claims tab. Who holds a
 * tile, and where, is `nextVideoGrid`'s call; it is kept here between renders so tiles stay put.
 */
function SpeakerVideoGrid({
  speakers,
  personProps,
}: {
  speakers: DebateLobbyMember[];
  personProps: (member: DebateLobbyMember) => PersonProps;
}) {
  const phone = useIsPhoneLayout();
  const voice = useLobbyVoiceStates();
  const cap = phone ? LOBBY_VIDEO_GRID_CAP.phone : LOBBY_VIDEO_GRID_CAP.desktop;

  const people = speakers.map(member => ({ member, props: personProps(member), voice: speakerVoice(voice, member) }));
  const inputs: VideoGridSpeaker[] = people.map(({ member, props, voice: own }) => ({
    id: member.user_id,
    pinned: props.isSelf || isHosting(member),
    speaking: own.speaking,
    camera: Boolean(own.camera),
  }));

  // The previous pick, fed back in: a render that changes nothing returns an equal state and stops.
  const [grid, setGrid] = React.useState(EMPTY_VIDEO_GRID);
  const next = nextVideoGrid(grid, inputs, cap);
  if (!sameVideoGrid(grid, next)) setGrid(next);

  const byId = new Map(people.map(person => [person.member.user_id, person]));
  const shown = new Set(next.shown);
  const tiles = next.shown.flatMap(id => byId.get(id) ?? []);
  const overflow = people.filter(person => !shown.has(person.member.user_id));
  const columns = videoGridColumns(tiles.length, phone);
  // 4 across on a desktop: the phone's smaller name and one status line.
  const compact = !phone && columns === 4;

  return (
    <section
      className="@container/speakers flex flex-col gap-2.5 md:gap-2"
      aria-label="Speakers"
      data-testid="lobby-speaker-grid"
      data-columns={columns}
    >
      <SectionHeading>Speakers · {speakers.length}</SectionHeading>
      <ul
        className={cx(
          'grid',
          phone ? (columns === 2 ? 'grid-cols-2 gap-2' : 'grid-cols-3 gap-2') : DESKTOP_GRID_CLASS[columns]
        )}
      >
        {tiles.map(({ member, props, voice: own }) => (
          <li key={member.user_id} className="min-w-0">
            <VideoSpeakerTile {...props} voice={own} compact={compact} />
          </li>
        ))}
      </ul>
      {overflow.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="lobby-more-speakers">
          <h3 className="text-[14px] leading-[18px] font-normal text-grey-04">
            {LOBBY_ROSTER_COPY.moreSpeakers(overflow.length)}
          </h3>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {overflow.map(({ member, props, voice: own }) => (
              <li key={member.user_id} className="min-w-0">
                <MoreSpeakerChip {...props} voice={own} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {phone ? (
        <LobbySlot name="speakerStrip" inPlace={false}>
          <LobbySpeakerStrip tiles={tiles} overflow={overflow.length} />
        </LobbySlot>
      ) : null}
    </section>
  );
}

/**
 * A speaker's tile with their camera: today's tile, with the round avatar swapped for a 16:9 picture
 * (4:3 on a phone) and the name and status left-aligned under it. Camera off, the same frame holds
 * their avatar, so the grid stays even.
 */
function VideoSpeakerTile({
  lobby,
  member,
  isSelf,
  viewerId,
  status,
  disagreements,
  voice,
  compact,
}: PersonProps & { voice: SpeakerVoice; compact: boolean }) {
  const phone = useIsPhoneLayout();
  const small = phone || compact;
  const name = personName(member);
  const label = isSelf ? `${name} (you)` : name;

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="lobby-speaker-tile"
      data-speaking={voice.speaking || undefined}
      className={cx(
        'relative flex w-full min-w-0 flex-col gap-2 rounded-xl border bg-white p-1.5 pb-2 transition-colors hover:border-grey-03 has-[[data-person-trigger][data-state=open]]:border-text md:gap-1 md:p-1 md:pb-1.5',
        voice.speaking ? 'border-green' : 'border-grey-02'
      )}
    >
      <LobbyPersonMenu
        lobby={lobby}
        member={member}
        isSelf={isSelf}
        viewerId={viewerId}
        micOn={voice.micShown ? voice.micOn : undefined}
        disagreements={disagreements}
      >
        <button
          type="button"
          aria-label={label}
          {...personMenuAnalyticsAttributes(lobby, member, isSelf)}
          data-person-trigger
          className="flex w-full min-w-0 flex-col gap-2 text-left after:absolute after:inset-0 after:rounded-xl md:gap-1"
        >
          <span
            data-testid="lobby-speaker-frame"
            className={cx(
              'grid w-full place-items-center overflow-hidden bg-grey-01',
              phone ? 'aspect-[4/3] rounded-md' : 'aspect-video rounded-lg'
            )}
          >
            {voice.camera ? (
              <TrackVideo track={voice.camera.publication.track} mirrored={isSelf} data-testid="lobby-speaker-video" />
            ) : (
              <span
                className={cx('shrink-0 overflow-hidden rounded-full [&>svg]:size-full', small ? 'size-10' : 'size-14')}
              >
                <Avatar avatarUrl={member.avatar_cid} value={member.profile_space_id} alt="" size={small ? 40 : 56} />
              </span>
            )}
          </span>
          <span
            className={cx(
              'flex max-w-full min-w-0 items-center px-1',
              small
                ? 'gap-1 text-[15px] leading-[18px] font-medium'
                : 'gap-1.5 text-[17px] leading-[22px] font-semibold'
            )}
          >
            <span className="truncate">{name}</span>
            <PersonTags member={member} small={small} />
          </span>
        </button>
      </LobbyPersonMenu>
      <div className="flex min-w-0 items-center justify-between gap-2 px-1">
        <TileStatus
          lobby={lobby}
          member={member}
          status={status}
          speaking={voice.speaking}
          muted={voice.micShown && !voice.micOn}
          disagreements={disagreements}
          line={compact}
          align="start"
        />
        {isSelf && !phone ? (
          <Text as="span" variant="footnote" color="grey-04" className="shrink-0">
            You
          </Text>
        ) : null}
      </div>
    </div>
  );
}

/** Someone past the grid's cap: the Listening row's chip, plus whether their camera is on. */
function MoreSpeakerChip({
  lobby,
  member,
  isSelf,
  viewerId,
  disagreements,
  voice,
}: PersonProps & { voice: SpeakerVoice }) {
  const name = personName(member);
  const label = isSelf ? `${name} (you)` : name;

  return (
    <LobbyPersonMenu
      lobby={lobby}
      member={member}
      isSelf={isSelf}
      viewerId={viewerId}
      micOn={voice.micShown ? voice.micOn : undefined}
      disagreements={disagreements}
    >
      <button
        type="button"
        aria-label={label}
        {...personMenuAnalyticsAttributes(lobby, member, isSelf)}
        data-testid="lobby-more-speaker"
        className="flex max-w-full min-w-0 items-center gap-2 rounded-full pr-1 text-left hover:bg-grey-01 data-[state=open]:bg-grey-01"
      >
        <span className="size-6 shrink-0 overflow-hidden rounded-full [&>svg]:size-full">
          <Avatar avatarUrl={member.avatar_cid} value={member.profile_space_id} alt="" size={24} />
        </span>
        <span className="truncate text-metadataMedium md:text-[15px] md:leading-[18px]">{name}</span>
        <PersonTags member={member} small />
        {voice.camera ? (
          <span role="img" aria-label={LOBBY_ROSTER_COPY.cameraOn} className="shrink-0 text-grey-04 [&>svg]:size-3.5">
            <CameraIcon disabled={false} />
          </span>
        ) : null}
      </button>
    </LobbyPersonMenu>
  );
}

/**
 * The phone Claims tab's strip (GEO-3399): the grid's speakers as small thumbnails, so who is talking
 * stays in view while you vote. Drawn by the grid into the claims panel's slot; tapping one goes
 * back to People.
 */
function LobbySpeakerStrip({
  tiles,
  overflow,
}: {
  tiles: { member: DebateLobbyMember; props: PersonProps; voice: SpeakerVoice }[];
  overflow: number;
}) {
  const showPeople = React.useContext(LobbyShowPeopleContext);

  return (
    <div
      role="group"
      aria-label="Speakers"
      data-testid="lobby-speaker-strip"
      className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
    >
      {tiles.map(({ member, props, voice }) => {
        const name = personName(member);
        return (
          <button
            key={member.user_id}
            type="button"
            aria-label={`${props.isSelf ? `${name} (you)` : name}, show people`}
            {...debateActionAnalyticsAttributes('hub', 'Lobby speaker strip')}
            data-speaking={voice.speaking || undefined}
            onClick={showPeople ?? undefined}
            className={cx(
              'grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-grey-01',
              voice.speaking ? 'border-2 border-green' : 'border border-grey-02'
            )}
          >
            {voice.camera ? (
              <TrackVideo track={voice.camera.publication.track} mirrored={props.isSelf} />
            ) : (
              <span className="size-7 overflow-hidden rounded-full [&>svg]:size-full">
                <Avatar avatarUrl={member.avatar_cid} value={member.profile_space_id} alt="" size={28} />
              </span>
            )}
          </button>
        );
      })}
      {overflow > 0 ? (
        <button
          type="button"
          aria-label={`${overflow} more ${overflow === 1 ? 'speaker' : 'speakers'}, show people`}
          {...debateActionAnalyticsAttributes('hub', 'Lobby speaker strip')}
          onClick={showPeople ?? undefined}
          className="grid h-12 shrink-0 place-items-center rounded-md border border-grey-02 px-3 text-[14px] leading-[18px] text-grey-04"
        >
          +{overflow}
        </button>
      ) : null}
    </div>
  );
}
