'use client';

import * as React from 'react';

import cx from 'classnames';

import { SmallButton, SquareButton } from '~/design-system/button';
import { CheckboxVisual } from '~/design-system/checkbox';
import { Text } from '~/design-system/text';

import type { DebateMediaTurnSegment } from '../api';
import { SPEAKER_OUTLINE_CLASS, SPEAKER_TEXT_CLASS, SPEAKER_TINT_CLASS } from './clip-row';
import { type EditorClip, type ReelWord, isSpoken } from './reel';
import { type DraggedSpan, draggedClip } from './reel-timeline';
import { type PeaksView, cutStretches, fineWindow, formatFineTime } from './waveform';
import { WaveformCanvas } from './waveform-canvas';

/** Where a free edge lands in the panel: the nearest 10 ms, one peaks bucket. */
export const FINE_STEP_MS = 10;
/** How much of the debate the panel shows either side of the clip. */
const PADS = [1_000, 2_000, 4_000, 8_000] as const;
/** A word's label is drawn only where it fits: about this many px per character. */
const LABEL_PX_PER_CHAR = 6.5;

type FineDrag = {
  mode: 'start' | 'end';
  x0: number;
  start: number;
  end: number;
  pxPerMs: number;
  claim_index: number | null;
  /** The window as the drag began: it stays put under the pointer until the drag ends. */
  window: { start_ms: number; end_ms: number };
};

/**
 * The fine-tune panel (GEO-3673): the selected clip, zoomed in with a little of the debate either
 * side, over the debate's waveform. Its edges drag to the 10 ms, snapping to whole words unless "Snap
 * to words" is off (Alt flips it for one drag); each word's start and end are ticked, and its text
 * labelled where it fits. Shaded is what geo-chat will actually play (`playedCuts`); hatched, what
 * the render cut from the video. A click seeks the player.
 */
