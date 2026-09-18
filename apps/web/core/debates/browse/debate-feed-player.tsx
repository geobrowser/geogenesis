'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import { type TurnState, clampSeconds, speakerLabel } from '~/core/debates/playback-utils';
import { useDebatePlayback } from '~/core/debates/use-debate-playback';
import type { DebateVotesResult } from '~/core/debates/use-debate-votes';
import { usePlaybackAnalytics } from '~/core/debates/use-playback-analytics';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useSpace } from '~/core/hooks/use-space';

import { Avatar } from '~/design-system/avatar';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Text } from '~/design-system/text';

import { ClaimScrubberMarkers, DebateClaimTickerStack, useDebateClaimTicker } from './debate-claim-ticker';
import { DebateScorecard } from './debate-scorecard';
import { Pause, Play, Speaker, SpeakerMuted } from './icons';
import type { ClaimMarker } from '~/core/debates/claim-ticker';

type DebateFeedPlayerProps = {
  debate: Debate;
  active: boolean;
  /**
   * Load this debate's recordings without playing them — for the card the viewer is about to
   * reach. Resolving the two signed URLs is a round trip each, and until they land
   * `DebateFeedPlayer` renders the "Loading…" placeholder instead of a <video>, which is what
   * makes arriving at a card feel glitchy (GEO-2895).
   */
  preload?: boolean;
  votes: DebateVotesResult;
};

