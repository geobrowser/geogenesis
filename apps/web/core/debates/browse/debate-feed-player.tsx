'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import type { ClaimMarker } from '~/core/debates/claim-ticker';
import { DebateTileChip, tileChipSurface } from '~/core/debates/debate-video-tile';
import { type TurnState, clampSeconds, speakerLabel } from '~/core/debates/playback-utils';
import { useDebatePlayback } from '~/core/debates/use-debate-playback';
import { usePlaybackAnalytics } from '~/core/debates/use-playback-analytics';
import { reattachVideoSource, releaseVideo } from '~/core/utils/video/release-video';

import { Avatar } from '~/design-system/avatar';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Text } from '~/design-system/text';

import { ClaimScrubberMarkers, DebateClaimTickerStack, useDebateClaimTicker } from './debate-claim-ticker';
import { Pause, Play, Speaker, SpeakerMuted } from './icons';
import { useOpenDebaterProfile } from './use-open-debater-profile';

/**
 * How many times a tile will rebuild a recording whose media pipeline died, per source (GEO-2985).
 *
 * The failure is Chrome giving up on one of the two cue-less WebM recordings — `error.code === 2`,
 * `PIPELINE_ERROR_READ: FFmpegDemuxer: demuxer seek failed` — after the element has sat in the
 * feed's look-ahead preload long enough for the browser to suspend its fetch and then resume it.
 * Nothing in the pair notices, so the tile stays blank for as long as the card is on screen while
 * its partner plays on beside it: the reported "one debater's video never loads in the explore
 * feed, but the same debate is fine full screen", where a card is reached within seconds of being
 * mounted and the window for this is far narrower.
 *
 * Three, because the repair either works on the first attempt or the source is genuinely
 * unreadable, and a retry costs a fresh fetch of a multi-megabyte recording. The budget is per
 * source rather than per element so a card that is re-ranked onto a different debate starts over.
 */
const MAX_MEDIA_RECOVERY_ATTEMPTS = 3;
/**
 * Spacing between those attempts, multiplied by the attempt number.
 *
 * Long enough that a transient fetch failure has a chance to be over, short enough that a viewer
 * looking at the card sees it heal rather than reload.
 */
const MEDIA_RECOVERY_BACKOFF_MS = 400;

/** How every big round control in the player looks, wherever it is put. */
const PLAYBACK_CONTROL_CIRCLE_CLASS = 'size-16 place-items-center rounded-full bg-white text-text shadow-card';
const CENTERED_PLAYBACK_CONTROL_CLASS = `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${PLAYBACK_CONTROL_CIRCLE_CLASS}`;

type DebateFeedPlayerProps = {
  debate: Debate;
  active: boolean;
  /** Remove claim overlays and suppress audible subtitles in constrained card layouts. */
  reducedOverlays?: boolean;
  /**
   * Load this debate's recordings without playing them — for the card the viewer is about to
   * reach. Resolving the two signed URLs is a round trip each, and until they land
   * `DebateFeedPlayer` renders the "Loading…" placeholder instead of a <video>, which is what
   * makes arriving at a card feel glitchy (GEO-2895).
   */
  preload?: boolean;
};

