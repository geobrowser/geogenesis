'use client';

import * as React from 'react';

import cx from 'classnames';

import { normId } from '~/core/utils/norm-id';

import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';
import { type HubFilterOption, HubMultiFilterMenu } from './hub-filter-menu';
import { HubPillButton } from './hub-pill-button';
import { formatFacetCount } from './topic-facets';

/** How many lines of pills the row may take before the rest go behind "…". */
export const TOPIC_PILL_LINES = 2;

/**
 * The most topics measured for the row. Two lines at the picker's width hold well under this, so
 * measuring the whole facet — which grows with the corpus — would be work spent on pills that can
 * never be drawn. Picked topics are measured past it, since they are always drawn.
 */
const MEASURED_TOPIC_LIMIT = 40;

/** The row's `gap-2`, which the line-fitting below has to agree with. */
const PILL_GAP_PX = 8;

type Topic = { id: string; name: string | null; count: number };

type Props = {
  analyticsSurface: DebateAnalyticsSurface;
  /**
   * The topics to offer, in the order they should be drawn: picked first, then by count — the topic
   * menu's own order (`orderFacetOptions`), so the row refills on each press the way the menu does.
   */
  topics: Topic[];
  topicIds: string[];
  onTopicToggle: (topicId: string) => void;
  onTopicsClear: () => void;
  /** The counts in hand answer a filter that has since changed. */
  countsPending?: boolean;
  className?: string;
};

/**
 * How many of `widths` fit on `lines` lines of `available` pixels, after a leading item and with a
 * trailing one reserved whenever anything is left over.
 *
 * Mirrors flex-wrap: an item that does not fit on the current line starts the next, and an item
 * wider than a whole line still takes a line of its own. `forced` items are always kept, so the
 * answer is never smaller than that.
 */
export function fitPills({
  leading,
  widths,
  trailing,
  available,
  lines,
  gap = PILL_GAP_PX,
  forced = 0,
}: {
  leading: number;
  widths: number[];
  trailing: number;
  available: number;
  lines: number;
  gap?: number;
  forced?: number;
}): number {
  const linesUsed = (items: number[]) => {
    let used = 1;
    let x = 0;
    for (const width of items) {
      if (x > 0 && x + gap + width > available) {
        used += 1;
        x = width;
      } else {
        x += (x > 0 ? gap : 0) + width;
      }
    }
    return used;
  };

  for (let count = widths.length; count > forced; count--) {
    const items = [leading, ...widths.slice(0, count)];
    if (count < widths.length) items.push(trailing);
    if (linesUsed(items) <= lines) return count;
  }
  return Math.min(forced, widths.length);
}

/**
 * The topic filter as pills, for a desktop's width: two lines of them, and "…" for the rest.
 *
 * The space row's sibling (`SpaceFilterPills`), with the topic menu's rules rather than the space
 * menu's. Topics are AND and counted as co-occurrence, so the row is the menu's top: picked topics
 * first in the order they were picked, then whatever the remaining claims carry, by count. Each
 * press re-runs that, so the row refills with what can still narrow the list — and a pill that is
 * pressed moves to the front with the other picks, as a row in the menu does.
 *
 * The facet grows with the corpus, so the row cannot hold all of it. It holds what fits on two lines
 * at the width it has, measured, and the full menu opens from the "…" at its end. Picked topics are
 * always drawn, however many there are: every filter in force stays on screen to be undone.
 */