export function DebateFeedPlayer({ debate, active, preload = false, votes }: DebateFeedPlayerProps) {
  const { hasVoted } = votes;
  // Loading is deliberately wider than playing. `useDebatePlayback`'s flag gates only the URL
  // fetch and the transcript query — playback is driven by `active` in the effect below — so a
  // preloading card fetches without autoplaying off-screen.
  const controller = useDebatePlayback(debate, active || preload);
  const measurement = usePlaybackAnalytics(debate, active, controller);
  const {
    slot1VideoRef,
    slot2VideoRef,
    slot1Participant,
    slot2Participant,
    urls,
    ready,
    error,
    playing,
    userPaused,
    isScrubbing,
    playbackEnded,
    mutedByUser,
    setMutedByUser,
    playheadSeconds,
    timelineSeconds,
    turnState,
    subtitle,
    onPlaybackTick,
    togglePlayback: togglePlaybackRaw,
    playFromStart: playFromStartRaw,
    resumeBoth,
    suspend,
    seekBoth: seekBothRaw,
    beginScrub,
    endScrub,
  } = controller;
  const togglePlayback = () => {
    measurement.control(playing ? 'pause' : playbackEnded ? 'replay' : 'play');
    togglePlaybackRaw();
  };
  const playFromStart = () => {
    measurement.control('replay');
    void playFromStartRaw();
  };
  const seekBoth = (seconds: number) => {
    measurement.control('seek');
    seekBothRaw(seconds);
  };

  // Autoplay the debate that's in view; pause the rest. Respect an explicit
  // user pause so scrolling back doesn't fight the viewer, and don't resume
  // mid-scrub.
  React.useEffect(() => {
    if (!ready) return;
    if (active && !userPaused && !isScrubbing && !playing && !playbackEnded) {
      void resumeBoth();
    } else if (!active && playing) {
      suspend();
    }
  }, [active, isScrubbing, playbackEnded, playing, ready, resumeBoth, suspend, userPaused]);

  // The live claim layer. Loaded alongside the recordings so a card is ready the moment the claim
  // it belongs to is spoken, rather than appearing a beat late on the first one.
  const ticker = useDebateClaimTicker(debate, playheadSeconds * 1000, active || preload);

  const showControls = ready && (userPaused || (playbackEnded && !hasVoted));
  // Play/pause is always up. It is the control a viewer reaches for without looking, and hiding it
  // until hover meant there was no visible way to stop a video that had already started. Mute
  // recedes once the viewer has turned the sound on and has no more use for it; while muted it
  // stays, because feed debates autoplay silent and it is the only way to find the audio.
  const recede = 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100';
  const idle = !playing || playbackEnded;

  // Whether the scrubber is on screen, which the claim stack has to know as well as the scrubber
  // itself — it sits in the same bottom band and lifts clear of it. Hover is the remaining case and
  // stays in CSS (`group-hover` on both), since neither element can ask about the other in a class.
  //
  // Keyboard focus is here rather than a `focus-within:` variant for exactly that reason: tabbing
  // to the timeline has to raise the cards too, and a sibling cannot see focus land inside the
  // scrubber. Guarded on `relatedTarget` so moving between the markers and the range input — both
  // inside the wrapper — does not blink it off and on.
  const [timelineFocused, setTimelineFocused] = React.useState(false);
  const scrubberShown = showControls || timelineFocused;

  // Which debater's corner is showing their backlog rather than their live cards.
  //
  // Pointer state is tracked per tile rather than on the stack itself, because the backlog has to
  // open from anywhere over that debater's half. A claim card is on screen for a few seconds at a
  // time, so a hover target made of the cards is a target that is usually not there — and "hover to
  // see what they said" has to work in the silences, which is most of a debate.
  //
  // Per tile rather than per player so the two corners stay independent: pointing at one debater
  // opens their claims and leaves the other's alone, which is the whole reason for splitting them.
  const [pointerOverSlot, setPointerOverSlot] = React.useState<number | null>(null);
  const [focusedSlot, setFocusedSlot] = React.useState<number | null>(null);
  const claimsOpenFor = (slot: number) => pointerOverSlot === slot || focusedSlot === slot;

  const claimsFor = (slot: number) => {
    const cards = ticker.cardsBySlot.get(slot) ?? [];
    const history = ticker.historyBySlot.get(slot) ?? [];
    const open = claimsOpenFor(slot);
    if (playbackEnded || (cards.length === 0 && !(open && history.length > 0))) return null;

    return (
      <DebateClaimTickerStack
        cards={cards}
        history={history}
        open={open}
        onFocusChange={focused => setFocusedSlot(current => (focused ? slot : current === slot ? null : current))}
        participantByClaimId={ticker.participantByClaimId}
        rowsByClaimId={ticker.rowsByClaimId}
        entitiesByClaimId={ticker.entitiesByClaimId}
        onAnswered={ticker.onAnswered}
      />
    );
  };

  return (
    // No gap and one radius on the outside: the two tiles are a single surface in the Figma frame,
    // which is what lets the subtitle straddle the seam instead of sitting inside one of them.
    <div ref={measurement.elementRef} className="group relative flex flex-col overflow-hidden rounded-xl">
      <DebaterVideo
        participant={slot1Participant}
        src={urls.slot1}
        videoRef={slot1VideoRef}
        audible={playing && turnState?.slot === 1}
        countdown={playing && turnState?.slot === 1 ? turnState : null}
        mutedByUser={mutedByUser}
        onPlaybackTick={onPlaybackTick}
        onToggle={togglePlayback}
        claims={claimsFor(1)}
        onClaimsHoverChange={hovered => setPointerOverSlot(current => (hovered ? 1 : current === 1 ? null : current))}
        topLeft={
          ready ? (
            <>
              <ControlCircle
                ariaLabel={playing ? 'Pause debate' : playbackEnded ? 'Replay debate' : 'Play debate'}
                onClick={playbackEnded ? playFromStart : togglePlayback}
              >
                {playing ? <Pause size={15} /> : playbackEnded ? <RetrySmall /> : <Play size={15} />}
              </ControlCircle>
              <ControlCircle
                ariaLabel={mutedByUser ? 'Unmute' : 'Mute'}
                onClick={() => {
                  measurement.control(mutedByUser ? 'unmute' : 'mute');
                  setMutedByUser(current => !current);
                }}
                className={mutedByUser || idle ? undefined : recede}
              >
                {mutedByUser ? <SpeakerMuted size={20} /> : <Speaker size={20} />}
              </ControlCircle>
            </>
          ) : null
        }
      />
      <DebaterVideo
        participant={slot2Participant}
        src={urls.slot2}
        videoRef={slot2VideoRef}
        audible={playing && turnState?.slot === 2}
        countdown={playing && turnState?.slot === 2 ? turnState : null}
        mutedByUser={mutedByUser}
        onPlaybackTick={onPlaybackTick}
        onToggle={togglePlayback}
        claims={claimsFor(2)}
        onClaimsHoverChange={hovered => setPointerOverSlot(current => (hovered ? 2 : current === 2 ? null : current))}
        // This is the half the scrubber sits in, so its claim corner is the one that has to lift
        // clear of the bar.
        claimsClearScrubber={scrubberShown ? 'always' : 'on-hover'}
        // Taller than the top tile's, per the frame.
        scrimClassName="h-[4.625rem]"
        scrubber={
          ready ? (
            // Always available so the viewer can seek. During playback it recedes to
            // hover-only and drops pointer-events so it can't swallow play/pause taps.
            // `pointer-events-none` does not stop keyboard focus reaching the range input, which
            // is what brings it back up for a viewer who never touches the pointer.
            <div
              onFocus={() => setTimelineFocused(true)}
              onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTimelineFocused(false);
              }}
              className={cx(
                'transition-opacity',
                scrubberShown
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
              )}
            >
              <FeedScrubber
                currentTime={playheadSeconds}
                duration={timelineSeconds}
                markers={ticker.markers}
                onSeek={seekBoth}
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
              />
            </div>
          ) : null
        }
      />

      {/* Straddling the seam between the tiles, which is the one strip of the player that is never
          a face — and the one place it cannot land on top of the claim stack.

          `text-box` trims the line box to the cap-height band, which is what makes the *glyphs*
          centre on the seam rather than the box that contains them. Calibre's metrics are
          asymmetric, so a plainly-centred pill puts the type about 2px low — visible on a rule the
          eye is already using the seam as. Figma's own frame specifies the same trim. Browsers
          without it fall back to the box being centred, which is where this started. */}
      {subtitle && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 z-20 max-w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-black/78 px-1.5 py-1.5 text-center text-[1rem] leading-tight text-white [text-box:trim-both_cap_alphabetic]">
          {subtitle}
        </span>
      )}

      {/* Dimmed behind, so the card reads as the moment the debate arrives at rather than a note
          stuck over two frozen faces. */}
      {ready && playbackEnded && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-3">
          <DebateScorecard debate={debate} ticker={ticker} votes={votes} onReplay={playFromStart} />
        </div>
      )}

      {error && (
        <Text as="p" variant="metadata" color="red-01" className="absolute inset-x-0 -bottom-6 text-center">
          {error}
        </Text>
      )}
    </div>
  );
}

