'use client';

import * as React from 'react';

import cx from 'classnames';

import { MicrophoneIcon } from '~/core/debates/debate-room-controls';

import { Avatar } from '~/design-system/avatar';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { CloseSmall } from '~/design-system/icons/close-small';

/**
 * The "You VS them" header for the rematch claim picker (GEO-2992).
 *
 * The voice controls used to live in a 200px dock pinned to the bottom-right corner, outside the
 * 720px column the viewer is actually reading. People were not finding it, so they never learned
 * they could unmute and talk while picking a claim. This puts the same controls in the page header,
 * inside the column, and gives the room a face: two participant cards either side of a VS badge.
 *
 * Presentational only. Everything that needs a LiveKit room — mute state, the opponent's mic, the
 * one-shot nudges — is computed in `rematch-voice.tsx` and handed down as `voice`, so this file can
 * be rendered (and tested) without a room, and so the header still draws the pair when voice is
 * unavailable entirely.
 */

/** What the opponent's chip is saying. `talking` is `live` plus sound right now. */
export type PairMicState = 'waiting' | 'muted' | 'live' | 'talking';

export type PairHeaderParticipant = {
  displayName: string | null;
  profileSpaceId: string;
  avatarCid: string | null;
};

/**
 * The voice layer, as far as the header is concerned.
 *
 * `absent` is not an error state: a session with no LiveKit backing, or one that has left a
 * voice-capable status, still has two people in it and still wants the header. It just has no
 * controls to put in it.
 */
export type PairHeaderVoice =
  | { kind: 'absent' }
  /** Connecting, reconnecting, blocked playback, a dead connection — anything with no live state yet. */
  | { kind: 'message'; message: string; actionLabel?: string; onAction?: () => void }
  | {
      kind: 'live';
      muted: boolean;
      /** True while the room can hear the viewer, used for the green outline and the avatar ring. */
      localSpeaking: boolean;
      /** Already-formatted, or null. A dead microphone is not a mute the viewer can click away. */
      micFailureMessage: string | null;
      onRetryMic: () => void;
      /** The mute/unmute pill and its attached settings chevron. Owned by `rematch-voice.tsx`. */
      controls: React.ReactNode;
      opponentState: PairMicState;
      /**
       * The viewer is making sound the room cannot hear. Wired to nothing today — see the note on
       * `useTalkingWhileMuted` in `rematch-voice.tsx` for why detecting it needs a second open
       * microphone, which is the thing joining muted exists to avoid.
       */
      talkingWhileMuted: boolean;
    };

/** The one-shot prompt under the header, while the viewer is muted and has not waved it away. */
export type PairHeaderNotice = { onUnmute: () => void; onDismiss: () => void };

/** The nudges. Each fires at most once a visit and never while unmuted. */
export type PairHeaderToast =
  | { kind: 'opponent-talking'; onUnmute: () => void; onDismiss: () => void }
  | { kind: 'talking-while-muted'; onUnmute: () => void; onDismiss: () => void };

/** Both sides of a locked pairing, once the pair have agreed what they are debating. */
export type PairHeaderPositions = { localAgrees: boolean; opponentAgrees: boolean };

/**
 * "Jenna Ruiz" -> "Jenna". The notice and the toasts address the opponent directly, and a display
 * handle read out in the middle of a sentence reads like a username, not like the person talking.
 */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

type RematchPairHeaderProps = {
  local: PairHeaderParticipant | null;
  opponent: PairHeaderParticipant;
  opponentName: string;
  voice: PairHeaderVoice;
  notice?: PairHeaderNotice | null;
  toast?: PairHeaderToast | null;
  /** Set once the pair lock a claim — the claim sits above the cards and each card takes a side chip. */
  lockedClaim?: { claim: string; spaceName?: string | null } | null;
  positions?: PairHeaderPositions | null;
  /** Null while the opponent's personal space has not resolved; the card stays, inert. */
  onOpenOpponentSpace: (() => void) | null;
  /**
   * Leaving the session, drawn in your card's top-right corner.
   *
   * Owned by the page, which holds the mutation — this only says where it goes. It sits opposite
   * "View profile" on the other card, so each card's corner is that person's secondary action, and
   * the row it used to occupy at the end of the tab strip is now the tabs' alone.
   */
  leaveAction?: React.ReactNode;
};