export function TopicFilterPills({
  analyticsSurface,
  topics,
  topicIds,
  onTopicToggle,
  onTopicsClear,
  countsPending = false,
  className,
}: Props) {
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLDivElement | null>(null);

  const picked = React.useMemo(() => new Set(topicIds.map(normId)), [topicIds]);
  const isPicked = (topicId: string) => picked.has(normId(topicId));
  const pickedCount = topics.filter(topic => isPicked(topic.id)).length;

  const candidates = React.useMemo(
    () => topics.filter((topic, index) => index < MEASURED_TOPIC_LIMIT || picked.has(normId(topic.id))),
    [picked, topics]
  );

  // Everything until measured. A layout effect answers before the first paint, so this is only ever
  // seen where nothing can be measured at all — and there every pill is the honest answer.
  const [fitted, setFitted] = React.useState(candidates.length);
  // Picked topics are drawn whatever the measurement says.
  const shownCount = Math.max(Math.min(fitted, candidates.length), pickedCount);
  const shown = candidates.slice(0, shownCount);
  const hiddenCount = topics.length - shown.length;

  // Re-measured when anything a pill's width depends on changes: which topics, their names, their
  // counts, and which are picked (a picked pill is the same width, but it is forced).
  const measureKey = candidates.map(topic => `${topic.id}:${topic.name ?? ''}:${topic.count}`).join('|');

  React.useLayoutEffect(() => {
    const row = rowRef.current;
    const measurer = measureRef.current;
    if (!row || !measurer) return;

    const measure = () => {
      const children = Array.from(measurer.children) as HTMLElement[];
      const widthOf = (element: HTMLElement | undefined) => element?.getBoundingClientRect().width ?? 0;
      const [leading, ...rest] = children;
      const trailing = rest.pop();
      setFitted(
        fitPills({
          leading: widthOf(leading),
          widths: rest.map(widthOf),
          trailing: widthOf(trailing),
          available: row.clientWidth,
          lines: TOPIC_PILL_LINES,
          forced: pickedCount,
        })
      );
    };

    measure();
    // Guarded as the repo's other measurement sites are: a runtime without ResizeObserver keeps the
    // answer above for the width it had, rather than throwing inside a layout effect.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(row);
    return () => observer?.disconnect();
  }, [measureKey, pickedCount]);

  const menuOptions = React.useMemo<HubFilterOption<string>[]>(
    () => topics.map(topic => ({ value: topic.id, label: topic.name ?? 'Topic', count: topic.count })),
    [topics]
  );

  const allPill = (props: React.ComponentProps<typeof HubPillButton> = {}) => (
    <HubPillButton
      variant={topicIds.length === 0 ? 'primary' : 'secondary'}
      aria-pressed={topicIds.length === 0}
      onClick={() => {
        if (topicIds.length > 0) onTopicsClear();
      }}
      {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'All topics pill', 'filter')}
      {...props}
    >
      All topics
    </HubPillButton>
  );

  const pill = (topic: Topic, props: React.ComponentProps<typeof HubPillButton> = {}) => {
    const on = isPicked(topic.id);
    return (
      <HubPillButton
        key={topic.id}
        variant={on ? 'primary' : 'secondary'}
        aria-pressed={on}
        onClick={() => onTopicToggle(topic.id)}
        className="gap-1.5"
        {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'Topic pill', 'filter')}
        {...props}
      >
        <span className="max-w-[200px] truncate">{topic.name ?? 'Topic'}</span>
        <span
          className={cx(
            'tabular-nums transition-opacity',
            on ? 'text-white/70' : 'text-grey-04',
            countsPending && 'opacity-50'
          )}
        >
          {formatFacetCount(topic.count)}
        </span>
      </HubPillButton>
    );
  };

  const moreTrigger = (
    <HubPillButton
      aria-label={`All topics (${topics.length})`}
      className="w-9 px-0 tracking-widest text-grey-04"
      {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'More topics', 'filter')}
    >
      ···
    </HubPillButton>
  );

  return (
    <div ref={rowRef} className={cx('relative', className)}>
      <div role="group" aria-label="Filter by topic" className="flex flex-wrap items-center gap-2">
        {allPill()}
        {shown.map(topic => pill(topic))}
        {hiddenCount > 0 ? (
          <HubMultiFilterMenu
            align="start"
            label="All topics"
            trigger={moreTrigger}
            analytics={{ name: 'More topics', surface: analyticsSurface }}
            options={menuOptions}
            values={topicIds}
            onToggle={onTopicToggle}
            onClear={onTopicsClear}
            clearLabel="Any topic"
            countsPending={countsPending}
          />
        ) : null}
      </div>
      {/* Every candidate at its natural width, out of sight, so the row can be fitted to two lines
          before it paints. Inert and hidden from assistive tech: it is a ruler, not a control. */}
      <div
        ref={measureRef}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute top-0 left-0 flex h-0 items-center gap-2 overflow-hidden whitespace-nowrap"
      >
        {allPill({ tabIndex: -1 })}
        {candidates.map(topic => pill(topic, { tabIndex: -1 }))}
        <HubPillButton tabIndex={-1} className="w-9 px-0">
          ···
        </HubPillButton>
      </div>
    </div>
  );
}