function DebaterVideo({
  participant,
  src,
  videoRef,
  audible,
  countdown,
  mutedByUser,
  onPlaybackTick,
  onToggle,
  claims,
  onClaimsHoverChange,
  claimsClearScrubber = 'never',
  topLeft,
  scrubber,
  scrimClassName = 'h-14',
}: {
  participant: DebateParticipant | null;
  src: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audible: boolean;
  countdown: TurnState;
  mutedByUser: boolean;
  onPlaybackTick: () => void;
  onToggle: () => void;
  /** This debater's claim corner, if they have anything to show right now. */
  claims?: React.ReactNode;
  /** The pointer entering or leaving this tile, which opens their backlog. */
  onClaimsHoverChange?: (hovered: boolean) => void;
  /** Whether the claim corner has to sit above the scrubber, which only one tile hosts. */
  claimsClearScrubber?: 'never' | 'on-hover' | 'always';
  topLeft?: React.ReactNode;
  scrubber?: React.ReactNode;
  scrimClassName?: string;
}) {
  const { openSidePanel } = useEntitySidePanel();
  const name = participant ? speakerLabel(participant) : 'Debater';

  // A personal space's own id resolves to its "system entity" (an ugly technical
  // record). The space's page entity is the real profile, so open that once it's
  // loaded and fall back to the space id while it's still fetching.
  const { space } = useSpace(participant?.profile_space_id);
  const profileEntityId = space?.entity.id || participant?.profile_space_id;

  const openProfile = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (participant && profileEntityId) openSidePanel(profileEntityId, participant.profile_space_id, false);
  };

  return (
    <div
      onMouseEnter={() => onClaimsHoverChange?.(true)}
      onMouseLeave={() => onClaimsHoverChange?.(false)}
      className="relative aspect-480/289 w-full overflow-hidden bg-grey-01"
    >
      {/* Clicking anywhere on the video toggles pause/play. */}
      <button type="button" aria-label="Pause or play" onClick={onToggle} className="absolute inset-0 z-0">
        {src ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            preload="metadata"
            src={src}
            muted={!audible || mutedByUser}
            onEnded={onPlaybackTick}
            onLoadedMetadata={onPlaybackTick}
            onPause={onPlaybackTick}
            onPlay={onPlaybackTick}
            onTimeUpdate={onPlaybackTick}
          />
        ) : (
          <div className="grid h-full place-items-center bg-bg text-grey-04">Loading…</div>
        )}
      </button>

      {/* Bottom gradient scrim for legibility of the overlaid controls. All the way to black, per
          the frame — the name that sits on it is regular weight and carries no text shadow. */}
      <div
        className={cx(
          'pointer-events-none absolute inset-x-0 bottom-0 z-1 bg-linear-to-b from-black/0 to-black',
          scrimClassName
        )}
      />

      {topLeft && <div className="absolute top-3 left-3 z-10 flex items-center gap-2">{topLeft}</div>}

      {countdown && <CountdownBadge seconds={countdown.seconds} progress={countdown.progress} />}

      {/* This debater's claims, in the bottom-left of their own tile. One corner each rather than
          one for the player: a viewer is looking at whoever is talking, and a shared corner asks
          the eye to leave the speaker in order to read what the speaker is saying.

          `inset-y-*` rather than a bare `bottom`: the corner opens into everything they have said,
          and a percentage max-height inside it needs a containing block with a height to be a
          percentage *of*. Anchored to the bottom by `justify-end` instead, which also caps the open
          list at this debater's own tile — it can never reach over the other one's face.

          Capped at the 209px the frame draws it at. The explore card is 484px wide, where 43% comes
          out at exactly that; the fullscreen player is far wider, and letting the card scale with it
          would hold a paragraph and stop being a glance. */}
      {claims && (
        <div
          className={cx(
            'pointer-events-none absolute inset-y-3 left-3 z-10 flex w-[43%] max-w-[13.0625rem] flex-col justify-end transition-[padding-bottom] duration-150',
            // `pb-5` clears `FeedScrubber`'s own `h-5` band — keep the two in step. Every spelling
            // is written out because Tailwind generates classes by scanning this source text, so a
            // composed `group-hover:${…}` would produce a rule that does not exist.
            claimsClearScrubber === 'always' && 'pb-5',
            claimsClearScrubber === 'on-hover' && 'group-hover:pb-5'
          )}
        >
          {claims}
        </div>
      )}

      {/* Debater identity, opens their personal space in the side panel. On the right, because the
          left of the bottom band is where the claim stack now lives. */}
      <button
        type="button"
        onClick={openProfile}
        className="absolute right-4 bottom-3 z-10 flex max-w-[55%] items-center gap-2 text-left"
      >
        <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-white">
          <Avatar avatarUrl={participant?.avatar_cid} value={participant?.profile_space_id} size={20} />
        </span>
        <span className="truncate text-[1rem] tracking-[-0.35px] text-white">{name}</span>
      </button>

      {scrubber && <div className="absolute inset-x-0 bottom-0 z-10">{scrubber}</div>}
    </div>
  );
}

