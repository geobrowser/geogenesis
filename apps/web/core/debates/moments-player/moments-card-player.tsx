'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { useActionScope } from '~/core/action-context-provider';
import { FollowButton } from '~/core/follows/follow-button';
import { validateSpaceId } from '~/core/io/rest/validation';
import { responsePositionLabel } from '~/core/responses/entity-response';
import {
  gestureUnlocksEachMediaElement,
  markGestureVideoUnlocked,
  unlockGestureVideo,
} from '~/core/utils/video/gesture-media-pool';
import { reattachVideoSource } from '~/core/utils/video/release-video';
import { renderSwappedVideo } from '~/core/utils/video/swapped-video-frame';

import { Avatar } from '~/design-system/avatar';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import type { Debate, DebateMediaTurnSegment, DebateParticipant } from '../api';
import { useBlockedPageTap } from '../browse/blocked-page-tap';
import { FeedVideo } from '../browse/feed-video';
import { Speaker, SpeakerMuted } from '../browse/icons';
import { useOpenDebaterProfile } from '../browse/use-open-debater-profile';
import { withDebateTimecode } from '../debate-timecode';
import { speakerShortLabel } from '../debater-name';
import { useParticipantBylines } from '../participant-bylines';
import { useFeedSoundPreference } from '../use-debate-playback';
import { markDebateWatched } from '../watched-debates';
import { ClipPlaybackAnalytics, type ClipSurface, type MomentEndReason } from './clip-playback-analytics';
import { type DebateMoment, momentCaptionAt } from './debate-moments';
import { segmentFill } from './debate-moments-player';
import { momentExpandSeconds } from './moment-expand-time';
import { initialStoryState, storyReducer } from './story-state';
import { debateMomentsQueryKey } from './use-debate-moments';

/** How long the clip on screen has to have played before the spare loads the next one. */
const PRELOAD_NEXT_DELAY_MS = 1000;
/** Clip-tick cadence for the measurement, as the full player's. */
const SAMPLE_INTERVAL_MS = 500;

export type MomentsCardPlayerProps = {
  debate: Debate;
  moments: DebateMoment[];
  /** The speakers' stills, painted until the first clip shows a frame. */
  stills?: { slot1: string | null; slot2: string | null } | null;
  /** The slot the Agree speaker is in, drawn on top (`compositeTopSlot`). */
  topSlot: 1 | 2;
  /** The card is the one the viewer is watching: it plays (a feed card in view, a tapped card). */
  active: boolean;
  /**
   * Whether the card holds its two `<video>` elements. Off, it shows the stills and holds nothing.
   * The card mounts them only while it is on screen or up next, so a feed's far cards download
   * nothing.
   */
  mountMedia: boolean;
  /** The card is up next in a feed: its first clip loads ahead, so it starts the moment it is reached. */
  upNext: boolean;
  /** The card plays only once tapped (outside a feed, GEO-3812). */
  tapToPlay: boolean;
  /** A tap-to-play card's Play, called inside the tap so the card becomes the active one. */
  onPlaybackRequest?: () => void;
  /** The debate's full-screen page, which the expand control opens at the moment on screen. */
  fullScreenHref: string;
  entityId?: string;
  spaceId?: string;
  /** The debate's turns on both clocks, to open the full screen on the recordings' clock. */
  turns?: readonly DebateMediaTurnSegment[] | null;
};

type SlotIndex = 0 | 1;

/**
 * The Explore card's moments reel (GEO-3833), as the debates app's card plays it
 * (debates-react-native `LiveMomentPlayer.tsx`): the debate's moment clips one after another, a
 * bar per moment, thirds to step back, pause and step on, captions at the seam, and a button to
 * open the full debate at the moment on screen.
 *
 * Two `<video>` elements, alternating as the app's two players do: while one plays its moment, the
 * other loads the next, and the swap waits for the new clip's first frame with the old one's last
 * frame still showing — so a hand-off is a cut, not a black frame and a spinner. Both come from the
 * gesture pool (`FeedVideo pooled`) on iOS, so the tap that gave one card sound reaches the next
 * card's elements too (GEO-3594).
 *
 * The clip is both speakers stacked in one picture. When the Agree speaker recorded in slot 2, a
 * canvas over each element paints its halves exchanged, as the app does.
 *
 * Not `DebateMomentsPlayer`, which the ranking compare view and the Best debates popup use: that
 * one plays a single element after a press, with a full-debate mode. Only its pure pieces are
 * shared (`story-state.ts`, `segmentFill`, the moments read).
 */