export function ReelWaveform({
  view,
  clip,
  index,
  speaker,
  played,
  words,
  turns,
  durationMs,
  playheadMs,
  readOnly,
  onChangeClip,
  onSeek,
  onFullDebate,
}: {
  view: PeaksView;
  clip: EditorClip | null;
  index: number;
  speaker: 1 | 2 | null;
  played: { start_ms: number; end_ms: number } | null;
  words: readonly ReelWord[];
  turns: readonly DebateMediaTurnSegment[];
  durationMs: number;
  playheadMs: number | null;
  readOnly: boolean;
  onChangeClip: (index: number, span: DraggedSpan & { claim_index: number | null }) => void;
  onSeek: (ms: number) => void;
  /** Deselects the clip, back to the whole debate (GEO-3773). */
  onFullDebate?: () => void;
}) {
  const [pad, setPad] = React.useState<(typeof PADS)[number]>(2_000);
  const [snap, setSnap] = React.useState(true);
  const [drag, setDrag] = React.useState<FineDrag | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = React.useState(0);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setTrackWidth(track.clientWidth));
    observer.observe(track);
    setTrackWidth(track.clientWidth);
    return () => observer.disconnect();
  }, [clip === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // A drag ends however the pointer is let go: off the track, or with capture lost, the track's own
  // pointerup never comes, and a stuck drag would move the edge on every hover after.
  const dragging = drag !== null;
  React.useEffect(() => {
    if (!dragging) return;
    const end = () => setDrag(null);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging]);

  const frame = clip ? (drag?.window ?? fineWindow(clip, durationMs, pad)) : null;
  const cuts = React.useMemo(() => cutStretches(turns, durationMs), [turns, durationMs]);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider p-3">
      <Text as="h2" variant="smallTitle">
        {clip ? `Fine-tune clip ${index + 1}` : 'Fine-tune'}
      </Text>
      <div className="flex items-center gap-3">
        {clip && onFullDebate ? <SmallButton onClick={onFullDebate}>Full debate</SmallButton> : null}
        <label className="flex cursor-pointer items-center gap-1.5 text-[14px] text-text">
          <input type="checkbox" className="sr-only" checked={snap} onChange={event => setSnap(event.target.checked)} />
          <CheckboxVisual checked={snap} variant="filled" />
          Snap to words
        </label>
        <Text as="span" variant="metadata" color="grey-04">
          Alt flips it for one drag.
        </Text>
        <div className="flex gap-1" role="group" aria-label="Around the clip">
          {PADS.map(level => (
            <SquareButton
              key={level}
              isActive={pad === level}
              aria-pressed={pad === level}
              className="!w-auto px-1.5 text-[14px]"
              onClick={() => setPad(level)}
            >
              ±{level / 1000} s
            </SquareButton>
          ))}
        </div>
      </div>
    </div>
  );

  if (!clip || !frame) {
    return (
      <section className="rounded border border-grey-02 bg-white">
        {header}
        <Text as="p" variant="metadata" color="grey-04" className="p-3">
          Select a clip to fine-tune it against the waveform.
        </Text>
      </section>
    );
  }

  const span = frame.end_ms - frame.start_ms;
  const left = (ms: number) =>
    `${((Math.max(frame.start_ms, Math.min(frame.end_ms, ms)) - frame.start_ms) / span) * 100}%`;
  const width = (from: number, to: number) =>
    `${((Math.min(frame.end_ms, to) - Math.max(frame.start_ms, from)) / span) * 100}%`;
  const visible = (from: number, to: number) => to > frame.start_ms && from < frame.end_ms;
  const shownWords = words.filter(word => isSpoken(word) && visible(word.start_ms, word.end_ms));
  // Unmeasured (as in tests), every label is drawn; measured, only those that fit their word.
  const labelFits = (word: ReelWord) =>
    trackWidth === 0 ||
    ((word.end_ms - word.start_ms) / span) * trackWidth >= word.text.trim().length * LABEL_PX_PER_CHAR;
  const playedDiffers = played !== null && (played.start_ms !== clip.start_ms || played.end_ms !== clip.end_ms);

  const startDrag = (event: React.PointerEvent, mode: FineDrag['mode']) => {
    if (readOnly || !trackRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    setDrag({
      mode,
      x0: event.clientX,
      start: clip.start_ms,
      end: clip.end_ms,
      pxPerMs: trackRef.current.getBoundingClientRect().width / span,
      claim_index: clip.claim_index,
      window: frame,
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || drag.pxPerMs <= 0) return;
    // Snapping is on unless the toggle is off; Alt flips it for this drag.
    const free = snap === event.altKey;
    onChangeClip(index, {
      ...draggedClip(drag, (event.clientX - drag.x0) / drag.pxPerMs, words, durationMs, free, FINE_STEP_MS),
      claim_index: drag.claim_index,
    });
  };

  return (
    <section className="rounded border border-grey-02 bg-white" aria-label="Fine-tune">
      {header}
      <div className="flex flex-col gap-2 p-3">
        {view.kind !== 'ready' && view.kind !== 'loading' ? (
          <Text as="p" variant="metadata" color="grey-04">
            {view.message}
          </Text>
        ) : null}
        <div
          ref={trackRef}
          data-testid="waveform-track"
          className="relative h-[132px] touch-none overflow-hidden rounded border border-divider bg-bg select-none"
          onPointerMove={onPointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
          onPointerDown={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width > 0) onSeek(Math.round(frame.start_ms + ((event.clientX - rect.left) / rect.width) * span));
          }}
        >
          {cuts
            .filter(cut => visible(cut.start_ms, cut.end_ms))
            .map(cut => (
              <div
                key={`cut-${cut.start_ms}`}
                data-testid="waveform-cut"
                className="pointer-events-none absolute top-0 bottom-0 overflow-hidden bg-[repeating-linear-gradient(135deg,var(--color-grey-02)_0_2px,transparent_2px_7px)]"
                style={{ left: left(cut.start_ms), width: width(cut.start_ms, cut.end_ms) }}
              >
                {/* Above the waveform, so it reads over the bars. */}
                <span className="absolute bottom-1 left-1 z-10 rounded-sm bg-white/90 px-1 text-[11px] leading-[14px] whitespace-nowrap text-grey-04">
                  Cut in video
                </span>
              </div>
            ))}
          {played && visible(played.start_ms, played.end_ms) ? (
            <div
              data-testid="waveform-played"
              title="What geo-chat will cut: an edge snapped to a word widens into the quiet beside it."
              className={cx('absolute top-[18px] bottom-0', speaker ? SPEAKER_TINT_CLASS[speaker] : 'bg-grey-02/60')}
              style={{ left: left(played.start_ms), width: width(played.start_ms, played.end_ms) }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 top-[18px] bottom-0">
            {view.kind === 'loading' ? (
              <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 animate-pulse rounded bg-grey-01" />
            ) : null}
            <WaveformCanvas
              peaks={view.kind === 'ready' ? view.peaks : null}
              startMs={frame.start_ms}
              endMs={frame.end_ms}
              className="h-full w-full text-grey-04"
            />
          </div>
          {shownWords.map(word => (
            <React.Fragment key={`${word.slot}-${word.start_ms}-${word.end_ms}`}>
              <i
                aria-hidden
                className="pointer-events-none absolute top-[18px] bottom-0 w-px bg-grey-03/70"
                style={{ left: left(word.start_ms) }}
              />
              <i
                aria-hidden
                className="pointer-events-none absolute top-[18px] bottom-0 w-px bg-grey-03/40"
                style={{ left: left(word.end_ms) }}
              />
              {labelFits(word) ? (
                <span
                  data-testid="waveform-word"
                  className={cx(
                    'pointer-events-none absolute top-0.5 overflow-hidden pl-0.5 text-[11px] leading-[14px] whitespace-nowrap',
                    SPEAKER_TEXT_CLASS[word.slot === 2 ? 2 : 1]
                  )}
                  style={{ left: left(word.start_ms), width: width(word.start_ms, word.end_ms) }}
                >
                  {word.text.trim()}
                </span>
              ) : null}
            </React.Fragment>
          ))}
          <div
            aria-hidden
            data-testid="waveform-clip"
            className={cx(
              'pointer-events-none absolute top-[18px] bottom-0 border-x-2',
              speaker ? SPEAKER_OUTLINE_CLASS[speaker] : 'border-grey-04'
            )}
            style={{ left: left(clip.start_ms), width: width(clip.start_ms, clip.end_ms) }}
          />
          {!readOnly
            ? (['start', 'end'] as const).map(edge => {
                const at = edge === 'start' ? clip.start_ms : clip.end_ms;
                // The handle being dragged stays, pinned at the window's edge (`left` clamps): it holds
                // the pointer capture, which unmounting it would drop mid-drag.
                if (drag?.mode !== edge && (at < frame.start_ms || at > frame.end_ms)) return null;
                return (
                  <span
                    key={edge}
                    aria-hidden
                    data-testid={`fine-${edge}-handle`}
                    onPointerDown={event => startDrag(event, edge)}
                    onLostPointerCapture={() => setDrag(null)}
                    className="absolute top-[18px] bottom-0 w-3 -translate-x-1/2 cursor-ew-resize after:absolute after:top-1/2 after:left-[5px] after:h-8 after:w-0.5 after:-translate-y-1/2 after:rounded-sm after:bg-text"
                    style={{ left: left(at) }}
                  />
                );
              })
            : null}
          {playheadMs !== null && visible(playheadMs, playheadMs + 1) ? (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-red-01"
              style={{ left: left(playheadMs) }}
            />
          ) : null}
        </div>
        <p data-testid="waveform-readout" className="text-metadata text-grey-04 tabular-nums">
          Start {formatFineTime(clip.start_ms)} · End {formatFineTime(clip.end_ms)}
          {played && playedDiffers
            ? ` · Plays ${formatFineTime(played.start_ms)} – ${formatFineTime(played.end_ms)}`
            : null}
          {playheadMs !== null ? ` · Playhead ${formatFineTime(playheadMs)}` : null}
        </p>
      </div>
    </section>
  );
}
