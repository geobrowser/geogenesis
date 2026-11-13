'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ParticipantSlot } from '~/core/debates/api';
import { SegmentedControl } from '~/core/debates/matchmaking/debate-calendar-controls';
import { formatPlaybackTime } from '~/core/debates/moments-player/debate-moments';
import type { BlockSpeaker, WatchBlock, WatchLine } from '~/core/debates/moments-player/watch-transcript';

import { Avatar } from '~/design-system/avatar';
import { ChevronRight } from '~/design-system/icons/chevron-right';

import { BEST_DEBATES_WATCH_SPEEDS, type BestDebatesWatchSpeed } from '~/atoms';

export type WatchTranscriptView = 'moments' | 'full';

export type WatchTranscriptContent =
  | { status: 'loading' }
  /** No transcript to show: none served, a 404, or a reel whose clips carry no captions. */
  | { status: 'unavailable' }
  /** The read failed for a reason a second try could fix. */
  | { status: 'error'; onRetry: () => void }
  | { status: 'ready'; blocks: readonly WatchBlock[] };

/** How long after the ranker scrolls the transcript it stops following the video (Preston, 13 Nov). */
export const READING_HOLD_MS = 5_000;

const VIEW_OPTIONS = [
  { value: 'moments', label: 'Moments' },
  { value: 'full', label: 'Full debate' },
] as const;

const SPEED_OPTIONS = BEST_DEBATES_WATCH_SPEEDS.map(value => ({ value, label: `${value}x` }));

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** The Moments view's place in the reel: which moment it shows, and a step to the others. */
export type WatchMomentNav = { index: number; count: number; onStep: (index: number) => void };

/**
 * The watch popup's transcript (GEO-3728, mockup approved 13 Nov): Moments | Full debate and the
 * speed on one row, then the lines by speaker. The Moments view shows the moment playing, with a
 * step to the others (Preston, 13 Nov); the Full debate view, every turn. The line being spoken is
 * highlighted and kept in view; the ones not yet spoken are grey. Pressing a line plays from it.
 */
