'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ClaimMarker } from '~/core/debates/claim-ticker';
import { formatTimecode } from '~/core/debates/claim-timing';
import { useDebateMedia } from '~/core/debates/hooks';
import { useDebateMoments } from '~/core/debates/moments-player/use-debate-moments';
import type { PlaybackTimeline } from '~/core/debates/playback-timeline';

import { momentDotsOnRecordings } from './debate-full-moments';
import { FeedScrubber } from './feed-scrubber';
import { Pause, Play } from './icons';

/** The app's header row over the stage: `COMPACT_FULL_HEADER_HEIGHT`. */
const CLOCK_CLASS_NAME = 'w-[43px] shrink-0 text-[12px] leading-4 font-medium text-[#c5c5c5] tabular-nums';

/**
 * The dark full screen's header (GEO-3833), the debates app's `FullControls` in its compact form:
 * elapsed time, the rail, the debate's length and ×, in one 56px row above the stage.
 *
 * Drawn by the player itself (`DebateFeedPlayer layout="full"`), which is what holds the playhead and
 * the seek, so nothing is lifted out of it. The rail is the player's own `FeedScrubber` in its
 * `header` variant. Without a rail (the combined video, which draws its own controls) the row keeps
 * only ×.
 */
export function DebateFullHeader({
  elapsedMs,
  durationMs,
  rail,
  onClose,
}: {
  elapsedMs?: number;
  durationMs?: number;
  rail?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div data-debate-full-header className="flex h-14 shrink-0 items-center gap-1 pr-0 pl-1">
      {rail ? (
        <>
          <span aria-label={`Elapsed time ${formatTimecode(elapsedMs ?? 0)}`} className={CLOCK_CLASS_NAME}>
            {formatTimecode(elapsedMs ?? 0)}
          </span>
          <div className="min-w-0 flex-1">{rail}</div>
          <span className={cx(CLOCK_CLASS_NAME, 'text-right')}>
            {durationMs && durationMs > 0 ? formatTimecode(durationMs) : '—'}
          </span>
        </>
      ) : (
        <div className="flex-1" />
      )}
      <button
        type="button"
        aria-label="Close full debate"
        data-geo-analytics-label="Close full debate"
        onClick={onClose}
        className="ml-2 grid size-11 shrink-0 place-items-center rounded-full bg-white/3 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/**
 * The header's rail: the player's timeline with the claim markers, and the reel's moments as dots
 * (the app's `FullControls` markers). The moments are read here, only on the full screen, and placed
 * on the player's clock through the media's turns as served (`debate-full-moments.ts`) — from the
 * same cache entries the Explore card and the playback hook use, so nothing is fetched twice. A
 * debate with no reel, or a read that failed, shows the claim markers alone.
 */
export function DebateFullRail({
  debateId,
  enabled,
  currentTime,
  timeline,
  markers,
  onSeek,
  onMomentSeek,
  onScrubStart,
  onScrubEnd,
}: {
  debateId: string;
  enabled: boolean;
  currentTime: number;
  timeline: PlaybackTimeline;
  markers: ClaimMarker[];
  onSeek: (seconds: number) => void;
  onMomentSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}) {
  const moments = useDebateMoments(debateId, { enabled });
  const media = useDebateMedia(debateId, enabled);
  const dots = React.useMemo(
    () => momentDotsOnRecordings(moments.moments, media.data?.turn_segments),
    [moments.moments, media.data?.turn_segments]
  );
  return (
    <FeedScrubber
      variant="header"
      currentTime={currentTime}
      timeline={timeline}
      markers={markers}
      moments={dots}
      onSeek={onSeek}
      onMomentSeek={onMomentSeek}
      onScrubStart={onScrubStart}
      onScrubEnd={onScrubEnd}
    />
  );
}

/** How long the transport stays up once playback runs on without a touch: the app's `VideoTransport`. */
export const TRANSPORT_HIDE_MS = 3_000;

/**
 * ↺10 / play-pause / ↻10 (the app's `VideoTransport`), centred on the line between the speakers.
 * Shown on a tap or while paused; the player hides it again after {@link TRANSPORT_HIDE_MS} of play.
 *
 * Out of view, not out of the document: a keyboard can still reach the buttons, and focusing one is
 * what brings the row back (`onFocusChange`), as the card's scrubber does.
 */
export function DebateFullTransport({
  visible,
  playing,
  splitFraction,
  onTogglePlay,
  onSkip,
  onFocusChange,
}: {
  visible: boolean;
  playing: boolean;
  /** Where the split between the speakers is, 0–1 from the top of the stage. */
  splitFraction: number;
  onTogglePlay: () => void;
  onSkip: (seconds: -10 | 10) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  return (
    <div
      data-debate-transport={visible ? 'shown' : 'hidden'}
      onFocus={() => onFocusChange?.(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusChange?.(false);
      }}
      style={{ top: `${splitFraction * 100}%` }}
      className={cx(
        'absolute inset-x-0 z-30 flex -translate-y-1/2 items-center justify-center gap-6 transition-[opacity,scale,top] duration-180 motion-reduce:transition-none',
        visible ? 'scale-100 opacity-100' : 'pointer-events-none scale-[0.94] opacity-0'
      )}
    >
      <TransportButton label="Rewind 10 seconds" onClick={() => onSkip(-10)}>
        <Skip10 backward />
      </TransportButton>
      <TransportButton large label={playing ? 'Pause video' : 'Play video'} onClick={onTogglePlay}>
        {playing ? <Pause color="white" size={24} /> : <Play color="white" size={24} />}
      </TransportButton>
      <TransportButton label="Forward 10 seconds" onClick={() => onSkip(10)}>
        <Skip10 />
      </TransportButton>
    </div>
  );
}

function TransportButton({
  label,
  large = false,
  onClick,
  children,
}: {
  label: string;
  large?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={event => {
        // The stage under it shows and hides the transport; this press is about the video.
        event.stopPropagation();
        onClick();
      }}
      className={cx(
        'grid place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-white',
        large ? 'size-14' : 'size-11'
      )}
    >
      {children}
    </button>
  );
}

/** The app's skip glyph: an open circle with an arrowhead, and "10" inside it. */
function Skip10({ backward = false }: { backward?: boolean }) {
  return (
    <svg aria-hidden width="27" height="27" viewBox="0 0 28 28">
      <path
        d="M20 6A10 10 0 1 0 24 14M20 2V7H15"
        transform={backward ? 'translate(28 0) scale(-1 1)' : undefined}
        fill="none"
        stroke="white"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x={14} y={18} fill="white" fontSize={10} fontWeight={600} textAnchor="middle">
        10
      </text>
    </svg>
  );
}