export function RematchPairHeader({
  local,
  opponent,
  opponentName,
  voice,
  notice,
  toast,
  lockedClaim,
  positions,
  onOpenOpponentSpace,
  leaveAction,
}: RematchPairHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {lockedClaim ? <LockedClaim claim={lockedClaim.claim} spaceName={lockedClaim.spaceName} /> : null}

      {/* Three tracks on desktop, stacked on a phone. Two 150px cards side by side at 375px leaves
          no room for a labelled pill, and a labelled pill is the entire point of this change. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2 mobile:grid-cols-1">
        <YouCard
          local={local}
          voice={voice}
          opponentName={opponentName}
          agrees={positions?.localAgrees}
          leaveAction={leaveAction}
        />
        <VsBadge />
        <OpponentCard
          opponent={opponent}
          name={opponentName}
          state={voice.kind === 'live' ? voice.opponentState : 'waiting'}
          showMicState={voice.kind === 'live'}
          agrees={positions?.opponentAgrees}
          onOpen={onOpenOpponentSpace}
        />
      </div>

      {/* The spoken half of the nudges: a region that is always mounted and only changes text. A
          live region inserted with its content already in it is dropped by VoiceOver often enough
          to be unreliable, and for a muted user this is the only announcement that the other
          person is talking. The toast itself is not a live region — it carries real buttons, and
          `aria-hidden` over a focusable control is worse than saying it twice. */}
      <span role="status" data-testid="rematch-voice-announcement" className="sr-only">
        {toast ? toastAnnouncement(toast, opponentName) : ''}
      </span>

      {notice ? <UnmuteNotice opponentName={opponentName} {...notice} /> : null}
      {toast ? <VoiceToast toast={toast} opponentName={opponentName} /> : null}
    </div>
  );
}

function toastAnnouncement(toast: PairHeaderToast, opponentName: string) {
  return toast.kind === 'opponent-talking'
    ? `${firstName(opponentName)} is talking. Unmute to reply.`
    : `You’re talking while muted.`;
}

function LockedClaim({ claim, spaceName }: { claim: string; spaceName?: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      {spaceName ? <span className="text-footnoteMedium text-grey-04">{spaceName}</span> : null}
      <h2 className="text-mediumTitle text-text">{claim}</h2>
    </div>
  );
}

function VsBadge() {
  return (
    <div className="flex items-center justify-center">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-full bg-text text-tag tracking-[0.04em] text-white"
      >
        VS
      </span>
    </div>
  );
}

/**
 * The card surface, spelled out rather than taken from `claim-card-panel-surface`.
 *
 * The utility hardcodes `border-grey-02`, and these cards change border colour with the voice
 * state. Layering `border-green` over the utility is a coin toss decided by stylesheet order rather
 * than by class order, so the one property that varies is set here instead. Everything else is the
 * same surface, to the pixel.
 */
const CARD_SURFACE = 'rounded-lg border bg-white p-3';

/**
 * The shape both sides of the pair wear.
 *
 * Your mute control and their mic chip sit at the same height in mirrored cards, so anything they
 * do not share reads as an accident — and they were two hand-written sets of paddings and type
 * sizes that were close but not equal. Exported rather than copied: `rematch-voice.tsx` owns the
 * button (it needs the settings popover) but not the right to size it differently.
 *
 * The corners are deliberately left out. The chip is a whole pill; the button is the left half of
 * one, with the settings chevron making up the right.
 */
export const PAIR_PILL = 'flex h-6 shrink-0 items-center gap-1 px-2 text-chatMedium [&>svg]:size-3';

/**
 * The layout both cards wear.
 *
 * Avatar, then a column holding the name with that person's state directly under it, then that
 * person's secondary action in the corner. One component rather than two similar ones, because
 * these sit side by side: the mute pill drifting out to the card's left edge while the opponent's
 * chip stayed indented under their name was invisible in either card alone and impossible to miss
 * across the pair.
 */