export function MomentsCardPlayer(props: MomentsCardPlayerProps) {
  // A re-cut reel (new clip ids) starts from a fresh state.
  return <MomentsCardReel key={props.moments.map(moment => moment.id).join(',')} {...props} />;
}

function MomentsCardReel({
  debate,
  moments,
  stills,
  topSlot,
  active,
  mountMedia,
  upNext,
  tapToPlay,
  onPlaybackRequest,
  fullScreenHref,
  entityId,
  spaceId,
  turns,
}: MomentsCardPlayerProps) {
  const queryClient = useQueryClient();
  const [story, dispatch] = React.useReducer(storyReducer, moments.length, initialStoryState);
  const count = moments.length;
  const index = Math.min(story.index, count - 1);
  const moment = moments[index]!;

  /** Which moment each element holds. Slot 0 starts on the first. */
  const [slots, setSlots] = React.useState<[number | null, number | null]>([0, null]);
  /** The element holding the moment on screen. */
  const [currentSlot, setCurrentSlot] = React.useState<SlotIndex>(0);
  /** The element drawn on top. It becomes `currentSlot` once that one has a frame to show. */
  const [visibleSlot, setVisibleSlot] = React.useState<SlotIndex>(0);
  /** Some clip has shown a frame: the stills give way, and never come back for a later moment. */
  const [painted, setPainted] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [userPaused, setUserPaused] = React.useState(false);
  /** The browser refused to start the clip without a tap: "Tap to play". */
  const [blocked, setBlocked] = React.useState(false);
  /** The browser made this card play muted though the viewer wants sound (iOS, per element). */
  const [soundBlocked, setSoundBlocked] = React.useState(false);
  const [clip, setClip] = React.useState({ index: 0, ms: 0, durationMs: null as number | null });
  const [failed, setFailed] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);

  const slot0Ref = React.useRef<HTMLVideoElement | null>(null);
  const slot1Ref = React.useRef<HTMLVideoElement | null>(null);
  const refs = React.useMemo(() => [slot0Ref, slot1Ref] as const, []);
  const pooled = React.useMemo(() => gestureUnlocksEachMediaElement(), []);
  const attemptsRef = React.useRef(new Map<number, number>());
  /** Where the viewer was when the card let its elements go, so it picks up there when it is back. */
  const resumeRef = React.useRef<{ index: number; ms: number } | null>(null);

  const sound = useFeedSoundPreference();
  const muted = sound.muted || soundBlocked;
  const mutedByDefault = muted && !sound.muteChosen;

  const clipMs = clip.index === index ? clip.ms : 0;
  const clipLengthMs = (clip.index === index ? clip.durationMs : null) ?? moment.durationMs;

  // Measurement, one per card presentation. The list and position are the card's own (its feed,
  // a profile's gallery, a claim's tab) and the feed arm behind it, as its votes and shares report.
  const scope = useActionScope();
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  const [analytics] = React.useState(
    () =>
      new ClipPlaybackAnalytics(debate.id, (): ClipSurface => {
        const scope = scopeRef.current;
        return {
          playback_surface: 'explore',
          component: 'explore_feed_card',
          list_id: scope.list_id ?? 'explore',
          target_id: debate.id,
          target_type: 'debate',
          item_position: scope.item_position,
          feed_version: scope.feed_version,
          feed_arm: scope.feed_arm,
          feed_experiment_id: scope.feed_experiment_id,
          feed_exploration: scope.feed_exploration,
          feed_slot: scope.feed_slot,
        };
      })
  );
  React.useEffect(() => () => analytics.dispose(), [analytics]);

  const wantPlay = active && mountMedia && !userPaused && !story.finished && !blocked && !failed;
  const live = active && mountMedia;

  /** Show moment `target`: in the element already holding it, else the one not on screen. */
  const moveTo = (target: number, reason: MomentEndReason = 'skipped') => {
    if (target < 0 || target >= count) return;
    analytics.show(moments[target]!, target, reason);
    const holding: SlotIndex | null = slots[0] === target ? 0 : slots[1] === target ? 1 : null;
    const slot: SlotIndex = holding ?? (visibleSlot === 0 ? 1 : 0);
    if (holding === null) setSlots(current => (slot === 0 ? [target, current[1]] : [current[0], target]));
    else {
      // Already loaded (the moment just played, or the one preloaded): from its start.
      const video = refs[slot].current;
      if (video && video.readyState >= 1) video.currentTime = 0;
    }
    setCurrentSlot(slot);
    setFailed(false);
    setClip({ index: target, ms: 0, durationMs: null });
    dispatch({ type: 'goTo', index: target });
  };

  // The moment on screen, measured: shown on mount, and live while the card plays.
  React.useEffect(() => {
    analytics.show(moments[index]!, index);
  }, [analytics, moments, index]);
  React.useEffect(() => {
    const update = () => analytics.setLive(live && inForeground());
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, [analytics, live]);

  // The app pauses a card that stops being the one shown and plays the one that becomes it.
  const wasActiveRef = React.useRef(active);
  React.useEffect(() => {
    const was = wasActiveRef.current;
    wasActiveRef.current = active;
    if (was === active || userPaused || story.finished || !mountMedia) return;
    analytics.control(active ? 'autoplay_resume' : 'autoplay_pause', 'autoplay');
  }, [active, analytics, mountMedia, story.finished, userPaused]);

  const start = React.useCallback(
    (video: HTMLVideoElement) => {
      analytics.wantPlay(performance.now());
      const attempt = video.play();
      void attempt?.catch((error: unknown) => {
        const name = (error as { name?: unknown } | null)?.name;
        if (name !== 'NotAllowedError') return;
        // Refused with sound: play this card muted rather than not at all, and let the next card
        // ask again (GEO-3594). Refused muted too: the viewer has to tap.
        if (!video.muted) setSoundBlocked(true);
        else setBlocked(true);
      });
    },
    [analytics]
  );

  // Play what should be playing; silence and stop everything else.
  const currentSrc = slots[currentSlot] === null ? null : moments[slots[currentSlot]!]?.clipUrl;
  React.useEffect(() => {
    if (!mountMedia) return;
    refs.forEach((ref, slot) => {
      const video = ref.current;
      if (!video || slot === currentSlot) return;
      video.muted = true;
      if (!video.paused) video.pause();
    });
    const video = refs[currentSlot].current;
    if (!video) return;
    video.muted = muted;
    if (wantPlay) {
      if (video.paused) start(video);
    } else if (!video.paused) video.pause();
  }, [currentSlot, currentSrc, mountMedia, muted, refs, start, wantPlay]);

  // Swap to the moment's element once it has a frame to show; the other keeps its last frame till then.
  React.useEffect(() => {
    if (!mountMedia) return;
    const video = refs[currentSlot].current;
    if (!video) return;
    const present = () => {
      if (video.readyState < 2) return;
      setVisibleSlot(currentSlot);
      setPainted(true);
    };
    present();
    const events = ['loadeddata', 'playing', 'seeked'] as const;
    for (const event of events) video.addEventListener(event, present);
    return () => {
      for (const event of events) video.removeEventListener(event, present);
    };
  }, [currentSlot, currentSrc, mountMedia, refs]);

  // Once the moment on screen is showing and playing, the spare loads the next one.
  const spare: SlotIndex = currentSlot === 0 ? 1 : 0;
  const nextIndex = index + 1 < count ? index + 1 : null;
  const preloadNext = mountMedia && active && playing && visibleSlot === currentSlot && nextIndex !== null;
  React.useEffect(() => {
    if (!preloadNext || nextIndex === null || slots[spare] === nextIndex) return;
    // Its preload failed once already: it loads when it is reached, with its one retry used.
    if (attemptsRef.current.has(nextIndex)) return;
    const timer = window.setTimeout(() => {
      setSlots(current => (spare === 0 ? [nextIndex, current[1]] : [current[0], nextIndex]));
    }, PRELOAD_NEXT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [nextIndex, preloadNext, slots, spare]);

  // Letting the elements go: remember the place, so the card picks up there when they are back.
  React.useEffect(() => {
    if (mountMedia) return;
    setPlaying(false);
    setBlocked(false);
    // The elements are fresh when they come back: the moment on screen goes in slot 0.
    setSlots([index, null]);
    setCurrentSlot(0);
    setVisibleSlot(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on the release itself
  }, [mountMedia]);

  // The measurement's clock.
  React.useEffect(() => {
    if (!mountMedia) return;
    const tick = () => {
      const video = refs[currentSlot].current;
      const inView = live && inForeground();
      const mediaMs = video ? video.currentTime * 1000 : 0;
      const durationMs = Math.round(
        moment.durationMs ?? (video && Number.isFinite(video.duration) ? video.duration * 1000 : 0)
      );
      const eligible =
        inView &&
        video !== null &&
        !video.paused &&
        !video.ended &&
        !video.seeking &&
        video.readyState >= 3 &&
        slots[currentSlot] === index;
      analytics.sample({
        now: performance.now(),
        mediaMs,
        durationMs,
        eligible,
        muted: video?.muted ?? true,
        inView,
      });
    };
    tick();
    const timer = window.setInterval(tick, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [analytics, currentSlot, index, live, moment.durationMs, mountMedia, refs, slots]);

  const forSlot = (slot: SlotIndex) => slot === currentSlot && slots[slot] === index;

  const onTimeUpdate = (slot: SlotIndex) => {
    const video = refs[slot].current;
    if (!video || !forSlot(slot) || video.readyState < 1) return;
    const durationMs = Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : null;
    setClip({ index, ms: video.currentTime * 1000, durationMs });
  };

  const onLoadedMetadata = (slot: SlotIndex) => {
    const video = refs[slot].current;
    const resume = resumeRef.current;
    if (!video || !forSlot(slot) || !resume || resume.index !== index) return;
    resumeRef.current = null;
    video.currentTime = resume.ms / 1000;
  };

  const onEnded = (slot: SlotIndex) => {
    if (!forSlot(slot)) return;
    analytics.completed();
    if (index + 1 < count) {
      moveTo(index + 1, 'completed');
      return;
    }
    // The reel's last moment played out: it rests on its last frame, and the next play restarts it.
    // Watched, so "Watch another debate" and the end card's picks pass over it (D17).
    dispatch({ type: 'clipEnded' });
    setPlaying(false);
    markDebateWatched(debate.id);
  };

  const onError = (slot: SlotIndex) => {
    if (slot !== currentSlot) {
      // The spare failed to preload. An element whose load failed reports nothing more, so leaving
      // it holding that moment would stall the reel on it. Let it go: the moment loads afresh when
      // it is reached, and fails over from there (its one retry counted here).
      const held = slots[slot];
      if (held === null) return;
      attemptsRef.current.set(held, (attemptsRef.current.get(held) ?? 0) + 1);
      setSlots(current => (slot === 0 ? [null, current[1]] : [current[0], null]));
      return;
    }
    if (!forSlot(slot)) return;
    const video = refs[slot].current;
    const attempt = attemptsRef.current.get(index) ?? 0;
    attemptsRef.current.set(index, attempt + 1);
    if (attempt === 0 && video) {
      // Once more from the stable URL, which also renews a lapsed signature.
      analytics.failed('unknown', 'retried', attempt + 1);
      reattachVideoSource(video, moment.clipUrl);
      if (wantPlay) start(video);
      return;
    }
    if (index + 1 < count) {
      // One failed clip does not stop the reel: on to the next moment, as the app does.
      analytics.failed('unknown', 'skipped', attempt + 1);
      moveTo(index + 1, 'skipped');
      return;
    }
    analytics.failed('unknown', 'gave_up', attempt + 1);
    analytics.end('skipped');
    setPlaying(false);
    setFailed(true);
  };

  // Every slot's `play` / `pause` reports only for the moment on screen.
  const onPlay = (slot: SlotIndex) => {
    if (!forSlot(slot)) return;
    setPlaying(true);
    setBlocked(false);
  };
  const onPause = (slot: SlotIndex) => {
    if (!forSlot(slot)) return;
    setPlaying(false);
    analytics.interrupt();
  };

  /**
   * Inside a tap: give the other element its own grant too, where each element needs one (iOS), so
   * the reel keeps its sound when it swaps back to it. The app primes both moment players in a sound
   * tap for the same reason (debates-react-native `primeMomentAudioFromGesture`, GEO-3788).
   */
  const grantOtherInTap = () => {
    if (!pooled) return;
    const other = refs[currentSlot === 0 ? 1 : 0].current;
    if (other) unlockGestureVideo(other);
  };

  /** Starts the moment on screen inside the viewer's tap, with sound if they have not chosen mute. */
  const playInTap = (giveSound: boolean) => {
    const video = refs[currentSlot].current;
    if (giveSound && mutedByDefault) {
      sound.setMuted(false, 'inferred');
      setSoundBlocked(false);
      if (video) video.muted = false;
    }
    if (!video) return;
    if (video.ended) video.currentTime = 0;
    start(video);
    // A play inside the tap unlocks the element for sound, for whichever card the pool gives it to next.
    if (!video.paused) markGestureVideoUnlocked(video);
    grantOtherInTap();
  };

  const restart = () => {
    analytics.control('replay', 'manual');
    attemptsRef.current.clear();
    if (index === 0) {
      const video = refs[currentSlot].current;
      if (video) video.currentTime = 0;
      dispatch({ type: 'restart' });
      analytics.replay();
    } else moveTo(0, 'skipped');
    setUserPaused(false);
  };

  /** Play on a card that is waiting: a tap-to-play card's Play, or Tap to play on a refused one. */
  const playFromTap = () => {
    if (!active) onPlaybackRequest?.();
    setBlocked(false);
    setUserPaused(false);
    if (story.finished) {
      restart();
      return;
    }
    if (active) analytics.control('play', 'manual');
    else analytics.controlOnOpen('play', 'manual');
    playInTap(true);
  };

  const togglePause = () => {
    if (story.finished) {
      restart();
      return;
    }
    if (blocked || !active) {
      playFromTap();
      return;
    }
    if (userPaused || !playing) {
      setUserPaused(false);
      analytics.control('play', 'manual');
      playInTap(true);
    } else {
      setUserPaused(true);
      analytics.control('pause', 'manual');
      refs[currentSlot].current?.pause();
    }
  };

  const step = (direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0) {
      // The first moment's left edge replays it, as a story does.
      const video = refs[currentSlot].current;
      if (video) video.currentTime = 0;
      setClip({ index, ms: 0, durationMs: clip.durationMs });
      analytics.control('seek', 'manual', { seek_kind: 'moment_previous' });
      return;
    }
    if (target >= count) return;
    analytics.control('seek', 'manual', { seek_kind: direction === 1 ? 'moment_next' : 'moment_previous' });
    moveTo(target, 'skipped');
  };

  const jump = (target: number) => {
    if (target === index && !story.finished) return;
    analytics.control('seek', 'manual', { seek_kind: 'moment_jump' });
    if (story.finished && target === index) {
      restart();
      return;
    }
    setUserPaused(false);
    moveTo(target, 'skipped');
  };

  /** Mute and Unmute, for every card: the shared preference. */
  const toggleMute = () => {
    const video = refs[currentSlot].current;
    if (muted) {
      analytics.control('unmute', 'manual');
      sound.setMuted(false, 'explicit');
      setSoundBlocked(false);
      grantOtherInTap();
      if (!video) return;
      video.muted = false;
      if (blocked) {
        playFromTap();
        return;
      }
      if (!video.paused) {
        // iOS grants sound on a paused -> playing change inside the tap; a play() on a running
        // element grants nothing (GEO-3115).
        video.pause();
        markGestureVideoUnlocked(video);
        start(video);
      }
    } else {
      analytics.control('mute', 'manual');
      sound.setMuted(true, 'explicit');
      if (video) video.muted = true;
    }
  };

  // A tap anywhere on the page starts a refused reel, or gives sound to one muted by default (GEO-3602).
  useBlockedPageTap(live && (blocked || (playing && mutedByDefault)), () => {
    if (blocked) playFromTap();
    else {
      analytics.control('unmute', 'manual', { source: 'page_tap' });
      sound.setMuted(false, 'inferred');
      setSoundBlocked(false);
      grantOtherInTap();
      const video = refs[currentSlot].current;
      if (video && !video.paused) {
        video.muted = false;
        video.pause();
        markGestureVideoUnlocked(video);
        start(video);
      }
    }
  });

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      // The read is cached for good (`staleTime: Infinity`), so it has to be asked again. A re-cut
      // reel has new clip ids, which remounts this player on its first moment.
      await queryClient.refetchQueries(
        { queryKey: debateMomentsQueryKey(debate.id), exact: true },
        { throwOnError: true }
      );
      attemptsRef.current.delete(index);
      setFailed(false);
      setUserPaused(false);
      const video = refs[currentSlot].current;
      if (video) {
        reattachVideoSource(video, moment.clipUrl);
        analytics.replay();
        start(video);
      }
    } catch {
      setRetryError('Could not refresh the clips. Please retry or watch the full debate.');
    } finally {
      setRetrying(false);
    }
  };

  const expandSeconds = momentExpandSeconds(moment, clipMs, turns);
  const expandHref = expandSeconds === null ? fullScreenHref : withDebateTimecode(fullScreenHref, expandSeconds);
  const onExpand = () => {
    analytics.end('switched_to_full');
    analytics.navigation();
  };

  // Remember the place as it plays, for when the card lets its elements go and takes them back.
  React.useEffect(() => {
    resumeRef.current = clipMs > 0 ? { index, ms: clipMs } : null;
  }, [clipMs, index]);

  const caption = !blocked && !failed ? momentCaptionAt(moment.captions, clipMs) : null;
  const waitingForTap = !active && tapToPlay;
  const showPlayIndicator = !waitingForTap && !blocked && !failed && (story.finished || (userPaused && active));
  const starting = wantPlay && !playing && !failed;

  const participants = debate.participants ?? [];
  const bySlot = (slot: number) => participants.find(person => person.participant_slot === slot) ?? null;
  const top = bySlot(topSlot);
  const bottom = bySlot(topSlot === 2 ? 1 : 2);
  const bylines = useParticipantBylines(participants, mountMedia);
  const bylineOf = (participant: DebateParticipant | null) => {
    const id = participant ? validateSpaceId(participant.profile_space_id) : null;
    return id ? (bylines.get(id) ?? null) : null;
  };

  const posterTop = topSlot === 2 ? stills?.slot2 : stills?.slot1;
  const posterBottom = topSlot === 2 ? stills?.slot1 : stills?.slot2;

  return (
    <div className="relative w-full" data-moments-card-player="" data-debate-slot={topSlot}>
      {/* The moments: a row of bars above the clip on a desktop, over its top edge on a phone. */}
      <div
        data-testid="moments-bar"
        className="flex h-7 items-center gap-2 md:pointer-events-none md:absolute md:inset-x-0 md:top-0 md:z-30 md:h-auto md:gap-1 md:bg-gradient-to-b md:from-black/40 md:to-transparent md:px-3 md:pt-2.5 md:pb-4"
      >
        {moments.map((m, i) => (
          <button
            key={m.id}
            type="button"
            aria-label={`Moment ${i + 1} of ${count}`}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => jump(i)}
            className="group/segment flex h-full min-w-0 flex-1 cursor-pointer items-center md:pointer-events-auto md:h-3"
          >
            <span className="block h-1 w-full overflow-hidden rounded-full bg-[#ebebeb] md:h-[3px] md:bg-white/[0.38]">
              <span
                data-testid={`moment-segment-${i}`}
                className="block h-full rounded-full bg-[#151515] md:bg-white"
                style={{ width: `${segmentFill(i, index, clipMs, clipLengthMs) * 100}%` }}
              />
            </span>
          </button>
        ))}
      </div>

      <div
        data-testid="moments-clip"
        className="relative isolate aspect-[480/578] w-full overflow-hidden rounded-[20px] bg-[#151515] select-none"
      >
        {mountMedia &&
          ([0, 1] as const).map(slot => {
            const held = slots[slot];
            const src = held === null ? undefined : moments[held]?.clipUrl;
            const current = slot === currentSlot;
            return (
              <div
                key={slot}
                data-testid={`moment-video-slot-${slot}`}
                data-moment-index={held ?? undefined}
                className="absolute inset-0"
                style={{ opacity: visibleSlot === slot ? 1 : 0, zIndex: visibleSlot === slot ? 1 : 0 }}
              >
                <FeedVideo
                  pooled={pooled}
                  videoRef={refs[slot]}
                  className="absolute inset-0 size-full object-contain"
                  // The clip on screen loads in full on the card in play and the one up next; a
                  // tap-to-play card only reads enough to start inside the tap. The spare holds the
                  // next moment, loading while this one plays.
                  preload={current ? (active || upNext ? 'auto' : 'metadata') : 'auto'}
                  src={src}
                  muted={current ? muted : true}
                  onTimeUpdate={() => onTimeUpdate(slot)}
                  onLoadedMetadata={() => onLoadedMetadata(slot)}
                  onEnded={() => onEnded(slot)}
                  onError={() => onError(slot)}
                  onPlay={() => onPlay(slot)}
                  onPause={() => onPause(slot)}
                />
                {topSlot === 2 ? <SwappedFrame videoRef={refs[slot]} src={src} /> : null}
              </div>
            );
          })}

        {/* The stills, in the order the clip is drawn, until the first frame. */}
        {!painted ? (
          <div
            className="pointer-events-none absolute inset-0 z-[2] flex flex-col"
            aria-hidden="true"
            data-testid="moments-poster"
          >
            {[posterTop, posterBottom].map((src, i) => (
              <div key={i} className="relative w-full flex-1 overflow-hidden bg-grey-01">
                {src ? (
                  <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <ReelSpeaker participant={top} byline={bylineOf(top)} className="top-0" />
        <ReelSpeaker participant={bottom} byline={bylineOf(bottom)} className="bottom-0" />

        {caption ? (
          <p className="pointer-events-none absolute inset-x-4 top-1/2 z-[6] m-0 flex -translate-y-1/2 justify-center">
            <span className="line-clamp-3 rounded-[4px] bg-black px-2 py-1 text-center text-[14px] leading-[18px] font-semibold text-white">
              {caption}
            </span>
          </p>
        ) : null}

        {/* Thirds: back a moment, pause or play, on a moment. */}
        {!waitingForTap && !blocked && !failed ? (
          <div className="absolute inset-0 z-[5] flex" data-testid="moment-tap-controls">
            <button
              type="button"
              aria-label="Previous moment"
              onClick={() => step(-1)}
              className="h-full w-1/3 cursor-pointer focus-visible:outline-none"
            />
            <button
              type="button"
              aria-label={story.finished || userPaused || !playing ? 'Play moment' : 'Pause moment'}
              onClick={togglePause}
              className="h-full w-1/3 cursor-pointer focus-visible:outline-none"
            />
            <button
              type="button"
              aria-label="Next moment"
              onClick={() => step(1)}
              className="h-full w-1/3 cursor-pointer focus-visible:outline-none"
            />
          </div>
        ) : null}

        {waitingForTap && !failed ? (
          <button
            type="button"
            aria-label="Play moment"
            onClick={playFromTap}
            className="absolute inset-0 z-[7] grid cursor-pointer place-items-center focus-visible:outline-none"
          >
            <span aria-hidden className="grid size-14 place-items-center rounded-[14px] bg-[#151515cc] text-white">
              <PlayGlyph />
            </span>
          </button>
        ) : null}

        {blocked && !failed ? (
          <button
            type="button"
            onClick={playFromTap}
            className="absolute inset-0 z-[7] grid cursor-pointer place-items-center bg-black/30 focus-visible:outline-none"
          >
            <span className="flex items-center gap-2 rounded-full bg-[#151515cc] px-4 py-2.5 text-[15px] font-semibold text-white">
              <PlayGlyph size={14} />
              Tap to play
            </span>
          </button>
        ) : null}

        {showPlayIndicator ? (
          <span
            aria-hidden="true"
            data-testid="play-indicator"
            className="pointer-events-none absolute top-[45%] left-1/2 z-[8] grid size-12 -translate-x-1/2 place-items-center rounded-[14px] bg-[#151515cc] text-white"
          >
            <PlayGlyph />
          </span>
        ) : null}

        {starting && !waitingForTap && !blocked ? (
          // Only if the clip is slow to start: it fades in after a beat, so a quick start shows nothing.
          <span
            aria-hidden="true"
            data-testid="moment-starting"
            className="pointer-events-none absolute top-[45%] left-1/2 z-[8] -translate-x-1/2 animate-[fadeIn_200ms_400ms_ease-out_both] rounded-full bg-[#151515cc] p-3.5"
          >
            <span className="block size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </span>
        ) : null}

        {failed ? (
          <div className="absolute top-[45%] left-1/2 z-[9] flex max-w-[85%] -translate-x-1/2 flex-col items-center gap-3 rounded-[14px] bg-[#151515cc] p-3 text-center text-white">
            {retryError ? <span className="text-[12px]">{retryError}</span> : null}
            <button type="button" disabled={retrying} onClick={() => void retry()} className="font-semibold">
              {retrying ? 'Refreshing video…' : 'Retry video'}
            </button>
            <Link
              href={expandHref}
              entityId={entityId}
              spaceId={spaceId}
              data-entity-side-panel-full-page
              onClick={onExpand}
              className="font-semibold"
            >
              Watch full debate
            </Link>
          </div>
        ) : null}

        {/* Sound, top-left: every card's, as the global preference. */}
        <button
          type="button"
          aria-label={muted ? 'Unmute all videos' : 'Mute all videos'}
          onClick={toggleMute}
          className="absolute top-3 left-3 z-[10] grid size-9 place-items-center rounded-full bg-[#151515]/60 text-white backdrop-blur-sm md:top-6"
        >
          {muted ? <SpeakerMuted size={18} /> : <Speaker size={18} />}
        </button>

        {/* The way into the debate at full size, at the moment on screen. */}
        <Link
          href={expandHref}
          entityId={entityId}
          spaceId={spaceId}
          aria-label="Open full debate"
          data-entity-side-panel-full-page
          onClick={onExpand}
          className="absolute top-3 right-3 z-[10] grid size-9 place-items-center rounded-full bg-[#151515]/60 text-white backdrop-blur-sm md:top-6"
        >
          <Fullscreen />
        </Link>
      </div>
    </div>
  );
}

/** A canvas over one element, painting its two halves exchanged (Agree on top). */
function SwappedFrame({
  videoRef,
  src,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | undefined;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  React.useLayoutEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    return renderSwappedVideo(video, canvas);
  }, [videoRef, src]);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="moment-swap-canvas"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}

/** One speaker on the clip, as the app labels a half: face with Follow, name, side and byline. */
function ReelSpeaker({
  participant,
  byline,
  className,
}: {
  participant: DebateParticipant | null;
  byline: string | null;
  className: string;
}) {
  const openProfile = useOpenDebaterProfile(participant);
  if (!participant) return null;
  const name = speakerShortLabel(participant);
  return (
    <div className={cx('pointer-events-none absolute inset-x-0 z-[6] h-1/2', className)}>
      <div
        className="absolute bottom-3 left-3 flex w-[calc(100%-1.5rem)] min-w-0 items-center gap-2"
        data-testid="reel-speaker"
      >
        <span className="pointer-events-auto relative shrink-0">
          <span
            aria-hidden
            onClick={openProfile}
            className="block size-8 cursor-pointer overflow-hidden rounded-full bg-white"
          >
            <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={32} />
          </span>
          {validateSpaceId(participant.profile_space_id) ? (
            <FollowButton
              target={{ kind: 'person', id: participant.profile_space_id, name }}
              variant="avatar"
              surface="video"
            />
          ) : null}
        </span>
        <button
          type="button"
          onClick={openProfile}
          className="pointer-events-auto flex max-w-[60%] min-w-0 flex-col text-left [text-shadow:0_2px_5px_#000000ee]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] leading-[18px] font-semibold text-white">{name}</span>
            <span className="shrink-0 text-[11px] leading-4 font-medium text-white">
              {responsePositionLabel(participant.position)}
            </span>
          </span>
          {byline ? <span className="mt-0.5 truncate text-[11px] leading-[15px] text-white">{byline}</span> : null}
        </button>
      </div>
    </div>
  );
}

function PlayGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="ml-0.5">
      <path fill="currentColor" d="M7 4L21 12L7 20Z" />
    </svg>
  );
}

/** In the foreground, by the full player's rule (`usePlaybackAnalytics`): visible and focused. */
function inForeground() {
  return document.visibilityState === 'visible' && document.hasFocus();
}