function CountdownBadge({ seconds, progress }: { seconds: number; progress: number }) {
  // The ring shows time remaining, so it shrinks as the turn elapses rather than filling up.
  const remaining = 1 - Math.max(0, Math.min(1, progress));
  const degrees = remaining * 360;
  return (
    <div className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-linear-to-b from-black/50 to-black/25">
      <span
        className="col-start-1 row-start-1 size-7 rounded-full"
        style={{
          backgroundImage: `conic-gradient(#ffffff ${degrees}deg, rgba(255,255,255,0.3) 0deg)`,
          // Hollowed into a 2px ring so the badge's own translucent backing shows through the
          // middle. The frame draws a stroked circle; a filled disc would print the number on a
          // grey plate the design does not have.
          maskImage: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
          WebkitMaskImage: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
        }}
      />
      <span className="col-start-1 row-start-1 grid place-items-center text-[1.0625rem] leading-none font-medium text-white tabular-nums">
        {Math.ceil(seconds)}
      </span>
    </div>
  );
}

function ControlCircle({
  children,
  ariaLabel,
  onClick,
  className,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className={cx('grid size-10 place-items-center rounded-full bg-white text-text shadow-light', className)}
    >
      {children}
    </button>
  );
}

// Only the keys that actually move a range thumb should pause playback. Firing on every
// key means Tab/Shift while the slider is focused would start a scrub whose keyup lands on
// another element, leaving playback stuck paused.
const isScrubKey = (key: string) =>
  key.startsWith('Arrow') || key === 'Home' || key === 'End' || key === 'PageUp' || key === 'PageDown';

function FeedScrubber({
  currentTime,
  duration,
  markers,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  currentTime: number;
  duration: number;
  markers: ClaimMarker[];
  onSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}) {
  const bounded = clampSeconds(currentTime, duration);
  const progress = duration > 0 ? (bounded / duration) * 100 : 0;
  return (
    <div className="relative flex h-5 items-center px-3 [--track-height:5px]">
      <div className="relative h-(--track-height) w-full overflow-hidden rounded-full bg-white/40">
        <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress}%` }} />
      </div>
      {/* Above the track and below the range input, so a marker is clickable but a drag anywhere
          along the bar still scrubs. */}
      <ClaimScrubberMarkers markers={markers} onSeek={ms => onSeek(ms / 1000)} className="z-1" />
      <span
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
        style={{ left: `calc(12px + ${progress}% * (100% - 24px) / 100%)` }}
      />
      <input
        className="absolute inset-0 z-2 m-0 h-5 w-full cursor-pointer appearance-none bg-transparent opacity-0"
        type="range"
        min="0"
        max={duration > 0 ? duration : 1}
        step="0.05"
        value={bounded}
        aria-label="Debate timeline"
        onChange={event => onSeek(Number(event.currentTarget.value))}
        // Pause playback for the duration of the drag so the play clock doesn't fight the
        // seek. onLostPointerCapture reliably fires when a range drag ends (the input
        // captures the pointer on pointerdown), even if the pointer leaves the thumb.
        onPointerDown={onScrubStart}
        onPointerUp={onScrubEnd}
        onLostPointerCapture={onScrubEnd}
        onKeyDown={e => isScrubKey(e.key) && onScrubStart()}
        onKeyUp={e => isScrubKey(e.key) && onScrubEnd()}
      />
    </div>
  );
}