export function WatchTranscriptPanel({
  view,
  momentsOffered,
  onViewChange,
  speed,
  onSpeedChange,
  content,
  highlightKey,
  showTurnTimes,
  speakerOf,
  momentNav,
  onLine,
}: {
  view: WatchTranscriptView;
  /** Whether the debate has a reel to show the Moments transcript of. */
  momentsOffered: boolean;
  onViewChange: (view: WatchTranscriptView) => void;
  speed: BestDebatesWatchSpeed;
  onSpeedChange: (speed: BestDebatesWatchSpeed) => void;
  content: WatchTranscriptContent;
  highlightKey: string | null;
  /** The full debate's turns show where they start in it. */
  showTurnTimes: boolean;
  speakerOf: (slot: ParticipantSlot | null) => BlockSpeaker | null;
  /** Set in the Moments view: `content` then holds the one moment shown. */
  momentNav?: WatchMomentNav;
  onLine: (block: WatchBlock, line: WatchLine) => void;
}) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  /** When the ranker last scrolled the lines themselves. */
  const readingAtRef = React.useRef(-Infinity);
  // Scrolling the lines is reading, wherever the pointer is: over the text, the target is a line.
  const markReading = () => {
    readingAtRef.current = Date.now();
  };
  // Pressing a line (a jump) or the moment step is not reading, or every jump would stop the panel
  // following the line it just started.
  const markReadingUnlessPress = (event: React.SyntheticEvent) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    markReading();
  };

  const blocks = content.status === 'ready' ? content.blocks : null;
  const order = React.useMemo(
    () => new Map((blocks ?? []).flatMap(block => block.lines).map((line, index) => [line.key, index])),
    [blocks]
  );
  const spokenUpTo = highlightKey === null ? null : (order.get(highlightKey) ?? null);

  // A new moment (the reel moving on, or a step) starts its lines from the top.
  const shownMoment = momentNav?.index ?? null;
  React.useEffect(() => {
    if (scrollerRef.current && shownMoment !== null) scrollerRef.current.scrollTop = 0;
  }, [shownMoment]);

  // Keep the spoken line in view, unless the ranker is reading elsewhere. The lines' own scroller is
  // moved, never `scrollIntoView`, which would also scroll the dialog and a phone's viewport.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || highlightKey === null) return;
    if (Date.now() - readingAtRef.current < READING_HOLD_MS) return;
    const line = scroller.querySelector<HTMLElement>(`[data-line-key="${highlightKey}"]`);
    if (!line) return;
    const top = line.offsetTop;
    const bottom = top + line.offsetHeight;
    if (top >= scroller.scrollTop && bottom <= scroller.scrollTop + scroller.clientHeight) return;
    scroller.scrollTop = Math.max(0, top - scroller.clientHeight / 3);
  }, [highlightKey, view, blocks]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-testid="watch-transcript">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <SegmentedControl
            label="Transcript"
            variant="tinted"
            options={momentsOffered ? VIEW_OPTIONS : VIEW_OPTIONS.filter(option => option.value === 'full')}
            value={view}
            onChange={onViewChange}
            optionAttributes={() => ({ 'data-geo-analytics-label': 'Best debates watch transcript view' })}
          />
        </div>
        <SegmentedControl
          label="Playback speed"
          options={SPEED_OPTIONS}
          value={speed}
          onChange={onSpeedChange}
          optionAttributes={() => ({ 'data-geo-analytics-label': 'Best debates watch speed' })}
        />
      </div>
      <div
        ref={scrollerRef}
        className="relative min-h-[72px] flex-1 overflow-y-auto overscroll-contain border-t border-divider"
        data-testid="watch-transcript-lines"
        onWheel={markReading}
        onTouchMove={markReading}
        onPointerDown={markReadingUnlessPress}
        onKeyDown={event => {
          if (!SCROLL_KEYS.has(event.key)) return;
          // Space on a line presses it; the arrow keys still scroll from there.
          if (event.key === ' ') markReadingUnlessPress(event);
          else markReading();
        }}
      >
        {content.status === 'loading' ? (
          <p className="m-0 py-4 text-metadata text-grey-04">Loading transcript…</p>
        ) : content.status === 'unavailable' || (content.status === 'ready' && content.blocks.length === 0) ? (
          <p className="m-0 py-4 text-metadata text-grey-04">Transcript isn’t available for this debate.</p>
        ) : content.status === 'error' ? (
          <p className="m-0 flex items-baseline gap-2 py-4 text-metadata text-grey-04">
            Transcript isn’t available for this debate.
            <button type="button" onClick={content.onRetry} className="text-text underline-offset-2 hover:underline">
              Retry
            </button>
          </p>
        ) : (
          content.blocks.map(block => {
            const speaker = speakerOf(block.slot);
            const nav = momentNav && block.momentIndex === momentNav.index ? momentNav : null;
            return (
              <div key={block.key} className="border-b border-divider py-2.5 last:border-b-0">
                {speaker || nav ? (
                  <div className="mb-1 flex min-h-7 items-center gap-1.5 text-metadataMedium">
                    {speaker ? (
                      <>
                        <span className="block size-5 shrink-0 overflow-hidden rounded-full">
                          <Avatar avatarUrl={speaker.avatarUrl} value={speaker.avatarSeed} size={20} />
                        </span>
                        <span className="truncate">{speaker.name}</span>
                        {speaker.side ? (
                          <span className="shrink-0 font-normal text-grey-04">{speaker.side}</span>
                        ) : null}
                      </>
                    ) : null}
                    {nav ? (
                      <MomentStepper nav={nav} />
                    ) : showTurnTimes && block.debateStartMs !== null ? (
                      <span className="ml-auto shrink-0 text-breadcrumb font-normal text-grey-04 tabular-nums">
                        {formatPlaybackTime(block.debateStartMs)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {block.lines.length === 0 ? (
                  // One moment of a reel whose others have captions: its clip came without any.
                  <p className="m-0 text-metadata text-grey-04">No transcript for this moment.</p>
                ) : null}
                <p className="m-0 text-[16px] leading-6 tracking-[-0.1px]">
                  {block.lines.map((line, i) => {
                    const index = order.get(line.key) ?? 0;
                    return (
                      <React.Fragment key={line.key}>
                        {i > 0 ? ' ' : null}
                        <button
                          type="button"
                          data-line-key={line.key}
                          data-geo-analytics-label="Best debates watch transcript line"
                          aria-current={line.key === highlightKey ? 'true' : undefined}
                          onClick={() => onLine(block, line)}
                          className={cx(
                            '-mx-px inline rounded px-0.5 py-px text-left transition-colors hover:bg-grey-01',
                            line.key === highlightKey
                              ? 'bg-ctaTertiary text-text hover:bg-ctaTertiary'
                              : spokenUpTo !== null && index > spokenUpTo
                                ? 'text-grey-04'
                                : 'text-text'
                          )}
                        >
                          {line.text}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const STEP_CLASS =
  'grid size-7 shrink-0 place-items-center rounded-full border border-grey-02 text-grey-04 transition-colors hover:border-text hover:text-text disabled:pointer-events-none disabled:opacity-50 md:size-8';

/** "Moment 2 of 4" between a step back and a step on, which play that moment from its start. */
function MomentStepper({ nav }: { nav: WatchMomentNav }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label="Previous moment"
        data-geo-analytics-label="Best debates watch transcript moment"
        disabled={nav.index <= 0}
        onClick={() => nav.onStep(nav.index - 1)}
        className={STEP_CLASS}
      >
        <span className="flex rotate-180">
          <ChevronRight />
        </span>
      </button>
      <span className="text-breadcrumb font-normal text-grey-04 tabular-nums" aria-live="polite">
        Moment {nav.index + 1} of {nav.count}
      </span>
      <button
        type="button"
        aria-label="Next moment"
        data-geo-analytics-label="Best debates watch transcript moment"
        disabled={nav.index >= nav.count - 1}
        onClick={() => nav.onStep(nav.index + 1)}
        className={STEP_CLASS}
      >
        <ChevronRight />
      </button>
    </span>
  );
}
