'use client';

import * as React from 'react';

import cx from 'classnames';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';
import { CALL_SCREEN_COPY, useScreenShareChoice } from '~/core/space-calls/call-screen-stage';

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
import { useIsCallRoom } from './lobby-purpose';
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
  // A space call has no debates: no pairs, availability or disagreements on anyone.
  const call = useIsCallRoom();
  const pairs = call ? [] : (lobby.debate_pairs ?? []);
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
      status: call ? null : memberStatus(member, isSelf ? ownAvailable : undefined),
      disagreements: isSelf || call ? null : disagreementCount(disagreements, member.user_id),
    };
  };

  return (
    <>
      {call ? null : <LobbyDebatePairs pairs={pairs} members={lobby.members} lobby={lobby} viewerId={viewerId} />}
      {speakers.length > 0 ? <SpeakerVideoGrid speakers={speakers} personProps={personProps} /> : null}
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

/** "Ana (you)" on the viewer's own tile, chip and thumbnail; the name everywhere else. */
function personLabel(member: DebateLobbyMember, isSelf: boolean) {
  const name = personName(member);
  return isSelf ? `${name} (you)` : name;
}

/** What a speaker's tile, chip and thumbnail read from voice. */
type SpeakerVoice = {
  speaking: boolean;
  /** Mic state only means something in a room this tab is connected to. */
  micShown: boolean;
  micOn: boolean;
  camera: ReturnType<LobbyVoiceStates['cameras']['get']>;
};

function speakerVoice(voice: LobbyVoiceStates, member: DebateLobbyMember): SpeakerVoice {
  const voiceId = dashlessId(member.user_id);
  return {
    speaking: voice.speaking.has(voiceId),
    micShown: voice.connected && !member.stepped_out,
    micOn: voice.micOn.has(voiceId),
    // Someone stepped out is in a debate elsewhere; their lobby camera is gone or about to be.
    camera: member.stepped_out ? undefined : voice.cameras.get(voiceId),
  };
}

const AVATAR_SIZE_CLASS = { 28: 'size-7', 40: 'size-10', 56: 'size-14' } as const;

/** Their camera filling the box, or their avatar centred in it: a video tile's frame and a strip thumbnail. */
function SpeakerPicture({
  member,
  camera,
  mirrored,
  avatarSize,
  'data-testid': testId,
}: {
  member: DebateLobbyMember;
  camera: SpeakerVoice['camera'];
  mirrored: boolean;
  avatarSize: keyof typeof AVATAR_SIZE_CLASS;
  'data-testid'?: string;
}) {
  if (camera) return <TrackVideo track={camera.publication.track} mirrored={mirrored} data-testid={testId} />;
  return (
    <span className={cx('shrink-0 overflow-hidden rounded-full [&>svg]:size-full', AVATAR_SIZE_CLASS[avatarSize])}>
      <Avatar avatarUrl={member.avatar_cid} value={member.profile_space_id} alt="" size={avatarSize} />
    </span>
  );
}

/**
 * A speaker's tile (GEO-3399): their camera in a 16:9 frame (4:3 on a phone), or their avatar in the
 * same frame with it off, and the name and status left-aligned under it. `compact` is the 4-across
 * desktop size, which takes the phone's smaller name and one status line.
 */
function SpeakerTile({
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
  // The phone's smaller name and one status line: on a phone, or in the compact desktop tiles.
  const small = phone || compact;
  const name = personName(member);
  const label = personLabel(member, isSelf);

  // The person button stretches over the whole tile, so a press anywhere opens the person menu; the
  // disagreements trigger sits above it, beside the button rather than inside it.
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
            <SpeakerPicture
              member={member}
              camera={voice.camera}
              mirrored={isSelf}
              avatarSize={small ? 40 : 56}
              data-testid="lobby-speaker-video"
            />
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
      <SharingTag member={member} />
      <div className="flex min-w-0 items-center px-1">
        <TileStatus
          member={member}
          status={status}
          speaking={voice.speaking}
          muted={voice.micShown && !voice.micOn}
          disagreements={disagreements}
          oneLine={small}
        />
        {disagreements !== null ? (
          // One place in the tree for both sizes, so switching between them (9 to 10 speakers, a
          // resize across the phone breakpoint) does not remount it and close its popup.
          <span className={cx('flex min-w-0', !small && 'ml-auto shrink-0 pl-2')}>
            <LobbyDisagreementsTrigger
              lobby={lobby}
              member={member}
              count={disagreements}
              variant={small ? 'line' : 'pill'}
              hidden={small && voice.speaking}
            />
          </span>
        ) : null}
        {isSelf && !phone ? (
          <Text as="span" variant="footnote" color="grey-04" className="ml-auto shrink-0 pl-2">
            You
          </Text>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The status line under a tile's name. Full: speaking bars, or the full status with a mic-off mark.
 * One line (a phone, or a compact tile): the short status, or "Speaking", left empty where the
 * tile's "Disagrees on N" stands in for it. Either way it keeps one height, so a tile does not jump
 * when its speaker starts or stops talking.
 */
function TileStatus({
  member,
  status,
  speaking,
  muted,
  disagreements,
  oneLine,
}: {
  member: DebateLobbyMember;
  status: LobbyMemberStatus | null;
  speaking: boolean;
  muted: boolean;
  disagreements: number | null;
  oneLine: boolean;
}) {
  if (oneLine) {
    const line = member.stepped_out ? 'Stepped out' : status ? SHORT_STATUS_LABEL[status] : null;
    return (
      <span
        data-testid="lobby-tile-status"
        className="flex h-[13px] max-w-full min-w-0 items-center text-[11px] leading-[13px]"
      >
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
    <span data-testid="lobby-tile-status" className="flex h-[18px] max-w-full min-w-0 items-center">
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

function PersonTags({ member, small }: { member: DebateLobbyMember; small: boolean }) {
  // The phone's size beside a name at the phone's size (a phone, or a compact tile).
  const size = small ? 'text-[12px]' : 'text-[14px]';
  // "New" means no completed debate yet, which says nothing in a space call.
  const call = useIsCallRoom();
  const newcomer = Boolean(member.newcomer) && !call;
  return (
    <>
      {isHosting(member) ? (
        <span className={cx('shrink-0 rounded bg-grey-02 px-1 pb-px leading-none font-normal', size)}>
          {member.acting_host ? 'Hosting' : 'Host'}
        </span>
      ) : null}
      {newcomer ? (
        <span
          className={cx('shrink-0 rounded bg-ctaTertiary px-1 pb-px leading-none font-normal text-ctaPrimary', size)}
        >
          New
        </span>
      ) : null}
    </>
  );
}

/**
 * A listener, or a speaker past the video grid's cap (GEO-3399), who also gets their mic state in the
 * menu and a camera mark when theirs is on.
 */
function ListenerChip({
  lobby,
  member,
  isSelf,
  viewerId,
  status,
  disagreements,
  voice,
  'data-testid': testId = 'lobby-listener-chip',
}: PersonProps & { voice?: SpeakerVoice; 'data-testid'?: string }) {
  const name = personName(member);
  const call = useIsCallRoom();
  const newcomer = Boolean(member.newcomer) && !call;
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
    <LobbyPersonMenu
      lobby={lobby}
      member={member}
      isSelf={isSelf}
      viewerId={viewerId}
      micOn={voice?.micShown ? voice.micOn : undefined}
      disagreements={disagreements}
    >
      <button
        type="button"
        aria-label={personLabel(member, isSelf)}
        {...personMenuAnalyticsAttributes(lobby, member, isSelf)}
        data-testid={testId}
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
        {newcomer ? (
          <span className="shrink-0 rounded bg-ctaTertiary px-1 pb-px text-[12px] leading-none text-ctaPrimary">
            New
          </span>
        ) : null}
        {voice?.camera ? (
          <span role="img" aria-label={LOBBY_ROSTER_COPY.cameraOn} className="shrink-0 text-grey-04 [&>svg]:size-3.5">
            <CameraIcon disabled={false} />
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

/** Desktop column counts, as ceilings: a narrow column drops to fewer before tiles get too small. */
const DESKTOP_GRID_CLASS = {
  2: 'grid-cols-1 gap-3 @[28rem]/speakers:grid-cols-2',
  3: 'grid-cols-1 gap-3 @[28rem]/speakers:grid-cols-2 @[38rem]/speakers:grid-cols-3',
  4: 'grid-cols-1 gap-2 @[28rem]/speakers:grid-cols-2 @[38rem]/speakers:grid-cols-3 @[44rem]/speakers:grid-cols-4',
} as const;

type HoldFocus = (key: string, on: boolean) => void;

/** Over a sharer's frame (GEO-3507): shows their screen on the stage above. */
function SharingTag({ member }: { member: DebateLobbyMember }) {
  const choice = useScreenShareChoice();
  const sharerId = choice?.sharers.find(id => sameId(id, member.user_id));
  if (!choice || !sharerId) return null;
  return (
    <button
      type="button"
      aria-pressed={choice.shown === sharerId}
      aria-label={CALL_SCREEN_COPY.show(personName(member))}
      onClick={() => choice.show(sharerId)}
      className="absolute top-2.5 left-2.5 z-[1] rounded-md bg-text/70 px-1.5 py-0.5 text-metadataMedium text-white md:top-2 md:left-2"
    >
      {CALL_SCREEN_COPY.sharingTag}
    </button>
  );
}

/**
 * Holds a speaker in place while focus is inside it (see `nextVideoGrid`'s `held`). Released on blur,
 * and on unmount: a focused element that is removed (its person left, or the strip went away with
 * the phone layout) never reports a blur.
 */
function FocusHold({
  id,
  owner,
  hold,
  children,
}: {
  id: string;
  owner: 'tile' | 'chip' | 'strip';
  hold: HoldFocus;
  children: React.ReactNode;
}) {
  const key = `${owner}:${id}`;
  React.useEffect(() => () => hold(key, false), [hold, key]);
  return (
    <div className="contents" onFocus={() => hold(key, true)} onBlur={() => hold(key, false)}>
      {children}
    </div>
  );
}

type GridPerson = { member: DebateLobbyMember; props: PersonProps; voice: SpeakerVoice };

/**
 * Speakers as video (GEO-3399): a tile per speaker up to the cap, the rest in
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
  const states = useLobbyVoiceStates();
  const cap = phone ? LOBBY_VIDEO_GRID_CAP.phone : LOBBY_VIDEO_GRID_CAP.desktop;

  const people: GridPerson[] = speakers.map(member => ({
    member,
    props: personProps(member),
    voice: speakerVoice(states, member),
  }));
  // Whose tile, chip or strip thumbnail has focus, including a menu opened from it: React focus
  // events bubble out of portals, so a menu's own focus still reads as inside. Kept per holder, so
  // one unmounting (see FocusHold) releases only its own hold.
  const [holds, setHolds] = React.useState<ReadonlySet<string>>(() => new Set());
  const hold = React.useCallback<HoldFocus>(
    (key, on) =>
      setHolds(current => {
        if (current.has(key) === on) return current;
        const next = new Set(current);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      }),
    []
  );
  const heldIds = new Set([...holds].map(key => key.slice(key.indexOf(':') + 1)));
  const inputs: VideoGridSpeaker[] = people.map(({ member, props, voice }) => ({
    id: member.user_id,
    pinned: props.isSelf || isHosting(member),
    speaking: voice.speaking,
    camera: Boolean(voice.camera),
    held: heldIds.has(member.user_id),
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
        {tiles.map(({ member, props, voice }) => (
          <li key={member.user_id} className="min-w-0">
            <FocusHold id={member.user_id} owner="tile" hold={hold}>
              <SpeakerTile {...props} voice={voice} compact={compact} />
            </FocusHold>
          </li>
        ))}
      </ul>
      {overflow.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="lobby-more-speakers">
          <h3 className="text-[14px] leading-[18px] font-normal text-grey-04">
            {LOBBY_ROSTER_COPY.moreSpeakers(overflow.length)}
          </h3>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {overflow.map(({ member, props, voice }) => (
              <li key={member.user_id} className="min-w-0">
                <FocusHold id={member.user_id} owner="chip" hold={hold}>
                  <ListenerChip {...props} voice={voice} data-testid="lobby-more-speaker" />
                </FocusHold>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {phone ? (
        <LobbySlot name="speakerStrip" inPlace={false}>
          <LobbySpeakerStrip tiles={tiles} overflow={overflow.length} hold={hold} />
        </LobbySlot>
      ) : null}
    </section>
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
  hold,
}: {
  tiles: GridPerson[];
  overflow: number;
  /** A focused thumbnail holds its speaker's tile, as a focused tile does. */
  hold: HoldFocus;
}) {
  const showPeople = React.useContext(LobbyShowPeopleContext) ?? undefined;
  const analytics = debateActionAnalyticsAttributes('hub', 'Lobby speaker strip');

  return (
    <div
      role="group"
      aria-label="Speakers"
      data-testid="lobby-speaker-strip"
      className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4"
    >
      {tiles.map(({ member, props, voice }) => (
        <FocusHold key={member.user_id} id={member.user_id} owner="strip" hold={hold}>
          <button
            type="button"
            aria-label={`${personLabel(member, props.isSelf)}${voice.speaking ? ', speaking' : ''}, show people`}
            {...analytics}
            data-speaking={voice.speaking || undefined}
            onClick={showPeople}
            className={cx(
              'grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-grey-01',
              voice.speaking ? 'border-2 border-green' : 'border border-grey-02'
            )}
          >
            <SpeakerPicture member={member} camera={voice.camera} mirrored={props.isSelf} avatarSize={28} />
          </button>
        </FocusHold>
      ))}
      {overflow > 0 ? (
        <button
          type="button"
          aria-label={`${overflow} more ${overflow === 1 ? 'speaker' : 'speakers'}, show people`}
          {...analytics}
          onClick={showPeople}
          className="grid h-12 shrink-0 place-items-center rounded-md border border-grey-02 px-3 text-[14px] leading-[18px] text-grey-04"
        >
          +{overflow}
        </button>
      ) : null}
    </div>
  );
}
