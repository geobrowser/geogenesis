'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ParticipantSlot } from '../api';
import { ClipChip } from './editor-ui';
import { formatReelTime } from './reel';
import { SPEAKER_SEGMENT_CLASS, SPEAKER_SEGMENT_STRONG_CLASS } from './speaker-classes';
import type { MixedPeaks } from './waveform';
import { WaveformCanvas } from './waveform-canvas';

export type LaneClip = {
  key: string;
  speaker: ParticipantSlot | null;
  name: string;
  quote: string;
  start_ms: number;
  end_ms: number;
};

/** Whole seconds, `m:ss`. */
const wholeTime = (ms: number) => formatReelTime(Math.round(ms / 1000) * 1000).replace(/\.\d$/, '');

/**
 * The full debate as one lane (GEO-3773), shown with no clip selected and while the reel plays: the
 * debate's waveform in grey, every clip as a numbered segment that selects it, and the playhead with
 * a flag to scrub. Hovering a segment shows both debaters' stills (decision D2), the clip's number,
 * speaker, times and words.
 */
export function DebateLane({
  clips,
  strongKey,
  durationMs,
  peaks,
  stills,
  playheadMs,
  subscribe,
  onSelect,
  onSeek,
}: {
  clips: readonly LaneClip[];
  /** The clip drawn stronger: the selected one, or the one the reel is playing. */
  strongKey: string | null;
  durationMs: number;
  peaks: MixedPeaks | null;
  /** Each debater's still, where the debate has them. */
  stills: { 1: string | null; 2: string | null };
  playheadMs: number | null;
  subscribe: (listener: (positionMs: number) => void) => () => void;
  onSelect: (key: string) => void;
  onSeek: (ms: number) => void;
}) {
  const laneRef = React.useRef<HTMLDivElement>(null);
  const lineRef = React.useRef<HTMLSpanElement>(null);
  const flagRef = React.useRef<HTMLButtonElement>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const percent = (ms: number) => (Math.max(0, Math.min(durationMs, ms)) / durationMs) * 100;

  const place = React.useCallback(
    (ms: number) => {
      const left = `${(Math.max(0, Math.min(durationMs, ms)) / durationMs) * 100}%`;
      if (lineRef.current) lineRef.current.style.left = left;
      if (flagRef.current) {
        flagRef.current.style.left = left;
        flagRef.current.setAttribute('aria-valuetext', formatReelTime(ms));
      }
    },
    [durationMs]
  );
  // The playhead moves with the player each frame, not through a render.
  React.useEffect(() => {
    if (dragging) return;
    return subscribe(place);
  }, [dragging, place, subscribe]);
  React.useLayoutEffect(() => {
    if (playheadMs !== null && !dragging) place(playheadMs);
  }, [dragging, place, playheadMs]);

  const msAt = (clientX: number) => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * durationMs);
  };

  const hovered = clips.find(clip => clip.key === hover) ?? null;
  const hoveredIndex = hovered ? clips.indexOf(hovered) : -1;

  return (
    <section
      aria-label="Full debate"
      className="-mt-1 grid h-7 flex-none grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2"
    >
      <span className="text-breadcrumb font-normal text-grey-04 tabular-nums">0:00</span>
      <div
        ref={laneRef}
        data-testid="debate-lane"
        className="relative h-5 cursor-crosshair touch-none rounded-sm bg-grey-01"
        onPointerDown={event => {
          if ((event.target as Element).closest('button')) return;
          const ms = msAt(event.clientX);
          if (ms !== null) onSeek(ms);
        }}
      >
        <WaveformCanvas
          peaks={peaks}
          startMs={0}
          endMs={durationMs}
          className="pointer-events-none absolute inset-0 h-full w-full text-grey-03"
        />
        {clips.map((clip, index) => {
          const strong = clip.key === strongKey;
          return (
            <button
              key={clip.key}
              type="button"
              aria-label={`Clip ${index + 1}, ${wholeTime(clip.start_ms)}–${wholeTime(clip.end_ms)}`}
              aria-pressed={strong}
              onClick={() => onSelect(clip.key)}
              onPointerEnter={() => setHover(clip.key)}
              onPointerLeave={() => setHover(current => (current === clip.key ? null : current))}
              onFocus={() => setHover(clip.key)}
              onBlur={() => setHover(current => (current === clip.key ? null : current))}
              className={cx(
                'absolute top-0 bottom-0 min-w-4 cursor-pointer overflow-hidden rounded-[3px] border-0 p-0 text-center text-[11px] leading-4 font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text',
                clip.speaker
                  ? (strong ? SPEAKER_SEGMENT_STRONG_CLASS : SPEAKER_SEGMENT_CLASS)[clip.speaker]
                  : 'bg-grey-02 text-grey-04'
              )}
              style={{ left: `${percent(clip.start_ms)}%`, width: `${percent(clip.end_ms) - percent(clip.start_ms)}%` }}
            >
              {index + 1}
            </button>
          );
        })}
        <span
          ref={lineRef}
          aria-hidden
          className="pointer-events-none absolute -top-[5px] -bottom-[5px] z-[3] w-px bg-text"
          style={{ left: 0 }}
        />
        <button
          ref={flagRef}
          type="button"
          role="slider"
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={durationMs}
          className="absolute -top-3 z-[4] -ml-[7px] h-[18px] w-[15px] cursor-ew-resize touch-none border-0 bg-transparent p-0"
          style={{ left: 0 }}
          onPointerDown={event => {
            event.preventDefault();
            (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={event => {
            if (!dragging) return;
            const ms = msAt(event.clientX);
            if (ms !== null) place(ms);
          }}
          onPointerUp={event => {
            if (!dragging) return;
            setDragging(false);
            const ms = msAt(event.clientX);
            if (ms !== null) onSeek(ms);
          }}
          onLostPointerCapture={() => setDragging(false)}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const now = playheadMs ?? 0;
            onSeek(Math.max(0, Math.min(durationMs, now + (event.key === 'ArrowLeft' ? -1000 : 1000))));
          }}
        >
          <i
            aria-hidden
            className="absolute top-0.5 left-[3px] h-2.5 w-[9px] bg-text [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]"
          />
        </button>
        {hovered ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-6 z-[1001] flex w-[264px] flex-col gap-2 rounded-lg bg-text p-2 text-white shadow-lg"
            style={{ left: `clamp(-44px, calc(${percent(hovered.start_ms)}% - 124px), calc(100% - 220px))` }}
          >
            <div className="relative grid h-[140px] grid-cols-2 gap-0.5 overflow-hidden rounded bg-black">
              {([1, 2] as const).map(slot =>
                stills[slot] ? (
                  <img key={slot} src={stills[slot]!} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div key={slot} className={slot === 1 ? 'bg-grey-05' : 'bg-grey-04'} />
                )
              )}
              <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-black/60 px-[5px] py-0.5 text-breadcrumb tabular-nums">
                {Math.round((hovered.end_ms - hovered.start_ms) / 1000)} s
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <ClipChip number={hoveredIndex + 1} speaker={hovered.speaker} small />
              <span className="text-breadcrumb">{hovered.name}</span>
              <span className="flex-1" />
              <span className="text-breadcrumb font-normal text-grey-03 tabular-nums">
                {wholeTime(hovered.start_ms)}–{wholeTime(hovered.end_ms)}
              </span>
            </div>
            <span className="line-clamp-2 text-[14px] leading-[18px] text-grey-02">{hovered.quote}</span>
          </div>
        ) : null}
      </div>
      <span className="text-right text-breadcrumb font-normal text-grey-04 tabular-nums">{wholeTime(durationMs)}</span>
    </section>
  );
}
