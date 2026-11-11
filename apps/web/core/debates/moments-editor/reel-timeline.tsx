'use client';

import * as React from 'react';

import cx from 'classnames';

import { SquareButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { formatTimecode } from '../claim-timing';
import { SPEAKER_BORDER_CLASS } from './clip-row';
import { type EditorClip, MIN_EDIT_CLIP_MS, type ReelWord, snapEdge } from './reel';

/** Where a free (Alt) drag lands: the nearest tenth of a second. */
const FREE_STEP_MS = 100;
const ZOOMS = [1, 2, 4] as const;

type Drag = {
  index: number;
  mode: 'start' | 'end' | 'move';
  x0: number;
  start: number;
  end: number;
  pxPerMs: number;
  /**
   * The clip's claim when the drag began, sent with every move: the editor drops a claim while the
   * clip is another debater's, and this gives it back when the drag returns to its speaker.
   */
  claim_index: number | null;
};

/**
 * Where a dragged edge lands: off the middle of any word, outward, so the clip takes whole words
 * (`snapEdge`); with Alt held, wherever it was let go, to the tenth.
 */
export function dragEdge(ms: number, words: readonly ReelWord[], edge: 'start' | 'end', free: boolean) {
  return free ? Math.round(ms / FREE_STEP_MS) * FREE_STEP_MS : snapEdge(ms, words, edge);
}

/**
 * A clip moved or trimmed by a drag of `deltaMs`, kept inside the debate and at least a second long.
 * Moving keeps the clip's length, then snaps both edges out to whole words (with Alt, neither): an
 * end left mid-word would play that word without its caption.
 */
export function draggedClip(
  drag: Pick<Drag, 'mode' | 'start' | 'end'>,
  deltaMs: number,
  words: readonly ReelWord[],
  durationMs: number,
  free: boolean
): { start_ms: number; end_ms: number } {
  if (drag.mode === 'start') {
    const start = Math.max(0, dragEdge(drag.start + deltaMs, words, 'start', free));
    return { start_ms: Math.min(start, drag.end - MIN_EDIT_CLIP_MS), end_ms: drag.end };
  }
  if (drag.mode === 'end') {
    const end = Math.min(durationMs, dragEdge(drag.end + deltaMs, words, 'end', free));
    return { start_ms: drag.start, end_ms: Math.max(end, drag.start + MIN_EDIT_CLIP_MS) };
  }
  const length = drag.end - drag.start;
  const start = Math.max(0, Math.min(durationMs - length, dragEdge(drag.start + deltaMs, words, 'start', free)));
  const end = free ? start + length : Math.min(durationMs, snapEdge(start + length, words, 'end'));
  return { start_ms: start, end_ms: Math.max(end, start + MIN_EDIT_CLIP_MS) };
}

/**
 * The reel on the debate's timeline (GEO-3672): each clip a block, coloured by its speaker, that can
 * be moved or trimmed by its edges; the published clips as outlines behind any that moved; the
 * playhead. A click on the track seeks the player there.
 */
export function ReelTimeline({
  clips,
  saved,
  speakers,
  words,
  durationMs,
  playheadMs,
  selected,
  readOnly,
  onSelect,
  onChangeClip,
  onSeek,
}: {
  clips: readonly EditorClip[];
  saved: readonly EditorClip[];
  speakers: readonly (1 | 2 | null)[];
  words: readonly ReelWord[];
  durationMs: number;
  playheadMs: number | null;
  selected: number;
  readOnly: boolean;
  onSelect: (index: number) => void;
  onChangeClip: (index: number, span: { start_ms: number; end_ms: number; claim_index: number | null }) => void;
  onSeek: (ms: number) => void;
}) {
  const [zoom, setZoom] = React.useState<(typeof ZOOMS)[number]>(1);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const percent = (ms: number) => `${(Math.max(0, Math.min(durationMs, ms)) / durationMs) * 100}%`;
  const step = zoom >= 4 ? 10_000 : zoom >= 2 ? 20_000 : 30_000;
  const ticks = Array.from({ length: Math.floor(durationMs / step) + 1 }, (_, i) => i * step);
  const moved = new Set(clips.map(clip => `${clip.start_ms}-${clip.end_ms}`));

  const startDrag = (event: React.PointerEvent, index: number, mode: Drag['mode']) => {
    onSelect(index);
    if (readOnly || !trackRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    const width = trackRef.current.getBoundingClientRect().width;
    setDrag({
      index,
      mode,
      x0: event.clientX,
      start: clips[index].start_ms,
      end: clips[index].end_ms,
      pxPerMs: width / durationMs,
      claim_index: clips[index].claim_index,
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || drag.pxPerMs <= 0) return;
    onChangeClip(drag.index, {
      ...draggedClip(drag, (event.clientX - drag.x0) / drag.pxPerMs, words, durationMs, event.altKey),
      claim_index: drag.claim_index,
    });
  };

  return (
    <section className="rounded border border-grey-02 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider p-3">
        <Text as="h2" variant="smallTitle">
          Timeline
        </Text>
        <div className="flex items-center gap-3">
          <Text as="span" variant="metadata" color="grey-04">
            Drag a clip or its edges; they snap to whole words. Hold Alt to place freely.
          </Text>
          <div className="flex gap-1" role="group" aria-label="Zoom">
            {ZOOMS.map(level => (
              <SquareButton
                key={level}
                isActive={zoom === level}
                aria-pressed={zoom === level}
                className="!w-auto px-1.5 text-[14px]"
                onClick={() => setZoom(level)}
              >
                {level === 1 ? 'Fit' : `${level}×`}
              </SquareButton>
            ))}
          </div>
        </div>
      </div>
      <div className="p-3">
        <div className="overflow-x-auto rounded border border-divider bg-bg">
          <div
            ref={trackRef}
            data-testid="reel-track"
            className="relative h-[84px] touch-none select-none"
            style={{ width: `${zoom * 100}%` }}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            onPointerDown={event => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width > 0) onSeek(Math.round(((event.clientX - rect.left) / rect.width) * durationMs));
            }}
          >
            <div className="absolute inset-x-0 top-0 h-5 border-b border-divider">
              {ticks.map(at => (
                <React.Fragment key={at}>
                  <i className="absolute bottom-0 h-[5px] w-px bg-grey-03" style={{ left: percent(at) }} />
                  <span
                    className="absolute top-1 -translate-x-1/2 font-mono text-[11px] leading-[13px] text-grey-04 first:translate-x-0"
                    style={{ left: percent(at) }}
                  >
                    {formatTimecode(at)}
                  </span>
                </React.Fragment>
              ))}
            </div>
            {saved
              .filter(clip => !moved.has(`${clip.start_ms}-${clip.end_ms}`))
              .map(clip => (
                <div
                  key={`saved-${clip.key}`}
                  aria-hidden
                  className="pointer-events-none absolute top-6 bottom-1 border-x border-dashed border-grey-03"
                  style={{ left: percent(clip.start_ms), width: percent(clip.end_ms - clip.start_ms) }}
                />
              ))}
            {clips.map((clip, index) => {
              const speaker = speakers[index] ?? null;
              return (
                <div
                  key={clip.key}
                  role="button"
                  tabIndex={0}
                  aria-label={`Clip ${index + 1}`}
                  aria-pressed={index === selected}
                  onPointerDown={event => startDrag(event, index, 'move')}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') onSelect(index);
                  }}
                  className={cx(
                    'absolute top-[38px] flex h-[34px] min-w-[6px] items-center justify-center rounded border-2 text-[14px] font-semibold',
                    readOnly ? 'cursor-pointer' : 'cursor-grab',
                    speaker ? SPEAKER_BORDER_CLASS[speaker] : 'border-grey-03 bg-grey-01 text-grey-04',
                    index === selected && 'shadow-[inset_0_0_0_1px_#fff,0_0_0_2px_#202020]'
                  )}
                  style={{ left: percent(clip.start_ms), width: percent(clip.end_ms - clip.start_ms) }}
                >
                  {!readOnly ? (
                    <span
                      aria-hidden
                      data-testid={`clip-${index}-start-handle`}
                      onPointerDown={event => startDrag(event, index, 'start')}
                      className="absolute -top-0.5 -bottom-0.5 -left-1.5 w-2.5 cursor-ew-resize after:absolute after:top-2 after:bottom-2 after:left-1 after:w-0.5 after:rounded-sm after:bg-current"
                    />
                  ) : null}
                  {index + 1}
                  {!readOnly ? (
                    <span
                      aria-hidden
                      data-testid={`clip-${index}-end-handle`}
                      onPointerDown={event => startDrag(event, index, 'end')}
                      className="absolute -top-0.5 -right-1.5 -bottom-0.5 w-2.5 cursor-ew-resize after:absolute after:top-2 after:bottom-2 after:left-1 after:w-0.5 after:rounded-sm after:bg-current"
                    />
                  ) : null}
                </div>
              );
            })}
            {playheadMs !== null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-red-01"
                style={{ left: percent(playheadMs) }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