export function DebateFeedPlayer({ debate, active, preload = false, reducedOverlays = false }: DebateFeedPlayerProps) {
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
    autoplayBlocked,
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
    resyncSlot,
    refreshSlotUrl,
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

  /**
   * Stopped, and only a tap will start it.
   *
   * The two ways in are different facts — the viewer paused, or the browser
   * refused — and identical from here: the video is not running and the control
   * is the only answer either accepts.
   */
  const awaitingTap = userPaused || autoplayBlocked;

  // Autoplay the debate that's in view; pause the rest. Respect an explicit
  // user pause so scrolling back doesn't fight the viewer, and don't resume
  // mid-scrub.
  React.useEffect(() => {
    if (!ready) return;
    // A refusal is not retried: the browser gives the same answer every time, and
    // only the viewer's tap is a gesture it will accept.
    if (active && !awaitingTap && !isScrubbing && !playing && !playbackEnded) {
      void resumeBoth();
    } else if (!active && playing) {
      suspend();
    }
  }, [active, awaitingTap, isScrubbing, playbackEnded, playing, ready, resumeBoth, suspend]);

  // The live claim layer. Loaded alongside the recordings so a card is ready the moment the claim
  // it belongs to is spoken, rather than appearing a beat late on the first one.
  const ticker = useDebateClaimTicker(debate, {
    playheadMs: playheadSeconds * 1000,
    timelineMs: timelineSeconds * 1000,
    enabled: (active || preload) && !reducedOverlays,
  });

  const showReplay = ready && playbackEnded;
  const showControls = ready && (awaitingTap || showReplay);
  // An ended debate always offers a replay; a stopped one shows the paused glyph.
  const showPausedGlyph = ready && awaitingTap && !playbackEnded;

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
  /**
   * The slot whose backlog the pointer has opened, held until the pointer leaves that tile.
   *
   * A latch rather than a live test of where the pointer is. Reaching the backlog means crossing
   * into it, and a rule that closed the moment the pointer came back down would put the cards
   * permanently out of reach — no scrolling it, no expanding a claim, no answering one. So the
   * pointer opens it by going above the live card, and then the tile holds it open.
   */
  const [backlogHoverSlot, setBacklogHoverSlot] = React.useState<number | null>(null);

  /** The same condition the stack is given, so the corner's box can cap itself only when open. */
  const claimsOpenFor = (slot: number) => {
    // A backlog opened on purpose stays open, and a claim arriving lands at the bottom of it —
    // that is the whole point of having opened it. Same for a keyboard that has tabbed into it.
    if (pinnedSlot === slot || focusedSlot === slot) return true;
    return pointerOverSlot === slot && backlogHoverSlot === slot;
  };

  /**
   * The top edge of the live card, in viewport coordinates, per slot.
   *
   * Remembered rather than measured live, because opening the backlog makes the corner taller and
   * moves its top edge up past the pointer. Test against that and the pointer would be above the
   * corner, then inside it, then above it again — the list would flicker open and shut under a
   * stationary mouse. The line stays where the *card* drew it.
   */
  const liveCornerTop = React.useRef(new Map<number, number>());

  /**
   * The pointer moving over, or leaving, one debater's tile.
   *
   * Filtered to a real mouse. Touch browsers synthesise `pointerenter` from a tap, so without this
   * every tap on the video — including the tap that pauses it — would throw the claim corner open,
   * and nothing would close it again since there is no corresponding leave. On touch the chip is
   * the way in, deliberately and only.
   *
   * Leaving also clears the pin, so a mouse user who clicked the chip and then moved away does not
   * leave the corner stuck open behind them.
   */
  const onTileHover = (slot: number) => (event: React.PointerEvent, hovered: boolean) => {
    if (event.pointerType !== 'mouse') return;
    const clearSlot = (current: number | null) => (current === slot ? null : current);

    if (!hovered) {
      setPointerOverSlot(clearSlot);
      setBacklogHoverSlot(clearSlot);
      setPinnedSlot(clearSlot);
      liveCornerTop.current.delete(slot);
      return;
    }

    setPointerOverSlot(slot);

    const live = (ticker.cardsBySlot.get(slot)?.length ?? 0) > 0;
    // Measured only while the card itself is what the corner is drawing. Once the backlog is open
    // the remembered edge is the one that counts, and reading the box again would move the line.
    // Skipped entirely with nothing live, which is most of a debate and the whole cost here.
    if (live && !claimsOpenFor(slot)) {
      const corner = event.currentTarget.querySelector('[data-claim-corner]');
      if (corner) liveCornerTop.current.set(slot, corner.getBoundingClientRect().top);
    }

    setBacklogHoverSlot(current => {
      if (current === slot) return current;
      // Nothing being presented: the backlog answers to the tile as a whole.
      if (!live) return slot;
      // A claim is up, so only the video above it asks for the backlog. The card's own band belongs
      // to the card, and a pointer resting there cannot swap the claim out mid-sentence.
      const edge = liveCornerTop.current.get(slot);
      return edge !== undefined && event.clientY < edge ? slot : current;
    });
  };

  /**
   * Whether slot's corner has a stack at all. `claimsFor` draws nothing when this is false.
   *
   * Lifted out of it so the effect below can watch the same condition: both latches that open the
   * backlog are held up here, and a stack that has gone cannot release either one.
   */
  const stackShownFor = (slot: number) => {
    if (reducedOverlays) return false;
    if (playbackEnded) return false;
    return (ticker.cardsBySlot.get(slot)?.length ?? 0) > 0 || (ticker.historyBySlot.get(slot)?.length ?? 0) > 0;
  };

  const slot1StackShown = stackShownFor(1);
  const slot2StackShown = stackShownFor(2);

  /**
   * Let go of a corner whose stack has been taken away.
   *
   * `focusedSlot` is cleared only by the stack's own `onBlur`, and a focused element removed from
   * the document fires no `blur` — the ticker's suite asserts that absence directly. So a viewer
   * who tabs into the backlog and then reaches the end of the debate, or scrolls the tile out of
   * the preload window, left the slot latched: on replay the corner opened straight into backlog
   * mode with nothing in it, and nothing short of tabbing back in and out closed it again.
   *
   * `pinnedSlot` has the same hole on a touch screen, where the only other release is a
   * `pointerleave` that early-returns on anything but a mouse — so both are cleared here.
   */
  React.useEffect(() => {
    const releaseIfGone = (shown: boolean, slot: number) => {
      if (shown) return;
      const clear = (current: number | null) => (current === slot ? null : current);
      setFocusedSlot(clear);
      setPinnedSlot(clear);
    };

    releaseIfGone(slot1StackShown, 1);
    releaseIfGone(slot2StackShown, 2);
  }, [slot1StackShown, slot2StackShown]);

  const claimsFor = (slot: number) => {
    const cards = ticker.cardsBySlot.get(slot) ?? [];
    const history = ticker.historyBySlot.get(slot) ?? [];
    if (!stackShownFor(slot)) return null;

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

  // Clicking the video briefly flashes the action it just took — feedback only, not a control.
  const [flash, setFlash] = React.useState<{ icon: 'play' | 'pause'; visible: boolean }>({
    icon: 'play',
    visible: false,
  });
  const flashTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    },
    []
  );
  const toggleFromVideo = () => {
    setFlash({ icon: playing ? 'pause' : 'play', visible: true });
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlash(current => ({ ...current, visible: false })), 600);
    togglePlayback();
  };

  return (
    <div
      ref={measurement.elementRef}
      /*
       * The player's state, readable from outside React.
       *
       * Autoplay faults here are device-specific — iOS refuses in Low Power Mode
       * and headless engines do not — so the machine that reproduces them is
       * rarely one with a debugger attached. These four booleans are what
       * `PlaybackDiagnostics` reports, and what an inspector on a phone can read
       * without one. They are the difference between "the browser refused" and
       * "the app never noticed", which look identical on screen.
       */
      data-debate-ready={ready ? 'true' : 'false'}
      data-debate-active={active ? 'true' : 'false'}
      data-debate-playing={playing ? 'true' : 'false'}
      data-debate-autoplay-blocked={autoplayBlocked ? 'true' : 'false'}
      // No gap and one radius on the outside: the two tiles are a single surface in the Figma
      // frame, which is what lets the subtitle straddle the seam rather than sit inside one tile.
      // 12px in the compact gallery (a profile's or claim's Activity), 16px in the feeds.
      className={cx('group relative flex flex-col overflow-hidden', reducedOverlays ? 'rounded-lg' : 'rounded-xl')}
    >
      <DebaterVideo
        participant={slot1Participant}
        src={urls.slot1}
        videoRef={slot1VideoRef}
        audible={playing && turnState?.slot === 1}
        countdown={playing && turnState?.slot === 1 ? turnState : null}
        mutedByUser={mutedByUser}
        isResuming={isResuming}
        onPlaybackTick={onPlaybackTick}
        onRecovered={() => resyncSlot(1)}
        onExhausted={() => void refreshSlotUrl(1)}
        onToggle={toggleFromVideo}
        claims={claimsFor(1)}
        claimsOpen={claimsOpenFor(1)}
        onClaimsHoverChange={onTileHover(1)}
        topLeft={
          ready && !playbackEnded ? (
            <div className="flex items-center gap-2">
              {/* Desktop: a persistent play/pause beside the mute control. Mobile keeps the
                  centred paused glyph and tap-to-toggle instead. */}
              <ControlCircle
                ariaLabel={playing ? 'Pause debate' : 'Play debate'}
                onClick={togglePlayback}
                className="md:hidden"
              >
                {playing ? <Pause /> : <Play />}
              </ControlCircle>
              {/* Feed debates autoplay muted, so the unmute control stays visible during
                  playback — otherwise there's no way to hear audio. Once unmuted it recedes
                  to hover-only on desktop; touch has no hover, so on mobile it stays visible
                  or there'd be no way to find it again.

                  `no-hover:` as well as `md:`, because the two ask different questions. A tablet
                  held in landscape is wider than the `md` breakpoint and still has no hover, so
                  width alone left the control faded out but tappable there — a tap aimed at
                  play/pause muted the debate instead, with nothing able to bring the control back. */}
              <ControlCircle
                ariaLabel={mutedByUser ? 'Unmute' : 'Mute'}
                onClick={() => {
                  measurement.control(mutedByUser ? 'unmute' : 'mute');
                  setMutedByUser(current => !current);
                }}
                className={
                  mutedByUser
                    ? undefined
                    : 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:opacity-100 no-hover:opacity-100'
                }
              >
                {mutedByUser ? <SpeakerMuted /> : <Speaker />}
              </ControlCircle>
            </div>
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
        onRecovered={() => resyncSlot(2)}
        onExhausted={() => void refreshSlotUrl(2)}
        onToggle={toggleFromVideo}
        claims={claimsFor(2)}
        claimsOpen={claimsOpenFor(2)}
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
                  : // `[&_button]:` as well as the wrapper itself, because the claim markers inside
                    // set `pointer-events-auto` on themselves — they have to, so a drag can pass
                    // between them to the range input underneath. An explicit value beats an
                    // inherited one, so `pointer-events-none` here never reached them and a fully
                    // transparent marker stayed clickable: a click meant to pause the video seeked
                    // it instead. The descendant selector outranks the marker's own class.
                    //
                    // Focusability is deliberately untouched. Tabbing to a marker sets
                    // `timelineFocused`, which is what brings the scrubber back into view, so the
                    // keyboard route in depends on them staying in the tab order while hidden.
                    'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 [&_button]:pointer-events-none group-hover:[&_button]:pointer-events-auto'
              )}
            >
              <FeedScrubber
                currentTime={playheadSeconds}
                duration={timelineSeconds}
                markers={reducedOverlays ? [] : ticker.markers}
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
          without it fall back to the box being centred, which is where this started.

          `w-max` is what makes the cap above it mean anything. An absolutely positioned box with
          `left: 50%` and an automatic width is shrink-to-fit against the space *from that point to
          the container's edge* — half the tile — so the caption wrapped at 178px however high the
          max-width was set, and raising the cap to 90% changed nothing at all. Sizing to
          max-content and letting the cap do the clamping is the fix: measured on a 355px phone
          tile, the same caption goes from 178px over three lines to 239px over two.

          90% of the width on a phone, 70% above it. A subtitle is one whole transcript segment and
          those are short: across 7,359 of them the median is 27 characters, the 99th is 33, and the
          longest in the corpus is 41. At the explore card's 484px tile 70% leaves 327px of line and
          the longest segment measures 284, so on a desktop they already never wrap and widening
          would only loosen the pill around the same one line. A ~355px phone tile leaves 236px,
          which is where a segment starts folding onto a second line and taking the caption off the
          seam. */}
      {subtitle && (!reducedOverlays || (active && playing && mutedByUser)) && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 z-20 w-max max-w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-black/78 px-1.5 py-1.5 text-center text-[1rem] leading-tight text-white [text-box:trim-both_cap_alphabetic] md:max-w-[90%]">
          {subtitle}
        </span>
      )}

      {/* The replay and resume states are mutually exclusive, so they share one centered control.
          Replay is shown at every width; the ordinary paused control stays mobile-only because
          desktop retains its persistent corner play/pause control while playback is in progress. */}
      {(showReplay || showPausedGlyph) && (
        <button
          type="button"
          aria-label={showReplay ? 'Replay debate' : 'Resume debate'}
          onClick={showReplay ? playFromStart : togglePlayback}
          className={cx(
            CENTERED_PLAYBACK_CONTROL_CLASS,
            'z-30',
            showReplay ? 'grid [&>svg]:scale-[2]' : 'hidden md:grid'
          )}
        >
          {showReplay ? <RetrySmall /> : <Play />}
        </button>
      )}

      {/* Desktop only — mobile already shows the centred paused glyph in this spot. */}
      <div
        aria-hidden
        className={cx(
          CENTERED_PLAYBACK_CONTROL_CLASS,
          'pointer-events-none z-20 grid transition-[opacity,scale] duration-300 md:hidden',
          flash.visible ? 'scale-100 opacity-100' : 'scale-110 opacity-0'
        )}
      >
        {flash.icon === 'pause' ? <Pause /> : <Play />}
      </div>

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
  onRecovered,
  onExhausted,
  onToggle,
  claims,
  claimsOpen = false,
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
  /** This tile's recording was rebuilt after its pipeline died — put it back in step with its
   * partner. See {@link MAX_MEDIA_RECOVERY_ATTEMPTS}. */
  onRecovered?: () => void;
  /** Every rebuild of this recording failed — re-sign it, in case the URL is what is broken. */
  onExhausted?: () => void;
  onToggle: () => void;
  /** This debater's claim corner, if they have anything to show right now. */
  claims?: React.ReactNode;
  /** Whether the corner is showing the scrollable backlog rather than the live card. */
  claimsOpen?: boolean;
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

  /**
   * Pausing is not enough to return a media decoder or its buffered data on mobile browsers.
   * Detach the source and force the element back to its empty resource state whenever this tile
   * is evicted. The setup repairs the source too because React Strict Mode deliberately exercises
   * an effect cleanup/setup cycle without removing the DOM node in development (GEO-2963).
   */
  React.useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (video.getAttribute('src') !== src) video.setAttribute('src', src);

    return () => releaseVideo(video);
  }, [src, videoRef]);

  /**
   * Rebuild this recording when the browser gives up on it (GEO-2985).
   *
   * A `<video>` that reports an error is finished: nothing retries it, it paints nothing, and the
   * debate goes on playing in the other tile with this debater simply absent. The pair's own
   * machinery cannot help — every correction in `useDebatePlayback` is about *where* the two
   * elements are, and this one is nowhere.
   *
   * The repair is to detach and re-fetch the source, which is enough on its own: the recording is
   * fine, and the same URL loads to `HAVE_ENOUGH_DATA` on the second attempt. `onRecovered` then
   * brings it back to wherever its partner has got to.
   *
   * Bounded and spaced, because the one thing worse than a blank tile is a tile refetching a
   * multi-megabyte recording in a loop.
   *
   * What the budget covers is a pipeline that died on a URL that still works, which is what was
   * diagnosed and what a rebuild answers. It cannot answer a URL that has itself stopped working
   * — `error.code === 2` is `MEDIA_ERR_NETWORK` and covers both — because every attempt re-fetches
   * the same bytes from the same signature. So exhausting it escalates once to `onExhausted`,
   * which re-signs this recording; the new `src` resets everything here and the budget is spent
   * again on a source that is genuinely new.
   *
   * Past that the tile says so rather than going quiet. Before this existed the state was
   * undetectable, so silence was the only option; it is detected now, and a blank half of a
   * playing debate with no account of itself is the report that opened this ticket.
   */
  const recoveryAttemptsRef = React.useRef(0);
  const recoveryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exhausted, setExhausted] = React.useState(false);
  /**
   * Whether this source has already been escalated.
   *
   * A ref beside the state because `load()` on a dead source fires `error` again, and more than
   * once inside a tick — so the render's copy of `exhausted` is stale exactly when it is being
   * read. The hook's own ceiling would absorb the repeats, but a tile that keeps asking is a tile
   * relying on somebody else's bound.
   */
  const escalatedRef = React.useRef(false);

  const cancelRecovery = React.useCallback(() => {
    if (recoveryTimerRef.current === null) return;
    clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
  }, []);

  // A new recording is a new budget — including the one `onExhausted` has just re-signed — and any
  // repair still pending belongs to the old one.
  React.useEffect(() => {
    recoveryAttemptsRef.current = 0;
    escalatedRef.current = false;
    setExhausted(false);
    return cancelRecovery;
  }, [cancelRecovery, src]);

  const rebuild = React.useCallback(
    (attempt: number) => {
      recoveryTimerRef.current = setTimeout(() => {
        recoveryTimerRef.current = null;
        const current = videoRef.current;
        // The tile may have been handed a different recording, or unmounted, while we waited.
        if (!current || !src || current.getAttribute('src') !== src) return;
        reattachVideoSource(current, src);
        onRecovered?.();
      }, MEDIA_RECOVERY_BACKOFF_MS * attempt);
    },
    [onRecovered, src, videoRef]
  );

  const onMediaError = () => {
    const video = videoRef.current;
    if (!video || !src) return;
    // Already repairing. `load()` itself can fire `error` again, so this guard is what keeps a
    // failing source from spinning.
    if (recoveryTimerRef.current !== null) return;

    if (recoveryAttemptsRef.current >= MAX_MEDIA_RECOVERY_ATTEMPTS) {
      // Out of attempts on this URL. One escalation to a freshly signed one, then the tile is
      // honest about it.
      if (escalatedRef.current) return;
      escalatedRef.current = true;
      setExhausted(true);
      onExhausted?.();
      return;
    }

    rebuild(++recoveryAttemptsRef.current);
  };

  /** The viewer asking for what the automatic attempts could not get. */
  const retry = () => {
    if (recoveryTimerRef.current !== null) return;
    recoveryAttemptsRef.current = 0;
    escalatedRef.current = false;
    setExhausted(false);
    rebuild(1);
  };

  const openProfile = useOpenDebaterProfile(participant);

  return (
    <div
      onPointerEnter={event => onClaimsHoverChange?.(event, true)}
      onPointerMove={event => onClaimsHoverChange?.(event, true)}
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
            onError={onMediaError}
            onLoadedMetadata={onPlaybackTick}
            onPause={onPlaybackTick}
            onPlay={onPlaybackTick}
            onTimeUpdate={onPlaybackTick}
          />
        ) : (
          <div className="grid h-full place-items-center bg-bg text-grey-04">Loading…</div>
        )}
      </button>

      {/* What a tile says when its recording cannot be revived.

          Deliberately the same control the player uses for replay — a circle with `RetrySmall` in
          it — because it is the same offer, made about one debater rather than about the debate.
          Stacked with its own label rather than borrowing the centred position, so the two read as
          one thing and neither lands on the bottom band: the scrim and the debater's name stay
          visible underneath, which is what says *whose* video is missing.

          The label is what makes the state legible rather than merely actionable. A lone button on
          a grey rectangle reads as a video that has not started yet, which is the one conclusion a
          viewer must not draw here.

          `pointer-events-none` on the stack, `auto` on the button: everything else in this tile is
          a click target for play/pause, and an invisible full-tile layer would swallow it. */}
      {exhausted && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2">
          <button
            type="button"
            aria-label={`Retry ${name}'s video`}
            onClick={event => {
              event.stopPropagation();
              retry();
            }}
            className={cx(PLAYBACK_CONTROL_CIRCLE_CLASS, 'pointer-events-auto grid [&>svg]:scale-[1.5]')}
          >
            <RetrySmall />
          </button>
          <Text as="p" variant="metadata" color="grey-04">
            This recording didn&rsquo;t load
          </Text>
        </div>
      )}

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

          360px and two lines — a departure from the frame's 209px and three lines, and a
          deliberate one.

          Measured over all 854 published claims in Calibre at 16/17: at the frame's 209px the
          median claim runs to *four* lines and only 30% are shown whole. Width and lines both buy
          legibility, but width is what keeps the card short, and a short card is what keeps it
          below the speaker's chin — the face is in the middle of the tile, so height costs more
          than width does. Two lines at 360px show 62% of claims whole against three lines at 260px
          showing 66%: the same reading in a card 17px shorter.

          75% is where the explore card's 484px tile lands on the 360 cap; the cap is what holds a
          far wider fullscreen player to the same card rather than a 450px one. Half the tile was
          tried and reverted — 242px reads better as a corner label but shows only about 13% of
          claims whole, which is a look bought with most of the legibility.

          Back on the name's own line, and drawn over it — `z-[11]` against the name's `z-10`,
          under the subtitle's `z-20`. The corner had been lifted clear of the name, which cost 26px
          of the tile's height for a gap nobody asked for. Sharing the line is what lets the card
          have the full width: the name is still there and still a link the moment no card covers
          it, and behind a card it goes under 30% dark and a 44px blur rather than being switched
          off, which is the one thing that reads worse than either.

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

          No height cap here any more. It used to carry one, which was wrong twice over: measured
          against the tile, so the same class meant a different number of cards on a phone than on
          a desktop; and shared with the chip, so on a phone the chip's 43px came out of the list's
          budget and left one card, most of it under the dissolve. The list caps itself in px now —
          see `max-h-[9.75rem]` on the scroll box, which is sized against the cards rather than
          against the picture.

          `justify-end` is still load-bearing: it overflows *downward* once its content is taller
          than its box, which is how a second card used to push the newest one 78px below the
          corner and into the tile's own `overflow-hidden`. Nothing here may set a height the
          content can exceed. */}
      {claims && (
        <div
          data-claim-corner
          className={cx(
            'pointer-events-none absolute right-3 bottom-3 z-[11] flex flex-col items-end justify-end transition-[padding-bottom] duration-150',
            // Two widths, by state rather than by screen. A live claim takes the whole tile,
            // because it is one line of somebody's argument and there is nothing to read it
            // against. `100% - 1.75rem` rather than a percentage: the corner hangs off `right-3`,
            // so subtracting that 12px and the name's own `left-4` 16px lands the card's left edge
            // exactly on the avatar below it, which is the line the eye already has.
            //
            // The backlog is a list you have opened to scroll, and it should leave the debate
            // visible behind it — so it gives most of the picture back, and at that width the
            // dissolve at its top edge reads as the edge of a list rather than as damage.
            claimsOpen ? 'w-[45%] md:w-[62%]' : 'w-[calc(100%-1.75rem)] max-w-[45rem]',
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

      {/* Debater identity — who is speaking and which side they are arguing — opening their
          personal space in the side panel. On the left, opposite the claim corner.

          The position chip is beside the name rather than inside the profile button: the button is
          capped at 55% so the name cannot run the width of the tile, and a chip inside that cap
          would be taken out of the name's share at exactly the widths where the name is already
          truncating. Outside it, the name keeps its 55% and the chip takes its own width from the
          remaining 45% — and the chip is not a link, which is the honest thing for it anyway.

          The row is `pointer-events-none` with the button opting back in, because it now spans the
          band rather than hugging the name: everything it covers and does not use belongs to the
          pause/play surface underneath.

          A generous 55%, and it no longer rations the claim corner's width: the corner shares this
          row and draws over it rather than sitting beside it. It also stays put — it used to fade
          out under a card, which cost the viewer the link to the debater's profile exactly when
          they were reading something that debater had said. */}
      <div
        className={cx(
          'pointer-events-none absolute bottom-3 left-4 z-10 flex w-[calc(100%-2rem)] items-center gap-2 transition-[padding-bottom] duration-150',
          // Lifts with the claim stack, and for the same reason: the name shares the bottom band
          // with the scrubber, so the scrubber appearing would otherwise draw a track through it.
          // Padding rather than `bottom`, because the box is pinned by its bottom edge — the
          // padding grows it upward and carries the content with it.
          clearScrubber === 'always' && 'pb-5',
          clearScrubber === 'on-hover' && 'group-hover:pb-5'
        )}
      >
        <button
          type="button"
          onClick={openProfile}
          className="pointer-events-auto flex min-w-0 max-w-[55%] items-center gap-2 text-left"
        >
          <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-white">
            <Avatar avatarUrl={participant?.avatar_cid} value={participant?.profile_space_id} size={20} />
          </span>
          <span className="truncate text-[1rem] tracking-[-0.35px] text-white">{name}</span>
        </button>
        {/* Guarded on the text, not just on the participant: the label is whatever the response
            kind called the side ("Agree", "True", "For"), and an empty one would draw a bare pill
            that says nothing. */}
        {participant?.position_label && (
          <DebateTileChip className={cx('min-w-0 shrink truncate text-text', tileChipSurface)}>
            {participant.position_label}
          </DebateTileChip>
        )}
      </div>

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
      className={cx(
        'grid size-10.5 place-items-center rounded-full bg-white text-text shadow-light [&>svg]:scale-[1.3]',
        className
      )}
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
      {/* Above the range input, which is the only way a marker can be clicked at all: the input is
          transparent but covers the whole bar, so at a lower z it swallowed every marker click and
          scrubbed to the pixel instead of seeking to the claim. The comment here used to claim the
          opposite, which is how it survived.

          The markers' wrapper is `pointer-events-none`, so only the targets themselves intercept
          and a drag starting anywhere else along the bar still reaches the input. Those targets are
          no longer the 2px hashes, though: they are up to 12px wide, clamped to the gap to the next
          claim — a mean 10% of the track, 44% on the densest debate in the corpus. See
          {@link MARKER_HIT_WIDTH_PX} for why that ceiling and not 24. */}
      <ClaimScrubberMarkers markers={markers} onSeek={ms => onSeek(ms / 1000)} className="z-3" />
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