function PairCardBody({
  avatar,
  name,
  nameTitle,
  state,
  action,
  footer,
}: {
  avatar: React.ReactNode;
  name: string;
  nameTitle?: string;
  /** Directly under the name: the mute pill on your side, the mic chip on theirs. */
  state?: React.ReactNode;
  /** The corner: Leave on your side, View profile on theirs. */
  action?: React.ReactNode;
  /** Below the whole row, spanning the card — the locked position chip. */
  footer?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex w-full items-center gap-2.5">
        {avatar}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span title={nameTitle} className="w-full truncate text-left text-quoteMedium text-text">
            {name}
          </span>
          {state}
        </div>
        {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
      </div>
      {footer}
    </>
  );
}

function YouCard({
  local,
  voice,
  opponentName,
  agrees,
  leaveAction,
}: {
  local: PairHeaderParticipant | null;
  voice: PairHeaderVoice;
  opponentName: string;
  agrees?: boolean;
  leaveAction?: React.ReactNode;
}) {
  const live = voice.kind === 'live';
  const muted = live && voice.muted;
  const failed = live && Boolean(voice.micFailureMessage);
  const talkingWhileMuted = live && voice.talkingWhileMuted;
  const speaking = live && voice.localSpeaking;

  /**
   * What the card says in words, over and above the button.
   *
   * Deliberately nothing for a plain muted/unmuted: the pill under the name already carries both
   * halves — a filled "Unmute" is a microphone that is off and an invitation to turn it on, an
   * outlined "Mute" is one that is on. A "Muted" caption beside it is the same fact a second time,
   * and it reads as though the two could disagree.
   *
   * What is left is everything the button cannot say: a connection that is not up, a microphone
   * the browser will not open, and a mute the viewer is talking straight through.
   */
  const caption = (() => {
    if (voice.kind === 'absent') return null;
    if (voice.kind === 'message') return voice.message;
    if (voice.micFailureMessage) return voice.micFailureMessage;
    if (talkingWhileMuted) return `Muted · ${firstName(opponentName)} can’t hear you`;
    return null;
  })();

  const captionTone = voice.kind === 'live' ? 'text-red-01' : 'text-grey-04';

  /**
   * The same two states, for a screen reader.
   *
   * Dropping the visible caption cannot drop the announcement with it: the microphone mutes on its
   * own — a reconnect, a takeover, a device failure — and the button's `aria-label` flipping is not
   * reliably read unless it happens to be focused. So the state stays in a live region that is
   * always mounted and only changes text.
   */
  const spokenState = voice.kind === 'live' && !voice.micFailureMessage ? (muted ? 'Muted' : 'Unmuted') : '';

  const border = (() => {
    if (talkingWhileMuted || failed) return 'border-red-01';
    if (live && !muted) return 'border-green';
    return 'border-grey-02';
  })();

  // Under the name, in the same slot their mic chip occupies. It is the same fact about the other
  // person, so it belongs in the same place — the only difference is that yours can be pressed.
  const control =
    voice.kind === 'live' ? (
      <div
        className={cx(
          'flex items-center',
          muted && voice.opponentState === 'talking' && 'rounded-full ring-2 ring-grey-02'
        )}
      >
        {voice.controls}
      </div>
    ) : voice.kind === 'message' && voice.actionLabel && voice.onAction ? (
      <button
        type="button"
        onClick={voice.onAction}
        className={cx(PAIR_PILL, 'rounded-full bg-text text-white transition-opacity hover:opacity-80')}
      >
        {voice.actionLabel}
      </button>
    ) : null;

  return (
    <div data-testid="rematch-you-card" className={cx(CARD_SURFACE, border, 'flex flex-col gap-2.5')}>
      <PairCardBody
        avatar={
          <ParticipantAvatar
            avatarUrl={local?.avatarCid ?? null}
            value={local?.profileSpaceId}
            name="You"
            speaking={speaking}
          />
        }
        name="You"
        state={
          <>
            <span role="status" data-testid="rematch-you-state" className="sr-only">
              {spokenState}
            </span>
            {control}
            {caption ? (
              // Only the things the button cannot say, and each of them arrives without the viewer
              // doing anything — so it announces itself rather than waiting to be noticed.
              <span role="status" className={cx('w-full truncate text-chat', captionTone)} title={caption}>
                {caption}
              </span>
            ) : null}
            {live && voice.micFailureMessage ? (
              // A disabled button is out of the tab order, so the way back has to be text rather
              // than a tooltip on a control nobody can reach.
              <button type="button" onClick={voice.onRetryMic} className="text-footnoteMedium text-text underline">
                Try again
              </button>
            ) : null}
          </>
        }
        action={leaveAction}
        footer={agrees === undefined ? null : <PositionChip agrees={agrees} />}
      />
    </div>
  );
}

function OpponentCard({
  opponent,
  name,
  state,
  showMicState,
  agrees,
  onOpen,
}: {
  opponent: PairHeaderParticipant;
  name: string;
  state: PairMicState;
  showMicState: boolean;
  agrees?: boolean;
  onOpen: (() => void) | null;
}) {
  const talking = showMicState && state === 'talking';

  const body = (
    <PairCardBody
      avatar={
        <ParticipantAvatar
          avatarUrl={opponent.avatarCid}
          value={opponent.profileSpaceId}
          name={name}
          speaking={talking}
        />
      }
      name={name}
      nameTitle={name}
      // The label is the point. The dock's icon-only chip read as a button the viewer could press,
      // which it never was — the only control here is the pill in the other card.
      state={showMicState ? <OpponentMicChip state={state} name={name} /> : null}
      action={
        onOpen ? (
          <span className="flex items-center gap-0.5 text-chat whitespace-nowrap text-grey-04 mobile:sr-only">
            View profile
            <ChevronRight />
          </span>
        ) : null
      }
      footer={agrees === undefined ? null : <PositionChip agrees={agrees} />}
    />
  );

  if (!onOpen) {
    return (
      <div
        data-testid="rematch-opponent-card"
        className={cx(CARD_SURFACE, talking ? 'border-green' : 'border-grey-02', 'flex flex-col gap-2.5')}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="rematch-opponent-card"
      onClick={onOpen}
      aria-label={`Open ${name}’s personal space`}
      className={cx(
        CARD_SURFACE,
        talking ? 'border-green' : 'border-grey-02',
        'flex flex-col gap-2.5 text-left transition-colors hover:border-grey-03'
      )}
    >
      {body}
    </button>
  );
}

function ParticipantAvatar({
  avatarUrl,
  value,
  name,
  speaking,
}: {
  avatarUrl: string | null;
  value?: string;
  name: string;
  speaking: boolean;
}) {
  return (
    // The size lives on the wrapper, not on `<Avatar>`: its `size` prop only reaches the generated
    // fallback, while a real avatar renders `h-full w-full` and takes whatever box it is given.
    <span
      className={cx(
        'inline-flex size-8 shrink-0 overflow-hidden rounded-full',
        speaking && 'ring-2 ring-successTertiary'
      )}
    >
      <Avatar avatarUrl={avatarUrl} value={value ?? name} size={32} alt="" />
    </span>
  );
}

/**
 * Neutral before they arrive, red while muted, green once they are live — with a word next to the
 * icon, so it reads as a report on the other person rather than as a switch.
 */
function OpponentMicChip({ state, name }: { state: PairMicState; name: string }) {
  const label =
    state === 'waiting'
      ? `Waiting for ${name} to join`
      : state === 'muted'
        ? `${name} is muted`
        : state === 'talking'
          ? `${name} is talking`
          : `${name} is unmuted`;

  const text =
    state === 'waiting' ? 'Waiting' : state === 'muted' ? 'Muted' : state === 'talking' ? 'Talking' : 'Unmuted';

  return (
    <>
      <span
        title={label}
        className={cx(
          PAIR_PILL,
          'rounded-full',
          state === 'waiting' && 'bg-grey-01 text-grey-04',
          state === 'muted' && 'bg-errorTertiary text-red-01',
          (state === 'live' || state === 'talking') && 'bg-successTertiary text-green'
        )}
      >
        {state === 'talking' ? <TalkingBars /> : <MicrophoneIcon muted={state !== 'live'} />}
        {text}
      </span>
      {/* The chip's own text carries the state, but nothing announces it changing: the opponent
          arrives, mutes and unmutes on their own schedule, with no action here to hang an update
          on. A live region whose text changes is the only reliable way to hear about it. */}
      <span role="status" className="sr-only">
        {label}
      </span>
    </>
  );
}

function TalkingBars() {
  return (
    <span aria-hidden className="flex h-3 items-end gap-0.5">
      <span className="w-0.5 rounded-xs bg-green" style={{ height: 5 }} />
      <span className="w-0.5 rounded-xs bg-green" style={{ height: 11 }} />
      <span className="w-0.5 rounded-xs bg-green" style={{ height: 7 }} />
    </span>
  );
}

/** Which side of the locked claim this person is on. */
function PositionChip({ agrees }: { agrees: boolean }) {
  return (
    <span
      className={cx(
        'flex min-h-7 items-center gap-1.5 self-start rounded-full px-3 text-button text-text',
        agrees ? 'bg-successTertiary' : 'bg-errorTertiary'
      )}
    >
      <ThumbIcon down={!agrees} />
      {agrees ? 'Agree' : 'Disagree'}
    </span>
  );
}

function ThumbIcon({ down }: { down: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cx('size-3.5', down ? 'rotate-180 text-red-01' : 'text-green')}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10v11H4V10h3z" />
      <path d="M7 10l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 21H7" />
    </svg>
  );
}

/**
 * Says out loud what the header only implies: there is another person on the line right now, and
 * the viewer is muted by a default they did not choose.
 *
 * Shown once. Dismissing it or unmuting takes it down for the rest of the session — a prompt that
 * comes back every time the viewer mutes themselves on purpose is just a mute button that argues.
 */
function UnmuteNotice({ opponentName, onUnmute, onDismiss }: PairHeaderNotice & { opponentName: string }) {
  return (
    <div
      data-testid="rematch-unmute-notice"
      className="flex items-center gap-2.5 rounded-lg bg-grey-01 py-1.5 pr-1.5 pl-3 text-metadata text-text"
    >
      <span className="flex shrink-0 text-grey-04 [&>svg]:size-4">
        <MicrophoneIcon muted />
      </span>
      <p className="min-w-0 flex-1">
        You’re in a live room with {firstName(opponentName)}. Unmute to talk while you pick a claim.
      </p>
      <button
        type="button"
        onClick={onUnmute}
        className="h-7 shrink-0 rounded-full border border-grey-02 bg-white px-2.5 text-metadataMedium text-text transition-colors hover:border-grey-03"
      >
        Unmute
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="grid size-7 shrink-0 place-items-center rounded-full text-grey-04 transition-colors hover:text-text"
      >
        <CloseSmall />
      </button>
    </div>
  );
}

/**
 * The nudges, in the header rather than over the corner dock that no longer exists.
 *
 * Both live inside the sticky block, so a viewer who has scrolled a page of claims still sees them
 * next to the button they are about.
 */
function VoiceToast({ toast, opponentName }: { toast: PairHeaderToast; opponentName: string }) {
  const name = firstName(opponentName);

  return (
    <div
      data-testid={`rematch-voice-toast-${toast.kind}`}
      className="flex items-center gap-2.5 self-start rounded bg-text py-1.5 pr-1.5 pl-3 text-metadata text-white shadow-lg"
    >
      {toast.kind === 'talking-while-muted' ? (
        <span className="flex shrink-0 [&>svg]:size-4">
          <MicrophoneIcon muted />
        </span>
      ) : null}
      <span>{toast.kind === 'opponent-talking' ? `${name} is talking.` : 'You’re talking while muted.'}</span>
      <button
        type="button"
        onClick={toast.onUnmute}
        className="h-7 shrink-0 rounded-full bg-white px-2.5 text-metadataMedium text-text transition-opacity hover:opacity-80"
      >
        {toast.kind === 'opponent-talking' ? 'Unmute to reply' : 'Unmute'}
      </button>
      <button
        type="button"
        onClick={toast.onDismiss}
        aria-label="Dismiss"
        className="grid size-7 shrink-0 place-items-center rounded-full text-grey-03 transition-colors hover:text-white"
      >
        <CloseSmall />
      </button>
    </div>
  );
}
