'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import type { ClaimMarker } from '~/core/debates/claim-ticker';
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
import { Pause, Play, Speaker, SpeakerMuted } from './icons';

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
    isResuming,
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
  const ticker = useDebateClaimTicker(debate, {
    playheadMs: playheadSeconds * 1000,
    timelineMs: timelineSeconds * 1000,
    enabled: active || preload,
  });

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
  // Held open by the chip rather than by the pointer — the only way in on a touch screen, where
  // there is no hover to end and so no hover to hold it.
  const [pinnedSlot, setPinnedSlot] = React.useState<number | null>(null);

  /** The same condition the stack is given, so the corner's box can cap itself only when open. */
  const claimsOpenFor = (slot: number) => pointerOverSlot === slot || focusedSlot === slot || pinnedSlot === slot;

  /**
   * Whether this debater's corner is drawing a card right now — which is the same question as
   * whether their name is about to be covered by one, since both sit in the bottom band.
   */
  const cornerHasCard = (slot: number) => {
    if (playbackEnded) return false;
    const shown = claimsOpenFor(slot) ? ticker.historyBySlot.get(slot) : ticker.cardsBySlot.get(slot);
    return (shown?.length ?? 0) > 0;
  };

  const claimsFor = (slot: number) => {
    const cards = ticker.cardsBySlot.get(slot) ?? [];
    const history = ticker.historyBySlot.get(slot) ?? [];
    if (playbackEnded || (cards.length === 0 && history.length === 0)) return null;

    const pinned = pinnedSlot === slot;
    const clearSlot = (current: number | null) => (current === slot ? null : current);

    return (
      <DebateClaimTickerStack
        cards={cards}
        history={history}
        open={claimsOpenFor(slot)}
        pinned={pinned}
        onTogglePinned={() => setPinnedSlot(current => (current === slot ? null : slot))}
        onFocusChange={focused => setFocusedSlot(current => (focused ? slot : clearSlot(current)))}
        participantByClaimId={ticker.participantByClaimId}
        rowsByClaimId={ticker.rowsByClaimId}
        entitiesByClaimId={ticker.entitiesByClaimId}
        onAnswered={ticker.onAnswered}
      />
    );
  };

  /**
   * The pointer entering or leaving one debater's tile.
   *
   * Filtered to a real mouse. Touch browsers synthesise `pointerenter` from a tap, so without this
   * every tap on the video — including the tap that pauses it — would also throw the claim corner
   * open, and nothing would close it again since there is no corresponding leave. On touch the chip
   * is the way in, deliberately and only.
   *
   * Leaving also clears the pin, so a mouse user who clicked the chip and then moved away does not
   * leave the corner stuck open behind them.
   */
  const onTileHover = (slot: number) => (event: React.PointerEvent, hovered: boolean) => {
    if (event.pointerType !== 'mouse') return;
    const clearSlot = (current: number | null) => (current === slot ? null : current);
    setPointerOverSlot(current => (hovered ? slot : clearSlot(current)));
    if (!hovered) setPinnedSlot(clearSlot);
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
        isResuming={isResuming}
        onPlaybackTick={onPlaybackTick}
        onToggle={togglePlayback}
        claims={claimsFor(1)}
        claimsOpen={claimsOpenFor(1)}
        nameHidden={cornerHasCard(1)}
        onClaimsHoverChange={onTileHover(1)}
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
        isResuming={isResuming}
        onPlaybackTick={onPlaybackTick}
        onToggle={togglePlayback}
        claims={claimsFor(2)}
        claimsOpen={claimsOpenFor(2)}
        nameHidden={cornerHasCard(2)}
        onClaimsHoverChange={onTileHover(2)}
        // This is the half the scrubber sits in, so its claim corner is the one that has to lift
        // clear of the bar.
        clearScrubber={scrubberShown ? 'always' : 'on-hover'}
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
  isResuming,
  onPlaybackTick,
  onToggle,
  claims,
  claimsOpen = false,
  nameHidden = false,
  onClaimsHoverChange,
  clearScrubber = 'never',
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
  isResuming: boolean;
  onPlaybackTick: () => void;
  onToggle: () => void;
  /** This debater's claim corner, if they have anything to show right now. */
  claims?: React.ReactNode;
  /** Whether the corner is showing the scrollable backlog rather than the live card. */
  claimsOpen?: boolean;
  /** Whether a claim card is up, in which case this debater's name steps out of its way. */
  nameHidden?: boolean;
  /** The pointer entering or leaving this tile, which opens their backlog. */
  onClaimsHoverChange?: (event: React.PointerEvent, hovered: boolean) => void;
  /** Whether the claim corner has to sit above the scrubber, which only one tile hosts. */
  /** Whether what sits in the bottom band — the claim corner and the debater's name — lifts clear
   * of the scrubber, and whether it does so always or only while the player is hovered. */
  clearScrubber?: 'never' | 'on-hover' | 'always';
  topLeft?: React.ReactNode;
  scrubber?: React.ReactNode;
  scrimClassName?: string;
}) {
  const { openSidePanel } = useEntitySidePanel();
  const name = participant ? speakerLabel(participant) : 'Debater';

  const muted = !audible || mutedByUser;

  /**
   * Re-assert the rendered mute after a resume (GEO-2947).
   *
   * `playBothWithMutedFallback` mutes both elements to retry a blocked play and cannot put them
   * back: it does not know what this component renders `muted` from, and anything it captured is
   * a confirm window out of date by the time it could write it. React will not repair that either
   * — it writes a DOM property only when its *own* previous value differs, and a mute it never
   * made is invisible to it — so the element would play audibly under a UI showing muted.
   *
   * Not while a resume is confirming: the retry depends on the mute it just made, and writing over
   * it mid-attempt would block the play this is trying to let happen. `isResuming` falling is
   * itself what runs this effect again, so the repair lands the moment the attempt is over.
   *
   * This is why `playFromStart` no longer writes `muted` either. The value it has (`mutedByUser`)
   * is not the value rendered here, so repairing from the hook moved the divergence rather than
   * closing it. `muted` has one owner: this render.
   */
  React.useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || isResuming) return;
    video.muted = muted;
  }, [isResuming, muted, src, videoRef]);

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
      onPointerEnter={event => onClaimsHoverChange?.(event, true)}
      onPointerLeave={event => onClaimsHoverChange?.(event, false)}
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
            // The viewer's own mute — plus the listening debater's, where `volume` is a no-op.
            muted={muted}
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

      {/* This debater's claims, in the bottom-right of their own tile. One corner each rather than
          one for the player: a viewer is looking at whoever is talking, and a shared corner asks
          the eye to leave the speaker in order to read what the speaker is saying.

          The height cap is on this box rather than on the list inside it. A percentage max-height
          resolves against the parent's height, and the list's parent is content-sized — so capping
          the list made it 63% of a box it had itself defined, and the whole stack ended up pinned to
          the top of the tile instead of the bottom. Here the percentage is of the tile, which the
          aspect ratio makes definite, and `bottom-3` keeps it anchored where it belongs.

          60% is roughly the 168px of a 291px tile the frame gives the stack. Left to fill the tile
          the open list climbed to the debater's chin — more of their face than it needs, and
          further than the edge fade can dissolve.

          Half the video's width, two lines, capped at 360px — a departure from the frame's 209px
          and three lines, and a deliberate one.

          Measured over all 854 published claims in Calibre at 16/17: at the frame's 209px the
          median claim runs to *four* lines and only 30% are shown whole. Width and lines both buy
          legibility, but width is what keeps the card short, and a short card is what keeps it
          below the speaker's chin — the face is in the middle of the tile, so height costs more
          than width does. Half of the explore card's 484px tile is 242px, where two lines show
          about 15% of claims whole; the rest are a tap away, and the point of this layer is the
          glance rather than the reading.

          The cap is what holds the fullscreen player to the same card: 50% of a 900px tile would
          be 450, which stops being a corner label.

          The name row used to ration this width, because the two share the bottom band. The card
          names its speaker itself, so the row now steps aside while a card is up (`nameHidden`).

          A phone splits the difference by state rather than picking one width. A live card takes
          the whole tile — 93% of ~361px is 337, a 313px line, where two lines hold about 45% of
          claims whole — because one claim over a video is there to be read at a glance and there
          is nothing else in the band to share with. The backlog drops back to 62%, because a list
          you have opened to scroll through should leave the debate visible behind it, and that is
          also where the dissolve earns its place again.

          `items-end` because that cap is a cap, not a width. A flex column stretches its children
          by default, which drew the little claims chip as a 209px bar with two words adrift in it.
          The cards ask for the full width themselves; everything else here should be its own size,
          against the edge the corner is anchored to.

          The 60% cap applies only while the list is open, and that is load-bearing. `justify-end`
          overflows *downward* once its content is taller than the box — measured at 253px of cards
          in a 175px box, putting the newest card 78px below the corner, where the tile's own
          `overflow-hidden` cut it in half at the seam. The open list cannot overflow because it
          scrolls; the live card is one card tall and needs no cap at all. */}
      {claims && (
        <div
          className={cx(
            'pointer-events-none absolute right-3 bottom-3 z-10 flex w-[50%] max-w-[22.5rem] flex-col items-end justify-end transition-[padding-bottom] duration-150',
            // A phone gives the live card the whole tile, and takes it back for the backlog: one
            // claim over a video wants to be read at a glance, where a list you have opened to
            // scroll wants to leave the debate visible behind it.
            claimsOpen ? 'md:w-[62%]' : 'md:w-[93%]',
            // Only the open list needs holding back; the live card is one card tall.
            claimsOpen && 'max-h-[60%]',
            // `pb-5` clears `FeedScrubber`'s own `h-5` band — keep the two in step. Every spelling
            // is written out because Tailwind generates classes by scanning this source text, so a
            // composed `group-hover:${…}` would produce a rule that does not exist.
            clearScrubber === 'always' && 'pb-5',
            clearScrubber === 'on-hover' && 'group-hover:pb-5'
          )}
        >
          {claims}
        </div>
      )}

      {/* Debater identity, opens their personal space in the side panel. On the left, opposite the
          claim corner.

          Back to a generous 55%: this no longer rations the claim corner's width, because it gives
          way to a card rather than sitting beside one. The cost is that the debater's profile is
          not reachable from here while a claim is up — it is a link as well as a label — which is
          most of a debate in the other direction, since the corner is empty far more than it is
          full. */}
      <button
        type="button"
        onClick={openProfile}
        className={cx(
          'absolute bottom-3 left-4 z-10 flex max-w-[55%] items-center gap-2 text-left transition-[padding-bottom,opacity] duration-150',
          // Out of the card's way, because the card already says who is speaking — the same avatar
          // and the same name, on its own first line. Two of them in one band is a repetition the
          // corner has to be narrow to avoid, and the corner is the thing worth the space.
          nameHidden && 'pointer-events-none opacity-0',
          // Lifts with the claim stack, and for the same reason: the name shares the bottom band
          // with the scrubber, so the scrubber appearing would otherwise draw a track through it.
          // Padding rather than `bottom`, because the box is pinned by its bottom edge — the
          // padding grows it upward and carries the content with it.
          clearScrubber === 'always' && 'pb-5',
          clearScrubber === 'on-hover' && 'group-hover:pb-5'
        )}
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
